import type { CSSProperties, ReactNode } from 'react';

/**
 * Grade de campos só de leitura, no desenho dos campos da ficha (caixa com rótulo no canto).
 * As caixas se distribuem pela largura e a última linha sempre fecha a folha (sem célula vazia).
 *
 * @param minimo largura mínima de cada caixa
 */
export function CamposLeitura({ minimo = '13rem', children }: { minimo?: string; children: ReactNode }) {
  return (
    <dl className="mf-grade-campos bp-campos m-0" style={{ '--bp-minimo': minimo } as CSSProperties}>
      {children}
    </dl>
  );
}

export function CampoLeitura({ rotulo, largo, children }: { rotulo: string; largo?: boolean; children: ReactNode }) {
  // Um único <div> entre <dl> e <dt>/<dd>: é o que a estrutura de lista de definição admite.
  return (
    <div className={largo ? 'mf-campo__caixa bp-leitura bp-campos__largo' : 'mf-campo__caixa bp-leitura'}>
      <dt className="mf-rotulo">{rotulo}</dt>
      <dd>{children ?? '—'}</dd>
    </div>
  );
}
