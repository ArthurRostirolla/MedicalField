// Empacota o servico (fonte + @medicalfield/* + dependencias) em UM arquivo: dist/main.mjs.
// A imagem final so precisa do Node e desse arquivo - sem node_modules.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  legalComments: 'none',
  // Modulos opcionais que o Nest e o pg so carregam se estiverem instalados (nao usamos nenhum).
  external: [
    '@nestjs/microservices',
    '@nestjs/websockets',
    '@nestjs/platform-fastify',
    'class-transformer',
    'class-validator',
    'pg-native',
    'pg-cloudflare',
  ],
  // Dependencias CommonJS (express, pg) chamam require() de modulos nativos do Node.
  banner: { js: "import { createRequire as __criarRequire } from 'node:module';\nconst require = __criarRequire(import.meta.url);" },
  logLevel: 'info',
});
