// Package httpapi é a camada http: rotas, DTOs, middlewares e tradução de erro.
// Não contém regra de negócio; só converte e delega aos casos de uso.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/netip"
	"strings"
	"time"

	"medicalfield/mike-baguncinha/internal/aplicacao"
	"medicalfield/mike-baguncinha/internal/dominio"
)

const (
	servico    = "mike-baguncinha"
	prefixoAPI = "/api/v1/"
	// rotaDesconhecida é o nome único, no log de acesso, do que não casa com rota nenhuma.
	rotaDesconhecida = "(rota desconhecida)"
	formatoDataISO   = "2006-01-02T15:04:05.000Z"
)

// API reúne as dependências da camada http.
type API struct {
	Autenticacao *aplicacao.AutenticacaoUseCase
	Auditoria    *aplicacao.AuditoriaUseCase
	// ValidarToken confere o access token e devolve o profissional das claims.
	ValidarToken func(token string) (dominio.Profissional, error)
	// RegistrarAcesso enfileira a linha para gravação assíncrona no banco.
	RegistrarAcesso func(dominio.LogAcesso)
	// SaidaAcesso recebe a linha JSON do log de acesso (stdout).
	SaidaAcesso io.Writer
	Proxies     []netip.Prefix
	Producao    bool
	Log         *slog.Logger
}

// Handler monta a cadeia: request-id → log de acesso → autenticação → handler.
func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/auth/login", a.login)     // única rota sem token
	mux.HandleFunc("POST /api/v1/auth/refresh", a.refresh) // exige refresh token válido
	mux.Handle("POST /api/v1/auth/logout", a.autenticar("", a.logout))
	mux.Handle("GET /api/v1/auth/me", a.autenticar("", a.me))
	// Sob /auth para seguir o roteamento já existente do gateway e do proxy do portal.
	mux.Handle("POST /api/v1/auth/profissional", a.autenticar(dominio.PapelAdmin, a.cadastrarProfissional))
	mux.Handle("POST /api/v1/log", a.autenticar("", a.receberLogs))
	mux.Handle("GET /api/v1/auditoria/acesso", a.autenticar(dominio.PapelAdmin, a.listarAcessos))
	mux.Handle("GET /api/v1/auditoria/cliente", a.autenticar(dominio.PapelAdmin, a.listarLogsCliente))
	// Qualquer outra rota sob /api/v1 também exige token (401 antes do 404).
	mux.Handle(prefixoAPI, a.autenticar("", func(w http.ResponseWriter, r *http.Request) {
		a.erro(w, r, dominio.ErrNaoEncontrado)
	}))
	return a.requestID(a.logAcesso(mux))
}

// dadosRequisicao acompanha a requisição pela cadeia; a autenticação preenche o profissional
// e o log de acesso (que a envolve) lê depois.
type dadosRequisicao struct {
	requestID    string
	ip           string
	profissional *dominio.Profissional
}

type chaveContexto struct{}

func dados(r *http.Request) *dadosRequisicao {
	if d, ok := r.Context().Value(chaveContexto{}).(*dadosRequisicao); ok {
		return d
	}
	return &dadosRequisicao{}
}

// requestID aceita o X-Request-Id recebido (se razoável) ou gera um, e o devolve na resposta.
func (a *API) requestID(proximo http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-Id")
		if !requestIDAceitavel(id) {
			id = dominio.NovoUUID()
		}
		w.Header().Set("X-Request-Id", id)
		d := &dadosRequisicao{requestID: id, ip: IPCliente(r.RemoteAddr, r.Header.Values("X-Forwarded-For"), a.Proxies)}
		proximo.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), chaveContexto{}, d)))
	})
}

func requestIDAceitavel(id string) bool {
	if id == "" || len(id) > 128 {
		return false
	}
	for _, c := range id {
		if c <= ' ' || c > '~' {
			return false
		}
	}
	return true
}

// respostaComStatus guarda o status enviado, para o log de acesso.
type respostaComStatus struct {
	http.ResponseWriter
	status int
}

func (r *respostaComStatus) WriteHeader(status int) {
	if r.status == 0 {
		r.status = status
	}
	r.ResponseWriter.WriteHeader(status)
}

func (r *respostaComStatus) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	return r.ResponseWriter.Write(b)
}

// linhaAcesso é a linha de stdout, com os nomes de campo do contrato.
type linhaAcesso struct {
	Nivel          string  `json:"nivel"`
	Tipo           string  `json:"tipo"`
	DataHora       string  `json:"dataHora"`
	Servico        string  `json:"servico"`
	IPCliente      string  `json:"ipCliente"`
	ProfissionalID *string `json:"profissionalId"`
	Metodo         string  `json:"metodo"`
	Rota           string  `json:"rota"`
	StatusCode     int     `json:"statusCode"`
	TempoMs        int     `json:"tempoMs"`
	RequestID      string  `json:"requestId"`
}

