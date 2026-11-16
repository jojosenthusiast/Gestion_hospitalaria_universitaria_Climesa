import { BadRequestException, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor } from '../platform/actor';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { HeadCache } from '../platform/head-cache';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { DEFAULT_REMINDER_HOURS, inboxOrder, isHighlighted, NoticeLevel, personalDataIn, priorityOfLevel } from './notice.rules';
import { NoticeDto, NoticeEditDto, NoticeWithdrawDto } from './public.dto';

/** Plan 112: caché de 5 s invalidada por cualquier evento confirmado. */
export const PUBLIC_CACHE_MS = 5_000;
const iso = (value: unknown) => value == null ? null : new Date(value as string).toISOString();
type NoticeRow = { id: string; titulo: string; cuerpo: string; desde: string; hasta: string; prioridad: string; nivel: string; publico: boolean; roles: string[]; areas: string[]; creado_en: string; version: number; retirado_en: string | null; motivo_retiro: string | null };
const NOTICE_COLUMNS = 'id,titulo,cuerpo,prioridad,nivel,publico,roles,areas,lower(vigencia) AS desde,upper(vigencia) AS hasta,creado_en,version,retirado_en,motivo_retiro';
const noticeOf = (r: NoticeRow) => ({ id: r.id, titulo: r.titulo, cuerpo: r.cuerpo, desde: iso(r.desde), hasta: iso(r.hasta), prioridad: r.prioridad, nivel: r.nivel, publico: r.publico, roles: r.roles, areas: r.areas });
/** Estado del aviso para quien lo redacta; solo uno vigente o programado admite editar o retirar (MA-AVI-02). */
const noticeState = (r: NoticeRow, at: Date) => r.retirado_en ? 'retirado' : new Date(r.hasta) <= at ? 'vencido' : new Date(r.desde) > at ? 'programado' : 'vigente';
const listItemOf = (r: NoticeRow, at: Date) => {
  const estado = noticeState(r, at);
  return { ...noticeOf(r), estado, publicadoEn: iso(r.creado_en), version: r.version, allowedActions: estado === 'vigente' || estado === 'programado' ? ['editar', 'retirar'] : [], retiradoEn: iso(r.retirado_en), motivoRetiro: r.motivo_retiro ?? null };
};
/** Canales de un aviso: `publico` si es público y `rol:<código>` por cada rol dirigido (la base amplía el resto). */
const noticeChannels = (isPublic: boolean, roles: string[]) => [...(isPublic ? ['publico'] : []), ...roles.map(r => `rol:${r}`)];
/**
 * S11: no hay canal por área, así que un aviso por área avisa en vivo a `usuario:<id>` de cada cuenta activa cuya ficha
 * o turno en curso está en una de esas áreas (la misma regla que decide quién lo recibe).
 */
async function areaChannels(c: PoolClient, areas: string[], at: Date) {
  if (!areas.length) return [];
  const rows = (await c.query<{ id: string }>(
    `SELECT DISTINCT u.id FROM acceso.usuario u JOIN infra.espacio e ON e.codigo = ANY($1::text[])
     WHERE u.estado='activo' AND u.persona_personal_id IS NOT NULL AND (
       EXISTS (SELECT 1 FROM personal.persona p WHERE p.id=u.persona_personal_id AND p.area_id=e.id)
       OR EXISTS (SELECT 1 FROM personal.turno t WHERE t.persona_id=u.persona_personal_id AND t.area_id=e.id AND t.estado IN ('publicado','en_curso') AND t.periodo @> $2::timestamptz))`, [areas, at])).rows;
  return rows.map(r => `usuario:${r.id}`);
}
type Query = <T>(sql: string, params?: unknown[]) => Promise<T[]>;
const viaClient = (c: PoolClient): Query => async <T>(sql: string, params: unknown[] = []) => (await c.query(sql, params)).rows as T[];
/** Aviso visible para una cuenta: vigente, sin retirar y público o dirigido a uno de sus roles o de sus áreas. */
const AUDIENCE = '(publico OR roles && $2::text[] OR areas && $3::text[])';
const earliest = (values: unknown[]) => values.filter(v => v != null).map(v => new Date(v as string).valueOf()).filter(Number.isFinite).sort((a, b) => a - b)[0];

