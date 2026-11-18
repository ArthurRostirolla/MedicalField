package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"medicalfield/mike-baguncinha/internal/aplicacao"
	"medicalfield/mike-baguncinha/internal/dominio"
)

const (
	cookieRefresh       = "mf_refresh"
	caminhoCookie       = "/api/v1/auth"
	limiteCorpoAuth     = 64 << 10
	limiteCorpoLogs     = 4 << 20
	formatoDataPura     = "2006-01-02"
	mensagemObrigatorio = "obrigatório"
)

// ---- DTOs ----

type profissionalDTO struct {
	ID           string `json:"id"`
	Nome         string `json:"nome"`
	TipoRegistro string `json:"tipoRegistro"`
	Registro     string `json:"registro"`
	UF           string `json:"uf"`
	Papel        string `json:"papel"`
}

type sessaoDTO struct {
	AccessToken  string          `json:"accessToken"`
	ExpiraEm     int             `json:"expiraEm"`
	RefreshToken string          `json:"refreshToken"`
	Profissional profissionalDTO `json:"profissional"`
}

type logClienteDTO struct {
	ID           string          `json:"id"`
	OcorridoEm   string          `json:"ocorridoEm"`
	Acao         string          `json:"acao"`
	Entidade     *string         `json:"entidade,omitempty"`
	EntidadeID   *string         `json:"entidadeId,omitempty"`
	Resultado    string          `json:"resultado"`
	EstavaOnline *bool           `json:"estavaOnline"`
	Detalhe      json.RawMessage `json:"detalhe,omitempty"`
}

type logClienteSaidaDTO struct {
	logClienteDTO
	ProfissionalID string  `json:"profissionalId"`
	DispositivoID  *string `json:"dispositivoId"`
	RecebidoEm     string  `json:"recebidoEm"`
}

