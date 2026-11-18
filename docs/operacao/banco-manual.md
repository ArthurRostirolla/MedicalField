# Inserir medicamentos direto no banco (passo 9 do roteiro)

O catálogo de medicamentos não tem tela de cadastro: o roteiro pede a inserção **pelo banco**. O app recebe os novos na próxima sincronização (`GET /api/v1/sync/alteracoes`), porque um gatilho preenche `seq` em todo `INSERT`/`UPDATE`.

## Abrir o psql no cluster

```bash
kubectl -n medicalfield exec -it postgres-0 -- psql -U postgres -d medicalfield
```

No cluster local: `deploy/scripts/cluster-local.sh kubectl -n medicalfield exec -it postgres-0 -- psql -U postgres -d medicalfield` (no Git Bash do Windows, prefixe com `winpty` se o terminal reclamar de TTY).

## Inserir

```sql
INSERT INTO clinico.medicamento (nome, principio_ativo, apresentacao) VALUES
  ('Dipirona 500 mg/mL', 'dipirona monoidratada', 'ampola 2 mL'),
  ('Adrenalina 1 mg/mL', 'epinefrina',            'ampola 1 mL'),
  ('Soro fisiológico 0,9%', 'cloreto de sódio',   'bolsa 500 mL')
RETURNING id, nome, seq;
```

`id`, `seq`, `ativo` e as datas são preenchidos pelo banco. Dados **demonstrativos, sem validade clínica**.

Sem abrir sessão interativa:

```bash
kubectl -n medicalfield exec postgres-0 -- psql -U postgres -d medicalfield -c \
  "INSERT INTO clinico.medicamento (nome, principio_ativo, apresentacao) VALUES ('Morfina 10 mg/mL', 'sulfato de morfina', 'ampola 1 mL') RETURNING id, seq;"
```

## Conferir

```sql
SELECT nome, principio_ativo, apresentacao, ativo, seq FROM clinico.medicamento ORDER BY seq DESC LIMIT 10;
```

Pela API (com token): `GET /api/v1/medicamento`. No app: sincronize e o medicamento aparece na lista, inclusive depois offline.

## Desativar em vez de apagar

```sql
UPDATE clinico.medicamento SET ativo = false WHERE nome = 'Morfina 10 mg/mL';
```

Não use `DELETE`: eventos de medicação já registrados apontam para o medicamento, e o app só fica sabendo de mudanças que geram novo `seq`.
