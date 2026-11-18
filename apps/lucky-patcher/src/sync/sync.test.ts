// Motor de sincronizacao e outbox sobre SQLite real (em memoria) e HTTP falso.
import { describe, expect, it } from 'vitest';
import { ErroBancoLocal } from '../banco/executor.ts';
import { ErroValidacao } from '../dados/contexto.ts';
import { classificarFila, type Comando } from '../dados/outbox.ts';
import { AgendaManual, executorEmMemoria, montar, pessoa, PROFISSIONAL, ServidorFalso, statusDoOutbox } from '../teste/apoio.ts';
import { MonitorConectividade } from './conectividade.ts';
import { ClienteHttp, FalhaTransporte } from './http.ts';
import { calcularRecuoMs, RECUO_TETO_MS } from './motor.ts';

const SINAIS = { pressaoSistolica: 120, pressaoDiastolica: 80 };

/** Pessoa + prontuario + atendimento + 2 eventos, tudo offline: 5 comandos na fila. */
async function registrarCaso(app: Awaited<ReturnType<typeof montar>>['app'], nome = 'Marlene Teste') {
  const pessoaId = await app.pessoas.criar(pessoa(nome, { itens: [{ tipo: 'ALERGIA', descricao: 'Dipirona' }] }));
  const atendimentoId = await app.atendimentos.iniciar({ pessoaId, queixaPrincipal: 'Dor torácica' });
  await app.atendimentos.registrarEvento({ atendimentoId, tipo: 'SINAIS_VITAIS', dados: SINAIS });
  await app.atendimentos.registrarEvento({ atendimentoId, tipo: 'OBSERVACAO', dados: { texto: 'Consciente' } });
  return { pessoaId, atendimentoId };
}

describe('escrita local (Repository + Outbox)', () => {
  it('grava dado, comandos e log na mesma transacao, sem tocar a rede', async () => {
    const { app, servidor, executor } = await montar();
    const antes = servidor.vistas.length;
    await registrarCaso(app);

    expect(servidor.vistas.length).toBe(antes);
    expect((await statusDoOutbox(executor)).map((c) => `${c.rota} ${c.status}`)).toEqual([
      '/api/v1/pessoa PENDENTE',
      '/api/v1/prontuario PENDENTE',
      '/api/v1/atendimento PENDENTE',
      '/api/v1/atendimento-evento PENDENTE',
      '/api/v1/atendimento-evento PENDENTE',
    ]);
    const [logs] = await executor.consultar<{ n: number }>('SELECT count(*) AS n FROM log_local WHERE estava_online = 0');
    expect(logs?.n).toBeGreaterThanOrEqual(5);
    expect((await app.pessoas.buscar('marlene'))[0]?.envio).toBe('local');
  });

  it('falha de gravacao e explicita e nao deixa nada pela metade (T-15)', async () => {
    const real = await executorEmMemoria();
    let falhar = false;
    const { app } = await montar({
      executor: {
        ...real,
        // Falha no ULTIMO comando do lote: o SQLite precisa desfazer os anteriores.
        transacao: (comandos) =>
          real.transacao(falhar ? [...comandos, { sql: 'INSERT INTO tabela_que_nao_existe VALUES (1)' }] : comandos),
      },
    });
    falhar = true;
    await expect(app.pessoas.criar(pessoa('Nunca Gravada'))).rejects.toBeInstanceOf(ErroBancoLocal);
    falhar = false;
    expect(await app.pessoas.buscar('Nunca')).toEqual([]);
    expect(await statusDoOutbox(real)).toEqual([]);
  });

  it('valida com o esquema do contrato antes de gravar', async () => {
    const { app, executor } = await montar();
    await expect(app.pessoas.criar(pessoa('Ana', { cpf: '123' }))).rejects.toBeInstanceOf(ErroValidacao);
    await expect(app.pessoas.criar(pessoa(''))).rejects.toBeInstanceOf(ErroValidacao);
    expect(await statusDoOutbox(executor)).toEqual([]);
    // CPF com pontuacao e aceito e segue so com digitos.
    await app.pessoas.criar(pessoa('Ana', { cpf: '123.456.789-01' }));
    const [comando] = await executor.consultar<{ corpo: string }>('SELECT corpo FROM outbox ORDER BY ordem LIMIT 1');
    expect(JSON.parse(comando!.corpo).cpf).toBe('12345678901');
  });
});

