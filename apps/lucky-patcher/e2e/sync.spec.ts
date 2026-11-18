// Cenarios de ponta a ponta contra o backend REAL, conferindo o banco central por SQL.
import { expect, test, type Page, type Route } from '@playwright/test';
import {
  contar,
  entrar,
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
  sql,
  unico,
  vigiarApi,
  vigiarConsole,
} from './apoio.ts';

const noCentral = {
  pessoas: (nome: string) => contar(`SELECT count(*) FROM clinico.pessoa WHERE nome = '${nome}'`),
  prontuarios: (pessoaId: string) => contar(`SELECT count(*) FROM clinico.prontuario WHERE pessoa_id = '${pessoaId}'`),
  itens: (pessoaId: string) =>
    contar(`SELECT count(*) FROM clinico.prontuario_item i JOIN clinico.prontuario p ON p.id = i.prontuario_id WHERE p.pessoa_id = '${pessoaId}'`),
  atendimentos: (pessoaId: string) => contar(`SELECT count(*) FROM clinico.atendimento WHERE pessoa_id = '${pessoaId}'`),
  eventos: (atendimentoId: string) => contar(`SELECT count(*) FROM clinico.atendimento_evento WHERE atendimento_id = '${atendimentoId}'`),
};

const ehEscritaClinica = (rota: Route) => {
  const requisicao = rota.request();
  const caminho = new URL(requisicao.url()).pathname;
  return requisicao.method() !== 'GET' && !caminho.startsWith('/api/v1/auth') && caminho !== '/api/v1/log';
};

/** Estado do outbox local, na ordem de envio. */
const fila = (page: Page) => local<{ rota: string; status: string }>(page, 'SELECT rota, status FROM outbox ORDER BY ordem');

test('1. login, sincronizar: medicamentos e pessoas ficam no banco local', async ({ page }) => {
  const erros = vigiarConsole(page);
  await entrar(page);
  await sincronizar(page);
  await expect(page.getByText(/^Sincronizado\./)).toBeVisible();

  const [medicamentos] = await local<{ n: number }>(page, 'SELECT count(*) AS n FROM medicamento');
  const [pessoas] = await local<{ n: number }>(page, 'SELECT count(*) AS n FROM pessoa');
  expect(medicamentos!.n).toBe(contar('SELECT count(*) FROM clinico.medicamento'));
  expect(pessoas!.n).toBe(contar('SELECT count(*) FROM clinico.pessoa'));
  const [cursor] = await local<{ valor: string }>(page, "SELECT valor FROM sync_estado WHERE chave = 'cursor'");
  expect(Number(cursor!.valor)).toBeGreaterThan(0);

  // E a interface le do banco local: a busca acha uma pessoa que so veio pela descida.
  await page.goto('/app/#/pacientes');
  await page.getByLabel('Buscar por nome ou CPF').fill('Clara Fictícia');
  await expect(page.getByRole('link', { name: /Clara Fictícia Souza/ })).toBeVisible();
  expect(erros).toEqual([]);
});

