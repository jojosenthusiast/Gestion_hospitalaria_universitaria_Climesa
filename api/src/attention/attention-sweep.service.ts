import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PoolClient } from 'pg';
import { channelsFor, patientAccount } from '../platform/channels';
import { businessDayRange, Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';

/** Author of the automatic closures in the audit trail (no user account). */
export const SYSTEM_ACTOR = { id: '00000000-0000-0000-0000-000000000000', roles: ['SISTEMA'] };

/**
 * Automatic closures that depend only on the clock (audit CITA-05, CITA-02, MA-CIT-02/ASIS-05, FILA-03/ASIS-04):
 * - a request nobody handled before its time becomes `vencida`;
 * - a pending reschedule request expires when its slot or the original appointment starts;
 * - a confirmed appointment from a previous day without a consultation becomes `no_asistio` (`cancelada` when the
 *   doctor was marked absent over it);
 * - the queue numbers of a previous day still open close (`no_se_presento` after N calls, `atendido` with a signed
 *   consultation, `cerrado` otherwise); a number whose consultation is still open stays in attention.
 * It runs every minute (like the shift states) and before the appointment and queue reads, so the lists never show
 * stale states. Each closure is audited and announced on the realtime outbox.
 */
@Injectable()
export class AttentionSweepService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const log = new Logger(AttentionSweepService.name);
    this.timer = setInterval(() => this.sweep().catch(e => log.warn(`No se pudo cerrar citas o fila vencidas: ${e}`)), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /**
   * The request-path sweep: the timer is the primary path, so a failure here (a lock or statement timeout) is logged
   * and the read goes on with the states as they are.
   */
  async sweepSafely() {
    try { return await this.sweep(); } catch (e) {
      new Logger(AttentionSweepService.name).warn(`No se pudo cerrar citas o fila vencidas antes de la lectura: ${e}`);
      return 0;
    }
  }

  async sweep() {
    const now = this.clock.now();
    const todayStart = businessDayRange(this.clock.today()).start;
    return this.db.transaction(async c => {
      // Only one sweep at a time; a concurrent one simply skips.
      if (!(await c.query('SELECT pg_try_advisory_xact_lock(671020) AS ok')).rows[0].ok) return 0;
      // Short limits: the sweep never holds a read waiting on a busy row.
      await c.query("SET LOCAL lock_timeout = '2s'");
      await c.query("SET LOCAL statement_timeout = '10s'");
      let changed = 0;
      const expired = (await c.query(`UPDATE atencion.cita SET estado='vencida',version=version+1
        WHERE estado='solicitada' AND lower(horario)<=$1::timestamptz RETURNING id,paciente_id,version`, [now])).rows;
      changed += await this.announceAppointments(c, expired, 'citas.vencer');

      const reschedules = (await c.query(`UPDATE atencion.reprogramacion r SET estado='vencida',version=r.version+1
        FROM atencion.cita c WHERE c.id=r.cita_id AND r.estado='pendiente'
          AND (lower(r.horario)<=$1::timestamptz OR lower(c.horario)<=$1::timestamptz OR c.estado NOT IN ('solicitada','confirmada'))
        RETURNING r.id,r.cita_id,c.paciente_id,c.version`, [now])).rows;
      if (reschedules.length) {
        await this.commands.audit(c, SYSTEM_ACTOR, { action: 'citas.reprogramacion_vencer', entity: 'reprogramacion', detail: { ids: reschedules.map(r => r.id) } });
        for (const r of reschedules) await this.commands.event(c, 'cita.actualizada', 'cita', r.cita_id, r.version, await this.channels(c, r.paciente_id));
        changed += reschedules.length;
      }

      // #114: when the doctor was marked absent the patient is not at fault; the appointment is cancelled instead.
      const absentClause = `EXISTS (SELECT 1 FROM personal.turno t WHERE t.persona_id=c.medico_id AND t.estado='ausente' AND t.periodo && c.horario)`;
      const doctorAbsent = (await c.query(`UPDATE atencion.cita c SET estado='cancelada',version=version+1
        WHERE c.estado='confirmada' AND lower(c.horario)<$1::timestamptz
          AND NOT atencion.cita_tiene_consulta(c.id) AND ${absentClause}
        RETURNING id,paciente_id,version`, [todayStart])).rows;
      changed += await this.announceAppointments(c, doctorAbsent, 'citas.cancelar_medico_ausente');

      const noShows = (await c.query(`UPDATE atencion.cita c SET estado='no_asistio',version=version+1
        WHERE c.estado='confirmada' AND lower(c.horario)<$1::timestamptz
          AND NOT atencion.cita_tiene_consulta(c.id) AND NOT ${absentClause}
        RETURNING id,paciente_id,version`, [todayStart])).rows;
      changed += await this.announceAppointments(c, noShows, 'citas.no_asistio_automatico');

      const tickets = (await c.query(`UPDATE atencion.ticket_fila t SET
          estado=CASE WHEN t.estado='llamado' AND t.llamados>=coalesce((plataforma.politica_vigente('fila.llamados_para_ausencia',now())->>'llamados')::int,3) THEN 'no_se_presento'
                      WHEN t.estado='en_atencion' AND EXISTS (SELECT 1 FROM atencion.consulta k WHERE k.ticket_id=t.id AND k.estado='firmada') THEN 'atendido'
                      ELSE 'cerrado' END,
          version=version+1
        WHERE t.fecha<$1::date AND t.estado IN ('en_espera','llamado','en_atencion')
          -- A consultation still open across days (m-22) keeps its number in attention; signing it closes the number.
          AND NOT EXISTS (SELECT 1 FROM atencion.consulta k WHERE k.ticket_id=t.id AND k.estado='abierta')
        RETURNING id,paciente_id,estado,version`, [this.clock.today()])).rows;
      if (tickets.length) {
        await this.commands.audit(c, SYSTEM_ACTOR, { action: 'fila.cierre_del_dia', entity: 'ticket_fila', detail: { ids: tickets.map(t => t.id), states: tickets.map(t => t.estado) } });
        for (const t of tickets) await this.commands.event(c, 'fila.actualizada', 'ticket_fila', t.id, t.version, await channelsFor(c, ['fila.ver', 'fila.llamar', 'fila.gestionar'], { users: [t.paciente_id ? await patientAccount(c, t.paciente_id) : null] }));
        changed += tickets.length;
      }
      return changed;
    });
  }

  private async channels(c: PoolClient, patientId: string) {
    return channelsFor(c, ['citas.ver'], { excludeContexts: ['propio'], users: [await patientAccount(c, patientId)] });
  }

  private async announceAppointments(c: PoolClient, rows: Array<{ id: string; paciente_id: string; version: number }>, action: string) {
    if (!rows.length) return 0;
    await this.commands.audit(c, SYSTEM_ACTOR, { action, entity: 'cita', detail: { ids: rows.map(r => r.id), patientIds: [...new Set(rows.map(r => r.paciente_id))] } });
    for (const r of rows) await this.commands.event(c, 'cita.actualizada', 'cita', r.id, r.version, await this.channels(c, r.paciente_id));
    return rows.length;
  }
}
