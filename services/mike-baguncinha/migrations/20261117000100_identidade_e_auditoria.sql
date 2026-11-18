-- migrate:up

-- Profissionais de saude que autenticam por CRM, COREN ou ID de socorrista.
CREATE TABLE identidade.profissional (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_registro text NOT NULL CHECK (tipo_registro IN ('CRM', 'COREN', 'SOCORRISTA')),
  registro      text NOT NULL,
  uf            text NOT NULL DEFAULT '',
  nome          text NOT NULL,
  papel         text NOT NULL CHECK (papel IN ('ADMIN', 'PROFISSIONAL')),
  senha_hash    text NOT NULL,
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo_registro, registro, uf)
);

-- Sessoes de refresh token (apenas o hash do token e guardado).
CREATE TABLE identidade.sessao (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_id uuid NOT NULL REFERENCES identidade.profissional (id),
  refresh_hash    text NOT NULL UNIQUE,
  dispositivo_id  uuid,
  expira_em       timestamptz NOT NULL,
  revogada_em     timestamptz,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessao_profissional_idx ON identidade.sessao (profissional_id);

-- Log de acesso HTTP de TODOS os servicos (os 7 campos do enunciado + servico + request_id).
CREATE TABLE auditoria.log_acesso (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  data_hora       timestamptz NOT NULL,
  servico         text NOT NULL,
  ip_cliente      text NOT NULL,
  profissional_id uuid,
  metodo          text NOT NULL,
  rota            text NOT NULL,
  status_code     integer NOT NULL,
  tempo_ms        integer NOT NULL,
  request_id      text NOT NULL
);
CREATE INDEX log_acesso_data_hora_idx ON auditoria.log_acesso (data_hora DESC);
CREATE INDEX log_acesso_profissional_idx ON auditoria.log_acesso (profissional_id);

-- Logs gerados pelo cliente enquanto offline, enviados por POST /log.
CREATE TABLE auditoria.log_cliente (
  id              uuid PRIMARY KEY,
  profissional_id uuid NOT NULL,
  dispositivo_id  uuid,
  ocorrido_em     timestamptz NOT NULL,
  recebido_em     timestamptz NOT NULL DEFAULT now(),
  acao            text NOT NULL,
  entidade        text,
  entidade_id     text,
  resultado       text NOT NULL CHECK (resultado IN ('SUCESSO', 'FALHA')),
  estava_online   boolean NOT NULL,
  detalhe         jsonb
);
CREATE INDEX log_cliente_ocorrido_idx ON auditoria.log_cliente (ocorrido_em DESC);

GRANT SELECT, INSERT, UPDATE ON identidade.profissional, identidade.sessao TO mf_mike;
-- Auditoria e somente-insercao: ninguem altera nem apaga.
GRANT SELECT, INSERT ON auditoria.log_acesso, auditoria.log_cliente TO mf_mike;
GRANT INSERT ON auditoria.log_acesso TO mf_cida, mf_jaiminho;

-- migrate:down
DROP TABLE auditoria.log_cliente;
DROP TABLE auditoria.log_acesso;
DROP TABLE identidade.sessao;
DROP TABLE identidade.profissional;
