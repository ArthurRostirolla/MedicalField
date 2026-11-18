# Instalação na VM da Univates

> **Situação:** executado na VM em 2026-11-18. O sistema está no ar em `https://177-44-248-60.sslip.io`.

| VM | Valor |
| --- | --- |
| Endereço | `177.44.248.60` (Ubuntu 26.04), usuário `univates` |
| Recursos | 1 vCPU, 1,6 GB de RAM — por isso Docker Compose e não k3s ([arquitetura](../arquitetura/arquitetura.md), seção 3) |
| Endereço público | `https://177-44-248-60.sslip.io` ([acesso-publico.md](acesso-publico.md)) |

## 0. Verificar a VM

| O que | Comando | Preciso de |
| --- | --- | --- |
| SO, RAM, disco | `cat /etc/os-release; free -h; df -h /` | ≥ 10 GB livres |
| Saída para GitHub / GHCR | `curl -sI https://github.com \| head -1; curl -sI https://ghcr.io/v2/ \| head -1` | resposta HTTP (200/401) |
| Saída SMTP | `nc -zv smtp.gmail.com 587` | só se for usar SMTP externo |
| Firewall | `sudo ufw status` | 80 e 443 liberadas (passo 1) |

## 1. Docker e firewall

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo docker compose version
sudo ufw allow 443/tcp                 # a 80 já está liberada
```

Na VM da Univates o `sudo` não permite `usermod` (política da administração), então o usuário não entra no grupo `docker`: **todo comando `docker` roda com `sudo`**.

**Atenção:** porta publicada pelo Docker passa por fora do `ufw`. Só o gateway publica portas para fora (80 e 443); o Mailpit fica em `127.0.0.1:18025` e só é alcançável por túnel SSH (passo 5).

## 2. Repositório

```bash
sudo git clone https://github.com/ArthurRostirolla/MedicalField.git /opt/medicalfield
sudo chown -R univates: /opt/medicalfield
cd /opt/medicalfield
```

## 3. `deploy/.env` (fora do Git)

```bash
cp deploy/.env.example deploy/.env
```

Em `deploy/.env`, descomente o bloco **VM**:

| Variável | Valor |
| --- | --- |
| `COMPOSE_FILE` | `compose.yaml:compose.vm.yaml` (ativa HTTPS) |
| `MF_REGISTRO` | `ghcr.io/arthurrostirolla/medicalfield` |
| `MF_TAG` | `latest` (ou o SHA de um commit, para fixar a versão) |
| `MF_PORTA_HTTP` | `80` |
| `MF_HOST` | `177-44-248-60.sslip.io` |
| `MF_ACME_EMAIL` | opcional (o Let's Encrypt não exige e-mail) |
| `URL_PUBLICA_PORTAL` | `https://177-44-248-60.sslip.io/portal` (vai no QR do PDF) |
| `SMTP_*` | só se for usar SMTP externo; vazio = Mailpit |

Depois gere as senhas e a chave do JWT:

```bash
deploy/scripts/segredos.sh             # completa deploy/.env e aplica chmod 600
```

**Guarde uma cópia de `deploy/.env` fora da VM**: as senhas do banco só são aplicadas na primeira partida do Postgres.

**Imagens do GHCR:** os 5 pacotes `medicalfield-*` precisam ser públicos (GitHub → Packages → Package settings → Change visibility), ou faça `sudo docker login ghcr.io` na VM com um token `read:packages`.

## 4. Subir

```bash
cd /opt/medicalfield/deploy
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps                 # migra-* "Exited (0)"; o resto "running"/"healthy"
```

## 5. Conferir

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://177-44-248-60.sslip.io/portal/   # 200, certificado válido
sudo docker stats --no-stream          # orçamento de memória real
sudo deploy/scripts/backup.sh          # primeiro backup
```

Mailpit, da sua máquina: `ssh -L 18025:127.0.0.1:18025 univates@177.44.248.60` e abra `http://localhost:18025`.

Agende o backup diário (`sudo crontab -e`, no crontab do root, porque o `docker` exige `sudo`):

```
15 3 * * * /opt/medicalfield/deploy/scripts/backup.sh agora
```

Depois: [deploy-e-rollback.md](deploy-e-rollback.md) para atualizar, [banco-manual.md](banco-manual.md) para o passo 9 do roteiro.

## Contingências

| Achado | Resposta |
| --- | --- |
| Sem saída para o GHCR | Na sua máquina: `docker save ghcr.io/arthurrostirolla/medicalfield-web:latest … -o imagens.tar`; copie para a VM; `docker load -i imagens.tar`; `docker compose up -d` (sem `pull`). |
| Certificado não sai | A 80 precisa responder de fora (desafio HTTP-01): `docker compose logs traefik`. |
| Falta memória | `docker stats`; ver [troubleshooting.md](troubleshooting.md). |

## Dados de demonstração (`DADOS_DEMO`)

Os profissionais, pessoas e medicamentos fictícios só são criados quando `deploy/.env` tem `DADOS_DEMO=on` **na primeira partida do banco** (o script de inicialização grava `medicalfield.dados_demo = 'on'` no banco e as migrações de carga leem esse parâmetro). O `.env.example` vem com `on`, porque é ambiente de demonstração. **Num ambiente com dados reais, troque para `off` antes da primeira partida**: `on` cria a conta ADMIN de demonstração, cuja senha é pública.

A imagem `web` publicada pelo CI não expõe a consulta de diagnóstico do app (`window.__mf`); o modo local a constrói com `VITE_DIAGNOSTICO=1` (padrão de `MF_DIAGNOSTICO`), que os testes automatizados usam. O roteiro automatizado (`e2e/roteiro.spec.ts`) depende desse modo.
