package infra

import (
	"context"
	"log/slog"
	"time"

	"medicalfield/mike-baguncinha/internal/dominio"
)

const (
	tamanhoLoteAcesso    = 100
	intervaloDescarga    = time.Second
	capacidadeFilaAcesso = 10000
)

// GravadorAcesso grava o log de acesso de forma assíncrona: acumula em memória e
// descarrega a cada 1 s, a cada 100 linhas e no encerramento. Nunca bloqueia a requisição.
type GravadorAcesso struct {
	repositorio dominio.AuditoriaRepository
	log         *slog.Logger
	fila        chan dominio.LogAcesso
	parar       chan struct{}
	terminou    chan struct{}
}

// NovoGravadorAcesso inicia a goroutine de descarga.
func NovoGravadorAcesso(repositorio dominio.AuditoriaRepository, log *slog.Logger) *GravadorAcesso {
	g := &GravadorAcesso{
		repositorio: repositorio, log: log,
		fila:  make(chan dominio.LogAcesso, capacidadeFilaAcesso),
		parar: make(chan struct{}), terminou: make(chan struct{}),
	}
	go g.executar()
	return g
}

// Registrar enfileira a linha; com a fila cheia (banco fora por muito tempo), descarta.
func (g *GravadorAcesso) Registrar(l dominio.LogAcesso) {
	select {
	case g.fila <- l:
	default:
		g.log.Warn("fila do log de acesso cheia; linha descartada", "requestId", l.RequestID)
	}
}

// Fechar descarrega o que resta e encerra a goroutine. Chamar depois de parar os servidores HTTP.
func (g *GravadorAcesso) Fechar() {
	close(g.parar)
	<-g.terminou
}

func (g *GravadorAcesso) executar() {
	defer close(g.terminou)
	relogio := time.NewTicker(intervaloDescarga)
	defer relogio.Stop()
	lote := make([]dominio.LogAcesso, 0, tamanhoLoteAcesso)
	descarregar := func() {
		if len(lote) == 0 {
			return
		}
		ctx, cancelar := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancelar()
		// Falha ao gravar o log nunca derruba nada: registra e segue (a linha já saiu em stdout).
		if err := g.repositorio.InserirAcessos(ctx, lote); err != nil {
			g.log.Error("falha ao gravar o log de acesso", "linhas", len(lote), "erro", err.Error())
		}
		lote = lote[:0]
	}
	for {
		select {
		case l := <-g.fila:
			if lote = append(lote, l); len(lote) >= tamanhoLoteAcesso {
				descarregar()
			}
		case <-relogio.C:
			descarregar()
		case <-g.parar:
			for {
				select {
				case l := <-g.fila:
					if lote = append(lote, l); len(lote) >= tamanhoLoteAcesso {
						descarregar()
					}
				default:
					descarregar()
					return
				}
			}
		}
	}
}
