/** Regra de escrita 4: ate quanto o relogio do dispositivo pode estar a frente do servidor. */
export const TOLERANCIA_RELOGIO_MS = 5 * 60_000;

export type HorarioConferido = {
  /** Horario a gravar (ISO UTC). */
  valor: string;
  /** Texto para `auditoria_clinica.observacao` quando houve ajuste; senao `null`. */
  observacao: string | null;
};

/**
 * Horario do dispositivo mais de 5 min a frente do servidor e limitado ao horario do servidor.
 * Horario no passado nunca e alterado: o atendimento offline pode subir horas depois.
 *
 * @param campo nome do campo, so para compor a observacao
 * @param informado horario enviado pelo dispositivo (ISO)
 * @param agora horario do servidor
 */
export function limitarAoServidor(campo: string, informado: string, agora: Date): HorarioConferido {
  const instante = new Date(informado);
  if (instante.getTime() - agora.getTime() <= TOLERANCIA_RELOGIO_MS) {
    return { valor: instante.toISOString(), observacao: null };
  }
  return {
    valor: agora.toISOString(),
    observacao: `${campo} adiantado (${instante.toISOString()}) limitado ao horário do servidor (${agora.toISOString()})`,
  };
}
