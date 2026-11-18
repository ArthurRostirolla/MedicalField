// Apoio dos testes de ponta a ponta: SQL no banco central, login e os gestos do profissional.
import { execFileSync } from 'node:child_process';
import { expect, type Locator, type Page, type Request } from '@playwright/test';

/** Roda SQL no Postgres central (conteiner de dev) e devolve a saida crua (-At). */
export function sql(consulta: string): string {
  return execFileSync('docker', ['exec', 'medicalfield-dev-pg', 'psql', '-U', 'postgres', '-d', 'medicalfield', '-At', '-c', consulta], {
    encoding: 'utf8',
  }).trim();
}

export const contar = (consulta: string): number => Number(sql(consulta));

/** Nome unico por execucao, para o teste poder rodar varias vezes contra o mesmo banco. */
export const unico = (prefixo: string) => `${prefixo} ${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e4)}`;

export function senhaDemo(): string {
  const senha = process.env.MF_SENHA_DEMO;
  if (!senha) throw new Error('Defina MF_SENHA_DEMO com a senha de demonstração (apps/mike-baguncinha/README.md).');
  return senha;
}

/** Guarda toda requisicao a /api que a pagina emitir. */
export function vigiarApi(page: Page): { vistas: Request[]; limpar: () => void } {
  const vistas: Request[] = [];
  page.on('request', (requisicao) => {
    if (new URL(requisicao.url()).pathname.startsWith('/api/')) vistas.push(requisicao);
  });
  return { vistas, limpar: () => void (vistas.length = 0) };
}

/** Falha o teste se a pagina registrar erro no console ou excecao nao tratada. */
export function vigiarConsole(page: Page, ignorar: RegExp[] = []): string[] {
  const erros: string[] = [];
  const anotar = (texto: string) => {
    if (!ignorar.some((padrao) => padrao.test(texto))) erros.push(texto);
  };
  page.on('console', (mensagem) => mensagem.type() === 'error' && anotar(mensagem.text()));
  page.on('pageerror', (erro) => anotar(erro.message));
  return erros;
}

export async function entrar(page: Page, registro = '200002'): Promise<void> {
  await page.goto('/app/');
  await page.getByRole('radio', { name: 'COREN' }).click();
  await expect(page.getByRole('heading', { name: 'Entrar com COREN' })).toBeVisible();
  await page.getByLabel('Número do COREN').fill(registro);
  await page.getByLabel('Senha').fill(senhaDemo());
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Início', level: 1 })).toBeVisible();
  // A sincronizacao de abertura (subida + descida) terminou: a tira mostra a hora.
  await expect(page.getByRole('status').filter({ hasText: /sync \d\d:\d\d/ })).toBeVisible({ timeout: 30_000 });
}

/** Consulta o banco LOCAL do app pela porta de diagnostico (um SELECT; so existe com VITE_DIAGNOSTICO=1). */
export function local<T = Record<string, unknown>>(page: Page, consulta: string, params: Array<string | number | null> = []): Promise<T[]> {
  return page.evaluate(([c, p]) => (window as unknown as { __mf: { consultar: (s: string, p: unknown) => Promise<unknown[]> } }).__mf.consultar(c as string, p), [
    consulta,
    params,
  ] as const) as Promise<T[]>;
}

/** Chave nao sensivel de sync_estado (cursor, dispositivo_id...). A sessao nao sai pela porta de diagnostico. */
export const estadoLocal = (page: Page, chave: string): Promise<string | null> =>
  page.evaluate((c) => (window as unknown as { __mf: { estado: (c: string) => Promise<string | null> } }).__mf.estado(c), chave);

export const pendentesLocais = async (page: Page): Promise<number> =>
  (await local<{ n: number }>(page, "SELECT count(*) AS n FROM outbox WHERE status != 'CONFIRMADA'"))[0]!.n;

/** O seletor "Simular conectividade" fica no detalhe da linha de conexao: abre o detalhe se preciso. */
export async function chaveSimular(page: Page): Promise<Locator> {
  const chave = page.getByRole('switch', { name: /Simular conectividade/ });
  if (!(await chave.isVisible())) await page.getByRole('button', { name: 'Detalhes da conexão' }).first().click();
  return chave;
}

export async function simularOffline(page: Page, ligado: boolean): Promise<void> {
  const chave = await chaveSimular(page);
  if (((await chave.getAttribute('aria-checked')) === 'true') !== ligado) await chave.click();
  await expect(chave).toHaveAttribute('aria-checked', String(ligado));
  await expect(page.getByRole('status').filter({ hasText: ligado ? 'Offline' : 'Online' }).filter({ visible: true }).first()).toBeVisible();
}

