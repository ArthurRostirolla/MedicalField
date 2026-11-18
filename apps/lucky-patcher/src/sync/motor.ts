// MotorSincronizacao: esvazia o outbox (subida), envia os logs locais e baixa as alteracoes (descida).
// Assina o MonitorConectividade (Observer). Nunca roda duas sincronizacoes ao mesmo tempo.
import { alteracoesSchema, ehFalhaTransitoria, MAXIMO_LOGS_POR_CHAMADA, pessoaSchema } from '@medicalfield/contratos';
import { linhaParaObjeto, mensagemDe, sqlEstado, sqlInserir, type Banco } from '../banco/banco.ts';
import type { ComandoSql } from '../banco/executor.ts';
import { classificarFila, listarNaoConfirmados, sqlLog, type Comando } from '../dados/outbox.ts';
import type { MonitorConectividade } from './conectividade.ts';
import { FalhaTransporte } from './http.ts';
import { SessaoExpirada, type GerenciadorSessao } from './sessao.ts';

export type Gatilho = 'abertura' | 'conexao' | 'primeiro-plano' | 'manual' | 'temporizador' | 'escrita';

export interface EstadoMotor {
  sincronizando: boolean;
  /** ISO da ultima sincronizacao completa (subida + descida sem falha). */
  ultimaSync: string | null;
  /** Por que a ultima tentativa nao terminou (texto para a tela), ou `null`. */
  ultimoErro: string | null;
}

export interface ResultadoSync {
  executou: boolean;
  confirmadas: number;
  rejeitadas: number;
  /** A subida parou por falha transitoria (rede, 5xx, timeout). */
  interrompida: boolean;
  precisaLogin: boolean;
  recebidas: number;
  erro: string | null;
}

export interface DependenciasMotor {
  banco: Banco;
  sessao: GerenciadorSessao;
  monitor: MonitorConectividade;
  agora?: () => Date;
  novoId?: () => string;
  /** [0, 1) — o jitter do backoff. */
  aleatorio?: () => number;
  agendar?: (funcao: () => void, ms: number) => () => void;
}

export const RECUO_BASE_MS = 1_000;
export const RECUO_TETO_MS = 5 * 60_000;

/** Backoff exponencial com jitter: 1 s, 2 s, 4 s... teto de 5 min; o jitter tira ate metade. */
export function calcularRecuoMs(falhasSeguidas: number, aleatorio: number): number {
  const cheio = Math.min(RECUO_TETO_MS, RECUO_BASE_MS * 2 ** Math.max(0, falhasSeguidas - 1));
  return Math.round(cheio * (0.5 + aleatorio * 0.5));
}

/** Tabela e chave primaria local de cada entidade do outbox. */
const TABELA: Record<Comando['entidade'], { tabela: string; chave: string }> = {
  pessoa: { tabela: 'pessoa', chave: 'id' },
  prontuario: { tabela: 'prontuario', chave: 'pessoa_id' },
  prontuario_item: { tabela: 'prontuario_item', chave: 'id' },
  atendimento: { tabela: 'atendimento', chave: 'id' },
  atendimento_evento: { tabela: 'atendimento_evento', chave: 'id' },
};

/** So sobrescreve a linha local se nao houver operacao pendente para ela. */
const semPendencia = (entidade: Comando['entidade'], coluna: string) =>
  `NOT EXISTS (SELECT 1 FROM outbox WHERE entidade = '${entidade}' AND entidade_id = excluded.${coluna} AND status != 'CONFIRMADA')`;

function descreverRejeicao(status: number, corpo: unknown): string {
  const erro = (corpo ?? {}) as { codigo?: string; mensagem?: string; detalhes?: Array<{ campo: string; mensagem: string }> };
  const detalhes = erro.detalhes?.map((d) => `${d.campo}: ${d.mensagem}`).join('; ');
  return [`${status} ${erro.codigo ?? 'RECUSADA'}`, erro.mensagem, detalhes].filter(Boolean).join(' — ');
}

const agendarPadrao = (funcao: () => void, ms: number) => {
  const id = setTimeout(funcao, ms);
  return () => clearTimeout(id);
};

