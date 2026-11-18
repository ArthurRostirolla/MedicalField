// Gera openapi.yaml a partir dos esquemas zod de @medicalfield/contratos (a fonte e docs/contratos.md).
// Uso: npm run openapi -w @medicalfield/dona-cida
import { writeFileSync } from 'node:fs';
import * as c from '@medicalfield/contratos';
import { stringify } from 'yaml';
import { z } from 'zod';

const esquemas = {
  Erro: c.erroSchema,
  Medicamento: c.medicamentoSchema,
  Pessoa: c.pessoaSchema,
  PessoaEntrada: c.pessoaEntradaSchema,
  PessoaAlteracao: c.pessoaAlteracaoSchema,
  ProntuarioItem: c.prontuarioItemSchema,
  Prontuario: c.prontuarioSchema,
  ProntuarioComPessoa: c.prontuarioComPessoaSchema,
  ProntuarioEntrada: c.prontuarioEntradaSchema,
  ProntuarioItemEntrada: c.prontuarioItemEntradaSchema,
  InativacaoEntrada: c.inativacaoEntradaSchema,
  EventoEntrada: c.eventoEntradaSchema,
  Evento: c.eventoSchema,
  Atendimento: c.atendimentoSchema,
  AtendimentoEntrada: c.atendimentoEntradaSchema,
  Ficha: c.fichaSchema,
  Alteracoes: c.alteracoesSchema,
  PaginaMedicamento: c.paginaSchema(c.medicamentoSchema),
  PaginaPessoa: c.paginaSchema(c.pessoaSchema),
  PaginaProntuario: c.paginaSchema(c.prontuarioComPessoaSchema),
  PaginaAtendimento: c.paginaSchema(c.atendimentoListadoSchema),
} satisfies Record<string, z.ZodType>;
type Nome = keyof typeof esquemas;

type Rota = {
  metodo: 'get' | 'post' | 'patch';
  caminho: string;
  resumo: string;
  query?: z.ZodType;
  corpo?: Nome;
  resposta: Nome;
  /** Escrita: aceita Idempotency-Key e responde 201 (criacao) ou 200 (repeticao / ja existia). */
  escrita?: 'cria' | 'altera';
  naoEncontrado?: boolean;
};

const rotas: Rota[] = [
  { metodo: 'get', caminho: '/medicamento', resumo: 'Lista o catálogo de medicamentos', query: c.medicamentosQuerySchema, resposta: 'PaginaMedicamento' },
  { metodo: 'get', caminho: '/prontuario', resumo: 'Lista todos os prontuários, com a pessoa resumida', query: c.paginacaoQuerySchema, resposta: 'PaginaProntuario' },
  { metodo: 'get', caminho: '/prontuario/{pessoaId}', resumo: 'Prontuário de uma pessoa, com itens', resposta: 'Prontuario', naoEncontrado: true },
  { metodo: 'post', caminho: '/prontuario', resumo: 'Cadastra o prontuário; se a pessoa já tem, devolve o existente com os itens unidos', corpo: 'ProntuarioEntrada', resposta: 'Prontuario', escrita: 'cria' },
  { metodo: 'post', caminho: '/prontuario-item', resumo: 'Acrescenta alergia, comorbidade ou medicação contínua', corpo: 'ProntuarioItemEntrada', resposta: 'ProntuarioItem', escrita: 'cria' },
  { metodo: 'post', caminho: '/prontuario-item/{id}/inativacao', resumo: 'Inativa um item do prontuário', corpo: 'InativacaoEntrada', resposta: 'ProntuarioItem', escrita: 'altera', naoEncontrado: true },
  { metodo: 'post', caminho: '/pessoa', resumo: 'Cadastra pessoa; duplicata provável é aceita e sinalizada', corpo: 'PessoaEntrada', resposta: 'Pessoa', escrita: 'cria' },
  { metodo: 'get', caminho: '/pessoa', resumo: 'Lista ou busca pessoas (nome ou CPF)', query: c.pessoasQuerySchema, resposta: 'PaginaPessoa' },
  { metodo: 'get', caminho: '/pessoa/{id}', resumo: 'Uma pessoa', resposta: 'Pessoa', naoEncontrado: true },
  { metodo: 'patch', caminho: '/pessoa/{id}', resumo: 'Altera o cadastro; por campo, vence a edição mais recente', corpo: 'PessoaAlteracao', resposta: 'Pessoa', escrita: 'altera', naoEncontrado: true },
  { metodo: 'get', caminho: '/atendimento/{pessoaId}', resumo: 'Atendimentos de uma pessoa, mais recentes primeiro', query: c.paginacaoQuerySchema, resposta: 'PaginaAtendimento' },
  { metodo: 'get', caminho: '/atendimento', resumo: 'Todos os atendimentos, mais recentes primeiro', query: c.paginacaoQuerySchema, resposta: 'PaginaAtendimento' },
  { metodo: 'post', caminho: '/atendimento', resumo: 'Registra atendimento (pode trazer eventos iniciais)', corpo: 'AtendimentoEntrada', resposta: 'Atendimento', escrita: 'cria' },
  { metodo: 'post', caminho: '/atendimento-evento', resumo: 'Acrescenta evento à linha do tempo', corpo: 'EventoEntrada', resposta: 'Evento', escrita: 'cria' },
  { metodo: 'get', caminho: '/ficha/{atendimentoId}', resumo: 'Atendimento completo + resumo (passagem de caso)', resposta: 'Ficha', naoEncontrado: true },
  { metodo: 'get', caminho: '/sync/alteracoes', resumo: 'Descida por cursor: o que mudou desde `desde`', query: c.alteracoesQuerySchema, resposta: 'Alteracoes' },
];

