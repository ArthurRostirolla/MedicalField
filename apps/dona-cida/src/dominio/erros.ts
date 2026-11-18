import { STATUS_POR_CODIGO, type CodigoErro, type DetalheErro } from '@medicalfield/contratos';

/** Erro previsto, ja no vocabulario do contrato; o filtro HTTP so o serializa. */
export class ErroAplicacao extends Error {
  readonly codigo: CodigoErro;
  readonly detalhes?: DetalheErro[];

  constructor(codigo: CodigoErro, mensagem: string, detalhes?: DetalheErro[]) {
    super(mensagem);
    this.name = 'ErroAplicacao';
    this.codigo = codigo;
    this.detalhes = detalhes;
  }

  get status(): number {
    return STATUS_POR_CODIGO[this.codigo];
  }
}

export const naoEncontrado = (oQue: string): ErroAplicacao =>
  new ErroAplicacao('NAO_ENCONTRADO', `${oQue} não encontrado(a).`);

/** 422 apontando um campo. Tambem usado para referencia inexistente (regra de escrita 5). */
export const validacao = (campo: string, mensagem: string): ErroAplicacao =>
  new ErroAplicacao('VALIDACAO', 'Dados inválidos.', [{ campo, mensagem }]);
