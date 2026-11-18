import { Kysely, PostgresDialect, sql, type ColumnType, type Generated } from 'kysely';
import pg from 'pg';
import type { Log } from './log.ts';

// Tipos das tabelas: espelho de migrations/20261117000200_clinico.sql (a migracao e o contrato de dados).
type Instante = ColumnType<Date, string, string>;
type InstantePadrao = ColumnType<Date, string | undefined, string>;
type Json<T> = ColumnType<T, string, string>;
/** bigint chega como texto (nao cabe em number). */
type Seq = ColumnType<string, never, never>;

export type MedicamentoLinha = {
  id: Generated<string>;
  nome: string;
  principio_ativo: string | null;
  apresentacao: string | null;
  observacao: string | null;
  ativo: Generated<boolean>;
  seq: Seq;
};

export type PessoaLinha = {
  id: string;
  nome: string;
  /** `date` chega como texto YYYY-MM-DD (ver `criarBanco`). */
  data_nascimento: string | null;
  sexo: 'M' | 'F' | 'I' | null;
  cpf: string | null;
  cns: string | null;
  telefone: string | null;
  contato_emergencia_nome: string | null;
  contato_emergencia_telefone: string | null;
  email: string | null;
  contato_emergencia_email: string | null;
  nao_identificada: boolean;
  descricao_identificacao: string | null;
  possivel_duplicata_de: string | null;
  carimbos_campos: Json<Record<string, string>>;
  criado_por: string | null;
  seq: Seq;
  criado_em: InstantePadrao;
  atualizado_em: InstantePadrao;
};

export type ProntuarioLinha = {
  id: string;
  pessoa_id: string;
  tipo_sanguineo: string | null;
  observacoes: string | null;
  criado_por: string | null;
  seq: Seq;
  criado_em: InstantePadrao;
  atualizado_em: InstantePadrao;
};

export type ProntuarioItemLinha = {
  id: string;
  prontuario_id: string;
  tipo: 'ALERGIA' | 'COMORBIDADE' | 'MEDICACAO_CONTINUA';
  descricao: string;
  registrado_por: string | null;
  registrado_em: Instante;
  inativado_por: string | null;
  inativado_em: ColumnType<Date | null, string | null | undefined, string | null>;
  seq: Seq;
  atualizado_em: InstantePadrao;
};

export type AtendimentoLinha = {
  id: string;
  prontuario_id: string;
  pessoa_id: string;
  profissional_id: string;
  profissional_nome: string;
  dispositivo_id: string | null;
  iniciado_em: Instante;
  recebido_em: InstantePadrao;
  local_descricao: string | null;
  latitude: number | null;
  longitude: number | null;
  queixa_principal: string | null;
  status: Generated<'ABERTO' | 'ENCERRADO'>;
  encerrado_em: ColumnType<Date | null, string | null | undefined, string | null>;
};

export type EventoLinha = {
  id: string;
  atendimento_id: string;
  tipo: string;
  ocorrido_em: Instante;
  recebido_em: InstantePadrao;
  profissional_id: string;
  profissional_nome: string;
  dispositivo_id: string | null;
  medicamento_id: string | null;
  retifica_evento_id: string | null;
  dados: Json<Record<string, unknown>>;
};

type OperacaoSyncLinha = {
  op_id: string;
  profissional_id: string;
  dispositivo_id: string | null;
  metodo: string;
  rota: string;
  entidade_id: string | null;
  hash_corpo: string;
  status_http: number;
  resposta: Json<unknown>;
  recebido_em: InstantePadrao;
};

type AuditoriaClinicaLinha = {
  id: Generated<string>;
  entidade: string;
  entidade_id: string;
  acao: string;
  profissional_id: string;
  dispositivo_id: string | null;
  op_id: string | null;
  antes: ColumnType<unknown, string | null, never>;
  depois: ColumnType<unknown, string | null, never>;
  observacao: string | null;
  registrado_em: InstantePadrao;
};

type LogAcessoLinha = {
  data_hora: string;
  servico: string;
  ip_cliente: string;
  profissional_id: string | null;
  metodo: string;
  rota: string;
  status_code: number;
  tempo_ms: number;
  request_id: string;
};

export type Tabelas = {
  'clinico.medicamento': MedicamentoLinha;
  'clinico.pessoa': PessoaLinha;
  'clinico.prontuario': ProntuarioLinha;
  'clinico.prontuario_item': ProntuarioItemLinha;
  'clinico.atendimento': AtendimentoLinha;
  'clinico.atendimento_evento': EventoLinha;
  'clinico.operacao_sync': OperacaoSyncLinha;
  'clinico.auditoria_clinica': AuditoriaClinicaLinha;
  'auditoria.log_acesso': LogAcessoLinha;
};

export type Banco = Kysely<Tabelas>;
export const BANCO = Symbol('Banco');

const OID_DATE = 1082;

export function criarBanco(databaseUrl: string, log: Log): Banco {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5_000,
    types: {
      // `date` como texto: converter para Date deslocaria o dia conforme o fuso do processo.
      getTypeParser: ((oid: number, formato?: 'text' | 'binary') =>
        oid === OID_DATE ? (valor: string) => valor : pg.types.getTypeParser(oid, formato as 'text')) as never,
    },
  });
  // Conexao ociosa que cai nao pode derrubar o processo.
  pool.on('error', (erro) => log.warn('conexão ociosa com o banco caiu', { erro: erro.message }));
  return new Kysely<Tabelas>({ dialect: new PostgresDialect({ pool }) });
}

/** Usado por `/health/ready`. */
export async function bancoResponde(banco: Banco): Promise<boolean> {
  try {
    await sql`select 1`.execute(banco);
    return true;
  } catch {
    return false;
  }
}
