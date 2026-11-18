// DonaCida - nucleo clinico e sincronizacao (docs/contratos.md, secao 6).
// As faixas numericas sao apenas limites de digitacao plausivel: o sistema nao interpreta valor clinico.
import { z } from 'zod';
import {
  booleanoQuerySchema,
  dataHoraSchema,
  dataSchema,
  paginacaoQuerySchema,
  texto,
  textoLivre,
  uuidSchema,
} from './comum.ts';

// ---------- Medicamento ----------

export const medicamentoSchema = z.object({
  id: uuidSchema,
  nome: z.string(),
  principioAtivo: z.string().nullable(),
  apresentacao: z.string().nullable(),
  observacao: z.string().nullable(),
  ativo: z.boolean(),
});
export type Medicamento = z.infer<typeof medicamentoSchema>;

/** Query de `GET /medicamento`. */
export const medicamentosQuerySchema = paginacaoQuerySchema.extend({ incluirInativos: booleanoQuerySchema });
export type MedicamentosQuery = z.infer<typeof medicamentosQuerySchema>;

// ---------- Pessoa ----------

export const sexoSchema = z.enum(['M', 'F', 'I']);
export type Sexo = z.infer<typeof sexoSchema>;

/** Campos que o profissional pode editar; cada um tem carimbo proprio (estrategia CampoMaisRecente). */
const camposEditaveisPessoa = {
  nome: texto(200),
  dataNascimento: dataSchema.nullable(),
  sexo: sexoSchema.nullable(),
  /** Somente os 11 digitos; o digito verificador nao e conferido (cadastro nunca bloqueia atendimento). */
  cpf: z.string().regex(/^\d{11}$/, 'deve ter 11 dígitos, sem pontuação').nullable(),
  cns: z.string().regex(/^\d{15}$/, 'deve ter 15 dígitos, sem pontuação').nullable(),
  telefone: texto(30).nullable(),
  /** E-mail do proprio paciente: com ele, a ficha vai sozinha ao encerrar o atendimento. */
  email: z.email('e-mail inválido').max(320).nullable(),
  contatoEmergenciaNome: texto(200).nullable(),
  contatoEmergenciaTelefone: texto(30).nullable(),
  contatoEmergenciaEmail: z.email('e-mail inválido').max(320).nullable(),
  naoIdentificada: z.boolean(),
  descricaoIdentificacao: texto(1000).nullable(),
};
export const camposEditaveisPessoaSchema = z.strictObject(camposEditaveisPessoa);
export type CamposEditaveisPessoa = z.infer<typeof camposEditaveisPessoaSchema>;
export type CampoEditavelPessoa = keyof CamposEditaveisPessoa;
export const CAMPOS_EDITAVEIS_PESSOA = Object.keys(camposEditaveisPessoa) as CampoEditavelPessoa[];

export const pessoaSchema = z.object({
  id: uuidSchema,
  nome: z.string(),
  dataNascimento: dataSchema.nullable(),
  sexo: sexoSchema.nullable(),
  cpf: z.string().nullable(),
  cns: z.string().nullable(),
  telefone: z.string().nullable(),
  email: z.string().nullable(),
  contatoEmergenciaNome: z.string().nullable(),
  contatoEmergenciaTelefone: z.string().nullable(),
  contatoEmergenciaEmail: z.string().nullable(),
  naoIdentificada: z.boolean(),
  descricaoIdentificacao: z.string().nullable(),
  possivelDuplicataDe: uuidSchema.nullable(),
  criadoEm: dataHoraSchema,
  atualizadoEm: dataHoraSchema,
});
export type Pessoa = z.infer<typeof pessoaSchema>;

/** `POST /pessoa`: `id` gerado no cliente; `editadoEm` = hora do dispositivo. */
export const pessoaEntradaSchema = z.strictObject({
  ...camposEditaveisPessoaSchema.partial().shape,
  id: uuidSchema,
  nome: camposEditaveisPessoa.nome,
  editadoEm: dataHoraSchema,
});
export type PessoaEntrada = z.infer<typeof pessoaEntradaSchema>;

/** `PATCH /pessoa/{id}`. */
export const pessoaAlteracaoSchema = z.strictObject({
  campos: camposEditaveisPessoaSchema
    .partial()
    .refine((campos) => Object.keys(campos).length > 0, 'informe ao menos um campo'),
  editadoEm: dataHoraSchema,
});
export type PessoaAlteracao = z.infer<typeof pessoaAlteracaoSchema>;

