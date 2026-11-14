import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor } from '../platform/actor';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { BedRow, bedVerdict, Category, visitorError, visitorPolicy } from './admission-intake.rules';
import { FeasibilityQuery, MapQuery, OriginsQuery, ShiftQuery } from './admission-intake.dto';

type Row = Record<string, any>;
export type Origin = 'cita' | 'consulta' | 'emergencia' | 'ambulancia';

const fmt = new Intl.DateTimeFormat('es-SV', { timeZone: 'America/El_Salvador', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

/** Read side of the guided admission: source records, doctors on shift, bed map and the feasibility check. */
@Injectable()
export class AdmissionIntakeService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}

  private instant(at?: string) { return at ? new Date(at) : this.clock.now(); }

  /** The source record of the admission must exist and belong to the patient (never a loose id). */
  async originBelongsToPatient(c: PoolClient, origin: string, originId: string, patientId: string) {
    const sql: Record<string, string> = {
      cita: 'SELECT 1 FROM atencion.cita WHERE id=$1 AND paciente_id=$2',
      consulta: 'SELECT 1 FROM atencion.consulta WHERE id=$1 AND paciente_id=$2',
      emergencia: "SELECT 1 FROM atencion.ticket_fila WHERE id=$1 AND paciente_id=$2 AND servicio='emergencia'",
      ambulancia: 'SELECT 1 FROM ambulancia.servicio WHERE id=$1 AND paciente_id=$2',
    };
    if (!sql[origin]) return false;
    return (await c.query(sql[origin], [originId, patientId])).rowCount! > 0;
  }

  /** A doctor is available when a published or running shift covers the instant. */
  async doctorOnShift(c: PoolClient, doctorId: string, at: Date) {
    return (await c.query("SELECT 1 FROM personal.turno WHERE persona_id=$1 AND estado IN ('publicado','en_curso') AND periodo @> $2::timestamptz LIMIT 1", [doctorId, at])).rowCount! > 0;
  }

  async origins(actor: Actor, q: OriginsQuery) {
    return this.db.transaction(async c => {
      const want = (origin: Origin) => !q.origin || q.origin === origin;
      const out: Row[] = [];
      if (want('cita')) for (const r of (await c.query(`SELECT c.id,lower(c.horario) AS at,c.estado,coalesce(p.nombres||' '||p.apellidos,'') AS doctor FROM atencion.cita c LEFT JOIN personal.persona p ON p.id=c.medico_id WHERE c.paciente_id=$1 AND c.estado IN ('confirmada','atendida') ORDER BY lower(c.horario) DESC LIMIT 10`, [q.patientId])).rows)
        out.push({ id: r.id, origin: 'cita', at: r.at, label: `Cita del ${fmt.format(r.at)}`, detail: [r.doctor, r.estado === 'atendida' ? 'atendida' : 'confirmada'].filter(Boolean).join(' · ') });
      if (want('consulta')) for (const r of (await c.query(`SELECT c.id,c.iniciada_en AS at,c.estado,coalesce(p.nombres||' '||p.apellidos,'') AS doctor FROM atencion.consulta c LEFT JOIN personal.persona p ON p.id=c.medico_id WHERE c.paciente_id=$1 ORDER BY c.iniciada_en DESC LIMIT 10`, [q.patientId])).rows)
        out.push({ id: r.id, origin: 'consulta', at: r.at, label: `Consulta del ${fmt.format(r.at)}`, detail: [r.doctor, r.estado].filter(Boolean).join(' · ') });
      if (want('emergencia')) for (const r of (await c.query(`SELECT id,emitido_en AS at,numero,estado FROM atencion.ticket_fila WHERE paciente_id=$1 AND servicio='emergencia' ORDER BY emitido_en DESC LIMIT 10`, [q.patientId])).rows)
        out.push({ id: r.id, origin: 'emergencia', at: r.at, label: `Emergencia del ${fmt.format(r.at)}`, detail: `Ticket ${r.numero} · ${r.estado}` });
      if (want('ambulancia')) for (const r of (await c.query(`SELECT id,despachado_en AS at,origen,destino,estado_final FROM ambulancia.servicio WHERE paciente_id=$1 ORDER BY despachado_en DESC LIMIT 10`, [q.patientId])).rows)
        out.push({ id: r.id, origin: 'ambulancia', at: r.at, label: `Ambulancia del ${fmt.format(r.at)}`, detail: `${r.origen} a ${r.destino}${r.estado_final ? ` · ${r.estado_final}` : ' · en curso'}` });
      await this.commands.audit(c, actor, { action: 'admision.origenes', entity: 'paciente', entityId: q.patientId, patientId: q.patientId, permission: 'admision.crear', detail: { count: out.length } });
      return out.sort((a, b) => b.at.valueOf() - a.at.valueOf());
    });
  }

  async doctors(_actor: Actor, q: ShiftQuery) {
    const at = this.instant(q.at);
    return this.db.transaction(async c => (await c.query(`SELECT p.id,p.nombres||' '||p.apellidos AS name,p.especialidad AS specialty,
        EXISTS(SELECT 1 FROM personal.turno t WHERE t.persona_id=p.id AND t.estado IN ('publicado','en_curso') AND t.periodo @> $1::timestamptz) AS available
      FROM personal.persona p WHERE p.tipo='medico' AND p.activo ORDER BY p.nombres,p.apellidos LIMIT 200`, [at])).rows.map(r => ({ ...r, reason: r.available ? null : 'Sin turno en ese horario' })));
  }

  private async patientSex(c: PoolClient, patientId: string) {
    const row = (await c.query("SELECT coalesce(sexo,'no_registrado') AS sex FROM pacientes.paciente WHERE id=$1", [patientId])).rows[0];
    if (!row) throw new NotFoundException('No se encontró el paciente.');
    return row.sex as string;
  }

  /** Every active bed with its verdict for this patient; `suggested` marks the best one of `category`. */
  private async evaluate(c: PoolClient, sex: string, isolation: boolean, category?: Category) {
    const rows = (await c.query(`SELECT b.cama_id AS id,e.version,b.codigo AS code,b.habitacion_id AS "roomId",b.habitacion AS room,b.categoria AS category,b.nivel AS floor,h.capacidad AS capacity,b.estado AS state,b.sexo_paciente AS "roomSex",b.aislamiento AS "roomIsolation"
      FROM infra.v_estado_cama b JOIN infra.espacio e ON e.id=b.cama_id JOIN infra.espacio h ON h.id=b.habitacion_id ORDER BY b.nivel NULLS LAST,b.habitacion,b.codigo`)).rows as Row[];
    const byRoom = new Map<string, BedRow[]>();
    for (const r of rows) byRoom.set(r.roomId, [...(byRoom.get(r.roomId) ?? []), r as BedRow]);
    const beds = rows.map(r => {
      const roomBeds = byRoom.get(r.roomId)!;
      const verdict = bedVerdict(r as BedRow, roomBeds, sex, isolation);
      return { id: r.id, version: r.version, code: r.code, roomId: r.roomId, room: r.room, floor: r.floor ?? null, category: r.category, capacity: r.capacity, state: r.state,
        occupiedInRoom: roomBeds.filter(o => o.state === 'ocupada').length, compatible: verdict.compatible, reason: verdict.reason, suggested: false };
    });
    if (category) {
      const best = beds.filter(b => b.compatible && b.category === category)
        .sort((a, b) => b.occupiedInRoom - a.occupiedInRoom || (a.floor ?? 999) - (b.floor ?? 999) || a.room.localeCompare(b.room) || a.code.localeCompare(b.code))[0];
      if (best) best.suggested = true;
    }
    return beds;
  }

  async bedMap(actor: Actor, q: MapQuery) {
    return this.db.transaction(async c => {
      const sex = await this.patientSex(c, q.patientId);
      const beds = await this.evaluate(c, sex, q.isolation ?? false, q.category as Category | undefined);
      const categories = (['semiprivada', 'vip'] as const).map(category => ({ category, free: beds.filter(b => b.category === category && b.state === 'libre').length, compatible: beds.filter(b => b.category === category && b.compatible).length }));
      await this.commands.audit(c, actor, { action: 'camas.mapa', entity: 'paciente', entityId: q.patientId, patientId: q.patientId, permission: 'admision.crear', detail: { beds: beds.length } });
      return { categories, beds };
    });
  }

  /** Last check before confirming: every condition the create command will enforce, with a message for each. */
  async feasibility(actor: Actor, q: FeasibilityQuery) {
    return this.db.transaction(async c => {
      const checks: { code: string; ok: boolean; message: string }[] = [];
      const add = (code: string, ok: boolean, okMessage: string, failMessage: string) => checks.push({ code, ok, message: ok ? okMessage : failMessage });
      const sex = await this.patientSex(c, q.patientId);
      const active = (await c.query(`SELECT 1 FROM hospitalizacion.admision WHERE paciente_id=$1 AND estado IN ('pendiente_cama','hospitalizado','alta_firmada') LIMIT 1`, [q.patientId])).rowCount! > 0;
      add('paciente_sin_admision', !active, 'El paciente no tiene otra admisión activa.', 'El paciente ya tiene una admisión activa.');
      add('origen_vinculado', await this.originBelongsToPatient(c, q.origin, q.originId, q.patientId), 'El registro de origen pertenece al paciente.', 'El registro de origen no existe o no es de este paciente.');
      const doctor = (await c.query(`SELECT id FROM personal.persona WHERE id=$1 AND tipo='medico' AND activo`, [q.doctorId])).rows[0];
      add('medico_activo', !!doctor, 'El médico tratante está activo.', 'El médico tratante no está activo.');
      const at = this.instant(q.at);
      add('medico_en_turno', !!doctor && await this.doctorOnShift(c, q.doctorId, at), 'El médico tiene turno en ese horario.', 'El médico no tiene turno en ese horario.');
      const error = visitorError(visitorPolicy(q.visitorsAllowed, q.visitorsMax), q.category as Category);
      add('visitas', error === null, 'Las visitas respetan la categoría.', error ?? '');
      if (q.bedId) {
        const bed = (await this.evaluate(c, sex, q.isolation ?? false, q.category as Category)).find(b => b.id === q.bedId);
        add('cama_compatible', !!bed && bed.compatible, 'La cama sigue libre y es compatible.', bed ? `${bed.code}: ${bed.reason ?? 'no disponible'}.` : 'La cama no existe o no está activa.');
        add('cama_categoria', !bed || bed.category === q.category, 'La cama es de la categoría solicitada.', 'La cama no es de la categoría solicitada.');
      }
      await this.commands.audit(c, actor, { action: 'admision.factibilidad', entity: 'paciente', entityId: q.patientId, patientId: q.patientId, permission: 'admision.crear' });
      return { feasible: checks.every(x => x.ok), checks };
    });
  }

  assertBedAllowedAt(scheduledAt: string | undefined) {
    if (scheduledAt && new Date(scheduledAt).getTime() > this.clock.now().getTime() + 15 * 60_000) throw new BadRequestException('La cama se asigna al ingresar: para una fecha futura deja la cama sin elegir.');
  }
}
