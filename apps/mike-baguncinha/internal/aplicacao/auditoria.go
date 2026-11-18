package aplicacao

import (
	"context"
	"fmt"

	"medicalfield/mike-baguncinha/internal/dominio"
)

// AuditoriaUseCase recebe os logs do cliente e consulta a auditoria.
type AuditoriaUseCase struct {
	Repositorio dominio.AuditoriaRepository
}

// RegistrarLogsCliente grava o lote de forma idempotente por id.
func (a *AuditoriaUseCase) RegistrarLogsCliente(ctx context.Context, logs []dominio.LogCliente) (aceitos, duplicados int, err error) {
	if len(logs) > dominio.MaximoLogsPorChamada {
		return 0, 0, &dominio.ErroValidacao{Detalhes: []dominio.CampoInvalido{{
			Campo: "logs", Mensagem: fmt.Sprintf("máximo de %d por chamada", dominio.MaximoLogsPorChamada),
		}}}
	}
	if len(logs) == 0 {
		return 0, 0, nil
	}
	aceitos, err = a.Repositorio.InserirLogsCliente(ctx, logs)
	if err != nil {
		return 0, 0, err
	}
	return aceitos, len(logs) - aceitos, nil
}

// ListarAcessos devolve uma página de logs de acesso e o cursor da próxima (nil no fim).
func (a *AuditoriaUseCase) ListarAcessos(ctx context.Context, f dominio.FiltroAuditoria) ([]dominio.LogAcesso, *dominio.Cursor, error) {
	limite := f.Limite
	f.Limite = limite + 1 // uma linha a mais revela se há próxima página
	linhas, err := a.Repositorio.ListarAcessos(ctx, f)
	if err != nil {
		return nil, nil, err
	}
	if len(linhas) <= limite {
		return linhas, nil, nil
	}
	linhas = linhas[:limite]
	ultima := linhas[limite-1]
	return linhas, &dominio.Cursor{Instante: ultima.DataHora, ID: fmt.Sprint(ultima.ID)}, nil
}

// ListarLogsCliente devolve uma página de logs do cliente e o cursor da próxima (nil no fim).
func (a *AuditoriaUseCase) ListarLogsCliente(ctx context.Context, f dominio.FiltroAuditoria) ([]dominio.LogCliente, *dominio.Cursor, error) {
	limite := f.Limite
	f.Limite = limite + 1
	linhas, err := a.Repositorio.ListarLogsCliente(ctx, f)
	if err != nil {
		return nil, nil, err
	}
	if len(linhas) <= limite {
		return linhas, nil, nil
	}
	linhas = linhas[:limite]
	ultima := linhas[limite-1]
	return linhas, &dominio.Cursor{Instante: ultima.OcorridoEm, ID: ultima.ID}, nil
}
