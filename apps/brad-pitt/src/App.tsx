import { EstadoVazio } from '@medicalfield/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router';
import { ErroApi } from './api/cliente';
import { TelaAtendimentos } from './atendimentos/TelaAtendimentos';
import { TelaDuplicatas } from './auditoria/TelaDuplicatas';
import { TelaLogsAcesso } from './auditoria/TelaLogsAcesso';
import { Casca } from './casca/Casca';
import { ProvedorAvisos } from './comum/avisos';
import { TelaVerificacao } from './documentos/TelaVerificacao';
import { TelaMedicamentos } from './medicamentos/TelaMedicamentos';
import { DetalhePessoa } from './prontuarios/DetalhePessoa';
import { TelaProntuarios } from './prontuarios/TelaProntuarios';
import { RequerAdmin, RequerSessao, useSessao } from './sessao/sessao';
import { TelaLogin } from './sessao/TelaLogin';

export function criarConsultas(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Rede e 5xx são transitórios: uma nova tentativa. 4xx é resposta definitiva.
        retry: (falhas, erro) => falhas < 1 && erro instanceof ErroApi && erro.transitorio,
        staleTime: 10_000,
      },
    },
  });
}

/** As rotas, sem o roteador: os testes montam com `MemoryRouter`. */
export function Rotas() {
  return (
    <Routes>
      <Route path="/entrar" element={<TelaLogin />} />
      <Route element={<RequerSessao />}>
        <Route element={<Casca />}>
          <Route index element={<Navigate to="/atendimentos" replace />} />
          <Route path="/atendimentos/:id?" element={<TelaAtendimentos />} />
          <Route path="/prontuarios" element={<TelaProntuarios />} />
          <Route path="/prontuarios/:pessoaId" element={<DetalhePessoa />} />
          <Route path="/medicamentos" element={<TelaMedicamentos />} />
          <Route path="/documentos/:id" element={<TelaVerificacao />} />
          <Route element={<RequerAdmin />}>
            <Route path="/auditoria/acessos" element={<TelaLogsAcesso />} />
            <Route path="/auditoria/duplicatas" element={<TelaDuplicatas />} />
          </Route>
          <Route
            path="*"
            element={
              <EstadoVazio
                titulo="Página não encontrada"
                descricao="Este endereço não existe no portal."
                acao={<Link to="/atendimentos">Ir para os atendimentos</Link>}
              />
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}

/** Dados de uma sessão não podem sobrar para a próxima: sair (ou trocar de usuário) esvazia o cache. */
function LimpezaAoSair({ consultas }: { consultas: QueryClient }) {
  const sessao = useSessao();
  const quem = sessao.situacao === 'ativa' ? sessao.profissional.id : null;
  useEffect(() => {
    if (quem === null) consultas.clear();
  }, [consultas, quem]);
  return null;
}

export function App() {
  const [consultas] = useState(criarConsultas);
  return (
    <QueryClientProvider client={consultas}>
      <LimpezaAoSair consultas={consultas} />
      <ProvedorAvisos>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Rotas />
        </BrowserRouter>
      </ProvedorAvisos>
    </QueryClientProvider>
  );
}
