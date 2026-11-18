# Problemas conhecidos

Severidade: `Crítica` (impede o roteiro acadêmico ou perde dado) · `Alta` (requisito obrigatório falha) · `Média` · `Baixa`.

## Abertos

Nenhum de severidade Crítica ou Alta.

| ID | Severidade | Problema | Situação |
| --- | --- | --- | --- |
| D-QA-10 | Média | Sem TLS nem redirecionamento para HTTPS | `deploy/compose.vm.yaml` acrescenta Let's Encrypt e o redirecionamento na VM ([`docs/operacao/acesso-publico.md`](operacao/acesso-publico.md)); validado na VM em 2026-11-18 (certificado Let's Encrypt, 301 de HTTP para HTTPS, HSTS). O modo local continua só em HTTP |
| D-QA-21 | Baixa | Itens menores da revisão de código que não foram tratados (limitador de login em memória, access token válido por até 15 min após o logout, `?desde=1;select` lido como `desde=1`, entre outros) | Aceitos; lista em `docs/testes/defeitos-qa.md` |
| D-06 | Baixa | Logs e documentos mostram só o id do profissional | Aceito: fora do escopo |
| D-07 | Baixa | `npm audit` aponta vulnerabilidades só em ferramentas de build/teste (`--omit=dev` devolve 0) | Aceito |
| D-08 | Baixa | Os testes de ponta a ponta deixam dados de teste no banco de desenvolvimento | Aceito em dev |
| D-12 | Baixa (ambiente) | Nesta máquina, `localhost:8088` não responde por IPv6 depois de recriar o contêiner que publica a porta (repasse do WSL/Docker Desktop preso; observado com o k3s local); `127.0.0.1:8088` funciona | Contorno documentado em `docs/operacao/troubleshooting.md` |
| D-13 | Baixa | Duas renovações simultâneas do mesmo refresh token (duas abas do app) são tratadas como roubo e encerram a sessão | Efeito colateral aceito da correção do D-QA-09 |
| D-14 | Baixa | APK de release gerado mas não instalado nem assinado; a exceção de `localhost` na configuração de rede do release não foi verificada em aparelho | A verificar antes de distribuir |

## Bloqueios externos

| ID | Bloqueio | Impacto | O que falta |
| --- | --- | --- | --- |
| X-02 | Sem credencial de SMTP real | E-mail é validado contra o Mailpit (SMTP real de captura), não contra uma caixa externa | Informar `SMTP_*` em `deploy/.env` |
| X-03 | Go não instalado na máquina de desenvolvimento | Nenhum: o serviço Go compila e testa em contêiner | — |

## Limitações assumidas (do plano aprovado)

- iOS não é entregue (build exige macOS).
- Banco local do app no navegador não é cifrado.
- Fusão de pessoas duplicadas não existe: só a sinalização.

## Resolvidos

| ID | Problema | Correção |
| --- | --- | --- |
| D-01 | Cluster k3s local não voltava após `parar` (IP do contêiner mudava) | Rede Docker própria com IP fixo em `deploy/scripts/cluster-local.sh` (script removido na troca para o Docker Compose) |
| D-02 | `ItemNav` de `packages/ui` recarregava a página ao navegar (apagava o token em memória) | O link delega o clique simples ao roteador do app |
| D-03 | Tabela rolável de `packages/ui` inalcançável por teclado (axe `scrollable-region-focusable`) | `role="region"`, rótulo e `tabIndex` |
| D-09 | Build do APK falhava no Gradle ("Unable to establish loopback connection") | Pasta temporária curta para os soquetes locais do Java |
| D-10 | Topo fixo do app sob a barra de status do Android | `padding-top: env(safe-area-inset-top)` em `.mf-app__topo` |
| D-11 | Retificação com dados corrigidos tirava o evento da passagem de caso (sinais vitais apareciam como "não registrado") | `calcularResumo` aplica os dados corrigidos sobre o evento original; teste novo |
| D-04 / D-QA-18 | Rota no log de acesso com nomes inconsistentes | Mike e Jaiminho gravam o padrão da rota ou `(rota desconhecida)` |
| D-05 | Lista de documentos sem `proximoCursor` | Campo explícito, com teste |
| D-QA-01 | **Alta** — 8 logins simultâneos derrubavam o Mike por falta de memória | Semáforo de 2 verificações de senha; limite do contêiner em 128 Mi; retestado com 32 logins (E-010) |
| D-QA-02 | **Alta** — porta de diagnóstico `window.__mf` no build de produção, com leitura de token e escrita | Só existe com `VITE_DIAGNOSTICO=1`, somente leitura, sem acesso à sessão; teste do build de produção |
| D-QA-03 | **Alta** — conta ADMIN de demonstração criada em qualquer ambiente | Carga condicional a `DADOS_DEMO=on`; aviso de erro na partida em produção |
| D-QA-04 | Limite de taxa do login no gateway ligava ou desligava ao acaso | Prioridade explícita na rota; retestado (E-010) |
| D-QA-05 | Cursor de sincronização regredia depois de restaurar um backup | `restore.sh` avança a sequence |
| D-QA-06 | Cursor de paginação forjado dava 500 | 422, sem registrar o valor |
| D-QA-07 | Caractere nulo em texto dava 500 | 422; erro de dado do banco nunca vira 500 |
| D-QA-08 | Jaiminho lia corpo de qualquer tamanho | Teto de 64 KiB, 413 antes de ler |
| D-QA-09 | Reuso de refresh token não era tratado como roubo | Revoga todas as sessões do profissional |
| D-QA-11 | Android com backup e tráfego em claro liberados | `allowBackup=false`; tráfego em claro só no build de depuração |
| D-QA-12 | Limitador de login sem teto de chave nem limite por conta | Comprimentos validados; contador por conta; teto de entradas |
| D-QA-13 | Dependências do Jaiminho sem lock | Lock com hashes usado pelo Dockerfile |
| D-QA-14 | Login com corpo grande e `Expect: 100-continue` sem resposta | Recusa imediata pelo `Content-Length` |
| D-QA-15 | 503 do gateway em texto puro | JSON do contrato; retestado (E-010) |
| D-QA-16 | Texto digitado durante a gravação anterior era apagado | Fila de gravação; 12 de 12 no teste |
| D-QA-17 | Chave de idempotência compartilhada entre profissionais | Chave por profissional e por comando |
| D-QA-19 / D-QA-20 | Rastro do Playwright com a senha no repositório; roteiro executava outras specs | Rastro desligado, `resultados/` ignorado, `testMatch` |
