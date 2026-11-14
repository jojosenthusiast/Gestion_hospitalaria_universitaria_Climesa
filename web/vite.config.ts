import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const deployedApiOrigin = 'https://sghu-api.onrender.com';

// TEMPORARY testing aid (docs/operacion/login-de-prueba.md). The test accounts reach the bundle only when
// VITE_DEMO_LOGIN=true: from VITE_DEMO_CREDENTIALS (Render) or, locally, from the git-ignored ../demo-credenciales.json.
// With the flag off the variable is defined as '' so no credential is ever inlined.
function demoCredentials(mode: string): string {
  const env = loadEnv(mode, process.cwd(), 'VITE_DEMO_');
  if (env.VITE_DEMO_LOGIN !== 'true') return '';
  if (env.VITE_DEMO_CREDENTIALS) return env.VITE_DEMO_CREDENTIALS;
  const file = fileURLToPath(new URL('../demo-credenciales.json', import.meta.url));
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

// SPA fallback without touching the Render dashboard: a static host serves `404.html` for an unknown path, so a deep link
// such as the e-mail landing `/aceptar-invitacion` renders the app instead of a 404 page (docs/operacion/correo-auth.md).
// render.yaml also declares the `/*` -> `/index.html` rewrite; this copy keeps working when that rewrite is not applied.
export function spaFallback(): Plugin {
  return {
    name: 'sghu-spa-404-fallback',
    apply: 'build',
    writeBundle(options) {
      const dir = options.dir ?? 'dist';
      if (existsSync(join(dir, 'index.html'))) copyFileSync(join(dir, 'index.html'), join(dir, '404.html'));
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), spaFallback()],
  define: { 'import.meta.env.VITE_DEMO_CREDENTIALS': JSON.stringify(demoCredentials(mode)) },
  server: {
    host: '127.0.0.1',
    allowedHosts: ['terminal.local'],
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/v1': {
        target: deployedApiOrigin,
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: mode === 'design'
        ? { app: 'index.html', design: 'design-preview.html', modules: 'work-preview.html' }
        : { app: 'index.html' } as Record<string, string>,
    },
  },
}));
