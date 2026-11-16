import { BadRequestException, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor } from '../platform/actor';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { HeadCache } from '../platform/head-cache';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { personalDataIn } from './notice.rules';
import { NoticeDto, NoticeEditDto, NoticeWithdrawDto } from './public.dto';

/** Plan 112: caché de 5 s invalidada por cualquier evento confirmado. */
export const PUBLIC_CACHE_MS = 5_000;
const iso = (value: unknown) => value == null ? null : new Date(value as string).toISOString();
type NoticeRow = { id: string; titulo: string; cuerpo: string; desde: string; hasta: string; prioridad: string; publico: boolean; roles: string[]; creado_en: string; version: number; retirado_en: string | null; motivo_retiro: string | null };
const NOTICE_COLUMNS = 'id,titulo,cuerpo,prioridad,publico,roles,lower(vigencia) AS desde,upper(vigencia) AS hasta,creado_en,version,retirado_en,motivo_retiro';
const noticeOf = (r: NoticeRow) => ({ id: r.id, titulo: r.titulo, cuerpo: r.cuerpo, desde: iso(r.desde), hasta: iso(r.hasta), prioridad: r.prioridad, publico: r.publico, roles: r.roles });
/** Estado del aviso para quien lo redacta; solo uno vigente o programado admite editar o retirar (MA-AVI-02). */
const noticeState = (r: NoticeRow, at: Date) => r.retirado_en ? 'retirado' : new Date(r.hasta) <= at ? 'vencido' : new Date(r.desde) > at ? 'programado' : 'vigente';
const listItemOf = (r: NoticeRow, at: Date) => {
  const estado = noticeState(r, at);
  return { ...noticeOf(r), estado, publicadoEn: iso(r.creado_en), version: r.version, allowedActions: estado === 'vigente' || estado === 'programado' ? ['editar', 'retirar'] : [], retiradoEn: iso(r.retirado_en), motivoRetiro: r.motivo_retiro ?? null };
};
/** Canales de un aviso: `publico` si es público y `rol:<código>` por cada rol dirigido (la base amplía el resto). */
const noticeChannels = (isPublic: boolean, roles: string[]) => [...(isPublic ? ['publico'] : []), ...roles.map(r => `rol:${r}`)];
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
    const where = 'retirado_en IS NULL AND vigencia @> $1::timestamptz AND (publico OR roles && $2::text[])';
    const rows = await this.db.query<NoticeRow>(
      `SELECT ${NOTICE_COLUMNS} FROM publico.aviso WHERE ${where}
       ORDER BY CASE prioridad WHEN 'critico' THEN 0 WHEN 'urgente' THEN 1 ELSE 2 END,lower(vigencia) DESC,creado_en DESC LIMIT 50`, [at, actor.roles]);
    const next = (await this.db.query<{ desde: string }>('SELECT min(lower(vigencia)) AS desde FROM publico.aviso WHERE retirado_en IS NULL AND (publico OR roles && $2::text[]) AND lower(vigencia) > $1::timestamptz', [at, actor.roles]))[0]?.desde;
    return { actualizadoEn: at.toISOString(), avisos: rows.map(noticeOf), proximoCambio: iso(earliest([...rows.map(r => r.hasta), next]) ?? null) };
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
  private async checkNotice(dto: NoticeDto, now: Date, keptFrom?: Date, client?: PoolClient) {
    const zoned = (value: string) => /(Z|[+-]\d\d:\d\d)$/.test(value);
    if ((dto.desde && !zoned(dto.desde)) || !zoned(dto.hasta)) throw new ProblemException('validacion', 400, 'Indica la vigencia con zona horaria.', dto.desde && !zoned(dto.desde) ? 'desde' : 'hasta');
    const from = dto.desde ? new Date(dto.desde) : keptFrom ?? now, to = new Date(dto.hasta);
    if (to <= from) throw new ProblemException('validacion', 400, 'El fin de la vigencia debe ser posterior al inicio.', 'hasta');
    if (to <= now) throw new ProblemException('validacion', 400, 'El aviso ya habría vencido; indica un fin futuro.', 'hasta');
    const priority = dto.prioridad ?? 'atencion', roles = [...new Set(dto.roles ?? [])].sort(), isPublic = dto.publico ?? roles.length === 0;
    if (roles.length) {
      // Inside a command the same transaction client reads the roles (PGlite has one connection: another query would wait forever).
      const codes = client ? (await client.query<{ codigo: string }>('SELECT codigo FROM acceso.rol')).rows : await this.db.query<{ codigo: string }>('SELECT codigo FROM acceso.rol');
      const known = new Set(codes.map(r => r.codigo));
      const unknown = roles.filter(r => !known.has(r));
      if (unknown.length) throw new ProblemException('validacion', 400, `No existe el rol ${unknown.join(', ')}.`, 'roles');
    }
    if (!isPublic && roles.length === 0) throw new ProblemException('validacion', 400, 'Elige a quién va dirigido: público, uno o más roles, o ambos.', 'roles');
    const found = personalDataIn(dto.titulo, dto.cuerpo);
    if (found.length && !dto.confirmarDatosPersonales) {
      throw new ProblemException('aviso_con_datos_personales', 422, 'El aviso parece contener datos personales (DUI, expediente o teléfono). Los avisos son públicos: quítalos o confirma que deseas publicarlo.', 'cuerpo', { datosPersonales: found });
    }
    return { from, to, priority, roles, isPublic, found };
  }

  /** FR-112-03 y FR-112-05: publica un aviso con vigencia; si parece llevar datos personales, advierte primero. */
  async publish(actor: Actor, dto: NoticeDto, key?: string) {
    const now = this.clock.now();
    const { from, to, priority, roles, isPublic, found } = await this.checkNotice(dto, now);
    const result = await this.commands.run(actor, 'avisos.publicar:aviso', key, dto, async c => {
      const row = (await c.query<{ id: string; desde: string; hasta: string; creado_en: string }>(
        "INSERT INTO publico.aviso(titulo,cuerpo,vigencia,publicado_por,creado_en,prioridad,publico,roles) VALUES($1,$2,tstzrange($3::timestamptz,$4::timestamptz,'[)'),$5,$6,$7,$8,$9) RETURNING id,lower(vigencia) AS desde,upper(vigencia) AS hasta,creado_en",
        [dto.titulo.trim(), dto.cuerpo.trim(), from, to, actor.id, now, priority, isPublic, roles])).rows[0];
      await this.commands.audit(c, actor, { action: 'avisos.publicar', entity: 'aviso', entityId: row.id, permission: 'avisos.publicar', detail: { desde: iso(row.desde), hasta: iso(row.hasta), prioridad: priority, publico: isPublic, roles, datosPersonalesConfirmados: found } });
      await this.commands.event(c, 'aviso.publicado', 'aviso', row.id, 1, noticeChannels(isPublic, roles));
      return { id: row.id, titulo: dto.titulo.trim(), cuerpo: dto.cuerpo.trim(), desde: iso(row.desde), hasta: iso(row.hasta), prioridad: priority, publico: isPublic, roles, publicadoEn: iso(row.creado_en) };
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
    const result = await this.commands.run(actor, 'avisos.publicar:aviso.editar', key, { id, ...dto }, async c => {
      const current = await this.openNotice(c, id, dto.version, now);
      const { from, to, priority, roles, isPublic, found } = await this.checkNotice(dto, now, new Date(current.desde), c);
      const row = (await c.query<NoticeRow>(
        `UPDATE publico.aviso SET titulo=$2,cuerpo=$3,vigencia=tstzrange($4::timestamptz,$5::timestamptz,'[)'),prioridad=$6,publico=$7,roles=$8,editado_en=$9,editado_por=$10,version=version+1
         WHERE id=$1 RETURNING ${NOTICE_COLUMNS}`,
        [id, dto.titulo.trim(), dto.cuerpo.trim(), from, to, priority, isPublic, roles, now, actor.id])).rows[0];
      const before = noticeOf(current), after = noticeOf(row);
      await this.commands.audit(c, actor, { action: 'avisos.editar', entity: 'aviso', entityId: id, permission: 'avisos.publicar', detail: { antes: before, despues: after, datosPersonalesConfirmados: found } });
      await this.commands.event(c, 'aviso.actualizado', 'aviso', id, row.version, [...new Set([...noticeChannels(current.publico, current.roles), ...noticeChannels(isPublic, roles)])]);
      return listItemOf(row, now);
    });
    this.cache.clear();
    return result;
  }

  /** MA-AVI-02 y D-13: retira el aviso antes de tiempo con un motivo auditado; deja de verse en todas partes. */
  async withdraw(actor: Actor, id: string, dto: NoticeWithdrawDto, key?: string) {
    const now = this.clock.now();
    const result = await this.commands.run(actor, 'avisos.publicar:aviso.retirar', key, { id, ...dto }, async c => {
      const current = await this.openNotice(c, id, dto.version, now);
      const row = (await c.query<NoticeRow>(
        `UPDATE publico.aviso SET retirado_en=$2,retirado_por=$3,motivo_retiro=$4,version=version+1 WHERE id=$1 RETURNING ${NOTICE_COLUMNS}`,
        [id, now, actor.id, dto.motivo])).rows[0];
      await this.commands.audit(c, actor, { action: 'avisos.retirar', entity: 'aviso', entityId: id, permission: 'avisos.publicar', reason: dto.motivo, detail: { motivo: dto.motivo, aviso: noticeOf(current) } });
      await this.commands.event(c, 'aviso.actualizado', 'aviso', id, row.version, noticeChannels(current.publico, current.roles));
      return listItemOf(row, now);
    });
    this.cache.clear();
    return result;
  }
}
