/**
 * Padrao Strategy (plano arquitetural, H.5): cada tipo de dado tem a sua regra de conflito.
 * Uma estrategia e uma funcao pura: recebe o que o servidor tem e o que chegou, devolve a decisao.
 * Quem grava e o caso de uso.
 */
export interface EstrategiaConflito<Atual, Recebido, Decisao> {
  readonly nome: string;
  resolver(atual: Atual, recebido: Recebido): Decisao;
}
