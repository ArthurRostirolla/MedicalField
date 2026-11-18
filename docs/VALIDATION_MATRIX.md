# Matriz de validação prática

Situação de cada funcionalidade **no sistema rodando**. Código existir, compilar ou responder 200 não conta.

Legenda: `Não implementado` · `Implementado` (código existe, não exercitado) · `Testado` (testes automatizados do módulo passaram) · `Validado` (executado no sistema integrado, resultado observado e evidência registrada) · `Falhou` · `Bloqueio externo`.

Evidências: [VALIDATION_EVIDENCE.md](VALIDATION_EVIDENCE.md) · Defeitos: [KNOWN_ISSUES.md](KNOWN_ISSUES.md) · Andamento das tarefas: [acompanhamento.md](acompanhamento.md) (é o `IMPLEMENTATION_STATUS` do projeto).

Última atualização: backend integrado e validado em dev e no k3s local; portal e app em construção (onda 2).

## Roteiro acadêmico (17 passos)

| # | Passo | Como é executado | Esperado | Observado | Situação | Evidência |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Portal: autenticar | Login ADMIN no BradPitt | Entra no painel | — | Não implementado | — |
| 2 | Portal: listar cadastros | Tela Medicamentos | Lista do catálogo | — | Não implementado | — |
| 3 | Portal: listar prontuários | Tela Prontuários | Lista | — | Não implementado | — |
| 4 | Portal: listar atendimentos | Tela Atendimentos | Lista | — | Não implementado | — |
| 5 | Cliente: autenticar | Login no LuckyPatcher | Sessão local criada | — | Não implementado | — |
| 6 | Cliente: sincronizar (receber) | Botão Sincronizar | Cadastros no banco local | — | Não implementado | — |
| 7 | Cliente online: registrar atendimento | Seletor Online + novo atendimento | Selo "confirmado" | — | Não implementado | — |
| 8 | Portal: ver o atendimento | Recarregar a lista | Atendimento do passo 7 aparece | — | Não implementado | — |
| 9 | Inserir medicamentos pelo banco | `INSERT` via psql | Linha criada com `seq` | `seq` atribuído por trigger em inserção manual | Testado | E-001 |
| 10 | Portal: listar atendimentos | Recarregar | Sem mudança | — | Não implementado | — |
| 11 | Cliente: sincronizar (receber) | Botão Sincronizar | Medicamentos do passo 9 no cliente | — | Não implementado | — |
| 12 | Cliente offline: pessoa, prontuário, atendimento | Seletor Offline + registro completo | Gravado local; nenhuma requisição sai | — | Não implementado | — |
| 13 | Portal: registro offline não aparece | Recarregar | Ausente | — | Não implementado | — |
| 14 | Cliente online: sincronizar | Seletor Online | Outbox esvazia | — | Não implementado | — |
| 15 | Portal: registro aparece | Recarregar | Presente | — | Não implementado | — |
| 16 | Gerar a ficha em PDF | Botão no portal | PDF baixado | — | Não implementado | — |
| 17 | E-mail com a ficha anexada | Botão no portal | E-mail recebido com anexo | — | Não implementado | — |

## Offline-First (prioridade máxima)

| ID | O que precisa funcionar | Situação | Evidência |
| --- | --- | --- | --- |
| OF-01 | Abrir o app sem rede e ver dados já sincronizados | Não implementado | — |
| OF-02 | Registrar pessoa + prontuário + atendimento sem rede | Não implementado | — |
| OF-03 | Dados e pendências sobrevivem a fechar e reabrir o app | Não implementado | — |
| OF-04 | Seletor Offline realmente impede toda requisição (nenhuma chamada sai) | Não implementado | — |
| OF-05 | Ao voltar a rede, a sincronização sobe tudo na ordem | Não implementado | — |
| OF-06 | Banco central recebeu os registros (conferido por SQL) | Não implementado | — |
| OF-07 | Sincronizar de novo não duplica | Não implementado | — |
| OF-08 | Descida: medicamento inserido no banco chega ao cliente | Não implementado | — |
| OF-09 | Queda no meio da subida: progresso parcial preservado | Não implementado | — |
| OF-10 | Resposta perdida: reenvio devolve o resultado original | Não implementado | — |
| OF-11 | Operação rejeitada (4xx) vai para pendências e não trava as demais | Não implementado | — |
| OF-12 | Conflito cadastral: campo mais recente vence, anterior auditado | Não implementado | — |
| OF-13 | Alergia nunca some por cópia antiga | Não implementado | — |
| OF-14 | Pessoa duplicada é aceita e sinalizada | Não implementado | — |
| OF-15 | Logs gerados offline sobem por `POST /log` sem duplicar | Não implementado | — |

