import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Envolve uma tabela larga. Quando ela não cabe (tela estreita), a rolagem lateral passa a ser
 * alcançável pelo teclado: a região recebe foco e as setas rolam (WCAG 2.1.1).
 * Quando cabe, não cria parada de tabulação nenhuma.
 */
export function RegiaoRolavel({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [rola, setRola] = useState(false);

  useEffect(() => {
    const regiao = ref.current;
    if (!regiao || typeof ResizeObserver === 'undefined') return;
    const medir = () => setRola(regiao.scrollWidth > regiao.clientWidth + 1);
    const observador = new ResizeObserver(medir);
    observador.observe(regiao);
    const tabela = regiao.querySelector('table');
    if (tabela) observador.observe(tabela);
    medir();
    return () => observador.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="bp-rolagem"
      {...(rola && { tabIndex: 0, role: 'region', 'aria-label': `${rotulo}: role para os lados para ver todas as colunas` })}
    >
      {children}
    </div>
  );
}
