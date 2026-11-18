-- migrate:up

-- O servico passa a apagar sessoes de refresh token VENCIDAS (expira_em < now()), para a
-- tabela nao crescer para sempre. Auditoria continua somente-insercao; isto vale so para sessao.
GRANT DELETE ON identidade.sessao TO mf_mike;

-- migrate:down
REVOKE DELETE ON identidade.sessao FROM mf_mike;
