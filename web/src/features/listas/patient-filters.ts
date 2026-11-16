import type { AccessProfile } from '../../lib/api';

/** Filtros de la lista de pacientes; viajan en la dirección (`#/pacientes?situacion=hospitalizado`) y el servidor los aplica. */
export type PatientFilters = { estado: string; situacion: string; area: string; medico: string };
export const patientFilterDefaults: PatientFilters = { estado: 'vigente', situacion: '', area: '', medico: '' };

export const patientStateOptions = [
  { value: 'vigente', label: 'Vigentes' }, { value: 'provisional', label: 'Provisionales' },
  { value: 'inactivo', label: 'Inactivos' }, { value: 'todos', label: 'Todos' },
] as const;

type Situation = { value: string; label: string; chip: string; empty: string; permission: string };
const situations: Situation[] = [
  { value: 'hospitalizado', label: 'Hospitalizados', chip: 'Hospitalizados', empty: 'No hay pacientes hospitalizados con estos filtros.', permission: 'admision.ver' },
  { value: 'pendiente_cama', label: 'Esperan cama', chip: 'Esperan cama', empty: 'Ninguna admisión espera cama con estos filtros.', permission: 'admision.ver' },
  { value: 'alta_firmada', label: 'Con alta firmada', chip: 'Con alta firmada', empty: 'Nadie tiene el alta firmada pendiente de salida con estos filtros.', permission: 'admision.ver' },
  { value: 'en_fila', label: 'En la fila de hoy', chip: 'En la fila de hoy', empty: 'Nadie está en la fila de hoy con estos filtros.', permission: 'fila.ver' },
  { value: 'cita_hoy', label: 'Con cita hoy', chip: 'Con cita hoy', empty: 'Nadie tiene cita hoy con estos filtros.', permission: 'citas.ver' },
];

/** El servidor solo acepta filtrar por atención con el permiso del dominio en alcance global (`x`); la UI no ofrece los demás. */
export const canGlobally = (profile: AccessProfile, code: string) => profile.permissions.some(p => p.code === code && p.context === 'x');
export const situationOptions = (profile: AccessProfile) => situations.filter(s => canGlobally(profile, s.permission));
/** Área de la cama y médico tratante salen de la admisión activa: mismo permiso que la situación de hospitalización. */
export const canFilterAdmissions = (profile: AccessProfile) => canGlobally(profile, 'admision.ver');

/** Mismo criterio que el servidor (`estado` de `GET /pacientes`), para los candidatos de la constancia de búsqueda. */
export const matchesPatientState = (state: string, filter: string) =>
  filter === 'todos' || !filter ? true : filter === 'vigente' ? state === 'provisional' || state === 'activo' : state === filter;

export function patientListPath(filters: PatientFilters, typed: string) {
  const params = new URLSearchParams({ limit: '50' });
  if (typed) params.set('query', typed);
  if (filters.estado && filters.estado !== 'todos') params.set('estado', filters.estado);
  if (filters.situacion) params.set('situacion', filters.situacion);
  if (filters.area) params.set('areaId', filters.area);
  if (filters.medico) params.set('medicoId', filters.medico);
  return `/pacientes?${params}`;
}

/** Vacío por filtro: dice qué filtro dejó la lista vacía en lugar de un «sin resultados» genérico. */
export function patientEmptyState(filters: PatientFilters, names: { area?: string; medico?: string }) {
  const situation = situations.find(s => s.value === filters.situacion);
  if (situation) return { title: 'Sin pacientes en esta situación', description: `${situation.empty} Quita un filtro para ampliar la lista.` };
  if (filters.area) return { title: 'Sin pacientes en esta área', description: `Nadie ocupa hoy una cama en ${names.area ?? 'el área elegida'}. Quita el filtro de área para ver a todos.` };
  if (filters.medico) return { title: 'Sin pacientes de este médico', description: `${names.medico ?? 'El médico elegido'} no es tratante de ninguna admisión activa con estos filtros.` };
  if (filters.estado === 'provisional') return { title: 'Sin expedientes provisionales', description: 'No hay pacientes con identidad por confirmar que coincidan con la búsqueda.' };
  if (filters.estado === 'inactivo') return { title: 'Sin expedientes inactivos', description: 'Ningún expediente inactivo coincide con la búsqueda.' };
  return { title: 'No hay coincidencias', description: 'Revisa la búsqueda y también los registros inactivos antes de crear un expediente.' };
}

export const situationChip = (value: string) => situations.find(s => s.value === value)?.chip ?? value;
export const stateChip = (value: string) => patientStateOptions.find(s => s.value === value)?.label ?? value;
