// MikeBaguncinha — serviço de identidade e auditoria do MedicalField.
// Este arquivo é o único ponto de montagem das dependências (injeção manual).
package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"runtime/debug"
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
	// Utilitário: `mike-baguncinha hash` lê a senha da entrada padrão (não de argumento, que
	// ficaria visível na lista de processos) e imprime o hash Argon2id para cadastrar um profissional.
	if len(os.Args) == 2 && os.Args[1] == "hash" {
		senha, _ := bufio.NewReader(os.Stdin).ReadString('\n')
		if senha = strings.TrimRight(senha, "\r\n"); senha == "" {
			fmt.Fprintln(os.Stderr, "mike-baguncinha: informe a senha pela entrada padrão")
			os.Exit(1)
		}
		fmt.Println(infra.GerarHashSenha(senha))
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
	// Teto flexível de memória do runtime, com folga abaixo do limite do contêiner: perto dele o
	// coletor trabalha mais em vez de o processo crescer. GOMEMLIMIT, se definida, prevalece.
	if os.Getenv("GOMEMLIMIT") == "" {
		debug.SetMemoryLimit(memoriaPadrao)
	}

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
	if config.Producao {
		avisarDadosDemonstracao(ctx, banco, log)
	}
	go expurgarSessoes(ctx, banco, log)
	gravador := infra.NovoGravadorAcesso(banco, log)

	api := &httpapi.API{
		Autenticacao: &aplicacao.AutenticacaoUseCase{
			Profissionais: banco, Sessoes: banco, Senhas: infra.Argon2id{}, Tokens: tokens,
			Limitador:      aplicacao.NovoLimitadorTentativas(5, 15*time.Minute),
			LimitadorConta: aplicacao.NovoLimitadorTentativas(falhasPorConta, 15*time.Minute),
			Vagas:          make(chan struct{}, verificacoesSimultaneas),
			EsperaVaga:     esperaPorVaga,
			HashFalso:      infra.GerarHashSenha(dominio.NovoUUID()),
			GerarHash:      infra.GerarHashSenha,
			Agora:          time.Now,
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

const (
	// verificacoesSimultaneas × 19 MiB é o pico de memória do Argon2id; mexer aqui exige
	// rever o limite de memória do pod.
	verificacoesSimultaneas = 2
	esperaPorVaga           = 3 * time.Second
	// falhasPorConta é o teto por conta somando todos os IPs. Mais alto que o limite por IP (5)
	// para um terceiro não trancar a conta de alguém com meia dúzia de tentativas.
	falhasPorConta = 20
	memoriaPadrao  = 64 << 20
)

// avisarDadosDemonstracao grita no log de partida se a carga de demonstração (senha pública,
// no README) existe num ambiente de produção.
func avisarDadosDemonstracao(ctx context.Context, banco *infra.Postgres, log *slog.Logger) {
	ctx, cancelar := context.WithTimeout(ctx, 3*time.Second)
	defer cancelar()
	n, err := banco.ContarDemonstracao(ctx)
	switch {
	case err != nil:
		log.Warn("não foi possível conferir se há profissionais de demonstração no banco", "erro", err.Error())
	case n > 0:
		log.Error("ATENÇÃO: AMBIENTE=producao COM PROFISSIONAIS DE DEMONSTRAÇÃO ATIVOS — a senha deles é pública (README). "+
			"Desative-os (UPDATE identidade.profissional SET ativo = false) ou troque as senhas antes de expor o serviço.",
			"profissionaisDemonstracao", n)
	}
}

// expurgarSessoes apaga as sessões vencidas na partida e depois de hora em hora.
func expurgarSessoes(ctx context.Context, banco *infra.Postgres, log *slog.Logger) {
	relogio := time.NewTicker(time.Hour)
	defer relogio.Stop()
	for {
		prazo, cancelar := context.WithTimeout(ctx, 30*time.Second)
		if n, err := banco.ExpurgarSessoes(prazo); err != nil {
			log.Warn("falha ao expurgar sessões vencidas", "erro", err.Error())
		} else if n > 0 {
			log.Info("sessões vencidas expurgadas", "sessoes", n)
		}
		cancelar()
		select {
		case <-relogio.C:
		case <-ctx.Done():
			return
		}
	}
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
