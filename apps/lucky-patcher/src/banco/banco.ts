// Banco local: migracoes na abertura, escrita sempre em transacao e aviso de mudanca para a interface.
import { ErroBancoLocal, type ComandoSql, type ExecutorSql, type Parametro } from './executor.ts';
import m001 from './migracoes/001_inicial.ts';

/** Migracoes em ordem: o numero e o `user_version` que ela deixa no banco. Nova migracao = nova linha. */
export const MIGRACOES = [{ versao: 1, sql: m001 }];

const semComentarios = (sql: string) => sql.replace(/--.*$/gm, '');

/** Aplica as migracoes pendentes; cada uma (com o novo `user_version`) e uma transacao. */
export async function migrar(executor: ExecutorSql): Promise<number> {
  const [linha] = await executor.consultar<{ user_version: number }>('PRAGMA user_version');
  let versao = linha?.user_version ?? 0;
  for (const migracao of MIGRACOES) {
    if (migracao.versao <= versao) continue;
    const comandos = semComentarios(migracao.sql)
      .split(/;\s*$/m)
      .map((sql) => sql.trim())
      .filter(Boolean)
      .map((sql) => ({ sql }));
    await executor.transacao([...comandos, { sql: `PRAGMA user_version = ${migracao.versao}` }]);
    versao = migracao.versao;
  }
  return versao;
}

export class Banco {
  private ouvintes = new Set<() => void>();
  /** Muda a cada escrita; a interface usa para reler. */
  versao = 0;

  constructor(private readonly executor: ExecutorSql) {}

  async consultar<T = Record<string, unknown>>(sql: string, params?: Parametro[]): Promise<T[]> {
    try {
      return await this.executor.consultar<T>(sql, params);
    } catch (erro) {
      throw new ErroBancoLocal(`Falha ao ler o banco local: ${mensagemDe(erro)}`, { cause: erro });
    }
  }

  /** Uma transacao: ou tudo, ou nada. Falha => ErroBancoLocal (a tela nunca mostra "salvo"). */
  async gravar(comandos: ComandoSql[]): Promise<void> {
    if (comandos.length === 0) return;
    try {
      await this.executor.transacao(comandos);
    } catch (erro) {
      throw new ErroBancoLocal(`Falha ao gravar no banco local: ${mensagemDe(erro)}`, { cause: erro });
    }
    this.versao++;
    for (const ouvinte of this.ouvintes) ouvinte();
  }

  assinar(ouvinte: () => void): () => void {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  }

  // ----- sync_estado (chave/valor) -----

  async lerEstado(chave: string): Promise<string | null> {
    const [linha] = await this.consultar<{ valor: string }>('SELECT valor FROM sync_estado WHERE chave = ?', [chave]);
    return linha?.valor ?? null;
  }

  async gravarEstado(chave: string, valor: string | null): Promise<void> {
    await this.gravar([sqlEstado(chave, valor)]);
  }
}

export function sqlEstado(chave: string, valor: string | null): ComandoSql {
  return valor === null
    ? { sql: 'DELETE FROM sync_estado WHERE chave = ?', params: [chave] }
    : {
        sql: 'INSERT INTO sync_estado (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor',
        params: [chave, valor],
      };
}

export const mensagemDe = (erro: unknown): string => (erro instanceof Error ? erro.message : String(erro));

// ----- pequenos montadores de SQL (colunas em snake_case, objetos em camelCase) -----

const paraSnake = (nome: string) => nome.replace(/[A-Z]/g, (letra) => `_${letra.toLowerCase()}`);
const paraCamel = (nome: string) => nome.replace(/_([a-z])/g, (_, letra: string) => letra.toUpperCase());

const valorSql = (valor: unknown): Parametro =>
  valor === undefined || valor === null
    ? null
    : typeof valor === 'boolean'
      ? Number(valor)
      : typeof valor === 'object'
        ? JSON.stringify(valor)
        : (valor as string | number);

/** `INSERT` de um objeto camelCase. Com `conflito`, vira upsert; `somenteSe` condiciona a atualizacao. */
export function sqlInserir(
  tabela: string,
  objeto: Record<string, unknown>,
  upsert?: { conflito: string; somenteSe?: string },
): ComandoSql {
  const campos = Object.keys(objeto);
  const colunas = campos.map(paraSnake);
  let sql = `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`;
  if (upsert) {
    const atualizar = colunas.filter((coluna) => coluna !== upsert.conflito).map((c) => `${c} = excluded.${c}`);
    sql += ` ON CONFLICT(${upsert.conflito}) DO UPDATE SET ${atualizar.join(', ')}`;
    if (upsert.somenteSe) sql += ` WHERE ${upsert.somenteSe}`;
  }
  return { sql, params: campos.map((campo) => valorSql(objeto[campo])) };
}

/** Linha do SQLite (snake_case) => objeto camelCase; `booleanos` e `json` dizem o que converter. */
export function linhaParaObjeto<T>(
  linha: Record<string, unknown>,
  opcoes: { booleanos?: string[]; json?: string[] } = {},
): T {
  const objeto: Record<string, unknown> = {};
  for (const [coluna, valor] of Object.entries(linha)) {
    const campo = paraCamel(coluna);
    objeto[campo] = opcoes.booleanos?.includes(campo)
      ? Boolean(valor)
      : opcoes.json?.includes(campo) && typeof valor === 'string'
        ? JSON.parse(valor)
        : valor;
  }
  return objeto as T;
}
