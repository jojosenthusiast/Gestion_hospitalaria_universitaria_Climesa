import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { Field, LoginView } from '../components/ui';
import { Dialog, Select, Tag } from '../features/common';
import { HospitalShell } from '../features/shell';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); location.hash = ''; });

describe('etiquetas de estado en español (WEB-07 / W-08)', () => {
  it('los estados de fila, laboratorio e inventario no se muestran crudos', () => {
    render(<>{['en_espera', 'llamado', 'en_atencion', 'no_se_presento', 'en_proceso', 'bajo_minimo', 'vencido', 'critico_alto', 'sin_rango'].map(v => <Tag key={v} value={v} />)}</>);
    for (const label of ['En espera', 'Llamado', 'En atención', 'No se presentó', 'En proceso', 'Bajo mínimo', 'Vencido', 'Crítico alto', 'Sin rango']) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText(/_/)).toBeNull();
  });

  it('permite una etiqueta propia cuando el mismo código significa otra cosa en el módulo', () => {
    render(<Tag value="pendiente" label="Pendiente" />);
    expect(screen.getByText('Pendiente')).toBeTruthy();
  });
});

describe('accesibilidad de formularios y modales (W-10)', () => {
  it('el modal expone role="dialog", aria-modal y su título', () => {
    render(<Dialog title="Emitir número de fila" onClose={() => undefined}><p>Contenido</p></Dialog>);
    const dialog = screen.getByRole('dialog', { name: 'Emitir número de fila' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('el combo se anuncia por su etiqueta, no por la primera opción', () => {
    render(<Select label="Paciente" value="" onChange={() => undefined}><option value="">Selecciona un paciente</option></Select>);
    const select = screen.getByRole('combobox', { name: 'Paciente' });
    const label = document.querySelector(`label[for="${select.id}"]`);
    expect(select.id).not.toBe('');
    expect(label?.textContent).toBe('Paciente');
  });

  it('un campo con error queda aria-invalid y describe el error; la ayuda no forma parte de su nombre (WEB-11)', () => {
    render(<Field label="Motivo" value="" onChange={() => undefined} hint="Al menos 10 caracteres." error="El motivo es muy corto." />);
    const input = screen.getByLabelText('Motivo');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = input.getAttribute('aria-describedby')!.split(' ').map(id => document.getElementById(id)?.textContent);
    expect(described).toEqual(['Al menos 10 caracteres.', 'El motivo es muy corto.']);
  });

  it('sin error el campo no se marca inválido', () => {
    render(<Field label="Motivo" value="" onChange={() => undefined} />);
    expect(screen.getByLabelText('Motivo').getAttribute('aria-invalid')).toBeNull();
  });
});

