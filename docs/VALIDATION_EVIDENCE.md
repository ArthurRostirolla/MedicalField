# Evidências de validação

Cada entrada: o que foi executado, o comando ou a ação, o resultado observado e a data. Só entra aqui o que foi **realmente executado** pelo agente principal ou conferido por ele.

## E-001 — Cursor de sincronização em inserção manual (base do passo 9)

- **Data:** 2026-11-17
- **Executado:** `bash scripts/dev-db.sh subir && bash scripts/dev-db.sh migrar`, depois `INSERT INTO clinico.medicamento (nome) VALUES ('TESTE CURSOR') RETURNING seq;` como administrador, sem informar `id` nem `seq`.
- **Esperado:** as três migrações aplicam; a linha recebe `id` e `seq` automaticamente.
- **Observado:** três migrações aplicadas (`identidade_e_auditoria`, `clinico`, `documentos`); `RETURNING seq` devolveu `1`; 13 tabelas criadas nos schemas `identidade`, `auditoria`, `clinico`, `documentos`.
- **Resultado:** passou. Cobre apenas o banco; a chegada ao cliente (passo 11) ainda não foi validada.
