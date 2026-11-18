import type { EstrategiaConflito } from './estrategia.ts';

type ComId = { id: string };
export type DecisaoRevisao = { aceitar: true; possivelDuplicataDe: string | null };

/**
 * Pessoa provavelmente duplicada (mesmo CPF, ou mesmo nome + nascimento): ACEITA e sinaliza para
 * revisao humana no portal. Nunca rejeita nem funde sozinha - rejeitar a pessoa bloquearia o atendimento.
 */
export class RevisaoManual implements EstrategiaConflito<readonly ComId[], ComId, DecisaoRevisao> {
  readonly nome = 'RevisaoManual';

  /**
   * @param atual pessoas parecidas ja cadastradas, da mais antiga para a mais nova
   * @param recebido a pessoa que esta chegando
   */
  resolver(atual: readonly ComId[], recebido: ComId): DecisaoRevisao {
    const original = atual.find((candidata) => candidata.id !== recebido.id);
    return { aceitar: true, possivelDuplicataDe: original?.id ?? null };
  }
}
