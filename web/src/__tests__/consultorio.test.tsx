import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { ConsultationsPage, type Consultation } from '../features/consultations';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); localStorage.clear(); });

const profile = (permissions: string[]): AccessProfile => ({
  id: 'med-1', user: { id: 'med-1' }, email: 'med@example.test', name: 'Medicina de prueba', roles: ['MED'], platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'relacion' })), channels: [], patientId: null, staffId: 'staff-med-1',
});
const open: Consultation = {
  appointmentId: 'cita-1', patientId: 'pac-1', patientName: 'Paciente Ficticio Uno', start: '2026-11-13T15:00:00Z', end: '2026-11-13T15:20:00Z',
  appointmentState: 'confirmada', consultationId: 'cons-1', consultationState: 'abierta', consultationReason: 'Control', plan: 'Plan inicial', version: 2,
};

function mount(permissions: string[], routes: Record<string, unknown> = {}, write: Api['write'] = vi.fn(async () => ({})) as Api['write']) {
  const api = {
    request: vi.fn(async (path: string) => {
      if (path === '/consultas/agenda') return [open];
      if (path in routes) return routes[path];
      throw new ApiError(`Ruta inesperada: ${path}`, 404);
    }),
    write: vi.fn(write),
  };
  render(<ConsultationsPage api={api as unknown as Api} profile={profile(permissions)} version={0} />);
  return api;
}
async function openConsultation() {
  await userEvent.click(await screen.findByRole('button', { name: /Continuar/ }));
  return screen.getByRole('dialog');
}

describe('W-consultorio · signos vitales (WEB-09)', () => {
  it('si la API rechaza los signos, conserva lo escrito y muestra el error', async () => {
    const api = mount(['consulta.iniciar', 'signos.registrar'], {}, async () => { throw new ApiError('La presión sistólica está fuera de rango.', 400); });
    const dialog = await openConsultation();
    await userEvent.type(within(dialog).getByLabelText('PA sistólica'), '130');
    await userEvent.type(within(dialog).getByLabelText('Frecuencia cardiaca'), '80');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar signos' }));
    expect(await within(dialog).findByText('La presión sistólica está fuera de rango.')).toBeTruthy();
    expect((within(dialog).getByLabelText('PA sistólica') as HTMLInputElement).value).toBe('130');
    expect((within(dialog).getByLabelText('Frecuencia cardiaca') as HTMLInputElement).value).toBe('80');
    expect(api.write).toHaveBeenCalledWith('/consultas/cons-1/signos', expect.objectContaining({ systolic: 130, heartRate: 80 }), 'POST');
  });

  it('al guardar con éxito limpia los campos y lo confirma', async () => {
    mount(['consulta.iniciar', 'signos.registrar'], {}, async () => ({ id: 'sv-1', takenAt: '2026-11-13T15:05:00Z' }) as never);
    const dialog = await openConsultation();
    await userEvent.type(within(dialog).getByLabelText('PA sistólica'), '120');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar signos' }));
    expect(await within(dialog).findByText('Signos vitales registrados.')).toBeTruthy();
    await waitFor(() => expect((within(dialog).getByLabelText('PA sistólica') as HTMLInputElement).value).toBe(''));
  });
});

const catalog = [
  { id: '11111111-1111-4111-8111-111111111111', code: 'HEM', name: 'Hemograma completo', isPanel: true, unit: null, resultType: 'panel' },
  { id: '22222222-2222-4222-8222-222222222222', code: 'GLU', name: 'Glucosa en ayunas', isPanel: false, unit: 'mg/dL', resultType: 'numerico' },
];

describe('W-consultorio · orden de laboratorio desde la consulta (REQ-04)', () => {
  it('con laboratorio.ordenar elige exámenes del catálogo y prioridad, y envía la orden con clave de idempotencia', async () => {
    const api = mount(['consulta.iniciar', 'laboratorio.ordenar'], { '/laboratorio/catalogo': catalog }, async () => ({ id: 'ord-1', version: 1, state: 'pendiente' }) as never);
    const dialog = await openConsultation();
    const section = await within(dialog).findByRole('group', { name: 'Exámenes y paneles' });
    await userEvent.click(within(section).getByLabelText(/Glucosa en ayunas/));
    await userEvent.click(within(section).getByLabelText(/Hemograma completo/));
    await userEvent.selectOptions(within(dialog).getByLabelText('Prioridad'), 'urgente');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar orden al laboratorio' }));
    expect(await within(dialog).findByText('Orden enviada al laboratorio. Aparecerá en la cola de Laboratorio.')).toBeTruthy();
    expect(api.write).toHaveBeenCalledWith('/laboratorio/ordenes', { consultationId: 'cons-1', exams: [catalog[1].id, catalog[0].id], priority: 'urgente' }, 'POST');
    expect((within(section).getByLabelText(/Glucosa en ayunas/) as HTMLInputElement).checked).toBe(false);
  });

  it('no permite enviar sin exámenes y conserva la selección si la API rechaza', async () => {
    mount(['consulta.iniciar', 'laboratorio.ordenar'], { '/laboratorio/catalogo': catalog }, async () => { throw new ApiError('Selecciona exámenes activos del catálogo.', 400); });
    const dialog = await openConsultation();
    const send = await within(dialog).findByRole('button', { name: 'Enviar orden al laboratorio' });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(within(dialog).getByLabelText(/Glucosa en ayunas/));
    await userEvent.click(send);
    expect(await within(dialog).findByText('Selecciona exámenes activos del catálogo.')).toBeTruthy();
    expect((within(dialog).getByLabelText(/Glucosa en ayunas/) as HTMLInputElement).checked).toBe(true);
  });

  it('sin laboratorio.ordenar no muestra la sección ni pide el catálogo', async () => {
    const api = mount(['consulta.iniciar']);
    const dialog = await openConsultation();
    expect(within(dialog).queryByRole('group', { name: 'Exámenes y paneles' })).toBeNull();
    expect(api.request.mock.calls.map(([path]) => path)).not.toContain('/laboratorio/catalogo');
  });

  it('con catálogo vacío lo explica', async () => {
    mount(['consulta.iniciar', 'laboratorio.ordenar'], { '/laboratorio/catalogo': [] });
    const dialog = await openConsultation();
    expect(await within(dialog).findByText('El catálogo de laboratorio no tiene exámenes activos.')).toBeTruthy();
  });
});

