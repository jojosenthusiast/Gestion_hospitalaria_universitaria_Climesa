import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type Api } from '../lib/api';
import { RegisterExternalResultDialog } from '../features/lab-external-record';

/** R7 U3, journey C2 gap C-5 (D-5): the doctor records an exam done elsewhere, without a prior order, from the patient record. */
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const catalog = [
  { id: 'e-glu', code: 'GLU', name: 'Glucosa', isPanel: false, unit: 'mg/dL', resultType: 'numerico' },
  { id: 'e-hemo', code: 'HEMO', name: 'Hemograma completo', isPanel: true },
  { id: 'e-orina', code: 'EGO', name: 'Examen general de orina', isPanel: false, resultType: 'texto' },
];
const patient = { id: 'p-1', fullName: 'Ana Pérez Ficticia' };

function mount(upload: 'ok' | 'fail' = 'ok') {
  const request = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/laboratorio/catalogo') return catalog;
    if (path.endsWith('/archivo') && init?.method === 'POST') { if (upload === 'fail') throw new ApiError('Sin conexión.', 0); return { id: 'att-9', stored: true }; }
    return [];
  });
  const write = vi.fn(async () => ({ id: 'o-9', version: 3, state: 'completado', attachmentId: 'att-9', consultationId: 'c-1' }));
  const onSaved = vi.fn();
  render(<RegisterExternalResultDialog api={{ request, write } as unknown as Api} patient={patient} onClose={vi.fn()} onSaved={onSaved} />);
  return { request, write, onSaved };
}

describe('R7 C-5 · registrar resultado externo sin orden', () => {
  it('elige exámenes (sin paneles), escribe valores, adjunta el informe y lo envía a la API nueva; luego sube el archivo', async () => {
    const { request, write, onSaved } = mount();
    const dialog = await screen.findByRole('dialog', { name: 'Registrar resultado externo' });
    const exam = within(dialog).getByLabelText('Examen') as HTMLSelectElement;
    await vi.waitFor(() => expect([...exam.options].map(o => o.textContent)).toEqual(['Elige un examen', 'Examen general de orina', 'Glucosa']));
    await userEvent.type(within(dialog).getByLabelText('Dónde se hizo'), 'Laboratorio Ejemplo');
    await userEvent.selectOptions(exam, 'e-glu');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar examen' }));
    await userEvent.type(within(dialog).getByLabelText('Glucosa (mg/dL)'), '250');
    await userEvent.upload(within(dialog).getByLabelText(/Informe \(PDF o foto/), new File(['%PDF-1.4'], 'informe.pdf', { type: 'application/pdf' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar resultado' }));
    expect(write).toHaveBeenCalledWith('/laboratorio/pacientes/p-1/resultado-externo', expect.objectContaining({
      place: 'Laboratorio Ejemplo', results: [{ examId: 'e-glu', value: 250 }],
      attachment: expect.objectContaining({ fileName: 'informe.pdf', mimeType: 'application/pdf' }),
    }), 'POST');
    await vi.waitFor(() => expect(request.mock.calls.some(([path]) => path === '/laboratorio/adjuntos/att-9/archivo')).toBe(true));
    expect(onSaved).toHaveBeenCalledWith('Resultado externo de Ana Pérez Ficticia registrado: queda en «Resultados por revisar» para liberarlo.');
  });

  it('sin lugar, sin examen, sin valor o sin informe no deja registrar', async () => {
    const { write } = mount();
    const dialog = await screen.findByRole('dialog', { name: 'Registrar resultado externo' });
    expect((within(dialog).getByRole('button', { name: 'Registrar resultado' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar resultado' }));
    expect(write).not.toHaveBeenCalled();
  });
});