describe('subida', () => {
  it('envia um comando por requisicao, na ordem, com Idempotency-Key = op_id; 2xx confirma', async () => {
    const { app, servidor, executor, ficarOnline } = await montar();
    const { pessoaId, atendimentoId } = await registrarCaso(app);
    await ficarOnline();

    const escritas = servidor.escritas();
    expect(escritas.map((r) => r.rota)).toEqual([
      '/api/v1/pessoa',
      '/api/v1/prontuario',
      '/api/v1/atendimento',
      '/api/v1/atendimento-evento',
      '/api/v1/atendimento-evento',
    ]);
    const chaves = await executor.consultar<{ op_id: string }>('SELECT op_id FROM outbox ORDER BY ordem');
    expect(escritas.map((r) => r.cabecalhos['idempotency-key'])).toEqual(chaves.map((c) => c.op_id));
    expect(escritas.every((r) => r.cabecalhos['x-dispositivo-id'] === app.dispositivoId)).toBe(true);

    expect((await statusDoOutbox(executor)).every((c) => c.status === 'CONFIRMADA')).toBe(true);
    expect((await app.pessoas.obter(pessoaId))?.envio).toBe('confirmado');
    expect((await app.atendimentos.obter(atendimentoId))?.envio).toBe('confirmado');
    expect((await app.atendimentos.eventos(atendimentoId)).map((e) => e.envio)).toEqual(['confirmado', 'confirmado']);
    expect((await app.prontuarios.obter(pessoaId)).itens[0]?.envio).toBe('confirmado');
    expect(app.motor.estado.ultimaSync).not.toBeNull();
  });

  it('sincronizar de novo nao reenvia nada', async () => {
    const { app, servidor, ficarOnline } = await montar();
    await registrarCaso(app);
    await ficarOnline();
    const enviadas = servidor.escritas().length;
    await app.motor.sincronizar('manual');
    await app.motor.sincronizar('manual');
    expect(servidor.escritas().length).toBe(enviadas);
    expect(servidor.gravados.length).toBe(5);
  });

  it('4xx rejeita em definitivo; dependentes ficam retidos e os independentes sobem', async () => {
    const { app, servidor, executor, ficarOnline } = await montar();
    await registrarCaso(app, 'Rejeitada');
    const outra = await registrarCaso(app, 'Independente');
    servidor.interceptar = (r) =>
      r.rota === '/api/v1/pessoa' && (r.corpo as { nome: string }).nome === 'Rejeitada'
        ? { status: 422, corpo: { codigo: 'VALIDACAO', mensagem: 'Corpo inválido', detalhes: [{ campo: 'cpf', mensagem: 'deve ter 11 dígitos' }], requestId: 'r' } }
        : undefined;
    await ficarOnline();

    const fila = await statusDoOutbox(executor);
    expect(fila.slice(0, 5).map((c) => c.status)).toEqual(['REJEITADA', 'PENDENTE', 'PENDENTE', 'PENDENTE', 'PENDENTE']);
    expect(fila.slice(5).every((c) => c.status === 'CONFIRMADA')).toBe(true);
    expect((await app.atendimentos.obter(outra.atendimentoId))?.envio).toBe('confirmado');

    const pendencias = await app.pendencias.listar(PROFISSIONAL.id);
    expect(pendencias.map((p) => p.situacao)).toEqual(['REJEITADA', 'RETIDA', 'RETIDA', 'RETIDA', 'RETIDA']);
    expect(pendencias[0]?.comando.ultimoErro).toContain('422 VALIDACAO');
    expect(pendencias[0]?.comando.ultimoErro).toContain('cpf: deve ter 11 dígitos');
    expect(await app.pendencias.contar()).toEqual({ pendentes: 5, rejeitadas: 1 });

    // Rejeitada nao e reenviada sozinha; os retidos nunca foram enviados.
    const antes = servidor.escritas().length;
    await app.motor.sincronizar('manual');
    expect(servidor.escritas().length).toBe(antes);
    expect(servidor.escritas().filter((r) => r.rota === '/api/v1/pessoa').length).toBe(2);

    // "Tentar de novo" devolve a fila; aceita, os retidos sobem atras dela, em ordem.
    servidor.interceptar = null;
    await app.pendencias.tentarDeNovo(pendencias[0]!.comando.opId);
    await app.motor.ocioso();
    expect((await statusDoOutbox(executor)).every((c) => c.status === 'CONFIRMADA')).toBe(true);
    expect(servidor.gravados.length).toBe(10);
  });

  it('descartar remove a rejeitada, os dependentes e os registros que so existiam no aparelho', async () => {
    const { app, servidor, executor, ficarOnline } = await montar();
    const { pessoaId, atendimentoId } = await registrarCaso(app, 'Rejeitada');
    servidor.interceptar = (r) => (r.rota === '/api/v1/pessoa' ? { status: 422, corpo: { codigo: 'VALIDACAO', mensagem: 'x', requestId: 'r' } } : undefined);
    await ficarOnline();
    const [rejeitada] = await app.pendencias.listar(PROFISSIONAL.id);
    expect((await app.pendencias.cadeiaDe(rejeitada!.comando.opId)).length).toBe(5);
    expect(await app.pendencias.descartar(rejeitada!.comando.opId)).toBe(5);
    await app.motor.ocioso();
    expect(await statusDoOutbox(executor)).toEqual([]);
    expect(await app.pessoas.obter(pessoaId)).toBeNull();
    expect(await app.atendimentos.obter(atendimentoId)).toBeNull();
    expect(await app.atendimentos.eventos(atendimentoId)).toEqual([]);
  });

  it('5xx, queda de rede e timeout voltam a PENDENTE com backoff exponencial; a fila nao anda fora de ordem', async () => {
    for (const falha of [{ status: 503 }, 'rede', { status: 500 }] as const) {
      const { app, servidor, executor, relogio, agenda, ficarOnline } = await montar();
      await registrarCaso(app);
      servidor.interceptar = (r) => (r.rota === '/api/v1/prontuario' ? falha : undefined);
      await ficarOnline();

      let fila = await statusDoOutbox(executor);
      expect(fila.map((c) => c.status)).toEqual(['CONFIRMADA', 'PENDENTE', 'PENDENTE', 'PENDENTE', 'PENDENTE']);
      expect(fila[1]).toMatchObject({ tentativas: 1, recuo: 1 });
      // Nada depois do prontuario foi enviado.
      expect(servidor.escritas().map((r) => r.rota)).toEqual(['/api/v1/pessoa', '/api/v1/prontuario']);
      // O temporizador foi armado para o fim do recuo (1 s, sem jitter no teste).
      expect(agenda.tarefas.some((t) => t.ms === 1000)).toBe(true);

      // Antes do prazo, nem tenta.
      await app.motor.sincronizar('primeiro-plano');
      expect(servidor.escritas().length).toBe(2);

      // Vencido o prazo, tenta de novo; falhando, o recuo dobra.
      relogio.avancar(1000);
      await app.motor.sincronizar('temporizador');
      fila = await statusDoOutbox(executor);
      expect(fila[1]).toMatchObject({ status: 'PENDENTE', tentativas: 2, recuo: 2 });
      expect(agenda.tarefas.some((t) => t.ms === 2000)).toBe(true);

      // Servidor volta: conclui o resto, sem duplicar a pessoa ja confirmada.
      servidor.interceptar = null;
      relogio.avancar(2000);
      await app.motor.sincronizar('temporizador');
      expect((await statusDoOutbox(executor)).every((c) => c.status === 'CONFIRMADA')).toBe(true);
      expect(servidor.gravados.length).toBe(5);
    }
  });

  it('o backoff tem teto de 5 min e jitter; e zerado quando a conexao volta', async () => {
    expect(calcularRecuoMs(1, 1)).toBe(1000);
    expect(calcularRecuoMs(2, 1)).toBe(2000);
    expect(calcularRecuoMs(5, 1)).toBe(16_000);
    expect(calcularRecuoMs(30, 1)).toBe(RECUO_TETO_MS);
    expect(calcularRecuoMs(3, 0)).toBe(2000); // jitter tira ate metade
    expect(calcularRecuoMs(3, 0.5)).toBe(3000);

    const { app, servidor, executor, ficarOnline } = await montar();
    await registrarCaso(app);
    servidor.interceptar = () => 'rede';
    await ficarOnline(); // o ping falha: continua offline, nada e tentado
    expect((await statusDoOutbox(executor))[0]).toMatchObject({ status: 'PENDENTE', tentativas: 0 });

    // Conexao instavel: o ping passa, a escrita cai.
    servidor.interceptar = (r) => (r.metodo === 'POST' && r.rota !== '/api/v1/auth/refresh' ? 'rede' : undefined);
    await app.monitor.verificar();
    await app.motor.ocioso();
    expect((await statusDoOutbox(executor))[0]).toMatchObject({ status: 'PENDENTE', tentativas: 1, recuo: 1 });
    expect(app.monitor.estado.online).toBe(true); // o servidor responde ao ping: vale o backoff

    // A conexao cai de vez e volta: recuo zerado e a fila anda na hora, sem esperar o prazo.
    servidor.interceptar = () => 'rede';
    await app.monitor.verificar();
    expect(app.monitor.estado.online).toBe(false);
    servidor.interceptar = null;
    await app.monitor.verificar();
    await app.motor.ocioso();
    const fila = await statusDoOutbox(executor);
    expect(fila.every((c) => c.status === 'CONFIRMADA' && c.recuo === 0)).toBe(true);
  });

  it('timeout do cliente HTTP e falha transitoria', async () => {
    const servidor = new ServidorFalso();
    servidor.interceptar = () => 'pendurar';
    const cliente = new ClienteHttp({
      fetch: servidor.fetch,
      enderecoServidor: () => '',
      simulandoOffline: () => false,
      dispositivoId: () => 'd',
      timeoutMs: 20,
    });
    await expect(cliente.enviar({ metodo: 'GET', rota: '/api/v1/auth/me' })).rejects.toMatchObject({ motivo: 'TIMEOUT' });
  });

  it('ENVIANDO encontrado na abertura volta a PENDENTE e o reenvio nao duplica (app fechado no meio)', async () => {
    const executor = await executorEmMemoria();
    const servidor = new ServidorFalso();
    const primeira = await montar({ executor, servidor });
    await registrarCaso(primeira.app);
    // O app "morreu" com a pessoa em ENVIANDO, e o servidor ja tinha gravado.
    const [comando] = await executor.consultar<{ op_id: string; corpo: string }>('SELECT op_id, corpo FROM outbox ORDER BY ordem LIMIT 1');
    await servidor.fetch('/api/v1/pessoa', {
      method: 'POST',
      body: comando!.corpo,
      headers: { authorization: `Bearer ${servidor.tokenValido}`, 'idempotency-key': comando!.op_id },
    });
    await executor.transacao([{ sql: "UPDATE outbox SET status = 'ENVIANDO' WHERE op_id = ?", params: [comando!.op_id] }]);
    primeira.app.parar();

    const segunda = await montar({ executor, servidor }); // reabre sobre o mesmo banco
    expect((await statusDoOutbox(executor))[0]?.status).toBe('PENDENTE');
    await segunda.ficarOnline();
    expect((await statusDoOutbox(executor)).every((c) => c.status === 'CONFIRMADA')).toBe(true);
    expect(servidor.gravados.filter((g) => g.rota === '/api/v1/pessoa').length).toBe(1);
  });

  it('resposta perdida: o servidor gravou, o cliente nao soube; o reenvio nao duplica (T-08)', async () => {
    const { app, servidor, executor, relogio, ficarOnline } = await montar();
    await registrarCaso(app);
    servidor.perderResposta((r) => r.rota === '/api/v1/atendimento');
    await ficarOnline();
    expect((await statusDoOutbox(executor)).map((c) => c.status)).toEqual(['CONFIRMADA', 'CONFIRMADA', 'PENDENTE', 'PENDENTE', 'PENDENTE']);
    expect(servidor.gravados.length).toBe(3); // o atendimento ESTA no servidor

    relogio.avancar(1000); // vence o recuo
    await app.motor.sincronizar('temporizador');
    expect((await statusDoOutbox(executor)).every((c) => c.status === 'CONFIRMADA')).toBe(true);
    expect(servidor.gravados.filter((g) => g.rota === '/api/v1/atendimento').length).toBe(1);
    expect(servidor.gravados.length).toBe(5);
  });

  it('nunca roda duas sincronizacoes ao mesmo tempo', async () => {
    const { app, servidor, ficarOnline } = await montar();
    await ficarOnline();
    await app.monitor.definirSimulacao(true);
    await registrarCaso(app);
    servidor.atrasoMs = 5;
    await app.monitor.definirSimulacao(false); // dispara pelo Observer
    const [a, b, c] = [app.motor.sincronizar('manual'), app.motor.sincronizar('manual'), app.motor.sincronizar('primeiro-plano')];
    expect(a).toBe(b);
    expect(b).toBe(c);
    await app.motor.ocioso();
    expect(servidor.picoSimultaneas).toBe(1);
    expect(servidor.gravados.length).toBe(5);
    expect(servidor.escritas().length).toBe(5);
  });

  it('comando gravado durante uma sincronizacao sobe na repassagem', async () => {
    const { app, servidor, ficarOnline } = await montar();
    const { atendimentoId } = await registrarCaso(app);
    servidor.atrasoMs = 5;
    const fim = ficarOnline();
    await new Promise((r) => setTimeout(r, 12));
    await app.atendimentos.registrarEvento({ atendimentoId, tipo: 'PROCEDIMENTO', dados: { descricao: 'Acesso venoso' } });
    await fim;
    await app.motor.ocioso();
    expect(servidor.gravados.length).toBe(6);
  });

  it('401: renova o token e repete; renovacao recusada pede login sem perder o outbox', async () => {
    const { app, servidor, executor, ficarOnline } = await montar();
    await registrarCaso(app);
    servidor.tokenValido = 'token-trocado-no-servidor'; // o access token do app deixou de valer
    await ficarOnline();
    expect(servidor.vistas.some((r) => r.rota === '/api/v1/auth/refresh')).toBe(true);
    expect((await statusDoOutbox(executor)).every((c) => c.status === 'CONFIRMADA')).toBe(true);

    await app.monitor.definirSimulacao(true);
    await registrarCaso(app, 'Depois');
    servidor.tokenValido = 'outro';
    servidor.refreshValido = null; // refresh expirado/revogado
    await ficarOnline();
    const resultado = await app.motor.sincronizar('manual');
    expect(resultado.precisaLogin).toBe(true);
    expect(app.sessao.atual?.precisaLogin).toBe(true);
    const fila = (await statusDoOutbox(executor)).slice(5);
    expect(fila.map((c) => `${c.status} ${c.tentativas}`)).toEqual(Array(5).fill('PENDENTE 0'));

    // Novo login: a fila intacta sobe.
    servidor.refreshValido = 'x';
    await app.sessao.entrar({ tipoRegistro: 'COREN', registro: '200002', uf: 'RS', senha: 'x' });
    await app.motor.sincronizar('manual');
    expect((await statusDoOutbox(executor)).every((c) => c.status === 'CONFIRMADA')).toBe(true);
    expect(servidor.gravados.length).toBe(10);
  });

  it('o outbox e por profissional: comando de outro fica na fila e retém o que depende dele', async () => {
    const fila = [
      { ordem: 1, entidade: 'pessoa', entidadeId: 'p1', dependeDe: null, profissionalId: 'outro', status: 'PENDENTE' },
      { ordem: 2, entidade: 'atendimento', entidadeId: 'a1', dependeDe: 'pessoa:p1', profissionalId: 'eu', status: 'PENDENTE' },
      { ordem: 3, entidade: 'atendimento_evento', entidadeId: 'e1', dependeDe: 'atendimento:a1', profissionalId: 'eu', status: 'PENDENTE' },
      { ordem: 4, entidade: 'pessoa', entidadeId: 'p2', dependeDe: null, profissionalId: 'eu', status: 'PENDENTE' },
    ] as Comando[];
    expect(classificarFila(fila, 'eu').map((f) => f.situacao)).toEqual(['DE_OUTRO_PROFISSIONAL', 'RETIDA', 'RETIDA', 'ENVIAVEL']);
  });

  it('o prontuario local assume o id que o servidor devolver (pessoa que ja tinha prontuario)', async () => {
    const { app, servidor, executor, ficarOnline } = await montar();
    const { pessoaId } = await registrarCaso(app);
    const idDoServidor = '99999999-9999-4999-8999-999999999999';
    servidor.interceptar = (r) => (r.rota === '/api/v1/prontuario' ? { status: 200, corpo: { ...(r.corpo as object), id: idDoServidor } } : undefined);
    await ficarOnline();
    expect(await executor.consultar('SELECT id, estado_sync FROM prontuario WHERE pessoa_id = ?', [pessoaId])).toEqual([
      { id: idDoServidor, estado_sync: 'CONFIRMADO' },
    ]);
    expect(await executor.consultar('SELECT DISTINCT prontuario_id FROM prontuario_item WHERE pessoa_id = ?', [pessoaId])).toEqual([
      { prontuario_id: idDoServidor },
    ]);
  });
});

