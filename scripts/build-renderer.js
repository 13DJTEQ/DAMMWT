/**
 * Bundle React renderer to dist/renderer/ for Electron loadFile.
 * Renderer TSX is not part of the main `tsc` emit — use this script instead.
 */
const esbuild = require('esbuild');
const { mkdirSync, copyFileSync } = require('fs');
const { join } = require('path');

const root = join(__dirname, '..');
const outdir = join(root, 'dist', 'renderer');

async function main() {
  mkdirSync(outdir, { recursive: true });

  await esbuild.build({
    entryPoints: [join(root, 'src', 'renderer', 'index.tsx')],
    bundle: true,
    outfile: join(outdir, 'index.js'),
    platform: 'browser',
    target: ['chrome120'],
    format: 'iife',
    jsx: 'automatic',
    sourcemap: true,
    logLevel: 'info',
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
  });

  copyFileSync(
    join(root, 'src', 'renderer', 'styles.css'),
    join(outdir, 'styles.css')
  );
  copyFileSync(
    join(root, 'src', 'renderer', 'index.html'),
    join(outdir, 'index.html')
  );

  console.log('Renderer bundled → dist/renderer/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
