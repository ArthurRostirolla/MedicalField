# Problemas conhecidos

Severidade: `Crítica` (impede o roteiro acadêmico ou perde dado) · `Alta` (requisito obrigatório falha) · `Média` · `Baixa`.

## Abertos

| ID | Severidade | Problema | Situação |
| --- | --- | --- | --- |
| D-04 | Baixa | Jaiminho grava `rota: "(rota desconhecida)"` no log de acesso em alguns 401 sem token | Aberto |
| D-05 | Baixa | `GET /documento?atendimentoId=` devolve `{ itens }` sem `proximoCursor`; `packages/contratos` não tem esquema para essa lista | Aberto |
| D-06 | Baixa | Logs e documentos mostram só o id do profissional (não há rota para resolver nomes) | Aceito: fora do escopo |
| D-07 | Baixa | `npm audit` aponta 13 vulnerabilidades (glob, minimatch, picomatch) — **só em ferramentas de build/teste**; `npm audit --omit=dev` devolve 0 | Aceito: não chega às imagens; corrigir exigiria `--force` com quebra de versões |
| D-08 | Baixa | E2E do portal deixa dados de teste no banco de dev (atendimentos `e2e00000-…`, envios) | Aceito em dev |

Decisão registrada: "mais recentes primeiro" em `GET /atendimento` ordena por `recebidoEm` (o atendimento feito offline sobe ao topo quando sincroniza — é o comportamento desejado no passo 15).

## Bloqueios externos

| ID | Bloqueio | Impacto | O que falta |
| --- | --- | --- | --- |
| X-01 | Sem acesso à VM da Univates nesta sessão | Implantação real e acesso público não podem ser executados | Seguir `docs/operacao/instalacao-vm.md` na VM; levantar SO, RAM, root, saída para GitHub/GHCR |
| X-02 | Sem credencial de SMTP real | E-mail é validado contra o Mailpit (SMTP real de captura), não contra uma caixa externa | Informar `SMTP_*` no Secret |
| X-03 | Go não instalado na máquina de desenvolvimento | Nenhum: o serviço Go compila e testa em contêiner | — |

## Limitações assumidas (do plano aprovado)

- iOS não é entregue (build exige macOS).
- Banco local do app no navegador não é cifrado.
- Fusão de pessoas duplicadas não existe: só a sinalização.

## Resolvidos

| ID | Problema | Correção |
| --- | --- | --- |
| D-01 | Cluster k3s local não voltava após `parar` (IP do contêiner mudava) | Rede Docker própria com IP fixo em `deploy/scripts/cluster-local.sh` |
| D-02 | `ItemNav` de `packages/ui` recarregava a página ao navegar (apagava o token em memória) | O link delega o clique simples ao roteador do app |
| D-03 | Tabela rolável de `packages/ui` inalcançável por teclado (axe `scrollable-region-focusable`) | `role="region"`, rótulo e `tabIndex` |
| D-09 | Build do APK falhava no Gradle ("Unable to establish loopback connection") | Pasta temporária curta para os soquetes locais do Java |
| D-10 | Topo fixo do app sob a barra de status do Android | `padding-top: env(safe-area-inset-top)` em `.mf-app__topo` |
| D-11 | Retificação com dados corrigidos tirava o evento da passagem de caso (sinais vitais apareciam como "não registrado") | `calcularResumo` aplica os dados corrigidos sobre o evento original; teste novo |
