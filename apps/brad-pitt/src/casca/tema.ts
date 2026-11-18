import { temaPreferido, type Tema } from '@medicalfield/ui';

const CHAVE = 'mf-portal-tema';

/** Tema escolhido neste navegador; sem escolha, segue o sistema operacional. */
export function lerTema(): Tema {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo === 'claro' || salvo === 'escuro') return salvo;
  } catch {
    // Armazenamento bloqueado (janela privada): segue o sistema.
  }
  return temaPreferido();
}

export function salvarTema(tema: Tema): void {
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {
    // Sem armazenamento, a escolha vale só até recarregar.
  }
}
