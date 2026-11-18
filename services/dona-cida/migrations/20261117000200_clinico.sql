-- migrate:up

-- Cursor global de sincronizacao: toda linha que desce ao cliente recebe um seq novo
-- a cada INSERT/UPDATE, inclusive quando inserida manualmente pelo psql (passo 9 do roteiro).
CREATE SEQUENCE clinico.seq_alteracao;

CREATE FUNCTION clinico.marcar_alteracao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- ponytail: lock global serializa as escritas sincronizadas para que a ordem do seq
  -- seja a ordem de commit (sem isso o cursor pode pular uma transacao lenta).
  -- Trocar por xid8 + pg_snapshot_xmin se a vazao de escrita virar gargalo.
  PERFORM pg_advisory_xact_lock(4815206);
  NEW.seq := nextval('clinico.seq_alteracao');
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

-- Cadastro de apoio. Somente leitura para os clientes; nunca apagar, usar ativo = false.
CREATE TABLE clinico.medicamento (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  principio_ativo text,
  apresentacao    text,
  observacao      text,
  ativo           boolean NOT NULL DEFAULT true,
  seq             bigint NOT NULL DEFAULT 0,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

-- cpf SEM UNIQUE de proposito: duplicata provavel e sinalizada, nunca rejeitada.
CREATE TABLE clinico.pessoa (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                        text NOT NULL,
  data_nascimento             date,
  sexo                        text CHECK (sexo IN ('M', 'F', 'I')),
  cpf                         text,
  cns                         text,
  telefone                    text,
  contato_emergencia_nome     text,
  contato_emergencia_telefone text,
  contato_emergencia_email    text,
  nao_identificada            boolean NOT NULL DEFAULT false,
  descricao_identificacao     text,
  possivel_duplicata_de       uuid REFERENCES clinico.pessoa (id),
  -- { "<campoCamelCase>": "<ISO da ultima edicao>" } usado pela estrategia CampoMaisRecente.
  carimbos_campos             jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_por                  uuid,
  seq                         bigint NOT NULL DEFAULT 0,
  criado_em                   timestamptz NOT NULL DEFAULT now(),
  atualizado_em               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pessoa_cpf_idx ON clinico.pessoa (cpf) WHERE cpf IS NOT NULL;
CREATE INDEX pessoa_nome_nascimento_idx ON clinico.pessoa (lower(nome), data_nascimento);

CREATE TABLE clinico.prontuario (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id      uuid NOT NULL UNIQUE REFERENCES clinico.pessoa (id),
  tipo_sanguineo text,
  observacoes    text,
  criado_por     uuid,
  seq            bigint NOT NULL DEFAULT 0,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

-- Alergias, comorbidades e medicacoes de uso continuo: adicao sempre vence;
-- remocao e uma inativacao explicita e assinada.
CREATE TABLE clinico.prontuario_item (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prontuario_id  uuid NOT NULL REFERENCES clinico.prontuario (id),
  tipo           text NOT NULL CHECK (tipo IN ('ALERGIA', 'COMORBIDADE', 'MEDICACAO_CONTINUA')),
  descricao      text NOT NULL,
  registrado_por uuid,
  registrado_em  timestamptz NOT NULL DEFAULT now(),
  inativado_por  uuid,
  inativado_em   timestamptz,
  seq            bigint NOT NULL DEFAULT 0,
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prontuario_item_prontuario_idx ON clinico.prontuario_item (prontuario_id);

CREATE TABLE clinico.atendimento (
  id                uuid PRIMARY KEY,
  prontuario_id     uuid NOT NULL REFERENCES clinico.prontuario (id),
  pessoa_id         uuid NOT NULL REFERENCES clinico.pessoa (id),
  profissional_id   uuid NOT NULL,
  profissional_nome text NOT NULL,
  dispositivo_id    uuid,
  iniciado_em       timestamptz NOT NULL,
  recebido_em       timestamptz NOT NULL DEFAULT now(),
  local_descricao   text,
  latitude          double precision,
  longitude         double precision,
  queixa_principal  text,
  status            text NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'ENCERRADO')),
  encerrado_em      timestamptz
);
CREATE INDEX atendimento_pessoa_idx ON clinico.atendimento (pessoa_id);
CREATE INDEX atendimento_recebido_idx ON clinico.atendimento (recebido_em DESC);

-- Linha do tempo IMUTAVEL: o papel do servico so tem INSERT e SELECT.
-- Correcao = novo evento RETIFICACAO apontando para o original.
CREATE TABLE clinico.atendimento_evento (
  id                 uuid PRIMARY KEY,
  atendimento_id     uuid NOT NULL REFERENCES clinico.atendimento (id),
  tipo               text NOT NULL CHECK (tipo IN ('SINAIS_VITAIS', 'GLASGOW', 'TRIAGEM', 'MEDICACAO',
                                                   'PROCEDIMENTO', 'OBSERVACAO', 'RETIFICACAO', 'ENCERRAMENTO')),
  ocorrido_em        timestamptz NOT NULL,
  recebido_em        timestamptz NOT NULL DEFAULT now(),
  profissional_id    uuid NOT NULL,
  profissional_nome  text NOT NULL,
  dispositivo_id     uuid,
  medicamento_id     uuid REFERENCES clinico.medicamento (id),
  retifica_evento_id uuid REFERENCES clinico.atendimento_evento (id),
  dados              jsonb NOT NULL
);
CREATE INDEX atendimento_evento_linha_idx ON clinico.atendimento_evento (atendimento_id, ocorrido_em);

-- Registro de idempotencia e rastreabilidade de cada comando recebido (online ou vindo do outbox).
CREATE TABLE clinico.operacao_sync (
  op_id                 uuid PRIMARY KEY,
  profissional_id       uuid NOT NULL,
  dispositivo_id        uuid,
  metodo                text NOT NULL,
  rota                  text NOT NULL,
  entidade_id           uuid,
  hash_corpo            text NOT NULL,
  status_http           integer NOT NULL,
  resposta              jsonb,
  criado_em_dispositivo timestamptz,
  recebido_em           timestamptz NOT NULL DEFAULT now()
);

-- Trilha de auditoria clinica, gravada na MESMA transacao do dado.
CREATE TABLE clinico.auditoria_clinica (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entidade        text NOT NULL,
  entidade_id     uuid NOT NULL,
  acao            text NOT NULL,
  profissional_id uuid NOT NULL,
  dispositivo_id  uuid,
  op_id           uuid,
  antes           jsonb,
  depois          jsonb,
  observacao      text,
  registrado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_clinica_entidade_idx ON clinico.auditoria_clinica (entidade, entidade_id);

CREATE INDEX medicamento_seq_idx ON clinico.medicamento (seq);
CREATE INDEX pessoa_seq_idx ON clinico.pessoa (seq);
CREATE INDEX prontuario_seq_idx ON clinico.prontuario (seq);
CREATE INDEX prontuario_item_seq_idx ON clinico.prontuario_item (seq);

CREATE TRIGGER medicamento_marcar_alteracao BEFORE INSERT OR UPDATE ON clinico.medicamento
  FOR EACH ROW EXECUTE FUNCTION clinico.marcar_alteracao();
CREATE TRIGGER pessoa_marcar_alteracao BEFORE INSERT OR UPDATE ON clinico.pessoa
  FOR EACH ROW EXECUTE FUNCTION clinico.marcar_alteracao();
CREATE TRIGGER prontuario_marcar_alteracao BEFORE INSERT OR UPDATE ON clinico.prontuario
  FOR EACH ROW EXECUTE FUNCTION clinico.marcar_alteracao();
CREATE TRIGGER prontuario_item_marcar_alteracao BEFORE INSERT OR UPDATE ON clinico.prontuario_item
  FOR EACH ROW EXECUTE FUNCTION clinico.marcar_alteracao();

GRANT USAGE ON SEQUENCE clinico.seq_alteracao TO mf_cida;
GRANT SELECT ON clinico.medicamento TO mf_cida;
GRANT SELECT, INSERT, UPDATE ON clinico.pessoa, clinico.prontuario, clinico.prontuario_item, clinico.atendimento TO mf_cida;
-- Somente-insercao: evento clinico, registro de sync e auditoria nunca sao alterados.
GRANT SELECT, INSERT ON clinico.atendimento_evento, clinico.operacao_sync, clinico.auditoria_clinica TO mf_cida;

-- migrate:down
DROP TABLE clinico.auditoria_clinica;
DROP TABLE clinico.operacao_sync;
DROP TABLE clinico.atendimento_evento;
DROP TABLE clinico.atendimento;
DROP TABLE clinico.prontuario_item;
DROP TABLE clinico.prontuario;
DROP TABLE clinico.pessoa;
DROP TABLE clinico.medicamento;
DROP FUNCTION clinico.marcar_alteracao();
DROP SEQUENCE clinico.seq_alteracao;
