// Adaptador sobre a API oo1 do SQLite WASM oficial. Usado dentro do Worker (OPFS) e nos testes (memoria).
import type { ComandoSql, ExecutorSql, Parametro } from './executor.ts';

/** O minimo da API `oo1.DB` que usamos. */
export interface BancoOo1 {
  exec(opcoes: string | { sql: string; bind?: Parametro[]; rowMode?: 'object'; returnValue?: 'resultRows' }): unknown;
  close(): void;
}

export function criarExecutorOo1(banco: BancoOo1): ExecutorSql {
  const rodar = (sql: string, params?: Parametro[]) =>
    banco.exec({ sql, ...(params?.length ? { bind: params } : {}), rowMode: 'object', returnValue: 'resultRows' });
  return {
    async consultar<T>(sql: string, params?: Parametro[]) {
      return rodar(sql, params) as T[];
    },
    async transacao(comandos: ComandoSql[]) {
      banco.exec('BEGIN IMMEDIATE');
      try {
        for (const comando of comandos) rodar(comando.sql, comando.params);
        banco.exec('COMMIT');
      } catch (erro) {
        banco.exec('ROLLBACK');
        throw erro;
      }
    },
    async fechar() {
      banco.close();
    },
  };
}
