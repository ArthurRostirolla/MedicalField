import { randomUUID } from 'node:crypto';
import type { ErroResposta } from '@medicalfield/contratos';
import { Catch, HttpException, Inject, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ErroAplicacao } from '../dominio/erros.ts';
import { LOG, type Log } from '../infra/log.ts';
import type { Requisicao } from './requisicao.ts';

const CODIGOS_DE_REDE = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'EAI_AGAIN']);

/** Classes de SQLSTATE que significam "o banco esta fora ou recusando conexao". */
const bancoIndisponivel = (codigo: string, mensagem: string): boolean =>
  CODIGOS_DE_REDE.has(codigo) ||
  /^(08|53|57P)/.test(codigo) ||
  /timeout exceeded when trying to connect|connection terminated/i.test(mensagem);

/** Qualquer erro -> um erro do contrato. O que nao for reconhecido vira 500 sem detalhe interno. */
export function traduzirErro(erro: unknown): ErroAplicacao {
  if (erro instanceof ErroAplicacao) return erro;

  const status =
    erro instanceof HttpException
      ? erro.getStatus()
      : typeof (erro as { status?: unknown } | null)?.status === 'number' // erros do body-parser
        ? (erro as { status: number }).status
        : null;
  if (status !== null && status >= 400 && status < 500) {
    if (status === 401) return new ErroAplicacao('NAO_AUTENTICADO', 'Token ausente, inválido ou expirado.');
    if (status === 403) return new ErroAplicacao('SEM_PERMISSAO', 'Sem permissão.');
    if (status === 404) return new ErroAplicacao('NAO_ENCONTRADO', 'Rota não encontrada.');
    return new ErroAplicacao('VALIDACAO', 'Requisição inválida.', [
      { campo: 'corpo', mensagem: status === 413 ? 'grande demais' : 'não é um JSON válido para esta rota' },
    ]);
  }

  const { code: codigo = '', message: mensagem = '' } = (erro ?? {}) as { code?: unknown; message?: unknown };
  if (typeof codigo === 'string' && typeof mensagem === 'string') {
    if (bancoIndisponivel(codigo, mensagem)) {
      return new ErroAplicacao('SERVICO_INDISPONIVEL', 'Serviço temporariamente indisponível.');
    }
    // Rede de seguranca: chave estrangeira que escapou das conferencias dos casos de uso.
    if (codigo === '23503') return new ErroAplicacao('VALIDACAO', 'Dados inválidos.', [
      { campo: 'corpo', mensagem: 'referência a registro inexistente' },
    ]);
  }
  return new ErroAplicacao('ERRO_INTERNO', 'Erro interno.');
}

/** Filtro global: TODO erro sai no corpo padrao `{ codigo, mensagem, detalhes?, requestId }`. */
@Catch()
export class FiltroDeErros implements ExceptionFilter {
  constructor(@Inject(LOG) private readonly log: Log) {}

  catch(erro: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const requisicao = http.getRequest<Requisicao>();
    const resposta = http.getResponse<Response>();
    const requestId = requisicao.requestId ?? randomUUID();
    const traduzido = traduzirErro(erro);

    if (traduzido.status >= 500) {
      // So nome, mensagem e pilha do erro tecnico: nunca o corpo da requisicao.
      const original = erro instanceof Error ? erro : new Error('erro não identificado');
      this.log.error(`${traduzido.codigo}: ${original.name}: ${original.message}`, {
        requestId,
        ...(traduzido.codigo === 'ERRO_INTERNO' ? { pilha: original.stack } : {}),
      });
    }
    if (resposta.headersSent) return;

    const corpo: ErroResposta = {
      codigo: traduzido.codigo,
      mensagem: traduzido.message,
      ...(traduzido.detalhes ? { detalhes: traduzido.detalhes } : {}),
      requestId,
    };
    resposta.status(traduzido.status).json(corpo);
  }
}
