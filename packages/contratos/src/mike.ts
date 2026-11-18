// MikeBaguncinha - identidade e auditoria (docs/contratos.md, secoes 3 e 5).
import { z } from 'zod';
import { dataHoraSchema, texto, uuidSchema } from './comum.ts';

export const tipoRegistroSchema = z.enum(['CRM', 'COREN', 'SOCORRISTA']);
export type TipoRegistro = z.infer<typeof tipoRegistroSchema>;

export const papelSchema = z.enum(['ADMIN', 'PROFISSIONAL']);
export type Papel = z.infer<typeof papelSchema>;

/** Claims do access token (EdDSA). */
export const claimsSchema = z.object({
  iss: z.literal('medicalfield'),
  sub: uuidSchema,
  nome: z.string().min(1),
  tipoRegistro: z.string(),
  registro: z.string(),
  uf: z.string(),
  papel: papelSchema,
  iat: z.number(),
  exp: z.number(),
  jti: z.string(),
});
export type Claims = z.infer<typeof claimsSchema>;

export const loginEntradaSchema = z.strictObject({
  tipoRegistro: tipoRegistroSchema,
  registro: texto(40),
  uf: z.string().max(2).optional(),
  senha: z.string().min(1, 'obrigatório').max(200),
});
export type LoginEntrada = z.infer<typeof loginEntradaSchema>;

export const profissionalSchema = z.object({
  id: uuidSchema,
  nome: z.string(),
  tipoRegistro: z.string(),
  registro: z.string(),
  uf: z.string(),
  papel: papelSchema,
});
export type Profissional = z.infer<typeof profissionalSchema>;

export const sessaoSchema = z.object({
  accessToken: z.string(),
  /** Validade do access token, em segundos. */
  expiraEm: z.number(),
  refreshToken: z.string(),
  profissional: profissionalSchema,
});
export type Sessao = z.infer<typeof sessaoSchema>;

/** Corpo de `POST /auth/refresh` e `POST /auth/logout` (o cookie `mf_refresh` tambem vale). */
export const refreshEntradaSchema = z.strictObject({ refreshToken: z.string().min(1).optional() });
export type RefreshEntrada = z.infer<typeof refreshEntradaSchema>;

export const resultadoLogSchema = z.enum(['SUCESSO', 'FALHA']);

export const logClienteSchema = z.strictObject({
  id: uuidSchema,
  ocorridoEm: dataHoraSchema,
  acao: texto(100),
  entidade: z.string().max(100).optional(),
  entidadeId: z.string().max(100).optional(),
  resultado: resultadoLogSchema,
  estavaOnline: z.boolean(),
  detalhe: z.record(z.string(), z.unknown()).optional(),
});
export type LogCliente = z.infer<typeof logClienteSchema>;

export const MAXIMO_LOGS_POR_CHAMADA = 500;
export const logsEntradaSchema = z.strictObject({
  logs: z.array(logClienteSchema).max(MAXIMO_LOGS_POR_CHAMADA),
});
export type LogsEntrada = z.infer<typeof logsEntradaSchema>;

export const logsSaidaSchema = z.object({ aceitos: z.number().int(), duplicados: z.number().int() });
export type LogsSaida = z.infer<typeof logsSaidaSchema>;

export const servicoSchema = z.enum(['mike-baguncinha', 'dona-cida', 'jaiminho']);
export type Servico = z.infer<typeof servicoSchema>;

export const logAcessoSchema = z.object({
  id: z.string(),
  dataHora: dataHoraSchema,
  servico: z.string(),
  ipCliente: z.string(),
  profissionalId: uuidSchema.nullable(),
  metodo: z.string(),
  rota: z.string(),
  statusCode: z.number().int(),
  tempoMs: z.number(),
  requestId: z.string(),
});
export type LogAcesso = z.infer<typeof logAcessoSchema>;

export const logClienteSaidaSchema = z.object({
  ...logClienteSchema.shape,
  profissionalId: uuidSchema,
  dispositivoId: uuidSchema.nullable(),
  recebidoEm: dataHoraSchema,
});
export type LogClienteSaida = z.infer<typeof logClienteSaidaSchema>;

const filtroPeriodo = {
  de: dataHoraSchema.optional(),
  ate: dataHoraSchema.optional(),
  profissionalId: uuidSchema.optional(),
  limite: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
};
/** Query de `GET /auditoria/acesso` (mais recentes primeiro). */
export const auditoriaAcessoQuerySchema = z.object({ ...filtroPeriodo, servico: servicoSchema.optional() });
export type AuditoriaAcessoQuery = z.infer<typeof auditoriaAcessoQuerySchema>;
/** Query de `GET /auditoria/cliente`. */
export const auditoriaClienteQuerySchema = z.object(filtroPeriodo);
export type AuditoriaClienteQuery = z.infer<typeof auditoriaClienteQuerySchema>;