const ticket = (extra: Record<string, unknown> = {}) => ({ id: 'tk-1', numero: 7, service: 'consulta_general', state: 'en_atencion', patientId: 'pac-2', patientName: 'Paciente Ficticio Dos', issuedAt: '2026-11-13T14:00:00Z', consultationId: null, consultationState: null, ...extra });
const detail = { consultation: { id: 'cons-9', patientId: 'pac-2', appointmentId: null, reason: 'Dolor de cabeza', physicalExam: null, plan: null, state: 'abierta', version: 3, patientName: 'Paciente Ficticio Dos' }, vitalSigns: [], diagnoses: [], prescriptions: [] };

describe('W-consultorio · retomar la consulta propia desde la fila', () => {
  it('un número en atención con consulta propia muestra Retomar consulta y la abre sin volver a iniciarla', async () => {
    const api = mount(['consulta.iniciar', 'fila.ver', 'consulta.registrar'], { '/fila': [ticket({ consultationId: 'cons-9', consultationState: 'abierta' })], '/consultas/cons-9/detalle': detail });
    await userEvent.click(await screen.findByRole('button', { name: /Retomar consulta/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Número de fila N.º 7/)).toBeTruthy();
    expect((within(dialog).getByLabelText('Motivo de consulta') as HTMLInputElement).value).toBe('Dolor de cabeza');
    expect(api.write).not.toHaveBeenCalled();
  });

  it('si al iniciar la API responde que ya estaba iniciada por este médico, abre esa consulta', async () => {
    const write = vi.fn(async () => { throw new ApiError('La consulta ya fue iniciada para este número.', 409, 'consulta_ya_iniciada', undefined, { consultaId: 'cons-9' }); });
    mount(['consulta.iniciar', 'fila.ver'], { '/fila': [ticket()], '/consultas/cons-9/detalle': detail }, write as unknown as Api['write']);
    await userEvent.click(await screen.findByRole('button', { name: /Iniciar consulta/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Número de fila N.º 7/)).toBeTruthy();
    expect(write).toHaveBeenCalledWith('/consultas', { ticketId: 'tk-1' }, 'POST');
  });

  it('si la consulta es de otro médico muestra el conflicto y no abre nada', async () => {
    const write = vi.fn(async () => { throw new ApiError('La consulta ya fue iniciada para este número.', 409, 'consulta_ya_iniciada'); });
    mount(['consulta.iniciar', 'fila.ver'], { '/fila': [ticket()] }, write as unknown as Api['write']);
    await userEvent.click(await screen.findByRole('button', { name: /Iniciar consulta/ }));
    expect(await screen.findByText('La consulta ya fue iniciada para este número.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('W-consultorio · borrador local de la consulta', () => {
  it('guarda lo escrito en este equipo por usuario y consulta, y lo recupera al volver', async () => {
    mount(['consulta.iniciar', 'consulta.registrar']);
    let dialog = await openConsultation();
    await userEvent.type(within(dialog).getByLabelText('Examen físico'), 'Abdomen blando');
    expect(await within(dialog).findByText('Borrador guardado en este equipo.')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('climesa:borrador:med-1:consulta:cons-1') ?? '{}').physicalExam).toBe('Abdomen blando');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await openConsultation();
    expect((within(dialog).getByLabelText('Examen físico') as HTMLTextAreaElement).value).toBe('Abdomen blando');
    expect(within(dialog).getByText('Recuperamos lo que escribiste y aún no habías guardado.')).toBeTruthy();
  });

  it('otra cuenta en el mismo navegador no ve el borrador', async () => {
    localStorage.setItem('climesa:borrador:otra-cuenta:consulta:cons-1', JSON.stringify({ physicalExam: 'Nota de otra cuenta' }));
    mount(['consulta.iniciar', 'consulta.registrar']);
    const dialog = await openConsultation();
    expect((within(dialog).getByLabelText('Examen físico') as HTMLTextAreaElement).value).toBe('');
  });

  it('al firmar con éxito borra el borrador local', async () => {
    const write = vi.fn(async (path: string) => path.endsWith('/firmar') ? { id: 'cons-1', version: 4, state: 'firmada', signedAt: '2026-11-13T15:30:00Z' } : { id: 'cons-1', version: 3, state: 'abierta' });
    mount(['consulta.iniciar', 'consulta.registrar'], {}, write as unknown as Api['write']);
    const dialog = await openConsultation();
    await userEvent.type(within(dialog).getByLabelText('Examen físico'), 'Sin hallazgos');
    await waitFor(() => expect(localStorage.getItem('climesa:borrador:med-1:consulta:cons-1')).not.toBeNull());
    await userEvent.click(within(dialog).getByRole('button', { name: 'Firmar consulta' }));
    await waitFor(() => expect(write).toHaveBeenCalledWith('/consultas/cons-1/firmar', { version: 3 }, 'POST'));
    await waitFor(() => expect(localStorage.getItem('climesa:borrador:med-1:consulta:cons-1')).toBeNull());
  });
});
