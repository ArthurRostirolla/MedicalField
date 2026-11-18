// Package dominio contém as entidades, regras e interfaces do MikeBaguncinha.
// Não conhece HTTP, SQL nem bibliotecas externas.
package dominio

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"regexp"
	"time"
)

const (
	PapelAdmin        = "ADMIN"
	PapelProfissional = "PROFISSIONAL"

	ValidadeAccessToken  = 15 * time.Minute
	ValidadeRefreshToken = 30 * 24 * time.Hour
)

// Erros de domínio; a camada http traduz cada um para o código do contrato.
var (
	ErrCredenciaisInvalidas = errors.New("credenciais inválidas")
	ErrNaoAutenticado       = errors.New("não autenticado")
	ErrSemPermissao         = errors.New("sem permissão")
	ErrMuitasTentativas     = errors.New("muitas tentativas")
	ErrIndisponivel         = errors.New("dependência indisponível")
	ErrNaoEncontrado        = errors.New("não encontrado")
	// ErrRefreshReutilizado é um ErrNaoAutenticado (401) com causa conhecida: um refresh
	// token já revogado foi reapresentado e as sessões do profissional foram revogadas.
	ErrRefreshReutilizado = fmt.Errorf("refresh token reutilizado: %w", ErrNaoAutenticado)
)

// IDsDemonstracao são os ids fixos dos profissionais fictícios da migração de carga
// (20261117000150_profissionais_demo.sql). Não podem existir em produção.
var IDsDemonstracao = []string{
	"0d5b1c1e-7a10-4c1e-9b11-000000000001",
	"0d5b1c1e-7a10-4c1e-9b11-000000000002",
	"0d5b1c1e-7a10-4c1e-9b11-000000000003",
}

// Comprimentos máximos dos campos de entrada (os mesmos de packages/contratos).
const (
	MaximoRegistro     = 40
	MaximoUF           = 2
	MaximoSenha        = 200
	MinimoSenha        = 8
	MaximoNome         = 120
	MaximoTextoLog     = 100
	MaximoDetalheBytes = 8 << 10
)

// CampoInvalido descreve um campo rejeitado na validação.
type CampoInvalido struct {
	Campo    string `json:"campo"`
	Mensagem string `json:"mensagem"`
}

// ErroValidacao agrupa os campos rejeitados (HTTP 422).
type ErroValidacao struct{ Detalhes []CampoInvalido }

func (e *ErroValidacao) Error() string { return "validação" }

// Profissional de saúde que autentica por CRM, COREN ou id de socorrista.
type Profissional struct {
	ID           string
	Nome         string
	TipoRegistro string
	Registro     string
	UF           string
	Papel        string
	SenhaHash    string
	Ativo        bool
}

// TipoRegistroValido confere o tipo de registro aceito no login.
func TipoRegistroValido(t string) bool {
	return t == "CRM" || t == "COREN" || t == "SOCORRISTA"
}

// ProfissionalRepository lê profissionais.
type ProfissionalRepository interface {
	// BuscarPorRegistro devolve ErrNaoEncontrado quando não existe.
	BuscarPorRegistro(ctx context.Context, tipoRegistro, registro, uf string) (Profissional, error)
	// Inserir grava um profissional novo e devolve-o com o id; registro repetido
	// (tipo + registro + UF) vira ErroValidacao.
	Inserir(ctx context.Context, p Profissional) (Profissional, error)
}

// SessaoRepository guarda sessões de refresh token (somente o hash).
type SessaoRepository interface {
	Criar(ctx context.Context, profissionalID, refreshHash string, dispositivoID *string, expiraEm time.Time) error
	// Rotacionar revoga a sessão do hash antigo e cria a nova, de forma atômica.
	// Devolve ErrNaoAutenticado se o hash antigo não existe, expirou, foi revogado
	// ou o profissional está inativo.
	Rotacionar(ctx context.Context, hashAntigo, hashNovo string, expiraEm time.Time) (Profissional, error)
	Revogar(ctx context.Context, profissionalID, refreshHash string) error
}

// VerificadorSenha confere a senha contra o hash guardado.
type VerificadorSenha interface {
	Verificar(senha, hash string) bool
}

// EmissorToken emite o access token do profissional.
type EmissorToken interface {
	Emitir(p Profissional, agora time.Time) (string, error)
}

var reUUID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// UUIDValido aceita apenas UUID em minúsculas (convenção do contrato).
func UUIDValido(s string) bool { return reUUID.MatchString(s) }

// NovoUUID gera um UUID v4.
func NovoUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:]) // crypto/rand.Read não falha
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
