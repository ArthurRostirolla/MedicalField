import { Esqueleto, EstadoErro } from '@medicalfield/ui';
import { useEffect, useSyncExternalStore } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { Profissional } from '@medicalfield/contratos';
import { assinarSessao, lerSessao, restaurarSessao, type EstadoSessao } from '../api/cliente';

export function useSessao(): EstadoSessao {
  return useSyncExternalStore(assinarSessao, lerSessao);
}

/** O profissional logado. Só use sob `RequerSessao`. */
export function useProfissional(): Profissional {
  const sessao = useSessao();
  if (sessao.situacao !== 'ativa') throw new Error('useProfissional fora de uma rota autenticada');
  return sessao.profissional;
}

/** De onde o login deve voltar (ex.: o link do QR da ficha). */
export interface EstadoRetorno {
  de?: string;
}

/**
 * Guarda das rotas autenticadas. Ao abrir (ou recarregar) a página, tenta o refresh pelo
 * cookie antes de mandar para o login; o login devolve para a URL pedida.
 */
export function RequerSessao() {
  const sessao = useSessao();
  const local = useLocation();

  useEffect(() => {
    void restaurarSessao();
  }, []);

  if (sessao.situacao === 'restaurando') {
    return (
      <div className="min-h-dvh bg-mesa" aria-busy="true">
        <p className="mf-so-leitor" role="status">
          Conferindo a sessão…
        </p>
        <div className="mx-auto max-w-xl p-6">
          <Esqueleto linhas={3} altura="1.25rem" />
        </div>
      </div>
    );
  }
  if (sessao.situacao === 'anonima') {
    const estado: EstadoRetorno = { de: local.pathname + local.search };
    return <Navigate to="/entrar" replace state={estado} />;
  }
  return <Outlet />;
}

/** Áreas de auditoria: só `ADMIN`. O servidor também recusa (403); isto evita a tela quebrada. */
export function RequerAdmin() {
  const profissional = useProfissional();
  if (profissional.papel !== 'ADMIN') {
    return <EstadoErro titulo="Área restrita à administração" />;
  }
  return <Outlet />;
}
