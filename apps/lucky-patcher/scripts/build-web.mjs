// Build web: worker do SQLite -> expo export -> service worker (a casca abre sem rede).
//   node scripts/build-web.mjs <saida> [--diagnostico]
// --diagnostico (ou EXPO_PUBLIC_DIAGNOSTICO=1 no ambiente) liga a porta window.__mf (somente leitura).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateSW } from 'workbox-build';

const [saida = 'dist', ...opcoes] = process.argv.slice(2);
const diagnostico = opcoes.includes('--diagnostico') || process.env.EXPO_PUBLIC_DIAGNOSTICO === '1';
const ambiente = { ...process.env, EXPO_PUBLIC_DIAGNOSTICO: diagnostico ? '1' : '', NODE_ENV: 'production' };
const rodar = (comando, args) => execFileSync(comando, args, { stdio: 'inherit', env: ambiente, shell: process.platform === 'win32' });

rodar('node', ['scripts/worker.mjs']);
rodar('npx', ['expo', 'export', '--platform', 'web', '--output-dir', saida, '--clear']);

// Manifesto do PWA no index.html (o Expo nao gera).
const indice = join(saida, 'index.html');
writeFileSync(
  indice,
  readFileSync(indice, 'utf8')
    .replace('<html lang="en">', '<html lang="pt-BR">')
    .replace('</head>', '<link rel="manifest" href="/app/manifest.webmanifest"></head>'),
);

const { count, size, warnings } = await generateSW({
  globDirectory: saida,
  swDest: join(saida, 'sw.js'),
  modifyURLPrefix: { '': '/app/' },
  // A casca inteira (inclusive o SQLite em WebAssembly) abre sem rede.
  globPatterns: ['**/*.{js,css,html,wasm,woff2,ttf,svg,png,webmanifest}'],
  maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
  navigateFallback: '/app/index.html',
  navigateFallbackDenylist: [/^\/api\//],
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
});
for (const aviso of warnings) console.warn(aviso);
console.log(`service worker: ${count} arquivos (${(size / 1024 / 1024).toFixed(1)} MB) | diagnostico ${diagnostico ? 'LIGADO' : 'desligado'}`);
