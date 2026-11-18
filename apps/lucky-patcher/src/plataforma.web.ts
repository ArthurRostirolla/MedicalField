// Navegador: SQLite WASM + OPFS num Worker, uma aba por vez (Web Locks).
import type { ExecutorSql } from './banco/executor.ts';

export const ehNativo = (): boolean => false;

/** Outra aba ja esta com o banco aberto. */
export class OutraAbaAberta extends Error {
  constructor() {
    super('O MedicalField já está aberto em outra aba deste navegador.');
    this.name = 'OutraAbaAberta';
  }
}

/**
 * Web Locks: o banco (OPFS) so pode ter um dono. A trava dura enquanto a aba existir;
 * a segunda aba recebe `OutraAbaAberta` e mostra o aviso em vez de abrir o banco.
 */
function travarAbaUnica(): Promise<void> {
  if (!('locks' in navigator)) return Promise.resolve(); // sem Web Locks, o proprio OPFS recusa a segunda aba
  return new Promise((resolver, rejeitar) => {
    void navigator.locks.request('medicalfield-banco-local', { ifAvailable: true }, (trava) => {
      if (!trava) {
        rejeitar(new OutraAbaAberta());
        return undefined;
      }
      resolver();
      return new Promise<void>(() => undefined); // nunca resolve: segura a trava ate a aba fechar
    });
  });
}

export async function abrirExecutor(): Promise<ExecutorSql> {
  await travarAbaUnica();
  // Pede ao navegador para nao despejar o banco sob pressao de disco (ele pode recusar; nao bloqueia).
  void navigator.storage?.persist?.().catch(() => false);
  const { abrirExecutorWeb } = await import('./banco/executorWeb.ts');
  return abrirExecutorWeb();
}

export const redeDoAparelho = (): boolean => navigator.onLine;

export function assinarRede(aoVoltar: () => void, aoCair: () => void): () => void {
  window.addEventListener('online', aoVoltar);
  window.addEventListener('offline', aoCair);
  return () => {
    window.removeEventListener('online', aoVoltar);
    window.removeEventListener('offline', aoCair);
  };
}
