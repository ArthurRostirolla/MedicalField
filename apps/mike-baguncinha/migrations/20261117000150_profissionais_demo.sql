-- migrate:up

-- Profissionais de demonstracao (FICTICIOS; registros de conselho inventados).
-- A senha unica e PUBLICA (apps/mike-baguncinha/README.md), entao a carga so e feita quando o
-- banco declara que e de demonstracao:
--     ALTER DATABASE <banco> SET medicalfield.dados_demo = 'on';
-- Sem esse parametro (qualquer ambiente real), esta migracao nao insere nada.
-- Os hashes sao Argon2id no formato PHC, gerados pelo proprio servico (`mike-baguncinha hash`).
-- Ids fixos, para que cargas de demonstracao de outros servicos possam referencia-los; o servico
-- avisa no log de partida se os encontrar com AMBIENTE=producao.
DO $demo$
BEGIN
  IF coalesce(current_setting('medicalfield.dados_demo', true), '') <> 'on' THEN
    RAISE NOTICE 'medicalfield.dados_demo nao esta ligado: profissionais de demonstracao NAO criados';
    RETURN;
  END IF;
  INSERT INTO identidade.profissional (id, tipo_registro, registro, uf, nome, papel, senha_hash) VALUES
    ('0d5b1c1e-7a10-4c1e-9b11-000000000001', 'CRM', '100001', 'RS', 'Dra. Helena Prado', 'ADMIN',
     '$argon2id$v=19$m=19456,t=2,p=1$mvhQDek5CN9ZvrCT2+3f6Q$3iz4QW3lGGg5I9wdVDcnqmIeQzn6Ui0h8Ekp+v21/KQ'),
    ('0d5b1c1e-7a10-4c1e-9b11-000000000002', 'COREN', '200002', 'RS', 'Enf. Caio Brandão', 'PROFISSIONAL',
     '$argon2id$v=19$m=19456,t=2,p=1$eOQQS1gVm3eKmoRjatv8wQ$3FmaNw+PIU2BhJWxiqvxhP6p4o5cfv9Dq7qYVITJLNA'),
    ('0d5b1c1e-7a10-4c1e-9b11-000000000003', 'SOCORRISTA', '300003', '', 'Soc. Lia Moura', 'PROFISSIONAL',
     '$argon2id$v=19$m=19456,t=2,p=1$lt2DQt5CmIgFZ2TddVDb+g$kpFo4BDNsuVxaxNGbgfKV/hF/25Ykf1p3E3bNxQ6rHc')
  ON CONFLICT (tipo_registro, registro, uf) DO NOTHING;
END
$demo$;

-- migrate:down
DELETE FROM identidade.sessao WHERE profissional_id IN (
  '0d5b1c1e-7a10-4c1e-9b11-000000000001', '0d5b1c1e-7a10-4c1e-9b11-000000000002', '0d5b1c1e-7a10-4c1e-9b11-000000000003');
DELETE FROM identidade.profissional WHERE id IN (
  '0d5b1c1e-7a10-4c1e-9b11-000000000001', '0d5b1c1e-7a10-4c1e-9b11-000000000002', '0d5b1c1e-7a10-4c1e-9b11-000000000003');
