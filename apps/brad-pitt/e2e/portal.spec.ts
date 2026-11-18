// Roteiro do portal contra o backend real (passos 1–4, 8, 10, 13, 15, 16 e 17 do plano, §P.1).
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  ADMIN,
  ATENDIMENTO_COMPLETO,
  MIKE,
  PROFISSIONAL,
  QUEIXA_COMPLETO,
  anexosDoEmailPara,
  entrar,
  tokenDe,
  vigiarConsole,
} from './apoio';

test('login de ADMIN entra no portal e a sessão sobrevive a recarregar a página', async ({ page }) => {
  const erros = vigiarConsole(page);
  await entrar(page);
  await expect(page).toHaveURL(/\/portal\/atendimentos$/);
  await expect(page.getByText('Dados demonstrativos — sem validade clínica')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Logs de acesso' })).toBeVisible();

  // O access token só existe em memória: recarregar depende do refresh pelo cookie.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Livro de atendimentos' })).toBeVisible();
  await expect(page.getByText(ADMIN.nome).first()).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('heading', { name: 'Identificação profissional' })).toBeVisible();
  expect(erros).toEqual([]);
});

test('login inválido mostra o erro de credencial sem entrar', async ({ page }) => {
  await page.goto('./');
  // Registro aleatório: o limite de tentativas é por IP + registro e não pode travar os de demonstração.
  await page.getByLabel(/Número do/).fill(`9${Date.now() % 1_000_000}`);
  await page.getByLabel('Senha').fill('senha-errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toContainText('Registro ou senha não conferem');
  await expect(page).toHaveURL(/\/portal\/entrar$/);

  // Campos vazios não chegam a sair do navegador.
  await page.getByLabel(/Número do/).fill('');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Informe o número do registro.')).toBeVisible();
});

test('lista medicamentos, prontuários e atendimentos', async ({ page }) => {
  const erros = vigiarConsole(page);
  await entrar(page);

  await page.getByRole('link', { name: 'Medicamentos' }).click();
  const medicamentos = page.getByRole('table', { name: 'Medicamentos do cadastro de apoio' });
  await expect(medicamentos.getByRole('row')).not.toHaveCount(1);
  await expect(medicamentos.getByText('Adrenalina', { exact: true })).toBeVisible();
  await page.getByLabel('Buscar no cadastro').fill('epinefrina');
  await expect(medicamentos.getByRole('row')).toHaveCount(2); // cabeçalho + Adrenalina
  await page.getByLabel('Buscar no cadastro').fill('');
  await page.getByRole('checkbox', { name: 'Incluir inativos' }).check();
  await expect(page.getByText(/medicamentos?, com os inativos/)).toBeVisible();

  await page.getByRole('link', { name: 'Prontuários' }).click();
  const prontuarios = page.getByRole('table', { name: 'Prontuários' });
  // Linha de dado (as do esqueleto de carregamento não são clicáveis).
  await prontuarios.locator('tbody tr[data-clicavel]').first().click();
  await expect(page).toHaveURL(/\/prontuarios\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Prontuário', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Atendimentos desta pessoa' })).toBeVisible();

  await page.getByRole('link', { name: 'Atendimentos' }).click();
  const atendimentos = page.getByRole('table', { name: 'Livro de atendimentos' });
  // O atendimento de demonstracao pode nao estar na primeira pagina quando o banco tem muitos
  // registros de teste: basta haver linhas de dado.
  await expect(atendimentos.locator('tbody tr[data-clicavel]').first()).toBeVisible();
  // O roteiro recarrega a lista várias vezes: "Atualizar" busca de novo sem recarregar a página.
  const novaBusca = page.waitForResponse((r) => r.url().includes('/api/v1/atendimento?') && r.status() === 200);
  await page.getByRole('button', { name: 'Atualizar' }).first().click();
  await novaBusca;
  expect(erros).toEqual([]);
});