/** Query de `GET /pessoa`: `busca` = parte do nome ou CPF. */
export const pessoasQuerySchema = paginacaoQuerySchema.extend({
  busca: textoLivre().trim().max(200).optional(),
  somenteDuplicatas: booleanoQuerySchema,
});
export type PessoasQuery = z.infer<typeof pessoasQuerySchema>;

/** Pessoa resumida que acompanha cada prontuario em `GET /prontuario`. */
export const pessoaResumidaSchema = pessoaSchema.pick({
  id: true,
  nome: true,
  dataNascimento: true,
  cpf: true,
  naoIdentificada: true,
});
export type PessoaResumida = z.infer<typeof pessoaResumidaSchema>;

// ---------- Prontuario ----------

export const tipoItemSchema = z.enum(['ALERGIA', 'COMORBIDADE', 'MEDICACAO_CONTINUA']);
export type TipoItem = z.infer<typeof tipoItemSchema>;

export const prontuarioItemSchema = z.object({
  id: uuidSchema,
  prontuarioId: uuidSchema,
  pessoaId: uuidSchema,
  tipo: tipoItemSchema,
  descricao: z.string(),
  registradoPor: uuidSchema.nullable(),
  registradoEm: dataHoraSchema,
  inativadoEm: dataHoraSchema.nullable(),
});
export type ProntuarioItem = z.infer<typeof prontuarioItemSchema>;

export const prontuarioSchema = z.object({
  id: uuidSchema,
  pessoaId: uuidSchema,
  tipoSanguineo: z.string().nullable(),
  observacoes: z.string().nullable(),
  itens: z.array(prontuarioItemSchema),
  criadoEm: dataHoraSchema,
  atualizadoEm: dataHoraSchema,
});
export type Prontuario = z.infer<typeof prontuarioSchema>;

/** Item de `GET /prontuario`. */
export const prontuarioComPessoaSchema = prontuarioSchema.extend({ pessoa: pessoaResumidaSchema });
export type ProntuarioComPessoa = z.infer<typeof prontuarioComPessoaSchema>;

const itemNovo = {
  id: uuidSchema,
  tipo: tipoItemSchema,
  descricao: texto(500),
  registradoEm: dataHoraSchema,
};

/** `POST /prontuario`. Pessoa que ja tem prontuario: 200 com o existente e os itens unidos. */
export const prontuarioEntradaSchema = z.strictObject({
  id: uuidSchema,
  pessoaId: uuidSchema,
  tipoSanguineo: texto(10).optional(),
  observacoes: texto(4000).optional(),
  itens: z.array(z.strictObject(itemNovo)).max(200).optional(),
});
export type ProntuarioEntrada = z.infer<typeof prontuarioEntradaSchema>;

/** `POST /prontuario-item`. */
export const prontuarioItemEntradaSchema = z.strictObject({ ...itemNovo, pessoaId: uuidSchema });
export type ProntuarioItemEntrada = z.infer<typeof prontuarioItemEntradaSchema>;

/** `POST /prontuario-item/{id}/inativacao`. */
export const inativacaoEntradaSchema = z.strictObject({ inativadoEm: dataHoraSchema });
export type InativacaoEntrada = z.infer<typeof inativacaoEntradaSchema>;

// ---------- Eventos do atendimento ----------

export const TIPOS_EVENTO = [
  'SINAIS_VITAIS',
  'GLASGOW',
  'TRIAGEM',
  'MEDICACAO',
  'PROCEDIMENTO',
  'OBSERVACAO',
  'RETIFICACAO',
  'ENCERRAMENTO',
] as const;
export const tipoEventoSchema = z.enum(TIPOS_EVENTO);
export type TipoEvento = z.infer<typeof tipoEventoSchema>;

const inteiro = (min: number, max: number) => z.number().int().min(min).max(max);

export const dadosSinaisVitaisSchema = z
  .strictObject({
    pressaoSistolica: inteiro(0, 300).optional(),
    pressaoDiastolica: inteiro(0, 200).optional(),
    frequenciaCardiaca: inteiro(0, 300).optional(),
    frequenciaRespiratoria: inteiro(0, 100).optional(),
    saturacao: inteiro(0, 100).optional(),
    temperatura: z.number().min(20).max(45).optional(),
    glicemia: inteiro(0, 1000).optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), 'informe ao menos um sinal vital');
export type DadosSinaisVitais = z.infer<typeof dadosSinaisVitaisSchema>;

export const dadosGlasgowSchema = z
  .strictObject({ ocular: inteiro(1, 4), verbal: inteiro(1, 5), motora: inteiro(1, 6), total: inteiro(3, 15) })
  .refine((dados) => dados.total === dados.ocular + dados.verbal + dados.motora, {
    path: ['total'],
    message: 'deve ser a soma de ocular, verbal e motora',
  });
