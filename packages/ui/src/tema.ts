export type Tema = 'claro' | 'escuro';
export type Contexto = 'portal' | 'campo';

/** Tema pedido pelo sistema operacional. */
export function temaPreferido(): Tema {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'escuro'
    : 'claro';
}

/** Aplica o tema em um elemento (por padrão, a página inteira). */
export function aplicarTema(tema: Tema, alvo: HTMLElement = document.documentElement): void {
  alvo.dataset.tema = tema;
}

/** Aplica a densidade: `campo` = alvos de 56 px e corpo de 17 px. */
export function aplicarContexto(contexto: Contexto, alvo: HTMLElement = document.documentElement): void {
  alvo.dataset.contexto = contexto;
}
