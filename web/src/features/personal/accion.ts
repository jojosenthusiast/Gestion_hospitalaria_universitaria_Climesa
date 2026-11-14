import { useCallback, useEffect, useState } from 'react';

/** `?accion=<verbo>` del hash (`#/personal?accion=invitar`): los tableros abren acciones reales de un módulo con él. */
export const readQuickAction = (): string | null => {
  const query = location.hash.split('?')[1];
  return query ? new URLSearchParams(query).get('accion') : null;
};

/**
 * Devuelve la acción rápida pedida en la dirección y una función para consumirla: al consumirla se quita el
 * parámetro del hash (sin recargar) para que volver atrás o refrescar no reabra el formulario.
 */
export function useQuickAction(): [string | null, () => void] {
  const [action, setAction] = useState<string | null>(readQuickAction);
  useEffect(() => {
    const sync = () => setAction(readQuickAction());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const consume = useCallback(() => {
    setAction(null);
    if (readQuickAction()) history.replaceState(null, '', location.hash.split('?')[0] || '#/');
  }, []);
  return [action, consume];
}
