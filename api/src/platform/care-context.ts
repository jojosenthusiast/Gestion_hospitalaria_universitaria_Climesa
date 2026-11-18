import { Actor, contextsOf } from './actor';
import { businessDate, businessDayRange } from './clock';

type Queryable = { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> };
const ACTIVE_ADMISSION = "('pendiente_cama','hospitalizado','alta_firmada')";

const idsOf = async (c: Queryable, sql: string, values: unknown[]) => new Set((await c.query(sql, values)).rows.map(r => r.id as string));

/**
 * MA-SEG-07 care context for vital signs (`PatientVitalsService`): which of `patientIds` the actor attends now. Any of: an
 * active care relationship of the actor; an open consultation or one started today; a current admission; an ambulance
 * service in progress or of today; or activity of the patient in the hospital today (queue number, appointment, vitals take).
 * The selector (S1 `careContext`) uses this same rule so a picker never offers a patient the vitals POST refuses.
 */
export async function careContextPatients(c: Queryable, staffId: string | null, patientIds: string[], now: Date): Promise<Set<string>> {
  if (!patientIds.length) return new Set();
  const today = businessDate(now), { start, end } = businessDayRange(today);
  return idsOf(c, `SELECT paciente_id AS id FROM atencion.relacion_atencion WHERE paciente_id=ANY($1::uuid[]) AND profesional_id=$2 AND vigencia @> $3::timestamptz
      UNION SELECT paciente_id FROM atencion.consulta WHERE paciente_id=ANY($1::uuid[]) AND (estado='abierta' OR iniciada_en >= $4)
      UNION SELECT paciente_id FROM hospitalizacion.admision WHERE paciente_id=ANY($1::uuid[]) AND estado IN ${ACTIVE_ADMISSION}
      UNION SELECT paciente_id FROM ambulancia.servicio WHERE paciente_id=ANY($1::uuid[]) AND (finalizado_en IS NULL OR finalizado_en >= $4)
      UNION SELECT paciente_id FROM atencion.ticket_fila WHERE paciente_id=ANY($1::uuid[]) AND fecha=$6::date
      UNION SELECT paciente_id FROM atencion.cita WHERE paciente_id=ANY($1::uuid[]) AND estado IN ('confirmada','atendida') AND horario && tstzrange($4,$5,'[)')
      UNION SELECT paciente_id FROM atencion.signos_vitales WHERE paciente_id=ANY($1::uuid[]) AND tomado_en >= $4`, [patientIds, staffId, now, start, end, today]);
}

/**
 * Clinical-history access (`ClinicalHistoryService`, privacidad.md §2): which of `patientIds` the actor may open with
 * `expediente.ver`. Context `relacion`: a care relationship in force, an open consultation of the actor or a current
 * admission where the actor is the attending doctor. Context `propio_revisado`: the actor's own record.
 * S2 `careRelation` on patient search uses this same rule.
 */
export async function careRelationPatients(c: Queryable, actor: Pick<Actor, 'permissions' | 'staffId' | 'patientId'>, patientIds: string[], now: Date): Promise<Map<string, 'relacion' | 'propio'>> {
  const contexts = contextsOf(actor, 'expediente.ver');
  const result = new Map<string, 'relacion' | 'propio'>();
  if (!patientIds.length) return result;
  if (actor.staffId && contexts.includes('relacion')) {
    for (const id of await idsOf(c, `SELECT paciente_id AS id FROM atencion.relacion_atencion WHERE paciente_id=ANY($1::uuid[]) AND profesional_id=$2 AND vigencia @> $3::timestamptz
        UNION SELECT paciente_id FROM atencion.consulta WHERE paciente_id=ANY($1::uuid[]) AND medico_id=$2 AND estado='abierta'
        UNION SELECT paciente_id FROM hospitalizacion.admision WHERE paciente_id=ANY($1::uuid[]) AND medico_tratante_id=$2 AND estado IN ${ACTIVE_ADMISSION}`, [patientIds, actor.staffId, now])) result.set(id, 'relacion');
  }
  if (actor.patientId && contexts.includes('propio_revisado') && patientIds.includes(actor.patientId) && !result.has(actor.patientId)) result.set(actor.patientId, 'propio');
  return result;
}

/**
 * R7 C-5 (D-5): the actor may record an external result without an order for the patient
 * (`POST /laboratorio/pacientes/{id}/resultado-externo`): an active doctor with a care relationship in force or the
 * attending doctor of the active admission. Used by the POST and by S4 `allowedActions`, which also asks for
 * `externalResultConsultation` (without it the POST answers 409 `sin_consulta`).
 */
export async function externalResultRelation(c: Queryable, staffId: string, patientId: string, now: Date) {
  return (await c.query(`SELECT 1 FROM personal.persona d WHERE d.id=$2 AND d.tipo='medico' AND d.activo AND (
      EXISTS (SELECT 1 FROM atencion.relacion_atencion r WHERE r.paciente_id=$1 AND r.profesional_id=$2 AND r.vigencia @> $3::timestamptz)
      OR EXISTS (SELECT 1 FROM hospitalizacion.admision a WHERE a.paciente_id=$1 AND a.medico_tratante_id=$2 AND a.estado IN ${ACTIVE_ADMISSION}))`, [patientId, staffId, now])).rows.length > 0;
}

/** The consultation an external result hangs from: the doctor's latest open or signed consultation with the patient. */
export async function externalResultConsultation(c: Queryable, staffId: string, patientId: string): Promise<string | null> {
  return (await c.query(`SELECT id FROM atencion.consulta WHERE paciente_id=$1 AND medico_id=$2 AND estado IN ('abierta','firmada')
    ORDER BY iniciada_en DESC LIMIT 1`, [patientId, staffId])).rows[0]?.id ?? null;
}
