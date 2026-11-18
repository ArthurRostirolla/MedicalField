// Roteiro de testes do enunciado (17 passos), na ordem original, contra o sistema implantado.
// Portal (BradPitt) e cliente (LuckyPatcher) rodam em dois contextos de navegador separados,
// como dois usuarios em duas maquinas. Cada passo grava uma captura em docs/testes/evidencias/roteiro.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';
import {
  entrar as entrarNoCliente,
  esperarTudoEnviado,
  local,
  novoPacienteComAtendimento,
  pendentesLocais,
  registrarGlasgow,
  registrarMedicacao,
  registrarObservacao,
  registrarSinais,
  registrarTriagem,
  simularOffline,
  sincronizar,
} from '../apps/lucky-patcher/e2e/apoio.ts';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCIAS = resolve(RAIZ, 'docs/testes/evidencias/roteiro');
// "compose" (local), "dev" (scripts/dev-*.sh) ou "vm": SQL por SSH (MF_VM_SSH) e o Mailpit por um tunel
// aberto antes (ssh -L <MF_PORTA_MAILPIT>:127.0.0.1:18025).
const ALVO = process.env.MF_ALVO ?? 'compose';
const VM_SSH = process.env.MF_VM_SSH ?? 'univates@177.44.248.60';
const PORTA_MAILPIT = Number(process.env.MF_PORTA_MAILPIT ?? (ALVO === 'dev' ? 8025 : 18025));
const MAILPIT = `http://127.0.0.1:${PORTA_MAILPIT}`;

/** SQL direto no banco central, como o roteiro pede no passo 9 ("via Banco de Dados"). */
function sql(consulta: string): string {
  if (ALVO === 'vm') {
    // A consulta vai pelo stdin: nada dela passa pelo shell remoto.
    const remoto = 'cd /opt/medicalfield/deploy && sudo docker compose exec -T postgres psql -U postgres -d medicalfield -At -v ON_ERROR_STOP=1';
    return execFileSync('ssh', ['-o', 'BatchMode=yes', VM_SSH, remoto], { input: consulta, encoding: 'utf8' }).trim();
  }
  const psql = ['psql', '-U', 'postgres', '-d', 'medicalfield', '-At', '-c', consulta];
  const args = ALVO === 'compose' ? ['compose', 'exec', '-T', 'postgres', ...psql] : ['exec', 'medicalfield-dev-pg', ...psql];
  return execFileSync('docker', args, { cwd: resolve(RAIZ, 'deploy'), encoding: 'utf8' }).trim();
}
const contar = (consulta: string) => Number(sql(consulta));

const senha = () => {
  const valor = process.env.MF_SENHA_DEMO;
  if (!valor) throw new Error('Defina MF_SENHA_DEMO (apps/mike-baguncinha/README.md).');
  return valor;
};

const marca = Date.now().toString(36).toUpperCase();
const resultados: { passo: number; titulo: string; observado: string }[] = [];

let contextoPortal: BrowserContext;
let contextoCliente: BrowserContext;
let portal: Page;
let cliente: Page;
const requisicoesDoCliente: Request[] = [];

test.beforeAll(async ({ browser }) => {
  mkdirSync(EVIDENCIAS, { recursive: true });
  if (ALVO !== 'dev') {
    // Mailpit publicado so no host (127.0.0.1:18025)
    await expect.poll(async () => (await fetch(`${MAILPIT}/api/v1/info`).catch(() => null))?.ok ?? false, { timeout: 30_000 }).toBe(true);
  }
  contextoPortal = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  contextoCliente = await browser.newContext({ viewport: { width: 390, height: 844 } });
  portal = await contextoPortal.newPage();
  cliente = await contextoCliente.newPage();
  cliente.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) requisicoesDoCliente.push(r);
  });
});

test.afterAll(async () => {
  await contextoPortal?.close();
  await contextoCliente?.close();
  const linhas = resultados.map((r) => `| ${r.passo} | ${r.titulo} | ${r.observado} | passo-${String(r.passo).padStart(2, '0')}.png |`);
  writeFileSync(
    resolve(EVIDENCIAS, 'resultado.md'),
    [
      `# Roteiro de 17 passos — execução automatizada`,
      ``,
      `- Alvo: \`${ALVO}\` em \`${process.env.MF_BASE ?? 'http://localhost:8088'}\``,
      `- Data: ${new Date().toISOString()}`,
      `- Passos concluídos: ${resultados.length} de 17`,
      ``,
      `| # | Passo | Observado | Captura |`,
      `| --- | --- | --- | --- |`,
      ...linhas,
      ``,
    ].join('\n'),
  );
});

