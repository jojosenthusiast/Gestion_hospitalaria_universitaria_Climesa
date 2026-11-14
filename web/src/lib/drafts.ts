import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

/**
 * Local drafts of long forms that are not saved in the API yet (consultation notes, diagnosis or prescription being
 * typed). They live only in this browser, keyed by the signed-in user and the record, so another account never reads
 * them; signing out removes every draft. `localStorage` may be missing or full (private mode, quota): every access is
 * guarded and a failed save is reported so the form can warn before leaving.
 */
const PREFIX = 'climesa:borrador:';

export const draftKey = (userId: string, key: string) => `${PREFIX}${userId}:${key}`;

export function loadDraft<T>(userId: string, key: string): T | null {
  try {
    const text = window.localStorage.getItem(draftKey(userId, key));
    return text ? JSON.parse(text) as T : null;
  } catch { return null; }
}

/** Returns false when the browser refused to store the draft. */
export function saveDraft<T>(userId: string, key: string, value: T): boolean {
  try { window.localStorage.setItem(draftKey(userId, key), JSON.stringify(value)); return true; } catch { return false; }
}

export function clearDraft(userId: string, key: string) {
  try { window.localStorage.removeItem(draftKey(userId, key)); } catch { /* nothing stored */ }
}

/** Removes the drafts of every account kept in this browser (sign-out). */
export function clearAllDrafts() {
  try {
    const storage = window.localStorage;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index++) { const key = storage.key(index); if (key?.startsWith(PREFIX)) keys.push(key); }
    keys.forEach(key => storage.removeItem(key));
  } catch { /* storage unavailable: nothing to clear */ }
}

try { supabase?.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') clearAllDrafts(); }); } catch { /* auth not configured */ }

export type DraftStatus = 'guardado' | 'sin_guardar' | null;

/**
 * Keeps [values] as a local draft while they differ from [baseline] (what the API already has) and removes it when
 * they match again. `restored` is the draft found when the form opened; `status` says whether the latest changes are
 * stored locally (`guardado`) or could not be (`sin_guardar`).
 */
export function useLocalDraft<T extends Record<string, unknown>>(userId: string, key: string | null, values: T, baseline: Partial<T>, enabled = true) {
  const [status, setStatus] = useState<DraftStatus>(null);
  const restored = useRef<T | null>(key && enabled ? loadDraft<T>(userId, key) : null);
  const dirty = isDirty(values, baseline);
  const serialized = JSON.stringify(values);
  useEffect(() => {
    if (!key || !enabled) return;
    if (!dirty) { clearDraft(userId, key); setStatus(null); return; }
    setStatus(saveDraft(userId, key, values) ? 'guardado' : 'sin_guardar');
    // `serialized` stands for `values`, which is a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key, enabled, dirty, serialized]);
  return { restored: restored.current, status, dirty, clear: () => { if (key) clearDraft(userId, key); setStatus(null); } };
}

/** A field counts as changed when it is not empty and differs from the baseline (missing baseline = empty). */
export function isDirty<T extends Record<string, unknown>>(values: T, baseline: Partial<T>) {
  return Object.entries(values).some(([field, value]) => {
    const base = baseline[field as keyof T] ?? (typeof value === 'boolean' ? false : '');
    return value !== base;
  });
}
