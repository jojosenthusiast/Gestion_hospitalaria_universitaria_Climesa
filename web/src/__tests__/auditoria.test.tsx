import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Api } from '../lib/api';
import { AuditPage } from '../features/audit/AuditPage';
import { describeAction, emptyFilters, pageQuery, defaultSort, removeChip, chips, presets } from '../features/audit/query';

afterEach(() => { cleanup(); });

const row = (seq: string, extra: Record<string, unknown> = {}) => ({ seq, at: '2026-11-14T16:44:12.000Z', role: 'MED', actor: 'Persona Ficticia', action: 'consulta.leer', entity: 'consulta', entityId: 'c-1', patientRecord: '000412-7', result: 'exito', reason: 'atención', ...extra });
const detail = { ...row('7'), permission: 'consulta.ver', correlation: 'req-123', detail: { filtros: { persona: true } }, hash: 'a'.repeat(64), previousHash: 'b'.repeat(64), previousSeq: '6', nextSeq: '8' };
function fakeApi(handlers: Record<string, unknown> = {}) {
  const request = vi.fn(async (path: string) => {
    if (path.startsWith('/auditoria/opciones')) return { acciones: ['consulta.leer', 'usuarios.roles'], entidades: ['consulta', 'paciente'], roles: ['MED', 'DPD'] };
    if (path.startsWith('/auditoria/registros/')) return handlers.detail ?? detail;
    if (path.startsWith('/auditoria/registros')) return handlers.page ?? { filas: [row('7'), row('6', { actor: 'Otra Persona', result: 'denegado', reason: 'acceso_excepcional' })], total: 60, pagina: 1, limite: 25 };
    throw new Error(`ruta sin simular: ${path}`);
  });
  const write = vi.fn();
  return { request, write } as unknown as Api & { request: typeof request; write: ReturnType<typeof vi.fn> };
}
const lastPage = (api: ReturnType<typeof fakeApi>) => [...api.request.mock.calls].map(c => c[0] as string).filter(p => p.startsWith('/auditoria/registros?')).pop() ?? '';

