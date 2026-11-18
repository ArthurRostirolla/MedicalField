import type { MouseEvent, ReactNode } from 'react';
import { cx } from '../util';
import { FaixaDemonstrativa, Marca } from './superficies';

export interface ItemNavegacao {
  id: string;
  rotulo: string;
  icone: ReactNode;
  /** Com `href` vira link (roteador); sem, vira botão e chama `aoNavegar`. */
  href?: string;
  contagem?: number;
  /** Título de grupo exibido antes deste item (só no portal). */
  grupo?: string;
}

interface Navegavel {
  itens: ReadonlyArray<ItemNavegacao>;
  atual: string;
  aoNavegar?: (id: string) => void;
}

function ItemNav({
  item,
  atual,
  aoNavegar,
  classe,
  children,
}: {
  item: ItemNavegacao;
  atual: boolean;
  aoNavegar?: (id: string) => void;
  classe: string;
  children: ReactNode;
}) {
  const comum = {
    className: cx(classe, atual && 'mf-invertido'),
    'aria-current': atual ? ('page' as const) : undefined,
    onClick: () => aoNavegar?.(item.id),
  };
  // Com href E aoNavegar, o clique simples fica com o app (roteador SPA): sem isso o navegador
  // recarrega a pagina. Clique com tecla modificadora ou botao do meio segue o comportamento do link.
  const aoClicarLink = (evento: MouseEvent<HTMLAnchorElement>) => {
    if (!aoNavegar || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    evento.preventDefault();
    aoNavegar(item.id);
  };
  return item.href ? (
    <a {...comum} onClick={aoClicarLink} href={item.href}>
      {children}
    </a>
  ) : (
    <button {...comum} type="button">
      {children}
    </button>
  );
}

/* ───────── Portal: índice lateral + conteúdo ───────── */

export interface LayoutPortalProps extends Navegavel {
  titulo: ReactNode;
  /** Ações do cabeçalho da página. */
  acoes?: ReactNode;
  /** Rodapé do índice: quem está logado e o botão de sair. */
  usuario?: ReactNode;
  children: ReactNode;
}

export function LayoutPortal({ itens, atual, aoNavegar, titulo, acoes, usuario, children }: LayoutPortalProps) {
  return (
    <div className="mf-portal" data-contexto="portal">
      <FaixaDemonstrativa />
      <aside className="mf-portal__indice">
        <div className="mf-portal__marca">
          <Marca />
        </div>
        <nav className="mf-portal__nav" aria-label="Seções do portal">
          {itens.map((item) => (
            <div key={item.id} style={{ display: 'contents' }}>
              {item.grupo ? <div className="mf-portal__grupo mf-rotulo">{item.grupo}</div> : null}
              <ItemNav item={item} atual={item.id === atual} aoNavegar={aoNavegar} classe="mf-nav-item">
                {item.icone}
                <span>{item.rotulo}</span>
                {item.contagem !== undefined ? <span className="mf-nav-item__contagem">{item.contagem}</span> : null}
              </ItemNav>
            </div>
          ))}
        </nav>
        {usuario ? <div className="mf-portal__usuario">{usuario}</div> : null}
      </aside>
      <div className="mf-portal__conteudo">
        <header className="mf-portal__cabecalho">
          <h1 className="mf-portal__titulo">{titulo}</h1>
          {acoes ? <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>{acoes}</div> : null}
        </header>
        <main className="mf-portal__principal">{children}</main>
      </div>
    </div>
  );
}

/* ───────── App de campo: cabeçalho + tira de conectividade + barra inferior ───────── */

export interface LayoutAppProps extends Navegavel {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** Ação à direita do título (ex.: abrir a passagem de caso). */
  acaoTopo?: ReactNode;
  /** A `BarraConectividade`: fica sempre visível sob o cabeçalho. */
  conectividade: ReactNode;
  children: ReactNode;
  className?: string;
}

export function LayoutApp({
  itens,
  atual,
  aoNavegar,
  titulo,
  subtitulo,
  acaoTopo,
  conectividade,
  children,
  className,
}: LayoutAppProps) {
  return (
    <div className={cx('mf-app', className)} data-contexto="campo">
      <div className="mf-app__topo">
        <FaixaDemonstrativa />
        <header className="mf-app__cabecalho">
          <div className="mf-app__titulos">
            <h1 className="mf-app__titulo">{titulo}</h1>
            {subtitulo ? <p className="mf-app__subtitulo">{subtitulo}</p> : null}
          </div>
          {acaoTopo}
        </header>
        {conectividade}
      </div>
      <main className="mf-app__principal">{children}</main>
      <nav className="mf-app__barra" aria-label="Seções do app">
        {itens.map((item) => (
          <ItemNav key={item.id} item={item} atual={item.id === atual} aoNavegar={aoNavegar} classe="mf-app__aba">
            {item.icone}
            <span>{item.rotulo}</span>
            {item.contagem ? (
              <span className="mf-app__aba-contagem">
                {item.contagem}
                <span className="mf-so-leitor"> pendentes</span>
              </span>
            ) : null}
          </ItemNav>
        ))}
      </nav>
    </div>
  );
}
