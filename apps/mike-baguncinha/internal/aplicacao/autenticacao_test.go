package aplicacao

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"medicalfield/mike-baguncinha/internal/dominio"
)

// Dublês mínimos: só o registro "existe" está cadastrado, e a senha certa é "certa".
type repositorioFalso struct{}

func (repositorioFalso) BuscarPorRegistro(_ context.Context, _, registro, _ string) (dominio.Profissional, error) {
	if registro != "existe" {
		return dominio.Profissional{}, dominio.ErrNaoEncontrado
	}
	return dominio.Profissional{ID: "1", Registro: registro, SenhaHash: "hash-real", Ativo: true}, nil
}
func (repositorioFalso) Inserir(_ context.Context, p dominio.Profissional) (dominio.Profissional, error) {
	p.ID = "novo"
	return p, nil
}
func (repositorioFalso) Criar(context.Context, string, string, *string, time.Time) error { return nil }
func (repositorioFalso) Rotacionar(context.Context, string, string, time.Time) (dominio.Profissional, error) {
	return dominio.Profissional{}, dominio.ErrNaoAutenticado
}
func (repositorioFalso) Revogar(context.Context, string, string) error          { return nil }
func (repositorioFalso) Emitir(dominio.Profissional, time.Time) (string, error) { return "jwt", nil }

// verificadorLento conta quantas verificações rodam ao mesmo tempo.
type verificadorLento struct {
	duracao            time.Duration
	agora, pico, total atomic.Int32
	hashes             sync.Map
}

func (v *verificadorLento) Verificar(senha, hash string) bool {
	n := v.agora.Add(1)
	defer v.agora.Add(-1)
	for {
		pico := v.pico.Load()
		if n <= pico || v.pico.CompareAndSwap(pico, n) {
			break
		}
	}
	v.total.Add(1)
	v.hashes.Store(hash, true)
	time.Sleep(v.duracao)
	return senha == "certa" && hash == "hash-real"
}

func novoCasoDeUso(v dominio.VerificadorSenha, vagas int, espera time.Duration) *AutenticacaoUseCase {
	return &AutenticacaoUseCase{
		Profissionais: repositorioFalso{}, Sessoes: repositorioFalso{}, Senhas: v, Tokens: repositorioFalso{},
		Limitador:      NovoLimitadorTentativas(5, 15*time.Minute),
		LimitadorConta: NovoLimitadorTentativas(20, 15*time.Minute),
		Vagas:          make(chan struct{}, vagas), EsperaVaga: espera,
		HashFalso: "hash-falso", Agora: time.Now,
	}
}

// entrarEmParalelo dispara n logins de uma vez (IPs e registros distintos, metade inexistente).
func entrarEmParalelo(a *AutenticacaoUseCase, n int) []error {
	erros := make([]error, n)
	var grupo sync.WaitGroup
	for i := range n {
		grupo.Add(1)
		go func() {
			defer grupo.Done()
			registro := "existe"
			if i%2 == 1 {
				registro = fmt.Sprintf("inexistente-%d", i)
			}
			_, erros[i] = a.Entrar(context.Background(), EntradaLogin{TipoRegistro: "CRM", Registro: registro, Senha: "errada", IP: fmt.Sprintf("10.0.0.%d", i)})
		}()
	}
	grupo.Wait()
	return erros
}

// D-QA-01: N logins simultâneos nunca passam do teto de verificações de senha em paralelo.
func TestLoginsConcorrentesRespeitamOTetoDeVerificacoes(t *testing.T) {
	v := &verificadorLento{duracao: 15 * time.Millisecond}
	a := novoCasoDeUso(v, 2, 5*time.Second)

	for i, err := range entrarEmParalelo(a, 32) {
		if !errors.Is(err, dominio.ErrCredenciaisInvalidas) {
			t.Fatalf("login %d: esperado credenciais inválidas, obtido %v", i, err)
		}
	}
	if v.pico.Load() > 2 || v.total.Load() != 32 {
		t.Fatalf("pico de %d verificações simultâneas (teto 2), %d no total (esperado 32)", v.pico.Load(), v.total.Load())
	}
	// O hash falso (registro inexistente) passa pelo mesmo semáforo que o hash real.
	if _, ok := v.hashes.Load("hash-falso"); !ok {
		t.Fatal("o caminho do registro inexistente deveria verificar o hash falso")
	}
	if _, ok := v.hashes.Load("hash-real"); !ok {
		t.Fatal("o caminho do registro existente deveria verificar o hash real")
	}
}

