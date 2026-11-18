import { CABECALHOS } from '@medicalfield/contratos';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, type Config } from './config.ts';
import { LOG, type Log } from './log.ts';

/**
 * Atendimento encerrado: pede a ficha ao Jaiminho, que a envia sozinho ao e-mail do paciente (se houver).
 * Nao espera nem falha a requisicao: o Jaiminho e idempotente (mesma ficha = mesmo documento, um e-mail),
 * e se ele estiver fora a ficha ainda sai quando alguem gera pelo portal.
 */
@Injectable()
export class AvisoDeEncerramento {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(LOG) private readonly log: Log,
  ) {}

  avisar(atendimentoId: string, autorizacao: string | undefined, requestId: string | undefined): void {
    if (!this.config.jaiminhoUrl || !autorizacao) return;
    fetch(`${this.config.jaiminhoUrl}/api/v1/documento/ficha-atendimento`, {
      method: 'POST',
      headers: {
        Authorization: autorizacao,
        'Content-Type': 'application/json',
        ...(requestId ? { [CABECALHOS.requestId]: requestId } : {}),
      },
      body: JSON.stringify({ atendimentoId }),
      signal: AbortSignal.timeout(30_000),
    })
      .then((resposta) => {
        if (!resposta.ok) this.log.warn('jaiminho recusou a ficha do encerramento', { statusCode: resposta.status });
      })
      .catch((erro: unknown) => {
        this.log.warn('jaiminho inacessivel no encerramento', { erro: (erro as Error).name });
      });
  }
}
