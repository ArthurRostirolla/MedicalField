import type { EstrategiaConflito } from './estrategia.ts';

/**
 * Cadastros de apoio (medicamento): o cliente so le. O que ele mandar sobre o cadastro e ignorado;
 * vale a linha do servidor - ou `null` se o servidor nao a conhece (medicamento "fora do catalogo").
 */
export class ServidorVence implements EstrategiaConflito<unknown, unknown, unknown> {
  readonly nome = 'ServidorVence';

  resolver<T>(atual: T, _recebido: unknown): T {
    return atual;
  }
}