// D-QA-01: quem espera além do prazo recebe indisponível (503), e o teto continua valendo.
func TestLoginSemVagaNoPrazoRespondeIndisponivel(t *testing.T) {
	v := &verificadorLento{duracao: 300 * time.Millisecond}
	a := novoCasoDeUso(v, 2, 20*time.Millisecond)

	var atendidos, recusados int
	for _, err := range entrarEmParalelo(a, 16) {
		switch {
		case errors.Is(err, dominio.ErrCredenciaisInvalidas):
			atendidos++
		case errors.Is(err, dominio.ErrIndisponivel):
			recusados++
		default:
			t.Fatalf("erro inesperado: %v", err)
		}
	}
	if atendidos != 2 || recusados != 14 || v.pico.Load() > 2 {
		t.Fatalf("esperado 2 atendidos e 14 recusados com pico ≤ 2; obtido %d, %d, pico %d", atendidos, recusados, v.pico.Load())
	}
	// Recusa por falta de vaga não é falha de senha: não conta para o bloqueio.
	if a.LimitadorConta.Bloqueado("CRM|existe", time.Now()) {
		t.Fatal("503 por falta de vaga não pode contar como tentativa de login")
	}
	// Requisição cancelada enquanto espera também sai sem verificar.
	a.Vagas <- struct{}{}
	a.Vagas <- struct{}{}
	a.EsperaVaga = time.Minute
	ctx, cancelar := context.WithCancel(context.Background())
	cancelar()
	if _, err := a.Entrar(ctx, EntradaLogin{TipoRegistro: "CRM", Registro: "existe", Senha: "certa", IP: "10.9.9.9"}); !errors.Is(err, dominio.ErrIndisponivel) {
		t.Fatalf("esperado indisponível com o contexto cancelado, obtido %v", err)
	}
}

// D-QA-12: força bruta distribuída (um IP por tentativa) esbarra no limite por conta.
func TestLimitePorContaIndependenteDeIP(t *testing.T) {
	a := novoCasoDeUso(&verificadorLento{}, 2, time.Second)
	entrar := func(ip, registro, senha string) error {
		_, err := a.Entrar(context.Background(), EntradaLogin{TipoRegistro: "CRM", Registro: registro, Senha: senha, IP: ip})
		return err
	}
	for i := range 20 {
		if err := entrar(fmt.Sprintf("10.1.0.%d", i), "existe", "errada"); !errors.Is(err, dominio.ErrCredenciaisInvalidas) {
			t.Fatalf("tentativa %d: esperado credenciais inválidas, obtido %v", i+1, err)
		}
	}
	if err := entrar("10.2.0.1", "existe", "errada"); !errors.Is(err, dominio.ErrMuitasTentativas) {
		t.Fatalf("a 21ª falha na conta, de um IP novo, deveria ser bloqueada; obtido %v", err)
	}
	if err := entrar("10.2.0.2", "existe", "certa"); !errors.Is(err, dominio.ErrMuitasTentativas) {
		t.Fatalf("conta bloqueada deveria recusar até a senha certa; obtido %v", err)
	}
	if err := entrar("10.2.0.1", "outro", "errada"); !errors.Is(err, dominio.ErrCredenciaisInvalidas) {
		t.Fatalf("o bloqueio de uma conta não pode vazar para outra; obtido %v", err)
	}
	// Login certo zera só o contador por IP: não renova as tentativas contra a conta.
	b := novoCasoDeUso(&verificadorLento{}, 2, time.Second)
	a = b
	for range 4 {
		_ = entrar("10.3.0.1", "existe", "errada")
	}
	if err := entrar("10.3.0.1", "existe", "certa"); err != nil {
		t.Fatalf("login certo antes do limite deveria passar: %v", err)
	}
	if b.Limitador.Bloqueado("10.3.0.1|CRM|existe", time.Now()) || len(b.LimitadorConta.falhas["CRM|existe"]) != 4 {
		t.Fatalf("esperado contador por IP zerado e 4 falhas na conta: %v", b.LimitadorConta.falhas)
	}
}

// D-QA-12: o mapa do limitador tem teto de entradas e cada chave guarda no máximo `maximo` falhas.
func TestLimitadorTemTetoDeEntradas(t *testing.T) {
	l := NovoLimitadorTentativas(5, 15*time.Minute)
	l.teto = 100
	agora := time.Now()
	for i := range 1000 {
		l.RegistrarFalha(fmt.Sprintf("chave-%d", i), agora)
	}
	if len(l.falhas) > 100 {
		t.Fatalf("o limitador guardou %d chaves (teto 100)", len(l.falhas))
	}
	for range 50 {
		l.RegistrarFalha("insistente", agora)
	}
	if len(l.falhas["insistente"]) != 5 || !l.Bloqueado("insistente", agora) {
		t.Fatalf("uma chave deveria guardar no máximo 5 falhas e seguir bloqueada: %d", len(l.falhas["insistente"]))
	}
	// Chaves vencidas saem antes de qualquer chave viva ser descartada.
	l.RegistrarFalha("nova", agora.Add(time.Hour))
	if len(l.falhas) != 1 {
		t.Fatalf("as chaves vencidas deveriam ter sido varridas: restaram %d", len(l.falhas))
	}
}
