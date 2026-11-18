package httpapi_test

// Testes de integração contra um Postgres real. Rodam quando DATABASE_URL_TESTE aponta
// para um banco já migrado (veja o README); sem a variável, são pulados.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"medicalfield/mike-baguncinha/internal/aplicacao"
	"medicalfield/mike-baguncinha/internal/dominio"
	httpapi "medicalfield/mike-baguncinha/internal/http"
	"medicalfield/mike-baguncinha/internal/infra"
)

const senhaTeste = "senha-so-dos-testes"

type ambiente struct {
	t        *testing.T
	url      string
	pool     *pgxpool.Pool
	banco    *infra.Postgres
	gravador *infra.GravadorAcesso
}

func novoAmbiente(t *testing.T) *ambiente {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL_TESTE")
	if dsn == "" {
		t.Skip("DATABASE_URL_TESTE não definida")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := pool.Ping(context.Background()); err != nil {
		t.Fatalf("banco de teste inacessível: %v", err)
	}
	log := slog.New(slog.NewJSONHandler(io.Discard, nil))
	banco := &infra.Postgres{Pool: pool}
	tokens, _ := infra.NovosTokens("")
	gravador := infra.NovoGravadorAcesso(banco, log)
	api := &httpapi.API{
		Autenticacao: &aplicacao.AutenticacaoUseCase{
			Profissionais: banco, Sessoes: banco, Senhas: infra.Argon2id{}, Tokens: tokens,
			Limitador:      aplicacao.NovoLimitadorTentativas(5, 15*time.Minute),
			LimitadorConta: aplicacao.NovoLimitadorTentativas(20, 15*time.Minute),
			Vagas:          make(chan struct{}, 2), EsperaVaga: 3 * time.Second,
			HashFalso: infra.GerarHashSenha("falso"), GerarHash: infra.GerarHashSenha, Agora: time.Now,
		},
		Auditoria:    &aplicacao.AuditoriaUseCase{Repositorio: banco},
		ValidarToken: tokens.Validar, RegistrarAcesso: gravador.Registrar, SaidaAcesso: io.Discard,
		Proxies: nil, Log: log,
	}
	servidor := httptest.NewServer(api.Handler())
	t.Cleanup(func() { servidor.Close(); pool.Close() })
	return &ambiente{t: t, url: servidor.URL, pool: pool, banco: banco, gravador: gravador}
}

// criarProfissional insere um profissional com registro único e devolve id e registro.
func (a *ambiente) criarProfissional(papel string) (id, registro string) {
	a.t.Helper()
	registro = "T" + strings.ReplaceAll(dominio.NovoUUID(), "-", "")[:12]
	err := a.pool.QueryRow(context.Background(), `
		INSERT INTO identidade.profissional (tipo_registro, registro, uf, nome, papel, senha_hash)
		VALUES ('CRM', $1, 'RS', 'Profissional de Teste', $2, $3) RETURNING id::text`,
		registro, papel, infra.GerarHashSenha(senhaTeste)).Scan(&id)
	if err != nil {
		a.t.Fatal(err)
	}
	return id, registro
}

type resposta struct {
	status  int
	corpo   map[string]any
	cookies []*http.Cookie
	header  http.Header
}

func (a *ambiente) chamar(metodo, caminho, token string, corpo any, cabecalhos ...string) resposta {
	a.t.Helper()
	var leitor io.Reader
	if corpo != nil {
		bruto, _ := json.Marshal(corpo)
		leitor = bytes.NewReader(bruto)
	}
	req, _ := http.NewRequest(metodo, a.url+caminho, leitor)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	for i := 0; i+1 < len(cabecalhos); i += 2 {
		req.Header.Set(cabecalhos[i], cabecalhos[i+1])
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		a.t.Fatal(err)
	}
	defer res.Body.Close()
	r := resposta{status: res.StatusCode, cookies: res.Cookies(), header: res.Header}
	_ = json.NewDecoder(res.Body).Decode(&r.corpo)
	return r
}

func (a *ambiente) login(registro, senha string) resposta {
	return a.chamar("POST", "/api/v1/auth/login", "", map[string]string{"tipoRegistro": "CRM", "registro": registro, "uf": "rs", "senha": senha})
}

func (r resposta) exigir(t *testing.T, status int, codigo string) {
	t.Helper()
	if r.status != status || (codigo != "" && r.corpo["codigo"] != codigo) {
		t.Fatalf("esperado %d %s, obtido %d %v", status, codigo, r.status, r.corpo)
	}
	if codigo != "" && (r.corpo["requestId"] == "" || r.corpo["mensagem"] == "" || r.corpo["requestId"] != r.header.Get("X-Request-Id")) {
		t.Fatalf("corpo de erro fora do contrato: %v", r.corpo)
	}
}

func TestFluxoLoginMeRefreshLogout(t *testing.T) {
	a := novoAmbiente(t)
	id, registro := a.criarProfissional(dominio.PapelProfissional)

	sessao := a.login(registro, senhaTeste)
	sessao.exigir(t, 200, "")
	access, refresh := sessao.corpo["accessToken"].(string), sessao.corpo["refreshToken"].(string)
	profissional := sessao.corpo["profissional"].(map[string]any)
	if access == "" || refresh == "" || sessao.corpo["expiraEm"] != float64(900) || profissional["id"] != id ||
		profissional["registro"] != registro || profissional["papel"] != "PROFISSIONAL" || profissional["uf"] != "RS" {
		t.Fatalf("Sessao fora do contrato: %v", sessao.corpo)
	}
	if _, vazou := profissional["senhaHash"]; vazou || len(profissional) != 6 {
		t.Fatalf("Profissional com campos a mais: %v", profissional)
	}
	if len(sessao.cookies) != 1 {
		t.Fatalf("esperado 1 cookie, obtido %d", len(sessao.cookies))
	}
	cookie := sessao.cookies[0]
	if cookie.Name != "mf_refresh" || cookie.Value != refresh || !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode || cookie.Path != "/api/v1/auth" {
		t.Fatalf("cookie fora do contrato: %+v", cookie)
	}

	// Só o hash do refresh token vai para o banco.
	var guardados int
	_ = a.pool.QueryRow(context.Background(), `SELECT count(*) FROM identidade.sessao WHERE refresh_hash = $1`, refresh).Scan(&guardados)
	if guardados != 0 {
		t.Fatal("o refresh token foi guardado em claro")
	}
	_ = a.pool.QueryRow(context.Background(), `SELECT count(*) FROM identidade.sessao WHERE refresh_hash = $1`, aplicacao.HashRefresh(refresh)).Scan(&guardados)
	if guardados != 1 {
		t.Fatal("o hash sha256 do refresh token deveria estar em identidade.sessao")
	}

	me := a.chamar("GET", "/api/v1/auth/me", access, nil)
	me.exigir(t, 200, "")
	if me.corpo["id"] != id || me.corpo["nome"] != "Profissional de Teste" || me.corpo["tipoRegistro"] != "CRM" {
		t.Fatalf("me inesperado: %v", me.corpo)
	}

	// Refresh pelo corpo: rotaciona.
	renovada := a.chamar("POST", "/api/v1/auth/refresh", "", map[string]string{"refreshToken": refresh})
	renovada.exigir(t, 200, "")
	refresh2 := renovada.corpo["refreshToken"].(string)
	if refresh2 == refresh || renovada.corpo["accessToken"] == "" {
		t.Fatal("o refresh deveria ser rotacionado")
	}
	a.chamar("GET", "/api/v1/auth/me", renovada.corpo["accessToken"].(string), nil).exigir(t, 200, "")

	// Refresh pelo cookie (sem corpo).
	peloCookie := a.chamar("POST", "/api/v1/auth/refresh", "", nil, "Cookie", "mf_refresh="+refresh2)
	peloCookie.exigir(t, 200, "")
	refresh3 := peloCookie.corpo["refreshToken"].(string)

	// Logout revoga a sessão e limpa o cookie.
	saida := a.chamar("POST", "/api/v1/auth/logout", access, map[string]string{"refreshToken": refresh3})
	if saida.status != 204 || len(saida.cookies) != 1 || saida.cookies[0].MaxAge >= 0 {
		t.Fatalf("logout inesperado: %d %+v", saida.status, saida.cookies)
	}
	a.chamar("POST", "/api/v1/auth/refresh", "", map[string]string{"refreshToken": refresh3}).exigir(t, 401, "NAO_AUTENTICADO")
}

func TestLoginRecusadoELimiteDeTentativas(t *testing.T) {
	a := novoAmbiente(t)
	_, registro := a.criarProfissional(dominio.PapelProfissional)

	// Registro inexistente e senha errada respondem igual (não revela se o registro existe).
	inexistente := a.login("NAOEXISTE"+registro, "qualquer")
	inexistente.exigir(t, 401, "CREDENCIAIS_INVALIDAS")
	errada := a.login(registro, "errada")
	errada.exigir(t, 401, "CREDENCIAIS_INVALIDAS")
	if inexistente.corpo["mensagem"] != errada.corpo["mensagem"] {
		t.Fatal("as mensagens de login recusado deveriam ser idênticas")
	}

	a.chamar("POST", "/api/v1/auth/login", "", map[string]string{"tipoRegistro": "XYZ", "registro": "", "senha": ""}).exigir(t, 422, "VALIDACAO")

	// Já houve 1 falha; da 2ª à 5ª ainda é 401, a partir daí 429 — mesmo com a senha certa.
	for range 4 {
		a.login(registro, "errada").exigir(t, 401, "CREDENCIAIS_INVALIDAS")
	}
	a.login(registro, "errada").exigir(t, 429, "MUITAS_TENTATIVAS")
	a.login(registro, senhaTeste).exigir(t, 429, "MUITAS_TENTATIVAS")

	// Outro registro, no mesmo IP, não é afetado.
	_, outro := a.criarProfissional(dominio.PapelProfissional)
	a.login(outro, senhaTeste).exigir(t, 200, "")
}

func TestLogDoClienteIdempotente(t *testing.T) {
	a := novoAmbiente(t)
	id, registro := a.criarProfissional(dominio.PapelProfissional)
	token := a.login(registro, senhaTeste).corpo["accessToken"].(string)
	dispositivo := dominio.NovoUUID()

	logs := []map[string]any{
		{"id": dominio.NovoUUID(), "ocorridoEm": "2026-11-17T21:00:00.000Z", "acao": "ATENDIMENTO_CRIADO", "entidade": "atendimento",
			"entidadeId": dominio.NovoUUID(), "resultado": "SUCESSO", "estavaOnline": false, "detalhe": map[string]any{"tentativa": 1}},
		{"id": dominio.NovoUUID(), "ocorridoEm": "2026-11-17T21:01:00.000Z", "acao": "SYNC", "resultado": "FALHA", "estavaOnline": true},
	}
	enviar := func(lote any) resposta {
		return a.chamar("POST", "/api/v1/log", token, map[string]any{"logs": lote}, "X-Dispositivo-Id", dispositivo)
	}

	primeira := enviar(logs)
	primeira.exigir(t, 200, "")
	if primeira.corpo["aceitos"] != float64(2) || primeira.corpo["duplicados"] != float64(0) {
		t.Fatalf("primeiro envio: %v", primeira.corpo)
	}
	segunda := enviar(logs)
	if segunda.corpo["aceitos"] != float64(0) || segunda.corpo["duplicados"] != float64(2) {
		t.Fatalf("reenvio: %v", segunda.corpo)
	}
	var gravados int
	var dispositivoGravado string
	_ = a.pool.QueryRow(context.Background(),
		`SELECT count(*), min(dispositivo_id::text) FROM auditoria.log_cliente WHERE profissional_id = $1::text::uuid`, id).Scan(&gravados, &dispositivoGravado)
	if gravados != 2 || dispositivoGravado != dispositivo {
		t.Fatalf("esperado 2 linhas do dispositivo %s, obtido %d (%s)", dispositivo, gravados, dispositivoGravado)
	}

	// Limites por campo (os de packages/contratos): textos de até 100, detalhe de até 8 KiB.
	valido := func() map[string]any {
		return map[string]any{"id": dominio.NovoUUID(), "ocorridoEm": "2026-11-17T21:00:00Z", "acao": "X", "resultado": "SUCESSO", "estavaOnline": true}
	}
	for campo, valor := range map[string]any{
		"acao": strings.Repeat("a", 101), "entidade": strings.Repeat("e", 101), "entidadeId": strings.Repeat("i", 101),
		"detalhe": map[string]any{"texto": strings.Repeat("d", 9000)},
	} {
		log := valido()
		log[campo] = valor
		recusado := enviar([]map[string]any{log})
		recusado.exigir(t, 422, "VALIDACAO")
		if detalhes := fmt.Sprint(recusado.corpo["detalhes"]); !strings.Contains(detalhes, "logs[0]."+campo) {
			t.Fatalf("%s acima do limite deveria ser apontado: %s", campo, detalhes)
		}
	}
	comCampoExtra := valido()
	comCampoExtra["inventado"] = 1
	enviar([]map[string]any{comCampoExtra}).exigir(t, 422, "VALIDACAO")

	// Validação: campo inválido e lote acima de 500.
	enviar([]map[string]any{{"id": "nao-e-uuid", "ocorridoEm": "ontem", "acao": "", "resultado": "TALVEZ"}}).exigir(t, 422, "VALIDACAO")
	grande := make([]map[string]any, 501)
	for i := range grande {
		grande[i] = map[string]any{"id": dominio.NovoUUID(), "ocorridoEm": "2026-11-17T21:00:00Z", "acao": "X", "resultado": "SUCESSO", "estavaOnline": true}
	}
	enviar(grande).exigir(t, 422, "VALIDACAO")
	_ = a.pool.QueryRow(context.Background(), `SELECT count(*) FROM auditoria.log_cliente WHERE profissional_id = $1::text::uuid`, id).Scan(&gravados)
	if gravados != 2 {
		t.Fatalf("lote recusado não pode gravar nada; há %d linhas", gravados)
	}
}

func TestAuditoriaSoAdminEPaginacao(t *testing.T) {
	a := novoAmbiente(t)
	idComum, registroComum := a.criarProfissional(dominio.PapelProfissional)
	_, registroAdmin := a.criarProfissional(dominio.PapelAdmin)
	comum := a.login(registroComum, senhaTeste).corpo["accessToken"].(string)
	admin := a.login(registroAdmin, senhaTeste).corpo["accessToken"].(string)

	for _, rota := range []string{"/api/v1/auditoria/acesso", "/api/v1/auditoria/cliente"} {
		a.chamar("GET", rota, comum, nil).exigir(t, 403, "SEM_PERMISSAO")
		a.chamar("GET", rota, admin, nil).exigir(t, 200, "")
	}

	// Três logs do profissional comum, lidos pelo ADMIN em páginas de 2.
	var logs []map[string]any
	for i := range 3 {
		logs = append(logs, map[string]any{"id": dominio.NovoUUID(), "ocorridoEm": fmt.Sprintf("2026-11-17T21:0%d:00.000Z", i),
			"acao": fmt.Sprintf("ACAO_%d", i), "resultado": "SUCESSO", "estavaOnline": true, "detalhe": map[string]any{"n": i}})
	}
	a.chamar("POST", "/api/v1/log", comum, map[string]any{"logs": logs}).exigir(t, 200, "")

	base := "/api/v1/auditoria/cliente?limite=2&profissionalId=" + idComum
	pagina1 := a.chamar("GET", base, admin, nil)
	itens1 := pagina1.corpo["itens"].([]any)
	cursor, _ := pagina1.corpo["proximoCursor"].(string)
	if len(itens1) != 2 || cursor == "" {
		t.Fatalf("página 1 inesperada: %v", pagina1.corpo)
	}
	primeiro := itens1[0].(map[string]any)
	if primeiro["acao"] != "ACAO_2" || primeiro["ocorridoEm"] != "2026-11-17T21:02:00.000Z" || primeiro["profissionalId"] != idComum ||
		primeiro["dispositivoId"] != nil || primeiro["recebidoEm"] == "" || primeiro["detalhe"].(map[string]any)["n"] != float64(2) {
		t.Fatalf("LogClienteSaida fora do contrato (ou fora de ordem): %v", primeiro)
	}
	pagina2 := a.chamar("GET", base+"&cursor="+cursor, admin, nil)
	itens2 := pagina2.corpo["itens"].([]any)
	if len(itens2) != 1 || itens2[0].(map[string]any)["acao"] != "ACAO_0" || pagina2.corpo["proximoCursor"] != nil {
		t.Fatalf("página 2 inesperada: %v", pagina2.corpo)
	}

	// Filtro por período e parâmetros inválidos.
	periodo := a.chamar("GET", base+"&de=2026-11-17T21:01:00Z&ate=2026-11-17T21:01:30Z", admin, nil)
	if itens := periodo.corpo["itens"].([]any); len(itens) != 1 || itens[0].(map[string]any)["acao"] != "ACAO_1" {
		t.Fatalf("filtro de período inesperado: %v", periodo.corpo)
	}
	a.chamar("GET", "/api/v1/auditoria/acesso?limite=abc&cursor=!!&de=ontem&profissionalId=x", admin, nil).exigir(t, 422, "VALIDACAO")

	// Log de acesso: as requisições do profissional comum aparecem para o ADMIN, mais recentes primeiro.
	a.gravador.Fechar()
	acessos := a.chamar("GET", "/api/v1/auditoria/acesso?limite=2&servico=mike-baguncinha&profissionalId="+idComum, admin, nil)
	itens := acessos.corpo["itens"].([]any)
	if len(itens) != 2 || acessos.corpo["proximoCursor"] == nil {
		t.Fatalf("log de acesso inesperado: %v", acessos.corpo)
	}
	ultimo := itens[0].(map[string]any)
	if ultimo["rota"] != "/api/v1/log" || ultimo["metodo"] != "POST" || ultimo["statusCode"] != float64(200) || ultimo["profissionalId"] != idComum ||
		ultimo["id"] == "" || ultimo["requestId"] == "" || ultimo["ipCliente"] != "127.0.0.1" {
		t.Fatalf("LogAcesso fora do contrato: %v", ultimo)
	}
	seguinte := a.chamar("GET", "/api/v1/auditoria/acesso?limite=2&profissionalId="+idComum+"&cursor="+acessos.corpo["proximoCursor"].(string), admin, nil)
	if outros := seguinte.corpo["itens"].([]any); len(outros) == 0 || outros[0].(map[string]any)["id"] == itens[1].(map[string]any)["id"] {
		t.Fatalf("a 2ª página do log de acesso deveria continuar depois da 1ª: %v", seguinte.corpo)
	}
}

func TestCadastroDeProfissionalSoAdmin(t *testing.T) {
	a := novoAmbiente(t)
	_, registroComum := a.criarProfissional(dominio.PapelProfissional)
	_, registroAdmin := a.criarProfissional(dominio.PapelAdmin)
	comum := a.login(registroComum, senhaTeste).corpo["accessToken"].(string)
	admin := a.login(registroAdmin, senhaTeste).corpo["accessToken"].(string)

	registro := "N" + strings.ReplaceAll(dominio.NovoUUID(), "-", "")[:12]
	novo := map[string]string{"nome": "Enf. Nova", "tipoRegistro": "COREN", "registro": registro, "uf": "sc", "papel": "PROFISSIONAL", "senha": "senha-nova-123"}
	a.chamar("POST", "/api/v1/auth/profissional", comum, novo).exigir(t, 403, "SEM_PERMISSAO")
	criado := a.chamar("POST", "/api/v1/auth/profissional", admin, novo)
	criado.exigir(t, 201, "")
	if criado.corpo["uf"] != "SC" || criado.corpo["papel"] != "PROFISSIONAL" || criado.corpo["id"] == "" {
		t.Fatalf("profissional criado fora do contrato: %v", criado.corpo)
	}
	a.chamar("POST", "/api/v1/auth/profissional", admin, novo).exigir(t, 422, "VALIDACAO") // registro repetido
	a.chamar("POST", "/api/v1/auth/profissional", admin, map[string]string{"tipoRegistro": "CRM", "senha": "curta"}).exigir(t, 422, "VALIDACAO")

	// O cadastrado entra com a senha definida pelo ADMIN.
	entrada := a.chamar("POST", "/api/v1/auth/login", "", map[string]string{"tipoRegistro": "COREN", "registro": registro, "uf": "SC", "senha": "senha-nova-123"})
	entrada.exigir(t, 200, "")
}

func TestTodaRotaSemTokenResponde401(t *testing.T) {
	a := novoAmbiente(t)
	rotas := [][2]string{
		{"POST", "/api/v1/auth/refresh"}, {"POST", "/api/v1/auth/logout"}, {"GET", "/api/v1/auth/me"}, {"POST", "/api/v1/log"},
		{"GET", "/api/v1/auditoria/acesso"}, {"GET", "/api/v1/auditoria/cliente"}, {"POST", "/api/v1/auth/profissional"},
		{"GET", "/api/v1/nao-existe"}, {"GET", "/api/v1/auth/login"}, {"DELETE", "/api/v1/log"},
	}
	for _, rota := range rotas {
		a.chamar(rota[0], rota[1], "", nil).exigir(t, 401, "NAO_AUTENTICADO")
		a.chamar(rota[0], rota[1], "token.invalido.aqui", nil).exigir(t, 401, "NAO_AUTENTICADO")
	}
	// Com token, rota desconhecida é 404.
	_, registro := a.criarProfissional(dominio.PapelProfissional)
	token := a.login(registro, senhaTeste).corpo["accessToken"].(string)
	a.chamar("GET", "/api/v1/nao-existe", token, nil).exigir(t, 404, "NAO_ENCONTRADO")
}

func TestRequisicaoGeraLinhaCompletaNoLogDeAcesso(t *testing.T) {
	a := novoAmbiente(t)
	id, registro := a.criarProfissional(dominio.PapelProfissional)
	token := a.login(registro, senhaTeste).corpo["accessToken"].(string)

	autenticada, anonima := "teste-"+dominio.NovoUUID(), "teste-"+dominio.NovoUUID()
	antes := time.Now().Add(-time.Second)
	// O X-Forwarded-For vem de um par não confiável (não há proxies configurados): deve ser ignorado.
	me := a.chamar("GET", "/api/v1/auth/me?x=1", token, nil, "X-Request-Id", autenticada, "X-Forwarded-For", "1.2.3.4")
	if me.header.Get("X-Request-Id") != autenticada {
		t.Fatal("o X-Request-Id recebido deveria voltar na resposta")
	}
	a.chamar("GET", "/api/v1/auth/me", "", nil, "X-Request-Id", anonima).exigir(t, 401, "NAO_AUTENTICADO")
	desconhecida := "teste-" + dominio.NovoUUID()
	a.chamar("GET", "/api/v1/caminho/que/nao/existe/123", token, nil, "X-Request-Id", desconhecida).exigir(t, 404, "NAO_ENCONTRADO")
	a.gravador.Fechar() // descarrega o buffer, como no encerramento do processo

	var (
		dataHora                    time.Time
		servico, ip, metodo, rota   string
		profissional                *string
		status, tempoMs, quantidade int
	)
	consulta := `SELECT data_hora, servico, ip_cliente, profissional_id::text, metodo, rota, status_code, tempo_ms, count(*) OVER ()
	               FROM auditoria.log_acesso WHERE request_id = $1`
	if err := a.pool.QueryRow(context.Background(), consulta, autenticada).Scan(&dataHora, &servico, &ip, &profissional, &metodo, &rota, &status, &tempoMs, &quantidade); err != nil {
		t.Fatalf("linha do log de acesso não encontrada: %v", err)
	}
	if quantidade != 1 || servico != "mike-baguncinha" || ip != "127.0.0.1" || profissional == nil || *profissional != id || metodo != "GET" ||
		rota != "/api/v1/auth/me" || status != 200 || tempoMs < 0 || dataHora.Before(antes) || dataHora.After(time.Now().Add(time.Second)) {
		t.Fatalf("linha incompleta: %v %s %s %v %s %s %d %d (x%d)", dataHora, servico, ip, profissional, metodo, rota, status, tempoMs, quantidade)
	}

	// O 401 também é registrado, com profissional nulo.
	if err := a.pool.QueryRow(context.Background(), consulta, anonima).Scan(&dataHora, &servico, &ip, &profissional, &metodo, &rota, &status, &tempoMs, &quantidade); err != nil {
		t.Fatalf("linha do 401 não encontrada: %v", err)
	}
	if profissional != nil || status != 401 || rota != "/api/v1/auth/me" {
		t.Fatalf("linha do 401 inesperada: %v %d %s", profissional, status, rota)
	}

	// D-QA-18: rota desconhecida entra no banco com o nome único, sem o caminho pedido.
	if err := a.pool.QueryRow(context.Background(), consulta, desconhecida).Scan(&dataHora, &servico, &ip, &profissional, &metodo, &rota, &status, &tempoMs, &quantidade); err != nil {
		t.Fatalf("linha da rota desconhecida não encontrada: %v", err)
	}
	if rota != "(rota desconhecida)" || status != 404 {
		t.Fatalf("rota desconhecida registrada como %q (%d)", rota, status)
	}
}

// D-QA-09: reapresentar um refresh já rotacionado é tratado como roubo — caem todas as
// sessões ativas do profissional, inclusive a que nasceu da rotação e as de outros aparelhos.
func TestReusoDeRefreshRevogaTodasAsSessoes(t *testing.T) {
	a := novoAmbiente(t)
	_, registro := a.criarProfissional(dominio.PapelProfissional)
	_, registroVizinho := a.criarProfissional(dominio.PapelProfissional)
	renovar := func(refresh string) resposta {
		return a.chamar("POST", "/api/v1/auth/refresh", "", map[string]string{"refreshToken": refresh})
	}

	r1 := a.login(registro, senhaTeste).corpo["refreshToken"].(string)
	outroAparelho := a.login(registro, senhaTeste).corpo["refreshToken"].(string)
	vizinho := a.login(registroVizinho, senhaTeste).corpo["refreshToken"].(string)

	primeira := renovar(r1)
	primeira.exigir(t, 200, "")
	r2 := primeira.corpo["refreshToken"].(string)

	renovar(r1).exigir(t, 401, "NAO_AUTENTICADO") // reuso: dispara a revogação
	renovar(r2).exigir(t, 401, "NAO_AUTENTICADO") // a sessão nascida da rotação caiu
	renovar(outroAparelho).exigir(t, 401, "NAO_AUTENTICADO")

	// Outro profissional não é afetado, token desconhecido não revoga nada, e a vítima entra de novo.
	renovar("token-que-nunca-existiu").exigir(t, 401, "NAO_AUTENTICADO")
	renovar(vizinho).exigir(t, 200, "")
	nova := a.login(registro, senhaTeste)
	nova.exigir(t, 200, "")
	renovar(nova.corpo["refreshToken"].(string)).exigir(t, 200, "")
}

// D-QA-03: a carga de demonstração só existe em banco que declara medicalfield.dados_demo = 'on'.
// Rode a suíte contra um banco com o parâmetro e outro sem (veja o README).
func TestCargaDeDemonstracaoSoComParametroLigado(t *testing.T) {
	a := novoAmbiente(t)
	var parametro string
	if err := a.pool.QueryRow(context.Background(), `SELECT coalesce(current_setting('medicalfield.dados_demo', true), '')`).Scan(&parametro); err != nil {
		t.Fatal(err)
	}
	esperado := 0
	if parametro == "on" {
		esperado = len(dominio.IDsDemonstracao)
	}
	obtido, err := a.banco.ContarDemonstracao(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if obtido != esperado {
		t.Fatalf("medicalfield.dados_demo=%q: esperado %d profissionais de demonstração, há %d", parametro, esperado, obtido)
	}
	t.Logf("medicalfield.dados_demo=%q -> %d profissionais de demonstração", parametro, obtido)
}

// D-QA-21: sessões vencidas são expurgadas; as vigentes ficam.
func TestExpurgoDeSessoesVencidas(t *testing.T) {
	a := novoAmbiente(t)
	id, registro := a.criarProfissional(dominio.PapelProfissional)
	vigente := a.login(registro, senhaTeste).corpo["refreshToken"].(string)
	if _, err := a.pool.Exec(context.Background(), `
		INSERT INTO identidade.sessao (profissional_id, refresh_hash, expira_em)
		VALUES ($1::text::uuid, $2, now() - interval '1 minute')`, id, "vencida-"+dominio.NovoUUID()); err != nil {
		t.Fatal(err)
	}
	apagadas, err := a.banco.ExpurgarSessoes(context.Background())
	if err != nil || apagadas < 1 {
		t.Fatalf("esperado ao menos 1 sessão expurgada: %d, %v", apagadas, err)
	}
	var restantes, vencidas int
	_ = a.pool.QueryRow(context.Background(),
		`SELECT count(*), count(*) FILTER (WHERE expira_em < now()) FROM identidade.sessao WHERE profissional_id = $1::text::uuid`, id).Scan(&restantes, &vencidas)
	if restantes != 1 || vencidas != 0 {
		t.Fatalf("esperado só a sessão vigente; há %d (%d vencidas)", restantes, vencidas)
	}
	a.chamar("POST", "/api/v1/auth/refresh", "", map[string]string{"refreshToken": vigente}).exigir(t, 200, "")
}
