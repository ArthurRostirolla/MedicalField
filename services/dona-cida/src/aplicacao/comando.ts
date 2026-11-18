import { Inject, Injectable } from '@nestjs/common';
import { ErroAplicacao } from '../dominio/erros.ts';
import {
  UNIDADE_DE_TRABALHO,
  type Autor,
  type RegistroAuditoria,
  type RepositorioClinico,
  type UnidadeDeTrabalho,
} from '../dominio/repositorios.ts';

/** O comando recebido (padrao Command): tudo o que identifica uma escrita vinda do app ou do outbox. */
export type ContextoComando = {
  autor: Autor;
  /** `Idempotency-Key`, se enviada. */
  chaveIdempotencia: string | null;
  /** sha256 do corpo canonico, como chegou. */
  hashCorpo: string;
  metodo: string;
  /** Padrao da rota, sem ids. */
  rota: string;
  /** Horario do servidor no recebimento. */
  agora: Date;
};

export type ResultadoComando<T> = { status: 200 | 201; corpo: T };

export type Auditar = (registro: Omit<RegistroAuditoria, 'autor' | 'opId'>) => Promise<void>;

/**
 * Receptor idempotente (regra de escrita 1). Abre UMA transacao e, dentro dela:
 * confere a chave, executa a acao (dado + auditoria_clinica) e grava operacao_sync.
 * Ou entra tudo, ou nada.
 */
@Injectable()
export class ExecutorComandos {
  constructor(@Inject(UNIDADE_DE_TRABALHO) private readonly unidade: UnidadeDeTrabalho) {}

  executar<T>(
    contexto: ContextoComando,
    entidadeId: string,
    acao: (repositorio: RepositorioClinico, auditar: Auditar) => Promise<ResultadoComando<T>>,
  ): Promise<ResultadoComando<T>> {
    const opId = contexto.chaveIdempotencia;

    return this.unidade.transacao(async (repositorio) => {
      if (opId) {
        await repositorio.travarChave(opId);
        const anterior = await repositorio.buscarOperacao(opId);
        if (anterior) {
          if (anterior.hashCorpo !== contexto.hashCorpo) {
            throw new ErroAplicacao(
              'CHAVE_IDEMPOTENCIA_CONFLITANTE',
              'Esta Idempotency-Key já foi usada com outro corpo.',
            );
          }
          // Repeticao: devolve a resposta original, sem tocar em nada.
          return { status: 200, corpo: anterior.resposta as T };
        }
      }

      const resultado = await acao(repositorio, (registro) =>
        repositorio.registrarAuditoria({ ...registro, autor: contexto.autor, opId }),
      );

      if (opId) {
        await repositorio.registrarOperacao({
          opId,
          autor: contexto.autor,
          metodo: contexto.metodo,
          rota: contexto.rota,
          entidadeId,
          hashCorpo: contexto.hashCorpo,
          statusHttp: resultado.status,
          resposta: resultado.corpo,
        });
      }
      return resultado;
    });
  }
}

/** Junta as observacoes nao vazias numa so (para `auditoria_clinica.observacao`). */
export const juntarObservacoes = (...observacoes: (string | false | null | undefined)[]): string | null =>
  observacoes.filter(Boolean).join('; ') || null;