test('abre um atendimento, gera o PDF, baixa e envia por e-mail', async ({ page }) => {
  const erros = vigiarConsole(page);
  await entrar(page);
  // Pelo teclado: a linha recebe foco e Enter abre a ficha.
  const primeiraLinha = page.getByRole('table', { name: 'Livro de atendimentos' }).locator('tbody tr[data-clicavel]').first();
  await primeiraLinha.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/atendimentos\/[0-9a-f-]{36}$/);
  // O atendimento completo de demonstracao e aberto pelo endereco (independe da pagina da lista).
  await page.goto(`./atendimentos/${ATENDIMENTO_COMPLETO}`);
  await expect(page).toHaveURL(new RegExp(`/atendimentos/${ATENDIMENTO_COMPLETO}$`));

  // Passagem de caso e linha do tempo completa, com o evento retificado marcado.
  await expect(page.getByText('Passagem de caso')).toBeVisible();
  const linhaDoTempo = page.getByRole('region', { name: 'Linha do tempo' });
  await expect(linhaDoTempo.getByText('9 entradas')).toBeVisible();
  await expect(linhaDoTempo.getByText(/Retificado pela nº\s*6/i)).toBeVisible();
  await expect(linhaDoTempo.getByText(/Retifica nº\s*2/i)).toBeVisible();

  // Passo 16: gerar e baixar.
  await page.getByRole('button', { name: 'Gerar PDF' }).click();
  const ficha = page.getByRole('region', { name: 'Ficha em PDF e envios' });
  await expect(ficha.getByText('Íntegra')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), ficha.getByRole('button', { name: 'Baixar PDF' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^ficha-.+\.pdf$/);
  const pdf = await readFile(await download.path());
  expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');

  // Passo 17: enviar por e-mail e conferir no Mailpit.
  const destinatario = `familiar.${Date.now()}@exemplo.test`;
  await ficha.getByRole('button', { name: 'Enviar por e-mail' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Enviar a ficha por e-mail' });
  await dialogo.getByRole('button', { name: 'Enviar ficha' }).click();
  await expect(dialogo.getByText('Escolha o vínculo com o paciente.')).toBeVisible();
  await dialogo.getByLabel('Nome do destinatário').fill('Paula Fictícia');
  await dialogo.getByLabel('E-mail').fill(destinatario);
  await dialogo.getByRole('radio', { name: 'Familiar' }).check();
  await dialogo.getByRole('button', { name: 'Enviar ficha' }).click();
  await expect(dialogo).toBeHidden();

  // A situação sai de "Na fila" e chega a "Enviado" sem recarregar nada.
  const linha = ficha.getByRole('row').filter({ hasText: destinatario });
  await expect(linha).toBeVisible();
  await expect(linha.getByText('Enviado')).toBeVisible({ timeout: 45_000 });

  const anexos = await anexosDoEmailPara(destinatario);
  expect(anexos[0]?.ContentType).toBe('application/pdf');
  expect(anexos[0]?.FileName).toMatch(/\.pdf$/);
  expect(erros).toEqual([]);
});

test('verificação de documento exige login e volta para a mesma URL', async ({ page, browser }) => {
  // Descobre um documento pela tela (o teste anterior garantiu um; este gera se faltar).
  await entrar(page);
  await page.goto(`./atendimentos/${ATENDIMENTO_COMPLETO}`);
  const resposta = page.waitForResponse((r) => r.url().includes('/documento/ficha-atendimento'));
  await page.getByRole('button', { name: 'Gerar PDF' }).click();
  const documento = (await (await resposta).json()) as { id: string; codigoVerificacao: string };

  // Quem lê o QR chega sem sessão: outro contexto de navegador, sem cookie.
  const contexto = await browser.newContext();
  const visitante = await contexto.newPage();
  const erros = vigiarConsole(visitante);
  await visitante.goto(`./documentos/${documento.id}`);
  await expect(visitante).toHaveURL(/\/portal\/entrar$/);
  await entrar(visitante, ADMIN, `./documentos/${documento.id}`);
  await expect(visitante).toHaveURL(new RegExp(`/portal/documentos/${documento.id}$`));
  await expect(visitante.getByRole('heading', { name: 'Documento íntegro' })).toBeVisible();
  await expect(visitante.getByText(documento.codigoVerificacao)).toBeVisible();
  expect(erros).toEqual([]);
  await contexto.close();
});

test('PROFISSIONAL não vê nem acessa a auditoria', async ({ page }) => {
  const erros = vigiarConsole(page);
  await entrar(page, PROFISSIONAL);
  const indice = page.getByRole('navigation', { name: 'Seções do portal' });
  await expect(indice.getByRole('link', { name: 'Atendimentos' })).toBeVisible();
  await expect(indice.getByRole('link', { name: 'Logs de acesso' })).toHaveCount(0);
  await expect(indice.getByRole('link', { name: 'Possíveis duplicatas' })).toHaveCount(0);

  // Pelo endereço direto, a tela recusa sem chamar a API.
  await page.goto('./auditoria/acessos');
  await expect(page.getByText('Área restrita à administração')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  expect(erros).toEqual([]);

  // E o servidor também recusa (o portal não é a barreira).
  const direto = await fetch(`${MIKE}/api/v1/auditoria/acesso`, { headers: { Authorization: `Bearer ${await tokenDe(PROFISSIONAL)}` } });
  expect(direto.status).toBe(403);
});

test('ADMIN consulta os logs de acesso com filtro e as possíveis duplicatas', async ({ page }) => {
  const erros = vigiarConsole(page);
  await entrar(page);
  await page.getByRole('link', { name: 'Logs de acesso' }).click();
  const logs = page.getByRole('table', { name: 'Logs de acesso' });
  await expect(logs.getByRole('row').nth(1)).toBeVisible();

  const filtrada = page.waitForResponse((r) => r.url().includes('/auditoria/acesso') && r.url().includes('servico=jaiminho'));
  await page.getByLabel('Serviço').selectOption('jaiminho');
  await filtrada;
  await expect(logs.getByRole('row').nth(1)).toContainText('jaiminho');
  await page.getByLabel('Profissional').selectOption({ label: ADMIN.nome });
  await expect(logs.getByRole('row').nth(1)).toContainText(ADMIN.nome);
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page.getByLabel('Serviço')).toHaveValue('');

  await page.getByRole('link', { name: 'Possíveis duplicatas' }).click();
  await expect(page.getByRole('heading', { name: 'Possíveis duplicatas', level: 2 })).toBeVisible();
  await expect(page.getByText(/cadastros sinalizados|Nenhum cadastro sinalizado/).first()).toBeVisible();
  expect(erros).toEqual([]);
});