test('2. online: atendimento com eventos aparece no banco central', async ({ page }) => {
  const erros = vigiarConsole(page);
  await entrar(page);
  await esperarTudoEnviado(page);

  await page.goto('/app/#/pacientes');
  await page.getByLabel('Buscar por nome ou CPF').fill('João Teste');
  await page.getByRole('link', { name: /João Teste Pereira/ }).click();
  const queixa = unico('Dor torácica');
  await page.getByLabel('Queixa principal').fill(queixa);
  await page.getByRole('button', { name: 'Iniciar atendimento' }).click();
  await page.waitForURL(/#\/atendimentos\//);
  await expect(page.getByRole('heading', { name: 'João Teste Pereira', level: 1 })).toBeVisible();
  const atendimentoId = /atendimentos\/([0-9a-f-]{36})/.exec(page.url())![1]!;

  await registrarSinais(page);
  await registrarGlasgow(page);
  await registrarTriagem(page, 'AMARELO');
  await registrarMedicacao(page, 'Dipirona');
  await esperarTudoEnviado(page);

  expect(sql(`SELECT queixa_principal || '|' || status || '|' || profissional_nome FROM clinico.atendimento WHERE id = '${atendimentoId}'`)).toBe(
    `${queixa}|ABERTO|Enf. Caio Brandão`,
  );
  expect(sql(`SELECT string_agg(tipo, ',' ORDER BY ocorrido_em) FROM clinico.atendimento_evento WHERE atendimento_id = '${atendimentoId}'`)).toBe(
    'SINAIS_VITAIS,GLASGOW,TRIAGEM,MEDICACAO',
  );
  expect(sql(`SELECT dados->>'total' FROM clinico.atendimento_evento WHERE atendimento_id = '${atendimentoId}' AND tipo = 'GLASGOW'`)).toBe('15');
  expect(contar(`SELECT count(*) FROM clinico.atendimento_evento WHERE atendimento_id = '${atendimentoId}' AND medicamento_id IS NOT NULL`)).toBe(1);
  // Os selos da linha do tempo ficaram "confirmado".
  expect(await local(page, "SELECT id FROM atendimento_evento WHERE atendimento_id = ? AND estado_sync != 'CONFIRMADO'", [atendimentoId])).toEqual([]);
  expect(erros).toEqual([]);
});

test('3. medicamento inserido por SQL no banco central aparece no app depois de sincronizar', async ({ page }) => {
  await entrar(page);
  await sincronizar(page);
  const nome = unico('Medicamento E2E');
  expect(await local(page, 'SELECT id FROM medicamento WHERE nome = ?', [nome])).toEqual([]);

  sql(`INSERT INTO clinico.medicamento (nome) VALUES ('${nome}')`);
  await sincronizar(page);
  expect((await local(page, 'SELECT id FROM medicamento WHERE nome = ?', [nome])).length).toBe(1);

  // E fica disponivel para registrar, a partir do catalogo local.
  const { atendimentoId } = await novoPacienteComAtendimento(page, unico('Paciente Catálogo'));
  await registrarMedicacao(page, nome);
  await esperarTudoEnviado(page);
  expect(sql(`SELECT m.nome FROM clinico.atendimento_evento e JOIN clinico.medicamento m ON m.id = e.medicamento_id WHERE e.atendimento_id = '${atendimentoId}'`)).toBe(nome);
});

test('4. offline pelo seletor: grava local, nada sai, sobrevive a recarregar e sincroniza sem duplicar', async ({ page }) => {
  const erros = vigiarConsole(page);
  await entrar(page);
  await esperarTudoEnviado(page);

  await simularOffline(page, true);
  const api = vigiarApi(page);

  const nome = unico('Paciente Offline');
  const { pessoaId, atendimentoId } = await novoPacienteComAtendimento(page, nome, 'Penicilina');
  await registrarSinais(page);
  await registrarTriagem(page, 'VERMELHO');
  await registrarMedicacao(page, 'Adrenalina');
  await registrarObservacao(page, 'Registrado sem rede.');

  // Nada no banco central, nenhuma requisicao emitida, 7 comandos na fila local.
  expect(noCentral.pessoas(nome)).toBe(0);
  expect(noCentral.atendimentos(pessoaId)).toBe(0);
  expect(await pendentesLocais(page)).toBe(7); // pessoa, prontuario, atendimento, 4 eventos
  await expect(page.getByText('7 pendentes').first()).toBeVisible();

  // Recarregar a pagina: tudo continua la, e o seletor tambem (nenhuma requisicao na reabertura).
  await page.reload();
  await expect(page.getByRole('heading', { name: nome, level: 1 })).toBeVisible();
  await expect(page.getByRole('switch', { name: /Simular conectividade/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('list', { name: 'Linha do tempo do atendimento' }).getByRole('listitem')).toHaveCount(4);
  await expect(page.getByText('7 pendentes').first()).toBeVisible();
  expect(await pendentesLocais(page)).toBe(7);
  await page.goto('/app/#/pendencias');
  await expect(page.getByTestId('pendencia-fila')).toHaveCount(7);
  await page.goto(`/app/#/pacientes/${pessoaId}`);
  await expect(page.getByText('Penicilina')).toBeVisible();
  await page.waitForTimeout(6_000); // mais que um ciclo do monitor: ele tambem nao pode emitir nada
  expect(api.vistas.map((r) => `${r.method()} ${new URL(r.url()).pathname}`)).toEqual([]);
  expect(noCentral.pessoas(nome)).toBe(0);

  // De volta a online: sincroniza sozinho (Observer) e tudo chega a central.
  await simularOffline(page, false);
  await esperarTudoEnviado(page);
  const conferir = () => {
    expect(noCentral.pessoas(nome)).toBe(1);
    expect(sql(`SELECT id FROM clinico.pessoa WHERE nome = '${nome}'`)).toBe(pessoaId);
    expect(noCentral.prontuarios(pessoaId)).toBe(1);
    expect(sql(`SELECT i.tipo || ':' || i.descricao FROM clinico.prontuario_item i JOIN clinico.prontuario p ON p.id = i.prontuario_id WHERE p.pessoa_id = '${pessoaId}'`)).toBe(
      'ALERGIA:Penicilina',
    );
    expect(noCentral.atendimentos(pessoaId)).toBe(1);
    expect(sql(`SELECT string_agg(tipo, ',' ORDER BY ocorrido_em) FROM clinico.atendimento_evento WHERE atendimento_id = '${atendimentoId}'`)).toBe(
      'SINAIS_VITAIS,TRIAGEM,MEDICACAO,OBSERVACAO',
    );
  };
  conferir();
  // A ordem de envio foi a de criacao, e cada comando tem a sua linha de idempotencia no servidor.
  const enviados = api.vistas.filter((r) => r.method() === 'POST' && !/\/(auth|log)/.test(r.url())).map((r) => new URL(r.url()).pathname);
  expect(enviados).toEqual([
    '/api/v1/pessoa',
    '/api/v1/prontuario',
    '/api/v1/atendimento',
    '/api/v1/atendimento-evento',
    '/api/v1/atendimento-evento',
    '/api/v1/atendimento-evento',
    '/api/v1/atendimento-evento',
  ]);
  const chaves = (await local<{ op_id: string }>(page, 'SELECT op_id FROM outbox WHERE entidade_id IN (?, ?) OR depende_de = ?', [pessoaId, atendimentoId, `atendimento:${atendimentoId}`])).map((c) => `'${c.op_id}'`);
  expect(chaves.length).toBe(7);
  expect(contar(`SELECT count(*) FROM clinico.operacao_sync WHERE op_id IN (${chaves.join(',')})`)).toBe(7);

  // Sincronizar de novo (duas vezes): nenhuma duplicata.
  api.limpar();
  await sincronizar(page);
  await sincronizar(page);
  conferir();
  expect(api.vistas.filter((r) => r.method() === 'POST' && !/\/(auth|log)/.test(r.url()))).toEqual([]);
  expect(erros).toEqual([]);
});

test('6. falha no meio da subida e resposta perdida: progresso parcial preservado, nada duplica', async ({ page }) => {
  await entrar(page);
  await esperarTudoEnviado(page);
  await simularOffline(page, true);
  const nome = unico('Paciente Queda');
  const { pessoaId, atendimentoId } = await novoPacienteComAtendimento(page, nome, 'Iodo');
  await registrarSinais(page);
  await registrarObservacao(page, 'Antes da queda.');
  expect(await pendentesLocais(page)).toBe(5);

  // Um unico interceptador, com fases trocadas de forma sincrona (sem janela entre uma e outra).
  let fase: 'queda' | 'perder-resposta' | 'segurar' | 'livre' = 'queda';
  let escritas = 0;
  await page.route('**/api/v1/**', async (rota) => {
    if (!ehEscritaClinica(rota)) return rota.fallback();
    escritas++;
    if (fase === 'queda') return escritas >= 2 ? rota.abort('connectionfailed') : rota.fallback();
    if (fase === 'perder-resposta' && new URL(rota.request().url()).pathname === '/api/v1/atendimento') {
      fase = 'segurar';
      await rota.fetch(); // chegou ao servidor e foi gravado...
      return rota.abort('connectionfailed'); // ...mas a resposta nao volta
    }
    if (fase === 'segurar') return rota.abort('connectionfailed');
    return rota.fallback();
  });

  // --- A rede cai na 2a requisicao da subida (e continua fora ate liberarmos).
  await simularOffline(page, false);
  await expect.poll(async () => (await fila(page)).map((c) => c.status)).toEqual(['CONFIRMADA', 'PENDENTE', 'PENDENTE', 'PENDENTE', 'PENDENTE']);
  expect(noCentral.pessoas(nome)).toBe(1); // a 1a ficou
  expect(noCentral.prontuarios(pessoaId)).toBe(0);
  expect(noCentral.atendimentos(pessoaId)).toBe(0);
  await expect(page.getByText('4 pendentes').first()).toBeVisible();

  // --- A rede volta, mas a RESPOSTA do POST /atendimento se perde: o servidor grava, o cliente nao fica sabendo.
  fase = 'perder-resposta';
  await page.goto('/app/#/');
  await page.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect.poll(() => fase).toBe('segurar');
  await expect.poll(async () => (await fila(page)).map((c) => c.status)).toEqual(['CONFIRMADA', 'CONFIRMADA', 'PENDENTE', 'PENDENTE', 'PENDENTE']);
  expect(noCentral.atendimentos(pessoaId)).toBe(1); // esta no servidor...
  expect((await local<{ estado_sync: string }>(page, 'SELECT estado_sync FROM atendimento WHERE id = ?', [atendimentoId]))[0]!.estado_sync).toBe('LOCAL'); // ...e o app acha que nao

  // --- Proxima tentativa: reenvia com a mesma Idempotency-Key e conclui, sem duplicar.
  fase = 'livre';
  await page.getByRole('button', { name: 'Sincronizar agora' }).click();
  await esperarTudoEnviado(page);
  expect(noCentral.pessoas(nome)).toBe(1);
  expect(noCentral.prontuarios(pessoaId)).toBe(1);
  expect(noCentral.itens(pessoaId)).toBe(1);
  expect(noCentral.atendimentos(pessoaId)).toBe(1);
  expect(noCentral.eventos(atendimentoId)).toBe(2);
  const [chave] = await local<{ op_id: string }>(page, "SELECT op_id FROM outbox WHERE entidade = 'atendimento' AND entidade_id = ?", [atendimentoId]);
  expect(contar(`SELECT count(*) FROM clinico.operacao_sync WHERE op_id = '${chave!.op_id}'`)).toBe(1);
});

test('7. rejeicao (422): vai para Pendencias com o motivo; dependentes retidos; independentes sobem', async ({ page }) => {
  await entrar(page);
  await esperarTudoEnviado(page);
  // Um atendimento ja confirmado, de outro paciente: o que for registrado nele e independente.
  const outro = await novoPacienteComAtendimento(page, unico('Paciente Independente'));
  await esperarTudoEnviado(page);

  await simularOffline(page, true);
  const nome = unico('Paciente Rejeitado');
  const rejeitado = await novoPacienteComAtendimento(page, nome);
  await registrarSinais(page);
  await page.goto(`/app/#/atendimentos/${outro.atendimentoId}`);
  await registrarObservacao(page, 'Independente da rejeição.');
  expect(await pendentesLocais(page)).toBe(5);

  await page.route('**/api/v1/pessoa', async (rota) => {
    if (rota.request().method() !== 'POST' || !(rota.request().postData() ?? '').includes(nome)) return rota.fallback();
    return rota.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ codigo: 'VALIDACAO', mensagem: 'Corpo inválido', detalhes: [{ campo: 'cpf', mensagem: 'deve ter 11 dígitos, sem pontuação' }], requestId: 'e2e-rejeicao' }),
    });
  });
  await simularOffline(page, false);

  // O independente subiu; o rejeitado e os que dependem dele ficaram.
  await expect.poll(() => noCentral.eventos(outro.atendimentoId)).toBe(1);
  await expect.poll(async () => (await fila(page)).filter((c) => c.status !== 'CONFIRMADA').map((c) => `${c.rota} ${c.status}`)).toEqual([
    '/api/v1/pessoa REJEITADA',
    '/api/v1/prontuario PENDENTE',
    '/api/v1/atendimento PENDENTE',
    '/api/v1/atendimento-evento PENDENTE',
  ]);
  expect(noCentral.pessoas(nome)).toBe(0);
  expect(noCentral.atendimentos(rejeitado.pessoaId)).toBe(0);

  await expect(page.getByText('1 rejeitada')).toBeVisible();
  await page.goto('/app/#/pendencias');
  const linha = page.getByTestId('pendencia-rejeitada');
  await expect(linha).toHaveCount(1);
  await expect(linha).toContainText(`Novo paciente: ${nome}`);
  await expect(linha).toContainText('422 VALIDACAO');
  await expect(linha).toContainText('cpf: deve ter 11 dígitos, sem pontuação');
  await expect(page.getByTestId('pendencia-fila')).toHaveCount(3);
  await expect(page.getByTestId('pendencia-fila').filter({ hasText: 'Retida' })).toHaveCount(3);

  // Uma rejeitada nao e reenviada sozinha, nem pelo botao de sincronizar.
  let reenvios = 0;
  page.on('request', (r) => r.method() === 'POST' && r.url().endsWith('/api/v1/pessoa') && reenvios++);
  await page.getByRole('button', { name: 'Sincronizar agora' }).click();
  await page.waitForTimeout(2_000);
  expect(reenvios).toBe(0);

  // Corrigido o problema (aqui: o servidor passa a aceitar), "Tentar de novo" destrava a cadeia inteira.
  await page.unroute('**/api/v1/pessoa');
  await linha.getByRole('button', { name: 'Tentar de novo' }).click();
  await esperarTudoEnviado(page);
  expect(noCentral.pessoas(nome)).toBe(1);
  expect(noCentral.atendimentos(rejeitado.pessoaId)).toBe(1);
  expect(noCentral.eventos(rejeitado.atendimentoId)).toBe(1);
});