export type DadosGlasgow = z.infer<typeof dadosGlasgowSchema>;

export const CLASSIFICACOES_TRIAGEM = {
  MANCHESTER: ['VERMELHO', 'LARANJA', 'AMARELO', 'VERDE', 'AZUL'],
  START: ['VERMELHO', 'AMARELO', 'VERDE', 'PRETO'],
} as const;
export const dadosTriagemSchema = z.discriminatedUnion(
  'protocolo',
  [
    z.strictObject({ protocolo: z.literal('MANCHESTER'), classificacao: z.enum(CLASSIFICACOES_TRIAGEM.MANCHESTER) }),
    z.strictObject({ protocolo: z.literal('START'), classificacao: z.enum(CLASSIFICACOES_TRIAGEM.START) }),
  ],
  'protocolo deve ser MANCHESTER ou START',
);
export type DadosTriagem = z.infer<typeof dadosTriagemSchema>;

export const dadosMedicacaoSchema = z.strictObject({
  /** `null` = medicamento fora do catalogo (texto livre). */
  medicamentoId: uuidSchema.nullable(),
  nome: texto(200),
  dose: texto(50),
  unidade: texto(50),
  via: texto(50),
});
export type DadosMedicacao = z.infer<typeof dadosMedicacaoSchema>;

export const dadosProcedimentoSchema = z.strictObject({ descricao: texto(2000) });
export type DadosProcedimento = z.infer<typeof dadosProcedimentoSchema>;

export const dadosObservacaoSchema = z.strictObject({ texto: texto(4000) });
export type DadosObservacao = z.infer<typeof dadosObservacaoSchema>;

export const dadosRetificacaoSchema = z.strictObject({
  motivo: texto(1000),
  /**
   * Campos corrigidos do evento original (o resumo os aplica sobre os dados dele e eles vao ao PDF):
   * so valores simples, como os proprios `dados` dos eventos - nada de objeto aninhado.
   */
  dadosCorrigidos: z
    .record(texto(50), z.union([texto(4000), z.number(), z.boolean(), z.null()]))
    .refine((campos) => Object.keys(campos).length <= 20, 'no máximo 20 campos')
    .optional(),
});
export type DadosRetificacao = z.infer<typeof dadosRetificacaoSchema>;

export const dadosEncerramentoSchema = z.strictObject({ desfecho: texto(1000), destino: texto(500).optional() });
export type DadosEncerramento = z.infer<typeof dadosEncerramentoSchema>;

/**
 * Uniao discriminada por `tipo`, com `dados` estrito para cada tipo.
 * `retificaEventoId` so existe (e e obrigatorio) em RETIFICACAO.
 */
function variantesEvento<E extends z.ZodRawShape>(extra: E) {
  const base = { id: uuidSchema, ocorridoEm: dataHoraSchema, ...extra };
  return z.discriminatedUnion(
    'tipo',
    [
      z.strictObject({ ...base, tipo: z.literal('SINAIS_VITAIS'), dados: dadosSinaisVitaisSchema }),
      z.strictObject({ ...base, tipo: z.literal('GLASGOW'), dados: dadosGlasgowSchema }),
      z.strictObject({ ...base, tipo: z.literal('TRIAGEM'), dados: dadosTriagemSchema }),
      z.strictObject({ ...base, tipo: z.literal('MEDICACAO'), dados: dadosMedicacaoSchema }),
      z.strictObject({ ...base, tipo: z.literal('PROCEDIMENTO'), dados: dadosProcedimentoSchema }),
      z.strictObject({ ...base, tipo: z.literal('OBSERVACAO'), dados: dadosObservacaoSchema }),
      z.strictObject({
        ...base,
        tipo: z.literal('RETIFICACAO'),
        dados: dadosRetificacaoSchema,
        retificaEventoId: uuidSchema,
      }),
      z.strictObject({ ...base, tipo: z.literal('ENCERRAMENTO'), dados: dadosEncerramentoSchema }),
    ],
    `tipo deve ser um de: ${TIPOS_EVENTO.join(', ')}`,
  );
}

/** `POST /atendimento-evento`. */
export const eventoEntradaSchema = variantesEvento({ atendimentoId: uuidSchema });
export type EventoEntrada = z.infer<typeof eventoEntradaSchema>;

/** Evento inicial enviado dentro de `POST /atendimento` (sem `atendimentoId`). */
export const eventoInicialSchema = variantesEvento({});
export type EventoInicial = z.infer<typeof eventoInicialSchema>;

