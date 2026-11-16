import { ForbiddenException } from '@nestjs/common';
import { Actor, contextsOf } from '../platform/actor';

/** Filtros de la lista de pacientes que dependen de la atención de hoy (no de los datos del expediente). */
export type PatientListFilters = { estado?: string; situacion?: string; areaId?: string; medicoId?: string };

const ACTIVE_ADMISSION = "('pendiente_cama','hospitalizado','alta_firmada')";

/**
 * Filtrar por situación revela algo de la atención del paciente aunque la fila solo lleve datos mínimos, así que cada filtro
 * exige el permiso de lectura de ese dominio con alcance global (`x`): hospitalización con `admision.ver`, la fila con
 * `fila.ver` y las citas con `citas.ver`. Un permiso por área, relación o propio no basta para filtrar todo el hospital.
 */
export function requiredPermissions(filters: PatientListFilters): string[] {
  const needed = new Set<string>();
  if (filters.areaId || filters.medicoId || ['hospitalizado', 'pendiente_cama', 'alta_firmada'].includes(filters.situacion ?? '')) needed.add('admision.ver');
  if (filters.situacion === 'en_fila') needed.add('fila.ver');
  if (filters.situacion === 'cita_hoy') needed.add('citas.ver');
  return [...needed];
}

export function assertListFilters(actor: Pick<Actor, 'permissions'>, filters: PatientListFilters) {
  const missing = requiredPermissions(filters).filter(code => !contextsOf(actor, code).includes('x'));
  if (missing.length) throw new ForbiddenException('Tu rol no puede filtrar pacientes por su atención de hoy.');
}

/**
 * Condiciones SQL adicionales con parámetros numerados desde `first`. `today` es el día local (America/El_Salvador) y
 * `now` el instante actual: la cama cuenta si su ocupación cubre este instante.
 */
export function listFilterSql(filters: PatientListFilters, first: number, today: string, now: Date): { sql: string; params: unknown[] } {
  const parts: string[] = [], params: unknown[] = [];
  const param = (value: unknown) => { params.push(value); return `$${first + params.length - 1}`; };
  const dayRange = () => { const day = param(today); return `tstzrange((${day}::date)::timestamp AT TIME ZONE 'America/El_Salvador',(${day}::date+1)::timestamp AT TIME ZONE 'America/El_Salvador','[)')`; };
  if (filters.estado === 'vigente') parts.push("p.estado IN ('provisional','activo')");
  else if (filters.estado) parts.push(`p.estado=${param(filters.estado)}`);
  switch (filters.situacion) {
    case 'hospitalizado': case 'pendiente_cama': case 'alta_firmada':
      parts.push(`EXISTS(SELECT 1 FROM hospitalizacion.admision a WHERE a.paciente_id=p.id AND a.estado=${param(filters.situacion)})`); break;
    case 'en_fila':
      parts.push(`EXISTS(SELECT 1 FROM atencion.ticket_fila t WHERE t.paciente_id=p.id AND t.fecha=${param(today)}::date AND t.estado IN ('en_espera','llamado','en_atencion'))`); break;
    case 'cita_hoy':
      parts.push(`EXISTS(SELECT 1 FROM atencion.cita k WHERE k.paciente_id=p.id AND k.estado IN ('solicitada','confirmada','atendida') AND k.horario && ${dayRange()})`); break;
  }
  if (filters.medicoId) parts.push(`EXISTS(SELECT 1 FROM hospitalizacion.admision a WHERE a.paciente_id=p.id AND a.estado IN ${ACTIVE_ADMISSION} AND a.medico_tratante_id=${param(filters.medicoId)})`);
  if (filters.areaId) {
    const area = param(filters.areaId), at = param(now);
    parts.push(`EXISTS(SELECT 1 FROM hospitalizacion.admision a JOIN hospitalizacion.ocupacion_cama o ON o.admision_id=a.id WHERE a.paciente_id=p.id AND a.estado IN ('hospitalizado','alta_firmada') AND o.periodo @> ${at}::timestamptz
        AND EXISTS(WITH RECURSIVE up AS (SELECT id,padre_id FROM infra.espacio WHERE id=o.habitacion_id UNION ALL SELECT e.id,e.padre_id FROM infra.espacio e JOIN up ON e.id=up.padre_id) SELECT 1 FROM up WHERE id=${area}::uuid))`);
  }
  return { sql: parts.map(part => ` AND ${part}`).join(''), params };
}
