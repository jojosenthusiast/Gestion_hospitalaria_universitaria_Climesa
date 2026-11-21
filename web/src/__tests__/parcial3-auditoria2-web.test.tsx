import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { AmbulancePage, type AmbulanceStatus } from '../features/ambulance';
import { ClinicalHistoryDialog, type ClinicalHistory } from '../features/clinical-history';
import { labOrderStateLabel } from '../features/listas/lab-worklist';
import { combinedQueueState } from '../features/public-screen';
import { liveScope } from '../features/live-scope';
import { QueuePage } from '../features/queue';
import { Dashboard } from '../features/dashboards';
import { DayFigures, isTextFigure, type Figure } from '../features/dashboards/parts';
import { validatePatientDraft } from '../features/listas/patient-rules';
import type { Remote } from '../features/common';
import type { PublicQueue } from '../lib/publico';
import type { MetricsBoard } from '../features/tablero';
import permisosCsv from '../../../docs/arquitectura/datos/permisos.csv?raw';

// Second code audit of Parcial 3 (odd/tasks/parcial3-auditoria2.md, section Web).
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const profile = (permissions: string[], roles = ['REC']): AccessProfile => ({
  id: 'u-1', user: { id: 'u-1' }, email: 'p@example.test', name: 'Persona Ficticia', roles, platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: 's-1',
});

