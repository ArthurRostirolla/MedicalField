import type { TipoEvento } from '@medicalfield/contratos';
import { Botao, EstadoErro, EstadoVazio, Esqueleto, Etiqueta, LinhaDoTempo, SeletorSegmentado, SeloSync, type EstadoSync } from '@medicalfield/ui';
import { ArrowRightLeft, CircleStop, PenLine } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Casca } from '../ui/Casca.tsx';
import { useApp, useConsulta, useGravar } from '../ui/contexto.tsx';
import { formatarHora, formatarMomento, identificacaoCurta } from '../ui/formato.ts';
import {
  PainelEncerramento,
  PainelGlasgow,
  PainelMedicacao,
  PainelRetificacao,
  PainelSinais,
  PainelTexto,
  PainelTriagem,
  type Registrar,
} from './PaineisRegistro.tsx';

type Modo = 'sinais' | 'glasgow' | 'triagem' | 'medicacao' | 'procedimento' | 'observacao' | 'retificar' | 'encerrar';

const REGISTRADO: Record<TipoEvento, string> = {
  SINAIS_VITAIS: 'Sinais vitais gravados',
  GLASGOW: 'Glasgow gravado',
  TRIAGEM: 'Triagem gravada',
  MEDICACAO: 'Medicação gravada',
  PROCEDIMENTO: 'Procedimento gravado',
  OBSERVACAO: 'Observação gravada',
  RETIFICACAO: 'Retificação gravada',
  ENCERRAMENTO: 'Encerramento gravado',
};

