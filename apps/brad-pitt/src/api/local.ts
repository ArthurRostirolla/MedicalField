// O que foi gravado offline, visto como o servidor devolveria: a fila (offline.ts) guarda os comandos
// do contrato; daqui saem pessoa, prontuário, atendimento e eventos para as telas lerem antes de subir.
// Mesmo cálculo do servidor para a passagem de caso (`calcularResumo`), então a tela não muda ao sincronizar.
import {
  pessoaSchema,
  type Atendimento,
  type AtendimentoEntrada,
  type AtendimentoListado,
  type Evento,
  type EventoEntrada,
  type Ficha,
  type Pessoa,
  type PessoaEntrada,
  type Prontuario,
  type ProntuarioEntrada,
  type ProntuarioItem,
  type ProntuarioItemEntrada,
} from '@medicalfield/contratos';
import { calcularResumo, ordenarLinhaDoTempo } from '@medicalfield/dominio';
import { leiturasDe, lerSessao } from './cliente';
import { lerOffline, type Comando } from './offline';

const naFila = <T>(caminho: string): Array<{ corpo: T; comando: Comando }> =>
  lerOffline()
    .fila.filter((c) => c.caminho === caminho)
    .map((comando) => ({ corpo: comando.corpo as T, comando }));

/** Nome de quem gravou: a fila só guarda o id; o nome conhecido é o de quem está logado. */
function autor(comando: Comando): { profissionalId: string; profissionalNome: string } {
  const sessao = lerSessao();
  const nome = sessao.situacao === 'ativa' && sessao.profissional.id === comando.profissionalId ? sessao.profissional.nome : '';
  return { profissionalId: comando.profissionalId, profissionalNome: nome };
}

/* ───────── Pessoa ───────── */

function pessoaDe(e: PessoaEntrada): Pessoa {
  return {
    id: e.id,
    nome: e.nome,
    dataNascimento: e.dataNascimento ?? null,
    sexo: e.sexo ?? null,
    cpf: e.cpf ?? null,
    cns: e.cns ?? null,
    telefone: e.telefone ?? null,
    email: e.email ?? null,
    contatoEmergenciaNome: e.contatoEmergenciaNome ?? null,
    contatoEmergenciaTelefone: e.contatoEmergenciaTelefone ?? null,
    contatoEmergenciaEmail: e.contatoEmergenciaEmail ?? null,
    naoIdentificada: e.naoIdentificada ?? false,
    descricaoIdentificacao: e.descricaoIdentificacao ?? null,
    possivelDuplicataDe: null,
    criadoEm: e.editadoEm,
    atualizadoEm: e.editadoEm,
  };
}

/** Pessoas cadastradas offline, a mais recente primeiro. */
export const pessoasNaFila = (): Pessoa[] => naFila<PessoaEntrada>('/pessoa').map(({ corpo }) => pessoaDe(corpo)).reverse();

/** Cadastrada offline, ou já vista numa lista de pessoas desta aba (quem foi escolhido na busca). */
export function pessoaLocal(id: string): Pessoa | undefined {
  const daFila = pessoasNaFila().find((p) => p.id === id);
  if (daFila) return daFila;
  for (const pagina of leiturasDe('/pessoa')) {
    const achada = (pagina as { itens?: unknown[] } | null)?.itens?.find((p) => (p as { id?: string }).id === id);
    const pessoa = pessoaSchema.safeParse(achada);
    if (pessoa.success) return pessoa.data;
  }
  return undefined;
}

/* ───────── Prontuário ───────── */

/** Itens acrescentados e inativações ainda na fila, aplicados sobre o prontuário. */
export function comItensDaFila(prontuario: Prontuario): Prontuario {
  const conhecidos = new Set(prontuario.itens.map((i) => i.id));
  const novos: ProntuarioItem[] = naFila<ProntuarioItemEntrada>('/prontuario-item')
    .filter(({ corpo }) => corpo.pessoaId === prontuario.pessoaId && !conhecidos.has(corpo.id))
    .map(({ corpo, comando }) => ({
      id: corpo.id,
      prontuarioId: prontuario.id,
      pessoaId: corpo.pessoaId,
      tipo: corpo.tipo,
      descricao: corpo.descricao,
      registradoPor: comando.profissionalId,
      registradoEm: corpo.registradoEm,
      inativadoEm: null,
    }));
  const inativados = new Map(
    lerOffline()
      .fila.map((c) => [/^\/prontuario-item\/([^/]+)\/inativacao$/.exec(c.caminho)?.[1], (c.corpo as { inativadoEm: string }).inativadoEm] as const)
      .filter((par): par is [string, string] => !!par[0]),
  );
  if (!novos.length && !inativados.size) return prontuario;
  const itens = [...prontuario.itens, ...novos].map((i) => (inativados.has(i.id) && !i.inativadoEm ? { ...i, inativadoEm: inativados.get(i.id)! } : i));
  return { ...prontuario, itens };
}

export function prontuarioNaFila(pessoaId: string): Prontuario | undefined {
  const achado = naFila<ProntuarioEntrada>('/prontuario').findLast(({ corpo }) => corpo.pessoaId === pessoaId);
  if (!achado) return undefined;
  const { corpo, comando } = achado;
  return {
    id: corpo.id,
    pessoaId,
    tipoSanguineo: corpo.tipoSanguineo ?? null,
    observacoes: corpo.observacoes ?? null,
    itens: (corpo.itens ?? []).map((i) => ({ ...i, prontuarioId: corpo.id, pessoaId, registradoPor: comando.profissionalId, inativadoEm: null })),
    criadoEm: comando.criadoEm,
    atualizadoEm: comando.criadoEm,
  };
}

