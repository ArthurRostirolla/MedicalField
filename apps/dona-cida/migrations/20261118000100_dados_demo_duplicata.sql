-- migrate:up

-- Carga de DEMONSTRACAO: um recadastro da Marina (mesmo nome, nascimento e CPF), ja sinalizado,
-- para a tela "Possiveis duplicatas" ter o que mostrar. Mesma condicao da carga 20261117000250.
DO $carga$
BEGIN
  IF current_setting('medicalfield.dados_demo', true) IS DISTINCT FROM 'on' THEN
    RAISE NOTICE 'medicalfield.dados_demo nao esta ligado: carga de demonstracao ignorada';
  ELSIF EXISTS (SELECT 1 FROM clinico.pessoa WHERE id = '0b000000-0000-4000-8000-000000000001') THEN
    INSERT INTO clinico.pessoa (id, nome, data_nascimento, sexo, cpf, telefone,
                                descricao_identificacao, possivel_duplicata_de) VALUES
      ('0b000000-0000-4000-8000-000000000004', 'Marina Exemplo da Silva', '1984-03-12', 'F', '00000000101', '(51) 90000-0004',
       'PESSOA FICTÍCIA — dado demonstrativo (recadastro)', '0b000000-0000-4000-8000-000000000001')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$carga$;

-- migrate:down
DELETE FROM clinico.pessoa p WHERE id = '0b000000-0000-4000-8000-000000000004'
  AND NOT EXISTS (SELECT 1 FROM clinico.prontuario r WHERE r.pessoa_id = p.id);
