package infra

import (
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"medicalfield/mike-baguncinha/internal/dominio"
)

const emissor = "medicalfield"

// Tokens emite e valida o access token (JWT EdDSA) e publica a chave em JWKS.
type Tokens struct {
	privada ed25519.PrivateKey
	publica ed25519.PublicKey
	kid     string
}

// NovosTokens lê a chave Ed25519 de um PEM PKCS#8; com PEM vazio, gera uma chave efêmera.
func NovosTokens(chavePEM string) (*Tokens, error) {
	var privada ed25519.PrivateKey
	if chavePEM == "" {
		_, privada, _ = ed25519.GenerateKey(nil)
	} else {
		bloco, _ := pem.Decode([]byte(chavePEM))
		if bloco == nil {
			return nil, errors.New("JWT_CHAVE_PRIVADA_PEM: PEM inválido")
		}
		chave, err := x509.ParsePKCS8PrivateKey(bloco.Bytes)
		if err != nil {
			return nil, fmt.Errorf("JWT_CHAVE_PRIVADA_PEM: %w", err)
		}
		var ok bool
		if privada, ok = chave.(ed25519.PrivateKey); !ok {
			return nil, errors.New("JWT_CHAVE_PRIVADA_PEM: a chave não é Ed25519")
		}
	}
	publica := privada.Public().(ed25519.PublicKey)
	// kid derivado da chave pública: muda sozinho quando a chave muda.
	soma := sha256.Sum256(publica)
	return &Tokens{privada: privada, publica: publica, kid: base64.RawURLEncoding.EncodeToString(soma[:8])}, nil
}

type claims struct {
	Nome         string `json:"nome"`
	TipoRegistro string `json:"tipoRegistro"`
	Registro     string `json:"registro"`
	UF           string `json:"uf"`
	Papel        string `json:"papel"`
	jwt.RegisteredClaims
}

// Emitir implementa dominio.EmissorToken.
func (t *Tokens) Emitir(p dominio.Profissional, agora time.Time) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims{
		Nome: p.Nome, TipoRegistro: p.TipoRegistro, Registro: p.Registro, UF: p.UF, Papel: p.Papel,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    emissor,
			Subject:   p.ID,
			IssuedAt:  jwt.NewNumericDate(agora),
			ExpiresAt: jwt.NewNumericDate(agora.Add(dominio.ValidadeAccessToken)),
			ID:        dominio.NovoUUID(),
		},
	})
	token.Header["kid"] = t.kid
	return token.SignedString(t.privada)
}

// Validar confere assinatura, algoritmo, emissor e expiração; devolve o profissional das claims.
func (t *Tokens) Validar(tokenBruto string) (dominio.Profissional, error) {
	var c claims
	_, err := jwt.ParseWithClaims(tokenBruto, &c, func(*jwt.Token) (any, error) { return t.publica, nil },
		jwt.WithValidMethods([]string{"EdDSA"}), jwt.WithIssuer(emissor), jwt.WithExpirationRequired())
	if err != nil || c.Subject == "" {
		return dominio.Profissional{}, dominio.ErrNaoAutenticado
	}
	return dominio.Profissional{
		ID: c.Subject, Nome: c.Nome, TipoRegistro: c.TipoRegistro, Registro: c.Registro, UF: c.UF, Papel: c.Papel, Ativo: true,
	}, nil
}

// JWKS devolve o conjunto de chaves públicas no formato do contrato.
func (t *Tokens) JWKS() map[string]any {
	return map[string]any{"keys": []map[string]string{{
		"kty": "OKP", "crv": "Ed25519", "kid": t.kid,
		"x": base64.RawURLEncoding.EncodeToString(t.publica), "use": "sig", "alg": "EdDSA",
	}}}
}

// Kid devolve o identificador da chave em uso.
func (t *Tokens) Kid() string { return t.kid }