/**
 * Información pública del hospital (spec 112). Cada respuesta es una lista blanca de campos agregados o
 * públicos (privacidad.md, columna "Público"): nunca ids de camas, pacientes ni personal.
 * `proximoCambio` es el siguiente instante en que la respuesta cambia solo por el paso del tiempo
 * (vence un aviso o un turno); el cliente vuelve a pedir una vez en ese instante, sin sondeo.
 */
@Injectable()
export class PublicService {
  private readonly cache: HeadCache;
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {
    this.cache = new HeadCache(db, clock, PUBLIC_CACHE_MS);
  }

  /** FR-112-01: camas libres de total por planta y tipo de habitación. */
  occupancy() {
    return this.cache.get('ocupacion', async () => {
      const rows = await this.db.query<{ planta: number | null; categoria: string; camas: number; libres: number; ocupadas: number }>(
        'SELECT planta,categoria,camas::int AS camas,libres::int AS libres,ocupadas::int AS ocupadas FROM publico.v_ocupacion ORDER BY planta NULLS LAST,categoria');
      return { actualizadoEn: this.clock.now().toISOString(), ocupacion: rows.map(r => ({ planta: r.planta, categoria: r.categoria, camas: r.camas, libres: r.libres, ocupadas: r.ocupadas })) };
    });
  }

  /** Ubicación del hospital: política vigente `hospital.ubicacion`, lista blanca de campos públicos. */
  hospital() {
    return this.cache.get('hospital', async () => {
      const row = (await this.db.query<{ valor: Record<string, unknown> }>('SELECT valor FROM plataforma.politica WHERE clave=$1 AND vigencia @> $2::timestamptz', ['hospital.ubicacion', this.clock.now()]))[0];
      if (!row) throw new ProblemException('politica_no_vigente', 409, 'Falta la política vigente hospital.ubicacion.');
      const v = row.valor;
      return { nombre: String(v.nombre), direccion: String(v.direccion), municipio: String(v.municipio), departamento: String(v.departamento), telefono: String(v.telefono), latitud: Number(v.latitud), longitud: Number(v.longitud) };
    });
  }

  /** FR-112-02, RN-17: médicos con turno en curso, solo nombre, especialidad y área. */
  doctorsOnDuty() {
    return this.cache.get('medicos', async () => {
      const at = this.clock.now();
      const rows = await this.db.query<{ nombre: string; especialidad: string; area: string | null; hasta: string; en_curso: boolean; desde: string }>(
        `SELECT nombre,especialidad,area,lower(periodo) AS desde,upper(periodo) AS hasta,periodo @> $1::timestamptz AS en_curso
         FROM publico.v_turnos_medicos WHERE upper(periodo) > $1::timestamptz AND lower(periodo) < $1::timestamptz + interval '1 day'
         ORDER BY area NULLS LAST,nombre`, [at]);
      const current = rows.filter(r => r.en_curso);
      return {
        actualizadoEn: at.toISOString(),
        medicos: current.map(r => ({ nombre: r.nombre, especialidad: r.especialidad, area: r.area, hasta: iso(r.hasta) })),
        proximoCambio: iso(earliest([...current.map(r => r.hasta), ...rows.filter(r => !r.en_curso).map(r => r.desde)]) ?? null),
      };
    });
  }

