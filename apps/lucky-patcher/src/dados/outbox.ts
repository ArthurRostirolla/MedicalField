// Padrao Command: cada operacao do profissional vira um comando serializavel no outbox,
// gravado na MESMA transacao do dado. `op_id` e a Idempotency-Key do reenvio.
import { linhaParaObjeto, sqlInserir, type Banco } from '../banco/banco.ts';
import type { ComandoSql } from '../banco/executor.ts';

export type Entidade = 'pessoa' | 'prontuario' | 'prontuario_item' | 'atendimento' | 'atendimento_evento';
export type StatusComando = 'PENDENTE' | 'ENVIANDO' | 'CONFIRMADA' | 'REJEITADA';

export interface Comando {
  ordem: number;
  opId: string;
  metodo: 'POST' | 'PATCH';
  rota: string;
  corpo: string;
  entidade: Entidade;
  entidadeId: string;
  /** `tabela:id` da entidade que precisa ter sido aceita antes. */
  dependeDe: string | null;
  descricao: string;
  profissionalId: string;
  status: StatusComando;
  tentativas: number;
  recuo: number;
  proximaTentativaEm: string | null;
  ultimoErro: string | null;
  criadoEm: string;
  confirmadoEm: string | null;
}

export interface NovoComando {
  opId: string;
  metodo: 'POST' | 'PATCH';
  rota: string;
  corpo: unknown;
  entidade: Entidade;
  entidadeId: string;
  dependeDe?: { entidade: Entidade; id: string };
  /** Texto curto para a tela de Pendencias (sem dado clinico sensivel alem do necessario). */
  descricao: string;
  profissionalId: string;
  criadoEm: string;
}

export const chaveDe = (entidade: Entidade, id: string) => `${entidade}:${id}`;

export function sqlNovoComando(comando: NovoComando): ComandoSql {
  return sqlInserir('outbox', {
    opId: comando.opId,
    metodo: comando.metodo,
    rota: comando.rota,
    corpo: JSON.stringify(comando.corpo),
    entidade: comando.entidade,
    entidadeId: comando.entidadeId,
    dependeDe: comando.dependeDe ? chaveDe(comando.dependeDe.entidade, comando.dependeDe.id) : null,
    descricao: comando.descricao,
    profissionalId: comando.profissionalId,
    criadoEm: comando.criadoEm,
  });
}

export interface LogNovo {
  id: string;
  ocorridoEm: string;
  acao: string;
  entidade?: string;
  entidadeId?: string;
  resultado: 'SUCESSO' | 'FALHA';
  estavaOnline: boolean;
  detalhe?: Record<string, unknown>;
  profissionalId: string | null;
}

/** Linha de auditoria local; sobe depois por `POST /log`. Nunca leva dado de paciente. */
export function sqlLog(log: LogNovo): ComandoSql {
  return sqlInserir('log_local', { ...log, detalhe: log.detalhe ? JSON.stringify(log.detalhe) : null });
}

/** Comandos ainda nao confirmados, na ordem de envio. */
export async function listarNaoConfirmados(banco: Banco): Promise<Comando[]> {
  const linhas = await banco.consultar("SELECT * FROM outbox WHERE status != 'CONFIRMADA' ORDER BY ordem");
  return linhas.map((linha) => linhaParaObjeto<Comando>(linha));
}

export type SituacaoFila = 'ENVIAVEL' | 'ENVIANDO' | 'REJEITADA' | 'RETIDA' | 'DE_OUTRO_PROFISSIONAL';

/**
 * Classifica a fila, em ordem. Um comando fica RETIDO (nao e enviado nem descartado) quando ele,
 * ou a entidade de que depende, esta atras de um comando rejeitado, retido ou de outro profissional.
 * Os independentes continuam enviaveis.
 */
export function classificarFila(
  comandos: readonly Comando[],
  profissionalId: string | null,
): Array<{ comando: Comando; situacao: SituacaoFila }> {
  const bloqueadas = new Set<string>();
  return comandos.map((comando) => {
    const chave = chaveDe(comando.entidade, comando.entidadeId);
    let situacao: SituacaoFila;
    if (comando.status === 'REJEITADA') situacao = 'REJEITADA';
    else if (bloqueadas.has(chave) || (comando.dependeDe !== null && bloqueadas.has(comando.dependeDe))) situacao = 'RETIDA';
    else if (comando.profissionalId !== profissionalId) situacao = 'DE_OUTRO_PROFISSIONAL';
    else situacao = comando.status === 'ENVIANDO' ? 'ENVIANDO' : 'ENVIAVEL';
    if (situacao !== 'ENVIAVEL' && situacao !== 'ENVIANDO') bloqueadas.add(chave);
    return { comando, situacao };
  });
}
