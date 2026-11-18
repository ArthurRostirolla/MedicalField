// Convencoes HTTP comuns aos tres servicos (docs/contratos.md, secao 2).
import { z } from 'zod';

/** UUID em minusculas (qualquer versao). */
export const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'deve ser um UUID em minúsculas');

/** Data e hora ISO-8601 em UTC, com `Z`. */
export const dataHoraSchema = z.iso.datetime({ error: 'deve ser data e hora ISO-8601 em UTC (com Z)' });

/** Data pura `YYYY-MM-DD`. */
export const dataSchema = z.iso.date({ error: 'deve ser uma data YYYY-MM-DD' });

/** Texto obrigatorio, sem ser so espacos. */
export const texto = (max = 500) => z.string().trim().min(1, 'obrigatório').max(max);

export const LIMITE_PADRAO = 50;
export const LIMITE_MAXIMO = 200;

/** Query string das listas paginadas: `?limite=50&cursor=<opaco>`. */
export const paginacaoQuerySchema = z.object({
  limite: z.coerce.number().int().min(1).max(LIMITE_MAXIMO).default(LIMITE_PADRAO),
  cursor: z.string().min(1).max(500).optional(),
});
export type PaginacaoQuery = z.infer<typeof paginacaoQuerySchema>;

/** Corpo de uma lista paginada. */
export const paginaSchema = <T extends z.ZodType>(item: T) =>
  z.object({ itens: z.array(item), proximoCursor: z.string().nullable() });
export type Pagina<T> = { itens: T[]; proximoCursor: string | null };

/** Booleano vindo de query string (`true` | `false`). */
export const booleanoQuerySchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((valor) => valor === 'true');

export const CABECALHOS = {
  requestId: 'X-Request-Id',
  dispositivoId: 'X-Dispositivo-Id',
  chaveIdempotencia: 'Idempotency-Key',
} as const;