export const eventoSchema = variantesEvento({
  atendimentoId: uuidSchema,
  profissionalId: uuidSchema,
  profissionalNome: z.string(),
  dispositivoId: uuidSchema.nullable(),
  recebidoEm: dataHoraSchema,
});
export type Evento = z.infer<typeof eventoSchema>;

// ---------- Atendimento ----------

export const statusAtendimentoSchema = z.enum(['ABERTO', 'ENCERRADO']);
export type StatusAtendimento = z.infer<typeof statusAtendimentoSchema>;

export const atendimentoSchema = z.object({
  id: uuidSchema,
  pessoaId: uuidSchema,
  prontuarioId: uuidSchema,
  profissionalId: uuidSchema,
  profissionalNome: z.string(),
  dispositivoId: uuidSchema.nullable(),
  iniciadoEm: dataHoraSchema,
  recebidoEm: dataHoraSchema,
  localDescricao: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  queixaPrincipal: z.string().nullable(),
  status: statusAtendimentoSchema,
  encerradoEm: dataHoraSchema.nullable(),
});
export type Atendimento = z.infer<typeof atendimentoSchema>;

/** Item de `GET /atendimento` e `GET /atendimento/{pessoaId}`. */
export const atendimentoListadoSchema = atendimentoSchema.extend({ pessoaNome: z.string() });
export type AtendimentoListado = z.infer<typeof atendimentoListadoSchema>;

/** `POST /atendimento`: o servidor resolve (ou cria) o prontuario da pessoa. */
export const atendimentoEntradaSchema = z.strictObject({
  id: uuidSchema,
  pessoaId: uuidSchema,
  iniciadoEm: dataHoraSchema,
  localDescricao: texto(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  queixaPrincipal: texto(2000).optional(),
  eventos: z.array(eventoInicialSchema).max(500).optional(),
});
export type AtendimentoEntrada = z.infer<typeof atendimentoEntradaSchema>;

// ---------- Ficha e resumo ----------

const momentoComDados = z.object({ ocorridoEm: dataHoraSchema, dados: z.record(z.string(), z.unknown()) });

/** Passagem de caso; calculada por `calcularResumo` em `@medicalfield/dominio`. */
export const resumoSchema = z.object({
  ultimosSinaisVitais: momentoComDados.nullable(),
  glasgowMaisRecente: momentoComDados.nullable(),
  triagem: momentoComDados.nullable(),
  medicacoes: z.array(
    z.object({ ocorridoEm: dataHoraSchema, nome: z.string(), dose: z.string(), unidade: z.string(), via: z.string() }),
  ),
  procedimentos: z.array(z.object({ ocorridoEm: dataHoraSchema, descricao: z.string() })),
  alergias: z.array(z.string()),
  comorbidades: z.array(z.string()),
  medicacoesContinuas: z.array(z.string()),
  encerramento: z
    .object({ ocorridoEm: dataHoraSchema, desfecho: z.string(), destino: z.string().nullable() })
    .nullable(),
});
export type Resumo = z.infer<typeof resumoSchema>;

/** `GET /ficha/{atendimentoId}`; `eventos` ordenados por `ocorridoEm`. */
export const fichaSchema = z.object({
  atendimento: atendimentoSchema,
  pessoa: pessoaSchema,
  prontuario: prontuarioSchema,
  eventos: z.array(eventoSchema),
  resumo: resumoSchema,
});
export type Ficha = z.infer<typeof fichaSchema>;

// ---------- Sincronizacao ----------

export const LIMITE_SYNC_PADRAO = 500;
export const LIMITE_SYNC_MAXIMO = 1000;

/** Query de `GET /sync/alteracoes` (`desde=0` na primeira vez). */
export const alteracoesQuerySchema = z.object({
  desde: z.string().regex(/^\d{1,18}$/, 'cursor inválido').default('0'),
  limite: z.coerce.number().int().min(1).max(LIMITE_SYNC_MAXIMO).default(LIMITE_SYNC_PADRAO),
});
export type AlteracoesQuery = z.infer<typeof alteracoesQuerySchema>;

export const alteracoesSchema = z.object({
  medicamentos: z.array(medicamentoSchema),
  pessoas: z.array(pessoaSchema),
  prontuarios: z.array(prontuarioSchema.omit({ itens: true })),
  prontuarioItens: z.array(prontuarioItemSchema),
  proximoCursor: z.string(),
  temMais: z.boolean(),
});
export type Alteracoes = z.infer<typeof alteracoesSchema>;