/** Paciente que já existia e não teve o prontuário aberto nesta aba: o servidor cria/resolve ao subir. */
export const prontuarioVazio = (pessoaId: string, quando: string): Prontuario => ({
  id: crypto.randomUUID(),
  pessoaId,
  tipoSanguineo: null,
  observacoes: null,
  itens: [],
  criadoEm: quando,
  atualizadoEm: quando,
});

/* ───────── Atendimento e eventos ───────── */

export function atendimentoNaFila(id: string): { entrada: AtendimentoEntrada; comando: Comando } | undefined {
  const achado = naFila<AtendimentoEntrada>('/atendimento').findLast(({ corpo }) => corpo.id === id);
  return achado && { entrada: achado.corpo, comando: achado.comando };
}

function atendimentoDe(entrada: AtendimentoEntrada, comando: Comando, prontuarioId: string): Atendimento {
  return {
    id: entrada.id,
    pessoaId: entrada.pessoaId,
    prontuarioId,
    ...autor(comando),
    dispositivoId: null,
    iniciadoEm: entrada.iniciadoEm,
    recebidoEm: comando.criadoEm,
    localDescricao: entrada.localDescricao ?? null,
    latitude: entrada.latitude ?? null,
    longitude: entrada.longitude ?? null,
    queixaPrincipal: entrada.queixaPrincipal ?? null,
    status: 'ABERTO',
    encerradoEm: null,
  };
}

/** Eventos ainda na fila (inclusive os iniciais de um atendimento aberto offline). */
function eventosNaFila(atendimentoId: string): Evento[] {
  const iniciais = naFila<AtendimentoEntrada>('/atendimento')
    .filter(({ corpo }) => corpo.id === atendimentoId)
    .flatMap(({ corpo, comando }) => (corpo.eventos ?? []).map((e) => ({ corpo: { ...e, atendimentoId } as EventoEntrada, comando })));
  const avulsos = naFila<EventoEntrada>('/atendimento-evento').filter(({ corpo }) => corpo.atendimentoId === atendimentoId);
  return [...iniciais, ...avulsos].map(({ corpo, comando }) => ({ ...corpo, ...autor(comando), dispositivoId: null, recebidoEm: comando.criadoEm }) as Evento);
}

/** Encerramento na fila: o atendimento já aparece encerrado. */
function aplicarEncerramento<A extends Atendimento>(atendimento: A, eventos: readonly Evento[]): A {
  const encerramento = eventos.filter((e) => e.tipo === 'ENCERRAMENTO').at(-1);
  return encerramento && atendimento.status === 'ABERTO' ? { ...atendimento, status: 'ENCERRADO', encerradoEm: encerramento.ocorridoEm } : atendimento;
}

/** Ficha de um atendimento aberto offline, sem nenhum evento ainda (os da fila entram em `comFilaNaFicha`). */
export function fichaNaFila(atendimentoId: string, pessoa: Pessoa, prontuario: Prontuario): Ficha | undefined {
  const achado = atendimentoNaFila(atendimentoId);
  if (!achado) return undefined;
  return {
    atendimento: atendimentoDe(achado.entrada, achado.comando, prontuario.id),
    pessoa,
    prontuario,
    eventos: [],
    resumo: calcularResumo([], prontuario.itens),
  };
}

/** Soma à ficha (do servidor, da última leitura ou montada da fila) o que ainda não subiu. */
export function comFilaNaFicha(ficha: Ficha): Ficha {
  const conhecidos = new Set(ficha.eventos.map((e) => e.id));
  const pendentes = eventosNaFila(ficha.atendimento.id).filter((e) => !conhecidos.has(e.id));
  const prontuario = comItensDaFila(ficha.prontuario);
  if (!pendentes.length && prontuario === ficha.prontuario) return ficha;
  const eventos = ordenarLinhaDoTempo([...ficha.eventos, ...pendentes]);
  return {
    ...ficha,
    atendimento: aplicarEncerramento(ficha.atendimento, eventos),
    prontuario,
    eventos,
    resumo: calcularResumo(eventos, prontuario.itens),
  };
}

/** Atendimentos abertos offline (opcionalmente de uma pessoa), o mais recente primeiro. */
export function atendimentosNaFila(pessoaId?: string): AtendimentoListado[] {
  return naFila<AtendimentoEntrada>('/atendimento')
    .filter(({ corpo }) => !pessoaId || corpo.pessoaId === pessoaId)
    .map(({ corpo, comando }) => ({
      ...aplicarEncerramento(atendimentoDe(corpo, comando, prontuarioNaFila(corpo.pessoaId)?.id ?? ''), eventosNaFila(corpo.id)),
      pessoaNome: pessoaLocal(corpo.pessoaId)?.nome ?? 'Paciente',
    }))
    .reverse();
}

/** Lista do servidor (ou da última leitura) com os atendimentos da fila na frente e encerramentos aplicados. */
export function comFilaNosAtendimentos(itens: AtendimentoListado[], pessoaId?: string): AtendimentoListado[] {
  const conhecidos = new Set(itens.map((a) => a.id));
  return [
    ...atendimentosNaFila(pessoaId).filter((a) => !conhecidos.has(a.id)),
    ...itens.map((a) => aplicarEncerramento(a, eventosNaFila(a.id))),
  ];
}