export class MotorSincronizacao {
  estado: EstadoMotor = { sincronizando: false, ultimaSync: null, ultimoErro: null };
  private ouvintes = new Set<() => void>();
  private emCurso: Promise<ResultadoSync> | null = null;
  private pedidoNoMeio = false;
  private zerarRecuo = false;
  private cancelarTemporizador: (() => void) | null = null;
  private desligar: (() => void) | null = null;
  private readonly agora: () => Date;
  private readonly novoId: () => string;
  private readonly aleatorio: () => number;
  private readonly agendar: (funcao: () => void, ms: number) => () => void;

  constructor(private readonly deps: DependenciasMotor) {
    this.agora = deps.agora ?? (() => new Date());
    this.novoId = deps.novoId ?? (() => crypto.randomUUID());
    this.aleatorio = deps.aleatorio ?? Math.random;
    this.agendar = deps.agendar ?? agendarPadrao;
  }

  assinar(ouvinte: () => void): () => void {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  }

  private publicar(mudanca: Partial<EstadoMotor>): void {
    this.estado = { ...this.estado, ...mudanca };
    for (const ouvinte of this.ouvintes) ouvinte();
  }

  /**
   * Abertura do app: o que ficou ENVIANDO (app fechado no meio) volta a PENDENTE — o reenvio e
   * seguro pela idempotencia — e o motor passa a assinar o monitor de conectividade.
   */
  async iniciar(): Promise<void> {
    await this.deps.banco.gravar([{ sql: "UPDATE outbox SET status = 'PENDENTE' WHERE status = 'ENVIANDO'" }]);
    this.publicar({ ultimaSync: await this.deps.banco.lerEstado('ultima_sync') });
    this.desligar = this.deps.monitor.assinar((estado, anterior) => {
      if (estado.online && !anterior.online) {
        // A conexao voltou: o backoff e zerado e a fila anda na hora.
        this.zerarRecuo = true;
        void this.sincronizar('conexao');
      }
      if (!estado.online) this.cancelarTemporizador?.();
    });
  }

  parar(): void {
    this.desligar?.();
    this.cancelarTemporizador?.();
    this.cancelarTemporizador = null;
  }

  /** Espera terminar o que estiver em curso (inclusive a repassagem pedida no meio). */
  async ocioso(): Promise<void> {
    while (this.emCurso) await this.emCurso.catch(() => undefined);
  }

  /**
   * Sincroniza agora. Se ja houver uma sincronizacao em curso, NAO comeca outra: devolve a mesma
   * promessa e marca que e preciso passar de novo ao terminar (pode ter entrado comando novo).
   */
  sincronizar(gatilho: Gatilho): Promise<ResultadoSync> {
    if (this.emCurso) {
      this.pedidoNoMeio = true;
      return this.emCurso;
    }
    this.emCurso = this.executar(gatilho).finally(() => {
      this.emCurso = null;
      if (this.pedidoNoMeio) {
        this.pedidoNoMeio = false;
        void this.sincronizar('escrita');
      }
    });
    return this.emCurso;
  }

