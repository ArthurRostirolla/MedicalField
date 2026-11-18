// Formatacao para a tela. Nada aqui interpreta valor clinico.

/** Hora local (HH:MM) de um instante ISO. `fusoHorario` fixa o fuso (testes). */
export function formatarHora(iso: string, fusoHorario?: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '--:--';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fusoHorario }).format(data);
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** "17/11 21:04" (ou so a hora quando e hoje). */
export function formatarMomento(iso: string | null | undefined, agora = new Date()): string {
  if (!iso) return '—';
  const data = new Date(iso);
  const hora = formatarHora(iso);
  return data.toDateString() === agora.toDateString() ? hora : `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)} ${hora}`;
}

/** `YYYY-MM-DD` => `DD/MM/AAAA`. */
export function formatarData(data: string | null | undefined): string {
  if (!data) return '—';
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function idadeEmAnos(dataNascimento: string | null | undefined, agora = new Date()): number | null {
  if (!dataNascimento) return null;
  const [ano = 0, mes = 1, dia = 1] = dataNascimento.split('-').map(Number);
  let idade = agora.getFullYear() - ano;
  if (agora.getMonth() + 1 < mes || (agora.getMonth() + 1 === mes && agora.getDate() < dia)) idade--;
  return idade >= 0 ? idade : null;
}

export function formatarCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  return cpf.length === 11 ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` : cpf;
}

const SEXO = { M: 'M', F: 'F', I: 'Indeterminado' } as const;

/** "58 anos · F" — o que couber de identificacao curta. */
export function identificacaoCurta(pessoa: { dataNascimento: string | null; sexo: 'M' | 'F' | 'I' | null; naoIdentificada: boolean }): string {
  const idade = idadeEmAnos(pessoa.dataNascimento);
  return [
    pessoa.naoIdentificada ? 'não identificado' : null,
    idade === null ? null : `${idade} ${idade === 1 ? 'ano' : 'anos'}`,
    pessoa.sexo ? SEXO[pessoa.sexo] : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
