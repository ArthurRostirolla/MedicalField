// Repository de atendimentos: a linha do tempo imutavel. Corrigir = novo evento RETIFICACAO.
import { atendimentoEntradaSchema, eventoEntradaSchema, type TipoEvento } from '@medicalfield/contratos';
import { linhaParaObjeto, sqlInserir } from '../banco/banco.ts';
import type { ComandoSql } from '../banco/executor.ts';
import { estadoEnvio, logAcao, sqlStatusEnvio, validar, type ContextoDados, type EstadoEnvio } from './contexto.ts';
import { sqlNovoComando } from './outbox.ts';

export interface AtendimentoLocal {
  id: string;
  pessoaId: string;
  pessoaNome: string;
  profissionalNome: string;
  iniciadoEm: string;
  localDescricao: string | null;
  queixaPrincipal: string | null;
  status: 'ABERTO' | 'ENCERRADO';
  encerradoEm: string | null;
  envio: EstadoEnvio;
}

export interface EventoLocal {
  id: string;
  atendimentoId: string;
  tipo: TipoEvento;
  ocorridoEm: string;
  dados: Record<string, unknown>;
  retificaEventoId?: string;
  profissionalNome: string;
  envio: EstadoEnvio;
}

const ROTULO_EVENTO: Record<TipoEvento, string> = {
  SINAIS_VITAIS: 'Sinais vitais',
  GLASGOW: 'Glasgow',
  TRIAGEM: 'Triagem',
  MEDICACAO: 'Medicação',
  PROCEDIMENTO: 'Procedimento',
  OBSERVACAO: 'Observação',
  RETIFICACAO: 'Retificação',
  ENCERRAMENTO: 'Encerramento',
};

const SELECAO = `SELECT a.*, COALESCE(p.nome, 'Paciente não encontrado') AS pessoa_nome, ${sqlStatusEnvio('atendimento', 'a.id')}
                 FROM atendimento a LEFT JOIN pessoa p ON p.id = a.pessoa_id`;

const paraAtendimento = (linha: Record<string, unknown>): AtendimentoLocal => {
  const { statusEnvio, estadoSync, ...atendimento } = linhaParaObjeto<Record<string, unknown>>(linha);
  return { ...(atendimento as unknown as Omit<AtendimentoLocal, 'envio'>), envio: estadoEnvio(statusEnvio, estadoSync) };
};

export class RepositorioAtendimentos {
  constructor(private readonly ctx: ContextoDados) {}

  /** Atendimentos em aberto registrados neste aparelho, mais recentes primeiro. */
  async abertos(): Promise<AtendimentoLocal[]> {
    return (await this.ctx.banco.consultar(`${SELECAO} WHERE a.status = 'ABERTO' ORDER BY a.iniciado_em DESC`)).map(paraAtendimento);
  }

  async encerradosRecentes(limite = 10): Promise<AtendimentoLocal[]> {
    return (
      await this.ctx.banco.consultar(`${SELECAO} WHERE a.status = 'ENCERRADO' ORDER BY a.iniciado_em DESC LIMIT ?`, [limite])
    ).map(paraAtendimento);
  }

  async daPessoa(pessoaId: string): Promise<AtendimentoLocal[]> {
    return (await this.ctx.banco.consultar(`${SELECAO} WHERE a.pessoa_id = ? ORDER BY a.iniciado_em DESC`, [pessoaId])).map(
      paraAtendimento,
    );
  }

  async obter(id: string): Promise<AtendimentoLocal | null> {
    const [linha] = await this.ctx.banco.consultar(`${SELECAO} WHERE a.id = ?`, [id]);
    return linha ? paraAtendimento(linha) : null;
  }

  async eventos(atendimentoId: string): Promise<EventoLocal[]> {
    const linhas = await this.ctx.banco.consultar(
      `SELECT e.id, e.atendimento_id, e.tipo, e.ocorrido_em, e.dados, e.retifica_evento_id, e.profissional_nome, e.estado_sync,
              ${sqlStatusEnvio('atendimento_evento', 'e.id')}
       FROM atendimento_evento e WHERE e.atendimento_id = ? ORDER BY e.ocorrido_em, e.id`,
      [atendimentoId],
    );
    return linhas.map((linha) => {
      const { statusEnvio, estadoSync, retificaEventoId, ...evento } = linhaParaObjeto<Record<string, unknown>>(linha, {
        json: ['dados'],
      });
      return {
        ...(evento as unknown as Omit<EventoLocal, 'envio' | 'retificaEventoId'>),
        ...(typeof retificaEventoId === 'string' ? { retificaEventoId } : {}),
        envio: estadoEnvio(statusEnvio, estadoSync),
      };
    });
  }

