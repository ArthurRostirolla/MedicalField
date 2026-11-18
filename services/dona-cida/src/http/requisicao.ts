import { CABECALHOS, uuidSchema, type Claims } from '@medicalfield/contratos';
import type { Request } from 'express';
import type { z } from 'zod';
import type { ContextoComando } from '../aplicacao/comando.ts';
import { ErroAplicacao } from '../dominio/erros.ts';
import { hashDoCorpo } from '../dominio/hash.ts';

/** A requisicao do Express com o que a cadeia de middlewares vai pendurando nela. */
export type Requisicao = Request & { requestId?: string; profissional?: Claims };

/**
 * Padrao da rota casada (`/api/v1/pessoa/{id}`), nunca o caminho com ids.
 * Requisicao que nao casou com rota nenhuma recebe um nome fixo.
 */
export function padraoDaRota(requisicao: Request): string {
  const caminho: unknown = (requisicao.route as { path?: unknown } | undefined)?.path;
  return typeof caminho === 'string' ? caminho.replace(/:(\w+)/g, '{$1}') : 'rota-desconhecida';
}

/** Valida com um esquema do contrato; a falha vira 422 `VALIDACAO` com a lista de campos. */
export function validar<S extends z.ZodType>(esquema: S, valor: unknown, prefixo?: string): z.infer<S> {
  const lido = esquema.safeParse(valor);
  if (lido.success) return lido.data;

  const detalhes = lido.error.issues.flatMap((issue) => {
    const caminho = [...(prefixo ? [prefixo] : []), ...issue.path];
    return issue.code === 'unrecognized_keys'
      ? issue.keys.map((chave) => ({ campo: [...caminho, chave].join('.'), mensagem: 'campo desconhecido' }))
      : [{ campo: caminho.join('.') || 'corpo', mensagem: issue.message }];
  });
  throw new ErroAplicacao('VALIDACAO', 'Dados inválidos.', detalhes);
}

/** Id vindo do caminho da rota. */
export const idDaRota = (valor: string, nome: string): string => validar(uuidSchema, valor, nome);

/** Monta o comando a partir da requisicao ja autenticada. */
export function contextoDoComando(requisicao: Requisicao): ContextoComando {
  const profissional = requisicao.profissional;
  if (!profissional) throw new ErroAplicacao('NAO_AUTENTICADO', 'Token ausente, inválido ou expirado.');

  const chave = requisicao.get(CABECALHOS.chaveIdempotencia);
  // Dispositivo e so rastreabilidade: cabecalho malformado nao pode barrar um dado clinico.
  const dispositivo = uuidSchema.safeParse(requisicao.get(CABECALHOS.dispositivoId));

  return {
    autor: {
      profissionalId: profissional.sub,
      profissionalNome: profissional.nome,
      dispositivoId: dispositivo.success ? dispositivo.data : null,
    },
    chaveIdempotencia: chave === undefined ? null : validar(uuidSchema, chave, CABECALHOS.chaveIdempotencia),
    hashCorpo: hashDoCorpo(requisicao.body),
    metodo: requisicao.method,
    rota: padraoDaRota(requisicao),
    agora: new Date(),
  };
}