export async function esperarTudoEnviado(page: Page): Promise<void> {
  await expect(page.getByText('Tudo enviado').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => pendentesLocais(page), { timeout: 30_000 }).toBe(0);
}

export async function sincronizar(page: Page): Promise<void> {
  await page.goto('/app/');
  await page.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(page.getByText(/^(Sincronizado\.|Não sincronizou)/)).toBeVisible({ timeout: 30_000 });
}

/** Cria paciente (com alergia) e ja abre o atendimento. Devolve os ids locais. */
export async function novoPacienteComAtendimento(page: Page, nome: string, alergia?: string): Promise<{ pessoaId: string; atendimentoId: string }> {
  await page.goto('/app/pacientes/novo');
  await page.getByLabel('Nome completo').fill(nome);
  if (alergia) await page.getByLabel('Alergias').fill(alergia);
  await page.getByRole('button', { name: 'Salvar e iniciar atendimento' }).click();
  await page.waitForURL(/\/atendimentos\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { name: nome, level: 1 })).toBeVisible();
  const atendimentoId = /atendimentos\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  const [atendimento] = await local<{ pessoa_id: string }>(page, 'SELECT pessoa_id FROM atendimento WHERE id = ?', [atendimentoId]);
  return { pessoaId: atendimento!.pessoa_id, atendimentoId };
}

const registrado = (page: Page, tipo: string) => expect(page.getByText(new RegExp(`${tipo} gravad`))).toBeVisible();

export async function registrarSinais(page: Page, sistolica = '128', diastolica = '84'): Promise<void> {
  await page.getByRole('radio', { name: 'Sinais' }).check({ force: true });
  await page.getByLabel('PA sistólica').fill(sistolica);
  await page.getByLabel('PA diastólica').fill(diastolica);
  await page.getByLabel('Freq. cardíaca').fill('92');
  await page.getByRole('button', { name: 'Registrar sinais vitais' }).click();
  await registrado(page, 'Sinais vitais');
}

export async function registrarGlasgow(page: Page): Promise<void> {
  await page.getByRole('radio', { name: 'Glasgow' }).check({ force: true });
  for (const [eixo, valor] of [['ocular', '4'], ['verbal', '5'], ['motora', '6']] as const) {
    await page.getByRole('group', { name: `Resposta ${eixo}` }).getByRole('radio', { name: new RegExp(`^${valor}(?![0-9])`) }).check({ force: true });
  }
  await page.getByRole('button', { name: 'Registrar Glasgow 15' }).click(); // o total e calculado
  await registrado(page, 'Glasgow');
}

export async function registrarTriagem(page: Page, cor = 'AMARELO'): Promise<void> {
  await page.getByRole('radio', { name: 'Triagem' }).check({ force: true });
  const classificacao = page.getByRole('radiogroup', { name: 'Classificação' });
  await expect(classificacao.getByRole('radio', { checked: true })).toHaveCount(0); // nada vem marcado: o profissional escolhe
  await classificacao.getByRole('radio', { name: cor[0] + cor.slice(1).toLowerCase(), exact: true }).check({ force: true });
  await page.getByRole('button', { name: 'Registrar triagem' }).click();
  await registrado(page, 'Triagem');
}

export async function registrarMedicacao(page: Page, medicamento: string | { foraDoCatalogo: string }): Promise<void> {
  await page.getByRole('radio', { name: 'Medicação' }).check({ force: true });
  if (typeof medicamento === 'string') {
    // O rotulo da opcao e "nome — apresentacao": escolhe pela que comeca com o nome.
    const campo = page.getByLabel('Medicamento', { exact: true });
    const valor = await campo.locator('option').filter({ hasText: new RegExp(`^${medicamento}`) }).first().getAttribute('value');
    await campo.selectOption(valor!);
  } else {
    await page.getByLabel('Medicamento', { exact: true }).selectOption({ label: 'Fora do catálogo (texto livre)' });
    await page.getByLabel('Nome do medicamento (fora do catálogo)').fill(medicamento.foraDoCatalogo);
  }
  await page.getByLabel('Dose').fill('10');
  await page.getByLabel('Unidade').fill('mg');
  await page.getByLabel('Via', { exact: true }).fill('EV');
  await page.getByRole('button', { name: 'Registrar medicação' }).click();
  await registrado(page, 'Medicação');
}

export async function registrarObservacao(page: Page, texto: string): Promise<void> {
  await page.getByRole('radio', { name: 'Observação' }).check({ force: true });
  await page.getByRole('textbox', { name: 'Observação' }).fill(texto);
  await page.getByRole('button', { name: 'Registrar observação' }).click();
  await registrado(page, 'Observação');
}
