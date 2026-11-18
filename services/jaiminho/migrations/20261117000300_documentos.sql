-- migrate:up

-- Ficha de atendimento gerada. O PDF fica guardado: e a prova do que foi enviado.
CREATE TABLE documentos.documento (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id     uuid NOT NULL,
  tipo               text NOT NULL DEFAULT 'FICHA_ATENDIMENTO',
  -- sha256 do JSON canonico da ficha: mesmo conteudo => mesmo documento.
  hash_conteudo      text NOT NULL,
  -- sha256 dos bytes do PDF: usado para verificar integridade.
  hash_pdf           text NOT NULL,
  codigo_verificacao text NOT NULL UNIQUE,
  pdf                bytea NOT NULL,
  gerado_por         uuid NOT NULL,
  gerado_em          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (atendimento_id, hash_conteudo)
);
CREATE INDEX documento_atendimento_idx ON documentos.documento (atendimento_id);

-- Fila persistente de envio de e-mail (consumida com FOR UPDATE SKIP LOCKED).
CREATE TABLE documentos.envio_email (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id         uuid NOT NULL REFERENCES documentos.documento (id),
  chave_idempotencia   uuid UNIQUE,
  destinatario_nome    text NOT NULL,
  destinatario_email   text NOT NULL,
  vinculo              text NOT NULL CHECK (vinculo IN ('PACIENTE', 'FAMILIAR')),
  status               text NOT NULL DEFAULT 'PENDENTE'
                       CHECK (status IN ('PENDENTE', 'ENVIANDO', 'ENVIADO', 'FALHA_DEFINITIVA')),
  tentativas           integer NOT NULL DEFAULT 0,
  proxima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  ultimo_erro          text,
  solicitado_por       uuid NOT NULL,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  atualizado_em        timestamptz NOT NULL DEFAULT now(),
  enviado_em           timestamptz
);
CREATE INDEX envio_email_fila_idx ON documentos.envio_email (status, proxima_tentativa_em);

GRANT SELECT, INSERT ON documentos.documento TO mf_jaiminho;
GRANT SELECT, INSERT, UPDATE ON documentos.envio_email TO mf_jaiminho;

-- migrate:down
DROP TABLE documentos.envio_email;
DROP TABLE documentos.documento;
