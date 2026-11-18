-- Schemas do banco central: um por dominio, cada servico com seu papel de banco.
-- Idempotente. Os papeis (mf_mike, mf_cida, mf_jaiminho) precisam existir antes.
-- As tabelas e os GRANTs por tabela ficam nas migracoes de cada servico.
CREATE SCHEMA IF NOT EXISTS identidade;
CREATE SCHEMA IF NOT EXISTS auditoria;
CREATE SCHEMA IF NOT EXISTS clinico;
CREATE SCHEMA IF NOT EXISTS documentos;

REVOKE ALL ON SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA identidade TO mf_mike;
GRANT USAGE ON SCHEMA auditoria  TO mf_mike, mf_cida, mf_jaiminho;
GRANT USAGE ON SCHEMA clinico    TO mf_cida;
GRANT USAGE ON SCHEMA documentos TO mf_jaiminho;
