import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
await mkdir('server-dist', { recursive: true });
await build({
  entryPoints: ['server/index.ts', 'server/engine-worker.ts'],
  outdir: 'server-dist',
  platform: 'node',
  format: 'esm',
  bundle: true,
  packages: 'external',
  target: 'node22',
  outExtension: { '.js': '.mjs' },
  external: ['../public/engine/dojo.js'],
  plugins: [
    {
      name: 'wasm-import',
      setup(b) {
        b.onResolve({ filter: /public\/engine\/dojo\.js$/ }, () => ({
          path: './engine/dojo.js',
          external: true,
        }));
      },
    },
  ],
});
await cp('public/engine', 'server-dist/engine', { recursive: true });