// logAcesso registra uma linha por requisição em /api/v1/* (stdout + fila do banco).
// Envolve a autenticação: um 401 também é registrado, com profissional nulo.
func (a *API) logAcesso(proximo *http.ServeMux) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, prefixoAPI) {
			proximo.ServeHTTP(w, r)
			return
		}
		inicio := time.Now()
		resposta := &respostaComStatus{ResponseWriter: w}
		defer func() {
			if p := recover(); p != nil {
				// Sem o valor do panic no log: pode carregar dado da requisição.
				a.Log.Error("panic no handler", "requestId", dados(r).requestID)
				if resposta.status == 0 {
					a.erro(resposta, r, errors.New("panic"))
				}
			}
			if resposta.status == 0 {
				resposta.status = http.StatusOK
			}
			d := dados(r)
			l := dominio.LogAcesso{
				DataHora: inicio.UTC(), Servico: servico, IPCliente: d.ip, Metodo: r.Method,
				Rota: rotaDoPadrao(r.Pattern), StatusCode: resposta.status,
				TempoMs: int(time.Since(inicio).Milliseconds()), RequestID: d.requestID,
			}
			if d.profissional != nil {
				l.ProfissionalID = &d.profissional.ID
			}
			linha, _ := json.Marshal(linhaAcesso{
				Nivel: "info", Tipo: "acesso", DataHora: l.DataHora.Format(formatoDataISO), Servico: l.Servico,
				IPCliente: l.IPCliente, ProfissionalID: l.ProfissionalID, Metodo: l.Metodo, Rota: l.Rota,
				StatusCode: l.StatusCode, TempoMs: l.TempoMs, RequestID: l.RequestID,
			})
			_, _ = a.SaidaAcesso.Write(append(linha, '\n'))
			a.RegistrarAcesso(l)
		}()
		// O ServeMux grava r.Pattern nesta mesma requisição; por isso ele é chamado direto daqui.
		proximo.ServeHTTP(resposta, r)
	})
}

// rotaDoPadrao tira o método do padrão do ServeMux ("GET /api/v1/auth/me" → "/api/v1/auth/me").
// O que não casa com rota nenhuma sai sempre com o mesmo nome, igual nos três serviços.
func rotaDoPadrao(padrao string) string {
	if _, rota, achou := strings.Cut(padrao, " "); achou {
		return rota
	}
	return rotaDesconhecida
}

// autenticar exige um access token válido e, se papel != "", exatamente aquele papel.
func (a *API) autenticar(papel string, proximo http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, achou := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !achou {
			a.erro(w, r, dominio.ErrNaoAutenticado)
			return
		}
		p, err := a.ValidarToken(strings.TrimSpace(token))
		if err != nil {
			a.erro(w, r, dominio.ErrNaoAutenticado)
			return
		}
		dados(r).profissional = &p
		if papel != "" && p.Papel != papel {
			a.erro(w, r, dominio.ErrSemPermissao)
			return
		}
		proximo(w, r)
	})
}

// corpoErro é o corpo de erro único dos três serviços.
type corpoErro struct {
	Codigo    string                  `json:"codigo"`
	Mensagem  string                  `json:"mensagem"`
	Detalhes  []dominio.CampoInvalido `json:"detalhes"`
	RequestID string                  `json:"requestId"`
}

// erro traduz um erro do domínio para o HTTP do contrato. Erro desconhecido vira 500 sem detalhe.
func (a *API) erro(w http.ResponseWriter, r *http.Request, err error) {
	corpo := corpoErro{Detalhes: []dominio.CampoInvalido{}, RequestID: dados(r).requestID}
	var status int
	var validacao *dominio.ErroValidacao
	switch {
	case errors.As(err, &validacao):
		status, corpo.Codigo, corpo.Mensagem = http.StatusUnprocessableEntity, "VALIDACAO", "Dados inválidos."
		corpo.Detalhes = validacao.Detalhes
	case errors.Is(err, dominio.ErrCredenciaisInvalidas):
		status, corpo.Codigo, corpo.Mensagem = http.StatusUnauthorized, "CREDENCIAIS_INVALIDAS", "Registro ou senha inválidos."
	case errors.Is(err, dominio.ErrNaoAutenticado):
		status, corpo.Codigo, corpo.Mensagem = http.StatusUnauthorized, "NAO_AUTENTICADO", "Autenticação necessária."
	case errors.Is(err, dominio.ErrSemPermissao):
		status, corpo.Codigo, corpo.Mensagem = http.StatusForbidden, "SEM_PERMISSAO", "Você não tem permissão para esta operação."
	case errors.Is(err, dominio.ErrNaoEncontrado):
		status, corpo.Codigo, corpo.Mensagem = http.StatusNotFound, "NAO_ENCONTRADO", "Recurso não encontrado."
	case errors.Is(err, dominio.ErrMuitasTentativas):
		status, corpo.Codigo, corpo.Mensagem = http.StatusTooManyRequests, "MUITAS_TENTATIVAS", "Muitas tentativas de login. Tente novamente em alguns minutos."
	case errors.Is(err, dominio.ErrIndisponivel):
		status, corpo.Codigo, corpo.Mensagem = http.StatusServiceUnavailable, "SERVICO_INDISPONIVEL", "Serviço temporariamente indisponível."
		a.Log.Error("dependência indisponível", "requestId", corpo.RequestID, "erro", err.Error())
	default:
		status, corpo.Codigo, corpo.Mensagem = http.StatusInternalServerError, "ERRO_INTERNO", "Erro interno."
		a.Log.Error("erro interno", "requestId", corpo.RequestID, "erro", err.Error())
	}
	escreverJSON(w, status, corpo)
}

func escreverJSON(w http.ResponseWriter, status int, corpo any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(corpo)
}

// Gestao monta a porta de gestão: health e JWKS. Sem autenticação; nunca roteada pelo gateway.
func Gestao(bancoResponde func(context.Context) error, jwks any) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health/live", func(w http.ResponseWriter, _ *http.Request) {
		escreverJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /health/ready", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancelar := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancelar()
		if err := bancoResponde(ctx); err != nil {
			escreverJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "indisponivel"})
			return
		}
		escreverJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /jwks.json", func(w http.ResponseWriter, _ *http.Request) {
		escreverJSON(w, http.StatusOK, jwks)
	})
	return mux
}