  /** FR-112-03: avisos vigentes. */
  notices() {
    return this.cache.get('avisos', async () => {
      const at = this.clock.now();
      const rows = await this.db.query<{ id: string; titulo: string; cuerpo: string; desde: string; hasta: string; prioridad: string }>(
        `SELECT id,titulo,cuerpo,prioridad,lower(vigencia) AS desde,upper(vigencia) AS hasta FROM publico.aviso WHERE publico AND retirado_en IS NULL AND vigencia @> $1::timestamptz
         ORDER BY CASE prioridad WHEN 'critico' THEN 0 WHEN 'urgente' THEN 1 ELSE 2 END,lower(vigencia) DESC,creado_en DESC LIMIT 50`, [at]);
      const next = (await this.db.query<{ desde: string }>('SELECT min(lower(vigencia)) AS desde FROM publico.aviso WHERE publico AND retirado_en IS NULL AND lower(vigencia) > $1::timestamptz', [at]))[0]?.desde;
      return {
        actualizadoEn: at.toISOString(),
        avisos: rows.map(r => ({ id: r.id, titulo: r.titulo, cuerpo: r.cuerpo, desde: iso(r.desde), hasta: iso(r.hasta), prioridad: r.prioridad })),
        proximoCambio: iso(earliest([...rows.map(r => r.hasta), next]) ?? null),
      };
    });
  }

  /** Avisos vigentes que ve esta cuenta en su tablero: los públicos y los dirigidos a alguno de sus roles. */
  async myNotices(actor: Actor) {
    const at = this.clock.now();
    const areas = await this.areasOf(actor, at, this.db.query.bind(this.db) as Query);
    const where = `retirado_en IS NULL AND vigencia @> $1::timestamptz AND ${AUDIENCE}`;
    const rows = await this.db.query<NoticeRow>(
      `SELECT ${NOTICE_COLUMNS} FROM publico.aviso WHERE ${where}
       ORDER BY CASE prioridad WHEN 'critico' THEN 0 WHEN 'urgente' THEN 1 ELSE 2 END,lower(vigencia) DESC,creado_en DESC LIMIT 50`, [at, actor.roles, areas]);
    const next = (await this.db.query<{ desde: string }>(`SELECT min(lower(vigencia)) AS desde FROM publico.aviso WHERE retirado_en IS NULL AND ${AUDIENCE} AND lower(vigencia) > $1::timestamptz`, [at, actor.roles, areas]))[0]?.desde;
    return { actualizadoEn: at.toISOString(), avisos: rows.map(noticeOf), proximoCambio: iso(earliest([...rows.map(r => r.hasta), next]) ?? null) };
  }

  /**
   * Áreas de la cuenta (S11): el área de su ficha de personal y la de su turno en curso, como códigos de espacio.
   * `query` es la transacción del comando cuando corre dentro de uno (PGlite tiene una sola conexión).
   */
  private async areasOf(actor: Actor, at: Date, query: Query) {
    if (!actor.staffId) return [];
    const rows = await query<{ codigo: string }>(
      `SELECT DISTINCT e.codigo FROM infra.espacio e WHERE e.id IN (
         SELECT area_id FROM personal.persona WHERE id=$1 AND area_id IS NOT NULL
         UNION SELECT area_id FROM personal.turno WHERE persona_id=$1 AND estado IN ('publicado','en_curso') AND periodo @> $2::timestamptz)
       ORDER BY e.codigo`, [actor.staffId, at]);
    return rows.map(r => r.codigo);
  }

  /** Horas de la política vigente `avisos.recordatorio_horas` (4 por omisión; el dueño la cambia en plataforma.politica). */
  private async reminderHours(at: Date, query: Query) {
    const value = (await query<{ v: { horas?: unknown } | null }>('SELECT plataforma.politica_vigente($1,$2::timestamptz) AS v', ['avisos.recordatorio_horas', at]))[0]?.v;
    const hours = Number(value?.horas);
    return Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_REMINDER_HOURS;
  }

