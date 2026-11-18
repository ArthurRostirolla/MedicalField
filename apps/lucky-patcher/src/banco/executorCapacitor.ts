// Adaptador nativo do ExecutorSql: @capacitor-community/sqlite (SQLCipher) no Android.
// A senha do banco e gerada no primeiro uso e guardada pelo plugin no armazenamento seguro do
// sistema (Android Keystore / EncryptedSharedPreferences). A sessao (refresh token) vive dentro
// deste banco cifrado. NAO foi exercitado em aparelho neste trabalho: ver docs/android.md.
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { ComandoSql, ExecutorSql, Parametro } from './executor.ts';

const NOME = 'medicalfield';

export async function abrirExecutorNativo(): Promise<ExecutorSql> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const { result: temSegredo } = await sqlite.isSecretStored();
  if (!temSegredo) await sqlite.setEncryptionSecret(`${crypto.randomUUID()}${crypto.randomUUID()}`);

  await sqlite.checkConnectionsConsistency().catch(() => undefined);
  const jaAberta = (await sqlite.isConnection(NOME, false)).result;
  const banco = jaAberta
    ? await sqlite.retrieveConnection(NOME, false)
    : await sqlite.createConnection(NOME, true, 'secret', 1, false);
  await banco.open();

  return {
    async consultar<T>(sql: string, params: Parametro[] = []) {
      return ((await banco.query(sql, params)).values ?? []) as T[];
    },
    async consultarSomenteLeitura<T>(sql: string, params: Parametro[] = []) {
      // O plugin nao tem modo somente leitura por consulta: aqui a garantia e o filtro da porta de
      // diagnostico (um unico SELECT) mais o caminho de leitura do plugin (`query`).
      return ((await banco.query(sql, params)).values ?? []) as T[];
    },
    async transacao(comandos: ComandoSql[]) {
      // `transaction = true`: o plugin abre a transacao, executa o lote e desfaz tudo se um comando falhar.
      await banco.executeSet(
        comandos.map((comando) => ({ statement: comando.sql, values: comando.params ?? [] })),
        true,
      );
    },
    async fechar() {
      await sqlite.closeConnection(NOME, false);
    },
  };
}
