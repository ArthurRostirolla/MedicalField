package infra

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"medicalfield/mike-baguncinha/internal/dominio"
)

// Postgres implementa os repositórios do domínio com SQL explícito.
type Postgres struct{ Pool *pgxpool.Pool }

// traduzir converte erros do driver em erros do domínio.
func traduzir(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return dominio.ErrNaoEncontrado
	}
	var erroSQL *pgconn.PgError
	if errors.As(err, &erroSQL) {
		return err // erro devolvido pelo servidor: defeito nosso (500)
	}
	// Sem resposta do servidor (conexão, timeout): dependência fora (503).
	return fmt.Errorf("%w: %v", dominio.ErrIndisponivel, err)
}

// BuscarPorRegistro implementa dominio.ProfissionalRepository.
func (pg *Postgres) BuscarPorRegistro(ctx context.Context, tipoRegistro, registro, uf string) (dominio.Profissional, error) {
	var p dominio.Profissional
	err := pg.Pool.QueryRow(ctx, `
		SELECT id::text, nome, tipo_registro, registro, uf, papel, senha_hash, ativo
		  FROM identidade.profissional
		 WHERE tipo_registro = $1 AND registro = $2 AND uf = $3`,
		tipoRegistro, registro, uf,
	).Scan(&p.ID, &p.Nome, &p.TipoRegistro, &p.Registro, &p.UF, &p.Papel, &p.SenhaHash, &p.Ativo)
	return p, traduzir(err)
}

// Inserir implementa dominio.ProfissionalRepository.
func (pg *Postgres) Inserir(ctx context.Context, p dominio.Profissional) (dominio.Profissional, error) {
	err := pg.Pool.QueryRow(ctx, `
		INSERT INTO identidade.profissional (tipo_registro, registro, uf, nome, papel, senha_hash, ativo)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text`,
		p.TipoRegistro, p.Registro, p.UF, p.Nome, p.Papel, p.SenhaHash, p.Ativo,
	).Scan(&p.ID)
	var erroSQL *pgconn.PgError
	if errors.As(err, &erroSQL) && erroSQL.Code == "23505" {
		return p, &dominio.ErroValidacao{Detalhes: []dominio.CampoInvalido{{Campo: "registro", Mensagem: "já cadastrado"}}}
	}
	return p, traduzir(err)
}

// Criar implementa dominio.SessaoRepository.
func (pg *Postgres) Criar(ctx context.Context, profissionalID, refreshHash string, dispositivoID *string, expiraEm time.Time) error {
	_, err := pg.Pool.Exec(ctx, `
		INSERT INTO identidade.sessao (profissional_id, refresh_hash, dispositivo_id, expira_em)
		VALUES ($1::text::uuid, $2, $3::text::uuid, $4)`,
		profissionalID, refreshHash, dispositivoID, expiraEm)
	return traduzir(err)
}

// Rotacionar implementa dominio.SessaoRepository. Um único comando: o UPDATE trava a
// linha, então duas renovações simultâneas do mesmo token nunca passam as duas.
func (pg *Postgres) Rotacionar(ctx context.Context, hashAntigo, hashNovo string, expiraEm time.Time) (dominio.Profissional, error) {
	p := dominio.Profissional{Ativo: true}
	err := pg.Pool.QueryRow(ctx, `
		WITH antiga AS (
			UPDATE identidade.sessao s
			   SET revogada_em = now()
			  FROM identidade.profissional p
			 WHERE s.refresh_hash = $1 AND s.revogada_em IS NULL AND s.expira_em > now()
			   AND p.id = s.profissional_id AND p.ativo
			RETURNING p.id, p.nome, p.tipo_registro, p.registro, p.uf, p.papel, s.dispositivo_id
		), nova AS (
			INSERT INTO identidade.sessao (profissional_id, refresh_hash, dispositivo_id, expira_em)
			SELECT id, $2, dispositivo_id, $3 FROM antiga
		)
		SELECT id::text, nome, tipo_registro, registro, uf, papel FROM antiga`,
		hashAntigo, hashNovo, expiraEm,
	).Scan(&p.ID, &p.Nome, &p.TipoRegistro, &p.Registro, &p.UF, &p.Papel)
	if !errors.Is(err, pgx.ErrNoRows) {
		return p, traduzir(err)
	}
	// O token não valia. Se é um refresh JÁ REVOGADO (rotacionado ou encerrado), alguém está
	// reapresentando um token antigo: sinal de roubo. Revoga todas as sessões ativas do
	// profissional — o ladrão e a vítima caem, e a vítima entra de novo com a senha.
	// Efeito colateral aceito: duas renovações simultâneas do MESMO token derrubam a sessão.
	tag, err := pg.Pool.Exec(ctx, `
		UPDATE identidade.sessao SET revogada_em = now()
		 WHERE revogada_em IS NULL
		   AND profissional_id = (SELECT profissional_id FROM identidade.sessao
		                           WHERE refresh_hash = $1 AND revogada_em IS NOT NULL)`,
		hashAntigo)
	if err != nil {
		return p, traduzir(err)
	}
	if tag.RowsAffected() > 0 {
		return p, dominio.ErrRefreshReutilizado
	}
	return p, dominio.ErrNaoAutenticado
}