  /**
   * S11 · Bandeja de avisos de la cuenta: los mismos que `/me/avisos` (hasta 100) con su nivel, si la cuenta dio
   * "Enterado", hasta cuándo pospuso el recordatorio y si se destaca en el inicio. `proximoCambio` incluye el instante
   * en que vuelve un recordatorio pospuesto: el cliente vuelve a pedir una vez en ese instante, sin sondeo.
   */
  async myInbox(actor: Actor) {
    const at = this.clock.now();
    const query = this.db.query.bind(this.db) as Query;
    const [areas, hours] = await Promise.all([this.areasOf(actor, at, query), this.reminderHours(at, query)]);
    const rows = await this.db.query<NoticeRow & { enterado_en: string | null; recordar_en: string | null; dirigido: boolean }>(
      `SELECT ${NOTICE_COLUMNS},e.enterado_en,e.recordar_en,(roles && $2::text[] OR areas && $3::text[]) AS dirigido
       FROM publico.aviso a LEFT JOIN publico.aviso_enterado e ON e.aviso_id=a.id AND e.usuario_id=$4
       WHERE retirado_en IS NULL AND vigencia @> $1::timestamptz AND ${AUDIENCE}
       ORDER BY lower(vigencia) DESC,creado_en DESC LIMIT 100`, [at, actor.roles, areas, actor.id]);
    const items = inboxOrder(rows.map(r => ({ row: r, nivel: r.nivel, dirigido: r.dirigido, desde: new Date(r.desde), enteradoEn: r.enterado_en ? new Date(r.enterado_en) : null, recordarEn: r.recordar_en ? new Date(r.recordar_en) : null })), at);
    const next = (await this.db.query<{ desde: string }>(`SELECT min(lower(vigencia)) AS desde FROM publico.aviso WHERE retirado_en IS NULL AND ${AUDIENCE} AND lower(vigencia) > $1::timestamptz`, [at, actor.roles, areas]))[0]?.desde;
    const reminders = items.filter(n => n.nivel === 'critico' && n.dirigido && !n.enteradoEn && n.recordarEn && n.recordarEn > at).map(n => n.recordarEn!.toISOString());
    return {
      actualizadoEn: at.toISOString(),
      avisos: items.map(n => ({ ...noticeOf(n.row), publicadoEn: iso(n.row.creado_en), dirigido: n.dirigido, enteradoEn: iso(n.row.enterado_en), recordarEn: iso(n.row.recordar_en), destacado: isHighlighted(n, at) })),
      noLeidos: items.filter(n => !n.enteradoEn).length,
      criticos: items.filter(n => n.nivel === 'critico' && n.dirigido && !n.enteradoEn).length,
      recordatorioHoras: hours,
      proximoCambio: iso(earliest([...rows.map(r => r.hasta), next, ...reminders]) ?? null),
    };
  }

  /** Aviso vigente al que la cuenta tiene acceso, bloqueado para registrar su acuse; si no le llega, no existe para ella. */
  private async noticeForMe(c: PoolClient, actor: Actor, id: string, at: Date) {
    const areas = await this.areasOf(actor, at, viaClient(c));
    const row = (await c.query<NoticeRow & { visible: boolean }>(
      `SELECT ${NOTICE_COLUMNS},${AUDIENCE} AS visible FROM publico.aviso WHERE id=$1 FOR SHARE`, [id, actor.roles, areas])).rows[0];
    if (!row || !row.visible || new Date(row.desde) > at) throw new ProblemException('no_encontrado', 404, 'El aviso no existe o no está dirigido a tu cuenta.');
    if (row.retirado_en) throw new ProblemException('aviso_retirado', 409, 'El aviso fue retirado.');
    if (new Date(row.hasta) <= at) throw new ProblemException('aviso_vencido', 409, 'El aviso ya venció.');
    return row;
  }
  private async ackRow(c: PoolClient, id: string, userId: string) {
    return (await c.query<{ enterado_en: string | null; recordar_en: string | null }>('SELECT enterado_en,recordar_en FROM publico.aviso_enterado WHERE aviso_id=$1 AND usuario_id=$2 FOR UPDATE', [id, userId])).rows[0];
  }
  private static ackOf = (id: string, r?: { enterado_en: string | null; recordar_en: string | null }) => ({ avisoId: id, enteradoEn: iso(r?.enterado_en), recordarEn: iso(r?.recordar_en) });

