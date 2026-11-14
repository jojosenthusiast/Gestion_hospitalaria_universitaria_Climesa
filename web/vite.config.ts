import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
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

export default defineConfig(({ mode }) => ({
  plugins: [react()],
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
        : { app: 'index.html' },
    },
  },
}));
