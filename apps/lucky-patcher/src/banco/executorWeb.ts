// Adaptador web do ExecutorSql: conversa com o Worker que e dono do SQLite/OPFS.
import { ErroBancoLocal, type ComandoSql, type ExecutorSql, type Parametro } from './executor.ts';

export async function abrirExecutorWeb(): Promise<ExecutorSql> {
  const worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' });
  let proximoId = 1;
  const esperas = new Map<number, { resolver: (v: unknown) => void; rejeitar: (e: Error) => void }>();

  worker.onmessage = ({ data }: MessageEvent<{ id: number; resultado?: unknown; erro?: string }>) => {
    const espera = esperas.get(data.id);
    if (!espera) return;
    esperas.delete(data.id);
    if (data.erro !== undefined) espera.rejeitar(new ErroBancoLocal(data.erro));
    else espera.resolver(data.resultado);
  };
  worker.onerror = (evento) => {
    for (const espera of esperas.values()) espera.rejeitar(new ErroBancoLocal(evento.message || 'falha no banco local'));
    esperas.clear();
  };

  const pedir = <T>(metodo: string, ...args: unknown[]) =>
    new Promise<T>((resolver, rejeitar) => {
      const id = proximoId++;
      esperas.set(id, { resolver: resolver as (v: unknown) => void, rejeitar });
      worker.postMessage({ id, metodo, args });
    });

  await pedir('abrir'); // falha aqui se o navegador nao tiver OPFS: erro explicito, nunca banco em memoria
  return {
    consultar: <T>(sql: string, params?: Parametro[]) => pedir<T[]>('consultar', sql, params),
    consultarSomenteLeitura: <T>(sql: string, params?: Parametro[]) => pedir<T[]>('consultarSomenteLeitura', sql, params),
    transacao: (comandos: ComandoSql[]) => pedir<void>('transacao', comandos),
    fechar: async () => {
      await pedir('fechar');
      worker.terminate();
    },
  };
}
