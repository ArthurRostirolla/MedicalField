// MikeBaguncinha — serviço de identidade e auditoria do MedicalField.
// Este arquivo é o único ponto de montagem das dependências (injeção manual).
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"medicalfield/mike-baguncinha/internal/aplicacao"
	"medicalfield/mike-baguncinha/internal/dominio"
	httpapi "medicalfield/mike-baguncinha/internal/http"
	"medicalfield/mike-baguncinha/internal/infra"
)

func main() {
	// Utilitário: `mike-baguncinha hash <senha>` imprime o hash Argon2id para cadastrar um profissional.
	if len(os.Args) == 3 && os.Args[1] == "hash" {
		fmt.Println(infra.GerarHashSenha(os.Args[2]))
		return
	}
	if err := executar(); err != nil {
		fmt.Fprintln(os.Stderr, "mike-baguncinha:", err)
		os.Exit(1)
	}
}

func executar() error {
	config, err := infra.CarregarConfig()
	if err != nil {
		return err
	}
	log := novoLogger(config.NivelLog)

	tokens, err := infra.NovosTokens(config.ChavePrivadaPEM)
	if err != nil {
		return err
	}
	if config.ChavePrivadaPEM == "" {
		log.Warn("JWT_CHAVE_PRIVADA_PEM ausente: usando chave efêmera; os tokens deixam de valer quando o processo reinicia", "kid", tokens.Kid())
	}

	ctx, parar := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
	defer parar()

	// O pool conecta sob demanda: o processo sobe mesmo com o banco fora e /health/ready responde 503.
	pool, err := pgxpool.New(ctx, config.DatabaseURL)
	if err != nil {
		return fmt.Errorf("DATABASE_URL inválida: %w", err)
	}
	defer pool.Close()

	banco := &infra.Postgres{Pool: pool}
	gravador := infra.NovoGravadorAcesso(banco, log)

	api := &httpapi.API{
		Autenticacao: &aplicacao.AutenticacaoUseCase{
			Profissionais: banco, Sessoes: banco, Senhas: infra.Argon2id{}, Tokens: tokens,
			Limitador: aplicacao.NovoLimitadorTentativas(5, 15*time.Minute),
			HashFalso: infra.GerarHashSenha(dominio.NovoUUID()),
			Agora:     time.Now,
		},
		Auditoria:       &aplicacao.AuditoriaUseCase{Repositorio: banco},
		ValidarToken:    tokens.Validar,
		RegistrarAcesso: gravador.Registrar,
		SaidaAcesso:     os.Stdout,
		Proxies:         config.ProxiesConfiaveis,
		Producao:        config.Producao,
		Log:             log,
	}

	servidorAPI := novoServidor(config.Porta, api.Handler())
	servidorGestao := novoServidor(config.PortaGestao, httpapi.Gestao(pool.Ping, tokens.JWKS()))

	falha := make(chan error, 2)
	for _, s := range []*http.Server{servidorAPI, servidorGestao} {
		go func() {
			if err := s.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
				falha <- err
			}
		}()
	}
	log.Info("serviço no ar", "porta", config.Porta, "portaGestao", config.PortaGestao, "producao", config.Producao)

	select {
	case err = <-falha:
	case <-ctx.Done():
		log.Info("encerrando")
	}

	// Encerramento gracioso: termina as requisições em curso e só então descarrega o log de acesso.
	prazo, cancelar := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelar()
	_ = servidorAPI.Shutdown(prazo)
	_ = servidorGestao.Shutdown(prazo)
	gravador.Fechar()
	return err
}

func novoServidor(porta int, handler http.Handler) *http.Server {
	return &http.Server{
		Addr: fmt.Sprintf(":%d", porta), Handler: handler,
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
		WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second,
	}
}

// novoLogger devolve o log operacional: JSON em stdout com os nomes de campo comuns aos três serviços.
func novoLogger(nivel slog.Level) *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: nivel,
		ReplaceAttr: func(grupos []string, a slog.Attr) slog.Attr {
			if len(grupos) > 0 {
				return a
			}
			switch a.Key {
			case slog.TimeKey:
				return slog.String("dataHora", a.Value.Time().UTC().Format("2006-01-02T15:04:05.000Z"))
			case slog.LevelKey:
				return slog.String("nivel", strings.ToLower(a.Value.String()))
			case slog.MessageKey:
				a.Key = "mensagem"
			}
			return a
		},
	}))
}
