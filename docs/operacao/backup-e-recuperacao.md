# Backup e recuperação

> **Situação:** `backup.sh agora` e `restore.sh --sim` foram executados no Compose local (contagens iguais, cursor de sincronização avançado, API respondendo sem reiniciar). O ensaio detalhado abaixo foi feito na implantação anterior, em k3s.

## O que existe

| Peça | Onde | O que faz |
| --- | --- | --- |
| Dados do Postgres | Volume nomeado `medicalfield_dados` (disco da VM) | Sobrevive a reinício do contêiner, `docker compose down` e nova versão. **`docker compose down -v` apaga.** |
| `deploy/scripts/backup.sh` | `deploy/backups/` (fora do Git) | `pg_dump` (formato *custom*) pelo contêiner do Postgres. Mantém os **7** mais recentes. |
| Cron do host | `crontab` do root (`sudo crontab -e`) | `15 3 * * * /opt/medicalfield/deploy/scripts/backup.sh agora` — todo dia às 03:15 (hora da VM). |

**Limite:** o volume e os backups estão no mesmo disco da VM. Perder a VM é perder os dois — **antes da apresentação, copie um dump para fora da VM** (junto com uma cópia de `deploy/.env`).

## Fazer backup

```bash
deploy/scripts/backup.sh                     # novo dump em deploy/backups/
deploy/scripts/backup.sh listar
scp univates@177.44.248.60:/opt/medicalfield/deploy/backups/medicalfield-<data>.dump .   # da sua máquina
```

O dump contém dado (fictício) de paciente: não vai para o Git; trate como dado sensível.

## Restaurar

A restauração **substitui** o conteúdo do banco, em uma única transação (ou restaura tudo, ou não muda nada). Os serviços não precisam ser parados; reconectam sozinhos.

```bash
deploy/scripts/restore.sh --sim                                   # o backup mais recente de deploy/backups/
deploy/scripts/restore.sh --sim ./medicalfield-2026-11-18.dump    # um arquivo específico
```

Conferir: `cd deploy && docker compose exec -T postgres psql -U postgres -d medicalfield -c 'select count(*) from clinico.pessoa'`.

## Recuperação total (VM nova ou volume perdido)

1. Instale tudo de novo ([instalacao-vm.md](instalacao-vm.md)) **com o mesmo `deploy/.env`** — o Postgres novo cria os papéis `mf_*` com essas senhas.
2. Espere o `postgres` ficar `healthy` (`docker compose ps`).
3. `deploy/scripts/restore.sh --sim ./copia.dump`.

O dump leva schemas, tabelas, dados, permissões e as tabelas `schema_migrations`; os papéis vêm do init do Postgres.

## Ensaio realizado (k3s local, T-22)

Executado no k3s local em 2026-11-17, antes da troca para o Docker Compose (com os scripts da época):

1. `INSERT` em `clinico.medicamento` → contêiner do Postgres apagado e recriado → a linha continuava lá.
2. Backup → arquivo `medicalfield-<data>.dump`.
3. `DELETE` na tabela + linha nova → `restore.sh --sim` → voltou exatamente o conteúdo do backup, com as permissões de `mf_cida` intactas.
4. Restauração a partir de uma cópia local → idem.

No Compose e na VM, repita o ensaio uma vez antes da apresentação.

## Depois de restaurar: o cursor de sincronização

O `restore.sh` avança a sequence `clinico.seq_alteracao` em 1.000.000 ao final. Sem isso, o banco restaurado reutilizaria números de cursor que os aparelhos já receberam, e eles deixariam de receber cadastros novos sem nenhum aviso. Limite conhecido: o que um aparelho baixou **depois** do backup e não existe mais na central (por exemplo, um medicamento cadastrado nesse intervalo) continua no banco local dele até o app ser reinstalado.
