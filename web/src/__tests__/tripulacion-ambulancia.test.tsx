import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AccessProfile, type Api, type Shift } from '../lib/api';
import { AmbulancePage, type AmbulanceStatus } from '../features/ambulance';
import { CrewCoverageAlert, crewGaps } from '../features/shifts/CrewCoverageAlert';

// RN-30 ampliada: la ambulancia necesita paramédico Y motorista con turno en curso.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); location.hash = ''; });

const profile = (permissions: string[], roles = ['REC']): AccessProfile => ({
  id: 'staff-1', user: { id: 'staff-1' }, email: 'staff@example.test', name: 'Personal de prueba', roles, platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'global' })), channels: ['ambulancia'], patientId: null, staffId: 'staff-1',
});
const apiWith = (status: AmbulanceStatus) => ({ request: vi.fn().mockResolvedValue(status), write: vi.fn() }) as unknown as Api;
const sinMotorista: AmbulanceStatus = {
  unit: { id: 'unit-1', plate: 'P-000-001', state: 'disponible', version: 3 }, activeService: null, paramedicOnDuty: true, driverOnDuty: false,
  dispatchBlock: { code: 'sin_motorista_de_turno', message: 'No hay motorista con turno en curso.', action: 'Publica un turno de motorista que cubra la hora actual; la unidad no puede despacharse sin quien la conduzca (RN-30).' },
  pendingRequests: [],
};

describe('ambulancia sin motorista de turno (RN-30)', () => {
  it('muestra la cobertura de paramédico y de motorista por separado', async () => {
    render(<AmbulancePage api={apiWith(sinMotorista)} profile={profile(['ambulancia.ver_estado'])} version={0} />);
    expect(await screen.findByText('Paramédico de turno')).toBeTruthy();
    expect(screen.getByText('Sin motorista con turno en curso')).toBeTruthy();
  });

  it('quien despacha y planifica turnos ve el motivo y el atajo para publicar el turno de motorista', async () => {
    render(<AmbulancePage api={apiWith(sinMotorista)} profile={profile(['ambulancia.ver_estado', 'ambulancia.despachar', 'turnos.planificar'], ['JOP'])} version={0} />);
    const block = await screen.findByRole('region', { name: 'Despacho bloqueado' });
    expect(within(block).getByText(/No hay motorista con turno en curso/)).toBeTruthy();
    expect(within(block).getByRole('link', { name: 'Planificar turno de motorista' }).getAttribute('href')).toBe('#/turnos?accion=planificar');
  });

  it('quien despacha sin planificar turnos sabe a quién avisar', async () => {
    render(<AmbulancePage api={apiWith(sinMotorista)} profile={profile(['ambulancia.ver_estado', 'ambulancia.despachar'])} version={0} />);
    const block = await screen.findByRole('region', { name: 'Despacho bloqueado' });
    expect(within(block).queryByRole('link')).toBeNull();
    expect(within(block).getByText(/Avisa a la Jefatura de Operaciones para que publique el turno de un motorista/)).toBeTruthy();
  });

  it('sin motorista no deja salir de mantenimiento y lo explica', async () => {
    const enMantenimiento: AmbulanceStatus = { ...sinMotorista, unit: { ...sinMotorista.unit, state: 'en_mantenimiento' }, dispatchBlock: { code: 'en_mantenimiento', message: 'La unidad está en mantenimiento y no hay motorista con turno en curso.', action: 'Publica un turno de motorista que cubra la hora actual y luego saca la unidad de mantenimiento (RN-30).' } };
    render(<AmbulancePage api={apiWith(enMantenimiento)} profile={profile(['ambulancia.ver_estado', 'ambulancia.mantenimiento', 'turnos.planificar'], ['JOP'])} version={0} />);
    const boton = await screen.findByRole('button', { name: 'Sacar de mantenimiento' });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/ahora no hay motorista/)).toBeTruthy();
  });

  it('una API anterior sin driverOnDuty no muestra una alarma falsa', async () => {
    const { driverOnDuty: _omit, ...antigua } = { ...sinMotorista, dispatchBlock: null };
    render(<AmbulancePage api={apiWith(antigua as AmbulanceStatus)} profile={profile(['ambulancia.ver_estado'])} version={0} />);
    expect(await screen.findByText('Motorista de turno')).toBeTruthy();
  });
});

const turno = (id: string, staffId: string, start: string, end: string, state = 'publicado'): Shift => ({ id, staffId, person: id, areaId: 'a', area: 'Ambulancia', start, end, type: 'diurno', state, version: 1 });
const tipos: Record<string, string> = { par: 'paramedico', mot: 'motorista' };
const typeOf = (s: Shift) => tipos[s.staffId];
const h = (local: string) => Date.parse(`2026-11-16T${local}:00-06:00`);

describe('alerta de cobertura de la ambulancia en turnos (RN-30)', () => {
  it('agrupa en tramos las horas sin paramédico o sin motorista; borradores y cancelados no cubren', () => {
    const shifts = [
      turno('p1', 'par', '2026-11-16T07:00:00-06:00', '2026-11-16T14:00:00-06:00'),
      turno('m1', 'mot', '2026-11-16T07:00:00-06:00', '2026-11-16T11:00:00-06:00'),
      turno('m2', 'mot', '2026-11-16T11:00:00-06:00', '2026-11-16T14:00:00-06:00', 'borrador'),
      turno('m3', 'mot', '2026-11-16T12:00:00-06:00', '2026-11-16T14:00:00-06:00', 'cancelado'),
    ];
    expect(crewGaps(shifts, typeOf, h('07:00'), h('14:00'))).toEqual([{ role: 'motorista', from: h('11:00'), to: h('14:00') }]);
    expect(crewGaps(shifts, typeOf, h('06:00'), h('08:00'))).toEqual([{ role: 'motorista', from: h('06:00'), to: h('07:00') }, { role: 'paramedico', from: h('06:00'), to: h('07:00') }]);
  });

  it('muestra las horas que faltan y el atajo a asignar turno solo a quien planifica', () => {
    const shifts = [turno('p1', 'par', '2026-11-16T00:00:00-06:00', '2026-11-17T00:00:00-06:00')];
    const onPlan = vi.fn();
    render(<CrewCoverageAlert shifts={shifts} typeOf={typeOf} now={new Date(h('00:00'))} onPlan={onPlan} />);
    const alert = screen.getByRole('region', { name: 'Cobertura de la ambulancia' });
    expect(within(alert).getByText(/168 h sin motorista/)).toBeTruthy();
    expect(within(alert).getByText(/144 h sin paramédico/)).toBeTruthy();
    within(alert).getByRole('button', { name: 'Cubrir el tramo con un turno' }).click();
    expect(onPlan).toHaveBeenCalled();
    cleanup();
    render(<CrewCoverageAlert shifts={shifts} typeOf={typeOf} now={new Date(h('00:00'))} />);
    expect(screen.getByText(/Avisa a la Jefatura de Operaciones/)).toBeTruthy();
  });

  it('con cobertura completa no muestra nada', () => {
    const all = ['par', 'mot'].map(p => turno(p, p, '2026-11-16T00:00:00-06:00', '2026-11-23T00:00:00-06:00', 'en_curso'));
    const { container } = render(<CrewCoverageAlert shifts={all} typeOf={typeOf} now={new Date(h('00:30'))} />);
    expect(container.innerHTML).toBe('');
  });
});
