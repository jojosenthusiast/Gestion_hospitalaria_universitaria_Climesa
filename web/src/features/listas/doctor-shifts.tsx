import { useState } from 'react';
import { SearchPicker, type PickerItem } from '../../components/search-picker';
import { ChipGroup } from './chips';

/** Chip of a doctor picker: only the doctors with a shift that day (default) or every doctor. */
export type ShiftFilter = 'con_turno' | 'todos';

/**
 * Owner rules R1-R3 for every doctor picker (Agendar cita, Asignar solicitud, Ingreso): doctors with a shift first,
 * each with its «Con turno» badge; the ones without a shift after them with their reason as a closed badge.
 * A row is "on shift" when it is not `disabled`. Order inside each group is kept (alphabetical or suggested first).
 */
export function orderByShift(items: PickerItem[]): PickerItem[] {
  const tagged = items.map(item => ({ ...item, status: item.disabled ? 'cerrado' : 'disponible', statusLabel: item.disabled ? item.reason ?? 'Sin turno' : 'Con turno' }));
  return [...tagged.filter(item => !item.disabled), ...tagged.filter(item => item.disabled)];
}

/** «Con turno» with nobody on shift would show an empty list: the picker falls back to «Todos». */
export const effectiveShiftFilter = (filter: ShiftFilter, items: PickerItem[]): ShiftFilter =>
  filter === 'con_turno' && items.length > 0 && items.every(item => item.disabled) ? 'todos' : filter;

/** Rows to show for `filter`, already ordered and tagged. */
export function visibleByShift(items: PickerItem[], filter: ShiftFilter): PickerItem[] {
  const ordered = orderByShift(items);
  return effectiveShiftFilter(filter, items) === 'todos' ? ordered : ordered.filter(item => !item.disabled);
}

type Props = { label: string; value: PickerItem | null; onChange: (item: PickerItem | null) => void; items: PickerItem[]; required?: boolean; disabled?: boolean; emptyText?: string; hint?: string };

/** SearchPicker of doctors with the «Con turno (N)» / «Todos» chips above it (R2: the chip wears the available badge). */
export function DoctorShiftPicker({ label, value, onChange, items, required, disabled, emptyText, hint }: Props) {
  const [filter, setFilter] = useState<ShiftFilter>('con_turno');
  const shown = effectiveShiftFilter(filter, items);
  const onShift = items.filter(item => !item.disabled).length;
  return <div className="doctor-shift-picker">
    {!value && items.length > 0 && <ChipGroup label={`Filtrar ${label.toLowerCase()}`} value={shown} onChange={setFilter}
      options={[{ value: 'con_turno', label: 'Con turno', count: onShift, status: 'disponible' }, { value: 'todos', label: 'Todos', count: items.length }]} />}
    <SearchPicker label={label} value={value} onChange={onChange} items={visibleByShift(items, filter)} required={required} disabled={disabled} emptyText={emptyText} hint={hint} />
  </div>;
}
