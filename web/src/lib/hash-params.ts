import { useCallback, useEffect, useState } from 'react';

/** Parámetros de la parte `?…` del hash (`#/pacientes?situacion=hospitalizado`). */
export const readHashParams = (): URLSearchParams => {
  try { return new URLSearchParams(location.hash.split('?')[1] ?? ''); } catch { return new URLSearchParams(); }
};

/**
 * Escribe parámetros en el hash sin recargar ni crear una entrada de historial por tecla. `null` o una cadena vacía
 * quitan el parámetro; los demás (por ejemplo `accion`) se conservan.
 */
export function writeHashParams(updates: Record<string, string | null | undefined>) {
  const [path] = location.hash.split('?');
  const params = readHashParams();
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === '') params.delete(key); else params.set(key, value);
  }
  const query = params.toString();
  const next = `${path || '#/'}${query ? `?${query}` : ''}`;
  if (next !== location.hash) history.replaceState(null, '', next);
}

/**
 * Estado de filtros guardado en la dirección: se puede compartir el enlace, volver atrás y recargar sin perderlos.
 * `defaults` da el valor de cada clave cuando no está en la dirección; el valor por defecto nunca se escribe.
 */
export function useHashFilters<K extends string>(defaults: Record<K, string>): [Record<K, string>, (updates: Partial<Record<K, string>>) => void] {
  const read = useCallback(() => {
    const params = readHashParams();
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, params.get(key) ?? fallback])) as Record<K, string>;
    // `defaults` is a literal per screen; its keys never change while mounted.
  }, []);
  const [values, setValues] = useState<Record<K, string>>(read);
  useEffect(() => {
    const sync = () => setValues(read());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [read]);
  const update = useCallback((updates: Partial<Record<K, string>>) => {
    setValues(current => ({ ...current, ...updates }));
    writeHashParams(Object.fromEntries(Object.entries(updates).map(([key, value]) => [key, value === defaults[key as K] ? null : value as string])));
  }, []);
  return [values, update];
}
