// Package aplicacao contém os casos de uso; conhece apenas as interfaces do domínio.
package aplicacao

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"medicalfield/mike-baguncinha/internal/dominio"
)

// SessaoEmitida é o resultado de um login ou de uma renovação.
type SessaoEmitida struct {
	AccessToken  string
	ExpiraEm     int // segundos
	RefreshToken string
	Profissional dominio.Profissional
}

// EntradaLogin são os dados do login já extraídos da requisição.
type EntradaLogin struct {
	TipoRegistro  string
	Registro      string
	UF            string
	Senha         string
	IP            string
	DispositivoID *string
}

// AutenticacaoUseCase cobre login, renovação e encerramento de sessão.
type AutenticacaoUseCase struct {
	Profissionais dominio.ProfissionalRepository
	Sessoes       dominio.SessaoRepository
	Senhas        dominio.VerificadorSenha
	Tokens        dominio.EmissorToken
	// Limitador conta falhas por IP + conta (contrato: 5 em 15 min).
	Limitador *LimitadorTentativas
	// LimitadorConta conta falhas por conta, de qualquer IP: teto para força bruta distribuída.
	LimitadorConta *LimitadorTentativas
	// Vagas limita as verificações de senha simultâneas: cada uma aloca a memória do
	// Argon2id (19 MiB), então a capacidade do canal é o teto de memória do login.
	Vagas chan struct{}
	// EsperaVaga é quanto uma requisição aguarda por vaga antes de receber 503.
	EsperaVaga time.Duration
	// HashFalso é verificado quando o registro não existe, para o tempo de
	// resposta não revelar se o profissional está cadastrado.
	HashFalso string
	Agora     func() time.Time
}

// Entrar autentica o profissional e abre uma sessão.
func (a *AutenticacaoUseCase) Entrar(ctx context.Context, e EntradaLogin) (SessaoEmitida, error) {
	agora := a.Agora()
	conta := e.TipoRegistro + "|" + e.Registro
	chave := e.IP + "|" + conta
	if a.Limitador.Bloqueado(chave, agora) || a.LimitadorConta.Bloqueado(conta, agora) {
		return SessaoEmitida{}, dominio.ErrMuitasTentativas
	}

	p, err := a.Profissionais.BuscarPorRegistro(ctx, e.TipoRegistro, e.Registro, e.UF)
	existe := err == nil
	if err != nil && !errors.Is(err, dominio.ErrNaoEncontrado) {
		return SessaoEmitida{}, err
	}
	hash := a.HashFalso
	if existe {
		hash = p.SenhaHash
	}
	senhaOK, err := a.verificarSenha(ctx, e.Senha, hash)
	if err != nil {
		return SessaoEmitida{}, err
	}
	if !existe || !senhaOK || !p.Ativo {
		a.Limitador.RegistrarFalha(chave, agora)
		a.LimitadorConta.RegistrarFalha(conta, agora)
		return SessaoEmitida{}, dominio.ErrCredenciaisInvalidas
	}
	// O contador por conta não é zerado aqui: o login do dono não pode renovar as
	// tentativas de quem ataca a mesma conta de outros IPs; ele vence pela janela.
	a.Limitador.Limpar(chave)

	refresh, refreshHash := novoRefreshToken()
	if err := a.Sessoes.Criar(ctx, p.ID, refreshHash, e.DispositivoID, agora.Add(dominio.ValidadeRefreshToken)); err != nil {
		return SessaoEmitida{}, err
	}
	return a.emitir(p, refresh, agora)
}

// verificarSenha é o único caminho até o Argon2id (hash real ou falso) e só roda com uma
// vaga. Sem vaga dentro do prazo, devolve ErrIndisponivel (503): o cliente tenta de novo
// e o processo nunca aloca mais do que cap(Vagas) verificações ao mesmo tempo.
func (a *AutenticacaoUseCase) verificarSenha(ctx context.Context, senha, hash string) (bool, error) {
	prazo := time.NewTimer(a.EsperaVaga)
	defer prazo.Stop()
	select {
	case a.Vagas <- struct{}{}:
		defer func() { <-a.Vagas }()
		return a.Senhas.Verificar(senha, hash), nil
	case <-prazo.C:
		return false, fmt.Errorf("%w: verificação de senha sem vaga", dominio.ErrIndisponivel)
	case <-ctx.Done():
		return false, fmt.Errorf("%w: requisição cancelada à espera de vaga", dominio.ErrIndisponivel)
	}
}

// Renovar troca um refresh token válido por uma sessão nova (o antigo deixa de valer).
func (a *AutenticacaoUseCase) Renovar(ctx context.Context, refreshToken string) (SessaoEmitida, error) {
	if refreshToken == "" {
		return SessaoEmitida{}, dominio.ErrNaoAutenticado
	}
	agora := a.Agora()
	refresh, refreshHash := novoRefreshToken()
	p, err := a.Sessoes.Rotacionar(ctx, HashRefresh(refreshToken), refreshHash, agora.Add(dominio.ValidadeRefreshToken))
	if err != nil {
		return SessaoEmitida{}, err
	}
	return a.emitir(p, refresh, agora)
}

// Sair revoga a sessão do refresh token informado; sem token, não há o que revogar.
func (a *AutenticacaoUseCase) Sair(ctx context.Context, profissionalID, refreshToken string) error {
	if refreshToken == "" {
		return nil
	}
	return a.Sessoes.Revogar(ctx, profissionalID, HashRefresh(refreshToken))
}

func (a *AutenticacaoUseCase) emitir(p dominio.Profissional, refresh string, agora time.Time) (SessaoEmitida, error) {
	access, err := a.Tokens.Emitir(p, agora)
	if err != nil {
		return SessaoEmitida{}, err
	}
	return SessaoEmitida{
		AccessToken:  access,
		ExpiraEm:     int(dominio.ValidadeAccessToken.Seconds()),
		RefreshToken: refresh,
		Profissional: p,
	}, nil
}

// novoRefreshToken gera o token opaco e o hash que vai para o banco.
func novoRefreshToken() (token, hash string) {
	var b [32]byte
	_, _ = rand.Read(b[:]) // crypto/rand.Read não falha
	token = base64.RawURLEncoding.EncodeToString(b[:])
	return token, HashRefresh(token)
}

// HashRefresh é o sha256 (hex) do refresh token; só ele é persistido.
func HashRefresh(token string) string {
	soma := sha256.Sum256([]byte(token))
	return hex.EncodeToString(soma[:])
}