  /**
   * S11 · "Enterado": acuse de la cuenta, una sola vez. Repetirlo (con otra clave) responde el mismo acuse sin volver a
   * escribir ni auditar. El evento va al canal de la cuenta para que sus otras sesiones quiten el destacado.
   */
  async acknowledge(actor: Actor, id: string, key?: string) {
    const now = this.clock.now();
    return this.commands.run(actor, `sesion.perfil:aviso.enterado:${id}`, key, { id }, async c => {
      const notice = await this.noticeForMe(c, actor, id, now);
      const current = await this.ackRow(c, id, actor.id);
      if (current?.enterado_en) return PublicService.ackOf(id, current);
      const row = (await c.query<{ enterado_en: string; recordar_en: string | null }>(
        `INSERT INTO publico.aviso_enterado(aviso_id,usuario_id,enterado_en,actualizado_en) VALUES($1,$2,$3,$3)
         ON CONFLICT (aviso_id,usuario_id) DO UPDATE SET enterado_en=excluded.enterado_en,actualizado_en=excluded.actualizado_en RETURNING enterado_en,recordar_en`, [id, actor.id, now])).rows[0];
      await this.commands.audit(c, actor, { action: 'avisos.enterado', entity: 'aviso', entityId: id, permission: 'sesion.perfil', detail: { avisoId: id, nivel: notice.nivel } });
      await this.commands.event(c, 'aviso.actualizado', 'aviso', id, notice.version, [`usuario:${actor.id}`]);
      return PublicService.ackOf(id, row);
    });
  }

  /**
   * S11 · "Recordarme después": el aviso deja de destacarse hasta `ahora + avisos.recordatorio_horas` y luego vuelve.
   * Sobre un aviso con "Enterado" no cambia nada y responde el acuse.
   */
  async snooze(actor: Actor, id: string, key?: string) {
    const now = this.clock.now();
    return this.commands.run(actor, `sesion.perfil:aviso.posponer:${id}`, key, { id }, async c => {
      const notice = await this.noticeForMe(c, actor, id, now);
      const current = await this.ackRow(c, id, actor.id);
      if (current?.enterado_en) return PublicService.ackOf(id, current);
      const until = new Date(now.valueOf() + (await this.reminderHours(now, viaClient(c))) * 3600_000);
      const row = (await c.query<{ enterado_en: string | null; recordar_en: string }>(
        `INSERT INTO publico.aviso_enterado(aviso_id,usuario_id,recordar_en,actualizado_en) VALUES($1,$2,$3,$4)
         ON CONFLICT (aviso_id,usuario_id) DO UPDATE SET recordar_en=excluded.recordar_en,actualizado_en=excluded.actualizado_en RETURNING enterado_en,recordar_en`, [id, actor.id, until, now])).rows[0];
      await this.commands.audit(c, actor, { action: 'avisos.posponer', entity: 'aviso', entityId: id, permission: 'sesion.perfil', detail: { avisoId: id, nivel: notice.nivel, recordarEn: until.toISOString() } });
      await this.commands.event(c, 'aviso.actualizado', 'aviso', id, notice.version, [`usuario:${actor.id}`]);
      return PublicService.ackOf(id, row);
    });
  }