describe('logs locais', () => {
  it('sobem em lote depois dos dados e so sao apagados apos a confirmacao; repetir nao duplica (T-17)', async () => {
    const { app, servidor, executor, ficarOnline } = await montar();
    await registrarCaso(app);
    const contar = async () => (await executor.consultar<{ n: number }>('SELECT count(*) AS n FROM log_local'))[0]!.n;
    const locais = await contar();
    expect(locais).toBeGreaterThan(0);

    servidor.interceptar = (r) => (r.rota === '/api/v1/log' ? { status: 503 } : undefined);
    await ficarOnline();
    expect(await contar()).toBeGreaterThanOrEqual(locais); // nada apagado sem confirmacao

    servidor.interceptar = null;
    await app.motor.sincronizar('manual');
    const ordem = servidor.vistas.map((r) => r.rota);
    expect(ordem.lastIndexOf('/api/v1/atendimento-evento')).toBeLessThan(ordem.indexOf('/api/v1/log'));
    expect(servidor.logs.length).toBeGreaterThanOrEqual(locais);
    expect(new Set(servidor.logs.map((l) => l.id)).size).toBe(servidor.logs.length);
    // Sobra so o log da propria sincronizacao manual, que sobe na proxima.
    expect(await contar()).toBeLessThanOrEqual(1);
  });
});

