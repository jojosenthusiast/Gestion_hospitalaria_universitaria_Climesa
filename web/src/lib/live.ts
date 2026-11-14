import { useEffect, useRef, useState } from 'react';
import type { AccessProfile, Api } from './api';
import { supabase } from './supabase';

export type ConnectionStatus = 'live' | 'offline' | 'reconnecting';

/** Los eventos que llegan juntos (varios canales, una ráfaga) se agrupan en una sola invalidación. */
export const INVALIDATION_BATCH_MS = 150;

/**
 * WEB-01: invalidación por entidad. `counts` lleva un contador por `entidad` y por `entidad:id`
 * (`entidad:*` si el evento no trae id); `any` sube con cualquier evento. Cada lectura (`useData`)
 * depende solo de los contadores de las entidades que le afectan (`features/live-scope.ts`).
 */
export type LiveSignal = { any: number; counts: Readonly<Record<string, number>> };

// Tiempo real sin sondeo (regla 9 de AGENTS.md): los cambios llegan por Realtime. Cada lote de
// eventos sube, una vez, los contadores de las entidades que cambiaron (`signal`), y cada vista
// vuelve a pedir solo lo afectado. `version` sube solo al (re)unirse a los canales o tras la
// recuperación: entonces se invalidan todas las vistas, porque pudo perderse cualquier evento.
// Solo hay UNA consulta a /eventos, la de recuperación, y únicamente tras una caída: cuando un
// canal vuelve a estar suscrito o cuando el navegador recupera la red. Nunca por reloj.
// El temporizador de abajo no sondea: solo espera a que termine una ráfaga de eventos ya recibidos.
export function useLive(api: Api, profile: AccessProfile, token: string, refreshProfile: () => void) {
  const [version, setVersion] = useState(0);
  const [signal, setSignal] = useState<LiveSignal>({ any: 0, counts: {} });
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>(() => (navigator.onLine ? 'reconnecting' : 'offline'));

  // Lo que cambia sin que los canales deban rehacerse (token renovado, api nueva) se lee desde refs.
  const latest = useRef({ api, token, refreshProfile });
  latest.current = { api, token, refreshProfile };
  const applied = useRef(token);
  // `publico` es el canal de la pantalla sin sesión; el portal no lo usa, así que no se une a él.
  const names = profile.channels.filter(name => name !== 'publico');
  const key = names.join('|');

  useEffect(() => {
    let closed = false, catching = false, wasDown = false, cursor = '0', pending: ReturnType<typeof setTimeout> | undefined;
    const channels: ReturnType<NonNullable<typeof supabase>['channel']>[] = [], joined = new Set<string>();
    const allJoined = () => names.length > 0 && joined.size === names.length;
    // Sin claves: invalida todo (unión de canal, recuperación). Con claves: solo esas entidades.
    let pendingAll = false;
    const pendingKeys = new Set<string>();
    const flush = () => {
      pending = undefined;
      if (closed) return;
      const keys = [...pendingKeys], all = pendingAll;
      pendingKeys.clear();
      pendingAll = false;
      if (all) setVersion(v => v + 1);
      if (keys.length) setSignal(s => {
        const counts = { ...s.counts };
        for (const k of keys) counts[k] = (counts[k] ?? 0) + 1;
        return { any: s.any + 1, counts };
      });
      setUpdatedAt(new Date());
    };
    const invalidate = (keys?: string[]) => {
      if (closed) return;
      if (keys) for (const k of keys) pendingKeys.add(k);
      else pendingAll = true;
      if (pending === undefined) pending = setTimeout(flush, INVALIDATION_BATCH_MS);
    };
    const keysOf = (payload: { entidad?: unknown; id?: unknown } | undefined) => {
      const entity = typeof payload?.entidad === 'string' ? payload.entidad : undefined;
      if (!entity) return undefined;
      return [entity, `${entity}:${payload?.id ? String(payload.id) : '*'}`];
    };

    // Recuperación: pide lo que pasó mientras no hubo conexión, invalida y refresca el perfil si
    // cambió una cuenta de usuario. Si falla, queda pendiente para la próxima reconexión.
    async function catchUp() {
      if (closed || catching) return;
      catching = true;
      wasDown = false;
      try {
        const result = await latest.current.api.request<{ cursor: string; events: { entity: string }[] }>(`/eventos?after=${encodeURIComponent(cursor)}`);
        if (closed) return;
        cursor = String(result.cursor);
        invalidate();
        if (result.events.some(e => e.entity === 'usuario')) latest.current.refreshProfile();
        setStatus(allJoined() ? 'live' : navigator.onLine ? 'reconnecting' : 'offline');
      } catch {
        if (closed) return;
        wasDown = true;
        setStatus(navigator.onLine ? 'reconnecting' : 'offline');
      } finally {
        catching = false;
      }
    }

    const offline = () => { wasDown = true; setStatus('offline'); };
    const online = () => { setStatus(allJoined() ? 'live' : 'reconnecting'); latest.current.refreshProfile(); void catchUp(); };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);

    if (supabase) {
      const client = supabase;
      void client.realtime.setAuth(latest.current.token).then(() => {
        if (closed) return;
        for (const name of names) {
          const channel = client.channel(name, { config: { private: true } })
            .on('broadcast', { event: '*' }, message => {
              // Un evento sin entidad conocida no se puede acotar: invalida todo, como antes.
              invalidate(keysOf(message.payload));
              if (message.payload?.entidad === 'usuario') latest.current.refreshProfile();
            })
            .subscribe(state => {
              if (closed) return;
              if (state === 'SUBSCRIBED') {
                joined.add(name);
                invalidate();
                if (wasDown) void catchUp();
                else setStatus(allJoined() ? 'live' : 'reconnecting');
              } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(state)) {
                joined.delete(name);
                wasDown = true;
                setStatus(navigator.onLine ? 'reconnecting' : 'offline');
              }
            });
          channels.push(channel);
        }
      }).catch(() => { if (!closed) { wasDown = true; setStatus(navigator.onLine ? 'reconnecting' : 'offline'); } });
    }

    return () => {
      closed = true;
      if (pending !== undefined) clearTimeout(pending);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      for (const channel of channels) void supabase?.removeChannel(channel);
    };
  }, [key]);

  // S10: al renovarse el token, los canales ya unidos reciben el nuevo sin volver a unirse
  // (setAuth reenvía `access_token` a cada canal) y los que se unan después lo usan también.
  useEffect(() => {
    if (applied.current === token) return;
    applied.current = token;
    void Promise.resolve(supabase?.realtime.setAuth(token)).catch(() => undefined);
  }, [token]);

  return { version, signal, status, updatedAt };
}
