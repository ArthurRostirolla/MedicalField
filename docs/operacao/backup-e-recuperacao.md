# Backup e recuperação

## O que existe

| Peça | Onde | O que faz |
| --- | --- | --- |
| Dados do Postgres | PVC `dados-postgres-0` (`local-path`, disco da VM) | Sobrevive a reinício de pod, nova implantação e `kubectl delete pod postgres-0`. |
| CronJob `backup` | PVC `backups` | `pg_dump` (formato *custom*) todo dia às 03:15 (America/Sao_Paulo). Mantém os **7** mais recentes. |
| Volume de backups | montado só-leitura em `postgres-0:/backups` | Permite listar e restaurar com `kubectl exec`. |

Nem o Argo CD nem a remoção do StatefulSet apagam esses volumes (`Prune=false,Delete=false`; `persistentVolumeClaimRetentionPolicy: Retain`).

**Limite:** os dois volumes estão no mesmo disco da VM. Perder a VM é perder os dois. Por isso existe o `exportar` — **antes da apresentação, tire um dump para fora da VM**.

## Fazer backup

```bash
deploy/scripts/backup.sh                       # dispara o CronJob agora e lista o volume
deploy/scripts/backup.sh listar
deploy/scripts/backup.sh exportar ./medicalfield-$(date +%F).dump    # cópia fora do cluster
```

O dump contém dado (fictício) de paciente: não vai para o Git; trate como dado sensível.

## Restaurar

A restauração **substitui** o conteúdo do banco, em uma única transação (ou restaura tudo, ou não muda nada). Os serviços não precisam ser parados; reconectam sozinhos.

```bash
deploy/scripts/restore.sh --sim                                      # o backup mais recente do volume
deploy/scripts/restore.sh --sim medicalfield-20261118T004021Z.dump   # um backup do volume, pelo nome
deploy/scripts/restore.sh --sim ./medicalfield-2026-11-18.dump       # um arquivo local
```

Conferir: `kubectl -n medicalfield exec postgres-0 -- psql -U postgres -d medicalfield -c 'select count(*) from clinico.pessoa'`.

## Recuperação total (VM nova ou volume perdido)

1. Instale tudo de novo ([instalacao-vm.md](instalacao-vm.md)) **com o mesmo `deploy/secrets.env`** — o Postgres novo cria os papéis `mf_*` com essas senhas.
2. Espere o `postgres-0` ficar pronto.
3. `deploy/scripts/restore.sh --sim ./copia.dump`.

O dump leva schemas, tabelas, dados, permissões e as tabelas `schema_migrations`; os papéis vêm do init do Postgres.

## Ensaio realizado (cluster local, T-22)

Executado no k3s local em 2026-11-17:

1. `INSERT` em `clinico.medicamento` → `kubectl delete pod postgres-0` → a linha continuava lá.
2. `backup.sh` → arquivo `medicalfield-<data>.dump` no volume.
3. `DELETE` na tabela + linha nova → `restore.sh --sim` → voltou exatamente o conteúdo do backup, com as permissões de `mf_cida` intactas.
4. `backup.sh exportar` → `restore.sh --sim <arquivo local>` → idem.

Na VM, repita o ensaio uma vez antes da apresentação.

## Depois de restaurar: o cursor de sincronização

O `restore.sh` avança a sequence `clinico.seq_alteracao` em 1.000.000 ao final. Sem isso, o banco restaurado reutilizaria números de cursor que os aparelhos já receberam, e eles deixariam de receber cadastros novos sem nenhum aviso. Limite conhecido: o que um aparelho baixou **depois** do backup e não existe mais na central (por exemplo, um medicamento cadastrado nesse intervalo) continua no banco local dele até o app ser reinstalado.
