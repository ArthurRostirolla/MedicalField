// Apoio aos testes de tela: respostas simuladas no formato do contrato e montagem das rotas.
import type { AtendimentoListado, Envio, Ficha, Medicamento, Profissional } from '@medicalfield/contratos';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { reiniciarSessaoParaTeste } from '../api/cliente';
import { Rotas } from '../App';
import { ProvedorAvisos } from '../comum/avisos';

export const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const HELENA: Profissional = { id: uuid(1), nome: 'Dra. Helena Prado', tipoRegistro: 'CRM', registro: '100001', uf: 'RS', papel: 'ADMIN' };
export const CAIO: Profissional = { id: uuid(2), nome: 'Enf. Caio Brandão', tipoRegistro: 'COREN', registro: '200002', uf: 'RS', papel: 'PROFISSIONAL' };

export const sessaoDe = (profissional: Profissional, accessToken = 'token-novo') => ({
  accessToken,
  expiraEm: 900,
  refreshToken: 'opaco',
  profissional,
});

export const json = (corpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

export const erro = (status: number, codigo: string, mensagem = 'Mensagem do servidor', detalhes?: { campo: string; mensagem: string }[]): Response =>
  json({ codigo, mensagem, detalhes, requestId: 'req-123' }, status);

export interface Chamada {
  metodo: string;
  caminho: string;
  consulta: URLSearchParams;
  cabecalhos: Headers;
  corpo: unknown;
}

/**
 * Troca o `fetch` por um roteador simples. `responder` recebe a chamada e devolve a resposta;
 * devolver `undefined` vira 404 no formato do contrato.
 */
export function simularApi(responder: (chamada: Chamada) => Response | undefined | Promise<Response | undefined>) {
  const chamadas: Chamada[] = [];
  const falso = vi.fn(async (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
    const url = new URL(String(entrada), 'http://portal.test');
    const chamada: Chamada = {
      metodo: opcoes?.method ?? 'GET',
      caminho: url.pathname.replace('/api/v1', ''),
      consulta: url.searchParams,
      cabecalhos: new Headers(opcoes?.headers),
      corpo: typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : undefined,
    };
    chamadas.push(chamada);
    return (await responder(chamada)) ?? erro(404, 'NAO_ENCONTRADO', 'Não encontrado.');
  });
  vi.stubGlobal('fetch', falso);
  return { chamadas, para: (caminho: string, metodo = 'GET') => chamadas.filter((c) => c.caminho === caminho && c.metodo === metodo) };
}

/** Monta as rotas do portal em `caminho`. Com `profissional`, a sessão já começa ativa. */
export function montar(caminho: string, profissional?: Profissional): RenderResult {
  if (profissional) reiniciarSessaoParaTeste({ situacao: 'ativa', profissional }, 'token-inicial');
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={consultas}>
      <ProvedorAvisos>
        <MemoryRouter initialEntries={[caminho]}>
          <Rotas />
        </MemoryRouter>
      </ProvedorAvisos>
    </QueryClientProvider>,
  );
}

/* ───────── Dados fictícios no formato do contrato ───────── */

const AGORA = '2026-11-17T21:00:00.000Z';

export const medicamento = (n: number, nome: string, extra: Partial<Medicamento> = {}): Medicamento => ({
  id: uuid(100 + n),
  nome,
  principioAtivo: null,
  apresentacao: null,
  observacao: null,
  ativo: true,
  ...extra,
});

export const atendimento = (n: number, extra: Partial<AtendimentoListado> = {}): AtendimentoListado => ({
  id: uuid(200 + n),
  pessoaId: uuid(300),
  prontuarioId: uuid(400),
  profissionalId: CAIO.id,
  profissionalNome: CAIO.nome,
  dispositivoId: null,
  iniciadoEm: AGORA,
  recebidoEm: AGORA,
  localDescricao: null,
  latitude: null,
  longitude: null,
  queixaPrincipal: `Queixa ${n}`,
  status: 'ABERTO',
  encerradoEm: null,
  pessoaNome: `Pessoa Fictícia ${n}`,
  ...extra,
});

export function ficha(): Ficha {
  const { pessoaNome: _nome, ...base } = atendimento(1, { queixaPrincipal: 'Dor torácica' });
  const comum = { atendimentoId: base.id, profissionalId: CAIO.id, profissionalNome: CAIO.nome, dispositivoId: null, recebidoEm: AGORA };
  return {
    atendimento: base,
    pessoa: {
      id: uuid(300),
      nome: 'Marlene Fictícia',
      dataNascimento: '1968-03-02',
      sexo: 'F',
      cpf: '00000000191',
      cns: null,
      telefone: null,
      email: null,
      contatoEmergenciaNome: null,
      contatoEmergenciaTelefone: null,
      contatoEmergenciaEmail: null,
      naoIdentificada: false,
      descricaoIdentificacao: null,
      possivelDuplicataDe: null,
      criadoEm: AGORA,
      atualizadoEm: AGORA,
    },
    prontuario: { id: uuid(400), pessoaId: uuid(300), tipoSanguineo: null, observacoes: null, itens: [], criadoEm: AGORA, atualizadoEm: AGORA },
    eventos: [
      { ...comum, id: uuid(501), tipo: 'SINAIS_VITAIS', ocorridoEm: '2026-11-17T21:04:00.000Z', dados: { frequenciaCardiaca: 121 } },
      {
        ...comum,
        id: uuid(502),
        tipo: 'RETIFICACAO',
        ocorridoEm: '2026-11-17T21:13:00.000Z',
        dados: { motivo: 'Frequência digitada errada.', dadosCorrigidos: { frequenciaCardiaca: 112 } },
        retificaEventoId: uuid(501),
      },
    ],
    resumo: {
      ultimosSinaisVitais: null,
      glasgowMaisRecente: null,
      triagem: null,
      medicacoes: [],
      procedimentos: [],
      alergias: ['Dipirona'],
      comorbidades: [],
      medicacoesContinuas: [],
      encerramento: null,
    },
  };
}

export const documento = (n = 1) => ({
  id: uuid(600 + n),
  atendimentoId: uuid(201),
  codigoVerificacao: `MF-TESTE-000${n}`,
  hashConteudo: 'a'.repeat(64),
  geradoPor: HELENA.id,
  geradoEm: `2026-11-17T22:0${n}:00.000Z`,
  tamanhoBytes: 184_320,
});

export const envio = (n: number, status: Envio['status'], extra: Partial<Envio> = {}): Envio => ({
  id: uuid(700 + n),
  documentoId: uuid(601),
  destinatarioNome: `Destinatário ${n}`,
  destinatarioEmail: `destino${n}@exemplo.test`,
  vinculo: 'FAMILIAR',
  status,
  tentativas: status === 'FALHA_DEFINITIVA' ? 5 : 1,
  proximaTentativaEm: null,
  ultimoErro: status === 'FALHA_DEFINITIVA' ? 'Caixa postal recusou a mensagem' : null,
  solicitadoPor: HELENA.id,
  criadoEm: AGORA,
  enviadoEm: status === 'ENVIADO' ? AGORA : null,
  ...extra,
});
