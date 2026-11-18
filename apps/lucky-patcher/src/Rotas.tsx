import { createHashRouter, Navigate, Outlet, RouterProvider } from 'react-router';
import { Ajustes } from './telas/Ajustes.tsx';
import { Atendimento } from './telas/Atendimento.tsx';
import { Entrar } from './telas/Entrar.tsx';
import { Inicio } from './telas/Inicio.tsx';
import { CorrigirPaciente, NovoPaciente } from './telas/NovoPaciente.tsx';
import { Pacientes } from './telas/Pacientes.tsx';
import { Passagem } from './telas/Passagem.tsx';
import { Pendencias } from './telas/Pendencias.tsx';
import { Prontuario } from './telas/Prontuario.tsx';
import { useSessao } from './ui/contexto.tsx';

/** Sem sessao local, so a tela de entrada. Com sessao (mesmo expirada), o app abre e grava. */
function ExigeSessao() {
  return useSessao() ? <Outlet /> : <Navigate to="/entrar" replace />;
}

// Hash router: a mesma navegacao funciona no navegador (/app/), offline pelo service worker e no WebView do Android.
const roteador = createHashRouter([
  { path: '/entrar', element: <Entrar /> },
  {
    element: <ExigeSessao />,
    children: [
      { path: '/', element: <Inicio /> },
      { path: '/pacientes', element: <Pacientes /> },
      { path: '/pacientes/novo', element: <NovoPaciente /> },
      { path: '/pacientes/:pessoaId', element: <Prontuario /> },
      { path: '/atendimentos/:atendimentoId', element: <Atendimento /> },
      { path: '/atendimentos/:atendimentoId/passagem', element: <Passagem /> },
      { path: '/pendencias', element: <Pendencias /> },
      { path: '/pendencias/:opId/corrigir', element: <CorrigirPaciente /> },
      { path: '/ajustes', element: <Ajustes /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function Rotas() {
  return <RouterProvider router={roteador} />;
}