  /** Abre um atendimento para a pessoa. Devolve o id. */
  async iniciar(entrada: { pessoaId: string; queixaPrincipal?: string; localDescricao?: string }): Promise<string> {
    const { ctx } = this;
    const profissional = ctx.profissional();
    const agora = ctx.agora().toISOString();
    const [pessoa] = await ctx.banco.consultar<{ nome: string }>('SELECT nome FROM pessoa WHERE id = ?', [entrada.pessoaId]);
    const corpo = validar(
      atendimentoEntradaSchema,
      JSON.parse(
        JSON.stringify({
          id: ctx.novoId(),
          pessoaId: entrada.pessoaId,
          iniciadoEm: agora,
          queixaPrincipal: entrada.queixaPrincipal?.trim() || undefined,
          localDescricao: entrada.localDescricao?.trim() || undefined,
        }),
      ),
    );
    await ctx.banco.gravar([
      sqlInserir('atendimento', {
        id: corpo.id,
        pessoaId: corpo.pessoaId,
        profissionalId: profissional.id,
        profissionalNome: profissional.nome,
        iniciadoEm: agora,
        localDescricao: corpo.localDescricao ?? null,
        queixaPrincipal: corpo.queixaPrincipal ?? null,
        status: 'ABERTO',
        estadoSync: 'LOCAL',
      }),
      sqlNovoComando({
        opId: ctx.novoId(),
        metodo: 'POST',
        rota: '/api/v1/atendimento',
        corpo,
        entidade: 'atendimento',
        entidadeId: corpo.id,
        dependeDe: { entidade: 'pessoa', id: corpo.pessoaId },
        descricao: `Início de atendimento · ${pessoa?.nome ?? 'paciente'}`,
        profissionalId: profissional.id,
        criadoEm: agora,
      }),
      logAcao(ctx, 'ATENDIMENTO_INICIADO', 'atendimento', corpo.id),
    ]);
    ctx.aposEscrita();
    return corpo.id;
  }

  /**
   * Acrescenta um evento a linha do tempo (validado pelo mesmo esquema do servidor).
   * ENCERRAMENTO tambem fecha o atendimento local, na mesma transacao. Devolve o id do evento.
   */
  async registrarEvento(evento: {
    atendimentoId: string;
    tipo: TipoEvento;
    dados: Record<string, unknown>;
    retificaEventoId?: string;
  }): Promise<string> {
    const { ctx } = this;
    const profissional = ctx.profissional();
    const agora = ctx.agora().toISOString();
    const [paciente] = await ctx.banco.consultar<{ nome: string }>(
      'SELECT p.nome FROM atendimento a JOIN pessoa p ON p.id = a.pessoa_id WHERE a.id = ?',
      [evento.atendimentoId],
    );
    const corpo = validar(eventoEntradaSchema, {
      id: ctx.novoId(),
      atendimentoId: evento.atendimentoId,
      tipo: evento.tipo,
      ocorridoEm: agora,
      dados: evento.dados,
      ...(evento.tipo === 'RETIFICACAO' ? { retificaEventoId: evento.retificaEventoId } : {}),
    });
    const sql: ComandoSql[] = [
      sqlInserir('atendimento_evento', {
        id: corpo.id,
        atendimentoId: corpo.atendimentoId,
        tipo: corpo.tipo,
        ocorridoEm: agora,
        dados: JSON.stringify(corpo.dados),
        retificaEventoId: corpo.tipo === 'RETIFICACAO' ? corpo.retificaEventoId : null,
        profissionalId: profissional.id,
        profissionalNome: profissional.nome,
        estadoSync: 'LOCAL',
      }),
      sqlNovoComando({
        opId: ctx.novoId(),
        metodo: 'POST',
        rota: '/api/v1/atendimento-evento',
        corpo,
        entidade: 'atendimento_evento',
        entidadeId: corpo.id,
        dependeDe: { entidade: 'atendimento', id: corpo.atendimentoId },
        descricao: `${ROTULO_EVENTO[corpo.tipo]} · ${paciente?.nome ?? 'paciente'}`,
        profissionalId: profissional.id,
        criadoEm: agora,
      }),
      logAcao(ctx, 'EVENTO_REGISTRADO', 'atendimento_evento', corpo.id, { tipo: corpo.tipo }),
    ];
    if (corpo.tipo === 'ENCERRAMENTO') {
      sql.push({
        sql: "UPDATE atendimento SET status = 'ENCERRADO', encerrado_em = ? WHERE id = ?",
        params: [agora, corpo.atendimentoId],
      });
    }
    await ctx.banco.gravar(sql);
    ctx.aposEscrita();
    return corpo.id;
  }
}
