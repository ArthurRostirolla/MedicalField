package infra

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Parâmetros do Argon2id para hashes novos (recomendação mínima da OWASP: 19 MiB, t=2, p=1).
const (
	argonMemoriaKiB = 19 * 1024
	argonTempo      = 2
	argonThreads    = 1
	argonTamSal     = 16
	argonTamChave   = 32
)

// GerarHashSenha devolve o hash no formato PHC:
// $argon2id$v=19$m=19456,t=2,p=1$<sal>$<hash> (base64 sem preenchimento).
func GerarHashSenha(senha string) string {
	sal := make([]byte, argonTamSal)
	_, _ = rand.Read(sal) // crypto/rand.Read não falha
	chave := argon2.IDKey([]byte(senha), sal, argonTempo, argonMemoriaKiB, argonThreads, argonTamChave)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version, argonMemoriaKiB, argonTempo, argonThreads,
		base64.RawStdEncoding.EncodeToString(sal), base64.RawStdEncoding.EncodeToString(chave))
}

// Argon2id implementa dominio.VerificadorSenha.
type Argon2id struct{}

// Verificar recalcula o hash com os parâmetros gravados e compara em tempo constante.
func (Argon2id) Verificar(senha, hash string) bool {
	partes := strings.Split(hash, "$")
	if len(partes) != 6 || partes[1] != "argon2id" || partes[2] != fmt.Sprintf("v=%d", argon2.Version) {
		return false
	}
	var memoria, tempo uint32
	var threads uint8
	if _, err := fmt.Sscanf(partes[3], "m=%d,t=%d,p=%d", &memoria, &tempo, &threads); err != nil || tempo == 0 || threads == 0 {
		return false
	}
	sal, err := base64.RawStdEncoding.DecodeString(partes[4])
	if err != nil {
		return false
	}
	esperado, err := base64.RawStdEncoding.DecodeString(partes[5])
	if err != nil || len(esperado) == 0 {
		return false
	}
	calculado := argon2.IDKey([]byte(senha), sal, tempo, memoria, threads, uint32(len(esperado)))
	return subtle.ConstantTimeCompare(calculado, esperado) == 1
}