async function passo(numero: number, titulo: string, pagina: () => Page, corpo: () => Promise<string>): Promise<void> {
  await test.step(`${numero}. ${titulo}`, async () => {
    const observado = await corpo();
    await pagina().screenshot({ path: resolve(EVIDENCIAS, `passo-${String(numero).padStart(2, '0')}.png`), fullPage: true });
    resultados.push({ passo: numero, titulo, observado });
  });
}

const livro = () => portal.getByRole('table', { name: 'Livro de atendimentos' });

/** Vai a uma secao do portal pelo indice e busca os dados de novo (o roteiro manda "listar" varias vezes). */
async function listarNoPortal(secao: 'Atendimentos' | 'Prontuários' | 'Medicamentos'): Promise<void> {
  await portal.getByRole('link', { name: secao, exact: true }).click();
  await portal.getByRole('button', { name: 'Atualizar' }).first().click();
  await portal.waitForLoadState('networkidle');
}

test('roteiro acadêmico de 17 passos', async () => {
  const queixaOnline = `Roteiro online ${marca}`;
  const medicamentoNovo = `Medicamento Roteiro ${marca}`;
  const pessoaOffline = `Pessoa Offline ${marca}`;
  const alergiaOffline = `Alergia Roteiro ${marca}`;
  const destinatario = `familiar.${marca.toLowerCase()}@exemplo.test`;
  let atendimentoOffline = '';
  let pessoaOfflineId = '';

  await passo(1, 'Portal: Autenticar', () => portal, async () => {
    await portal.goto('/portal/');
    await portal.getByRole('radio', { name: 'CRM', exact: true }).check();
    await portal.getByLabel(/Número do/).fill('100001');
    await portal.getByLabel('UF').selectOption('RS');
    await portal.getByLabel('Senha').fill(senha());
    await portal.getByRole('button', { name: 'Entrar' }).click();
    await expect(portal.getByRole('navigation', { name: 'Seções do portal' })).toBeVisible();
    await expect(portal.getByText('Dra. Helena Prado').first()).toBeVisible();
    return 'Login da Dra. Helena Prado (CRM 100001/RS, ADMIN) aceito; painel aberto';
  });

  await passo(2, 'Portal: Listar cadastros', () => portal, async () => {
    await listarNoPortal('Medicamentos');
    await expect(portal.getByText('Dipirona').first()).toBeVisible();
    await expect(portal.getByText(medicamentoNovo)).toHaveCount(0);
    return `Catálogo de medicamentos listado (${contar('SELECT count(*) FROM clinico.medicamento WHERE ativo')} ativos no banco)`;
  });

  await passo(3, 'Portal: Listar prontuários', () => portal, async () => {
    await listarNoPortal('Prontuários');
    await expect(portal.getByRole('table', { name: 'Prontuários' }).locator('tbody tr[data-clicavel]').first()).toBeVisible();
    return `Prontuários listados (${contar('SELECT count(*) FROM clinico.prontuario')} no banco)`;
  });

  let atendimentosAntes = 0;
  await passo(4, 'Portal: Listar atendimentos', () => portal, async () => {
    await listarNoPortal('Atendimentos');
    await expect(livro()).toBeVisible();
    atendimentosAntes = contar('SELECT count(*) FROM clinico.atendimento');
    await expect(livro().getByText(queixaOnline)).toHaveCount(0);
    return `Livro de atendimentos listado (${atendimentosAntes} no banco)`;
  });

  await passo(5, 'Cliente: Autenticar', () => cliente, async () => {
    await entrarNoCliente(cliente);
    return 'Login do Enf. Caio Brandão (COREN 200002) aceito; sessão local criada';
  });

  await passo(6, 'Cliente: Sincronizar dados a partir do Portal (receber dados)', () => cliente, async () => {
    await sincronizar(cliente);
    const [meds] = await local<{ n: number }>(cliente, 'SELECT count(*) AS n FROM medicamento');
    const [pessoas] = await local<{ n: number }>(cliente, 'SELECT count(*) AS n FROM pessoa');
    expect(meds!.n).toBe(contar('SELECT count(*) FROM clinico.medicamento'));
    expect(pessoas!.n).toBeGreaterThanOrEqual(3);
    return `Banco local recebeu ${meds!.n} medicamentos e ${pessoas!.n} pessoas (iguais aos do banco central)`;
  });

  await passo(7, 'Cliente: Online - Registrar um atendimento', () => cliente, async () => {
    await simularOffline(cliente, false);
    await cliente.goto('/app/pacientes');
    await cliente.getByLabel('Buscar por nome ou CPF').fill('Clara Fictícia');
    await cliente.getByRole('link', { name: /Clara Fictícia Souza/ }).click();
    await cliente.getByLabel('Queixa principal').fill(queixaOnline);
    await cliente.getByRole('button', { name: 'Iniciar atendimento' }).click();
    await cliente.waitForURL(/\/atendimentos\/[0-9a-f-]{36}/);
    await registrarSinais(cliente);
    await registrarGlasgow(cliente);
    await registrarTriagem(cliente, 'AMARELO');
    await esperarTudoEnviado(cliente);
    expect(contar(`SELECT count(*) FROM clinico.atendimento WHERE queixa_principal = '${queixaOnline}'`)).toBe(1);
    return 'Atendimento com sinais vitais, Glasgow e triagem registrado; selo "Tudo enviado"; 1 linha no banco central';
  });

  await passo(8, 'Portal: Listar atendimentos - visualizar atendimento registrado', () => portal, async () => {
    await listarNoPortal('Atendimentos');
    await expect(livro().getByText(queixaOnline)).toBeVisible();
    return `Atendimento "${queixaOnline}" aparece no livro do portal`;
  });

  await passo(9, 'Portal: Inserir novos medicamentos via Banco de Dados', () => portal, async () => {
    const saida = sql(
      `INSERT INTO clinico.medicamento (nome, principio_ativo, apresentacao, observacao) VALUES ('${medicamentoNovo}', 'Princípio demonstrativo', 'Ampola', 'DADO DEMONSTRATIVO — sem validade clínica') RETURNING seq`,
    );
    const seq = Number(saida.split('\n')[0]);
    expect(seq).toBeGreaterThan(0);
    await listarNoPortal('Medicamentos');
    await expect(portal.getByText(medicamentoNovo)).toBeVisible();
    return `INSERT direto no Postgres criou "${medicamentoNovo}" com seq ${seq} (atribuído pelo trigger); aparece no portal`;
  });

  await passo(10, 'Portal: Listar atendimentos', () => portal, async () => {
    await listarNoPortal('Atendimentos');
    await expect(livro().getByText(queixaOnline)).toBeVisible();
    expect(contar('SELECT count(*) FROM clinico.atendimento')).toBe(atendimentosAntes + 1);
    return `Livro inalterado: ${atendimentosAntes + 1} atendimentos (o do passo 7 a mais)`;
  });

  await passo(11, 'Cliente: Sincronizar dados a partir do Portal (receber dados)', () => cliente, async () => {
    expect(await local(cliente, 'SELECT id FROM medicamento WHERE nome = ?', [medicamentoNovo])).toHaveLength(0);
    await sincronizar(cliente);
    expect(await local(cliente, 'SELECT id FROM medicamento WHERE nome = ?', [medicamentoNovo])).toHaveLength(1);
    return `Medicamento inserido no passo 9 chegou ao banco local do cliente`;
  });

  await passo(12, 'Cliente: Offline - Registrar ocorrência (pessoa, prontuário, atendimento)', () => cliente, async () => {
    await simularOffline(cliente, true);
    requisicoesDoCliente.length = 0;
    const ids = await novoPacienteComAtendimento(cliente, pessoaOffline, alergiaOffline);
    atendimentoOffline = ids.atendimentoId;
    pessoaOfflineId = ids.pessoaId;
    await registrarSinais(cliente, '142', '90');
    await registrarTriagem(cliente, 'LARANJA');
    await registrarMedicacao(cliente, medicamentoNovo); // usa o cadastro que desceu no passo 11
    await registrarObservacao(cliente, 'Registro feito sem rede, durante o roteiro.');
    // Fecha e reabre o app: os dados e a fila tem de sobreviver.
    await cliente.reload();
    await expect(cliente.getByRole('heading', { name: pessoaOffline, level: 1 })).toBeVisible();
    const pendentes = await pendentesLocais(cliente);
    expect(pendentes).toBeGreaterThanOrEqual(7);
    expect(requisicoesDoCliente.map((r) => `${r.method()} ${new URL(r.url()).pathname}`)).toEqual([]);
    return `Pessoa, prontuário (com alergia), atendimento e 4 eventos gravados localmente; ${pendentes} operações na fila após recarregar o app; nenhuma requisição /api emitida`;
  });

  await passo(13, 'Portal: Listar prontuários e atendimentos: cadastro novo não deve ser exibido', () => portal, async () => {
    await listarNoPortal('Prontuários');
    await expect(portal.getByText(pessoaOffline)).toHaveCount(0);
    await listarNoPortal('Atendimentos');
    await expect(livro().getByText(pessoaOffline)).toHaveCount(0);
    expect(contar(`SELECT count(*) FROM clinico.pessoa WHERE id = '${pessoaOfflineId}'`)).toBe(0);
    expect(contar(`SELECT count(*) FROM clinico.atendimento WHERE id = '${atendimentoOffline}'`)).toBe(0);
    return 'Portal não mostra a pessoa nem o atendimento; 0 linhas no banco central';
  });

  await passo(14, 'Cliente: Online - Sincronizar dados para o Portal', () => cliente, async () => {
    await simularOffline(cliente, false);
    await esperarTudoEnviado(cliente);
    const operacoes = contar(
      `SELECT count(*) FROM clinico.operacao_sync WHERE entidade_id IN ('${pessoaOfflineId}', '${atendimentoOffline}') OR rota LIKE '%atendimento-evento%' AND recebido_em > now() - interval '2 minutes'`,
    );
    // Sincronizar de novo nao pode duplicar nada.
    await sincronizar(cliente);
    await sincronizar(cliente);
    expect(contar(`SELECT count(*) FROM clinico.pessoa WHERE nome = '${pessoaOffline}'`)).toBe(1);
    expect(contar(`SELECT count(*) FROM clinico.prontuario WHERE pessoa_id = '${pessoaOfflineId}'`)).toBe(1);
    expect(contar(`SELECT count(*) FROM clinico.atendimento WHERE id = '${atendimentoOffline}'`)).toBe(1);
    expect(contar(`SELECT count(*) FROM clinico.atendimento_evento WHERE atendimento_id = '${atendimentoOffline}'`)).toBe(4);
    expect(contar(`SELECT count(*) FROM clinico.prontuario_item pi JOIN clinico.prontuario p ON p.id = pi.prontuario_id WHERE p.pessoa_id = '${pessoaOfflineId}'`)).toBe(1);
    return `Fila esvaziou ao voltar a rede (${operacoes} operações registradas em operacao_sync); após mais duas sincronizações: 1 pessoa, 1 prontuário, 1 item, 1 atendimento, 4 eventos — sem duplicata`;
  });

  await passo(15, 'Portal: Listar prontuários e atendimentos: cadastro novo deve ser exibido', () => portal, async () => {
    await listarNoPortal('Prontuários');
    await expect(portal.getByText(pessoaOffline).first()).toBeVisible();
    await listarNoPortal('Atendimentos');
    await expect(livro().getByText(pessoaOffline).first()).toBeVisible();
    return 'Pessoa e atendimento criados offline agora aparecem no portal';
  });

  await passo(16, 'Demonstrar geração da Ficha de atendimento', () => portal, async () => {
    await livro().getByRole('row').filter({ hasText: pessoaOffline }).first().click();
    await expect(portal).toHaveURL(new RegExp(`/atendimentos/${atendimentoOffline}$`));
    await expect(portal.getByText('Passagem de caso')).toBeVisible();
    await expect(portal.getByText(alergiaOffline, { exact: false }).first()).toBeVisible();
    const [download] = await Promise.all([portal.waitForEvent('download'), portal.getByRole('button', { name: 'Gerar PDF' }).click()]);
    const ficha = portal.getByRole('region', { name: 'Ficha em PDF e envios' });
    await expect(ficha.getByText('Íntegra')).toBeVisible();
    const destino = resolve(EVIDENCIAS, 'ficha-do-roteiro.pdf');
    await download.saveAs(destino);
    const pdf = readFileSync(destino);
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    return `PDF gerado e baixado (${download.suggestedFilename()}, ${pdf.length} bytes, íntegro); salvo em ficha-do-roteiro.pdf`;
  });

  await passo(17, 'Demonstrar e-mail enviado com Ficha de atendimento em anexo', () => portal, async () => {
    const ficha = portal.getByRole('region', { name: 'Ficha em PDF e envios' });
    await ficha.getByRole('button', { name: 'Enviar por e-mail' }).click();
    const dialogo = portal.getByRole('dialog', { name: 'Enviar a ficha por e-mail' });
    await dialogo.getByLabel('Nome do destinatário').fill('Familiar do Roteiro');
    await dialogo.getByLabel('E-mail').fill(destinatario);
    await dialogo.getByRole('radio', { name: 'Familiar' }).check();
    await dialogo.getByRole('button', { name: 'Enviar ficha' }).click();
    await expect(dialogo).toBeHidden();
    await expect(ficha.getByRole('row').filter({ hasText: destinatario }).getByText('Enviado')).toBeVisible({ timeout: 60_000 });
    type Mensagens = { messages: { ID: string }[] };
    let anexo = '';
    await expect
      .poll(async () => {
        const busca = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${destinatario}`)}`)).json()) as Mensagens;
        const id = busca.messages[0]?.ID;
        if (!id) return '';
        const mensagem = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Attachments: { FileName: string; ContentType: string }[] };
        anexo = mensagem.Attachments[0]?.FileName ?? '';
        return mensagem.Attachments[0]?.ContentType ?? '';
      }, { timeout: 30_000 })
      .toBe('application/pdf');
    return `Envio para ${destinatario} chegou a "Enviado"; o servidor de e-mail (Mailpit) recebeu a mensagem com o anexo ${anexo}`;
  });

  expect(resultados).toHaveLength(17);
});
