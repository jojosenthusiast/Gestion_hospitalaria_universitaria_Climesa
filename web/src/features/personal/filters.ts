import { roleNames, staffTypeNames, type UserAccount } from '../../lib/api';

/** Filtros del directorio de personal; viajan en la dirección (`#/personal?turno=de_turno`). */
export type StaffFilters = { estado: string; funcion: string; area: string; turno: string; cuenta: string; rol: string };
export const staffFilterDefaults: StaffFilters = { estado: 'activos', funcion: 'todos', area: '', turno: '', cuenta: 'todas', rol: '' };

/** `shiftToday` de `GET /personal`: lo calcula el servidor con los turnos publicados de hoy. */
export const shiftOptions = [
  { value: 'de_turno', label: 'De turno ahora', chip: 'De turno ahora', tone: 'ok' },
  { value: 'mas_tarde', label: 'Turno más tarde', chip: 'Con turno más tarde', tone: 'info' },
  { value: 'ausente', label: 'Ausentes', chip: 'Ausentes hoy', tone: 'warn' },
  { value: 'libre', label: 'Libres', chip: 'Libres hoy', tone: undefined },
] as const;
export const shiftLabel = (value: string) => ({ de_turno: 'De turno ahora', mas_tarde: 'Turno más tarde', ausente: 'Ausente hoy', libre: 'Libre hoy' } as Record<string, string>)[value] ?? value;

export const accountOptions = [
  { value: 'todas', label: 'Con o sin cuenta' }, { value: 'con', label: 'Con cuenta' }, { value: 'activa', label: 'Cuenta activa' },
  { value: 'desactivada', label: 'Cuenta desactivada' }, { value: 'invitacion', label: 'Invitación pendiente' }, { value: 'sin', label: 'Sin cuenta todavía' },
] as const;

export function matchesAccount(account: UserAccount | null, hasStaff: boolean, filter: string) {
  switch (filter) {
    case 'con': return !!account;
    case 'sin': return !account && hasStaff;
    case 'activa': return account?.state === 'activo' && account.invitationState !== 'enviada';
    case 'desactivada': return !!account && account.state !== 'activo';
    case 'invitacion': return account?.invitationState === 'enviada';
    default: return true;
  }
}

const stateChip = (value: string, accountsOnly: boolean) => value === 'todos' ? (accountsOnly ? 'Todas las cuentas' : 'Todo el directorio') : (accountsOnly ? 'Cuentas inactivas' : 'Personal inactivo');

/** Chips de filtros activos (sin el valor por defecto de cada uno). */
export function activeStaffFilters(filters: StaffFilters, names: { accountsOnly: boolean; area?: string }): { key: keyof StaffFilters; label: string }[] {
  const chips: { key: keyof StaffFilters; label: string }[] = [];
  if (filters.estado !== 'activos') chips.push({ key: 'estado', label: stateChip(filters.estado, names.accountsOnly) });
  if (filters.funcion !== 'todos') chips.push({ key: 'funcion', label: staffTypeNames[filters.funcion] ?? filters.funcion });
  if (filters.area) chips.push({ key: 'area', label: filters.area === 'sin_area' ? 'Sin área asignada' : `Área: ${names.area ?? 'elegida'}` });
  if (filters.turno) chips.push({ key: 'turno', label: shiftOptions.find(o => o.value === filters.turno)?.chip ?? filters.turno });
  if (filters.cuenta !== 'todas') chips.push({ key: 'cuenta', label: accountOptions.find(o => o.value === filters.cuenta)?.label ?? filters.cuenta });
  if (filters.rol) chips.push({ key: 'rol', label: `Rol: ${roleNames[filters.rol] ?? filters.rol}` });
  return chips;
}

/** Vacío por filtro: nombra el filtro más específico que dejó la vista sin personas. */
export function staffEmptyState(filters: StaffFilters, context: { accountsOnly: boolean; canCreate: boolean }) {
  const widen = 'Quita un filtro para ampliar el directorio.';
  if (filters.turno === 'de_turno') return { title: 'Nadie de turno ahora', description: `No hay personas con un turno en curso con estos filtros. ${widen}` };
  if (filters.turno === 'mas_tarde') return { title: 'Nadie con turno más tarde', description: `No hay turnos publicados para más tarde hoy con estos filtros. ${widen}` };
  if (filters.turno === 'ausente') return { title: 'Sin ausencias hoy', description: `Nadie tiene una ausencia marcada hoy con estos filtros.` };
  if (filters.turno === 'libre') return { title: 'Nadie libre hoy', description: `Todas las personas de esta vista tienen turno hoy. ${widen}` };
  if (filters.cuenta === 'invitacion') return { title: 'Sin invitaciones pendientes', description: 'Todas las invitaciones de esta vista fueron aceptadas, canceladas o vencieron.' };
  if (filters.cuenta === 'sin') return { title: 'Todos tienen cuenta', description: 'Cada persona de esta vista ya tiene su cuenta de acceso.' };
  if (filters.rol) return { title: 'Nadie con este rol', description: `Ninguna cuenta de esta vista tiene el rol ${roleNames[filters.rol] ?? filters.rol}. ${widen}` };
  if (filters.area) return { title: 'Nadie en esta área', description: `No hay personas asignadas a esta área con estos filtros. ${widen}` };
  return { title: context.accountsOnly ? 'No hay cuentas en esta vista' : 'No hay personas en esta vista', description: `Cambia la búsqueda o los filtros para consultar el directorio.${context.canCreate ? ' Con «Registrar personal» sumas a alguien nuevo.' : ''}` };
}
