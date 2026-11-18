import { copyFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');
const serve = watch || process.argv.includes('--serve');
const port = Number(process.env.PORT || 4173);
const outdir = resolve('build/assets');
const sources = { main: 'src/main.jsx', worker: 'dist/worker.mjs' };
const config = {
  entryPoints: sources,
  outdir,
  bundle: true,
  format: 'esm',
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  target: ['chrome109', 'firefox115', 'safari16.4'],
  jsx: 'automatic',
  minify: !watch,
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
};

await mkdir(outdir, { recursive: true });
if (!serve) {
  const chunkDir = resolve(outdir, 'chunks');
  for (const chunk of await readdir(chunkDir, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  })) {
    if (chunk.isFile() && /\.js$/.test(chunk.name)) await unlink(resolve(chunkDir, chunk.name));
  }
}
if (watch || !serve) await copyFile('index.html', 'build/index.html');

if (watch) {
  const app = await context(config);
  await app.watch();
  await app.serve({ servedir: 'build', host: '127.0.0.1', port });
  console.log(`Flowstate at http://127.0.0.1:${port}`);
} else if (serve) {
  // An empty build context can serve the prebuilt files without recompiling.
  const app = await context({ write: false, logLevel: 'error' });
  await app.serve({ servedir: 'build', host: '127.0.0.1', port });
  console.log(`Flowstate at http://127.0.0.1:${port}`);
} else {
  await build(config);
}