describe('descida', () => {
  const medicamento = (n: number) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, nome: `Medicamento ${n}`, principioAtivo: null, apresentacao: null, observacao: null, ativo: true });
  const pessoaServidor = (id: string, nome: string) => ({
    id, nome, dataNascimento: null, sexo: null, cpf: null, cns: null, telefone: null,
    contatoEmergenciaNome: null, contatoEmergenciaTelefone: null, contatoEmergenciaEmail: null,
    naoIdentificada: false, descricaoIdentificacao: null, possivelDuplicataDe: null,
    criadoEm: '2026-11-01T00:00:00.000Z', atualizadoEm: '2026-11-02T00:00:00.000Z',
  });

  it('baixa por cursor, em paginas, gravando dados e cursor juntos; depois so o delta', async () => {
    const { app, servidor, executor, ficarOnline } = await montar();
    servidor.paginas = [{ medicamentos: [medicamento(1), medicamento(2)] }, { medicamentos: [medicamento(3)], pessoas: [pessoaServidor('22222222-2222-4222-8222-222222222222', 'Do Servidor')] }];
    await ficarOnline();

    const consultas = servidor.vistas.filter((r) => r.rota.includes('/sync/alteracoes')).map((r) => r.rota);
    expect(consultas).toEqual(['/api/v1/sync/alteracoes?desde=0&limite=500', '/api/v1/sync/alteracoes?desde=1&limite=500']);
    expect((await app.medicamentos.listarAtivos()).map((m) => m.nome)).toEqual(['Medicamento 1', 'Medicamento 2', 'Medicamento 3']);
    expect((await app.pessoas.buscar('servidor'))[0]).toMatchObject({ nome: 'Do Servidor', envio: 'confirmado' });
    expect(await app.banco.lerEstado('cursor')).toBe('2');

    servidor.paginas.push({ medicamentos: [{ ...medicamento(1), nome: 'Renomeado', ativo: false }, medicamento(4)] });
    await app.motor.sincronizar('manual');
    expect(servidor.vistas.at(-1)?.rota).toBe('/api/v1/sync/alteracoes?desde=2&limite=500');
    expect((await app.medicamentos.listarAtivos()).map((m) => m.nome)).toEqual(['Medicamento 2', 'Medicamento 3', 'Medicamento 4']);
    expect(await executor.consultar('SELECT count(*) AS n FROM medicamento')).toEqual([{ n: 4 }]);
  });

  it('pagina interrompida no meio nao avanca o cursor; a repeticao e inofensiva', async () => {
    const { app, servidor, ficarOnline } = await montar();
    servidor.paginas = [{ medicamentos: [medicamento(1)] }, { medicamentos: [medicamento(2)] }];
    servidor.interceptar = (r) => (r.rota.includes('desde=1') ? 'rede' : undefined);
    await ficarOnline();
    expect(await app.banco.lerEstado('cursor')).toBe('1');
    expect((await app.medicamentos.listarAtivos()).length).toBe(1);
    servidor.interceptar = null;
    await app.motor.sincronizar('manual');
    expect(await app.banco.lerEstado('cursor')).toBe('2');
    expect((await app.medicamentos.listarAtivos()).length).toBe(2);
  });

  it('linha local com operacao pendente nao e sobrescrita', async () => {
    const { app, servidor, ficarOnline } = await montar();
    const pessoaId = await app.pessoas.criar(pessoa('Nome Local'));
    servidor.paginas = [{ pessoas: [pessoaServidor(pessoaId, 'Nome Antigo Do Servidor')] }];
    // A pessoa local nao consegue subir (rejeitada): continua pendente quando a descida chega.
    servidor.interceptar = (r) => (r.rota === '/api/v1/pessoa' ? { status: 422, corpo: { codigo: 'VALIDACAO', mensagem: 'x', requestId: 'r' } } : undefined);
    await ficarOnline();
    expect(await app.banco.lerEstado('cursor')).toBe('1');
    expect((await app.pessoas.obter(pessoaId))?.nome).toBe('Nome Local');

    // Sem pendencia, a mesma linha do servidor e aplicada.
    const outro = await montar({ servidor: Object.assign(new ServidorFalso(), { paginas: servidor.paginas }), offline: false });
    expect((await outro.app.pessoas.obter(pessoaId))?.nome).toBe('Nome Antigo Do Servidor');
  });
});

