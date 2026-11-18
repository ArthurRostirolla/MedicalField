package aplicacao

import (
	"testing"
	"time"
)

func TestLimitadorTentativas(t *testing.T) {
	l := NovoLimitadorTentativas(5, 15*time.Minute)
	inicio := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	chave := "10.0.0.1|CRM|100001"

	for i := range 5 {
		if l.Bloqueado(chave, inicio) {
			t.Fatalf("bloqueou antes da 5ª falha (falha %d)", i+1)
		}
		l.RegistrarFalha(chave, inicio.Add(time.Duration(i)*time.Minute))
	}
	if !l.Bloqueado(chave, inicio.Add(5*time.Minute)) {
		t.Fatal("deveria bloquear depois de 5 falhas")
	}
	if l.Bloqueado("10.0.0.2|CRM|100001", inicio) || l.Bloqueado("10.0.0.1|CRM|999", inicio) {
		t.Fatal("o bloqueio não pode vazar para outro IP ou outro registro")
	}
	// A janela desliza: 15 min depois da 1ª falha, restam 4 dentro da janela.
	if l.Bloqueado(chave, inicio.Add(15*time.Minute)) {
		t.Fatal("deveria liberar quando a falha mais antiga sai da janela")
	}
	l.RegistrarFalha(chave, inicio.Add(15*time.Minute))
	if !l.Bloqueado(chave, inicio.Add(15*time.Minute)) {
		t.Fatal("deveria bloquear de novo ao voltar a 5 falhas na janela")
	}
	l.Limpar(chave)
	if l.Bloqueado(chave, inicio.Add(15*time.Minute)) {
		t.Fatal("login bem-sucedido deveria zerar a contagem")
	}
	// Depois da janela inteira, nada fica guardado.
	l.RegistrarFalha(chave, inicio)
	l.Bloqueado(chave, inicio.Add(time.Hour))
	if len(l.falhas) != 0 {
		t.Fatalf("chaves vencidas deveriam ser removidas: %v", l.falhas)
	}
}
