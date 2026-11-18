// Compila o Worker do SQLite (src/banco/sqlite.worker.ts) para public/, junto com o sqlite3.wasm.
// O Metro nao empacota Workers; o Expo copia public/ para a raiz do build web.
import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const raiz = new URL('..', import.meta.url);
await build({
  entryPoints: [new URL('src/banco/sqlite.worker.ts', raiz).pathname.replace(/^\/(\w:)/, '$1')],
  outfile: new URL('public/sqlite.worker.js', raiz).pathname.replace(/^\/(\w:)/, '$1'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  logLevel: 'warning',
});
// O sqlite-wasm procura o .wasm ao lado do proprio modulo (import.meta.url = o worker).
const wasm = createRequire(import.meta.url).resolve('@sqlite.org/sqlite-wasm/sqlite3.wasm');
copyFileSync(wasm, new URL('public/sqlite3.wasm', raiz));
