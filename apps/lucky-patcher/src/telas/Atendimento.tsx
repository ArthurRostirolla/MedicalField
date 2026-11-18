import type { TipoEvento } from '@medicalfield/contratos';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowRightLeft, CircleStop, PenLine } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Casca } from '../ui/Casca.tsx';
import { useApp, useConsulta, useGravar } from '../ui/contexto.tsx';
import {
  Botao,
  EstadoErro,
  EstadoVazio,
  Esqueleto,
  Etiqueta,
  LinhaDoTempo,
  MEDIDA,
  Rotulo,
  SeletorSegmentado,
  SeloSync,
  Texto,
  Titulo,
  useEstilos,
  type EstadoSync,
} from '../ui/ds/index.ts';
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

// ponytail: os seis tipos em duas linhas de tres (o segmentado do design system nao quebra linha).
const TIPOS = [
  { valor: 'sinais', rotulo: 'Sinais' },
  { valor: 'glasgow', rotulo: 'Glasgow' },
  { valor: 'triagem', rotulo: 'Triagem' },
  { valor: 'medicacao', rotulo: 'Medicação' },
  { valor: 'procedimento', rotulo: 'Procedimento' },
  { valor: 'observacao', rotulo: 'Observação' },
] as const satisfies ReadonlyArray<{ valor: Modo; rotulo: string }>;

export function Atendimento() {
  const app = useApp();
  const roteador = useRouter();
  const s = useEstilos((c) => ({
    bloco: { gap: 12, padding: MEDIDA.recuo, backgroundColor: c.papel, borderWidth: 1, borderColor: c.fio, borderRadius: MEDIDA.raio },
    linhaTempo: { backgroundColor: c.papel, borderWidth: 1, borderColor: c.fio, borderRadius: MEDIDA.raio },
  }));
  const { atendimentoId = '' } = useLocalSearchParams<{ atendimentoId: string }>();
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

  const voltar = { para: '/' as const, rotulo: 'Início' };
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
        <Esqueleto linhas={6} altura={40} />
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
  const tipoAtual = modo === 'retificar' || modo === 'encerrar' ? null : modo;

  return (
    <Casca
      titulo={atendimento.pessoaNome}
      subtitulo={
        <Texto tamanho="pequeno" tom="tinta2">
          {pessoa && identificacaoCurta(pessoa) ? `${identificacaoCurta(pessoa)} · ` : ''}início {formatarHora(atendimento.iniciadoEm)}
        </Texto>
      }
      acaoVoltar={
        <Botao role="link" icone={ArrowRightLeft} onPress={() => roteador.navigate(`/atendimentos/${atendimentoId}/passagem`)}>
          Passagem de caso
        </Botao>
      }
      atual="inicio"
      voltar={voltar}
    >
      <View style={s.bloco}>
        {encerrado ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <Etiqueta tom="cheia">Encerrado</Etiqueta>
            {atendimento.encerradoEm ? <Texto dado>{formatarMomento(atendimento.encerradoEm)}</Texto> : null}
            {atendimento.envio !== 'confirmado' ? <SeloSync estado={atendimento.envio} /> : null}
          </View>
        ) : (
          <>
            {atendimento.queixaPrincipal || atendimento.localDescricao ? (
              <Texto>
                {atendimento.queixaPrincipal ? (
                  <>
                    <Rotulo>Queixa </Rotulo>
                    {atendimento.queixaPrincipal}
                  </>
                ) : null}
                {atendimento.queixaPrincipal && atendimento.localDescricao ? ' · ' : null}
                {atendimento.localDescricao ? (
                  <>
                    <Rotulo>Local </Rotulo>
                    {atendimento.localDescricao}
                  </>
                ) : null}
              </Texto>
            ) : null}
            <SeletorSegmentado rotulo="Registrar agora" valor={tipoAtual} aoMudar={trocarModo} opcoes={TIPOS.slice(0, 3)} />
            <SeletorSegmentado rotulo="Registrar agora: outros tipos" rotuloOculto valor={tipoAtual} aoMudar={trocarModo} opcoes={TIPOS.slice(3)} />
          </>
        )}

        {/* key zera o formulario ao trocar de tipo. */}
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

        <View role={'status' as 'alert'} aria-live="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 }}>
          {recente && numeroDoRecente > 0 ? (
            <>
              <SeloSync estado={estados[recente.id] ?? 'local'} />
              <Texto>
                {REGISTRADO[recente.tipo]}, nº <Texto dado>{String(numeroDoRecente).padStart(2, '0')}</Texto>
              </Texto>
            </>
          ) : null}
        </View>

        {!encerrado ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Botao
              {...({ 'aria-pressed': modo === 'retificar' } as object)}
              icone={PenLine}
              onPress={() => trocarModo(modo === 'retificar' ? 'sinais' : 'retificar')}
            >
              Retificar
            </Botao>
            <Botao
              {...({ 'aria-pressed': modo === 'encerrar' } as object)}
              icone={CircleStop}
              onPress={() => trocarModo(modo === 'encerrar' ? 'sinais' : 'encerrar')}
            >
              Encerrar
            </Botao>
          </View>
        ) : null}
      </View>

      <View role="region" aria-label="Linha do tempo">
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <Titulo nivel={2}>Linha do tempo</Titulo>
          <Rotulo>
            {eventos.length} {eventos.length === 1 ? 'entrada' : 'entradas'}
          </Rotulo>
        </View>
        <View style={s.linhaTempo}>
          {eventos.length === 0 ? (
            <EstadoVazio titulo="Nenhum registro ainda" />
          ) : (
            <LinhaDoTempo eventos={eventos} estados={estados} recenteId={recente?.id} invertida />
          )}
        </View>
      </View>
    </Casca>
  );
}
