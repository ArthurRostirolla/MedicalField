// Uma função por rota usada pelo portal (docs/contratos.md §5, §6, §7). Toda resposta é validada.
import {
  atendimentoListadoSchema,
  documentoComIntegridadeSchema,
  documentoSchema,
  envioSchema,
  fichaSchema,
  logAcessoSchema,
  medicamentoSchema,
  paginaSchema,
  pessoaSchema,
  prontuarioComPessoaSchema,
  prontuarioSchema,
  CABECALHOS,
  atendimentoSchema,
  eventoSchema,
  type AtendimentoEntrada,
  type EventoEntrada,
  type EnvioEntrada,
  type Medicamento,
} from '@medicalfield/contratos';
import { z } from 'zod';
import { api, apiComStatus, baixar } from './cliente';

export interface Pagina {
  limite?: number;
  cursor?: string;
}

export const listarAtendimentos = (pagina: Pagina) =>
  api('/atendimento', paginaSchema(atendimentoListadoSchema), { consulta: { ...pagina } });

export const listarAtendimentosDaPessoa = (pessoaId: string, pagina: Pagina) =>
  api(`/atendimento/${pessoaId}`, paginaSchema(atendimentoListadoSchema), { consulta: { ...pagina } });

/** Atendimento aberto pelo portal (mesma rota do app; o id vem do cliente para a repeticao ser idempotente). */
export const registrarAtendimento = (entrada: AtendimentoEntrada) =>
  api('/atendimento', atendimentoSchema, { metodo: 'POST', corpo: entrada });

/** Acrescenta um evento a linha do tempo; corrigir = evento RETIFICACAO, nada se reescreve. */
export const registrarEvento = (entrada: EventoEntrada) =>
  api('/atendimento-evento', eventoSchema, { metodo: 'POST', corpo: entrada });

export const obterFicha = (atendimentoId: string) => api(`/ficha/${atendimentoId}`, fichaSchema);

export const listarProntuarios = (pagina: Pagina) =>
  api('/prontuario', paginaSchema(prontuarioComPessoaSchema), { consulta: { ...pagina } });

export const obterProntuario = (pessoaId: string) => api(`/prontuario/${pessoaId}`, prontuarioSchema);
export const obterPessoa = (id: string) => api(`/pessoa/${id}`, pessoaSchema);

export const listarDuplicatas = (pagina: Pagina) =>
  api('/pessoa', paginaSchema(pessoaSchema), { consulta: { ...pagina, somenteDuplicatas: true } });

/**
 * Cadastro de apoio inteiro, para a busca local enxergar tudo.
 * ponytail: teto de 2.000 itens (10 páginas de 200); passou disso, a busca precisa ir para o servidor.
 */
export async function listarTodosMedicamentos(incluirInativos: boolean): Promise<Medicamento[]> {
  const todos: Medicamento[] = [];
  let cursor: string | undefined;
  for (let pagina = 0; pagina < 10; pagina += 1) {
    const resposta = await api('/medicamento', paginaSchema(medicamentoSchema), {
      consulta: { limite: 200, cursor, incluirInativos },
    });
    todos.push(...resposta.itens);
    if (!resposta.proximoCursor) break;
    cursor = resposta.proximoCursor;
  }
  return todos;
}

export interface FiltroLogs extends Pagina {
  de?: string;
  ate?: string;
  servico?: string;
  profissionalId?: string;
}
export const listarLogsAcesso = (filtro: FiltroLogs) =>
  api('/auditoria/acesso', paginaSchema(logAcessoSchema), { consulta: { ...filtro } });

/* ───────── Jaiminho: ficha em PDF e envios ───────── */

export const listarDocumentos = (atendimentoId: string) =>
  api('/documento', z.object({ itens: z.array(documentoSchema) }), { consulta: { atendimentoId } });

export const obterDocumento = (id: string) => api(`/documento/${id}`, documentoComIntegridadeSchema);

/** 201 = PDF novo; 200 = já existia um com o mesmo conteúdo. */
export const gerarFicha = (atendimentoId: string) =>
  apiComStatus('/documento/ficha-atendimento', documentoSchema, { metodo: 'POST', corpo: { atendimentoId } });

export const baixarPdf = (documentoId: string) => baixar(`/documento/${documentoId}/pdf`);

export const listarEnvios = (documentoId: string) =>
  api(`/documento/${documentoId}/email`, z.object({ itens: z.array(envioSchema) }));

export const enviarPorEmail = (documentoId: string, envio: EnvioEntrada, chaveIdempotencia: string) =>
  api(`/documento/${documentoId}/email`, envioSchema, {
    metodo: 'POST',
    corpo: envio,
    cabecalhos: { [CABECALHOS.chaveIdempotencia]: chaveIdempotencia },
  });

export const reenviar = (envioId: string) =>
  api(`/documento/email/${envioId}/reenvio`, envioSchema, { metodo: 'POST' });
