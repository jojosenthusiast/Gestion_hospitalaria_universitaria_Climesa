import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toneColor } from '../components/charts';
import { toneFor } from '../features/dashboards/parts';
import { occupancyTone } from '../features/tablero';

// Fase 2, R1 (S7, decision "rojo solo crítico"): red marks critical values and errors, never a state or a threshold.

const SRC = join(__dirname, '..');
const cssFiles = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) cssFiles(path, out);
    else if (path.endsWith('.css')) out.push(path);
  }
  return out;
};

/** A rule may use `--danger` only when its selector names an error (form, load, write or integrity failure). */
const ERROR_SELECTOR = /error|invalid|is-broken|has-conflict/i;

describe('un solo rojo (R1, WC-33 a WC-37)', () => {
  it('los tonos de gráficos y cifras no tienen un rojo genérico; pasar un umbral es urgente', () => {
    expect(Object.keys(toneColor)).not.toContain('danger');
    expect(toneColor.urgent).toBe('var(--priority-urgente)');
    expect(toneColor.critical).toBe('var(--critical)');
    expect(toneFor(20, 10, 15)).toBe('urgent');
    expect(occupancyTone(95)).toBe('urgent');
  });

  it('--danger solo aparece en reglas de error', () => {
    const offenders: string[] = [];
    for (const file of cssFiles(SRC)) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = m[1].trim(), body = m[2];
        if (selector.startsWith(':root') || selector.startsWith('@')) continue;
        if (/var\(--danger(-soft)?\)/.test(body) && !ERROR_SELECTOR.test(selector)) offenders.push(`${relative(SRC, file).replace(/\\/g, '/')}: ${selector}`);
      }
    }
    expect(offenders.join('\n'), 'reglas con rojo fuera de error').toBe('');
  });
});
