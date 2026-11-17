import { describe, expect, it } from 'vitest';
import { statusFamily, statusPriority } from '../components/system';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Vitest serves `?raw` CSS empty, so the sheets are read from disk.
const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
const modules = readFileSync(resolve(__dirname, '../modules.css'), 'utf8');

// R4a (coordinator, prod after R1): the «atención» badge read as dark text on solid blue. Every family badge must keep
// AA contrast (4.5:1) in light and dark, and its inner label must not inherit a colour from the surrounding card.
const block = (css: string, start: number) => {
  let depth = 0, i = css.indexOf('{', start);
  const from = i;
  for (; i < css.length; i++) { if (css[i] === '{') depth++; if (css[i] === '}' && --depth === 0) break; }
  return css.slice(from, i);
};
const tokens = (css: string) => Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2].toLowerCase()]));
const light = tokens(block(styles, styles.indexOf(':root')));
const dark = { ...light, ...tokens(block(styles, styles.indexOf('@media (prefers-color-scheme: dark)'))) };
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const FAMILIES = ['espera', 'llamado', 'atencion', 'listo', 'cerrado'];

describe('contraste de las familias de estado (AA)', () => {
  for (const [theme, t] of [['claro', light], ['oscuro', dark]] as const) {
    it(`tema ${theme}: texto de la familia sobre su fondo suave y sobre la superficie`, () => {
      for (const f of FAMILIES) {
        expect(ratio(t[`status-${f}`], t[`status-${f}-soft`]), `${f} sobre suave`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(t[`status-${f}`], t.surface), `${f} sobre superficie`).toBeGreaterThanOrEqual(4.5);
      }
      expect(ratio(t.critical, t['critical-soft'])).toBeGreaterThanOrEqual(4.5);
    });
    it(`tema ${theme}: el sólido (atención) tiene texto legible sobre el color de la familia`, () => {
      expect(ratio(t['on-status'], t['status-atencion'])).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('la etiqueta del badge sólido no hereda el color de la tarjeta que lo contiene', () => {
    expect(modules).toMatch(/\.status-badge\.pattern-solido\s*>\s*\*[^{]*\{[^}]*color:\s*var\(--on-status\)/);
    expect(modules).toMatch(/\.status-badge\.status-tag\s*>\s*\*[^{]*\{[^}]*color:\s*inherit/);
  });
});

describe('familias corregidas por el coordinador', () => {
  it('en proceso es atención (pulso), no llamado: solo «llamado» usa el megáfono', () => {
    expect(statusFamily('en_proceso')).toBe('atencion');
    const llamado = Object.entries({ llamado: statusFamily('llamado') }).filter(([, f]) => f === 'llamado');
    expect(llamado).toEqual([['llamado', 'llamado']]);
  });

  it('sin existencias se lee «Agotado» (urgente), no «Bajo mínimo» con reloj', () => {
    expect(statusPriority('agotado')).toBe('urgente');
  });
});
