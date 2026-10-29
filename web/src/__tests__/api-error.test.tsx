import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, HttpApi } from '../lib/api';
import { WriteError, isVersionConflict } from '../features/common';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const responder = (status: number, cuerpo?: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(cuerpo === undefined ? 'no es json' : JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/problem+json' } })));
const fallar = async (status: number, cuerpo?: unknown) => {
  responder(status, cuerpo);
  return (await new HttpApi(async () => 't').request('/x').catch(e => e)) as ApiError;
};

describe('ApiError desde problem+json', () => {
  it('un 409 con versionActual expone code y currentVersion', async () => {
    const e = await fallar(409, { status: 409, codigo: 'version_conflicto', detail: 'La ficha cambió. Vuelve a abrirla.', versionActual: 7 });
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(409);
    expect(e.message).toBe('La ficha cambió. Vuelve a abrirla.');
    expect(e.code).toBe('version_conflicto');
    expect(e.currentVersion).toBe(7);
  });
  it('un error sin cuerpo JSON deja code y currentVersion sin definir y conserva el mensaje por defecto', async () => {
    const e = await fallar(500);
    expect(e.status).toBe(500);
    expect(e.message).toBe('No se pudo completar la operación.');
    expect(e.code).toBeUndefined();
    expect(e.currentVersion).toBeUndefined();
  });
  it('un error sin versionActual no inventa currentVersion', async () => {
    const e = await fallar(409, { status: 409, codigo: 'conflicto', detail: 'Ese DUI ya existe.' });
    expect(e.code).toBe('conflicto');
    expect(e.currentVersion).toBeUndefined();
  });
});

describe('isVersionConflict', () => {
  it('reconoce un 409 version_conflicto', () => { expect(isVersionConflict(new ApiError('x', 409, 'version_conflicto', 3))).toBe(true); });
  it('reconoce un 409 con currentVersion aunque falte el código', () => { expect(isVersionConflict(new ApiError('x', 409, undefined, 3))).toBe(true); });
  it('no trata otros 409 como conflicto de versión, aunque el mensaje empiece igual', () => {
    expect(isVersionConflict(new ApiError('Ese DUI ya existe.', 409, 'conflicto'))).toBe(false);
    expect(isVersionConflict(new ApiError('La ficha cambió.', 409))).toBe(false);
  });
  it('no trata un estado distinto de 409 como conflicto de versión', () => { expect(isVersionConflict(new ApiError('x', 400, 'version_conflicto', 3))).toBe(false); });
  it('acepta null', () => { expect(isVersionConflict(null)).toBe(false); });
});

describe('WriteError', () => {
  it('en un conflicto de versión añade la pista de recargar', () => {
    render(<WriteError error={new ApiError('La ficha cambió.', 409, 'version_conflicto', 4)} />);
    expect(screen.getByText(/La ficha cambió\. Conservamos lo que escribiste/)).toBeTruthy();
  });
  it('en otro 409 muestra solo el detalle de la API', () => {
    render(<WriteError error={new ApiError('Ese DUI ya existe.', 409, 'conflicto')} />);
    expect(screen.getByText('Ese DUI ya existe.')).toBeTruthy();
    expect(screen.queryByText(/Conservamos lo que escribiste/)).toBeNull();
  });
  it('no pinta nada sin error', () => {
    const { container } = render(<WriteError error={null} />);
    expect(container.innerHTML).toBe('');
  });
});
