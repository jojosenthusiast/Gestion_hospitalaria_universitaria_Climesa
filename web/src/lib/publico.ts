import { useEffect, useRef, useState } from 'react';
import { ApiError, type Api } from './api';
import { supabase } from './supabase';
import { INVALIDATION_BATCH_MS } from './live';

// Spec 112: información pública sin sesión. Tipos escritos a mano (el contrato se regenera al integrar).
export type PublicOccupancy = { actualizadoEn: string; ocupacion: { planta: number | null; categoria: string; camas: number; libres: number; ocupadas: number }[] };
export type PublicDoctors = { actualizadoEn: string; medicos: { nombre: string; especialidad: string; area: string | null; hasta: string }[]; proximoCambio: string | null };
export type PublicNotice = { id: string; titulo: string; cuerpo: string; desde: string; hasta: string; prioridad?: 'atencion' | 'urgente' | 'critico' };
export type PublicNotices = { actualizadoEn: string; avisos: PublicNotice[]; proximoCambio: string | null };
export type PublicQueue = { actualizadoEn: string; servicio: string; fecha: string; llamados: { numero: number; consultorio: string | null; llamados: number }[] };

/** Servicios de la fila con su nombre para la pantalla pública. */
export const publicServices: { id: string; label: string }[] = [
  { id: 'consulta_general', label: 'Consulta general' },
  { id: 'emergencia', label: 'Emergencia' },
  { id: 'laboratorio', label: 'Laboratorio' },
  { id: 'admisiones', label: 'Admisiones' },
];
export const categoryNames: Record<string, string> = { vip: 'VIP', semiprivada: 'Semiprivada' };

const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:3000/api/v1';

/** Cliente sin sesión: nunca envía `Authorization` y solo lee. */
export class PublicApi implements Api {
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try { response = await fetch(base + path, { ...init, cache: 'no-store', headers: { Accept: 'application/json' } }); }
    catch (e) { if (e instanceof DOMException && e.name === 'AbortError') throw e; throw new ApiError('No se pudo conectar. La información se actualizará al volver la conexión.'); }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(body.detail ?? 'No se pudo cargar la información pública.', response.status, typeof body.codigo === 'string' ? body.codigo : undefined);
    return body as T;
  }
  async write<T>(): Promise<T> { throw new ApiError('La pantalla pública no guarda información.'); }
}

/**
 * Tiempo real de la pantalla pública: escucha el canal `publico` (no privado, sin sesión) y sube `version`
 * una vez por lote de eventos; al volver la red o el canal tras una caída, invalida todo. Sin sondeo.
 */
export function usePublicLive() {
  const [version, setVersion] = useState(0);
  const [live, setLive] = useState(false);
  useEffect(() => {
    let closed = false, wasDown = false, pending: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      if (closed || pending !== undefined) return;
      pending = setTimeout(() => { pending = undefined; if (!closed) setVersion(v => v + 1); }, INVALIDATION_BATCH_MS);
    };
    const online = () => invalidate();
    const offline = () => { wasDown = true; setLive(false); };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    const channel = supabase?.channel('publico', { config: { private: false } })
      .on('broadcast', { event: '*' }, () => invalidate())
      .subscribe(state => {
        if (closed) return;
        if (state === 'SUBSCRIBED') { setLive(true); if (wasDown) { wasDown = false; invalidate(); } }
        else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(state)) { wasDown = true; setLive(false); }
      });
    return () => {
      closed = true;
      if (pending !== undefined) clearTimeout(pending);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      if (channel) void supabase?.removeChannel(channel);
    };
  }, []);
  return { version, live };
}

/** Máximo que acepta `setTimeout` (unos 24 días). */
const MAX_DELAY = 2_147_483_647;

/**
 * Una sola recarga en el instante en que la respuesta cambia por el paso del tiempo (`proximoCambio`:
 * vence un aviso o termina un turno). No es sondeo: no se repite si la API no anuncia otro instante.
 */
export function useRefreshAt(instant: string | null | undefined, onDue: () => void) {
  const due = useRef(onDue);
  due.current = onDue;
  useEffect(() => {
    if (!instant) return;
    const delay = new Date(instant).valueOf() - Date.now();
    if (!Number.isFinite(delay)) return;
    const timer = setTimeout(() => due.current(), Math.min(Math.max(delay, 0) + 500, MAX_DELAY));
    return () => clearTimeout(timer);
  }, [instant]);
}
