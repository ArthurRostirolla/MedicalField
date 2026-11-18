-- migrate:up

-- Carga de DEMONSTRACAO. Nada aqui tem validade clinica:
--   * medicamentos: so nomes genericos de uso comum e a forma de apresentacao; sem dose,
--     indicacao ou contraindicacao (o sistema nao interpreta nem sugere nada);
--   * pessoas: FICTICIAS, com documentos inventados.
-- UUIDs fixos para os roteiros de teste poderem referencia-los. Reexecutar nao duplica.

-- CONDICIONAL: so carrega onde o banco declara que e de demonstracao. Em qualquer outro ambiente
-- (producao inclusive) a migracao e registrada como aplicada e nao insere nada.
--   ALTER DATABASE <banco> SET medicalfield.dados_demo = 'on';   -- ANTES de migrar
-- (o dbmate nao guarda checksum; bancos em que esta migracao ja rodou nao sao afetados.)
DO $carga$
BEGIN
  IF current_setting('medicalfield.dados_demo', true) IS DISTINCT FROM 'on' THEN
    RAISE NOTICE 'medicalfield.dados_demo nao esta ligado: carga de demonstracao ignorada';
  ELSE
    INSERT INTO clinico.medicamento (id, nome, principio_ativo, apresentacao, observacao) VALUES
      ('0a000000-0000-4000-8000-000000000001', 'Dipirona',               'Dipirona monoidratada',        'Solução injetável',      'DADO DEMONSTRATIVO — sem validade clínica'),
      ('0a000000-0000-4000-8000-000000000002', 'Paracetamol',            'Paracetamol',                  'Comprimido',             'DADO DEMONSTRATIVO — sem validade clínica'),
      ('0a000000-0000-4000-8000-000000000003', 'Ibuprofeno',             'Ibuprofeno',                   'Comprimido',             'DADO DEMONSTRATIVO — sem validade clínica'),
      ('0a000000-0000-4000-8000-000000000004', 'Soro fisiológico',       'Cloreto de sódio',             'Solução para infusão',   'DADO DEMONSTRATIVO — sem validade clínica'),
      ('0a000000-0000-4000-8000-000000000005', 'Soro glicosado',         'Glicose',                      'Solução para infusão',   'DADO DEMONSTRATIVO — sem validade clínica'),
      ('0a000000-0000-4000-8000-000000000006', 'Ringer com lactato',     'Solução de Ringer com lactato', 'Solução para infusão',  'DADO DEMONSTRATIVO — sem validade clínica'),
      ('0a000000-0000-4000-8000-000000000007', 'Adrenalina',             'Epinefrina',                   'Solução injetável',      'DADO DEMONSTRATIVO — sem validade clínica'),
      ('0a000000-0000-4000-8000-000000000008', 'Ácido acetilsalicílico', 'Ácido acetilsalicílico',       'Comprimido',             'DADO DEMONSTRATIVO — sem validade clínica'),
      ('0a000000-0000-4000-8000-000000000009', 'Salbutamol',             'Sulfato de salbutamol',        'Aerossol para inalação', 'DADO DEMONSTRATIVO — sem validade clínica'),
      ('0a000000-0000-4000-8000-000000000010', 'Ondansetrona',           'Cloridrato de ondansetrona',   'Solução injetável',      'DADO DEMONSTRATIVO — sem validade clínica'),
      ('0a000000-0000-4000-8000-000000000011', 'Omeprazol',              'Omeprazol',                    'Cápsula',                'DADO DEMONSTRATIVO — sem validade clínica'),
      ('0a000000-0000-4000-8000-000000000012', 'Oxigênio medicinal',     'Oxigênio',                     'Gás para inalação',      'DADO DEMONSTRATIVO — sem validade clínica')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO clinico.pessoa (id, nome, data_nascimento, sexo, cpf, telefone,
                                contato_emergencia_nome, contato_emergencia_telefone, contato_emergencia_email,
                                descricao_identificacao) VALUES
      ('0b000000-0000-4000-8000-000000000001', 'Marina Exemplo da Silva', '1984-03-12', 'F', '00000000101', '(51) 90000-0001',
       'Paulo Exemplo da Silva', '(51) 90000-0011', 'paulo.exemplo@medicalfield.example', 'PESSOA FICTÍCIA — dado demonstrativo'),
      ('0b000000-0000-4000-8000-000000000002', 'João Teste Pereira',      '1957-09-30', 'M', '00000000202', '(51) 90000-0002',
       'Rita Teste Pereira',     '(51) 90000-0022', 'rita.teste@medicalfield.example',    'PESSOA FICTÍCIA — dado demonstrativo'),
      ('0b000000-0000-4000-8000-000000000003', 'Clara Fictícia Souza',    '2001-06-05', 'F', '00000000303', '(51) 90000-0003',
       NULL, NULL, NULL,                                                                   'PESSOA FICTÍCIA — dado demonstrativo')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO clinico.prontuario (id, pessoa_id, tipo_sanguineo, observacoes) VALUES
      ('0c000000-0000-4000-8000-000000000001', '0b000000-0000-4000-8000-000000000001', 'O+',  'DADO DEMONSTRATIVO — sem validade clínica'),
      ('0c000000-0000-4000-8000-000000000002', '0b000000-0000-4000-8000-000000000002', 'A-',  'DADO DEMONSTRATIVO — sem validade clínica'),
      ('0c000000-0000-4000-8000-000000000003', '0b000000-0000-4000-8000-000000000003', NULL,  'DADO DEMONSTRATIVO — sem validade clínica')
    ON CONFLICT DO NOTHING;

    INSERT INTO clinico.prontuario_item (id, prontuario_id, tipo, descricao, registrado_em) VALUES
      ('0d000000-0000-4000-8000-000000000001', '0c000000-0000-4000-8000-000000000001', 'ALERGIA',            'Dipirona',             '2026-01-10T12:00:00Z'),
      ('0d000000-0000-4000-8000-000000000002', '0c000000-0000-4000-8000-000000000001', 'COMORBIDADE',        'Asma',                 '2026-01-10T12:00:00Z'),
      ('0d000000-0000-4000-8000-000000000003', '0c000000-0000-4000-8000-000000000002', 'COMORBIDADE',        'Hipertensão arterial', '2026-02-03T12:00:00Z'),
      ('0d000000-0000-4000-8000-000000000004', '0c000000-0000-4000-8000-000000000002', 'COMORBIDADE',        'Diabetes tipo 2',      '2026-02-03T12:00:00Z'),
      ('0d000000-0000-4000-8000-000000000005', '0c000000-0000-4000-8000-000000000002', 'MEDICACAO_CONTINUA', 'Ácido acetilsalicílico', '2026-02-03T12:00:00Z'),
      ('0d000000-0000-4000-8000-000000000006', '0c000000-0000-4000-8000-000000000003', 'ALERGIA',            'Látex',                '2026-03-21T12:00:00Z')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$carga$;

-- migrate:down
-- So remove o que nao foi usado: registro demo ja referenciado por atendimento fica (a FK impede).
DELETE FROM clinico.prontuario_item WHERE id::text LIKE '0d000000-0000-4000-8000-0000000000%';
DELETE FROM clinico.prontuario p WHERE id::text LIKE '0c000000-0000-4000-8000-0000000000%'
  AND NOT EXISTS (SELECT 1 FROM clinico.atendimento a WHERE a.prontuario_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM clinico.prontuario_item i WHERE i.prontuario_id = p.id);
DELETE FROM clinico.pessoa p WHERE id::text LIKE '0b000000-0000-4000-8000-0000000000%'
  AND NOT EXISTS (SELECT 1 FROM clinico.prontuario r WHERE r.pessoa_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM clinico.pessoa d WHERE d.possivel_duplicata_de = p.id);
DELETE FROM clinico.medicamento m WHERE id::text LIKE '0a000000-0000-4000-8000-0000000000%'
  AND NOT EXISTS (SELECT 1 FROM clinico.atendimento_evento e WHERE e.medicamento_id = m.id);