test('8. logs locais chegam a auditoria.log_cliente, sem duplicar', async ({ page }) => {
  await entrar(page);
  await esperarTudoEnviado(page);
  await simularOffline(page, true);
  await novoPacienteComAtendimento(page, unico('Paciente Log'));
  await registrarSinais(page);

  const locais = await local<{ id: string; acao: string }>(page, 'SELECT id, acao FROM log_local');
  expect(locais.map((l) => l.acao)).toEqual(expect.arrayContaining(['SIMULACAO_CONECTIVIDADE', 'PESSOA_CRIADA', 'ATENDIMENTO_INICIADO', 'EVENTO_REGISTRADO']));
  const ids = locais.map((l) => `'${l.id}'`).join(',');
  expect(contar(`SELECT count(*) FROM auditoria.log_cliente WHERE id IN (${ids})`)).toBe(0);

  // A primeira resposta de POST /log se perde: o servidor grava, o app nao apaga e reenvia.
  let envios = 0;
  await page.route('**/api/v1/log', async (rota) => {
    envios++;
    if (envios > 1) return rota.fallback();
    await rota.fetch();
    return rota.abort('connectionfailed');
  });
  await simularOffline(page, false);
  await expect.poll(() => envios, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => contar(`SELECT count(*) FROM auditoria.log_cliente WHERE id IN (${ids})`)).toBe(locais.length);
  expect((await local<{ n: number }>(page, `SELECT count(*) AS n FROM log_local WHERE id IN (${ids})`))[0]!.n).toBe(locais.length); // nada apagado sem confirmacao

  await sincronizar(page);
  await expect.poll(() => envios).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => (await local<{ n: number }>(page, `SELECT count(*) AS n FROM log_local WHERE id IN (${ids})`))[0]!.n).toBe(0);
  expect(contar(`SELECT count(*) FROM auditoria.log_cliente WHERE id IN (${ids})`)).toBe(locais.length); // repetiu e nao duplicou
  expect(sql(`SELECT DISTINCT estava_online::text || '|' || (dispositivo_id IS NOT NULL)::text FROM auditoria.log_cliente WHERE id IN (${ids}) AND acao = 'EVENTO_REGISTRADO'`)).toBe('false|true');
});