  /**
   * S11 · Para quien publica: por aviso, cuántas cuentas dieron "Enterado" y a cuántas cuentas activas del personal va
   * dirigido por rol o por el área de su ficha (0 si solo es público). Solo conteos, nunca nombres.
   */
  async noticeStats() {
    return this.db.query<{ avisoId: string; enterados: number; destinatarios: number }>(
      `SELECT a.id AS "avisoId",
         (SELECT count(*)::int FROM publico.aviso_enterado e WHERE e.aviso_id=a.id AND e.enterado_en IS NOT NULL) AS enterados,
         (SELECT count(*)::int FROM acceso.usuario u WHERE u.estado='activo' AND (
            EXISTS (SELECT 1 FROM acceso.asignacion_rol r WHERE r.usuario_id=u.id AND r.rol_codigo=ANY(a.roles))
            OR (cardinality(a.areas) > 0 AND EXISTS (SELECT 1 FROM personal.persona p JOIN infra.espacio s ON s.id=p.area_id WHERE p.id=u.persona_personal_id AND s.codigo=ANY(a.areas))))) AS destinatarios
       FROM publico.aviso a ORDER BY lower(a.vigencia) DESC,a.creado_en DESC LIMIT 100`);
  }

  /** Para quien redacta: todos los avisos recientes con su audiencia, estado (vigente, programado, vencido, retirado) y acciones. */
  async listNotices() {
    const at = this.clock.now();
    const rows = await this.db.query<NoticeRow>(`SELECT ${NOTICE_COLUMNS} FROM publico.aviso ORDER BY lower(vigencia) DESC,creado_en DESC LIMIT 100`);
    return rows.map(r => listItemOf(r, at));
  }

  /** FR-112-06: números llamados hoy en un servicio, con su consultorio y sin nombres. */
  calledNumbers(service: string) {
    if (!/^[a-z_]{2,40}$/.test(service)) throw new BadRequestException('Indica un servicio válido.');
    return this.cache.get(`fila:${service}`, async () => {
      const today = this.clock.today();
      const rows = await this.db.query<{ numero: number; consultorio: string | null; llamados: number }>(
        'SELECT numero,consultorio,llamados FROM publico.v_fila_llamados WHERE servicio=$1 AND fecha=$2::date ORDER BY numero DESC LIMIT 20', [service, today]);
      return { actualizadoEn: this.clock.now().toISOString(), servicio: service, fecha: today, llamados: rows.map(r => ({ numero: r.numero, consultorio: r.consultorio, llamados: r.llamados })) };
    });
  }

  /**
   * Reglas comunes de publicar y editar (FR-112-03, FR-112-05): vigencia con zona horaria y fin futuro, audiencia
   * válida y advertencia de datos personales. `keptFrom` es el inicio vigente que conserva una edición sin `desde`;
   * `client` es la transacción del comando cuando la regla corre dentro de ella.
   */
  private async checkNotice(dto: NoticeDto, now: Date, kept?: { from: Date; nivel: string; areas: string[] }, client?: PoolClient) {
    const keptFrom = kept?.from;
    const zoned = (value: string) => /(Z|[+-]\d\d:\d\d)$/.test(value);
    if ((dto.desde && !zoned(dto.desde)) || !zoned(dto.hasta)) throw new ProblemException('validacion', 400, 'Indica la vigencia con zona horaria.', dto.desde && !zoned(dto.desde) ? 'desde' : 'hasta');
    const from = dto.desde ? new Date(dto.desde) : keptFrom ?? now, to = new Date(dto.hasta);
    if (to <= from) throw new ProblemException('validacion', 400, 'El fin de la vigencia debe ser posterior al inicio.', 'hasta');
    if (to <= now) throw new ProblemException('validacion', 400, 'El aviso ya habría vencido; indica un fin futuro.', 'hasta');
    // S11: without a level a new notice is informativo and an edit keeps the current one (old clients do not send it).
    const level = (dto.nivel ?? kept?.nivel ?? 'informativo') as NoticeLevel;
    const priority = dto.prioridad ?? (dto.nivel ? priorityOfLevel(dto.nivel) : 'atencion'), roles = [...new Set(dto.roles ?? [])].sort();
    const areas = [...new Set(dto.areas ?? kept?.areas ?? [])].sort(), isPublic = dto.publico ?? (roles.length === 0 && areas.length === 0);
    if (areas.length) {
      const sql = "SELECT codigo FROM infra.espacio WHERE codigo = ANY($1::text[]) AND tipo IN ('area','bahia') AND activo";
      const found = client ? (await client.query<{ codigo: string }>(sql, [areas])).rows : await this.db.query<{ codigo: string }>(sql, [areas]);
      const missing = areas.filter(a => !found.some(f => f.codigo === a));
      if (missing.length) throw new ProblemException('validacion', 400, `No existe el área ${missing.join(', ')}.`, 'areas');
    }
    if (roles.length) {
      // Inside a command the same transaction client reads the roles (PGlite has one connection: another query would wait forever).
      const codes = client ? (await client.query<{ codigo: string }>('SELECT codigo FROM acceso.rol')).rows : await this.db.query<{ codigo: string }>('SELECT codigo FROM acceso.rol');
      const known = new Set(codes.map(r => r.codigo));
      const unknown = roles.filter(r => !known.has(r));
      if (unknown.length) throw new ProblemException('validacion', 400, `No existe el rol ${unknown.join(', ')}.`, 'roles');
    }
    if (!isPublic && roles.length === 0 && areas.length === 0) throw new ProblemException('validacion', 400, 'Elige a quién va dirigido: público, uno o más roles o áreas.', 'roles');
    const found = personalDataIn(dto.titulo, dto.cuerpo);
    if (found.length && !dto.confirmarDatosPersonales) {
      throw new ProblemException('aviso_con_datos_personales', 422, 'El aviso parece contener datos personales (DUI, expediente o teléfono). Los avisos son públicos: quítalos o confirma que deseas publicarlo.', 'cuerpo', { datosPersonales: found });
    }
    return { from, to, priority, level, roles, areas, isPublic, found };
  }

