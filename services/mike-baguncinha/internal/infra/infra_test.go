package infra

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"medicalfield/mike-baguncinha/internal/dominio"
)

func TestSenha(t *testing.T) {
	hash := GerarHashSenha("correta")
	if !strings.HasPrefix(hash, "$argon2id$v=19$m=19456,t=2,p=1$") {
		t.Fatalf("formato inesperado: %s", hash)
	}
	if GerarHashSenha("correta") == hash {
		t.Fatal("dois hashes da mesma senha devem ter sais diferentes")
	}
	v := Argon2id{}
	if !v.Verificar("correta", hash) {
		t.Fatal("senha correta recusada")
	}
	if v.Verificar("errada", hash) {
		t.Fatal("senha errada aceita")
	}
	for _, ruim := range []string{"", "texto", "$argon2i$v=19$m=19456,t=2,p=1$YQ$YQ", "$argon2id$v=19$m=19456,t=0,p=1$YQ$YQ", "$argon2id$v=19$m=19456,t=2,p=1$!!$YQ"} {
		if v.Verificar("correta", ruim) {
			t.Fatalf("hash malformado aceito: %q", ruim)
		}
	}
}

var profissionalTeste = dominio.Profissional{
	ID: "3f0e0d6e-2a51-4c55-9d0c-6d1f6a4f0001", Nome: "Dra. Teste", TipoRegistro: "CRM", Registro: "1", UF: "RS", Papel: dominio.PapelAdmin,
}

func TestTokenEmissaoEValidacao(t *testing.T) {
	tokens, err := NovosTokens("")
	if err != nil {
		t.Fatal(err)
	}
	agora := time.Now()
	bruto, err := tokens.Emitir(profissionalTeste, agora)
	if err != nil {
		t.Fatal(err)
	}

	p, err := tokens.Validar(bruto)
	if err != nil {
		t.Fatalf("token válido recusado: %v", err)
	}
	esperado := profissionalTeste
	esperado.Ativo = true
	if p != esperado {
		t.Fatalf("claims divergentes: %+v", p)
	}

	// Cabeçalho e claims exatamente como no contrato.
	partes := strings.Split(bruto, ".")
	var cabecalho, corpo map[string]any
	decodificar(t, partes[0], &cabecalho)
	decodificar(t, partes[1], &corpo)
	if cabecalho["alg"] != "EdDSA" || cabecalho["kid"] != tokens.Kid() {
		t.Fatalf("cabeçalho inesperado: %v", cabecalho)
	}
	for _, claim := range []string{"iss", "sub", "nome", "tipoRegistro", "registro", "uf", "papel", "iat", "exp", "jti"} {
		if _, ok := corpo[claim]; !ok {
			t.Errorf("claim ausente: %s", claim)
		}
	}
	if corpo["iss"] != "medicalfield" || corpo["exp"].(float64)-corpo["iat"].(float64) != 900 {
		t.Fatalf("iss/validade inesperados: %v", corpo)
	}

	// O JWKS publica a mesma chave que assina.
	chave := tokens.JWKS()["keys"].([]map[string]string)[0]
	x, _ := base64.RawURLEncoding.DecodeString(chave["x"])
	if chave["kid"] != tokens.Kid() || chave["kty"] != "OKP" || chave["crv"] != "Ed25519" || chave["alg"] != "EdDSA" || chave["use"] != "sig" || !ed25519.PublicKey(x).Equal(tokens.publica) {
		t.Fatalf("JWKS inesperado: %v", chave)
	}
}

func TestTokenRecusados(t *testing.T) {
	tokens, _ := NovosTokens("")
	outros, _ := NovosTokens("")
	agora := time.Now()

	expirado, _ := tokens.Emitir(profissionalTeste, agora.Add(-16*time.Minute))
	outraChave, _ := outros.Emitir(profissionalTeste, agora)
	valido, _ := tokens.Emitir(profissionalTeste, agora)
	partes := strings.Split(valido, ".")

	c := jwt.MapClaims{"iss": "medicalfield", "sub": profissionalTeste.ID, "papel": "ADMIN", "exp": agora.Add(time.Hour).Unix()}
	// Confusão de algoritmo: HS256 "assinado" com a chave pública.
	hs256, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString([]byte(tokens.publica))
	semAssinatura, _ := jwt.NewWithClaims(jwt.SigningMethodNone, c).SignedString(jwt.UnsafeAllowNoneSignatureType)
	outroEmissor, _ := jwt.NewWithClaims(jwt.SigningMethodEdDSA, jwt.MapClaims{"iss": "outro", "sub": "x", "exp": agora.Add(time.Hour).Unix()}).SignedString(tokens.privada)
	semExp, _ := jwt.NewWithClaims(jwt.SigningMethodEdDSA, jwt.MapClaims{"iss": "medicalfield", "sub": "x"}).SignedString(tokens.privada)

	casos := map[string]string{
		"vazio": "", "lixo": "a.b.c", "expirado": expirado, "outra chave": outraChave,
		"adulterado": partes[0] + "." + base64.RawURLEncoding.EncodeToString([]byte(`{"iss":"medicalfield","sub":"x","papel":"ADMIN","exp":9999999999}`)) + "." + partes[2],
		"hs256":      hs256, "alg none": semAssinatura, "outro emissor": outroEmissor, "sem exp": semExp,
	}
	for nome, bruto := range casos {
		if _, err := tokens.Validar(bruto); err == nil {
			t.Errorf("%s: token deveria ser recusado", nome)
		}
	}
}

func TestTokenChavePEM(t *testing.T) {
	_, privada, _ := ed25519.GenerateKey(nil)
	der, _ := x509.MarshalPKCS8PrivateKey(privada)
	chavePEM := string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))

	a, err := NovosTokens(chavePEM)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := NovosTokens(chavePEM)
	if a.Kid() != b.Kid() {
		t.Fatal("a mesma chave deve gerar o mesmo kid")
	}
	bruto, _ := a.Emitir(profissionalTeste, time.Now())
	if _, err := b.Validar(bruto); err != nil {
		t.Fatalf("token da mesma chave recusado: %v", err)
	}
	if _, err := NovosTokens("não é pem"); err == nil {
		t.Fatal("PEM inválido deveria falhar")
	}
}

func decodificar(t *testing.T, parte string, destino any) {
	t.Helper()
	bruto, err := base64.RawURLEncoding.DecodeString(parte)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(bruto, destino); err != nil {
		t.Fatal(err)
	}
}
