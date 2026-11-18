import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../util';

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `primario`: uma única ação principal por tela. */
  variante?: 'primario' | 'secundario' | 'fantasma' | 'perigo';
  icone?: ReactNode;
  /** Botão quadrado só com ícone; exige `aria-label`. */
  somenteIcone?: boolean;
  largo?: boolean;
  /** Mantém o rótulo, troca o ícone pelo indicador e ignora cliques. */
  carregando?: boolean;
}

export function Botao({
  variante = 'secundario',
  icone,
  somenteIcone,
  largo,
  carregando,
  className,
  children,
  onClick,
  type = 'button',
  ...resto
}: BotaoProps) {
  return (
    <button
      {...resto}
      type={type}
      aria-busy={carregando || undefined}
      onClick={carregando ? (evento) => evento.preventDefault() : onClick}
      className={cx(
        'mf-botao',
        variante !== 'secundario' && `mf-botao--${variante}`,
        somenteIcone && 'mf-botao--icone',
        largo && 'mf-botao--largo',
        className,
      )}
    >
      {carregando ? <LoaderCircle className="mf-gira" aria-hidden /> : icone}
      {children}
    </button>
  );
}
