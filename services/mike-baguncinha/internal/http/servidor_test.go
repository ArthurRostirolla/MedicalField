package httpapi

import (
	"bufio"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"medicalfield/mike-baguncinha/internal/dominio"
)

// apiSemBanco serve para o que é decidido antes de qualquer caso de uso (validação, limites).
func apiSemBanco(t *testing.T) (*httptest.Server, chan dominio.LogAcesso) {
	t.Helper()
	acessos := make(chan dominio.LogAcesso, 16)
	api := &API{
		ValidarToken:    func(string) (dominio.Profissional, error) { return dominio.Profissional{}, dominio.ErrNaoAutenticado },
		RegistrarAcesso: func(l dominio.LogAcesso) { acessos <- l },
		SaidaAcesso:     io.Discard, Log: slog.New(slog.NewJSONHandler(io.Discard, nil)),
	}
	servidor := httptest.NewServer(api.Handler())
	t.Cleanup(servidor.Close)
	return servidor, acessos
}

// D-QA-18: o que não casa com rota nenhuma sai no log sempre com o mesmo nome.
func TestRotaDesconhecidaTemNomeUnico(t *testing.T) {
	for padrao, esperado := range map[string]string{
		"GET /api/v1/auth/me": "/api/v1/auth/me", "POST /api/v1/log": "/api/v1/log",
		"/api/v1/": "(rota desconhecida)", "": "(rota desconhecida)",
	} {
		if obtido := rotaDoPadrao(padrao); obtido != esperado {
			t.Errorf("padrão %q: esperado %q, obtido %q", padrao, esperado, obtido)
		}
	}
	servidor, acessos := apiSemBanco(t)
	for _, c := range [][2]string{{"GET", "/api/v1/nao-existe"}, {"DELETE", "/api/v1/auth/me"}, {"GET", "/api/v1/"}, {"POST", "/api/v1/a/b/c?x=1"}} {
		req, _ := http.NewRequest(c[0], servidor.URL+c[1], nil)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
	}
	for range 4 {
		select {
		case l := <-acessos:
			if l.Rota != "(rota desconhecida)" || l.StatusCode != 401 {
				t.Errorf("linha inesperada: %+v", l)
			}
		case <-time.After(2 * time.Second):
			t.Fatal("faltou linha no log de acesso")
		}
	}
}

// D-QA-14: corpo grande com "Expect: 100-continue" recebe a recusa na hora — sem o 100,
// sem esperar o corpo — e a conexão é fechada.
func TestLoginGrandeComExpectContinueRespondeNaHora(t *testing.T) {
	servidor, _ := apiSemBanco(t)
	conexao, err := net.Dial("tcp", servidor.Listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer conexao.Close()
	// Só os cabeçalhos: um cliente que respeita o Expect ainda não mandou o corpo de 5 MB.
	fmt.Fprintf(conexao, "POST /api/v1/auth/login HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: %d\r\nExpect: 100-continue\r\n\r\n", 5<<20)
	_ = conexao.SetReadDeadline(time.Now().Add(3 * time.Second))
	res, err := http.ReadResponse(bufio.NewReader(conexao), nil)
	if err != nil {
		t.Fatalf("sem resposta em 3 s (a requisição ficou pendurada): %v", err)
	}
	corpo, _ := io.ReadAll(res.Body)
	if res.StatusCode != 422 || !strings.Contains(string(corpo), `"codigo":"VALIDACAO"`) || !res.Close {
		t.Fatalf("esperado 422 VALIDACAO com Connection: close; obtido %d close=%v %s", res.StatusCode, res.Close, corpo)
	}
}

// D-QA-21 / D-QA-12: o login aplica os comprimentos do contrato e recusa campo desconhecido.
func TestLoginValidaComprimentosECamposDesconhecidos(t *testing.T) {
	servidor, _ := apiSemBanco(t)
	longo := strings.Repeat("9", 41)
	casos := map[string]string{
		"registro":     `{"tipoRegistro":"CRM","registro":"` + longo + `","uf":"RS","senha":"x"}`,
		"uf":           `{"tipoRegistro":"CRM","registro":"1","uf":"RSX","senha":"x"}`,
		"senha":        `{"tipoRegistro":"CRM","registro":"1","uf":"RS","senha":"` + strings.Repeat("s", 201) + `"}`,
		"corpo":        `{"tipoRegistro":"CRM","registro":"1","uf":"RS","senha":"x","admin":true}`,
		"tipoRegistro": `{"tipoRegistro":"crm","registro":"1","senha":"x"}`,
	}
	for campo, corpo := range casos {
		res, err := http.Post(servidor.URL+"/api/v1/auth/login", "application/json", strings.NewReader(corpo))
		if err != nil {
			t.Fatal(err)
		}
		resposta, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode != 422 || !strings.Contains(string(resposta), `"campo":"`+campo+`"`) {
			t.Errorf("%s: esperado 422 apontando o campo, obtido %d %s", campo, res.StatusCode, resposta)
		}
	}
}
