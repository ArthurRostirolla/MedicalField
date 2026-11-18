// Teste de durabilidade do banco local no navegador (primeira tarefa da Fase 4).
// Grava numa transacao, MATA o navegador imediatamente (sem fechar a pagina) e reabre o mesmo perfil.
// Uso (com `npm run dev` no ar):  node e2e/durabilidade/durabilidade.mjs [sqlite-wasm|jeep|jeep-salvando]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const BASE = process.env.APP_URL ?? 'http://localhost:5182/app';
const RODADAS = 5;
const LINHAS = 200;

async function abrir(perfil, pagina) {
  const contexto = await chromium.launchPersistentContext(perfil, { headless: true, channel: process.env.CANAL ?? 'chrome' });
  const aba = contexto.pages()[0] ?? (await contexto.newPage());
  aba.on('pageerror', (erro) => console.log('  erro na página:', erro.message));
  await aba.goto(`${BASE}/e2e/durabilidade/${pagina}`);
  await aba.waitForFunction(() => window.pronto === true, null, { timeout: 30_000 });
  return { contexto, aba };
}

/** Mata (sem aviso) todo processo do navegador que usa este perfil. Windows: Stop-Process -Force; outros: pkill -9. */
function matar(perfil) {
  const marca = perfil.split(/[\/]/).at(-1);
  if (process.platform === 'win32') {
    const filtro = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${marca}*' -and $_.Name -match 'chrome|msedge' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    execFileSync('powershell', ['-NoProfile', '-Command', filtro], { stdio: 'ignore' });
  } else {
    try { execFileSync('pkill', ['-9', '-f', marca]); } catch {}
  }
}

async function rodar(nome, pagina, salvar) {
  const perfil = mkdtempSync(join(tmpdir(), 'mf-durab-'));
  let perdidas = 0;
  for (let rodada = 1; rodada <= RODADAS; rodada++) {
    const id = `r${rodada}`;
    const { contexto, aba } = await abrir(perfil, pagina);
    await aba.evaluate(([i, n, s]) => window.gravar(i, n, s), [id, LINHAS, salvar]);
    // A transacao retornou: derruba o processo do navegador na hora, sem unload nem fechamento gracioso.
    matar(perfil);
    await contexto.close().catch(() => undefined);

    const depois = await abrir(perfil, pagina);
    const achadas = await depois.aba.evaluate((i) => window.contar(i), id);
    await depois.contexto.close();
    const ok = achadas === LINHAS;
    if (!ok) perdidas++;
    console.log(`  ${nome} rodada ${rodada}: gravadas ${LINHAS}, encontradas após reabrir ${achadas} ${ok ? 'OK' : 'PERDEU'}`);
  }
  rmSync(perfil, { recursive: true, force: true, maxRetries: 5 });
  console.log(`${nome}: ${RODADAS - perdidas}/${RODADAS} rodadas duráveis\n`);
  return perdidas === 0;
}

const alvo = process.argv[2] ?? 'sqlite-wasm';
const casos = {
  'sqlite-wasm': () => rodar('sqlite-wasm + OPFS (opfs-sahpool)', 'sqlite-wasm.html', false),
  jeep: () => rodar('jeep-sqlite, só a transação', 'jeep.html', false),
  'jeep-salvando': () => rodar('jeep-sqlite, transação + saveToStore aguardado', 'jeep.html', true),
};
const duravel = await casos[alvo]();
process.exit(duravel ? 0 : 1);