describe('conectividade (Observer) e cliente HTTP', () => {
  it('online = nao simulado E servidor alcancavel; assinantes recebem as transicoes', async () => {
    let alcanca = true;
    let pings = 0;
    const persistido: boolean[] = [];
    const agenda = new AgendaManual();
    const monitor = new MonitorConectividade({
      simulacaoInicial: false,
      ping: async () => (pings++, alcanca),
      persistirSimulacao: async (v) => void persistido.push(v),
      agendar: agenda.agendar,
    });
    const vistos: boolean[] = [];
    monitor.assinar((estado) => vistos.push(estado.online));

    expect(monitor.estado.online).toBe(false); // ate provar o contrario
    await monitor.iniciar();
    expect(monitor.estado).toEqual({ simulandoOffline: false, servidorAlcancavel: true, online: true });

    await monitor.definirSimulacao(true);
    expect(monitor.estado.online).toBe(false);
    const antes = pings;
    await monitor.verificar(); // simulando: nem tenta
    expect(pings).toBe(antes);
    expect(persistido).toEqual([true]);

    alcanca = false;
    await monitor.definirSimulacao(false); // desligou a simulacao, mas o servidor caiu
    expect(monitor.estado).toEqual({ simulandoOffline: false, servidorAlcancavel: false, online: false });
    expect(vistos).toEqual([true, false, false]); // sair da simulacao sem servidor nao publica "online"
    alcanca = true;
    await monitor.verificar();
    monitor.informarSemRede(); // o sistema avisou que a rede caiu
    expect(vistos).toEqual([true, false, false, true, false]);
    monitor.parar();
  });

  it('simulando offline, o cliente HTTP recusa antes de sair: fetch nunca e chamado', async () => {
    let chamadas = 0;
    const cliente = new ClienteHttp({
      fetch: (async () => (chamadas++, new Response('{}'))) as typeof fetch,
      enderecoServidor: () => '',
      simulandoOffline: () => true,
      dispositivoId: () => 'd',
    });
    const erro = await cliente.enviar({ metodo: 'POST', rota: '/api/v1/pessoa', corpo: {} }).catch((e) => e);
    expect(erro).toBeInstanceOf(FalhaTransporte);
    expect(erro.motivo).toBe('OFFLINE_SIMULADO');
    expect(chamadas).toBe(0);
  });

  it('o seletor e persistido, vale apos reabrir, e offline nenhuma requisicao sai do app inteiro', async () => {
    const executor = await executorEmMemoria();
    const servidor = new ServidorFalso();
    const primeira = await montar({ executor, servidor }); // ja simulando offline
    const antes = servidor.vistas.length;
    await registrarCaso(primeira.app);
    await primeira.app.motor.sincronizar('manual');
    await primeira.app.monitor.verificar();
    primeira.app.parar();

    const segunda = await montar({ executor, servidor, offline: false, logar: false });
    expect(segunda.app.monitor.estado.simulandoOffline).toBe(true); // lido do banco
    expect(segunda.app.sessao.atual?.profissional.id).toBe(PROFISSIONAL.id); // sessao local: abre sem rede
    await segunda.app.motor.sincronizar('manual');
    expect(servidor.vistas.length).toBe(antes);
    expect((await statusDoOutbox(executor)).every((c) => c.status === 'PENDENTE' && c.tentativas === 0)).toBe(true);
  });

  it('sem endereco de servidor (Android antes do ajuste) nada sai', async () => {
    let chamadas = 0;
    const cliente = new ClienteHttp({
      fetch: (async () => (chamadas++, new Response('{}'))) as typeof fetch,
      enderecoServidor: () => null,
      simulandoOffline: () => false,
      dispositivoId: () => 'd',
    });
    await expect(cliente.enviar({ metodo: 'GET', rota: '/api/v1/auth/me' })).rejects.toMatchObject({ motivo: 'SEM_SERVIDOR' });
    expect(chamadas).toBe(0);
  });
});
