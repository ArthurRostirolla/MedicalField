// Valida o APK do LuckyPatcher num emulador/aparelho Android, dirigindo o WebView do app por
// depuracao remota (CDP). Exercita o adaptador NATIVO de SQLite (SQLCipher), que o navegador nao usa.
//
// Pre-requisitos: emulador/aparelho visivel em `adb devices`, APK de depuracao instalado
// (apps/lucky-patcher/docs/android.md), cluster local no ar (gateway em :8088) e MF_SENHA_DEMO.
//   node e2e/android/android.mjs
// No emulador, o host da maquina e 10.0.2.2; em aparelho fisico, defina MF_SERVIDOR_ANDROID.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCIAS = resolve(RAIZ, 'docs/testes/evidencias/android');
const ADB = process.env.ADB ?? `${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe`;
const PACOTE = 'br.medicalfield.cliente';
const SERVIDOR = process.env.MF_SERVIDOR_ANDROID ?? 'http://10.0.2.2:8088';
const PORTA = 9333;
const KUBECONFIG = resolve(RAIZ, 'deploy/.local/kubeconfig');
const senha = process.env.MF_SENHA_DEMO;
if (!senha) throw new Error('Defina MF_SENHA_DEMO (apps/mike-baguncinha/README.md).');

const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8' }).trim();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (consulta) =>
  execFileSync('kubectl', ['--kubeconfig', KUBECONFIG, '-n', 'medicalfield', 'exec', 'postgres-0', '--', 'psql', '-U', 'postgres', '-d', 'medicalfield', '-At', '-c', consulta], {
    encoding: 'utf8',
  }).trim();
const contar = (consulta) => Number(sql(consulta));

const resultados = [];
const passou = (nome, detalhe) => {
  resultados.push({ nome, detalhe });
  console.log(`ok  ${nome} — ${detalhe}`);
};
function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(`FALHOU: ${mensagem}`);
}

async function pidDoApp() {
  for (let i = 0; i < 40; i++) {
    let pid = '';
    try {
      pid = adb('shell', 'pidof', PACOTE);
    } catch {
      /* pidof devolve codigo 1 enquanto o processo nao existe */
    }
    if (pid) return pid;
    await dormir(500);
  }
  throw new Error('O app nao iniciou.');
}

/** (Re)abre o app e conecta o Playwright ao WebView dele. */
async function abrirApp({ limparDados = false } = {}) {
  adb('shell', 'am', 'force-stop', PACOTE);
  if (limparDados) adb('shell', 'pm', 'clear', PACOTE);
  adb('shell', 'am', 'start', '-n', `${PACOTE}/.MainActivity`);
  const pid = await pidDoApp();
  try {
    adb('forward', '--remove', `tcp:${PORTA}`);
  } catch {
    /* nao havia encaminhamento */
  }
  let navegador;
  for (let i = 0; i < 40 && !navegador; i++) {
    try {
      adb('forward', `tcp:${PORTA}`, `localabstract:webview_devtools_remote_${pid}`);
      navegador = await chromium.connectOverCDP(`http://127.0.0.1:${PORTA}`);
    } catch {
      await dormir(750);
    }
  }
  if (!navegador) throw new Error('Nao consegui conectar ao WebView (o APK e de depuracao?).');
  let pagina;
  for (let i = 0; i < 40 && !pagina; i++) {
    pagina = navegador.contexts().flatMap((c) => c.pages())[0];
    if (!pagina) await dormir(500);
  }
  if (!pagina) throw new Error('WebView sem pagina.');
  pagina.setDefaultTimeout(30_000);
  return { navegador, pagina };
}

