import type { EstrategiaConflito } from './estrategia.ts';

type ComId = { id: string };
export type DecisaoUniao<T> = { novos: T[]; repetidos: T[] };

/**
 * Eventos do atendimento e itens do prontuario: nunca conflitam. Cada registro tem UUID proprio,
 * o resultado e a uniao, e o que ja existe nunca e alterado nem removido por uma copia antiga.
 */
export class UniaoImutavel implements EstrategiaConflito<readonly ComId[], readonly ComId[], DecisaoUniao<ComId>> {
  readonly nome = 'UniaoImutavel';

  resolver<T extends ComId>(atual: readonly ComId[], recebido: readonly T[]): DecisaoUniao<T> {
    const vistos = new Set(atual.map((registro) => registro.id));
    const decisao: DecisaoUniao<T> = { novos: [], repetidos: [] };
    for (const registro of recebido) {
      (vistos.has(registro.id) ? decisao.repetidos : decisao.novos).push(registro);
      vistos.add(registro.id);
    }
    return decisao;
  }
}
