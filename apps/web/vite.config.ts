import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: ['.e2b.app'],
    proxy: {
      // Keep the browser's Origin header so the API's CSRF check sees http://localhost:5173.
      '/api': { target: 'http://localhost:4000' }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