const local = (pagina, consulta, params = []) => pagina.evaluate(([c, p]) => window.__mf.consultar(c, p), [consulta, params]);
const pendentes = async (pagina) => (await local(pagina, "SELECT count(*) AS n FROM outbox WHERE status != 'CONFIRMADA'"))[0].n;
const ir = async (pagina, rota) => {
  await pagina.evaluate((r) => (window.location.hash = r), rota);
  await dormir(400);
};
const captura = (nome) => {
  mkdirSync(EVIDENCIAS, { recursive: true });
  writeFileSync(resolve(EVIDENCIAS, `${nome}.png`), execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));
};
const chave = (pagina) => pagina.getByRole('switch', { name: /Simular conectividade/ });
async function simularOffline(pagina, ligado) {
  if (((await chave(pagina).getAttribute('aria-checked')) === 'true') !== ligado) await chave(pagina).click();
  await pagina.waitForFunction((l) => document.querySelector('[role=switch]')?.getAttribute('aria-checked') === String(l), ligado);
}
async function esperar(condicao, mensagem, tentativas = 60) {
  for (let i = 0; i < tentativas; i++) {
    if (await condicao()) return;
    await dormir(1000);
  }
  throw new Error(`FALHOU (tempo esgotado): ${mensagem}`);
}

const marca = Date.now().toString(36).toUpperCase();
const nomePessoa = `Pessoa Android ${marca}`;
const alergia = `Alergia Android ${marca}`;

