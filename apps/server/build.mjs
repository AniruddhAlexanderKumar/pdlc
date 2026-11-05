// Bundles the server (and @sv/shared) into dist/. node_modules are kept external.
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts', 'src/scripts/migrate.ts', 'src/scripts/create-admin.ts'],
  outdir: 'dist',
  outbase: 'src',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  packages: 'external',
  // @sv/shared is TypeScript source inside the monorepo, so it must be bundled.
  plugins: [
    {
      name: 'bundle-shared',
      setup(b) {
        b.onResolve({ filter: /^@sv\/shared$/ }, () => ({ path: fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) }));
        b.onResolve({ filter: /^@sv\/cad-core$/ }, () => ({ path: fileURLToPath(new URL('../../packages/cad-core/src/index.ts', import.meta.url)) }));
      }
    }
  ],
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  logLevel: 'info'
});
