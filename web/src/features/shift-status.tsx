import { useEffect, useRef } from 'react';
import { Icon } from '../components/ui';
import { NO_ACTIVE_SHIFT_TEXT, type Api } from '../lib/api';
import { formatShortDateTime, formatTime, joinParts } from '../lib/format';
import { useData } from './common';

/** A shift window of `GET /me/turno-activo` (`shift` or `next`). */
export type ShiftWindow = { id: string; start: string; end: string; area: string | null; state: string };
/**
 * Lote 5 S9, `GET /me/turno-activo`: whether the account works by shifts (`required`) and may run operational commands now
 * (`active`). The API is the guarantee (403 `sin_turno_activo`); the banner only tells the person before they try.
 */
export type ActiveShift = { required: boolean; active: boolean; graceMinutes?: number; shift?: ShiftWindow | null; next?: ShiftWindow | null; message?: string | null };

export const SHIFT_BANNER_TITLE = 'Sin turno activo: puedes consultar pero no registrar.';
export { NO_ACTIVE_SHIFT_TEXT };

/** Same rule as Android (`ShiftGate.showsBanner`): only an account that works by shifts and has none now. */
export const showsShiftBanner = (status: unknown): status is ActiveShift =>
  !!status && typeof status === 'object' && (status as ActiveShift).required === true && (status as ActiveShift).active === false;

/** «Próximo turno: Mañana 07:00 a 15:00 · Consulta externa»; null without a published next shift. */
export function nextShiftText(next: ShiftWindow | null | undefined, now: Date = new Date()) {
  if (!next?.start || !next.end || Number.isNaN(Date.parse(next.start))) return null;
  return `Próximo turno: ${joinParts(`${formatShortDateTime(next.start, now)} a ${formatTime(next.end)}`, next.area)}`;
}

/**
 * The compact band under the header. It reads the state when the app loads, on every reconnection (`version`) and when
 * the window gets the focus back (a shift may have started meanwhile); never on a timer. An older API without the
 * endpoint (404) or any failed read shows nothing: the API still refuses the write with its own message.
 */
export function ShiftStatusBanner({ api, version = 0 }: { api: Api; version?: number }) {
  const status = useData<ActiveShift>(api, '/me/turno-activo', version);
  const refresh = useRef(status.refresh);
  refresh.current = status.refresh;
  useEffect(() => {
    const onFocus = () => refresh.current();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  if (status.error || !showsShiftBanner(status.data)) return null;
  const next = nextShiftText(status.data.next);
  return <div className="shift-band" role="status">
    <Icon name="clock" size={18} />
    <p><strong>{SHIFT_BANNER_TITLE}</strong>{next && <span>{next}</span>}</p>
  </div>;
}
