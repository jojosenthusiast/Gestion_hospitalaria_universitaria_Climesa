import { useEffect, useState } from 'react';
import type { AccessProfile, Api } from './api';
import { supabase } from './supabase';

export type ConnectionStatus = 'live' | 'offline' | 'reconnecting';

// Tiempo real sin sondeo (regla 9 de AGENTS.md): los cambios llegan por Realtime y cada evento
// sube `version`, que las vistas usan como dependencia para volver a pedir sus datos.
// Solo hay UNA consulta a /eventos, la de recuperación, y únicamente tras una caída: cuando un
// canal vuelve a estar suscrito o cuando el navegador recupera la red. Nunca por reloj.
export function useLive(api: Api, profile: AccessProfile, token: string, refreshProfile: () => void) {
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<ConnectionStatus>(() => (navigator.onLine ? 'reconnecting' : 'offline'));

  useEffect(() => {
    let closed = false, catching = false, wasDown = false, cursor = '0';
    const channels: ReturnType<NonNullable<typeof supabase>['channel']>[] = [], joined = new Set<string>();
    const allJoined = () => profile.channels.length > 0 && joined.size === profile.channels.length;
    const invalidate = () => { if (!closed) setVersion(v => v + 1); };

    // Recuperación: pide lo que pasó mientras no hubo conexión, invalida y refresca el perfil si
    // cambió una cuenta de usuario. Si falla, queda pendiente para la próxima reconexión.
    async function catchUp() {
      if (closed || catching) return;
      catching = true;
      wasDown = false;
      try {
        const result = await api.request<{ cursor: string; events: { entity: string }[] }>(`/eventos?after=${encodeURIComponent(cursor)}`);
        if (closed) return;
        cursor = String(result.cursor);
        invalidate();
        if (result.events.some(e => e.entity === 'usuario')) refreshProfile();
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
    const online = () => { setStatus(allJoined() ? 'live' : 'reconnecting'); refreshProfile(); void catchUp(); };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);

    if (supabase) {
      const client = supabase;
      void client.realtime.setAuth(token).then(() => {
        if (closed) return;
        for (const name of profile.channels) {
          const channel = client.channel(name, { config: { private: name !== 'publico' } })
            .on('broadcast', { event: '*' }, message => {
              invalidate();
              if (message.payload?.entidad === 'usuario') refreshProfile();
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
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      for (const channel of channels) void supabase?.removeChannel(channel);
    };
  }, [api, profile.channels.join('|'), token, refreshProfile]);

  return { version, status };
}
