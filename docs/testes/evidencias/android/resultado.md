# LuckyPatcher no Android — execução

- Data: 2026-11-18T03:07:19.687Z
- Dispositivo: sdk_gphone16k_x86_64 (Android 17)
- Servidor: http://10.0.2.2:8088

| Verificação | Observado |
| --- | --- |
| Login e descida no Android | 14 medicamentos no SQLite nativo, igual a central (servidor http://10.0.2.2:8088) |
| Registro offline no Android | 4 operacoes na fila; 0 linhas na central |
| Persistencia apos matar o app | fila intacta (4), pessoa presente, seletor continua em Offline, sessao mantida sem novo login |
| Sincronizacao a partir do Android | 1 pessoa, 1 atendimento, 1 evento e 1 alergia na central; nova sincronizacao nao duplicou |
| Banco nativo | arquivos em databases/: medicalfieldSQLite.db — cifrado (sem cabecalho SQLite em claro) |