export function Atendimento() {
  const app = useApp();
  const { atendimentoId = '' } = useParams();
  const { gravar, gravando, campos, limparCampos } = useGravar();
  const [modo, setModo] = useState<Modo>('sinais');
  const [recente, setRecente] = useState<{ id: string; tipo: TipoEvento } | null>(null);
  // Fila de gravacao: registros pedidos em sequencia rapida entram um de cada vez, na ordem pedida.
  const fila = useRef<Promise<unknown>>(Promise.resolve());

  const dados = useConsulta(async () => {
    const atendimento = await app.atendimentos.obter(atendimentoId);
    if (!atendimento) return null;
    return {
      atendimento,
      pessoa: await app.pessoas.obter(atendimento.pessoaId),
      prontuario: await app.prontuarios.obter(atendimento.pessoaId),
      eventos: await app.atendimentos.eventos(atendimentoId),
      catalogo: await app.medicamentos.listarAtivos(),
    };
  }, [atendimentoId]);

  const voltar = { para: '/', rotulo: 'Início' };
  if (dados.erro) {
    return (
      <Casca titulo="Atendimento" atual="inicio" voltar={voltar}>
        <EstadoErro titulo="Não foi possível ler o banco local" descricao={dados.erro.message} aoTentarDeNovo={dados.recarregar} />
      </Casca>
    );
  }
  if (dados.dados === undefined) {
    return (
      <Casca titulo="Atendimento" atual="inicio" voltar={voltar}>
        <Esqueleto linhas={6} altura="2.5rem" />
      </Casca>
    );
  }
  if (dados.dados === null) {
    return (
      <Casca titulo="Atendimento" atual="inicio" voltar={voltar}>
        <EstadoErro titulo="Atendimento não encontrado neste aparelho" descricao="Ele pode ter sido descartado nas pendências. Volte ao início." />
      </Casca>
    );
  }

  const { atendimento, pessoa, prontuario, eventos, catalogo } = dados.dados;
  const encerrado = atendimento.status === 'ENCERRADO';
  const modoAtual: Modo = encerrado ? 'retificar' : modo;
  const estados: Record<string, EstadoSync> = Object.fromEntries(eventos.map((evento) => [evento.id, evento.envio]));
  const numeroDoRecente = recente ? eventos.findIndex((evento) => evento.id === recente.id) + 1 : 0;

  const registrar: Registrar = (tipo, dadosEvento, retificaEventoId) => {
    const vez = fila.current.then(async () => {
      let id = '';
      const ok = await gravar(async () => {
        id = await app.atendimentos.registrarEvento({ atendimentoId, tipo, dados: dadosEvento, retificaEventoId });
      });
      if (ok) setRecente({ id, tipo });
      return ok;
    });
    fila.current = vez.catch(() => undefined);
    return vez;
  };
  const trocarModo = (novo: Modo) => {
    setModo(novo);
    setRecente(null); // a confirmacao pertence ao painel anterior; o carimbo na pauta continua
    limparCampos();
  };
  // Evento retificado deixa de contar como fato vigente (a pauta continua mostrando, riscado).
  const retificados = new Set(eventos.map((evento) => evento.retificaEventoId).filter(Boolean));
  const painel = { registrar, gravando, erros: campos };

  return (
    <Casca
      titulo={atendimento.pessoaNome}
      subtitulo={
        <>
          Ficha <span className="mf-dado">{atendimento.id.slice(0, 8)}</span>
          {pessoa && identificacaoCurta(pessoa) ? ` · ${identificacaoCurta(pessoa)}` : ''} · início {formatarMomento(atendimento.iniciadoEm)}
        </>
      }
      acaoVoltar={
        <Link className="mf-botao" to={`/atendimentos/${atendimentoId}/passagem`}>
          <ArrowRightLeft aria-hidden />
          Passagem de caso
        </Link>
      }
      atual="inicio"
      voltar={voltar}
      dupla
    >
      <div className="lp-bloco lp-fixa">
        {encerrado ? (
          <p className="lp-registrado">
            <Etiqueta tom="cheia">Encerrado</Etiqueta>
            {atendimento.encerradoEm ? <time className="mf-dado" dateTime={atendimento.encerradoEm}>{formatarMomento(atendimento.encerradoEm)}</time> : null}
            {atendimento.envio !== 'confirmado' ? <SeloSync estado={atendimento.envio} /> : null}
          </p>
        ) : (
          <>
            {atendimento.queixaPrincipal || atendimento.localDescricao ? (
              <p className="lp-nota">
                {atendimento.queixaPrincipal ? (
                  <>
                    <span className="mf-rotulo">Queixa </span>
                    {atendimento.queixaPrincipal}
                  </>
                ) : null}
                {atendimento.queixaPrincipal && atendimento.localDescricao ? ' · ' : null}
                {atendimento.localDescricao ? (
                  <>
                    <span className="mf-rotulo">Local </span>
                    {atendimento.localDescricao}
                  </>
                ) : null}
              </p>
            ) : null}
            <SeletorSegmentado
              className="lp-tipos"
              rotulo="Registrar agora"
              valor={['retificar', 'encerrar'].includes(modo) ? null : modo}
              aoMudar={trocarModo}
              opcoes={[
                { valor: 'sinais', rotulo: 'Sinais' },
                { valor: 'glasgow', rotulo: 'Glasgow' },
                { valor: 'triagem', rotulo: 'Triagem' },
                { valor: 'medicacao', rotulo: 'Medicação' },
                { valor: 'procedimento', rotulo: 'Procedimento' },
                { valor: 'observacao', rotulo: 'Observação' },
              ]}
            />
          </>
        )}

        {/* `key` zera o formulario ao trocar de tipo. */}
        {modoAtual === 'sinais' ? <PainelSinais key="sinais" {...painel} /> : null}
        {modoAtual === 'glasgow' ? <PainelGlasgow key="glasgow" {...painel} /> : null}
        {modoAtual === 'triagem' ? <PainelTriagem key="triagem" {...painel} /> : null}
        {modoAtual === 'medicacao' ? (
          <PainelMedicacao
            key="medicacao"
            {...painel}
            catalogo={catalogo}
            administradas={eventos.filter((evento) => evento.tipo === 'MEDICACAO' && !retificados.has(evento.id))}
            alergias={prontuario.itens.filter((item) => item.tipo === 'ALERGIA' && !item.inativadoEm).map((item) => item.descricao)}
          />
        ) : null}
        {modoAtual === 'procedimento' ? <PainelTexto key="procedimento" {...painel} tipo="PROCEDIMENTO" /> : null}
        {modoAtual === 'observacao' ? <PainelTexto key="observacao" {...painel} tipo="OBSERVACAO" /> : null}
        {modoAtual === 'retificar' ? <PainelRetificacao key="retificar" {...painel} eventos={eventos} /> : null}
        {modoAtual === 'encerrar' ? <PainelEncerramento key="encerrar" {...painel} /> : null}

        <p className="lp-registrado" role="status" aria-live="polite">
          {recente && numeroDoRecente > 0 ? (
            <>
              <SeloSync estado={estados[recente.id] ?? 'local'} />
              <span>
                {REGISTRADO[recente.tipo]}, nº <span className="mf-dado">{String(numeroDoRecente).padStart(2, '0')}</span>
              </span>
            </>
          ) : null}
        </p>

        {!encerrado ? (
          <div className="lp-acoes">
            <Botao aria-pressed={modo === 'retificar'} icone={<PenLine aria-hidden />} onClick={() => trocarModo(modo === 'retificar' ? 'sinais' : 'retificar')}>
              Retificar
            </Botao>
            <Botao aria-pressed={modo === 'encerrar'} icone={<CircleStop aria-hidden />} onClick={() => trocarModo(modo === 'encerrar' ? 'sinais' : 'encerrar')}>
              Encerrar
            </Botao>
          </div>
        ) : null}
      </div>

      <section aria-label="Linha do tempo">
        <div className="lp-cabecalho" style={{ marginTop: 0 }}>
          <h2 className="mf-secao__titulo">Linha do tempo</h2>
          <span className="mf-rotulo">
            {eventos.length} {eventos.length === 1 ? 'entrada' : 'entradas'}
          </span>
        </div>
        {eventos.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum registro ainda"
            descricao={`Atendimento iniciado às ${formatarHora(atendimento.iniciadoEm)}. Cada registro entra aqui com hora, autor e situação de envio.`}
          />
        ) : (
          <LinhaDoTempo eventos={eventos} estados={estados} recenteId={recente?.id} invertida />
        )}
      </section>
    </Casca>
  );
}