// ContarDemonstracao conta os profissionais de demonstração (ids fixos da migração de carga) ativos.
func (pg *Postgres) ContarDemonstracao(ctx context.Context) (int, error) {
	var n int
	err := pg.Pool.QueryRow(ctx,
		`SELECT count(*) FROM identidade.profissional WHERE ativo AND id::text = ANY($1::text[])`,
		dominio.IDsDemonstracao).Scan(&n)
	return n, traduzir(err)
}

// ExpurgarSessoes apaga as sessões vencidas (o refresh delas já não vale de qualquer forma).
func (pg *Postgres) ExpurgarSessoes(ctx context.Context) (int, error) {
	tag, err := pg.Pool.Exec(ctx, `DELETE FROM identidade.sessao WHERE expira_em < now()`)
	return int(tag.RowsAffected()), traduzir(err)
}

// Revogar implementa dominio.SessaoRepository.
func (pg *Postgres) Revogar(ctx context.Context, profissionalID, refreshHash string) error {
	_, err := pg.Pool.Exec(ctx, `
		UPDATE identidade.sessao SET revogada_em = now()
		 WHERE refresh_hash = $1 AND profissional_id = $2::text::uuid AND revogada_em IS NULL`,
		refreshHash, profissionalID)
	return traduzir(err)
}

// InserirAcessos implementa dominio.AuditoriaRepository (um INSERT por lote).
func (pg *Postgres) InserirAcessos(ctx context.Context, linhas []dominio.LogAcesso) error {
	n := len(linhas)
	datas, servicos, ips, profissionais := make([]time.Time, n), make([]string, n), make([]string, n), make([]*string, n)
	metodos, rotas, status, tempos, requests := make([]string, n), make([]string, n), make([]int32, n), make([]int32, n), make([]string, n)
	for i, l := range linhas {
		datas[i], servicos[i], ips[i], profissionais[i] = l.DataHora, l.Servico, l.IPCliente, l.ProfissionalID
		metodos[i], rotas[i], status[i], tempos[i], requests[i] = l.Metodo, l.Rota, int32(l.StatusCode), int32(l.TempoMs), l.RequestID
	}
	_, err := pg.Pool.Exec(ctx, `
		INSERT INTO auditoria.log_acesso
			(data_hora, servico, ip_cliente, profissional_id, metodo, rota, status_code, tempo_ms, request_id)
		SELECT t.data_hora, t.servico, t.ip, t.profissional::uuid, t.metodo, t.rota, t.status, t.tempo, t.request_id
		  FROM unnest($1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int[], $8::int[], $9::text[])
		       AS t(data_hora, servico, ip, profissional, metodo, rota, status, tempo, request_id)`,
		datas, servicos, ips, profissionais, metodos, rotas, status, tempos, requests)
	return traduzir(err)
}

// InserirLogsCliente implementa dominio.AuditoriaRepository. ON CONFLICT DO NOTHING
// torna o lote idempotente por id, inclusive para ids repetidos dentro do próprio lote.
func (pg *Postgres) InserirLogsCliente(ctx context.Context, logs []dominio.LogCliente) (int, error) {
	n := len(logs)
	ids, profissionais, dispositivos, ocorridos := make([]string, n), make([]string, n), make([]*string, n), make([]time.Time, n)
	acoes, entidades, entidadeIDs := make([]string, n), make([]*string, n), make([]*string, n)
	resultados, online, detalhes := make([]string, n), make([]bool, n), make([]*string, n)
	for i, l := range logs {
		ids[i], profissionais[i], dispositivos[i], ocorridos[i] = l.ID, l.ProfissionalID, l.DispositivoID, l.OcorridoEm
		acoes[i], entidades[i], entidadeIDs[i] = l.Acao, l.Entidade, l.EntidadeID
		resultados[i], online[i] = l.Resultado, l.EstavaOnline
		if l.Detalhe != nil {
			texto := string(l.Detalhe)
			detalhes[i] = &texto
		}
	}
	tag, err := pg.Pool.Exec(ctx, `
		INSERT INTO auditoria.log_cliente
			(id, profissional_id, dispositivo_id, ocorrido_em, acao, entidade, entidade_id, resultado, estava_online, detalhe)
		SELECT t.id::uuid, t.profissional::uuid, t.dispositivo::uuid, t.ocorrido, t.acao, t.entidade, t.entidade_id,
		       t.resultado, t.online, t.detalhe::jsonb
		  FROM unnest($1::text[], $2::text[], $3::text[], $4::timestamptz[], $5::text[], $6::text[], $7::text[],
		              $8::text[], $9::bool[], $10::text[])
		       AS t(id, profissional, dispositivo, ocorrido, acao, entidade, entidade_id, resultado, online, detalhe)
		ON CONFLICT (id) DO NOTHING`,
		ids, profissionais, dispositivos, ocorridos, acoes, entidades, entidadeIDs, resultados, online, detalhes)
	if err != nil {
		return 0, traduzir(err)
	}
	return int(tag.RowsAffected()), nil
}

