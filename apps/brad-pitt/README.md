# @medicalfield/brad-pitt — portal administrativo

Portal web do MedicalField (o usuário vê "MedicalField"; BradPitt é o codinome). Somente leitura para dado clínico: consulta atendimentos, prontuários, cadastro de medicamentos e auditoria, gera a ficha em PDF e a envia por e-mail. Contrato das APIs: [`docs/contratos.md`](../../docs/contratos.md). Design system: [`@medicalfield/ui`](../../packages/ui/README.md). Uso do Impeccable: [`IMPECCABLE.md`](IMPECCABLE.md).

## Rodar

```bash
bash scripts/dev-servicos.sh subir            # backend real (da raiz do repositório)
npm run dev -w @medicalfield/brad-pitt        # http://localhost:5181/portal/
```

O Vite repete o roteamento do gateway (o prefixo não é removido): `/api/v1/auth`, `/log`, `/auditoria` → 8081; `/api/v1/documento` → 8083; o resto de `/api/v1` → 8082. Para apontar a outro lugar: `MF_MIKE_URL`, `MF_CIDA_URL`, `MF_JAIMINHO_URL`.

## Verificar

```bash
npm run typecheck -w @medicalfield/brad-pitt
npm test          -w @medicalfield/brad-pitt   # vitest + Testing Library, respostas simuladas
npm run build     -w @medicalfield/brad-pitt
MF_SENHA_DEMO='<senha de demonstração>' npm run e2e -w @medicalfield/brad-pitt   # Playwright, backend REAL
```

O E2E sobe o Vite sozinho (e reaproveita um que já esteja no ar), usa o Chrome instalado (`CANAL=msedge` para o Edge), cria três atendimentos fictícios de ids fixos (idempotente) e confere o e-mail pela API do Mailpit. A senha está em `services/mike-baguncinha/README.md` e só entra por variável de ambiente. `e2e/capturas.spec.ts` regrava `capturas/` e falha com violação de acessibilidade (axe), erro no console ou rolagem horizontal.

## Organização

```
src/
  api/cliente.ts      cliente HTTP único: valida com zod, erro padrão → ErroApi, refresh em 401 (uma vez)
  api/recursos.ts     uma função tipada por rota usada
  sessao/             estado da sessão, guardas de rota (RequerSessao, RequerAdmin), tela de login
  casca/              índice lateral, tema, sair
  comum/              lista paginada por cursor, campos de leitura, avisos, formatação
  atendimentos/       livro + ficha (passagem de caso, PDF e envios, linha do tempo)
  prontuarios/        lista + pessoa (dados, itens, atendimentos dela)
  medicamentos/       cadastro de apoio com busca local
  auditoria/          logs de acesso e possíveis duplicatas (só ADMIN)
  documentos/         verificação de documento (destino do QR do PDF)
e2e/                  Playwright contra o backend real
capturas/             telas renderizadas (1440/390 px, claro/escuro)
```

## Sessão

O access token vive só em memória. Ao recarregar, o portal troca o cookie `mf_refresh` (HttpOnly) por uma sessão nova antes de decidir mandar para o login; o login devolve para a URL pedida (é assim que o QR do PDF funciona). Como o cookie é invisível ao JavaScript, uma marca sem segredo em `localStorage` (`mf-portal-sessao`) diz se vale tentar o refresh. Sair revoga o refresh no servidor e esvazia o cache de consultas.

## Limitações

- A API não devolve totais: a paginação mostra página e quantidade na tela, sem "de N".
- A lista de atendimentos não traz a triagem (a rota não devolve); ela aparece na ficha.
- Auditoria e documentos devolvem só o **id** do profissional. Os nomes vêm de quem o portal já conhece (o logado e quem abriu atendimentos); os demais aparecem pelo começo do id.
- Medicamentos: a busca é local sobre o cadastro inteiro, com teto de 2.000 itens (comentário `ponytail:` em `api/recursos.ts`).
- Sem divisão de código por rota (um pacote de 144 kB gzip).