type logAcessoDTO struct {
	ID             string  `json:"id"`
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

type pagina[T any] struct {
	Itens         []T     `json:"itens"`
	ProximoCursor *string `json:"proximoCursor"`
}

func paraProfissionalDTO(p dominio.Profissional) profissionalDTO {
	return profissionalDTO{ID: p.ID, Nome: p.Nome, TipoRegistro: p.TipoRegistro, Registro: p.Registro, UF: p.UF, Papel: p.Papel}
}

func invalido(campo, mensagem string) *dominio.ErroValidacao {
	return &dominio.ErroValidacao{Detalhes: []dominio.CampoInvalido{{Campo: campo, Mensagem: mensagem}}}
}

// lerCorpo decodifica o JSON do corpo. Com opcional=true, corpo vazio é aceito.
func lerCorpo(w http.ResponseWriter, r *http.Request, limite int64, opcional bool, destino any) error {
	// Corpo declarado acima do limite: recusa antes de ler um byte. Com "Expect: 100-continue"
	// o servidor nem chega a pedir o corpo (não envia o 100) e fecha a conexão após a resposta.
	if r.ContentLength > limite {
		w.Header().Set("Connection", "close")
		return invalido("corpo", "grande demais")
	}
	decodificador := json.NewDecoder(http.MaxBytesReader(w, r.Body, limite))
	decodificador.DisallowUnknownFields() // os esquemas do contrato são estritos
	err := decodificador.Decode(destino)
	if err == nil || (opcional && errors.Is(err, io.EOF)) {
		return nil
	}
	return invalido("corpo", "JSON inválido, com campo desconhecido ou grande demais")
}

// ---- autenticação ----

func (a *API) login(w http.ResponseWriter, r *http.Request) {
	var corpo struct {
		TipoRegistro string `json:"tipoRegistro"`
		Registro     string `json:"registro"`
		UF           string `json:"uf"`
		Senha        string `json:"senha"`
	}
	if err := lerCorpo(w, r, limiteCorpoAuth, false, &corpo); err != nil {
		a.erro(w, r, err)
		return
	}
	corpo.Registro = strings.TrimSpace(corpo.Registro)
	corpo.UF = strings.ToUpper(strings.TrimSpace(corpo.UF))
	var problemas []dominio.CampoInvalido
	if !dominio.TipoRegistroValido(corpo.TipoRegistro) {
		problemas = append(problemas, dominio.CampoInvalido{Campo: "tipoRegistro", Mensagem: "deve ser CRM, COREN ou SOCORRISTA"})
	}
	if corpo.Registro == "" {
		problemas = append(problemas, dominio.CampoInvalido{Campo: "registro", Mensagem: mensagemObrigatorio})
	}
	if corpo.Senha == "" {
		problemas = append(problemas, dominio.CampoInvalido{Campo: "senha", Mensagem: mensagemObrigatorio})
	}
	// Comprimentos do contrato; o registro também entra na chave do limitador de tentativas.
	for _, c := range []struct {
		campo, valor string
		maximo       int
	}{{"registro", corpo.Registro, dominio.MaximoRegistro}, {"uf", corpo.UF, dominio.MaximoUF}, {"senha", corpo.Senha, dominio.MaximoSenha}} {
		if utf8.RuneCountInString(c.valor) > c.maximo {
			problemas = append(problemas, dominio.CampoInvalido{Campo: c.campo, Mensagem: fmt.Sprintf("máximo de %d caracteres", c.maximo)})
		}
	}
	if problemas != nil {
		a.erro(w, r, &dominio.ErroValidacao{Detalhes: problemas})
		return
	}
	sessao, err := a.Autenticacao.Entrar(r.Context(), aplicacao.EntradaLogin{
		TipoRegistro: corpo.TipoRegistro, Registro: corpo.Registro, UF: corpo.UF, Senha: corpo.Senha,
		IP: dados(r).ip, DispositivoID: dispositivoID(r),
	})
	if err != nil {
		a.erro(w, r, err)
		return
	}
	a.responderSessao(w, r, sessao)
}

func (a *API) refresh(w http.ResponseWriter, r *http.Request) {
	token, err := lerRefresh(w, r)
	if err != nil {
		a.erro(w, r, err)
		return
	}
	sessao, err := a.Autenticacao.Renovar(r.Context(), token)
	if err != nil {
		if errors.Is(err, dominio.ErrRefreshReutilizado) {
			a.Log.Warn("refresh token já revogado foi reapresentado; todas as sessões do profissional foram revogadas",
				"requestId", dados(r).requestID, "ipCliente", dados(r).ip)
		}
		a.erro(w, r, err)
		return
	}
	a.responderSessao(w, r, sessao)
}

func (a *API) logout(w http.ResponseWriter, r *http.Request) {
	token, err := lerRefresh(w, r)
	if err != nil {
		a.erro(w, r, err)
		return
	}
	if err := a.Autenticacao.Sair(r.Context(), dados(r).profissional.ID, token); err != nil {
		a.erro(w, r, err)
		return
	}
	a.definirCookie(w, "", -1)
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) me(w http.ResponseWriter, r *http.Request) {
	escreverJSON(w, http.StatusOK, paraProfissionalDTO(*dados(r).profissional))
}

// lerRefresh pega o refresh token do corpo ou, na falta, do cookie mf_refresh.
func lerRefresh(w http.ResponseWriter, r *http.Request) (string, error) {
	var corpo struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := lerCorpo(w, r, limiteCorpoAuth, true, &corpo); err != nil {
		return "", err
	}
	if corpo.RefreshToken != "" {
		return corpo.RefreshToken, nil
	}
	if cookie, err := r.Cookie(cookieRefresh); err == nil {
		return cookie.Value, nil
	}
	return "", nil
}

func (a *API) responderSessao(w http.ResponseWriter, r *http.Request, s aplicacao.SessaoEmitida) {
	dados(r).profissional = &s.Profissional // login e refresh também saem no log com o profissional
	a.definirCookie(w, s.RefreshToken, int(dominio.ValidadeRefreshToken.Seconds()))
	escreverJSON(w, http.StatusOK, sessaoDTO{
		AccessToken: s.AccessToken, ExpiraEm: s.ExpiraEm, RefreshToken: s.RefreshToken,
		Profissional: paraProfissionalDTO(s.Profissional),
	})
}

func (a *API) definirCookie(w http.ResponseWriter, valor string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: cookieRefresh, Value: valor, Path: caminhoCookie, MaxAge: maxAge,
		HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: a.Producao,
	})
}

// dispositivoID lê o X-Dispositivo-Id; ausente ou malformado vira nulo.
func dispositivoID(r *http.Request) *string {
	id := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Dispositivo-Id")))
	if !dominio.UUIDValido(id) {
		return nil
	}
	return &id
}

// ---- logs do cliente ----

