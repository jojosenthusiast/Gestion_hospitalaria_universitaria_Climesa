import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { MyHistoryPage } from '../features/clinical-history';
import { ConsultationsPage, type Consultation } from '../features/consultations';
import { visibleModules } from '../features/shell';
import permisosCsv from '../../../docs/arquitectura/datos/permisos.csv?raw';

// S19 (carry-over): the patient sees history, prescription and released results on the web; the prescription prints;
// signing with lab orders still open warns without blocking.

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); document.querySelectorAll('.rx-print-root').forEach(n => n.remove()); });

function permisosDe(rol: string) {
  const [cabecera, ...filas] = permisosCsv.replace(/^﻿/, '').trim().split(/\r?\n/);
  const columna = cabecera.split(',').indexOf(rol);
  return filas.map(f => f.split(',')).filter(c => c[columna]?.trim()).map(c => ({ code: c[0], context: c[columna].trim() }));
}
const perfil = (rol: string, extra: Partial<AccessProfile> = {}): AccessProfile => ({ id: 'u', user: { id: 'u' }, email: 'p@example.test', name: rol === 'MED' ? 'Dra. Ficticia Médica' : 'Paciente Ficticio Uno', roles: [rol], platforms: ['web'], permissions: permisosDe(rol), channels: [], patientId: null, staffId: rol === 'MED' ? 'staff-1' : null, ...extra });

const history = {
  patient: { id: 'pac-1', record: '000412-7', fullName: 'Paciente Ficticio Uno' }, access: 'propio',
  consultations: [
    { id: 'cons-1', state: 'firmada', startedAt: '2026-11-10T15:00:00Z', signedAt: '2026-11-10T15:30:00Z', reason: 'Dolor de cabeza', plan: 'Reposo e hidratación', doctor: { id: 'm', name: 'Dra. Ficticia Médica', specialty: 'Medicina general' },
      diagnoses: [{ code: 'R51', description: 'Cefalea', principal: true }],
      prescriptions: [{ id: 'r-1', issuedAt: '2026-11-10T15:25:00Z', items: [{ medication: 'Acetaminofén', dose: '500 mg', route: 'Oral', frequency: 'Cada 8 horas', duration: '3 días', instructions: 'Tomar con comida' }] }] },
    { id: 'cons-2', state: 'firmada', startedAt: '2026-11-01T15:00:00Z', signedAt: '2026-11-01T15:30:00Z', reason: 'Control', plan: null, doctor: { id: 'm', name: 'Dra. Ficticia Médica', specialty: null }, diagnoses: [], prescriptions: [] },
  ],
  laboratory: [
    { id: 'o-1', consultationId: 'cons-1', state: 'completado', createdAt: '2026-11-10T15:26:00Z', reviewedAt: '2026-11-11T10:00:00Z', items: [{ id: 'i-1', code: 'GLU', name: 'Glucosa en ayunas', unit: 'mg/dL', result: { value: 92, text: null, mark: 'normal' } }] },
    { id: 'o-2', consultationId: 'cons-1', state: 'completado', createdAt: '2026-11-12T15:26:00Z', reviewedAt: null, items: [{ id: 'i-2', code: 'CRE', name: 'Creatinina sérica', unit: 'mg/dL', result: null }] },
  ],
  admissions: [],
};
function apiWith(routes: Record<string, unknown>) {
  return { request: vi.fn(async (path: string) => { if (path in routes) return routes[path]; throw new ApiError(`Ruta inesperada: ${path}`, 404); }), write: vi.fn(async () => ({ version: 2 })) } as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
}

describe('S19 · «Mi historial» del paciente en la web', () => {
  it('el menú ofrece «Mi historial» al paciente (expediente.ver propio_revisado) y no al médico (relación)', () => {
    expect(visibleModules(perfil('PAC')).map(m => m.label)).toContain('Mi historial');
    expect(visibleModules(perfil('MED')).map(m => m.label)).not.toContain('Mi historial');
  });

  it('muestra consultas firmadas con diagnóstico y receta, y los valores que el médico ya liberó', async () => {
    const api = apiWith({ '/pacientes/pac-1/historial': history });
    render(<MyHistoryPage api={api} profile={perfil('PAC', { patientId: 'pac-1' })} version={0} />);
    expect(await screen.findByText('Dolor de cabeza')).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith('/pacientes/pac-1/historial', expect.anything());
    expect(screen.getAllByRole('listitem', { name: /Consulta del/ })).toHaveLength(2);
    expect(screen.getByText('Cefalea')).toBeTruthy();
    expect(screen.getByText('Acetaminofén')).toBeTruthy();
    expect(screen.getByText(/500 mg · Oral · Cada 8 horas · 3 días/)).toBeTruthy();
    const lab = screen.getByRole('region', { name: /Exámenes de laboratorio/ });
    expect(within(lab).getByText('92 mg/dL')).toBeTruthy();
    expect(within(lab).getByText('Valor pendiente de revisión')).toBeTruthy();
    expect(within(lab).getByText('Pendiente de revisión médica')).toBeTruthy();
    // Only the consultation with a prescription offers to print it.
    expect(screen.getAllByRole('button', { name: 'Imprimir receta' })).toHaveLength(1);
  });

  it('sin expediente vinculado pide vincular la cuenta y no consulta la API', () => {
    const api = apiWith({});
    render(<MyHistoryPage api={api} profile={perfil('PAC')} version={0} />);
    expect(screen.getByText('Para ver tu historial, primero vincula tu cuenta con tu expediente.')).toBeTruthy();
    expect(api.request).not.toHaveBeenCalled();
  });
});