  /** FR-112-03 y FR-112-05: publica un aviso con vigencia; si parece llevar datos personales, advierte primero. */
  async publish(actor: Actor, dto: NoticeDto, key?: string) {
    const now = this.clock.now();
    const { from, to, priority, level, roles, areas, isPublic, found } = await this.checkNotice(dto, now);
    const result = await this.commands.run(actor, 'avisos.publicar:aviso', key, dto, async c => {
      const row = (await c.query<{ id: string; desde: string; hasta: string; creado_en: string }>(
        "INSERT INTO publico.aviso(titulo,cuerpo,vigencia,publicado_por,creado_en,prioridad,publico,roles,nivel,areas) VALUES($1,$2,tstzrange($3::timestamptz,$4::timestamptz,'[)'),$5,$6,$7,$8,$9,$10,$11) RETURNING id,lower(vigencia) AS desde,upper(vigencia) AS hasta,creado_en",
        [dto.titulo.trim(), dto.cuerpo.trim(), from, to, actor.id, now, priority, isPublic, roles, level, areas])).rows[0];
      await this.commands.audit(c, actor, { action: 'avisos.publicar', entity: 'aviso', entityId: row.id, permission: 'avisos.publicar', detail: { desde: iso(row.desde), hasta: iso(row.hasta), prioridad: priority, nivel: level, publico: isPublic, roles, areas, datosPersonalesConfirmados: found } });
      await this.commands.event(c, 'aviso.publicado', 'aviso', row.id, 1, [...noticeChannels(isPublic, roles), ...(await areaChannels(c, areas, now))]);
      return { id: row.id, titulo: dto.titulo.trim(), cuerpo: dto.cuerpo.trim(), desde: iso(row.desde), hasta: iso(row.hasta), prioridad: priority, nivel: level, publico: isPublic, roles, areas, publicadoEn: iso(row.creado_en) };
    });
    this.cache.clear();
    return result;
  }

