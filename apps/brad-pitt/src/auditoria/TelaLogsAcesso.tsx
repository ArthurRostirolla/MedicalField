import type { LogAcesso } from '@medicalfield/contratos';
import { Botao, CampoTexto, EstadoVazio, Select, type Coluna } from '@medicalfield/ui';
import { useQuery } from '@tanstack/react-query';
import { FilterX, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { listarAtendimentos, listarLogsAcesso } from '../api/recursos';
import { FolhaLista } from '../comum/FolhaLista';
import { formatarDataHoraLonga, localParaIso } from '../comum/formato';
import { useListaPorCursor } from '../comum/paginacao';
import { useProfissional } from '../sessao/sessao';

const SERVICOS = [
  { valor: 'mike-baguncinha', rotulo: 'Identidade e auditoria (mike-baguncinha)' },
  { valor: 'dona-cida', rotulo: 'Núcleo clínico (dona-cida)' },
  { valor: 'jaiminho', rotulo: 'PDF e e-mail (jaiminho)' },
];

const VAZIO = { de: '', ate: '', servico: '', profissionalId: '' };

/** Logs de acesso (só ADMIN): uma linha por requisição a `/api/v1`, mais recentes primeiro. */
export function TelaLogsAcesso() {
  const eu = useProfissional();
  const [filtro, setFiltro] = useState(VAZIO);
  const definir = (campo: keyof typeof VAZIO) => (evento: { target: { value: string } }) =>
    setFiltro((atual) => ({ ...atual, [campo]: evento.target.value }));

  // A auditoria só devolve o id do profissional. Os nomes vêm de quem o portal já conhece:
  // quem está logado e quem abriu atendimentos. Os demais aparecem pelo começo do id.
  const conhecidos = useQuery({
    queryKey: ['profissionais-conhecidos'],
    queryFn: () => listarAtendimentos({ limite: 200 }),
    select: (pagina) => pagina.itens.map((a) => [a.profissionalId, a.profissionalNome] as const),
    staleTime: 5 * 60_000,
  });
  const nomes = new Map<string, string>([[eu.id, eu.nome], ...(conhecidos.data ?? [])]);

  const consulta = {
    de: localParaIso(filtro.de),
    ate: localParaIso(filtro.ate),
    servico: filtro.servico || undefined,
    profissionalId: filtro.profissionalId || undefined,
  };
  const lista = useListaPorCursor(['logs-acesso', consulta], (cursor) => listarLogsAcesso({ ...consulta, limite: 50, cursor }));

  // Quem aparece na página atual também entra no filtro, mesmo sem nome conhecido.
  for (const log of lista.consulta.data?.itens ?? []) {
    if (log.profissionalId && !nomes.has(log.profissionalId)) nomes.set(log.profissionalId, `Profissional ${log.profissionalId.slice(0, 8)}`);
  }
  const comFiltro = Object.values(filtro).some(Boolean);

  const colunas: Coluna<LogAcesso>[] = [
    {
      id: 'quando',
      titulo: 'Data e hora',
      celula: (log) => (
        <time className="mf-dado" dateTime={log.dataHora}>
          {formatarDataHoraLonga(log.dataHora)}
        </time>
      ),
    },
    { id: 'servico', titulo: 'Serviço', celula: (log) => log.servico },
    {
      id: 'profissional',
      titulo: 'Profissional',
      celula: (log) =>
        log.profissionalId ? nomes.get(log.profissionalId) : <span className="text-tinta-2">Sem autenticação</span>,
    },
    {
      id: 'rota',
      titulo: 'Requisição',
      celula: (log) => (
        <span className="mf-dado">
          {log.metodo} {log.rota}
        </span>
      ),
    },
    { id: 'status', titulo: 'Status', alinhar: 'fim', celula: (log) => <span className="mf-dado">{log.statusCode}</span> },
    { id: 'tempo', titulo: 'Tempo', alinhar: 'fim', celula: (log) => <span className="mf-dado">{Math.round(log.tempoMs)} ms</span> },
    { id: 'ip', titulo: 'IP do cliente', celula: (log) => <span className="mf-dado">{log.ipCliente}</span> },
    {
      id: 'request',
      titulo: 'Protocolo',
      celula: (log) => (
        <span className="mf-dado text-tinta-2" title={log.requestId}>
          {log.requestId.slice(0, 8)}
        </span>
      ),
    },
  ];

  return (
    <FolhaLista
      titulo="Logs de acesso"
      plural="registros"
      lista={lista}
      colunas={colunas}
      chave={(log) => log.id}
      acoes={
        comFiltro ? (
          <Botao variante="fantasma" icone={<FilterX aria-hidden />} onClick={() => setFiltro(VAZIO)}>
            Limpar filtros
          </Botao>
        ) : null
      }
      filtros={
        <form
          className="mf-grade-campos border-b border-fio"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(13rem, 100%), 1fr))' }}
          role="search"
          aria-label="Filtros dos logs de acesso"
          onSubmit={(evento) => evento.preventDefault()}
        >
          <CampoTexto rotulo="De" type="datetime-local" value={filtro.de} max={filtro.ate || undefined} onChange={definir('de')} />
          <CampoTexto rotulo="Até" type="datetime-local" value={filtro.ate} min={filtro.de || undefined} onChange={definir('ate')} />
          <Select rotulo="Serviço" vazio="Todos os serviços" value={filtro.servico} onChange={definir('servico')} opcoes={SERVICOS} />
          <Select
            rotulo="Profissional"
            vazio="Todos os profissionais"
            value={filtro.profissionalId}
            onChange={definir('profissionalId')}
            opcoes={[...nomes].map(([valor, rotulo]) => ({ valor, rotulo }))}
          />
        </form>
      }
      vazio={
        <EstadoVazio
          className="m-3"
          icone={<ScrollText aria-hidden />}
          titulo={comFiltro ? 'Nenhum registro com estes filtros' : 'Nenhum registro de acesso'}
        />
      }
    />
  );
}
