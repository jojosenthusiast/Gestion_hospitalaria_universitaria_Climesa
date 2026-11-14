// @vitest-environment node

import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from 'vite';
import { spaFallback } from '../../vite.config';

// Render serves dist/404.html for an unknown path: the e-mail links (/aceptar-invitacion, /confirmar-correo, /restablecer)
// must render the SPA even when the dashboard has no rewrite rule.
let dir = '';
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = ''; });

describe('build: 404.html para enlaces profundos', () => {
  it('la configuración de producción incluye el plugin', async () => {
    const config = await resolveConfig({ configFile: 'vite.config.ts' }, 'build', 'production');
    expect(config.plugins.some(p => p.name === 'sghu-spa-404-fallback')).toBe(true);
  });

  it('copia index.html como 404.html al escribir el build', () => {
    dir = mkdtempSync(join(tmpdir(), 'sghu-dist-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
    const hook = spaFallback().writeBundle as (options: { dir?: string }) => void;
    hook({ dir });
    expect(existsSync(join(dir, '404.html'))).toBe(true);
    expect(readFileSync(join(dir, '404.html'), 'utf8')).toBe(readFileSync(join(dir, 'index.html'), 'utf8'));
  });
});
