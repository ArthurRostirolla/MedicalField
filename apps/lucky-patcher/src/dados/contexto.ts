// O que todo repositorio precisa para gravar: banco, quem esta logado, relogio e gerador de ids.
import type { Profissional } from '@medicalfield/contratos';
import type { z } from 'zod';
import type { Banco } from '../banco/banco.ts';
import { sqlLog } from './outbox.ts';

export interface ContextoDados {
  banco: Banco;
  /** Profissional logado; lanca se nao houver sessao. */
  profissional(): Profissional;
  estaOnline(): boolean;
  agora(): Date;
  novoId(): string;
  /** Avisa o motor de sincronizacao que ha comando novo no outbox. */
  aposEscrita(): void;
}

export type EstadoEnvio = 'local' | 'enviando' | 'confirmado' | 'rejeitado';

/** `status_envio` = status do comando nao confirmado mais antigo da linha (ou nulo). */
export function estadoEnvio(statusEnvio: unknown, estadoSync: unknown): EstadoEnvio {
  if (statusEnvio === 'REJEITADA') return 'rejeitado';
  if (statusEnvio === 'ENVIANDO') return 'enviando';
  if (statusEnvio === 'PENDENTE') return 'local';
  return estadoSync === 'CONFIRMADO' ? 'confirmado' : 'local';
}

/** Subconsulta que traz o status do envio pendente de uma linha. */
export const sqlStatusEnvio = (entidade: string, colunaId: string) =>
  `(SELECT status FROM outbox o WHERE o.entidade = '${entidade}' AND o.entidade_id = ${colunaId} AND o.status != 'CONFIRMADA' ORDER BY o.ordem LIMIT 1) AS status_envio`;

/** O que o profissional digitou nao passa no contrato: a tela mostra campo a campo, nada e gravado. */
export class ErroValidacao extends Error {
  constructor(readonly campos: Record<string, string>) {
    super(Object.entries(campos).map(([campo, mensagem]) => `${campo}: ${mensagem}`).join('; '));
    this.name = 'ErroValidacao';
  }
}

/** Valida contra o esquema do contrato (o mesmo que o servidor usa). */
export function validar<T>(esquema: z.ZodType<T>, valor: unknown): T {
  const resultado = esquema.safeParse(valor);
  if (resultado.success) return resultado.data;
  const campos: Record<string, string> = {};
  for (const problema of resultado.error.issues) {
    const caminho = problema.path.join('.') || 'geral';
    campos[caminho] ??= problema.message;
  }
  throw new ErroValidacao(campos);
}

/** Linha de log local de uma acao do profissional. */
export function logAcao(
  ctx: ContextoDados,
  acao: string,
  entidade: string,
  entidadeId: string,
  detalhe?: Record<string, unknown>,
) {
  return sqlLog({
    id: ctx.novoId(),
    ocorridoEm: ctx.agora().toISOString(),
    acao,
    entidade,
    entidadeId,
    resultado: 'SUCESSO',
    estavaOnline: ctx.estaOnline(),
    detalhe,
    profissionalId: ctx.profissional().id,
  });
}
