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
    // Rede de seguranca: classe 22 do SQLSTATE = "o dado nao serve" (texto com NUL, data impossivel,
    // numero fora da faixa...). E culpa do que foi enviado, nao do servidor: 422, para o outbox do app
    // tratar como rejeicao definitiva em vez de reenviar para sempre.
    if (/^22[0-9A-Z]{3}$/.test(codigo)) return new ErroAplicacao('VALIDACAO', 'Dados inválidos.', [
      { campo: 'corpo', mensagem: 'contém valor que não pode ser gravado' },
    ]);
    // Rede de seguranca: chave estrangeira que escapou das conferencias dos casos de uso.
    if (codigo === '23503') return new ErroAplicacao('VALIDACAO', 'Dados inválidos.', [
      { campo: 'corpo', mensagem: 'referência a registro inexistente' },
    ]);
  }
  return new ErroAplicacao('ERRO_INTERNO', 'Erro interno.');
}

/**
 * Texto do erro tecnico para o log. A mensagem de um erro do Postgres repete o valor recebido
 * ("invalid input syntax for type uuid: ..."), entao dele so sai o SQLSTATE.
 */
export function descreverErro(erro: unknown): string {
  if (!(erro instanceof Error)) return 'erro não identificado';
  const codigo: unknown = (erro as { code?: unknown }).code;
  return typeof codigo === 'string' && /^[0-9A-Z]{5}$/.test(codigo)
    ? `${erro.name}: SQLSTATE ${codigo}`
    : `${erro.name}: ${erro.message}`;
}

/** So as linhas "at ..." da pilha: a primeira repete a mensagem. */
const pilhaSemMensagem = (erro: unknown): string | undefined =>
  erro instanceof Error
    ? erro.stack?.split('\n').filter((linha) => /^\s+at /.test(linha)).join('\n')
    : undefined;

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
      this.log.error(`${traduzido.codigo}: ${descreverErro(erro)}`, {
        requestId,
        ...(traduzido.codigo === 'ERRO_INTERNO' ? { pilha: pilhaSemMensagem(erro) } : {}),
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
