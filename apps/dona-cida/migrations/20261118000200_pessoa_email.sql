-- migrate:up

-- E-mail do proprio paciente: com ele, a ficha e enviada sozinha quando o atendimento e encerrado.
ALTER TABLE clinico.pessoa ADD COLUMN email text;

-- migrate:down
ALTER TABLE clinico.pessoa DROP COLUMN email;
