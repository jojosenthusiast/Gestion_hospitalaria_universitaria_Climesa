import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Empty } from '../features/common';
import { Panel, QuickActions } from '../features/dashboards/parts';
import type { AccessProfile } from '../lib/api';

// Fase 2, R1 (S1, S5): no helper sentence under titles, no second heading for an empty list, no "API" to the user.
afterEach(cleanup);

const SRC = join(__dirname, '..');
const tsx = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'generated') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) tsx(path, out);
    else if (path.endsWith('.tsx')) out.push(path);
  }
  return out;
};

describe('sin textos de ayuda (R1, WC-5, WC-16, WC-17, WC-22, WC-23)', () => {
  it('un panel es título y contenido, sin frase debajo', () => {
    render(<Panel title="Citas de hoy"><ul><li>09:00</li></ul></Panel>);
    expect(document.querySelector('.panel-hint, .dash-panel > p')).toBeNull();
  });

  it('una lista vacía es una línea, sin segundo título', () => {
    render(<Empty title="No hay citas" description="Prueba otro día." />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('No hay citas' + 'Prueba otro día.');
  });

  it('las acciones rápidas no imprimen su explicación; queda como tooltip', () => {
    const profile = { permissions: [{ code: 'x', context: 'global' }] } as unknown as AccessProfile;
    render(<QuickActions profile={profile} actions={[{ id: 'a', label: 'Registrar paciente', hint: 'Busca primero', icon: 'plus', href: '#/pacientes', permission: 'x' }]} />);
    expect(screen.queryByText('Busca primero')).toBeNull();
    expect(screen.getByRole('link', { name: /Registrar paciente/ }).getAttribute('title')).toBe('Busca primero');
  });

  it('ningún texto visible menciona la API', () => {
    const offenders: string[] = [];
    for (const file of tsx(SRC)) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
        if (/^\s*\*/.test(line)) return;
        // Text between tags, or a quoted literal, that says "API".
        if (/>[^<{]*\bAPI\b[^<]*</.test(code) || /(["'`])[^"'`]*\b(la|una|de la) API\b[^"'`]*\1/i.test(code)) offenders.push(`${relative(SRC, file).replace(/\\/g, '/')}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
