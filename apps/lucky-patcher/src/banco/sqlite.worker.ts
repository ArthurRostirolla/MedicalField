// SQLite de verdade no navegador: WASM oficial + OPFS (VFS opfs-sahpool), dentro de um Worker.
// O commit so retorna depois do flush dos arquivos no OPFS (synchronous=FULL): fechar a aba logo
// em seguida nao perde nada. Ver docs/durabilidade.md.
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { ExecutorSql } from './executor.ts';
import { criarExecutorOo1, type BancoOo1 } from './executorOo1.ts';

const pronto: Promise<ExecutorSql> = (async () => {
  const sqlite3 = await sqlite3InitModule();
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'medicalfield', initialCapacity: 8 });
  const banco = new pool.OpfsSAHPoolDb('/medicalfield.db');
  banco.exec('PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
  return criarExecutorOo1(banco as unknown as BancoOo1);
})();

interface Pedido {
  id: number;
  metodo: 'consultar' | 'transacao' | 'fechar' | 'abrir';
  args: unknown[];
}

const escopo = self as unknown as { onmessage: (e: MessageEvent<Pedido>) => void; postMessage(m: unknown): void };

escopo.onmessage = async ({ data }) => {
  try {
    const executor = await pronto;
    const resultado =
      data.metodo === 'abrir'
        ? null
        : await (executor[data.metodo] as (...a: unknown[]) => Promise<unknown>)(...data.args);
    escopo.postMessage({ id: data.id, resultado });
  } catch (erro) {
    escopo.postMessage({ id: data.id, erro: erro instanceof Error ? erro.message : String(erro) });
  }
};
