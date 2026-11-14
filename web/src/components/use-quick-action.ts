import { useEffect, useRef } from 'react';

/**
 * Acción rápida del tablero: `#/pacientes?accion=registrar` abre el formulario del módulo.
 * Se atiende una vez (al abrir el módulo o si el hash cambia con la pantalla ya abierta) y el parámetro se borra del hash.
 */
export function useQuickAction(verb: string, onTrigger: () => void, enabled = true) {
  const handler = useRef(onTrigger);
  handler.current = onTrigger;
  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const [route, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
      const params = new URLSearchParams(query);
      if (params.get('accion') !== verb) return;
      params.delete('accion');
      const rest = params.toString();
      history.replaceState(null, '', `${location.pathname}${location.search}#/${route}${rest ? `?${rest}` : ''}`);
      handler.current();
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, [verb, enabled]);
}
