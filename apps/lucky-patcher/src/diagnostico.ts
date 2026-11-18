// Porta de diagnostico (`window.__mf`) usada pelos testes automatizados para conferir o banco local.
// So entra no pacote quando o build e feito com VITE_DIAGNOSTICO=1 (main.tsx). Mesmo ligada:
//   - aceita UM unico SELECT (nada de INSERT/UPDATE/DELETE/CREATE/PRAGMA, nada de varios comandos);
//   - roda pelo caminho somente leitura do banco (no SQLite WASM, `PRAGMA query_only`);
//   - nunca le `sync_estado`, onde fica a sessao (access e refresh token). As chaves que nao sao
//     segredo saem por `estado(chave)`.
import type { ExecutorSql, Parametro } from './banco/executor.ts';

/** Chaves de `sync_estado` que podem ser lidas pelo diagnostico. `sessao` NAO esta aqui. */
export const CHAVES_DE_ESTADO_PUBLICAS = ['cursor', 'dispositivo_id', 'ultima_sync', 'modo_simulado', 'servidor'] as const;
export type ChaveDeEstadoPublica = (typeof CHAVES_DE_ESTADO_PUBLICAS)[number];

export class ConsultaRecusada extends Error {
  constructor(motivo: string) {
    super(`Diagnóstico somente leitura: ${motivo}`);
    this.name = 'ConsultaRecusada';
  }
}

/** Devolve o SELECT limpo, ou lanca `ConsultaRecusada`. */
export function validarConsultaDeDiagnostico(sql: unknown): string {
  if (typeof sql !== 'string') throw new ConsultaRecusada('a consulta deve ser um texto.');
  const limpo = sql.trim().replace(/;+\s*$/, '');
  // ponytail: recusa `;` ate dentro de texto entre aspas; diagnostico nao precisa disso.
  if (limpo.includes(';')) throw new ConsultaRecusada('um único comando por consulta.');
  if (!/^select\s/i.test(limpo)) throw new ConsultaRecusada('só SELECT é aceito.');
  if (/sync_estado/i.test(limpo)) throw new ConsultaRecusada('a tabela sync_estado guarda a sessão; use estado(chave).');
  return limpo;
}

export function criarPortaDiagnostico(executor: ExecutorSql) {
  return Object.freeze({
    consultar: async (sql: string, params: Parametro[] = []): Promise<Record<string, unknown>[]> =>
      executor.consultarSomenteLeitura(validarConsultaDeDiagnostico(sql), params),

    /** Valor de uma chave nao sensivel de `sync_estado` (cursor, dispositivo_id, ...). */
    estado: async (chave: string): Promise<string | null> => {
      if (!(CHAVES_DE_ESTADO_PUBLICAS as readonly string[]).includes(chave)) {
        throw new ConsultaRecusada(`a chave "${chave}" não é pública.`);
      }
      const [linha] = await executor.consultarSomenteLeitura<{ valor: string }>('SELECT valor FROM sync_estado WHERE chave = ?', [chave]);
      return linha?.valor ?? null;
    },
  });
}