func (a *API) receberLogs(w http.ResponseWriter, r *http.Request) {
	var corpo struct {
		Logs []logClienteDTO `json:"logs"`
	}
	if err := lerCorpo(w, r, limiteCorpoLogs, false, &corpo); err != nil {
		a.erro(w, r, err)
		return
	}
	if corpo.Logs == nil {
		a.erro(w, r, invalido("logs", mensagemObrigatorio))
		return
	}
	profissional, dispositivo := dados(r).profissional.ID, dispositivoID(r)
	logs := make([]dominio.LogCliente, 0, len(corpo.Logs))
	var problemas []dominio.CampoInvalido
	for i, e := range corpo.Logs {
		recusar := func(campo, mensagem string) {
			problemas = append(problemas, dominio.CampoInvalido{Campo: fmt.Sprintf("logs[%d].%s", i, campo), Mensagem: mensagem})
		}
		if !dominio.UUIDValido(e.ID) {
			recusar("id", "deve ser um UUID em minúsculas")
		}
		ocorrido, err := time.Parse(time.RFC3339, e.OcorridoEm)
		if err != nil {
			recusar("ocorridoEm", "deve ser data e hora ISO-8601")
		}
		if strings.TrimSpace(e.Acao) == "" {
			recusar("acao", mensagemObrigatorio)
		}
		for campo, texto := range map[string]string{"acao": e.Acao, "entidade": valor(e.Entidade), "entidadeId": valor(e.EntidadeID)} {
			if utf8.RuneCountInString(texto) > dominio.MaximoTextoLog {
				recusar(campo, fmt.Sprintf("máximo de %d caracteres", dominio.MaximoTextoLog))
			}
		}
		if len(e.Detalhe) > dominio.MaximoDetalheBytes {
			recusar("detalhe", fmt.Sprintf("máximo de %d bytes", dominio.MaximoDetalheBytes))
		}
		if e.Resultado != "SUCESSO" && e.Resultado != "FALHA" {
			recusar("resultado", "deve ser SUCESSO ou FALHA")
		}
		if e.EstavaOnline == nil {
			recusar("estavaOnline", mensagemObrigatorio)
		}
		detalhe := []byte(e.Detalhe)
		if len(detalhe) == 0 || string(detalhe) == "null" {
			detalhe = nil
		}
		if detalhe != nil && detalhe[0] != '{' {
			recusar("detalhe", "deve ser um objeto")
		}
		// O Postgres não aceita o caractere nulo em text nem em jsonb.
		if strings.ContainsRune(e.Acao+valor(e.Entidade)+valor(e.EntidadeID), 0) || strings.Contains(string(detalhe), `\u0000`) {
			recusar("detalhe", "caractere nulo não é aceito")
		}
		if problemas == nil {
			logs = append(logs, dominio.LogCliente{
				ID: e.ID, ProfissionalID: profissional, DispositivoID: dispositivo, OcorridoEm: ocorrido,
				Acao: e.Acao, Entidade: e.Entidade, EntidadeID: e.EntidadeID, Resultado: e.Resultado,
				EstavaOnline: *e.EstavaOnline, Detalhe: detalhe,
			})
		}
	}
	if problemas != nil {
		a.erro(w, r, &dominio.ErroValidacao{Detalhes: problemas})
		return
	}
	aceitos, duplicados, err := a.Auditoria.RegistrarLogsCliente(r.Context(), logs)
	if err != nil {
		a.erro(w, r, err)
		return
	}
	escreverJSON(w, http.StatusOK, map[string]int{"aceitos": aceitos, "duplicados": duplicados})
}

