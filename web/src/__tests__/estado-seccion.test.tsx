import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SectionState } from '../components/system';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { BedsPage } from '../features/spaces';
import { PersonnelPage } from '../features/personnel';

// Fase 2, R1 (S3): one section state for modules, panels and trays; and no figure is shown before its data exists.
afterEach(cleanup);

const perfil = (permisos: string[]): AccessProfile => ({
  id: 'u-1', user: { id: 'u-1' }, email: 'x@example.test', name: 'Cuenta de prueba', roles: ['ADM'], platforms: ['web'],
  permissions: permisos.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null,
});
const pendiente = () => new Promise<never>(() => undefined);
const fallo = async () => { throw new ApiError('El servicio no está disponible.', 503, 'no_disponible'); };
const apiDe = (request: (path: string) => Promise<unknown>) => ({ request: vi.fn(request), write: vi.fn() }) as unknown as Api;

describe('estado único de sección (R1, WC-40)', () => {
  const state = (over: object) => ({ data: null, loading: false, error: null, refresh: vi.fn(), ...over });

  it('la forma completa y la de una línea dicen lo mismo y ofrecen el mismo reintento', () => {
    const error = new ApiError('El servicio no está disponible.', 503);
    render(<><SectionState state={state({ error })}>{() => null}</SectionState><SectionState compact state={state({ error })}>{() => null}</SectionState></>);
    expect(screen.getAllByText('No pudimos cargar esta información')).toHaveLength(2);
    expect(screen.getAllByText('El servicio no está disponible.')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Volver a intentar' })).toHaveLength(2);
  });

  // S8: a refusal must never feel broken; a 403 never offers retry.
  it('un 403 muestra el motivo del servidor como información, sin «Volver a intentar»', () => {
    const error = new ApiError('Necesitas una relación de atención con este paciente.', 403, 'sin_relacion');
    render(<><SectionState state={state({ error })}>{() => null}</SectionState><SectionState compact state={state({ error })}>{() => null}</SectionState></>);
    expect(screen.getAllByText('Necesitas una relación de atención con este paciente.')).toHaveLength(2);
    expect(screen.getAllByText('No tienes acceso a esta información')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Volver a intentar' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('un 500 o un fallo de red siguen ofreciendo «Volver a intentar»', async () => {
    const refresh = vi.fn();
    const { rerender } = render(<SectionState state={state({ error: new ApiError('Error interno.', 500), refresh })}>{() => null}</SectionState>);
    await userEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }));
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender(<SectionState state={state({ error: new ApiError('No hay conexión con el servidor.', 0), refresh })}>{() => null}</SectionState>);
    expect(screen.getByText('No pudimos cargar esta información')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Volver a intentar' })).toBeTruthy();
  });

  it('una sección vacía es una sola línea, sin título', () => {
    render(<SectionState state={state({ data: [] })} empty={(rows: unknown[]) => rows.length ? null : 'Nada pendiente.'}>{() => <h2>Lista</h2>}</SectionState>);
    expect(screen.getByRole('status').textContent).toBe('Nada pendiente.');
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('mientras carga muestra el esqueleto común', () => {
    render(<SectionState state={state({ loading: true })}>{() => null}</SectionState>);
    expect(screen.getByText('Cargando información…')).toBeTruthy();
  });
});

describe('cifras sin datos falsos (R1, WC-52)', () => {
  it('Camas no muestra «0 libres» mientras carga', () => {
    render(<BedsPage api={apiDe(pendiente)} profile={perfil(['camas.ver'])} version={0} />);
    expect(screen.queryByText('Libres')).toBeNull();
    expect(document.querySelector('.number-strip')).toBeNull();
  });

  it('Camas no muestra cifras después de un error', async () => {
    render(<BedsPage api={apiDe(fallo)} profile={perfil(['camas.ver'])} version={0} />);
    expect(await screen.findByText('No pudimos cargar esta información')).toBeTruthy();
    expect(document.querySelector('.number-strip')).toBeNull();
  });

  it('Personal no muestra «0 personal activo» mientras carga', () => {
    render(<PersonnelPage api={apiDe(pendiente)} profile={perfil(['personal.ver', 'usuarios.ver'])} version={0} />);
    expect(screen.queryByText('Con cuenta de acceso')).toBeNull();
    expect(document.querySelector('.number-strip')).toBeNull();
  });

  it('Personal no muestra cifras después de un error', async () => {
    render(<PersonnelPage api={apiDe(fallo)} profile={perfil(['personal.ver', 'usuarios.ver'])} version={0} />);
    expect((await screen.findAllByText('No pudimos cargar esta información')).length).toBeGreaterThan(0);
    expect(document.querySelector('.number-strip')).toBeNull();
  });
});
