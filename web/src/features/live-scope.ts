import { createContext, useContext } from 'react';
import type { LiveSignal } from '../lib/live';

/** The portal provides `useLive().signal`; without a provider (tests, public screen) nothing is scoped. */
export const LiveContext = createContext<LiveSignal>({ any: 0, counts: {} });
export const useLiveSignal = () => useContext(LiveContext);

// WEB-01 (FR-120-04): each read declares which realtime entities make it stale, so an event only
// reloads the data it affects. Entity names are the `entidad` the API writes to the outbox
// (`docs/arquitectura/tiempo-real.md`). A read with an `id` reloads only on events for that id, so
// an open patient record (an audited read, rule 7) is not read again because a bed changed.
// `'*'` keeps the previous behaviour (any event) for reads with no single owner, such as the audit
// log or the metrics. An empty list means "only on reconnection" (catalogues, explicit searches).
export type LiveScope = '*' | { entity: string; id?: string }[];

const of = (...entities: string[]) => entities.map(entity => ({ entity }));
const uuid = '([0-9a-fA-F-]{8,})';

const rules: [RegExp, (match: RegExpMatchArray) => LiveScope][] = [
  [new RegExp(`^/pacientes/${uuid}/historial$`), m => [...of('consulta', 'orden_laboratorio', 'admision'), { entity: 'paciente', id: m[1] }]],
  [new RegExp(`^/pacientes/${uuid}$`), m => [{ entity: 'paciente', id: m[1] }]],
  // A search is a deliberate, audited action: it is not repeated because someone else edited a record.
  [/^\/pacientes\?(.*&)?query=/, () => []],
  [/^\/pacientes(\?|$)/, () => of('paciente', 'caso_duplicado')],
  [/^\/personal(\/|\?|$)/, () => of('personal')],
  [/^\/espacios(\/|\?|$)/, () => of('espacio', 'cama')],
  [/^\/camas(\/|\?|$)/, () => of('cama', 'admision', 'espacio')],
  [/^\/turnos(\/|\?|$)/, () => of('turno', 'personal')],
  [/^\/usuarios(\/|\?|$)/, () => of('usuario', 'personal')],
  [/^\/inicio(\?|$)/, () => of('cama', 'paciente', 'personal', 'usuario', 'turno', 'admision')],
  [/^\/citas(\/|\?|$)/, () => of('cita', 'personal', 'turno')],
  [/^\/consultas(\/|\?|$)/, () => of('consulta', 'cita', 'ticket_fila')],
  [/^\/fila(\/|\?|$)/, () => of('ticket_fila', 'cita', 'consulta')],
  [/^\/laboratorio\/catalogo(\?|$)/, () => []],
  [/^\/laboratorio(\/|\?|$)/, () => of('orden_laboratorio')],
  [new RegExp(`^/admisiones/${uuid}/sugerencias-cama$`), () => of('cama', 'admision')],
  [/^\/admisiones(\/|\?|$)/, () => of('admision', 'cama')],
  [/^\/ambulancia(\/|\?|$)/, () => of('unidad', 'solicitud', 'servicio')],
  [/^\/inventario(\/|\?|$)/, () => of('articulo')],
  [/^\/cuentas\/vinculaciones(\/|\?|$)/, () => of('vinculacion_paciente', 'paciente')],
  [/^\/me\/laboratorio(\?|$)/, () => of('orden_laboratorio')],
  // The auditor reads the log on demand (each read is itself audited): it is refreshed by hand or on reconnection, never by other people's events.
  [/^\/auditoria(\/|\?|$)/, () => []],
  [/^\/publico\/avisos(\?|$)/, () => of('aviso')],
  [/^\/me\/avisos(\?|$)/, () => of('aviso')],
  [/^\/avisos(\?|$)/, () => of('aviso')],
];

export function liveScope(path: string): LiveScope {
  for (const [pattern, scope] of rules) {
    const match = path.match(pattern);
    if (match) return scope(match);
  }
  return '*';
}

/** A number that changes only when an event in `scope` arrives; `useData` uses it as a dependency. */
export function scopedVersion(signal: LiveSignal, scope: LiveScope): number {
  if (scope === '*') return signal.any;
  let total = 0;
  for (const { entity, id } of scope) {
    total += id ? (signal.counts[`${entity}:${id}`] ?? 0) + (signal.counts[`${entity}:*`] ?? 0) : signal.counts[entity] ?? 0;
  }
  return total;
}