describe('W32 · espacio del auditor', () => {
  it('muestra la tabla paginada, ordena por columna y cambia de página', async () => {
    const api = fakeApi();
    render(<AuditPage api={api} version={0} />);
    expect(await screen.findByText('Persona Ficticia')).toBeTruthy();
    expect(screen.getByText(/1–2 de 60 registros/)).toBeTruthy();
    expect(screen.getByText('Acceso excepcional (módulo retirado)')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /^Persona/ }));
    await waitFor(() => expect(lastPage(api)).toContain('orden=persona&sentido=desc'));
    await userEvent.click(screen.getByRole('button', { name: /^Persona/ }));
    await waitFor(() => expect(lastPage(api)).toContain('sentido=asc'));
    await userEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    await waitFor(() => expect(lastPage(api)).toContain('pagina=2'));
  });

  it('busca por persona con espera, filtra por rol y resultado, y muestra los chips con «Quitar filtros»', async () => {
    const api = fakeApi();
    render(<AuditPage api={api} version={0} />);
    await screen.findByText('Persona Ficticia');
    await userEvent.type(screen.getByLabelText(/^Buscar persona/), 'Ficticia');
    await waitFor(() => expect(lastPage(api)).toContain('persona=Ficticia'));
    await userEvent.click(screen.getByRole('button', { name: /^Filtros/ }));
    await userEvent.selectOptions(screen.getByLabelText('Rol de quien actuó'), 'MED');
    await userEvent.click(screen.getByLabelText('Denegado'));
    await waitFor(() => expect(lastPage(api)).toMatch(/rol=MED.*resultado=denegado|resultado=denegado.*rol=MED/));
    const bar = screen.getByLabelText('Filtros activos');
    expect(within(bar).getByText('Rol: MED')).toBeTruthy();
    expect(within(bar).getByText('Resultado: Denegado')).toBeTruthy();
    await userEvent.click(within(bar).getByRole('button', { name: 'Quitar filtro Rol: MED' }));
    await waitFor(() => expect(lastPage(api)).not.toContain('rol=MED'));
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    await waitFor(() => expect(lastPage(api)).not.toContain('persona='));
    expect(screen.queryByLabelText('Filtros activos')).toBeNull();
  });

  it('las vistas rápidas aplican sus filtros', async () => {
    const api = fakeApi();
    render(<AuditPage api={api} version={0} />);
    await screen.findByText('Persona Ficticia');
    await userEvent.click(screen.getByRole('button', { name: 'Fallos y denegaciones' }));
    await waitFor(() => expect(lastPage(api)).toContain('resultado=denegado%2Cfallido'));
    await userEvent.click(screen.getByRole('button', { name: 'Cambios de permisos' }));
    await waitFor(() => expect(lastPage(api)).toContain('accion=usuarios.roles%2Cusuarios.estado%2Cusuarios.invitar'));
    expect(lastPage(api)).not.toContain('resultado=');
  });

  it('abre el detalle de una fila con quién, qué, cuándo, dónde y la cadena de hash', async () => {
    const api = fakeApi();
    render(<AuditPage api={api} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ver detalle del registro 7' }));
    const drawer = await screen.findByRole('dialog', { name: 'Detalle del registro 7' });
    expect(await within(drawer).findByText('req-123')).toBeTruthy();
    expect(within(drawer).getByText('a'.repeat(64))).toBeTruthy();
    expect(within(drawer).getByText(/no guarda valores anteriores ni nuevos/)).toBeTruthy();
    await userEvent.click(within(drawer).getByRole('button', { name: /Registro anterior/ }));
    await waitFor(() => expect(api.request).toHaveBeenCalledWith('/auditoria/registros/6', expect.anything()));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('verifica la cadena y señala el registro alterado', async () => {
    const api = fakeApi();
    api.write.mockResolvedValue({ integra: false, revisados: 6, primeraFallida: 7, motivo: 'hash no coincide con el evento canónico', verificadoEn: '2026-11-14T16:45:00.000Z' });
    render(<AuditPage api={api} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: /Verificar integridad/ }));
    expect(api.write).toHaveBeenCalledWith('/auditoria/verificacion', {}, 'POST');
    expect(await screen.findByText(/La cadena está alterada en el registro 7/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Ver registro 7' }));
    expect(await screen.findByRole('dialog', { name: 'Detalle del registro 7' })).toBeTruthy();
  });

  it('sin filas muestra el estado vacío', async () => {
    render(<AuditPage api={fakeApi({ page: { filas: [], total: 0, pagina: 1, limite: 25 } })} version={0} />);
    expect(await screen.findByText('Todavía no hay actividad')).toBeTruthy();
  });
});

describe('audit/query', () => {
  it('arma la consulta con fechas de El Salvador y la paginación', () => {
    const query = pageQuery({ ...emptyFilters, from: '2026-11-14', to: '2026-11-14', results: ['denegado'] }, defaultSort, 2, 50);
    const params = new URLSearchParams(query);
    expect(params.get('desde')).toBe('2026-11-14T06:00:00.000Z');
    expect(params.get('hasta')).toBe('2026-11-15T06:00:00.000Z');
    expect(params.get('pagina')).toBe('2');
    expect(params.get('limite')).toBe('50');
  });
  it('ignora textos de menos de 2 caracteres (la API los rechazaría)', () => {
    expect(new URLSearchParams(pageQuery({ ...emptyFilters, person: 'a', patient: 'b' }, defaultSort, 1, 25)).has('persona')).toBe(false);
  });
  it('quita un chip sin tocar los demás', () => {
    const filters = { ...emptyFilters, role: 'MED', results: ['denegado', 'fallido'], from: '2026-11-01', to: '2026-11-02' };
    expect(chips(filters)).toHaveLength(4);
    expect(removeChip(filters, 'result:denegado').results).toEqual(['fallido']);
    expect(removeChip(filters, 'from')).toMatchObject({ from: '', to: '', role: 'MED' });
  });
  it('describe las acciones conocidas y deja las desconocidas tal cual', () => {
    expect(describeAction('consulta.leer')).toBe('Consulta · lectura');
    expect(describeAction('xyz.abc')).toBe('xyz.abc');
    expect(presets.map(p => p.id)).toEqual(['expedientes-hoy', 'permisos', 'fallos']);
  });
});
