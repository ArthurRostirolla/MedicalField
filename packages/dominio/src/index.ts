// Funcoes puras, sem I/O: rodam igual na DonaCida, no portal e no app.
// Nenhuma delas interpreta valor clinico; apenas organizam o que foi registrado.
import type { Resumo, TipoEvento, TipoItem } from '@medicalfield/contratos';

/** O minimo de um evento que as funcoes daqui precisam (serve para evento do servidor e para evento local). */
export type EventoDaLinhaDoTempo = {
  id: string;
  tipo: TipoEvento;
  ocorridoEm: string;
  dados: object;
  retificaEventoId?: string | null;
};

export type ItemDoProntuario = { tipo: TipoItem; descricao: string; registradoEm?: string; inativadoEm: string | null };

/** Soma dos tres componentes da escala de Glasgow. */
export function calcularTotalGlasgow(componentes: { ocular: number; verbal: number; motora: number }): number {
  return componentes.ocular + componentes.verbal + componentes.motora;
}

/**
 * Ordena por `ocorridoEm` (mais antigo primeiro); empate decide pelo `id`, para a ordem ser estavel
 * entre dispositivos. Devolve uma copia.
 */
export function ordenarLinhaDoTempo<T extends { id: string; ocorridoEm: string }>(eventos: readonly T[]): T[] {
  return [...eventos].sort(
    (a, b) => Date.parse(a.ocorridoEm) - Date.parse(b.ocorridoEm) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

const textoDe = (dados: object, campo: string): string => {
  const valor = (dados as Record<string, unknown>)[campo];
  return typeof valor === 'string' ? valor : '';
};

/**
 * Passagem de caso do atendimento.
 *
 * - Evento retificado COM dadosCorrigidos aparece com os valores corrigidos; SEM, deixa de contar.
 * - Item de prontuario inativado nao entra.
 *
 * @param eventos linha do tempo do atendimento, em qualquer ordem
 * @param itensProntuario alergias, comorbidades e medicacoes continuas da pessoa
 */
export function calcularResumo(
  eventos: readonly EventoDaLinhaDoTempo[],
  itensProntuario: readonly ItemDoProntuario[],
): Resumo {
  // ponytail: um nivel so - retificar uma RETIFICACAO nao "ressuscita" o evento original.
  // Retificacao COM dadosCorrigidos corrige o evento (os campos corrigidos sobrepoem os originais);
  // SEM dadosCorrigidos anula o evento. Assim uma medicacao com dose corrigida continua na passagem
  // de caso, com o valor certo, em vez de sumir. A ultima retificacao de um evento e a que vale.
  const correcoes = new Map<string, Record<string, unknown> | null>();
  for (const r of ordenarLinhaDoTempo(eventos.filter((e) => e.tipo === 'RETIFICACAO'))) {
    if (!r.retificaEventoId) continue;
    const corrigidos = (r.dados as Record<string, unknown>).dadosCorrigidos;
    const temCorrecao = typeof corrigidos === 'object' && corrigidos !== null && Object.keys(corrigidos).length > 0;
    correcoes.set(r.retificaEventoId, temCorrecao ? (corrigidos as Record<string, unknown>) : null);
  }
  const validos = ordenarLinhaDoTempo(
    eventos.flatMap((e) => {
      if (!correcoes.has(e.id)) return [e];
      const corrigidos = correcoes.get(e.id);
      return corrigidos ? [{ ...e, dados: { ...(e.dados as Record<string, unknown>), ...corrigidos } }] : [];
    }),
  );
  const doTipo = (tipo: TipoEvento) => validos.filter((e) => e.tipo === tipo);
  const maisRecente = (tipo: TipoEvento) => {
    const evento = doTipo(tipo).at(-1);
    return evento ? { ocorridoEm: evento.ocorridoEm, dados: evento.dados as Record<string, unknown> } : null;
  };

  // Itens na ordem em que foram registrados (sem data ficam no fim, na ordem recebida).
  const quando = (item: ItemDoProntuario) => (item.registradoEm ? Date.parse(item.registradoEm) : Infinity);
  const ativos = itensProntuario
    .filter((item) => item.inativadoEm === null)
    .sort((a, b) => (quando(a) === quando(b) ? 0 : quando(a) < quando(b) ? -1 : 1));
  const descricoes = (tipo: TipoItem) => ativos.filter((item) => item.tipo === tipo).map((item) => item.descricao);

  const encerramento = doTipo('ENCERRAMENTO').at(-1);

  return {
    ultimosSinaisVitais: maisRecente('SINAIS_VITAIS'),
    glasgowMaisRecente: maisRecente('GLASGOW'),
    triagem: maisRecente('TRIAGEM'),
    medicacoes: doTipo('MEDICACAO').map((e) => ({
      ocorridoEm: e.ocorridoEm,
      nome: textoDe(e.dados, 'nome'),
      dose: textoDe(e.dados, 'dose'),
      unidade: textoDe(e.dados, 'unidade'),
      via: textoDe(e.dados, 'via'),
    })),
    procedimentos: doTipo('PROCEDIMENTO').map((e) => ({
      ocorridoEm: e.ocorridoEm,
      descricao: textoDe(e.dados, 'descricao'),
    })),
    alergias: descricoes('ALERGIA'),
    comorbidades: descricoes('COMORBIDADE'),
    medicacoesContinuas: descricoes('MEDICACAO_CONTINUA'),
    encerramento: encerramento
      ? {
          ocorridoEm: encerramento.ocorridoEm,
          desfecho: textoDe(encerramento.dados, 'desfecho'),
          destino: textoDe(encerramento.dados, 'destino') || null,
        }
      : null,
  };
}