const jsonSchema = (esquema: z.ZodType, io: 'input' | 'output' = 'output'): Record<string, unknown> => {
  const { $schema: _, ...resto } = z.toJSONSchema(esquema, { io, unrepresentable: 'any' }) as Record<string, unknown>;
  return resto;
};
const ref = (nome: Nome) => ({ $ref: `#/components/schemas/${nome}` });
const json = (nome: Nome) => ({ 'application/json': { schema: ref(nome) } });
const erro = (descricao: string) => ({ description: descricao, content: json('Erro') });

function operacao(rota: Rota): Record<string, unknown> {
  const noCaminho = [...rota.caminho.matchAll(/\{(\w+)\}/g)].map(([, nome]) => ({
    name: nome,
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  }));
  const propriedades = rota.query
    ? ((jsonSchema(rota.query, 'input').properties ?? {}) as Record<string, unknown>)
    : {};
  const naQuery = Object.entries(propriedades).map(([nome, schema]) => ({ name: nome, in: 'query', required: false, schema }));
  const cabecalhos = rota.escrita
    ? [{ $ref: '#/components/parameters/IdempotencyKey' }, { $ref: '#/components/parameters/DispositivoId' }]
    : [];

  return {
    summary: rota.resumo,
    tags: [rota.caminho.split('/')[1]],
    parameters: [...noCaminho, ...naQuery, ...cabecalhos, { $ref: '#/components/parameters/RequestId' }],
    ...(rota.corpo ? { requestBody: { required: true, content: json(rota.corpo) } } : {}),
    responses: {
      '200': {
        description: rota.escrita === 'cria' ? 'Repetição do comando, ou o registro já existia' : 'OK',
        content: json(rota.resposta),
      },
      ...(rota.escrita === 'cria' ? { '201': { description: 'Criado', content: json(rota.resposta) } } : {}),
      '401': erro('NAO_AUTENTICADO — token ausente, inválido ou expirado'),
      ...(rota.naoEncontrado ? { '404': erro('NAO_ENCONTRADO') } : {}),
      ...(rota.corpo || rota.query || noCaminho.length
        ? { '422': erro(rota.escrita ? 'VALIDACAO (corpo inválido ou referência inexistente) ou CHAVE_IDEMPOTENCIA_CONFLITANTE' : 'VALIDACAO') }
        : {}),
      '500': erro('ERRO_INTERNO'),
      '503': erro('SERVICO_INDISPONIVEL — banco ou serviço de identidade fora'),
    },
  };
}

const caminhos: Record<string, Record<string, unknown>> = {};
for (const rota of rotas) (caminhos[rota.caminho] ??= {})[rota.metodo] = operacao(rota);

const documento = {
  openapi: '3.1.0',
  info: {
    title: 'MedicalField — DonaCida (núcleo clínico e sincronização)',
    version: '0.1.0',
    description:
      'Gerado por scripts/gerar-openapi.ts a partir de @medicalfield/contratos; a fonte de verdade é docs/contratos.md. ' +
      'DADOS DEMONSTRATIVOS — SEM VALIDADE CLÍNICA. ' +
      'Escritas: o id da entidade vem do cliente; com Idempotency-Key, a repetição devolve 200 com a resposta original. ' +
      '4xx = rejeição definitiva; rede/5xx = transitório.',
  },
  servers: [{ url: '/api/v1' }],
  security: [{ bearer: [] }],
  paths: caminhos,
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT (EdDSA, emitido pelo MikeBaguncinha)' } },
    parameters: {
      IdempotencyKey: { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string', format: 'uuid' }, description: 'UUID da operação; o app sempre envia em escritas.' },
      DispositivoId: { name: 'X-Dispositivo-Id', in: 'header', required: false, schema: { type: 'string', format: 'uuid' } },
      RequestId: { name: 'X-Request-Id', in: 'header', required: false, schema: { type: 'string' }, description: 'Gerado se ausente; devolvido na resposta.' },
    },
    schemas: Object.fromEntries(
      Object.entries(esquemas).map(([nome, esquema]) => [nome, jsonSchema(esquema, nome.endsWith('Entrada') || nome === 'PessoaAlteracao' ? 'input' : 'output')]),
    ),
  },
};

writeFileSync(new URL('../openapi.yaml', import.meta.url), stringify(documento, { lineWidth: 120 }));
console.log(`openapi.yaml: ${rotas.length} rotas, ${Object.keys(esquemas).length} esquemas`);
