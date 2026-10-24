import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(function (_a) {
    var mode = _a.mode;
    return ({ plugins: [react()], server: { host: '127.0.0.1', allowedHosts: ['terminal.local'], port: 5173, strictPort: true }, build: { rollupOptions: { input: mode === 'design' ? { app: 'index.html', design: 'design-preview.html', modules: 'work-preview.html' } : { app: 'index.html' } } } });
});
