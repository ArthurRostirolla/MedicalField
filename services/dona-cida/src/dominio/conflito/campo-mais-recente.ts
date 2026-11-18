import type { EstrategiaConflito } from './estrategia.ts';

export type EstadoCampos = {
  valores: Readonly<Record<string, unknown>>;
  /** `{ campo: ISO da ultima edicao }` (coluna `carimbos_campos`). */
  carimbos: Readonly<Record<string, string>>;
};
export type EdicaoCampos = { campos: Readonly<Record<string, unknown>>; editadoEm: string };
export type DecisaoCampos = {
  /** Campos cujo valor muda. */
  aplicados: Record<string, unknown>;
  /** Valor que cada campo aplicado tinha (vai para `auditoria_clinica.antes`). */
  anteriores: Record<string, unknown>;
  /** Carimbos resultantes (os atuais + os dos campos vencedores). */
  carimbos: Record<string, string>;
  /** Campos recebidos que perderam para uma edicao mais recente. */
  descartados: string[];
};

/**
 * Dados cadastrais da pessoa: vence, POR CAMPO, a edicao mais recente do profissional.
 * Campo sem carimbo (carga inicial) perde para qualquer edicao; empate mantem o servidor,
 * para que a repeticao de um comando nao mude nada.
 */
export class CampoMaisRecente implements EstrategiaConflito<EstadoCampos, EdicaoCampos, DecisaoCampos> {
  readonly nome = 'CampoMaisRecente';

  resolver(atual: EstadoCampos, recebido: EdicaoCampos): DecisaoCampos {
    const decisao: DecisaoCampos = { aplicados: {}, anteriores: {}, carimbos: { ...atual.carimbos }, descartados: [] };
    const editadoEm = Date.parse(recebido.editadoEm);

    for (const [campo, valor] of Object.entries(recebido.campos)) {
      if (valor === undefined) continue;
      const carimbo = atual.carimbos[campo];
      if (carimbo !== undefined && editadoEm <= Date.parse(carimbo)) {
        decisao.descartados.push(campo);
        continue;
      }
      decisao.carimbos[campo] = recebido.editadoEm;
      const anterior = atual.valores[campo] ?? null;
      if (anterior !== valor) {
        decisao.aplicados[campo] = valor;
        decisao.anteriores[campo] = anterior;
      }
    }
    return decisao;
  }
}
