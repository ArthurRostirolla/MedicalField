package aplicacao

import (
	"sync"
	"time"
)

// TetoEntradasLimitador é o máximo de chaves guardadas por limitador.
const TetoEntradasLimitador = 50000

// LimitadorTentativas conta falhas de login por chave em memória.
// ponytail: estado por processo; zera ao reiniciar e, com mais de uma réplica, o limite
// vira N × réplicas — mover para o Postgres se o serviço escalar horizontalmente.
type LimitadorTentativas struct {
	mu     sync.Mutex
	falhas map[string][]time.Time
	maximo int
	janela time.Duration
	teto   int
}

// NovoLimitadorTentativas cria um limitador de `maximo` falhas por `janela`.
func NovoLimitadorTentativas(maximo int, janela time.Duration) *LimitadorTentativas {
	return &LimitadorTentativas{falhas: map[string][]time.Time{}, maximo: maximo, janela: janela, teto: TetoEntradasLimitador}
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
	validas := l.recentes(chave, agora)
	if validas == nil && len(l.falhas) >= l.teto {
		// No teto: primeiro descarta as chaves vencidas.
		for c := range l.falhas {
			l.recentes(c, agora)
		}
		// ponytail: ainda cheio, descarta uma chave qualquer (o mapa itera em ordem aleatória).
		// Enfraquece o limite de uma vítima ao acaso só sob 50 mil chaves vivas; trocar por
		// LRU se isso virar um vetor real.
		if len(l.falhas) >= l.teto {
			for c := range l.falhas {
				delete(l.falhas, c)
				break
			}
		}
	}
	// Além do máximo não há o que guardar: a chave já está bloqueada.
	if len(validas) >= l.maximo {
		validas = validas[1:]
	}
	l.falhas[chave] = append(validas, agora)
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
