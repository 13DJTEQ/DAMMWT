/**
 * Bundle React renderer to dist/renderer/ for Electron loadFile.
 * Renderer TSX is not part of the main `tsc` emit — use this script instead.
 */
const esbuild = require('esbuild');
const {
  mkdirSync,
  copyFileSync,
  cpSync,
  existsSync,
  readdirSync,
  rmSync,
} = require('fs');
const { join } = require('path');

const root = join(__dirname, '..');
const outdir = join(root, 'dist', 'renderer');
const brandSrc = join(root, 'src', 'renderer', 'assets', 'brand');
const brandOut = join(outdir, 'assets', 'brand');

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

  if (existsSync(brandSrc)) {
    rmSync(brandOut, { recursive: true, force: true });
    mkdirSync(brandOut, { recursive: true });
    cpSync(brandSrc, brandOut, { recursive: true });
    const count = readdirSync(brandOut).length;
    console.log(`Brand assets copied → dist/renderer/assets/brand/ (${count} files)`);
  } else {
    console.warn('No src/renderer/assets/brand/ found — logos will 404 in Electron');
  }

  console.log('Renderer bundled → dist/renderer/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
