package aplicacao

import (
	"sync"
	"time"
)

// LimitadorTentativas conta falhas de login por chave (IP + registro) em memória.
// ponytail: estado por processo; com mais de uma réplica o limite vira 5 × réplicas —
// mover para o Postgres se o serviço escalar horizontalmente.
type LimitadorTentativas struct {
	mu     sync.Mutex
	falhas map[string][]time.Time
	maximo int
	janela time.Duration
}

// NovoLimitadorTentativas cria o limitador (contrato: 5 falhas em 15 min).
func NovoLimitadorTentativas(maximo int, janela time.Duration) *LimitadorTentativas {
	return &LimitadorTentativas{falhas: map[string][]time.Time{}, maximo: maximo, janela: janela}
}

// Bloqueado informa se a chave já atingiu o máximo de falhas dentro da janela.
func (l *LimitadorTentativas) Bloqueado(chave string, agora time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.recentes(chave, agora)) >= l.maximo
}

// RegistrarFalha soma uma falha à chave.
func (l *LimitadorTentativas) RegistrarFalha(chave string, agora time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	// Varre as chaves vencidas para o mapa não crescer sem limite.
	if len(l.falhas) >= 10000 {
		for c := range l.falhas {
			l.recentes(c, agora)
		}
	}
	l.falhas[chave] = append(l.recentes(chave, agora), agora)
}

// Limpar zera a contagem (login bem-sucedido).
func (l *LimitadorTentativas) Limpar(chave string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.falhas, chave)
}

// recentes descarta as falhas fora da janela e devolve as restantes.
func (l *LimitadorTentativas) recentes(chave string, agora time.Time) []time.Time {
	todas := l.falhas[chave]
	inicio := 0
	for inicio < len(todas) && agora.Sub(todas[inicio]) >= l.janela {
		inicio++
	}
	validas := todas[inicio:]
	if len(validas) == 0 {
		delete(l.falhas, chave)
		return nil
	}
	l.falhas[chave] = validas
	return validas
}
