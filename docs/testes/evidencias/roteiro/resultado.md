# Roteiro de 17 passos — execução automatizada

- Alvo: `vm` em `https://177-44-248-60.sslip.io`
- Data: 2026-11-18T14:56:29.397Z
- Passos concluídos: 17 de 17

| # | Passo | Observado | Captura |
| --- | --- | --- | --- |
| 1 | Portal: Autenticar | Login da Dra. Helena Prado (CRM 100001/RS, ADMIN) aceito; painel aberto | passo-01.png |
| 2 | Portal: Listar cadastros | Catálogo de medicamentos listado (12 ativos no banco) | passo-02.png |
| 3 | Portal: Listar prontuários | Prontuários listados (3 no banco) | passo-03.png |
| 4 | Portal: Listar atendimentos | Livro de atendimentos listado (0 no banco) | passo-04.png |
| 5 | Cliente: Autenticar | Login do Enf. Caio Brandão (COREN 200002) aceito; sessão local criada | passo-05.png |
| 6 | Cliente: Sincronizar dados a partir do Portal (receber dados) | Banco local recebeu 12 medicamentos e 3 pessoas (iguais aos do banco central) | passo-06.png |
| 7 | Cliente: Online - Registrar um atendimento | Atendimento com sinais vitais, Glasgow e triagem registrado; selo "Tudo enviado"; 1 linha no banco central | passo-07.png |
| 8 | Portal: Listar atendimentos - visualizar atendimento registrado | Atendimento "Roteiro online MWM8U7WE" aparece no livro do portal | passo-08.png |
| 9 | Portal: Inserir novos medicamentos via Banco de Dados | INSERT direto no Postgres criou "Medicamento Roteiro MWM8U7WE" com seq 25 (atribuído pelo trigger); aparece no portal | passo-09.png |
| 10 | Portal: Listar atendimentos | Livro inalterado: 1 atendimentos (o do passo 7 a mais) | passo-10.png |
| 11 | Cliente: Sincronizar dados a partir do Portal (receber dados) | Medicamento inserido no passo 9 chegou ao banco local do cliente | passo-11.png |
| 12 | Cliente: Offline - Registrar ocorrência (pessoa, prontuário, atendimento) | Pessoa, prontuário (com alergia), atendimento e 4 eventos gravados localmente; 7 operações na fila após recarregar o app; nenhuma requisição /api emitida | passo-12.png |
| 13 | Portal: Listar prontuários e atendimentos: cadastro novo não deve ser exibido | Portal não mostra a pessoa nem o atendimento; 0 linhas no banco central | passo-13.png |
| 14 | Cliente: Online - Sincronizar dados para o Portal | Fila esvaziou ao voltar a rede (9 operações registradas em operacao_sync); após mais duas sincronizações: 1 pessoa, 1 prontuário, 1 item, 1 atendimento, 4 eventos — sem duplicata | passo-14.png |
| 15 | Portal: Listar prontuários e atendimentos: cadastro novo deve ser exibido | Pessoa e atendimento criados offline agora aparecem no portal | passo-15.png |
| 16 | Demonstrar geração da Ficha de atendimento | PDF gerado e baixado (ficha-MF-46H3-DFX6.pdf, 46722 bytes, íntegro); salvo em ficha-do-roteiro.pdf | passo-16.png |
| 17 | Demonstrar e-mail enviado com Ficha de atendimento em anexo | Envio para familiar.mwm8u7we@exemplo.test chegou a "Enviado"; o servidor de e-mail (Mailpit) recebeu a mensagem com o anexo ficha-MF-46H3-DFX6.pdf | passo-17.png |
