// Package infra implementa as interfaces do domínio (Postgres, Argon2id, JWT) e a configuração.
package infra

import (
	"fmt"
	"log/slog"
	"net/netip"
	"os"
	"strconv"
	"strings"
)

// Config é a configuração do serviço, lida só de variáveis de ambiente.
type Config struct {
	Porta             int
	PortaGestao       int
	DatabaseURL       string
	ProxiesConfiaveis []netip.Prefix
	Producao          bool
	NivelLog          slog.Level
	ChavePrivadaPEM   string
}

// CarregarConfig valida o ambiente; qualquer problema impede a partida.
func CarregarConfig() (Config, error) {
	var c Config
	var err error
	if c.Porta, err = porta("PORTA", 8080); err != nil {
		return c, err
	}
	if c.PortaGestao, err = porta("PORTA_GESTAO", 9090); err != nil {
		return c, err
	}
	if c.DatabaseURL = os.Getenv("DATABASE_URL"); c.DatabaseURL == "" {
		return c, fmt.Errorf("DATABASE_URL é obrigatória")
	}
	if c.ProxiesConfiaveis, err = LerProxies(env("PROXIES_CONFIAVEIS", "127.0.0.1/32,::1/128,10.42.0.0/16")); err != nil {
		return c, err
	}
	switch ambiente := env("AMBIENTE", "desenvolvimento"); ambiente {
	case "desenvolvimento":
	case "producao":
		c.Producao = true
	default:
		return c, fmt.Errorf("AMBIENTE inválido: %q (use desenvolvimento ou producao)", ambiente)
	}
	niveis := map[string]slog.Level{"debug": slog.LevelDebug, "info": slog.LevelInfo, "warn": slog.LevelWarn, "error": slog.LevelError}
	nivel, ok := niveis[env("NIVEL_LOG", "info")]
	if !ok {
		return c, fmt.Errorf("NIVEL_LOG inválido (use debug, info, warn ou error)")
	}
	c.NivelLog = nivel
	// Aceita o PEM com quebras de linha escapadas, comum em arquivos .env.
	c.ChavePrivadaPEM = strings.ReplaceAll(os.Getenv("JWT_CHAVE_PRIVADA_PEM"), `\n`, "\n")
	if c.Producao && c.ChavePrivadaPEM == "" {
		return c, fmt.Errorf("JWT_CHAVE_PRIVADA_PEM é obrigatória em producao")
	}
	return c, nil
}

// LerProxies converte a lista de CIDRs separados por vírgula.
func LerProxies(lista string) ([]netip.Prefix, error) {
	var prefixos []netip.Prefix
	for _, item := range strings.Split(lista, ",") {
		if item = strings.TrimSpace(item); item == "" {
			continue
		}
		p, err := netip.ParsePrefix(item)
		if err != nil {
			return nil, fmt.Errorf("PROXIES_CONFIAVEIS: CIDR inválido %q", item)
		}
		prefixos = append(prefixos, p.Masked())
	}
	return prefixos, nil
}

func env(nome, padrao string) string {
	if v := os.Getenv(nome); v != "" {
		return v
	}
	return padrao
}

func porta(nome string, padrao int) (int, error) {
	v := os.Getenv(nome)
	if v == "" {
		return padrao, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 || n > 65535 {
		return 0, fmt.Errorf("%s inválida: %q", nome, v)
	}
	return n, nil
}
