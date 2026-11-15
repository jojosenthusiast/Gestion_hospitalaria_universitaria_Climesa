import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

/**
 * Local drafts of long forms that are not saved in the API yet (consultation notes, diagnosis or prescription being
 * typed). They live only in this browser, keyed by the signed-in user and the record, so another account never reads
 * them; signing out removes every draft. Each draft carries the moment it was saved and expires after
 * `DRAFT_TTL_MS` (12 hours): an expired draft is never returned and every expired draft is purged when this module
 * loads, so clinical text does not linger in a shared browser. `localStorage` may be missing or full (private mode,
 * quota): every access is guarded and a failed save is reported so the form can warn before leaving.
 */
const PREFIX = 'climesa:borrador:';
export const DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

interface StoredDraft<T> { savedAt: number; value: T }

export const draftKey = (userId: string, key: string) => `${PREFIX}${userId}:${key}`;

/** Parses a stored draft; anything without a valid `savedAt` (old format, tampered) counts as expired. */
function readEnvelope<T>(text: string | null, now: number): StoredDraft<T> | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Partial<StoredDraft<T>> | null;
    if (!parsed || typeof parsed.savedAt !== 'number' || !('value' in parsed)) return null;
    if (now - parsed.savedAt >= DRAFT_TTL_MS || parsed.savedAt > now + DRAFT_TTL_MS) return null;
    return parsed as StoredDraft<T>;
  } catch { return null; }
}

function draftKeys(storage: Storage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) { const key = storage.key(index); if (key?.startsWith(PREFIX)) keys.push(key); }
  return keys;
}

export function loadDraft<T>(userId: string, key: string): T | null {
  try {
    const storage = window.localStorage;
    const name = draftKey(userId, key);
    const text = storage.getItem(name);
    const draft = readEnvelope<T>(text, Date.now());
    if (!draft && text !== null) storage.removeItem(name);
    return draft ? draft.value : null;
  } catch { return null; }
}

/** Returns false when the browser refused to store the draft. */
export function saveDraft<T>(userId: string, key: string, value: T): boolean {
  const draft: StoredDraft<T> = { savedAt: Date.now(), value };
  try { window.localStorage.setItem(draftKey(userId, key), JSON.stringify(draft)); return true; } catch { return false; }
}

export function clearDraft(userId: string, key: string) {
  try { window.localStorage.removeItem(draftKey(userId, key)); } catch { /* nothing stored */ }
}

/** Removes the drafts of every account kept in this browser (sign-out). */
export function clearAllDrafts() {
  try {
    const storage = window.localStorage;
    draftKeys(storage).forEach(key => storage.removeItem(key));
  } catch { /* storage unavailable: nothing to clear */ }
}

/** Removes every CLIMESA draft that is expired or unreadable, from any account. */
export function purgeExpiredDrafts(now = Date.now()) {
  try {
    const storage = window.localStorage;
    draftKeys(storage).forEach(key => { if (!readEnvelope(storage.getItem(key), now)) storage.removeItem(key); });
  } catch { /* storage unavailable: nothing to purge */ }
}

purgeExpiredDrafts();
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
