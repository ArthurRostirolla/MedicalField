package dominio

import (
	"context"
	"time"
)

const (
	MaximoLogsPorChamada = 500
	LimitePadraoPagina   = 50
	LimiteMaximoPagina   = 200
)

// LogAcesso é uma requisição HTTP atendida por um dos serviços.
type LogAcesso struct {
	ID             int64
	DataHora       time.Time
	Servico        string
	IPCliente      string
	ProfissionalID *string
	Metodo         string
	Rota           string
	StatusCode     int
	TempoMs        int
	RequestID      string
}

// LogCliente é um registro gerado pelo app (possivelmente offline) e enviado depois.
type LogCliente struct {
	ID             string
	ProfissionalID string
	DispositivoID  *string
	OcorridoEm     time.Time
	RecebidoEm     time.Time
	Acao           string
	Entidade       *string
	EntidadeID     *string
	Resultado      string
	EstavaOnline   bool
	Detalhe        []byte // JSON bruto (objeto) ou nil
}

// Cursor marca a posição da última linha devolvida (paginação por chave).
type Cursor struct {
	Instante time.Time
	ID       string
}

// FiltroAuditoria reúne os filtros das consultas de auditoria.
type FiltroAuditoria struct {
	De             *time.Time
	Ate            *time.Time
	ProfissionalID *string
	Servico        *string
	Limite         int
	Cursor         *Cursor
}

// AuditoriaRepository grava e consulta os registros de auditoria (somente inserção).
type AuditoriaRepository interface {
	InserirAcessos(ctx context.Context, linhas []LogAcesso) error
	// InserirLogsCliente ignora ids já existentes e devolve quantos foram gravados.
	InserirLogsCliente(ctx context.Context, logs []LogCliente) (int, error)
	// As listagens devolvem os mais recentes primeiro, no máximo f.Limite linhas.
	ListarAcessos(ctx context.Context, f FiltroAuditoria) ([]LogAcesso, error)
	ListarLogsCliente(ctx context.Context, f FiltroAuditoria) ([]LogCliente, error)
}
