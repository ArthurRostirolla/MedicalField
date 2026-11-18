// Tela de Pendencias: a fila do outbox, as rejeitadas com o motivo, tentar de novo e descartar.
import { chaveDe, classificarFila, listarNaoConfirmados, type Comando, type SituacaoFila } from './outbox.ts';
import type { ComandoSql } from '../banco/executor.ts';
import { logAcao, type ContextoDados } from './contexto.ts';

export interface Pendencia {
  comando: Comando;
  situacao: SituacaoFila;
}

export interface Contagens {
  /** Tudo que ainda nao foi confirmado (inclui retidas e rejeitadas). */
  pendentes: number;
  rejeitadas: number;
}

const TABELA_LOCAL: Record<Comando['entidade'], { tabela: string; chave: string }> = {
  pessoa: { tabela: 'pessoa', chave: 'id' },
  prontuario: { tabela: 'prontuario', chave: 'pessoa_id' },
  prontuario_item: { tabela: 'prontuario_item', chave: 'id' },
  atendimento: { tabela: 'atendimento', chave: 'id' },
  atendimento_evento: { tabela: 'atendimento_evento', chave: 'id' },
};

export class RepositorioPendencias {
  constructor(private readonly ctx: ContextoDados) {}

  async listar(profissionalId: string | null): Promise<Pendencia[]> {
    return classificarFila(await listarNaoConfirmados(this.ctx.banco), profissionalId);
  }

  async contar(): Promise<Contagens> {
    const [linha] = await this.ctx.banco.consultar<{ pendentes: number; rejeitadas: number }>(
      `SELECT count(*) AS pendentes, COALESCE(sum(status = 'REJEITADA'), 0) AS rejeitadas FROM outbox WHERE status != 'CONFIRMADA'`,
    );
    return { pendentes: linha?.pendentes ?? 0, rejeitadas: linha?.rejeitadas ?? 0 };
  }

  /** Quantas operacoes de quem esta saindo ainda nao foram confirmadas. */
  async contarDoProfissional(profissionalId: string): Promise<number> {
    const [linha] = await this.ctx.banco.consultar<{ n: number }>(
      "SELECT count(*) AS n FROM outbox WHERE status != 'CONFIRMADA' AND profissional_id = ?",
      [profissionalId],
    );
    return linha?.n ?? 0;
  }

  /** Devolve uma rejeitada a fila, como esta (mesma chave de idempotencia). */
  async tentarDeNovo(opId: string): Promise<void> {
    const { ctx } = this;
    await ctx.banco.gravar([
      {
        sql: "UPDATE outbox SET status = 'PENDENTE', recuo = 0, proxima_tentativa_em = NULL WHERE op_id = ? AND status = 'REJEITADA'",
        params: [opId],
      },
      logAcao(ctx, 'PENDENCIA_REENVIADA', 'outbox', opId),
    ]);
    ctx.aposEscrita();
  }

  /** As operacoes que seriam descartadas junto (a escolhida + as que dependem dela, em cadeia). */
  async cadeiaDe(opId: string): Promise<Comando[]> {
    const fila = await listarNaoConfirmados(this.ctx.banco);
    const alvo = fila.find((comando) => comando.opId === opId);
    if (!alvo) return [];
    const chaves = new Set([chaveDe(alvo.entidade, alvo.entidadeId)]);
    const cadeia = [alvo];
    for (const comando of fila) {
      if (comando.ordem <= alvo.ordem) continue;
      const chave = chaveDe(comando.entidade, comando.entidadeId);
      if (chaves.has(chave) || (comando.dependeDe !== null && chaves.has(comando.dependeDe))) {
        chaves.add(chave);
        cadeia.push(comando);
      }
    }
    return cadeia;
  }

  /**
   * Descarta uma operacao rejeitada e as que dependem dela: sai do outbox e o registro que so
   * existia neste aparelho e removido (uma inativacao descartada volta o item a ativo).
   * E o unico lugar do app que apaga registro, e fica em log.
   */
  async descartar(opId: string): Promise<number> {
    const { ctx } = this;
    const cadeia = await this.cadeiaDe(opId);
    if (cadeia.length === 0) return 0;
    const sql: ComandoSql[] = [];
    for (const comando of cadeia) {
      sql.push({ sql: 'DELETE FROM outbox WHERE op_id = ?', params: [comando.opId] });
      if (comando.rota.endsWith('/inativacao')) {
        sql.push({
          sql: "UPDATE prontuario_item SET inativado_em = NULL, estado_sync = 'CONFIRMADO' WHERE id = ?",
          params: [comando.entidadeId],
        });
        continue;
      }
      const { tabela, chave } = TABELA_LOCAL[comando.entidade];
      sql.push({ sql: `DELETE FROM ${tabela} WHERE ${chave} = ? AND estado_sync = 'LOCAL'`, params: [comando.entidadeId] });
      const corpo = JSON.parse(comando.corpo) as { itens?: Array<{ id: string }>; tipo?: string; atendimentoId?: string };
      if (comando.entidade === 'prontuario') {
        for (const item of corpo.itens ?? []) {
          sql.push({ sql: "DELETE FROM prontuario_item WHERE id = ? AND estado_sync = 'LOCAL'", params: [item.id] });
        }
      }
      if (comando.entidade === 'atendimento_evento' && corpo.tipo === 'ENCERRAMENTO' && corpo.atendimentoId) {
        sql.push({
          sql: "UPDATE atendimento SET status = 'ABERTO', encerrado_em = NULL WHERE id = ?",
          params: [corpo.atendimentoId],
        });
      }
    }
    sql.push(logAcao(ctx, 'PENDENCIA_DESCARTADA', 'outbox', opId, { operacoes: cadeia.length }));
    await ctx.banco.gravar(sql);
    ctx.aposEscrita();
    return cadeia.length;
  }
}
