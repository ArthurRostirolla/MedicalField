// Escolhe o adaptador do banco conforme a plataforma e garante uma aba por vez no navegador.
import { Capacitor } from '@capacitor/core';
import type { ExecutorSql } from './banco/executor.ts';

export const ehNativo = (): boolean => Capacitor.isNativePlatform();

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
  if (ehNativo()) {
    const { abrirExecutorNativo } = await import('./banco/executorCapacitor.ts');
    return abrirExecutorNativo();
  }
  await travarAbaUnica();
  // Pede ao navegador para nao despejar o banco sob pressao de disco (ele pode recusar; nao bloqueia).
  void navigator.storage?.persist?.().catch(() => false);
  const { abrirExecutorWeb } = await import('./banco/executorWeb.ts');
  return abrirExecutorWeb();
}