  /** Lee el aviso bloqueado y comprueba que aún admite cambios y que la versión es la que se leyó (MA-AVI-02). */
  private async openNotice(c: PoolClient, id: string, version: number, now: Date): Promise<NoticeRow> {
    const current = (await c.query<NoticeRow>(`SELECT ${NOTICE_COLUMNS} FROM publico.aviso WHERE id=$1 FOR UPDATE`, [id])).rows[0];
    if (!current) throw new ProblemException('no_encontrado', 404, 'El aviso no existe.');
    if (current.retirado_en) throw new ProblemException('aviso_retirado', 409, 'El aviso ya fue retirado y no admite cambios.', undefined, { versionActual: current.version });
    if (new Date(current.hasta) <= now) throw new ProblemException('aviso_vencido', 409, 'El aviso ya venció; publica uno nuevo si hace falta.', undefined, { versionActual: current.version });
    if (current.version !== version) throw new VersionConflictException(current.version, 'El aviso cambió mientras lo editabas; vuelve a abrirlo antes de guardar.');
    return current;
  }

  /**
   * MA-AVI-02: edita texto, prioridad, audiencia y vigencia (adelantar el fin lo vence antes de tiempo). La auditoría
   * guarda el antes y el después (D-13) y el evento llega a la audiencia vieja y a la nueva.
   */
  async edit(actor: Actor, id: string, dto: NoticeEditDto, key?: string) {
    const now = this.clock.now();
    const result = await this.commands.run(actor, `avisos.publicar:aviso.editar:${id}`, key, { id, ...dto }, async c => {
      const current = await this.openNotice(c, id, dto.version, now);
      const { from, to, priority, level, roles, areas, isPublic, found } = await this.checkNotice(dto, now, { from: new Date(current.desde), nivel: current.nivel, areas: current.areas }, c);
      const row = (await c.query<NoticeRow>(
        `UPDATE publico.aviso SET titulo=$2,cuerpo=$3,vigencia=tstzrange($4::timestamptz,$5::timestamptz,'[)'),prioridad=$6,publico=$7,roles=$8,editado_en=$9,editado_por=$10,nivel=$11,areas=$12,version=version+1
         WHERE id=$1 RETURNING ${NOTICE_COLUMNS}`,
        [id, dto.titulo.trim(), dto.cuerpo.trim(), from, to, priority, isPublic, roles, now, actor.id, level, areas])).rows[0];
      const before = noticeOf(current), after = noticeOf(row);
      await this.commands.audit(c, actor, { action: 'avisos.editar', entity: 'aviso', entityId: id, permission: 'avisos.publicar', detail: { antes: before, despues: after, datosPersonalesConfirmados: found } });
      await this.commands.event(c, 'aviso.actualizado', 'aviso', id, row.version, [...new Set([...noticeChannels(current.publico, current.roles), ...noticeChannels(isPublic, roles), ...(await areaChannels(c, [...new Set([...current.areas, ...areas])], now))])]);
      return listItemOf(row, now);
    });
    this.cache.clear();
    return result;
  }

  /** MA-AVI-02 y D-13: retira el aviso antes de tiempo con un motivo auditado; deja de verse en todas partes. */
  async withdraw(actor: Actor, id: string, dto: NoticeWithdrawDto, key?: string) {
    const now = this.clock.now();
    const result = await this.commands.run(actor, `avisos.publicar:aviso.retirar:${id}`, key, { id, ...dto }, async c => {
      const current = await this.openNotice(c, id, dto.version, now);
      const row = (await c.query<NoticeRow>(
        `UPDATE publico.aviso SET retirado_en=$2,retirado_por=$3,motivo_retiro=$4,version=version+1 WHERE id=$1 RETURNING ${NOTICE_COLUMNS}`,
        [id, now, actor.id, dto.motivo])).rows[0];
      await this.commands.audit(c, actor, { action: 'avisos.retirar', entity: 'aviso', entityId: id, permission: 'avisos.publicar', reason: dto.motivo, detail: { motivo: dto.motivo, aviso: noticeOf(current) } });
      await this.commands.event(c, 'aviso.actualizado', 'aviso', id, row.version, [...noticeChannels(current.publico, current.roles), ...(await areaChannels(c, current.areas, now))]);
      return listItemOf(row, now);
    });
    this.cache.clear();
    return result;
  }
}