  private async executar(gatilho: Gatilho): Promise<ResultadoSync> {
    const resultado: ResultadoSync = {
      executou: false,
      confirmadas: 0,
      rejeitadas: 0,
      interrompida: false,
      precisaLogin: false,
      recebidas: 0,
      erro: null,
    };
    this.cancelarTemporizador?.();
    this.cancelarTemporizador = null;
    const { monitor, sessao, banco } = this.deps;
    if (!sessao.atual) return resultado;
    if (!monitor.estado.online) {
      resultado.erro = monitor.estado.simulandoOffline ? 'Modo offline simulado.' : 'Sem conexão com o servidor.';
      return resultado;
    }
    if (sessao.atual.precisaLogin) {
      // O outbox fica intacto ate o profissional entrar de novo.
      resultado.precisaLogin = true;
      resultado.erro = new SessaoExpirada().message;
      this.publicar({ ultimoErro: resultado.erro });
      return resultado;
    }

    resultado.executou = true;
    this.publicar({ sincronizando: true });
    try {
      // Conexao que voltou ou pedido explicito do profissional: nao espera o recuo.
      if (this.zerarRecuo || gatilho === 'manual') {
        this.zerarRecuo = false;
        await banco.gravar([
          { sql: "UPDATE outbox SET recuo = 0, proxima_tentativa_em = NULL WHERE status = 'PENDENTE' AND recuo > 0" },
        ]);
      }
      await this.subir(resultado);
      if (!resultado.interrompida && !resultado.precisaLogin) {
        await this.enviarLogs();
        await this.descer(resultado);
        const agora = this.agora().toISOString();
        await banco.gravarEstado('ultima_sync', agora);
        this.publicar({ ultimaSync: agora });
      }
    } catch (erro) {
      if (erro instanceof SessaoExpirada) resultado.precisaLogin = true;
      else if (erro instanceof FalhaTransporte) resultado.interrompida = true;
      resultado.erro = mensagemDe(erro);
    }
    if (resultado.precisaLogin) resultado.erro = new SessaoExpirada().message;

    // Registro de auditoria da tentativa (so quando houve o que contar, para nao gerar ruido).
    if (gatilho === 'manual' || resultado.confirmadas || resultado.rejeitadas || resultado.erro) {
      await banco
        .gravar([
          sqlLog({
            id: this.novoId(),
            ocorridoEm: this.agora().toISOString(),
            acao: 'SINCRONIZACAO',
            resultado: resultado.erro ? 'FALHA' : 'SUCESSO',
            estavaOnline: monitor.estado.online,
            detalhe: {
              gatilho,
              confirmadas: resultado.confirmadas,
              rejeitadas: resultado.rejeitadas,
              recebidas: resultado.recebidas,
              ...(resultado.erro ? { erro: resultado.erro } : {}),
            },
            profissionalId: sessao.atual?.profissional.id ?? null,
          }),
        ])
        .catch(() => undefined);
    }
    this.publicar({ sincronizando: false, ultimoErro: resultado.erro });
    await this.agendarProxima();
    return resultado;
  }

  // ---------------------------------------------------------------- subida

  /** Um comando por requisicao, na ordem de criacao. Progresso parcial fica salvo. */
  private async subir(resultado: ResultadoSync): Promise<void> {
    const { banco, sessao } = this.deps;
    for (;;) {
      const profissionalId = sessao.atual?.profissional.id ?? null;
      const fila = classificarFila(await listarNaoConfirmados(banco), profissionalId);
      const proximo = fila.find((item) => item.situacao === 'ENVIAVEL')?.comando;
      if (!proximo) return;
      // A cabeca da fila ainda esta em recuo: nada passa na frente (a ordem e parte do contrato).
      if (proximo.proximaTentativaEm && Date.parse(proximo.proximaTentativaEm) > this.agora().getTime()) {
        resultado.interrompida = true;
        return;
      }

      await banco.gravar([
        { sql: "UPDATE outbox SET status = 'ENVIANDO', tentativas = tentativas + 1 WHERE op_id = ?", params: [proximo.opId] },
      ]);

      let status: number | null = null;
      let corpo: unknown = null;
      let falha: unknown = null;
      try {
        const resposta = await sessao.requisitar({
          metodo: proximo.metodo,
          rota: proximo.rota,
          corpo: JSON.parse(proximo.corpo),
          chaveIdempotencia: proximo.opId,
        });
        status = resposta.status;
        corpo = resposta.corpo;
      } catch (erro) {
        falha = erro;
      }

      if (status !== null && status >= 200 && status < 300) {
        await banco.gravar(this.sqlConfirmar(proximo, corpo));
        resultado.confirmadas++;
        continue;
      }

      if (falha instanceof SessaoExpirada || (falha instanceof FalhaTransporte && falha.motivo === 'OFFLINE_SIMULADO')) {
        // Nao e culpa da rede: devolve a fila sem contar tentativa nem recuo.
        await banco.gravar([
          { sql: "UPDATE outbox SET status = 'PENDENTE', tentativas = tentativas - 1 WHERE op_id = ?", params: [proximo.opId] },
        ]);
        if (falha instanceof SessaoExpirada) resultado.precisaLogin = true;
        else resultado.interrompida = true;
        return;
      }

      // Rede, timeout, 5xx (ou erro inesperado do proprio app): transitorio, com recuo.
      if (ehFalhaTransitoria(status)) {
        const recuo = proximo.recuo + 1;
        const espera = calcularRecuoMs(recuo, this.aleatorio());
        const motivo = falha ? mensagemDe(falha) : `Servidor respondeu ${status}.`;
        await banco.gravar([
          {
            sql: "UPDATE outbox SET status = 'PENDENTE', recuo = ?, proxima_tentativa_em = ?, ultimo_erro = ? WHERE op_id = ?",
            params: [recuo, new Date(this.agora().getTime() + espera).toISOString(), motivo, proximo.opId],
          },
        ]);
        resultado.interrompida = true;
        resultado.erro = motivo;
        return;
      }

      // 4xx: rejeicao definitiva. Vai para "Pendencias"; os dependentes ficam retidos atras dela.
      await banco.gravar([
        {
          sql: "UPDATE outbox SET status = 'REJEITADA', recuo = 0, proxima_tentativa_em = NULL, ultimo_erro = ? WHERE op_id = ?",
          params: [descreverRejeicao(status as number, corpo), proximo.opId],
        },
      ]);
      resultado.rejeitadas++;
    }
  }

