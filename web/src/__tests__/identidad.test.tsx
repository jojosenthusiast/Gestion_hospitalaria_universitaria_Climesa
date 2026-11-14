import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AreaChip, ROLE_CODES, RoleChip, areaIdentity, roleIdentity } from '../components/identity';

afterEach(cleanup);

describe('identidad de roles y áreas', () => {
  it('cada rol tiene icono y color propios', () => {
    const tonos = new Set(ROLE_CODES.map(code => roleIdentity(code).tone));
    expect(ROLE_CODES).toHaveLength(10);
    expect(tonos.size).toBe(10);
    for (const code of ROLE_CODES) expect(roleIdentity(code).label.length).toBeGreaterThan(2);
  });
  it('acepta el tipo de personal de la API y un valor desconocido no rompe', () => {
    expect(roleIdentity('medico').key).toBe('MED');
    expect(roleIdentity('enfermero').label).toBe('Enfermería');
    expect(roleIdentity('nueva_funcion').label).toBe('nueva_funcion');
    expect(roleIdentity(undefined).key).toBe('otro');
  });
  it('reconoce el área por su nombre sin tildes y cae al tipo de espacio', () => {
    expect(areaIdentity('Emergencia').key).toBe('emergencia');
    expect(areaIdentity('Hospitalización', 'planta').key).toBe('hospitalizacion');
    expect(areaIdentity('Planta 2', 'planta').key).toBe('planta');
    expect(areaIdentity('Sin pista').key).toBe('area');
  });
  it('el color nunca va solo: el chip lleva texto o, compacto, un nombre accesible', () => {
    render(<><RoleChip code="LAB" /><AreaChip name="Emergencia" compact /></>);
    expect(screen.getByText('Laboratorio')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Emergencia' })).toBeTruthy();
  });
});
