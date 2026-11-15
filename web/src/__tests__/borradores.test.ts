import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllDrafts, DRAFT_TTL_MS, draftKey, loadDraft, purgeExpiredDrafts, saveDraft } from '../lib/drafts';

const start = new Date('2026-11-13T15:00:00Z');

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(start); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

describe('borradores locales · vencimiento a las 12 horas', () => {
  it('guarda el momento en que se escribió y devuelve el borrador antes de vencer', () => {
    expect(saveDraft('med-1', 'consulta:cons-1', { physicalExam: 'Abdomen blando' })).toBe(true);
    const stored = JSON.parse(localStorage.getItem(draftKey('med-1', 'consulta:cons-1')) ?? '{}');
    expect(stored.savedAt).toBe(start.getTime());
    vi.setSystemTime(start.getTime() + DRAFT_TTL_MS - 1);
    expect(loadDraft('med-1', 'consulta:cons-1')).toEqual({ physicalExam: 'Abdomen blando' });
  });

  it('un borrador vencido nunca se devuelve y se elimina al leerlo', () => {
    saveDraft('med-1', 'consulta:cons-1', { physicalExam: 'Abdomen blando' });
    vi.setSystemTime(start.getTime() + DRAFT_TTL_MS);
    expect(loadDraft('med-1', 'consulta:cons-1')).toBeNull();
    expect(localStorage.getItem(draftKey('med-1', 'consulta:cons-1'))).toBeNull();
  });

  it('un borrador sin fecha de guardado (formato anterior) cuenta como vencido', () => {
    localStorage.setItem(draftKey('med-1', 'consulta:cons-1'), JSON.stringify({ physicalExam: 'Nota antigua' }));
    expect(loadDraft('med-1', 'consulta:cons-1')).toBeNull();
    expect(localStorage.getItem(draftKey('med-1', 'consulta:cons-1'))).toBeNull();
  });

  it('la purga elimina los borradores vencidos de cualquier cuenta y conserva los vigentes y otras claves', () => {
    saveDraft('med-1', 'consulta:vieja', { physicalExam: 'Vieja' });
    saveDraft('otra-cuenta', 'consulta:vieja', { physicalExam: 'Vieja de otra cuenta' });
    vi.setSystemTime(start.getTime() + DRAFT_TTL_MS - 60_000);
    saveDraft('med-1', 'consulta:nueva', { physicalExam: 'Nueva' });
    localStorage.setItem('otra-app:dato', 'se queda');
    vi.setSystemTime(start.getTime() + DRAFT_TTL_MS);
    purgeExpiredDrafts();
    expect(localStorage.getItem(draftKey('med-1', 'consulta:vieja'))).toBeNull();
    expect(localStorage.getItem(draftKey('otra-cuenta', 'consulta:vieja'))).toBeNull();
    expect(loadDraft('med-1', 'consulta:nueva')).toEqual({ physicalExam: 'Nueva' });
    expect(localStorage.getItem('otra-app:dato')).toBe('se queda');
  });

  it('al iniciar la aplicación se purgan los borradores vencidos', async () => {
    localStorage.setItem(draftKey('med-1', 'consulta:cons-1'), JSON.stringify({ savedAt: start.getTime() - DRAFT_TTL_MS, value: { physicalExam: 'Vencida' } }));
    localStorage.setItem(draftKey('med-1', 'consulta:cons-2'), JSON.stringify({ savedAt: start.getTime(), value: { physicalExam: 'Vigente' } }));
    vi.resetModules();
    await import('../lib/drafts');
    expect(localStorage.getItem(draftKey('med-1', 'consulta:cons-1'))).toBeNull();
    expect(localStorage.getItem(draftKey('med-1', 'consulta:cons-2'))).not.toBeNull();
  });

  it('al cerrar sesión se borran todos los borradores', () => {
    saveDraft('med-1', 'consulta:cons-1', { physicalExam: 'Uno' });
    saveDraft('otra-cuenta', 'consulta:cons-2', { physicalExam: 'Dos' });
    clearAllDrafts();
    expect(localStorage.length).toBe(0);
  });
});
