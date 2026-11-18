// Migracao 001. SQL em string porque o Metro nao importa .sql.
export default `
-- Banco local do app (plano arquitetural, F.2). Espelhos das tabelas centrais + estado_sync,
-- outbox (padrao Command), log_local e sync_estado. Um comando por ponto-e-virgula no fim da linha.

CREATE TABLE medicamento (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  principio_ativo TEXT,
  apresentacao TEXT,
  observacao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE pessoa (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  data_nascimento TEXT,
  sexo TEXT,
  cpf TEXT,
  cns TEXT,
  telefone TEXT,
  contato_emergencia_nome TEXT,
  contato_emergencia_telefone TEXT,
  contato_emergencia_email TEXT,
  nao_identificada INTEGER NOT NULL DEFAULT 0,
  descricao_identificacao TEXT,
  possivel_duplicata_de TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  estado_sync TEXT NOT NULL DEFAULT 'CONFIRMADO' CHECK (estado_sync IN ('LOCAL', 'CONFIRMADO'))
);
CREATE INDEX pessoa_nome ON pessoa (nome COLLATE NOCASE);

-- No banco local o prontuario e identificado pela pessoa: o servidor pode devolver outro id
-- (POST /prontuario para quem ja tem) e o id local e trocado sem quebrar referencia nenhuma.
CREATE TABLE prontuario (
  pessoa_id TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  tipo_sanguineo TEXT,
  observacoes TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  estado_sync TEXT NOT NULL DEFAULT 'CONFIRMADO' CHECK (estado_sync IN ('LOCAL', 'CONFIRMADO'))
);

CREATE TABLE prontuario_item (
  id TEXT PRIMARY KEY,
  pessoa_id TEXT NOT NULL,
  prontuario_id TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('ALERGIA', 'COMORBIDADE', 'MEDICACAO_CONTINUA')),
  descricao TEXT NOT NULL,
  registrado_por TEXT,
  registrado_em TEXT NOT NULL,
  inativado_em TEXT,
  estado_sync TEXT NOT NULL DEFAULT 'CONFIRMADO' CHECK (estado_sync IN ('LOCAL', 'CONFIRMADO'))
);
CREATE INDEX prontuario_item_pessoa ON prontuario_item (pessoa_id);

CREATE TABLE atendimento (
  id TEXT PRIMARY KEY,
  pessoa_id TEXT NOT NULL,
  profissional_id TEXT NOT NULL,
  profissional_nome TEXT NOT NULL,
  iniciado_em TEXT NOT NULL,
  local_descricao TEXT,
  latitude REAL,
  longitude REAL,
  queixa_principal TEXT,
  status TEXT NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'ENCERRADO')),
  encerrado_em TEXT,
  estado_sync TEXT NOT NULL DEFAULT 'LOCAL' CHECK (estado_sync IN ('LOCAL', 'CONFIRMADO'))
);
CREATE INDEX atendimento_pessoa ON atendimento (pessoa_id);

CREATE TABLE atendimento_evento (
  id TEXT PRIMARY KEY,
  atendimento_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  ocorrido_em TEXT NOT NULL,
  dados TEXT NOT NULL,
  retifica_evento_id TEXT,
  profissional_id TEXT NOT NULL,
  profissional_nome TEXT NOT NULL,
  estado_sync TEXT NOT NULL DEFAULT 'LOCAL' CHECK (estado_sync IN ('LOCAL', 'CONFIRMADO'))
);
CREATE INDEX atendimento_evento_atendimento ON atendimento_evento (atendimento_id);

-- Um comando serializavel por linha. op_id = Idempotency-Key. "ordem" e a ordem de envio.
-- entidade/entidade_id dizem a que linha local o comando se refere; depende_de ('tabela:id')
-- aponta a entidade que precisa existir no servidor antes (rejeitada => este fica retido).
CREATE TABLE outbox (
  ordem INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id TEXT NOT NULL UNIQUE,
  metodo TEXT NOT NULL,
  rota TEXT NOT NULL,
  corpo TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id TEXT NOT NULL,
  depende_de TEXT,
  descricao TEXT NOT NULL,
  profissional_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'ENVIANDO', 'CONFIRMADA', 'REJEITADA')),
  tentativas INTEGER NOT NULL DEFAULT 0,
  recuo INTEGER NOT NULL DEFAULT 0,
  proxima_tentativa_em TEXT,
  ultimo_erro TEXT,
  criado_em TEXT NOT NULL,
  confirmado_em TEXT
);
CREATE INDEX outbox_status ON outbox (status, ordem);
CREATE INDEX outbox_entidade ON outbox (entidade, entidade_id);

CREATE TABLE log_local (
  id TEXT PRIMARY KEY,
  ocorrido_em TEXT NOT NULL,
  acao TEXT NOT NULL,
  entidade TEXT,
  entidade_id TEXT,
  resultado TEXT NOT NULL CHECK (resultado IN ('SUCESSO', 'FALHA')),
  estava_online INTEGER NOT NULL,
  detalhe TEXT,
  profissional_id TEXT
);

-- cursor, dispositivo_id, ultima_sync, modo_simulado, sessao, servidor.
CREATE TABLE sync_estado (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`;
