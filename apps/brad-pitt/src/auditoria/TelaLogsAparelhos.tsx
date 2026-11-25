import type { LogClienteSaida } from '@medicalfield/contratos';
import { Botao, CampoTexto, EstadoVazio, Select, type Coluna } from '@medicalfield/ui';
import { useQuery } from '@tanstack/react-query';
import { FilterX, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { listarAtendimentos, listarLogsAparelhos } from '../api/recursos';
import { FolhaLista } from '../comum/FolhaLista';
import { formatarDataHoraLonga, localParaIso } from '../comum/formato';
import { useListaPorCursor } from '../comum/paginacao';
import { useProfissional } from '../sessao/sessao';

const VAZIO = { de: '', ate: '', profissionalId: '' };

/**
 * Logs dos aparelhos (só ADMIN): o que o app registrou localmente — inclusive offline — e enviou por
 * `POST /log` na sincronização. Um log só aparece aqui depois que o aparelho sincroniza.
 */
export function TelaLogsAparelhos() {
  const eu = useProfissional();
  const [filtro, setFiltro] = useState(VAZIO);
  const definir = (campo: keyof typeof VAZIO) => (evento: { target: { value: string } }) =>
    setFiltro((atual) => ({ ...atual, [campo]: evento.target.value }));

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
    profissionalId: filtro.profissionalId || undefined,
  };
  const lista = useListaPorCursor(['logs-aparelhos', consulta], (cursor) => listarLogsAparelhos({ ...consulta, limite: 50, cursor }));

  for (const log of lista.consulta.data?.itens ?? []) {
    if (!nomes.has(log.profissionalId)) nomes.set(log.profissionalId, `Profissional ${log.profissionalId.slice(0, 8)}`);
  }
  const comFiltro = Object.values(filtro).some(Boolean);

  const colunas: Coluna<LogClienteSaida>[] = [
    {
      id: 'quando',
      titulo: 'Ocorrido em',
      celula: (log) => (
        <time className="mf-dado" dateTime={log.ocorridoEm}>
          {formatarDataHoraLonga(log.ocorridoEm)}
        </time>
      ),
    },
    { id: 'profissional', titulo: 'Profissional', celula: (log) => nomes.get(log.profissionalId) },
    {
      id: 'acao',
      titulo: 'Ação',
      celula: (log) => (
        <span className="mf-dado">
          {log.acao}
          {log.entidade ? ` · ${log.entidade}` : ''}
        </span>
      ),
    },
    { id: 'resultado', titulo: 'Resultado', celula: (log) => log.resultado },
    { id: 'rede', titulo: 'Rede', celula: (log) => (log.estavaOnline ? 'Online' : 'Offline') },
    {
      id: 'detalhe',
      titulo: 'Detalhe',
      celula: (log) =>
        log.detalhe ? <span className="mf-dado text-tinta-2">{JSON.stringify(log.detalhe)}</span> : null,
    },
    {
      id: 'recebido',
      titulo: 'Recebido em',
      celula: (log) => (
        <time className="mf-dado text-tinta-2" dateTime={log.recebidoEm}>
          {formatarDataHoraLonga(log.recebidoEm)}
        </time>
      ),
    },
    {
      id: 'aparelho',
      titulo: 'Aparelho',
      celula: (log) => (
        <span className="mf-dado text-tinta-2" title={log.dispositivoId ?? undefined}>
          {log.dispositivoId?.slice(0, 8) ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <FolhaLista
      titulo="Logs dos aparelhos"
      descricao="Registrados no app, mesmo offline; chegam aqui quando o aparelho sincroniza."
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
          aria-label="Filtros dos logs dos aparelhos"
          onSubmit={(evento) => evento.preventDefault()}
        >
          <CampoTexto rotulo="De" type="datetime-local" value={filtro.de} max={filtro.ate || undefined} onChange={definir('de')} />
          <CampoTexto rotulo="Até" type="datetime-local" value={filtro.ate} min={filtro.de || undefined} onChange={definir('ate')} />
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
          icone={<Smartphone aria-hidden />}
          titulo={comFiltro ? 'Nenhum registro com estes filtros' : 'Nenhum log recebido dos aparelhos'}
        />
      }
    />
  );
}