// cursorArgs separa o cursor nos dois parâmetros da comparação por chave.
func cursorArgs(c *dominio.Cursor) (*time.Time, *string) {
	if c == nil {
		return nil, nil
	}
	return &c.Instante, &c.ID
}

// ListarAcessos implementa dominio.AuditoriaRepository.
func (pg *Postgres) ListarAcessos(ctx context.Context, f dominio.FiltroAuditoria) ([]dominio.LogAcesso, error) {
	instante, id := cursorArgs(f.Cursor)
	linhas, err := pg.Pool.Query(ctx, `
		SELECT id, data_hora, servico, ip_cliente, profissional_id::text, metodo, rota, status_code, tempo_ms, request_id
		  FROM auditoria.log_acesso
		 WHERE ($1::timestamptz IS NULL OR data_hora >= $1)
		   AND ($2::timestamptz IS NULL OR data_hora <= $2)
		   AND ($3::text IS NULL OR profissional_id = $3::uuid)
		   AND ($4::text IS NULL OR servico = $4)
		   AND ($5::timestamptz IS NULL OR (data_hora, id) < ($5, $6::text::bigint))
		 ORDER BY data_hora DESC, id DESC
		 LIMIT $7`,
		f.De, f.Ate, f.ProfissionalID, f.Servico, instante, id, f.Limite)
	if err != nil {
		return nil, traduzir(err)
	}
	logs, err := pgx.CollectRows(linhas, func(r pgx.CollectableRow) (dominio.LogAcesso, error) {
		var l dominio.LogAcesso
		err := r.Scan(&l.ID, &l.DataHora, &l.Servico, &l.IPCliente, &l.ProfissionalID, &l.Metodo, &l.Rota, &l.StatusCode, &l.TempoMs, &l.RequestID)
		return l, err
	})
	return logs, traduzir(err)
}

// ListarLogsCliente implementa dominio.AuditoriaRepository.
func (pg *Postgres) ListarLogsCliente(ctx context.Context, f dominio.FiltroAuditoria) ([]dominio.LogCliente, error) {
	instante, id := cursorArgs(f.Cursor)
	linhas, err := pg.Pool.Query(ctx, `
		SELECT id::text, profissional_id::text, dispositivo_id::text, ocorrido_em, recebido_em, acao, entidade, entidade_id,
		       resultado, estava_online, detalhe::text
		  FROM auditoria.log_cliente
		 WHERE ($1::timestamptz IS NULL OR ocorrido_em >= $1)
		   AND ($2::timestamptz IS NULL OR ocorrido_em <= $2)
		   AND ($3::text IS NULL OR profissional_id = $3::uuid)
		   AND ($4::timestamptz IS NULL OR (ocorrido_em, id) < ($4, $5::text::uuid))
		 ORDER BY ocorrido_em DESC, id DESC
		 LIMIT $6`,
		f.De, f.Ate, f.ProfissionalID, instante, id, f.Limite)
	if err != nil {
		return nil, traduzir(err)
	}
	logs, err := pgx.CollectRows(linhas, func(r pgx.CollectableRow) (dominio.LogCliente, error) {
		var l dominio.LogCliente
		var detalhe *string
		err := r.Scan(&l.ID, &l.ProfissionalID, &l.DispositivoID, &l.OcorridoEm, &l.RecebidoEm, &l.Acao, &l.Entidade, &l.EntidadeID,
			&l.Resultado, &l.EstavaOnline, &detalhe)
		if detalhe != nil {
			l.Detalhe = []byte(*detalhe)
		}
		return l, err
	})
	return logs, traduzir(err)
}
