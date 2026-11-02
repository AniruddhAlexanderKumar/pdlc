import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** A static clean-URL entry gives social crawlers correct metadata without executing the SPA. */
function accessPageMetadata(): Plugin {
  let output = '';
  return {
    name: 'access-page-metadata',
    apply: 'build',
    configResolved(config) { output = resolve(config.root, config.build.outDir); },
    async closeBundle() {
      const root = await readFile(resolve(output, 'index.html'), 'utf8');
      const title = 'Request Early Access | Solution Velocity';
      const description = 'Request early access to Solution Velocity and tell us about your engineering workflow.';
      const page = root
        .replaceAll('Solution Velocity | Engineering Product Development Lifecycle Management', title)
        .replaceAll('Bring product records, engineering project work and collaboration together with Solution Velocity, an intelligent product development lifecycle workspace.', description)
        .replaceAll('Bring product records, engineering project work and collaboration together with Solution Velocity.', description)
        .replace('<link rel="canonical" href="https://pdlc.dalvigroup.co.in/" />', '<link rel="canonical" href="https://pdlc.dalvigroup.co.in/request-access" />')
        .replace('<meta property="og:url" content="https://pdlc.dalvigroup.co.in/" />', '<meta property="og:url" content="https://pdlc.dalvigroup.co.in/request-access" />');
      await writeFile(resolve(output, 'request-access.html'), page);
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), accessPageMetadata()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: ['.e2b.app'],
    proxy: {
      // Preserve the browser's Origin header for the API's configured CSRF check.
      '/api': { target: 'http://localhost:4000' }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
