// Jaiminho - PDF e e-mail (docs/contratos.md, secao 7).
import { z } from 'zod';
import { dataHoraSchema, texto, uuidSchema } from './comum.ts';

/** Corpo de `POST /documento/ficha-atendimento`. */
export const fichaAtendimentoEntradaSchema = z.strictObject({ atendimentoId: uuidSchema });
export type FichaAtendimentoEntrada = z.infer<typeof fichaAtendimentoEntradaSchema>;

export const documentoSchema = z.object({
  id: uuidSchema,
  atendimentoId: uuidSchema,
  codigoVerificacao: z.string(),
  hashConteudo: z.string(),
  geradoPor: z.string(),
  geradoEm: dataHoraSchema,
  tamanhoBytes: z.number().int(),
});
export type Documento = z.infer<typeof documentoSchema>;

/** `GET /documento/{id}`: metadados + conferencia do sha256 do PDF guardado. */
export const documentoComIntegridadeSchema = z.object({ ...documentoSchema.shape, integro: z.boolean() });
export type DocumentoComIntegridade = z.infer<typeof documentoComIntegridadeSchema>;

/** Query de `GET /documento`. */
export const documentosQuerySchema = z.object({ atendimentoId: uuidSchema });
export type DocumentosQuery = z.infer<typeof documentosQuerySchema>;

export const vinculoSchema = z.enum(['PACIENTE', 'FAMILIAR']);
export type Vinculo = z.infer<typeof vinculoSchema>;

export const envioEntradaSchema = z.strictObject({
  destinatarioNome: texto(200),
  destinatarioEmail: z.email('e-mail inválido').max(320),
  vinculo: vinculoSchema,
});
export type EnvioEntrada = z.infer<typeof envioEntradaSchema>;

export const statusEnvioSchema = z.enum(['PENDENTE', 'ENVIANDO', 'ENVIADO', 'FALHA_DEFINITIVA']);
export type StatusEnvio = z.infer<typeof statusEnvioSchema>;

export const envioSchema = z.object({
  id: uuidSchema,
  documentoId: uuidSchema,
  destinatarioNome: z.string(),
  destinatarioEmail: z.string(),
  vinculo: z.string(),
  status: statusEnvioSchema,
  tentativas: z.number().int(),
  proximaTentativaEm: dataHoraSchema.nullable(),
  ultimoErro: z.string().nullable(),
  solicitadoPor: z.string(),
  criadoEm: dataHoraSchema,
  enviadoEm: dataHoraSchema.nullable(),
});
export type Envio = z.infer<typeof envioSchema>;