## Backend, segurança e auditoria

| ID | O que precisa funcionar | Situação | Evidência |
| --- | --- | --- | --- |
| BE-01 | Três serviços em três linguagens no ar e se falando | Validado | E-002, E-004 |
| BE-02 | Login por CRM / COREN / ID de socorrista | Validado (CRM e COREN; socorrista só no teste do agente) | E-002, E-004 |
| BE-03 | Toda rota sem token → 401 nos três serviços | Validado | E-004 |
| BE-04 | Token expirado → 401; papel insuficiente → 403 | Testado | E-003 |
| BE-05 | Log de acesso com os 7 campos em cada serviço | Validado | E-002, E-004 |
| BE-06 | IP do cliente correto atrás do gateway; cabeçalho forjado ignorado | Testado (forja só em teste unitário; gateway validado em E-004) | E-003, E-004 |
| BE-07 | Idempotência: mesmo POST 2× → um registro | Validado | E-002 |
| BE-08 | Rotas do enunciado respondem pelo gateway (coleção Postman) | Não implementado | — |
| BE-09 | PDF gerado, íntegro, com QR e passagem de caso | Validado (PDF de exemplo inspecionado; redesenho em andamento) | E-002 |
| BE-10 | E-mail com anexo entregue; falha → retentativa → recuperação | Validado (entrega); retentativa só Testado | E-002, E-003 |

## Front-end

| ID | O que precisa funcionar | Situação | Evidência |
| --- | --- | --- | --- |
| FE-01 | Design system revisado com Impeccable (registro real dos fluxos) | Testado (114 testes; capturas inspecionadas) | `packages/ui/IMPECCABLE.md` |
| FE-02 | Portal: todas as telas com estados de carregamento, vazio e erro | Não implementado | — |
| FE-03 | App: fluxo de campo em largura de celular, temas claro e escuro | Não implementado | — |
| FE-04 | Revisão visual Impeccable das telas renderizadas (portal e app) | Não implementado | — |
| FE-05 | Navegação por teclado e foco visível | Não implementado | — |
| FE-06 | App Android (Capacitor) | Não implementado | — |

## Kubernetes

| ID | O que precisa funcionar | Situação | Evidência |
| --- | --- | --- | --- |
| K8-01 | Imagens constroem (3 serviços + web + migrações) | Validado para 4 de 5 (falta `web`) | E-004 |
| K8-02 | Todos os pods `Ready` no k3s local | Validado para o backend (falta `web`) | E-004 |
| K8-03 | Gateway roteia para os serviços e para o web | Validado para os serviços (falta `web`) | E-004 |
| K8-04 | Roteiro de 17 passos contra o cluster | Não implementado | — |
| K8-05 | Dados sobrevivem a reinício de pod e a reimplantação | Validado (reinício); reimplantação pendente | E-004 |
| K8-06 | Serviços se recuperam sozinhos após `delete pod` | Validado (Postgres e DonaCida) | E-004 |
| K8-07 | NetworkPolicy bloqueia acesso indevido ao Postgres | Testado (relato do agente; repetir) | — |
| K8-08 | Backup e restauração | Testado (relato do agente; repetir) | — |
| K8-09 | Consumo de recursos dentro do orçamento | Não implementado | — |
| K8-10 | Argo CD sincroniza a partir do Git | Não implementado | — |
| K8-11 | Implantação na VM da Univates | Bloqueio externo | Sem acesso à VM nesta sessão |
| K8-12 | Acesso público HTTPS | Bloqueio externo | Depende da VM e da política de rede |
