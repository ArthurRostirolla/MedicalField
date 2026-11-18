# Problemas conhecidos

Severidade: `Crítica` (impede o roteiro acadêmico ou perde dado) · `Alta` (requisito obrigatório falha) · `Média` · `Baixa`.

## Abertos

Nenhum registrado ainda (onda 1 em andamento, nada integrado).

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

Nenhum ainda.