let { navegador, pagina } = await abrirApp({ limparDados: true });
try {
  // 1. Primeiro acesso: endereco do servidor + login (pela rede do emulador ate o gateway do cluster).
  await pagina.getByLabel('Número do COREN').fill('200002');
  await pagina.getByLabel('Senha').fill(senha);
  await pagina.getByLabel('Endereço do servidor').fill(SERVIDOR);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await pagina.getByRole('heading', { name: 'Início', level: 1 }).waitFor();
  await esperar(async () => (await local(pagina, 'SELECT count(*) AS n FROM medicamento'))[0].n > 0, 'a descida inicial nao trouxe medicamentos');
  const medicamentos = (await local(pagina, 'SELECT count(*) AS n FROM medicamento'))[0].n;
  exigir(medicamentos === contar('SELECT count(*) FROM clinico.medicamento'), 'contagem local de medicamentos difere da central');
  captura('01-inicio-sincronizado');
  passou('Login e descida no Android', `${medicamentos} medicamentos no SQLite nativo, igual a central (servidor ${SERVIDOR})`);

  // 2. Offline pelo seletor: pessoa + prontuario (com alergia) + atendimento + evento.
  await simularOffline(pagina, true);
  await ir(pagina, '#/pacientes/novo');
  await pagina.getByLabel('Nome completo').fill(nomePessoa);
  await pagina.getByLabel('Alergias').fill(alergia);
  await pagina.getByRole('button', { name: 'Salvar e iniciar atendimento' }).click();
  await pagina.waitForFunction(() => /#\/atendimentos\//.test(window.location.hash));
  const atendimentoId = /atendimentos\/([0-9a-f-]{36})/.exec(await pagina.evaluate(() => window.location.hash))[1];
  await pagina.getByLabel('PA sistólica').fill('130');
  await pagina.getByLabel('PA diastólica').fill('85');
  await pagina.getByRole('button', { name: 'Registrar sinais vitais' }).click();
  await pagina.getByText(/Sinais vitais gravad/).waitFor();
  const filaAntes = await pendentes(pagina);
  exigir(filaAntes >= 4, `esperava ao menos 4 operacoes na fila, havia ${filaAntes}`);
  exigir(contar(`SELECT count(*) FROM clinico.atendimento WHERE id = '${atendimentoId}'`) === 0, 'o atendimento offline ja estava na central');
  captura('02-atendimento-offline');
  passou('Registro offline no Android', `${filaAntes} operacoes na fila; 0 linhas na central`);

  // 3. Mata o processo do app e reabre: dados e fila sobrevivem no banco nativo.
  await navegador.close();
  ({ navegador, pagina } = await abrirApp());
  await pagina.getByRole('heading', { level: 1 }).first().waitFor();
  await esperar(async () => typeof (await pagina.evaluate(() => typeof window.__mf?.consultar)) === 'string', 'app nao reabriu');
  const filaDepois = await pendentes(pagina);
  const pessoaLocal = await local(pagina, 'SELECT id FROM pessoa WHERE nome = ?', [nomePessoa]);
  exigir(filaDepois === filaAntes, `fila mudou apos matar o app: ${filaAntes} -> ${filaDepois}`);
  exigir(pessoaLocal.length === 1, 'pessoa criada offline sumiu apos reabrir');
  exigir((await chave(pagina).getAttribute('aria-checked')) === 'true', 'o modo simulado nao foi persistido');
  exigir(contar(`SELECT count(*) FROM clinico.atendimento WHERE id = '${atendimentoId}'`) === 0, 'sincronizou apesar do modo offline');
  captura('03-reaberto-com-pendencias');
  passou('Persistencia apos matar o app', `fila intacta (${filaDepois}), pessoa presente, seletor continua em Offline, sessao mantida sem novo login`);

  // 4. Volta a rede: sobe tudo, sem duplicar.
  await simularOffline(pagina, false);
  await esperar(async () => (await pendentes(pagina)) === 0, 'a fila nao esvaziou ao voltar a rede');
  const pessoaId = pessoaLocal[0].id;
  exigir(contar(`SELECT count(*) FROM clinico.pessoa WHERE id = '${pessoaId}'`) === 1, 'pessoa nao chegou a central');
  exigir(contar(`SELECT count(*) FROM clinico.atendimento WHERE id = '${atendimentoId}'`) === 1, 'atendimento nao chegou a central');
  exigir(contar(`SELECT count(*) FROM clinico.atendimento_evento WHERE atendimento_id = '${atendimentoId}'`) === 1, 'evento nao chegou a central');
  exigir(
    contar(`SELECT count(*) FROM clinico.prontuario_item pi JOIN clinico.prontuario p ON p.id = pi.prontuario_id WHERE p.pessoa_id = '${pessoaId}' AND pi.descricao = '${alergia}'`) === 1,
    'alergia nao chegou a central',
  );
  await ir(pagina, '#/');
  await pagina.getByRole('button', { name: 'Sincronizar agora' }).click();
  await dormir(3000);
  exigir(contar(`SELECT count(*) FROM clinico.pessoa WHERE nome = '${nomePessoa}'`) === 1, 'pessoa duplicada apos sincronizar de novo');
  captura('04-sincronizado');
  passou('Sincronizacao a partir do Android', '1 pessoa, 1 atendimento, 1 evento e 1 alergia na central; nova sincronizacao nao duplicou');

  // 5. O banco local e um arquivo SQLite nativo do app (nao o OPFS do navegador).
  const arquivos = adb('shell', 'run-as', PACOTE, 'ls', 'databases');
  exigir(/medicalfield/i.test(arquivos), `arquivo do banco nao encontrado: ${arquivos}`);
  let cifrado = 'nao verificado';
  try {
    const cabecalho = execFileSync(ADB, ['exec-out', 'run-as', PACOTE, 'head', '-c', '16', `databases/${arquivos.split(/\s+/).find((a) => /medicalfield.*\.db$/i.test(a))}`]);
    cifrado = cabecalho.toString('latin1').startsWith('SQLite format 3') ? 'NAO cifrado (cabecalho SQLite em claro)' : 'cifrado (sem cabecalho SQLite em claro)';
  } catch {
    /* sem acesso ao arquivo */
  }
  passou('Banco nativo', `arquivos em databases/: ${arquivos.replace(/\s+/g, ', ')} — ${cifrado}`);
} finally {
  await navegador.close().catch(() => {});
  mkdirSync(EVIDENCIAS, { recursive: true });
  writeFileSync(
    resolve(EVIDENCIAS, 'resultado.md'),
    [`# LuckyPatcher no Android — execução`, ``, `- Data: ${new Date().toISOString()}`, `- Dispositivo: ${adb('shell', 'getprop', 'ro.product.model')} (Android ${adb('shell', 'getprop', 'ro.build.version.release')})`, `- Servidor: ${SERVIDOR}`, ``, `| Verificação | Observado |`, `| --- | --- |`, ...resultados.map((r) => `| ${r.nome} | ${r.detalhe} |`), ``].join('\n'),
  );
}
console.log(`\n${resultados.length} de 5 verificacoes passaram`);
process.exit(resultados.length === 5 ? 0 : 1);
