// Corpo de erro unico e codigos (docs/contratos.md, secao 2).
import { z } from 'zod';

export const CODIGOS_ERRO = {
  CREDENCIAIS_INVALIDAS: 'CREDENCIAIS_INVALIDAS',
  NAO_AUTENTICADO: 'NAO_AUTENTICADO',
  SEM_PERMISSAO: 'SEM_PERMISSAO',
  NAO_ENCONTRADO: 'NAO_ENCONTRADO',
  VALIDACAO: 'VALIDACAO',
  CHAVE_IDEMPOTENCIA_CONFLITANTE: 'CHAVE_IDEMPOTENCIA_CONFLITANTE',
  MUITAS_TENTATIVAS: 'MUITAS_TENTATIVAS',
  ERRO_INTERNO: 'ERRO_INTERNO',
  SERVICO_INDISPONIVEL: 'SERVICO_INDISPONIVEL',
} as const;
export type CodigoErro = keyof typeof CODIGOS_ERRO;

/** Status HTTP de cada codigo. */
export const STATUS_POR_CODIGO: Record<CodigoErro, number> = {
  CREDENCIAIS_INVALIDAS: 401,
  NAO_AUTENTICADO: 401,
  SEM_PERMISSAO: 403,
  NAO_ENCONTRADO: 404,
  VALIDACAO: 422,
  CHAVE_IDEMPOTENCIA_CONFLITANTE: 422,
  MUITAS_TENTATIVAS: 429,
  ERRO_INTERNO: 500,
  SERVICO_INDISPONIVEL: 503,
};

export const detalheErroSchema = z.object({ campo: z.string(), mensagem: z.string() });
export type DetalheErro = z.infer<typeof detalheErroSchema>;

export const erroSchema = z.object({
  codigo: z.enum(Object.keys(CODIGOS_ERRO) as [CodigoErro, ...CodigoErro[]]),
  mensagem: z.string(),
  detalhes: z.array(detalheErroSchema).optional(),
  requestId: z.string(),
});
export type ErroResposta = z.infer<typeof erroSchema>;

/**
 * Regra do outbox: 4xx = rejeicao definitiva; rede/5xx/timeout = transitorio.
 * 401 e tratado a parte pelo cliente (renova o token e repete).
 *
 * @param status status HTTP recebido, ou `null` quando nao houve resposta (rede/timeout)
 */
export function ehFalhaTransitoria(status: number | null): boolean {
  return status === null || status >= 500;
}
