/** Junta nomes de classe, ignorando valores vazios. */
export function cx(...partes: Array<string | false | null | undefined>): string {
  return partes.filter(Boolean).join(' ');
}

/** Hora local (HH:MM) de um instante ISO. `fusoHorario` fixa o fuso (testes, vitrine). */
export function formatarHora(iso: string, fusoHorario?: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '--:--';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fusoHorario }).format(data);
}
