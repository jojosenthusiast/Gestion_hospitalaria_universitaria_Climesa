import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor, contextsOf } from '../platform/actor';
import { channelsFor, patientAccount } from '../platform/channels';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { QUEUE_SERVICES, QueueIssueDto, QueueTransitionDto } from './queue.dto';

type QueueRow = Record<string, any>;

const serviceNames: Record<string, string> = {
  consulta_general: 'Consulta general',
  emergencia: 'Emergencia',
  laboratorio: 'Laboratorio',
  admisiones: 'Admisiones',
};

const activeTicket = (number?: number) => new ProblemException('ticket_activo_existente', 409,
  number ? `El paciente ya tiene el número ${number} activo en este servicio hoy.` : 'El paciente ya tiene un número activo en este servicio hoy.');

@Injectable()
export class QueueService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}

  private date(value?: string) {
    const date = value ?? this.clock.today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('La fecha debe tener formato AAAA-MM-DD.');
    return date;
  }

  private async ownTicket(c: PoolClient, actor: Actor, id: string, lock = true) {
    const row = (await c.query(`SELECT id,servicio AS service,fecha,numero,paciente_id AS "patientId",estado AS state,
      consultorio_id AS "officeId",llamados,version FROM atencion.ticket_fila WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0] as QueueRow | undefined;
    if (!row) throw new NotFoundException('No se encontró el número de fila.');
    if (!this.seesWholeQueue(actor) && (!actor.patientId || actor.patientId !== row.patientId)) throw new ForbiddenException('Solo puedes consultar tu propio número de fila.');
    return row;
  }

  /** `fila.ver` con contexto distinto de `propio` ve la fila completa; con `propio`, solo el número del paciente vinculado. */
  private seesWholeQueue(actor: Actor) {
    return contextsOf(actor, 'fila.ver').some(context => context !== 'propio');
  }

  private async channels(c: PoolClient, patientId?: string) {
    return channelsFor(c, ['fila.ver', 'fila.llamar', 'fila.gestionar'], { users: [patientId ? await patientAccount(c, patientId) : null] });
  }

  /**
   * The day's queue. `consultationId`/`consultationState` describe the consultation started from each number only when
   * it belongs to the reading professional, so the doctor resumes their own consultation; nobody else sees the id.
   */
  async list(actor: Actor, dateText?: string, service?: string) {
    const date = this.date(dateText);
    if (service && !QUEUE_SERVICES.includes(service as any)) throw new BadRequestException('Selecciona un servicio válido.');
    const whole = this.seesWholeQueue(actor);
    // SEG-01: una cuenta con solo `propio` y sin expediente vinculado no tiene número que ver.
    if (!whole && !actor.patientId) return [];
    const own = whole ? null : actor.patientId;
    return this.db.transaction(async c => { const rows = (await c.query(`SELECT t.id,t.servicio AS service,t.fecha,t.numero,t.paciente_id AS "patientId",
      coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional) AS "patientName",
      t.estado AS state,t.consultorio_id AS "officeId",t.llamados,t.version,t.emitido_en AS "issuedAt",
      k.id AS "consultationId",k.estado AS "consultationState"
      FROM atencion.ticket_fila t LEFT JOIN pacientes.paciente p ON p.id=t.paciente_id
      LEFT JOIN atencion.consulta k ON k.ticket_id=t.id AND k.estado<>'ingresada_por_error' AND k.medico_id=$4::uuid
      WHERE t.fecha=$1::date AND ($2::text IS NULL OR t.servicio=$2) AND ($3::uuid IS NULL OR t.paciente_id=$3)
      ORDER BY t.servicio,t.numero`, [date, service ?? null, own, actor.staffId ?? null])).rows;
      // SEG-02: aggregated read audit with every patient listed.
      await this.commands.audit(c, actor, { action: 'fila.leer', entity: 'ticket_fila', permission: 'fila.ver', detail: { date, patientIds: [...new Set(rows.map(row => row.patientId).filter(Boolean))] } });
      return rows;
    });
  }

  async issue(actor: Actor, dto: QueueIssueDto, key?: string) {
    const own = contextsOf(actor, 'fila.emitir').includes('propio');
    const patientId = own ? actor.patientId : dto.patientId;
    if (!patientId) throw new ForbiddenException('La cuenta no está vinculada a un paciente.');
    return this.commands.run(actor, 'fila.emitir', key, dto, async c => {
      const patient = (await c.query("SELECT id FROM pacientes.paciente WHERE id=$1 AND estado IN ('activo','provisional')", [patientId])).rows[0];
      if (!patient) throw new BadRequestException('Selecciona un paciente activo.');
      const date = this.clock.today();
      // W-07: one active number per patient, service and day; `ticket_fila_activo_unico` guarantees it under races.
      const active = (await c.query(`SELECT numero FROM atencion.ticket_fila WHERE paciente_id=$1 AND servicio=$2 AND fecha=$3::date AND estado IN ('en_espera','llamado','en_atencion') LIMIT 1`, [patientId, dto.service, date])).rows[0];
      if (active) throw activeTicket(active.numero);
      const number = (await c.query('SELECT atencion.emitir_numero($1,$2::date) AS number', [dto.service, date])).rows[0].number;
      const row = (await c.query(`INSERT INTO atencion.ticket_fila(servicio,fecha,numero,paciente_id,emitido_por)
        VALUES($1,$2::date,$3,$4,$5) RETURNING id,servicio AS service,fecha,numero,estado AS state,version`, [dto.service, date, number, patientId, actor.id]).catch(error => {
        if (error?.code === '23505' && String(error?.constraint ?? error?.message ?? '').includes('ticket_fila_activo_unico')) throw activeTicket();
        throw error;
      })).rows[0];
      await this.commands.audit(c, actor, { action: 'fila.emitir', entity: 'ticket_fila', entityId: row.id, patientId, permission: 'fila.emitir', detail: { service: dto.service, number } });
      await this.commands.event(c, 'fila.actualizada', 'ticket_fila', row.id, row.version, await this.channels(c, patientId));
      return { ...row, serviceName: serviceNames[dto.service], patientId };
    });
  }

  async call(actor: Actor, id: string, dto: QueueTransitionDto, key?: string) {
    return this.commands.run(actor, `fila.llamar:${id}`, key, dto, async c => {
      const old = await this.ownTicket(c, actor, id);
      if (!['en_espera', 'llamado'].includes(old.state)) throw new ProblemException('transicion_invalida', 409, 'Solo se puede llamar un número en espera o ya llamado.');
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La fila cambió; vuelve a cargarla.');
      if (old.llamados >= 3) throw new ProblemException('fila_max_llamados', 409, 'Este número ya alcanzó el máximo de llamados.');
      const row = (await c.query(`UPDATE atencion.ticket_fila SET estado='llamado',llamados=llamados+1,consultorio_id=COALESCE($2,consultorio_id),version=version+1 WHERE id=$1 RETURNING id,version,estado AS state,llamados`, [id, dto.officeId ?? null])).rows[0];
      await this.commands.audit(c, actor, { action: 'fila.llamar', entity: 'ticket_fila', entityId: id, patientId: old.patientId, permission: 'fila.llamar', detail: { officeId: dto.officeId ?? null } });
      await this.commands.event(c, 'fila.actualizada', 'ticket_fila', id, row.version, await this.channels(c, old.patientId));
      return row;
    });
  }

  async transition(actor: Actor, id: string, state: 'en_atencion' | 'atendido' | 'no_se_presento', dto: QueueTransitionDto, key?: string) {
    return this.commands.run(actor, `fila.gestionar:estado:${id}:${state}`, key, dto, async c => {
      const old = await this.ownTicket(c, actor, id);
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La fila cambió; vuelve a cargarla.');
      const allowed: Record<string, string[]> = { en_atencion: ['llamado'], atendido: ['en_atencion'], no_se_presento: ['en_espera', 'llamado'] };
      if (!allowed[state].includes(old.state)) throw new ProblemException('transicion_invalida', 409, `No se puede pasar de ${old.state} a ${state}.`);
      const row = (await c.query(`UPDATE atencion.ticket_fila SET estado=$2,consultorio_id=COALESCE($3,consultorio_id),version=version+1 WHERE id=$1 RETURNING id,version,estado AS state`, [id, state, dto.officeId ?? null])).rows[0];
      await this.commands.audit(c, actor, { action: `fila.${state}`, entity: 'ticket_fila', entityId: id, patientId: old.patientId, permission: 'fila.gestionar', reason: dto.reason, detail: { from: old.state, to: state } });
      await this.commands.event(c, 'fila.actualizada', 'ticket_fila', id, row.version, await this.channels(c, old.patientId));
      return row;
    });
  }
}