describe('W1 · reception still opens the report after the service finished', () => {
  const idle: AmbulanceStatus = { unit: { id: 'unit-1', plate: 'P-000-001', state: 'disponible', version: 4 }, activeService: null, paramedicOnDuty: true };
  const arrivals = { serviceId: 'svc-9', services: [{ serviceId: 'svc-9', dispatchedAt: '2026-11-20T15:00:00.000Z', active: false, arrived: true, state: 'finalizado', urgent: true, hasPrehospital: true }] };
  const apiFor = () => ({
    request: vi.fn(async (path: string) => path === '/ambulancia/llegada' ? arrivals : path.endsWith('/prehospital')
      ? { serviceId: 'svc-9', version: 3, active: false, arrived: true, priority: 'roja', patientLinked: false, clinical: true, handover: null, allowedActions: ['recibir'], reports: [] }
      : idle),
    write: vi.fn(),
  }) as unknown as Api & { request: ReturnType<typeof vi.fn> };

  it('lists «Por recibir» from /ambulancia/llegada and opens the prehospital report of a finished service', async () => {
    const api = apiFor();
    render(<AmbulancePage api={api} profile={profile(['ambulancia.ver_estado', 'ambulancia.recibir_prehospital'])} version={0} />);
    const pending = await screen.findByRole('region', { name: 'Por recibir' });
    expect(within(pending).getByText('Finalizado')).toBeTruthy();
    await userEvent.click(within(pending).getByRole('button', { name: 'Ver reporte prehospital' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reporte prehospital' });
    expect(api.request).toHaveBeenCalledWith('/ambulancia/servicios/svc-9/prehospital', expect.anything());
    expect(await within(dialog).findByRole('button', { name: 'Marcar recibido al paciente' })).toBeTruthy();
  });

  it('an account without ambulancia.recibir_prehospital does not read /ambulancia/llegada', async () => {
    const api = apiFor();
    render(<AmbulancePage api={api} profile={profile(['ambulancia.ver_estado'])} version={0} />);
    expect(await screen.findByRole('region', { name: 'Estado de la unidad' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Por recibir' })).toBeNull();
    expect(api.request.mock.calls.map(c => c[0])).not.toContain('/ambulancia/llegada');
  });
});

describe('W4 · lab order states in the history', () => {
  it('maps every order state to the Android words', () => {
    expect(labOrderStateLabel('pendiente')).toBe('Pendiente');
    expect(labOrderStateLabel('en_proceso')).toBe('En Proceso');
    expect(labOrderStateLabel('completado')).toBe('Completado');
    expect(labOrderStateLabel('cancelado')).toBe('Cancelado');
  });

  it('the clinical history reads «Pendiente», not «Pendiente de iniciar»', async () => {
    const history = { patient: { id: 'p-1', fullName: 'Paciente Ficticio', record: 'EXP-1' }, access: 'relacion', consultations: [], admissions: [], prescriptions: [],
      laboratory: [{ id: 'o-1', state: 'pendiente', createdAt: '2026-11-20T15:00:00.000Z', reviewedAt: null, items: [{ id: 'i-1', code: 'HB', name: 'Hemoglobina', result: null }] }] } as unknown as ClinicalHistory;
    const api = { request: vi.fn(async () => history), write: vi.fn() } as unknown as Api;
    render(<ClinicalHistoryDialog api={api} patientId="p-1" patientName="Paciente Ficticio" version={0} onClose={() => undefined} />);
    expect(await screen.findByText('Pendiente')).toBeTruthy();
    expect(screen.queryByText('Pendiente de iniciar')).toBeNull();
  });
});

describe('W3 · word figures wrap', () => {
  const state = { data: {}, loading: false, error: null, refresh: () => undefined } as Remote<unknown>;
  it('a word value gets is-text; a number does not', () => {
    const figures: Figure[] = [{ id: 'ambulancia', label: 'Ambulancia', value: 'En mantenimiento', state }, { id: 'camas', label: 'Camas libres', value: 5, state }];
    expect(isTextFigure(figures[0])).toBe(true);
    expect(isTextFigure(figures[1])).toBe(false);
    const { container } = render(<DayFigures figures={figures} />);
    expect(container.querySelector('[data-figure="ambulancia"] .figure-value')?.classList.contains('is-text')).toBe(true);
    expect(container.querySelector('[data-figure="camas"] .figure-value')?.classList.contains('is-text')).toBe(false);
  });
});

describe('W9 · «Números llamados» combines the four queues', () => {
  const remote = (over: Partial<Remote<PublicQueue>>): Remote<PublicQueue> => ({ data: null, loading: false, error: null, refresh: vi.fn(), ...over });
  const queue = { llamados: [{ numero: 'CON 7', consultorio: null }] } as unknown as PublicQueue;
  const failure = { status: 503 } as never;
  it('shows data when any queue has data, even if the first one failed', () => {
    const state = combinedQueueState([remote({ error: failure }), remote({ data: queue })]);
    expect(state.data).toEqual([queue]);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });
  it('loads while no queue has data yet, and fails only when every queue failed', () => {
    expect(combinedQueueState([remote({ loading: true }), remote({ loading: true })]).loading).toBe(true);
    const failed = combinedQueueState([remote({ error: failure }), remote({ error: failure })]);
    expect(failed.loading).toBe(false);
    expect(failed.error).toBe(failure);
    expect(failed.data).toBeNull();
  });
});

describe('W12 · week templates have their own live scope', () => {
  it('/turnos/plantillas reloads on plantilla_semana; /turnos keeps turno and personal', () => {
    expect(liveScope('/turnos/plantillas')).toEqual([{ entity: 'plantilla_semana' }]);
    expect(liveScope('/turnos?desde=2026-11-20')).toEqual([{ entity: 'turno' }, { entity: 'personal' }]);
  });
});

describe('W13 · «Deshacer llamado» only when the server allows it', () => {
  type Row = Record<string, unknown>;
  const ticket = (over: Row = {}): Row => ({ id: 't-7', service: 'consulta_general', area: 'CON', fecha: '2026-11-19', numero: 7, patientName: 'Paciente Ficticio Uno', state: 'en_espera', llamados: 0, version: 2, issuedAt: '2026-11-19T15:00:00Z', priority: 'rutina', appointmentAt: null, walkIn: true, maxCalls: 3, callsForAbsence: 3, allowedActions: ['llamar'], blockedActions: [], undoActions: [], ...over });
  it('after a call, a ticket the server cannot undo offers no undo on the card nor in the notice', async () => {
    let rows: Row[] = [ticket()];
    const api = {
      request: vi.fn(async (path: string) => path.startsWith('/fila/siguiente') ? { service: 'consulta_general', area: 'CON', rule: '', proposal: null } : path.startsWith('/espacios') ? [] : rows),
      write: vi.fn(async () => { rows = [ticket({ state: 'llamado', llamados: 1, version: 3, allowedActions: ['atender'], undoActions: [] })]; return { id: 't-7', version: 3, state: 'llamado', llamados: 1 }; }),
    } as unknown as Api & { write: ReturnType<typeof vi.fn> };
    render(<QueuePage api={api} profile={profile(['fila.ver', 'fila.llamar'])} version={0} />);
    const waiting = await screen.findByRole('region', { name: 'En espera' });
    await userEvent.click(within(waiting).getByRole('button', { name: /^Llamar/ }));
    await waitFor(() => expect(api.write).toHaveBeenCalled());
    const called = await screen.findByRole('region', { name: 'Llamados' });
    await within(called).findByText(/CON 7|7/);
    expect(screen.queryByRole('button', { name: /Deshacer/ })).toBeNull();
  });
  it('W14: the read-only badge names Recepción, Enfermería o Medicina', async () => {
    const api = { request: vi.fn(async (path: string) => path.startsWith('/espacios') ? [] : []), write: vi.fn() } as unknown as Api;
    render(<QueuePage api={api} profile={profile(['fila.ver'])} version={0} />);
    expect(await screen.findByText(/Recepción, Enfermería o Medicina/)).toBeTruthy();
  });
});

describe('W15 · the day report needs metricas.ver', () => {
  function permisosDe(rol: string) {
    const [cabecera, ...filas] = permisosCsv.replace(/^﻿/, '').trim().split(/\r?\n/);
    const columna = cabecera.split(',').indexOf(rol);
    return filas.map(f => f.split(',')).filter(c => c[columna]?.trim()).map(c => ({ code: c[0], context: c[columna].trim() }));
  }
  const hoy = new Date().toISOString();
  const board = { actualizadoEn: hoy, fecha: hoy.slice(0, 10), camas: { total: 1, libres: 1, ocupadas: 0, limpieza: 0, bloqueadas: 0, reservadas: 0 }, ocupacionPorPlanta: [], ambulancia: null,
    fila: { emitidos: 0, enEspera: 0, llamados: 0, enAtencion: 0, atendidos: 0, noSePresento: 0 }, laboratorio: { pendiente: 0, enProceso: 0, completadoHoy: 0, canceladoHoy: 0 }, cobertura: { huecos: 0, detalle: [] }, turnosEnCurso: 0, pacientesActivos: 0 } as unknown as MetricsBoard;
  const mount = (permissions: { code: string; context: string }[]) => {
    const api = { request: vi.fn(async (path: string) => path.startsWith('/metricas/tablero') ? board : path.startsWith('/inicio') ? { lastUpdate: hoy } : []), write: vi.fn() } as unknown as Api;
    render(<Dashboard api={api} profile={{ ...profile([], ['ADM']), staffId: null, permissions }} version={0} />);
  };
  it('ADM with metricas.ver gets «Reporte del día» with its text label kept on mobile', async () => {
    mount(permisosDe('ADM'));
    const button = await screen.findByRole('button', { name: /Reporte del día/ });
    expect(button.classList.contains('keep-label')).toBe(true);
  });
  it('ADM without metricas.ver gets no report', async () => {
    mount(permisosDe('ADM').filter(p => p.code !== 'metricas.ver'));
    await screen.findByRole('region', { name: 'Acciones rápidas' });
    expect(screen.queryByRole('button', { name: /Reporte del día/ })).toBeNull();
  });
});

describe('W16 · future birth date uses the El Salvador day', () => {
  const draft = { givenNames: 'Ana', surnames: 'Prueba' };
  it('at 19:00 in El Salvador (01:00 UTC next day) the next UTC day is still future', () => {
    const evening = new Date('2026-11-21T01:00:00Z');
    expect(validatePatientDraft({ ...draft, birth: '2026-11-21' }, evening).birth).toBe('La fecha de nacimiento no puede ser futura.');
    expect(validatePatientDraft({ ...draft, birth: '2026-11-20' }, evening).birth).toBeUndefined();
  });
  it('keeps the 120-year limit', () => {
    const now = new Date('2026-11-20T15:00:00Z');
    expect(validatePatientDraft({ ...draft, birth: '1906-11-19' }, now).birth).toBe('La fecha de nacimiento tiene más de 120 años: revísala.');
    expect(validatePatientDraft({ ...draft, birth: '1906-11-20' }, now).birth).toBeUndefined();
  });
});
