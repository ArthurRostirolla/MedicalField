// Serve um build web em /app/ (como o nginx da imagem): `node scripts/servir.mjs <pasta> <porta>`.
// Rota desconhecida cai no index.html (SPA); /api vai para os servicos locais, como o vite preview fazia.
// So para testes locais.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { extname, join, normalize } from 'node:path';

const [pasta = 'dist', porta = '5184'] = process.argv.slice(2);
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

// O prefixo nao e removido: cada servico atende em /api/v1/... (docs/contratos.md, secao 1).
const DESTINOS = [
  [/^\/api\/v1\/(auth|log|auditoria)(\/|$)/, 8081], // Mike
  [/^\/api\/v1\/documento(\/|$)/, 8083], // Jaiminho
  [/^\/api\/v1(\/|$)/, 8082], // Dona Cida
];

createServer((pedido, resposta) => {
  const destino = DESTINOS.find(([padrao]) => padrao.test(new URL(pedido.url ?? '/', 'http://x').pathname));
  if (destino) {
    const saida = request({ host: 'localhost', port: destino[1], path: pedido.url, method: pedido.method, headers: pedido.headers }, (volta) => {
      resposta.writeHead(volta.statusCode ?? 502, volta.headers);
      volta.pipe(resposta);
    });
    saida.on('error', () => resposta.writeHead(502).end());
    pedido.pipe(saida);
    return;
  }
  const caminho = decodeURIComponent(new URL(pedido.url ?? '/', 'http://x').pathname);
  if (caminho === '/' || caminho === '/app') {
    resposta.writeHead(302, { Location: '/app/' }).end();
    return;
  }
  if (!caminho.startsWith('/app/')) {
    resposta.writeHead(404).end();
    return;
  }
  const relativo = normalize(caminho.slice('/app/'.length)).replace(/^(\.\.[\\/])+/, '');
  let arquivo = join(pasta, relativo);
  if (!existsSync(arquivo) || statSync(arquivo).isDirectory()) arquivo = join(pasta, 'index.html');
  resposta.writeHead(200, {
    'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  createReadStream(arquivo).pipe(resposta);
}).listen(Number(porta), () => console.log(`${pasta} em http://localhost:${porta}/app/`));
