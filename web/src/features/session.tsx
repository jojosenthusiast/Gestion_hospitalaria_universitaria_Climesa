import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/ui';
import { Dialog } from './common';

/** Por privacidad la sesión se cierra a los 15 minutos sin actividad; se avisa 2 minutos antes (WEB-04, diseño 04 «Sesión por vencer»). */
export const IDLE_LIMIT_MS = 15 * 60_000;
export const IDLE_WARNING_MS = 2 * 60_000;
const ACTIVITY = ['pointerdown', 'keydown', 'scroll'] as const;

// Not polling: the timers only measure local inactivity, no request is made. While the warning is
// visible the check runs every second so the countdown moves; otherwise every 15 seconds.
export function useIdleSession(onExpired: () => void) {
  const last = useRef(Date.now()), expire = useRef(onExpired);
  expire.current = onExpired;
  const [remaining, setRemaining] = useState<number | null>(null);
  const warning = remaining !== null;
  useEffect(() => {
    const active = () => { last.current = Date.now(); setRemaining(null); };
    for (const e of ACTIVITY) window.addEventListener(e, active, { passive: true });
    return () => { for (const e of ACTIVITY) window.removeEventListener(e, active); };
  }, []);
  useEffect(() => {
    const check = () => {
      const idle = Date.now() - last.current;
      // Expire once: the portal signs out and unmounts; a new activity starts a new count.
      if (idle >= IDLE_LIMIT_MS) { last.current = Date.now(); setRemaining(null); expire.current(); }
      else if (idle >= IDLE_LIMIT_MS - IDLE_WARNING_MS) setRemaining(IDLE_LIMIT_MS - idle);
      else setRemaining(null);
    };
    const timer = setInterval(check, warning ? 1000 : 15_000);
    return () => clearInterval(timer);
  }, [warning]);
  return { remaining, keepAlive: () => { last.current = Date.now(); setRemaining(null); } };
}

const countdown = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function SessionExpiryWarning({ remaining, onContinue, onLogout }: { remaining: number | null; onContinue: () => void; onLogout: () => void }) {
  if (remaining === null) return null;
  return <Dialog title={`Tu sesión se cierra en ${countdown(remaining)}`} onClose={onContinue}>
    <div className="module-form session-warning">
      <p>Por privacidad, la sesión se cierra a los 15 minutos sin actividad. Lo que guardaste no se pierde.</p>
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onLogout}><Icon name="logout" size={18} />Cerrar sesión</button>
        <button type="button" className="primary-button" onClick={onContinue} autoFocus>Seguir trabajando</button>
      </div>
    </div>
  </Dialog>;
}