describe('S19 · receta imprimible', () => {
  it('«Imprimir receta» abre la vista para imprimir con hospital, paciente, médico, fecha, indicaciones y firma', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<MyHistoryPage api={apiWith({ '/pacientes/pac-1/historial': history })} profile={perfil('PAC', { patientId: 'pac-1' })} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Imprimir receta' }));
    const dialog = screen.getByRole('dialog', { name: 'Receta' });
    const sheet = within(dialog).getByRole('article', { name: 'Receta médica' });
    expect(within(sheet).getByText('CLIMESA')).toBeTruthy();
    expect(within(sheet).getByText('Hospital universitario')).toBeTruthy();
    expect(within(sheet).getByText('Paciente Ficticio Uno')).toBeTruthy();
    expect(within(sheet).getByText('000412-7')).toBeTruthy();
    expect(within(sheet).getByText('Dra. Ficticia Médica · Medicina general')).toBeTruthy();
    expect(within(sheet).getByText('R51 · Cefalea')).toBeTruthy();
    expect(within(sheet).getByText('500 mg · Vía oral')).toBeTruthy();
    expect(within(sheet).getByText('Cada 8 horas durante 3 días')).toBeTruthy();
    expect(within(sheet).getByText('Tomar con comida')).toBeTruthy();
    expect(within(sheet).getByText('Firma y sello del médico')).toBeTruthy();
    // The copy that prints lives directly under <body>, outside the app.
    expect(document.body.querySelector(':scope > .rx-print-root .rx-sheet')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Imprimir' }));
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });
});

const row = (over: Partial<Consultation>): Consultation => ({ appointmentId: 'cita-1', patientId: 'pac-1', patientName: 'Paciente Ficticio Uno', start: new Date().toISOString(), end: new Date().toISOString(), appointmentState: 'confirmada', consultationId: 'cons-1', consultationState: 'abierta', consultationReason: 'Dolor de cabeza', plan: 'Reposo', version: 1, ...over });
const detail = (labOrders: unknown[], prescriptions: unknown[] = []) => ({ consultation: { id: 'cons-1', patientId: 'pac-1', state: 'abierta', version: 1 }, vitalSigns: [], diagnoses: [{ code: 'R51', principal: true }], prescriptions, labOrders });
function mountDoctor(agenda: Consultation[], record: unknown) {
  const api = apiWith({ '/consultas/agenda': agenda, '/fila': [], '/consultas/sin-firmar': [], '/consultas/cons-1/detalle': record, '/laboratorio/catalogo': [] });
  render(<ConsultationsPage api={api} profile={perfil('MED')} version={0} />);
  return api;
}
const openConsultation = async (label: RegExp) => { await userEvent.click(await screen.findByRole('button', { name: label })); return screen.getByRole('dialog'); };

describe('S19 · el médico imprime la receta de su consulta firmada', () => {
  it('la consulta firmada lista la receta emitida y ofrece «Imprimir receta» con el nombre del médico', async () => {
    mountDoctor([row({ consultationState: 'firmada', appointmentState: 'atendida' })], detail([], [{ id: 'r-1', issuedAt: '2026-11-10T15:25:00Z', items: [{ medication: 'Ibuprofeno', dose: '400 mg', route: 'Oral', frequency: 'Cada 12 horas', duration: '5 días' }] }]));
    const dialog = await openConsultation(/Ver consulta/);
    const issued = await within(dialog).findByRole('region', { name: 'Receta emitida' });
    expect(within(issued).getByText('Ibuprofeno')).toBeTruthy();
    await userEvent.click(within(issued).getByRole('button', { name: 'Imprimir receta' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Receta' })).getByRole('article', { name: 'Receta médica' });
    expect(within(sheet).getAllByText('Dra. Ficticia Médica')).toHaveLength(2); // Médico and the signature line.
    expect(within(sheet).getByText('Cada 12 horas durante 5 días')).toBeTruthy();
  });
});

describe('S19 · aviso al firmar con exámenes pendientes', () => {
  it('con 2 exámenes sin completar avisa «Quedan 2 exámenes pendientes…» y deja firmar', async () => {
    mountDoctor([row({})], detail([{ id: 'o-1', state: 'pendiente', items: [{ code: 'GLU', name: 'Glucosa' }, { code: 'CRE', name: 'Creatinina' }] }, { id: 'o-2', state: 'completado', items: [{ code: 'HB', name: 'Hemograma' }] }]));
    const dialog = await openConsultation(/Continuar/);
    expect(await within(dialog).findByText('Quedan 2 exámenes pendientes; los resultados llegarán a «Resultados por revisar».')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Firmar consulta' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('con 1 examen en proceso usa el singular', async () => {
    mountDoctor([row({})], detail([{ id: 'o-1', state: 'en_proceso', items: [{ code: 'GLU', name: 'Glucosa' }] }]));
    const dialog = await openConsultation(/Continuar/);
    expect(await within(dialog).findByText('Queda 1 examen pendiente; el resultado llegará a «Resultados por revisar».')).toBeTruthy();
  });

  it('sin órdenes abiertas no muestra el aviso', async () => {
    const api = mountDoctor([row({})], detail([{ id: 'o-2', state: 'completado', items: [{ code: 'HB', name: 'Hemograma' }] }]));
    const dialog = await openConsultation(/Continuar/);
    await vi.waitFor(() => expect(api.request).toHaveBeenCalledWith('/consultas/cons-1/detalle', expect.anything()));
    expect(within(dialog).queryByText(/exámenes? pendientes?/)).toBeNull();
  });
});
