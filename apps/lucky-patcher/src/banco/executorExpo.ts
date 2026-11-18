// Adaptador nativo do ExecutorSql: expo-sqlite com SQLCipher (plugin `useSQLCipher` no app.config.ts).
// Vale igual para Android e iOS. A chave do banco e aleatoria, gerada no primeiro uso e guardada no
// expo-secure-store (Android Keystore / iOS Keychain) como "so neste aparelho": um backup do arquivo
// (iCloud, transferencia entre aparelhos) chega cifrado e sem a chave. A sessao vive neste banco.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { ComandoSql, ExecutorSql, Parametro } from './executor.ts';

const NOME = 'medicalfield.db';
const CHAVE_SEGREDO = 'medicalfield-banco-chave';
// iOS: nunca sincroniza com o iCloud Keychain nem vai para outro aparelho. (Android ignora.)
const SO_NESTE_APARELHO = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

async function chaveDoBanco(): Promise<string> {
  const guardada = await SecureStore.getItemAsync(CHAVE_SEGREDO, SO_NESTE_APARELHO);
  if (guardada) return guardada;
  const nova = `${randomUUID()}${randomUUID()}`.replaceAll('-', '');
  await SecureStore.setItemAsync(CHAVE_SEGREDO, nova, SO_NESTE_APARELHO);
  return nova;
}

/**
 * Expo Go (app da loja) traz o SQLite comum, sem SQLCipher: la o banco fica SEM cifra. Serve so para
 * demonstrar com dados ficticios; o development build e o release continuam cifrados.
 */
export const noExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

async function abrir(chave: string | null, novaConexao: boolean): Promise<SQLiteDatabase> {
  const banco = await openDatabaseAsync(NOME, { useNewConnection: novaConexao });
  // A chave so tem [0-9a-f]: nao ha como fechar a aspa.
  if (chave) await banco.execAsync(`PRAGMA key = '${chave}'`);
  await banco.execAsync('PRAGMA foreign_keys = ON');
  return banco;
}

export async function abrirExecutorNativo(): Promise<ExecutorSql> {
  if (noExpoGo) console.warn('Expo Go: banco local SEM cifra (SQLCipher so no development build). Use apenas dados ficticios.');
  const chave = noExpoGo ? null : await chaveDoBanco();
  const banco = await abrir(chave, false);
  await banco.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
  // Conexao separada e travada em somente leitura: a porta de diagnostico nunca escreve.
  const leitura = await abrir(chave, true);
  await leitura.execAsync('PRAGMA query_only = ON');

  // Uma transacao por vez na conexao principal (BEGIN dentro de BEGIN falharia).
  let fila: Promise<unknown> = Promise.resolve();

  return {
    consultar: <T>(sql: string, params: Parametro[] = []) => banco.getAllAsync<T>(sql, params),
    consultarSomenteLeitura: <T>(sql: string, params: Parametro[] = []) => leitura.getAllAsync<T>(sql, params),
    transacao(comandos: ComandoSql[]) {
      const vez = fila.then(async () => {
        await banco.execAsync('BEGIN IMMEDIATE');
        try {
          for (const comando of comandos) await banco.runAsync(comando.sql, comando.params ?? []);
          await banco.execAsync('COMMIT');
        } catch (erro) {
          await banco.execAsync('ROLLBACK');
          throw erro;
        }
      });
      fila = vez.catch(() => undefined);
      return vez;
    },
    async fechar() {
      await leitura.closeAsync();
      await banco.closeAsync();
    },
  };
}
