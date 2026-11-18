// D-QA-02: a porta de diagnostico e somente leitura de verdade e nunca devolve a sessao.
import { describe, expect, it } from 'vitest';
import { ConsultaRecusada, criarPortaDiagnostico } from './diagnostico.ts';
import { montar, pessoa } from './teste/apoio.ts';

async function preparar() {
  const { app, executor } = await montar(); // logado: sync_estado.sessao tem access e refresh token
  await app.pessoas.criar(pessoa('Paciente Diagnóstico'));
  return { porta: criarPortaDiagnostico(executor), executor, app };
}

describe('porta de diagnostico (window.__mf)', () => {
  it('le com SELECT', async () => {
    const { porta } = await preparar();
    expect(await porta.consultar('SELECT nome FROM pessoa WHERE nome LIKE ?', ['Paciente%'])).toEqual([{ nome: 'Paciente Diagnóstico' }]);
    expect(await porta.consultar("SELECT count(*) AS n FROM outbox WHERE status != 'CONFIRMADA';")).toEqual([{ n: 2 }]);
  });

  it('recusa UPDATE, INSERT, DELETE, CREATE, DROP, PRAGMA e varios comandos; o banco fica intacto', async () => {
    const { porta, executor } = await preparar();
    const antes = await executor.consultar('SELECT * FROM outbox ORDER BY ordem');
    const tentativas = [
      "UPDATE outbox SET status = 'CONFIRMADA'",
      "INSERT INTO pessoa (id, nome, criado_em, atualizado_em) VALUES ('x', 'x', 'x', 'x')",
      'DELETE FROM outbox',
      'CREATE TABLE prova (x INTEGER)',
      'DROP TABLE pessoa',
      'PRAGMA user_version = 99',
      'SELECT 1; DELETE FROM outbox',
      'CREATE TABLE IF NOT EXISTS qa_prova_escrita (x INTEGER); INSERT INTO qa_prova_escrita VALUES (42)',
      "WITH x AS (SELECT 1) UPDATE outbox SET status = 'CONFIRMADA'",
      '  ',
    ];
    for (const sql of tentativas) await expect(porta.consultar(sql), sql).rejects.toBeInstanceOf(ConsultaRecusada);
    await expect(porta.consultar(42 as unknown as string)).rejects.toBeInstanceOf(ConsultaRecusada);

    expect(await executor.consultar('SELECT * FROM outbox ORDER BY ordem')).toEqual(antes);
    expect(await executor.consultar("SELECT name FROM sqlite_master WHERE name IN ('prova', 'qa_prova_escrita')")).toEqual([]);
    expect(await executor.consultar('PRAGMA user_version')).not.toEqual([{ user_version: 99 }]);
  });

  it('o proprio banco recusa escrita no caminho somente leitura, e o app continua gravando depois', async () => {
    const { executor, app } = await preparar();
    await expect(executor.consultarSomenteLeitura('DELETE FROM outbox')).rejects.toThrow(/readonly|read-only/i);
    expect((await executor.consultar<{ n: number }>('SELECT count(*) AS n FROM outbox'))[0]?.n).toBe(2);
    await app.pessoas.criar(pessoa('Depois Do Diagnóstico')); // o modo somente leitura nao ficou ligado
    expect((await executor.consultar<{ n: number }>('SELECT count(*) AS n FROM outbox'))[0]?.n).toBe(4);
  });

  it('nunca devolve a sessao: sync_estado e inacessivel por SQL, com qualquer disfarce', async () => {
    const { porta, executor } = await preparar();
    const [sessao] = await executor.consultar<{ valor: string }>("SELECT valor FROM sync_estado WHERE chave = 'sessao'");
    expect(sessao?.valor).toContain('refreshToken'); // a sessao existe no banco...

    for (const sql of [
      "SELECT valor FROM sync_estado WHERE chave = 'sessao'",
      'SELECT * FROM SYNC_ESTADO',
      'SELECT substr(valor, 1) AS x FROM "sync_estado"',
      'SELECT p.nome, (SELECT valor FROM [sync_estado] LIMIT 1) AS v FROM pessoa p',
      'SELECT * FROM pessoa UNION ALL SELECT chave, valor, 1,1,1,1,1,1,1,1,1,1,1,1,1,1 FROM main.sync_estado',
    ]) {
      await expect(porta.consultar(sql), sql).rejects.toBeInstanceOf(ConsultaRecusada); // ...e nao sai por aqui
    }
    await expect(porta.estado('sessao')).rejects.toBeInstanceOf(ConsultaRecusada);
    await expect(porta.estado("sessao' OR '1'='1")).rejects.toBeInstanceOf(ConsultaRecusada);

    // O que nao e segredo continua disponivel para os testes.
    expect(await porta.estado('dispositivo_id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(await porta.estado('modo_simulado')).toBe('offline');
    expect(await porta.estado('cursor')).toBeNull();
    // Nada nas demais tabelas carrega token.
    const tudo = JSON.stringify(await porta.consultar('SELECT * FROM log_local'));
    expect(tudo).not.toMatch(/token-\d|refresh-\d/);
  });
});
