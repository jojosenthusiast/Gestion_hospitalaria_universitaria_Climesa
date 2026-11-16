import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api, Patient, Staff, UserAccount } from '../lib/api';
import { PatientsPage } from '../features/patients';
import { PersonnelPage } from '../features/personnel';
import { Heading, headerText } from '../features/common';
import { readHashParams, writeHashParams } from '../lib/hash-params';

afterEach(() => { cleanup(); location.hash = ''; });

const perfil = (permissions: [string, string][]): AccessProfile => ({
  id: 'u-1', user: { id: 'u-1' }, email: 'jop@example.test', name: 'Operaciones de prueba', roles: ['JOP'], platforms: ['web'],
  permissions: permissions.map(([code, context]) => ({ code, context })), channels: [], patientId: null, staffId: null,
});
const jop = perfil([['pacientes.buscar', 'x'], ['pacientes.ver_ficha', 'x'], ['admision.ver', 'x'], ['fila.ver', 'x'], ['citas.ver', 'x'], ['turnos.ver', 'x'], ['personal.ver', 'x']]);
const enfermeria = perfil([['pacientes.buscar', 'x'], ['admision.ver', 'area'], ['turnos.ver', 'x']]);

const paciente: Patient = { id: 'p1', record: 'EXP-000001', fullName: 'Rosa Ficticia', givenNames: 'Rosa', surnames: 'Ficticia', state: 'activo', active: true, sex: 'femenino', birth: '1990-05-01', version: 1, matchReason: '' };
const catalogo = { roles: [], areas: [{ id: 'area-1', parentId: null, type: 'area', code: 'P2', name: 'Hospitalización planta 2' }], staff: [{ id: 'med-1', name: 'Médica Ficticia', type: 'medico', specialty: null, areaId: null, area: null, registrations: [] }] };

function pacientes(profile: AccessProfile, lista: (path: string) => Patient[] = () => [paciente]) {
  const api = { request: vi.fn(async (path: string) => path === '/turnos/catalogo' ? catalogo : lista(path)), write: vi.fn() };
  render(<PatientsPage api={api as unknown as Api} profile={profile} version={0} />);
  return api;
}
const listCalls = (api: { request: ReturnType<typeof vi.fn> }) => api.request.mock.calls.map(([p]) => p as string).filter(p => p.startsWith('/pacientes?'));

describe('Pacientes · filtros del servidor', () => {
  it('la situación de hoy se pide al servidor, queda en la dirección y se quita con su chip', async () => {
    const api = pacientes(jop);
    await screen.findByText('Rosa Ficticia');
    expect(listCalls(api).at(-1)).toBe('/pacientes?limit=50&estado=vigente');
    await userEvent.click(screen.getByRole('button', { name: 'Hospitalizados' }));
    await waitFor(() => expect(listCalls(api).at(-1)).toBe('/pacientes?limit=50&estado=vigente&situacion=hospitalizado'));
    expect(readHashParams().get('situacion')).toBe('hospitalizado');
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtro Hospitalizados' }));
    await waitFor(() => expect(listCalls(api).at(-1)).toBe('/pacientes?limit=50&estado=vigente'));
    expect(readHashParams().get('situacion')).toBeNull();
  });

  it('área y médico tratante salen del catálogo y se combinan; «Quitar filtros» vuelve a la vista inicial', async () => {
    const api = pacientes(jop);
    await screen.findByText('Rosa Ficticia');
    await screen.findByRole('option', { name: 'Hospitalización planta 2' });
    await userEvent.selectOptions(screen.getByLabelText('Área de la cama'), 'area-1');
    await userEvent.selectOptions(screen.getByLabelText('Médico tratante'), 'med-1');
    await waitFor(() => expect(listCalls(api).at(-1)).toBe('/pacientes?limit=50&estado=vigente&areaId=area-1&medicoId=med-1'));
    const chips = screen.getByLabelText('Filtros activos');
    expect(within(chips).getByText('Área: Hospitalización planta 2')).toBeTruthy();
    expect(within(chips).getByText('Médico: Médica Ficticia')).toBeTruthy();
    await userEvent.click(within(chips).getByRole('button', { name: 'Quitar filtros' }));
    await waitFor(() => expect(listCalls(api).at(-1)).toBe('/pacientes?limit=50&estado=vigente'));
  });

  it('abre con los filtros de la dirección y explica el vacío de ese filtro', async () => {
    location.hash = '#/pacientes?situacion=en_fila&estado=todos';
    const api = pacientes(jop, () => []);
    expect(await screen.findByText('Sin pacientes en esta situación')).toBeTruthy();
    expect(screen.getByText(/Nadie está en la fila de hoy con estos filtros/)).toBeTruthy();
    expect(listCalls(api)[0]).toBe('/pacientes?limit=50&situacion=en_fila');
  });

  it('sin alcance global de admisiones no ofrece filtros de atención (el servidor los rechazaría)', async () => {
    const api = pacientes(enfermeria);
    await screen.findByText('Rosa Ficticia');
    expect(screen.queryByRole('group', { name: 'Situación de hoy' })).toBeNull();
    expect(screen.queryByLabelText('Área de la cama')).toBeNull();
    expect(api.request.mock.calls.some(([p]) => p === '/turnos/catalogo')).toBe(false);
  });
});

