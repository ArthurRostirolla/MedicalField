// Aparelho (Android e iOS): banco nativo cifrado. A versao web fica em plataforma.web.ts (o Metro escolhe pelo sufixo).
import type { ExecutorSql } from './banco/executor.ts';

export const ehNativo = (): boolean => true;

/** So acontece na web (duas abas); existe aqui para a tela de bloqueio ter um tipo unico. */
export class OutraAbaAberta extends Error {}

export async function abrirExecutor(): Promise<ExecutorSql> {
  const { abrirExecutorNativo } = await import('./banco/executorExpo.ts');
  return abrirExecutorNativo();
}

/** No aparelho o monitor de conectividade (ping) decide; nao ha `navigator.onLine` confiavel. */
export const redeDoAparelho = (): boolean => true;

export function assinarRede(_aoVoltar: () => void, _aoCair: () => void): () => void {
  return () => undefined;
}
