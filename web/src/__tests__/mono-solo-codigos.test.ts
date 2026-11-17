import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Fase 2, R1 (S5 "monoespaciada solo donde aporta"): the mono face is for codes only (ficha, ticket, DUI, CIE-10,
// bed, area and role code chips). Labels, headers, KPI values and times are sans with tabular figures.
const SRC = join(__dirname, '..');
const cssFiles = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) cssFiles(path, out);
    else if (path.endsWith('.css')) out.push(path);
  }
  return out;
};
/** Selectors that hold a code. A new code style must be named here with the code it shows. */
const CODE_SELECTOR = /\bcode\b|mono|area-code|bed-row strong|bed-glyph strong|role-tags|role-checks small/;

describe('monoespaciada solo para códigos (R1, WC-59)', () => {
  it('ninguna regla fuera de códigos usa la fuente mono', () => {
    const offenders: string[] = [];
    for (const file of cssFiles(SRC)) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = m[1].trim();
        if (selector.startsWith(':root') || selector.startsWith('@')) continue;
        if (/font-family:[^;]*(Mono|monospace|--font-mono)/.test(m[2]) && !CODE_SELECTOR.test(selector)) offenders.push(`${relative(SRC, file).replace(/\\/g, '/')}: ${selector}`);
      }
    }
    expect(offenders.join('\n'), 'mono fuera de códigos').toBe('');
  });
});
