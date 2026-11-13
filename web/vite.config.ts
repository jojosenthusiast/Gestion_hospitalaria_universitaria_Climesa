import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const deployedApiOrigin = 'https://sghu-api.onrender.com';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
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
