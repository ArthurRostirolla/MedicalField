// Captura a vitrine em 1440 px e 390 px, tema claro e escuro, e falha se houver erro no console.
// Uso: npm run vitrine (em outro terminal) e depois npm run capturas [-- --secoes]
// Usa o Chrome instalado (playwright-core, sem baixar navegador).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.env.VITRINE_URL ?? 'http://localhost:5190';
const DESTINO = join(import.meta.dirname, '..', 'capturas');
const porSecao = process.argv.includes('--secoes');
mkdirSync(DESTINO, { recursive: true });

const navegador = await chromium.launch({ channel: process.env.CANAL ?? 'chrome' });
const erros = [];

async function capturar(nome, caminho, largura, altura, opcoes = {}) {
  const pagina = await navegador.newPage({ viewport: { width: largura, height: altura }, deviceScaleFactor: opcoes.escala ?? 1 });
  pagina.on('console', (mensagem) => mensagem.type() === 'error' && erros.push(`${nome}: ${mensagem.text()}`));
  pagina.on('pageerror', (erro) => erros.push(`${nome}: ${erro.message}`));
  await pagina.goto(BASE + caminho, { waitUntil: 'networkidle' });
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.waitForTimeout(400);
  if (opcoes.antes) await opcoes.antes(pagina);
  if (opcoes.inteira ?? true) {
    // Página inteira com a janela na altura do conteúdo: barras fixas ficam no lugar certo.
    const alturaTotal = await pagina.evaluate(() => document.documentElement.scrollHeight);
    await pagina.setViewportSize({ width: largura, height: Math.max(altura, alturaTotal) });
    await pagina.waitForTimeout(200);
  }
  await pagina.screenshot({ path: join(DESTINO, `${nome}.png`) });
  if (porSecao && opcoes.secoes) {
    for (const id of opcoes.secoes) {
      await pagina.locator(`#${id}`).screenshot({ path: join(DESTINO, `secao-${id}-${nome}.png`) });
    }
  }
  const rolagem = await pagina.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (rolagem > 0) erros.push(`${nome}: rolagem horizontal de ${rolagem}px`);
  await pagina.close();
}

const SECOES = ['principios', 'cor', 'tipografia', 'forma', 'componentes', 'composicoes'];

for (const tema of ['claro', 'escuro']) {
  await capturar(`vitrine-1440-${tema}`, `/?tema=${tema}`, 1440, 900, { secoes: SECOES });
  await capturar(`vitrine-390-${tema}`, `/?tema=${tema}`, 390, 844, { secoes: ['componentes'] });
  await capturar(`portal-1440-${tema}`, `/?vista=portal&tema=${tema}`, 1440, 900);
  await capturar(`app-390-${tema}`, `/?vista=app&tema=${tema}${tema === 'escuro' ? '&offline' : ''}`, 390, 844, { escala: 2 });
}
// Primeira dobra do app, como o profissional vê ao abrir.
await capturar('app-390-claro-dobra', '/?vista=app&tema=claro', 390, 844, { escala: 2, inteira: false });
await capturar('app-390-escuro-dobra', '/?vista=app&tema=escuro&offline', 390, 844, { escala: 2, inteira: false });
// Diálogo aberto no portal.
await capturar('portal-1440-claro-dialogo', '/?vista=portal&tema=claro', 1440, 900, {
  inteira: false,
  antes: async (pagina) => {
    await pagina.getByRole('button', { name: 'Enviar por e-mail' }).click();
    await pagina.waitForTimeout(300);
  },
});

await navegador.close();
if (erros.length > 0) {
  console.error('Erros no console ou de layout:\n' + erros.join('\n'));
  process.exit(1);
}
console.log(`Capturas salvas em ${DESTINO} — sem erro no console.`);