  /** Comando aceito: marca CONFIRMADA e atualiza o `estado_sync` da linha local, na mesma transacao. */
  private sqlConfirmar(comando: Comando, resposta: unknown): ComandoSql[] {
    const { tabela, chave } = TABELA[comando.entidade];
    const sql: ComandoSql[] = [
      {
        sql: "UPDATE outbox SET status = 'CONFIRMADA', recuo = 0, proxima_tentativa_em = NULL, ultimo_erro = NULL, confirmado_em = ? WHERE op_id = ?",
        params: [this.agora().toISOString(), comando.opId],
      },
      {
        sql: `UPDATE ${tabela} SET estado_sync = 'CONFIRMADO' WHERE ${chave} = ?
              AND NOT EXISTS (SELECT 1 FROM outbox WHERE entidade = ? AND entidade_id = ? AND status != 'CONFIRMADA')`,
        params: [comando.entidadeId, comando.entidade, comando.entidadeId],
      },
    ];
    const pessoa = comando.entidade === 'pessoa' ? pessoaSchema.safeParse(resposta) : null;
    if (pessoa?.success) {
      // O servidor pode ter unido campos editados em outro aparelho (CampoMaisRecente): vale a resposta.
      sql.push(sqlInserir('pessoa', { ...pessoa.data, estadoSync: 'CONFIRMADO' }, { conflito: 'id', somenteSe: semPendencia('pessoa', 'id') }));
    }
    if (comando.entidade === 'prontuario') {
      // O servidor pode devolver o prontuario que a pessoa ja tinha: o id local e trocado pelo dele.
      const idServidor = (resposta as { id?: unknown } | null)?.id;
      if (typeof idServidor === 'string') {
        sql.push(
          { sql: 'UPDATE prontuario SET id = ? WHERE pessoa_id = ?', params: [idServidor, comando.entidadeId] },
          { sql: 'UPDATE prontuario_item SET prontuario_id = ? WHERE pessoa_id = ?', params: [idServidor, comando.entidadeId] },
        );
      }
      // Itens enviados junto com o prontuario ficam confirmados com ele.
      const itens = (JSON.parse(comando.corpo) as { itens?: Array<{ id: string }> }).itens ?? [];
      for (const item of itens) {
        sql.push({
          sql: `UPDATE prontuario_item SET estado_sync = 'CONFIRMADO' WHERE id = ?
                AND NOT EXISTS (SELECT 1 FROM outbox WHERE entidade = 'prontuario_item' AND entidade_id = ? AND status != 'CONFIRMADA')`,
          params: [item.id, item.id],
        });
      }
    }
    return sql;
  }

  // ---------------------------------------------------------------- logs

