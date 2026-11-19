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
  profissionalSchema,
  prontuarioItemSchema,
  type PessoaEntrada,
  type ProntuarioEntrada,
  type ProntuarioItemEntrada,
  CABECALHOS,
  atendimentoSchema,
  eventoSchema,
  type AtendimentoEntrada,
  type EventoEntrada,
  type EnvioEntrada,
  type Medicamento,
  type ProfissionalEntrada,
} from '@medicalfield/contratos';
import { z } from 'zod';
import { api, apiComStatus, baixar, ErroApi, semServidor } from './cliente';
import {
  atendimentoNaFila,
  comFilaNaFicha,
  comFilaNosAtendimentos,
  comItensDaFila,
  fichaNaFila,
  pessoaLocal,
  pessoasNaFila,
  prontuarioNaFila,
  prontuarioVazio,
} from './local';
import { escrever } from './offline';

/**
 * Leitura com o que foi gravado offline como reserva: sem servidor (e sem última leitura guardada),
 * ou o servidor ainda sem o comando da fila (404), vale o que `local` montar.
 */
async function ouLocal<T>(remoto: () => Promise<T>, local: () => T | undefined | Promise<T | undefined>): Promise<T> {
  try {
    return await remoto();
  } catch (erro) {
    if (semServidor(erro) || (erro instanceof ErroApi && erro.status === 404)) {
      const daqui = await local();
      if (daqui !== undefined) return daqui;
    }
    throw erro;
  }
}

export interface Pagina {
  limite?: number;
  cursor?: string;
}

/** Primeira página sem servidor e nunca lida: só o que está na fila. */
const paginaVazia = { itens: [], proximoCursor: null };

export async function listarAtendimentos(pagina: Pagina) {
  const lista = await ouLocal(
    () => api('/atendimento', paginaSchema(atendimentoListadoSchema), { consulta: { ...pagina } }),
    () => (pagina.cursor ? undefined : paginaVazia),
  );
  return pagina.cursor ? lista : { ...lista, itens: comFilaNosAtendimentos(lista.itens) };
}

export async function listarAtendimentosDaPessoa(pessoaId: string, pagina: Pagina) {
  const lista = await ouLocal(
    () => api(`/atendimento/${pessoaId}`, paginaSchema(atendimentoListadoSchema), { consulta: { ...pagina } }),
    () => (pagina.cursor ? undefined : paginaVazia),
  );
  return pagina.cursor ? lista : { ...lista, itens: comFilaNosAtendimentos(lista.itens, pessoaId) };
}

/** Atendimento aberto pelo portal (mesma rota do app; o id vem do cliente para a repeticao ser idempotente). */
export const registrarAtendimento = (entrada: AtendimentoEntrada) =>
  escrever('/atendimento', atendimentoSchema, entrada, 'Início de atendimento');

/** Acrescenta um evento a linha do tempo; corrigir = evento RETIFICACAO, nada se reescreve. */
export const registrarEvento = (entrada: EventoEntrada) =>
  escrever('/atendimento-evento', eventoSchema, entrada, `Evento ${entrada.tipo}`);

/** Ficha do servidor, da última leitura ou montada da fila; sempre com o que ainda não subiu. */
export async function obterFicha(atendimentoId: string) {
  const ficha = await ouLocal(
    () => api(`/ficha/${atendimentoId}`, fichaSchema),
    async () => {
      const aberto = atendimentoNaFila(atendimentoId);
      if (!aberto) return undefined;
      const { pessoaId, iniciadoEm } = aberto.entrada;
      const pessoa = await obterPessoa(pessoaId);
      const prontuario = await obterProntuario(pessoaId).catch(() => prontuarioVazio(pessoaId, iniciadoEm));
      return fichaNaFila(atendimentoId, pessoa, prontuario);
    },
  );
  return comFilaNaFicha(ficha);
}

export const listarProntuarios = (pagina: Pagina) =>
  api('/prontuario', paginaSchema(prontuarioComPessoaSchema), { consulta: { ...pagina } });

export const obterProntuario = async (pessoaId: string) =>
  comItensDaFila(await ouLocal(() => api(`/prontuario/${pessoaId}`, prontuarioSchema), () => prontuarioNaFila(pessoaId)));

export const obterPessoa = (id: string) => ouLocal(() => api(`/pessoa/${id}`, pessoaSchema), () => pessoaLocal(id));

/** Busca por parte do nome ou do CPF (a lista de prontuários não filtra). Cadastros da fila entram na frente. */
export async function buscarPessoas(busca: string, pagina: Pagina) {
  const lista = await ouLocal(
    () => api('/pessoa', paginaSchema(pessoaSchema), { consulta: { ...pagina, ...(busca ? { busca } : {}) } }),
    () => (pagina.cursor ? undefined : { itens: [], proximoCursor: null }),
  );
  if (pagina.cursor) return lista;
  const termo = busca.toLocaleLowerCase('pt-BR');
  const digitos = busca.replace(/\D/g, '');
  const conhecidos = new Set(lista.itens.map((p) => p.id));
  const daFila = pessoasNaFila().filter(
    (p) => !conhecidos.has(p.id) && (!busca || p.nome.toLocaleLowerCase('pt-BR').includes(termo) || (!!digitos && !!p.cpf?.includes(digitos))),
  );
  return { ...lista, itens: [...daFila, ...lista.itens] };
}

/* Escritas do cadastro: os mesmos comandos do app, com id gerado aqui (repetir = 200, não duplica). */
export const cadastrarPessoa = (entrada: PessoaEntrada) => escrever('/pessoa', pessoaSchema, entrada, 'Cadastro de paciente');

/** Pessoa que já tem prontuário: o servidor devolve o existente com os itens unidos. */
export const cadastrarProntuario = (entrada: ProntuarioEntrada) =>
  escrever('/prontuario', prontuarioSchema, entrada, 'Prontuário');

export const acrescentarItem = (entrada: ProntuarioItemEntrada) =>
  escrever('/prontuario-item', prontuarioItemSchema, entrada, 'Item do prontuário');

/** Inativar é um ato registrado: o item continua no prontuário, marcado. */
export const inativarItem = (id: string) =>
  escrever(`/prontuario-item/${id}/inativacao`, prontuarioItemSchema, { inativadoEm: new Date().toISOString() }, 'Inativação de item');

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

/** Atendimento que ainda está na fila não tem ficha em PDF no servidor. */
export const listarDocumentos = (atendimentoId: string) =>
  ouLocal(
    () => api('/documento', z.object({ itens: z.array(documentoSchema) }), { consulta: { atendimentoId } }),
    () => (atendimentoNaFila(atendimentoId) ? { itens: [] } : undefined),
  );

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

/** Cadastro de profissional (só ADMIN). Registro repetido volta como VALIDACAO no campo `registro`. */
export const cadastrarProfissional = (entrada: ProfissionalEntrada) =>
  api('/auth/profissional', profissionalSchema, { metodo: 'POST', corpo: entrada });