const persona = (id: string, givenNames: string, shiftToday: Staff['shiftToday'], area = 'Emergencia'): Staff => ({ id, givenNames, surnames: 'Ficticia', type: 'medico', areaId: area === 'Emergencia' ? 'a-1' : 'a-2', area, active: true, version: 1, shiftToday });
const equipo = [persona('s-1', 'Ana', 'de_turno'), persona('s-2', 'Bea', 'ausente'), persona('s-3', 'Carla', 'libre', 'Pediatría')];
const cuentas: UserAccount[] = [{ id: 'u-9', email: 'ana@example.test', name: 'Ana Ficticia', roles: ['MED'], state: 'activo', staffId: 's-1', version: 1, invitationState: null }];

function personal(lista: Staff[] = equipo, permisos: [string, string][] = [['personal.ver', 'x'], ['usuarios.ver', 'x']]) {
  const api = { request: vi.fn(async (path: string) => path === '/personal' ? lista : path === '/usuarios' ? cuentas : []), write: vi.fn() };
  render(<PersonnelPage api={api as unknown as Api} profile={perfil(permisos)} version={0} />);
  return api;
}

describe('Personal · filtros del directorio', () => {
  it('turno de hoy con conteos, chip activo y dirección', async () => {
    personal();
    await screen.findByText('Ana Ficticia');
    const grupo = screen.getByRole('group', { name: 'Turno de hoy' });
    expect(within(grupo).getByRole('button', { name: /De turno ahora\s*1/ })).toBeTruthy();
    await userEvent.click(within(grupo).getByRole('button', { name: /Ausentes/ }));
    expect(screen.queryByText('Ana Ficticia')).toBeNull();
    expect(screen.getByText('Bea Ficticia')).toBeTruthy();
    expect(readHashParams().get('turno')).toBe('ausente');
    expect(within(screen.getByLabelText('Filtros activos')).getByText('Ausentes hoy')).toBeTruthy();
  });

  it('área y rol de la cuenta se combinan; el vacío nombra el filtro', async () => {
    personal();
    await screen.findByText('Ana Ficticia');
    await userEvent.selectOptions(screen.getByLabelText('Área'), 'a-2');
    expect(screen.getByText('Carla Ficticia')).toBeTruthy();
    expect(screen.queryByText('Ana Ficticia')).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('Rol'), 'MED');
    expect(screen.getByText('Nadie con este rol')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    expect(screen.getByText('Ana Ficticia')).toBeTruthy();
    expect(location.hash.includes('?')).toBe(false);
  });

  it('abre desde la dirección: nadie de turno muestra su vacío propio', async () => {
    location.hash = '#/personal?turno=de_turno';
    personal([persona('s-3', 'Carla', 'libre')]);
    expect(await screen.findByText('Nadie de turno ahora')).toBeTruthy();
  });
});

describe('Cabecera de módulo', () => {
  it('quita el punto final de títulos y subtítulos de una frase, sin tocar textos de varias oraciones', () => {
    expect(headerText('Pacientes.')).toBe('Pacientes');
    expect(headerText('Agenda propia y cierre clínico.')).toBe('Agenda propia y cierre clínico');
    expect(headerText('Primera oración. Segunda oración.')).toBe('Primera oración. Segunda oración.');
    expect(headerText('Cargando…')).toBe('Cargando…');
  });

  it('un solo h1 sin punto y la acción principal junto al título', () => {
    render(<Heading eyebrow="Hospital" title="Camas." description="Estado de cada cama." actions={<button className="primary-button">Asignar</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Camas' })).toBeTruthy();
    expect(screen.getByText('Estado de cada cama')).toBeTruthy();
    expect(screen.getByRole('banner').querySelector('.heading-actions button')?.textContent).toBe('Asignar');
  });
});

describe('Filtros en la dirección', () => {
  it('escribe y quita parámetros sin perder la ruta ni la acción rápida', () => {
    location.hash = '#/personal?accion=invitar';
    writeHashParams({ turno: 'de_turno' });
    expect(location.hash).toBe('#/personal?accion=invitar&turno=de_turno');
    writeHashParams({ accion: null, turno: '' });
    expect(location.hash).toBe('#/personal');
  });
});