func valor(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// ---- consultas de auditoria ----

func (a *API) listarAcessos(w http.ResponseWriter, r *http.Request) {
	filtro, err := lerFiltro(r, true, func(id string) bool { _, err := strconv.ParseInt(id, 10, 64); return err == nil })
	if err != nil {
		a.erro(w, r, err)
		return
	}
	linhas, proximo, err := a.Auditoria.ListarAcessos(r.Context(), filtro)
	if err != nil {
		a.erro(w, r, err)
		return
	}
	itens := make([]logAcessoDTO, len(linhas))
	for i, l := range linhas {
		itens[i] = logAcessoDTO{
			ID: strconv.FormatInt(l.ID, 10), DataHora: l.DataHora.UTC().Format(formatoDataISO), Servico: l.Servico,
			IPCliente: l.IPCliente, ProfissionalID: l.ProfissionalID, Metodo: l.Metodo, Rota: l.Rota,
			StatusCode: l.StatusCode, TempoMs: l.TempoMs, RequestID: l.RequestID,
		}
	}
	escreverJSON(w, http.StatusOK, pagina[logAcessoDTO]{Itens: itens, ProximoCursor: codificarCursor(proximo)})
}

func (a *API) listarLogsCliente(w http.ResponseWriter, r *http.Request) {
	filtro, err := lerFiltro(r, false, dominio.UUIDValido)
	if err != nil {
		a.erro(w, r, err)
		return
	}
	linhas, proximo, err := a.Auditoria.ListarLogsCliente(r.Context(), filtro)
	if err != nil {
		a.erro(w, r, err)
		return
	}
	itens := make([]logClienteSaidaDTO, len(linhas))
	for i, l := range linhas {
		online := l.EstavaOnline
		itens[i] = logClienteSaidaDTO{
			logClienteDTO: logClienteDTO{
				ID: l.ID, OcorridoEm: l.OcorridoEm.UTC().Format(formatoDataISO), Acao: l.Acao, Entidade: l.Entidade,
				EntidadeID: l.EntidadeID, Resultado: l.Resultado, EstavaOnline: &online, Detalhe: l.Detalhe,
			},
			ProfissionalID: l.ProfissionalID, DispositivoID: l.DispositivoID, RecebidoEm: l.RecebidoEm.UTC().Format(formatoDataISO),
		}
	}
	escreverJSON(w, http.StatusOK, pagina[logClienteSaidaDTO]{Itens: itens, ProximoCursor: codificarCursor(proximo)})
}

// lerFiltro valida os parâmetros de consulta comuns às duas listagens.
func lerFiltro(r *http.Request, comServico bool, idCursorValido func(string) bool) (dominio.FiltroAuditoria, error) {
	q := r.URL.Query()
	f := dominio.FiltroAuditoria{Limite: dominio.LimitePadraoPagina}
	var problemas []dominio.CampoInvalido
	recusar := func(campo, mensagem string) {
		problemas = append(problemas, dominio.CampoInvalido{Campo: campo, Mensagem: mensagem})
	}
	if v := q.Get("de"); v != "" {
		if t, ok := lerInstante(v, false); ok {
			f.De = &t
		} else {
			recusar("de", "deve ser data (YYYY-MM-DD) ou data e hora ISO-8601")
		}
	}
	if v := q.Get("ate"); v != "" {
		if t, ok := lerInstante(v, true); ok {
			f.Ate = &t
		} else {
			recusar("ate", "deve ser data (YYYY-MM-DD) ou data e hora ISO-8601")
		}
	}
	if v := q.Get("profissionalId"); v != "" {
		if dominio.UUIDValido(v) {
			f.ProfissionalID = &v
		} else {
			recusar("profissionalId", "deve ser um UUID em minúsculas")
		}
	}
	if v := q.Get("servico"); comServico && v != "" {
		f.Servico = &v
	}
	if v := q.Get("limite"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			recusar("limite", "deve ser um inteiro entre 1 e 200")
		}
		f.Limite = min(n, dominio.LimiteMaximoPagina) // acima do máximo, limita a 200
	}
	if v := q.Get("cursor"); v != "" {
		if c, ok := decodificarCursor(v); ok && idCursorValido(c.ID) {
			f.Cursor = &c
		} else {
			recusar("cursor", "inválido")
		}
	}
	if problemas != nil {
		return f, &dominio.ErroValidacao{Detalhes: problemas}
	}
	return f, nil
}

// lerInstante aceita data e hora ISO-8601 ou data pura; a data pura em "ate" cobre o dia inteiro.
func lerInstante(v string, fimDoDia bool) (time.Time, bool) {
	if t, err := time.Parse(time.RFC3339, v); err == nil {
		return t, true
	}
	t, err := time.Parse(formatoDataPura, v)
	if err != nil {
		return t, false
	}
	if fimDoDia {
		t = t.Add(24*time.Hour - time.Microsecond)
	}
	return t, true
}

// O cursor é opaco para o cliente: base64url de "<instante>|<id>" da última linha da página.
func codificarCursor(c *dominio.Cursor) *string {
	if c == nil {
		return nil
	}
	s := base64.RawURLEncoding.EncodeToString([]byte(c.Instante.UTC().Format(time.RFC3339Nano) + "|" + c.ID))
	return &s
}

func decodificarCursor(s string) (dominio.Cursor, bool) {
	bruto, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return dominio.Cursor{}, false
	}
	instante, id, achou := strings.Cut(string(bruto), "|")
	t, err := time.Parse(time.RFC3339Nano, instante)
	return dominio.Cursor{Instante: t, ID: id}, achou && err == nil
}