  /** Envia os logs locais em lotes; so apaga depois da confirmacao do servidor (idempotente por id). */
  private async enviarLogs(): Promise<void> {
    const { banco, sessao } = this.deps;
    for (;;) {
      const linhas = await banco.consultar(
        'SELECT * FROM log_local WHERE profissional_id IS NULL OR profissional_id = ? ORDER BY ocorrido_em LIMIT ?',
        [sessao.atual?.profissional.id ?? null, MAXIMO_LOGS_POR_CHAMADA],
      );
      if (linhas.length === 0) return;
      const logs = linhas.map((linha) => {
        const log = linhaParaObjeto<Record<string, unknown>>(linha, { booleanos: ['estavaOnline'], json: ['detalhe'] });
        return {
          id: log.id,
          ocorridoEm: log.ocorridoEm,
          acao: log.acao,
          ...(log.entidade ? { entidade: log.entidade } : {}),
          ...(log.entidadeId ? { entidadeId: log.entidadeId } : {}),
          resultado: log.resultado,
          estavaOnline: log.estavaOnline,
          ...(log.detalhe ? { detalhe: log.detalhe } : {}),
        };
      });
      const resposta = await sessao.requisitar({ metodo: 'POST', rota: '/api/v1/log', corpo: { logs } });
      if (resposta.status < 200 || resposta.status >= 300) return; // fica para a proxima; nada e apagado
      await banco.gravar(logs.map((log) => ({ sql: 'DELETE FROM log_local WHERE id = ?', params: [log.id as string] })));
      if (linhas.length < MAXIMO_LOGS_POR_CHAMADA) return;
    }
  }

  // ---------------------------------------------------------------- descida

  /** Baixa o delta por cursor. Dados e cursor entram na MESMA transacao local, pagina a pagina. */
  private async descer(resultado: ResultadoSync): Promise<void> {
    const { banco, sessao } = this.deps;
    for (;;) {
      const cursor = (await banco.lerEstado('cursor')) ?? '0';
      const resposta = await sessao.requisitar({
        metodo: 'GET',
        rota: `/api/v1/sync/alteracoes?desde=${encodeURIComponent(cursor)}&limite=500`,
      });
      if (resposta.status !== 200) {
        throw ehFalhaTransitoria(resposta.status)
          ? new FalhaTransporte('REDE', `Servidor respondeu ${resposta.status} ao baixar alterações.`)
          : new Error(`Não foi possível baixar alterações: ${descreverRejeicao(resposta.status, resposta.corpo)}`);
      }
      const pagina = alteracoesSchema.parse(resposta.corpo);
      const sql: ComandoSql[] = [];
      for (const medicamento of pagina.medicamentos) {
        sql.push(sqlInserir('medicamento', medicamento, { conflito: 'id' })); // ServidorVence
      }
      for (const pessoa of pagina.pessoas) {
        sql.push(
          sqlInserir('pessoa', { ...pessoa, estadoSync: 'CONFIRMADO' }, { conflito: 'id', somenteSe: semPendencia('pessoa', 'id') }),
        );
      }
      for (const prontuario of pagina.prontuarios) {
        sql.push(
          sqlInserir(
            'prontuario',
            { ...prontuario, estadoSync: 'CONFIRMADO' },
            { conflito: 'pessoa_id', somenteSe: semPendencia('prontuario', 'pessoa_id') },
          ),
        );
      }
      for (const item of pagina.prontuarioItens) {
        sql.push(
          sqlInserir(
            'prontuario_item',
            { ...item, estadoSync: 'CONFIRMADO' },
            { conflito: 'id', somenteSe: semPendencia('prontuario_item', 'id') },
          ),
        );
      }
      sql.push(sqlEstado('cursor', pagina.proximoCursor));
      await banco.gravar(sql);
      resultado.recebidas +=
        pagina.medicamentos.length + pagina.pessoas.length + pagina.prontuarios.length + pagina.prontuarioItens.length;
      if (!pagina.temMais) return;
    }
  }

  // ---------------------------------------------------------------- temporizador

  /** Enquanto houver pendencia enviavel e conexao, tenta de novo quando o recuo da cabeca da fila vencer. */
  private async agendarProxima(): Promise<void> {
    const { banco, sessao, monitor } = this.deps;
    if (!monitor.estado.online || !sessao.atual || sessao.atual.precisaLogin) return;
    const fila = classificarFila(await listarNaoConfirmados(banco), sessao.atual.profissional.id);
    const proximo = fila.find((item) => item.situacao === 'ENVIAVEL')?.comando;
    if (!proximo) return;
    const espera = proximo.proximaTentativaEm
      ? Math.max(250, Date.parse(proximo.proximaTentativaEm) - this.agora().getTime())
      : 250;
    this.cancelarTemporizador = this.agendar(() => void this.sincronizar('temporizador'), espera);
  }
}
