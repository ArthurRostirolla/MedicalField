// Linha do tempo imutavel: pauta numerada; retificacao cita o numero que corrige.
import { Activity, Brain, CircleStop, NotebookPen, PenLine, Stethoscope, Syringe, Tags } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { formatarHora } from '../formato.ts';
import { Icone, Rotulo, Texto, type LucideIcon } from './base.tsx';
import { Etiqueta, EtiquetaTriagem, SeloSync, type CorTriagem, type EstadoSync, type ProtocoloTriagem } from './etiquetas.tsx';
import { useTema } from './tema.tsx';
import { MEDIDA } from './tokens.ts';

export type TipoEvento =
  | 'SINAIS_VITAIS'
  | 'GLASGOW'
  | 'TRIAGEM'
  | 'MEDICACAO'
  | 'PROCEDIMENTO'
  | 'OBSERVACAO'
  | 'RETIFICACAO'
  | 'ENCERRAMENTO';

/** Compativel estruturalmente com `Evento` de `docs/contratos.md` §6. */
export interface EventoLinha {
  id: string;
  tipo: TipoEvento;
  ocorridoEm: string;
  dados: object;
  profissionalNome?: string;
  retificaEventoId?: string;
}

const TIPO: Record<TipoEvento, { rotulo: string; icone: LucideIcon }> = {
  SINAIS_VITAIS: { rotulo: 'Sinais vitais', icone: Activity },
  GLASGOW: { rotulo: 'Glasgow', icone: Brain },
  TRIAGEM: { rotulo: 'Triagem', icone: Tags },
  MEDICACAO: { rotulo: 'Medicação', icone: Syringe },
  PROCEDIMENTO: { rotulo: 'Procedimento', icone: Stethoscope },
  OBSERVACAO: { rotulo: 'Observação', icone: NotebookPen },
  RETIFICACAO: { rotulo: 'Retificação', icone: PenLine },
  ENCERRAMENTO: { rotulo: 'Encerramento', icone: CircleStop },
};

export interface Leitura {
  rotulo: string;
  valor: string;
  unidade: string;
}

const numero = (valor: unknown): number | null => (typeof valor === 'number' && Number.isFinite(valor) ? valor : null);
const texto = (valor: unknown): string => (typeof valor === 'string' ? valor : '');

/** Sinais vitais em leituras prontas para exibir. So formata; nao interpreta. */
export function leiturasSinaisVitais(dados: object): Leitura[] {
  const d = dados as Record<string, unknown>;
  const leituras: Leitura[] = [];
  const sistolica = numero(d.pressaoSistolica);
  const diastolica = numero(d.pressaoDiastolica);
  if (sistolica !== null || diastolica !== null) {
    leituras.push({ rotulo: 'PA', valor: `${sistolica ?? '—'}/${diastolica ?? '—'}`, unidade: 'mmHg' });
  }
  const simples: Array<[string, string, string, number?]> = [
    ['frequenciaCardiaca', 'FC', 'bpm'],
    ['frequenciaRespiratoria', 'FR', 'irpm'],
    ['saturacao', 'SpO₂', '%'],
    ['temperatura', 'Temp', '°C', 1],
    ['glicemia', 'Glic', 'mg/dL'],
  ];
  for (const [chave, rotulo, unidade, casas] of simples) {
    const valor = numero(d[chave]);
    if (valor !== null) leituras.push({ rotulo, valor: casas ? valor.toFixed(casas).replace('.', ',') : String(valor), unidade });
  }
  return leituras;
}

export function Leituras({ leituras }: { leituras: Leitura[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 }}>
      {leituras.map((leitura) => (
        <View key={leitura.rotulo}>
          <Rotulo>{leitura.rotulo}</Rotulo>
          <Texto dado forte>
            {leitura.valor}
            <Texto tamanho="rotulo" tom="tinta3">
              {' '}
              {leitura.unidade}
            </Texto>
          </Texto>
        </View>
      ))}
    </View>
  );
}

function CorpoEvento({ evento }: { evento: EventoLinha }): ReactNode {
  const d = evento.dados as Record<string, unknown>;
  switch (evento.tipo) {
    case 'SINAIS_VITAIS':
      return <Leituras leituras={leiturasSinaisVitais(d)} />;
    case 'GLASGOW':
      return (
        <Leituras
          leituras={[
            { rotulo: 'Total', valor: String(d.total ?? '—'), unidade: '/15' },
            { rotulo: 'Ocular', valor: String(d.ocular ?? '—'), unidade: '' },
            { rotulo: 'Verbal', valor: String(d.verbal ?? '—'), unidade: '' },
            { rotulo: 'Motora', valor: String(d.motora ?? '—'), unidade: '' },
          ]}
        />
      );
    case 'TRIAGEM':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <EtiquetaTriagem protocolo={d.protocolo as ProtocoloTriagem} classificacao={d.classificacao as CorTriagem} comDescricao />
          <Rotulo>{d.protocolo === 'START' ? 'START' : 'Manchester'}</Rotulo>
        </View>
      );
    case 'MEDICACAO':
      return (
        <View style={{ gap: 4 }}>
          <Texto>
            <Texto forte>{texto(d.nome)}</Texto> · <Texto dado>{texto(d.dose)}</Texto> {texto(d.unidade)} · {texto(d.via)}
          </Texto>
          {d.medicamentoId === null ? <Etiqueta>Fora do catálogo</Etiqueta> : null}
        </View>
      );
    case 'PROCEDIMENTO':
      return <Texto>{texto(d.descricao)}</Texto>;
    case 'OBSERVACAO':
      return <Texto>{texto(d.texto)}</Texto>;
    case 'RETIFICACAO': {
      const corrigidos = (d.dadosCorrigidos ?? null) as Record<string, unknown> | null;
      const leituras = corrigidos ? leiturasSinaisVitais(corrigidos) : [];
      return (
        <View style={{ gap: 4 }}>
          <Texto>Motivo: {texto(d.motivo)}</Texto>
          {leituras.length > 0 ? (
            <Leituras leituras={leituras} />
          ) : corrigidos ? (
            <Leituras leituras={Object.entries(corrigidos).map(([chave, valor]) => ({ rotulo: chave, valor: String(valor), unidade: '' }))} />
          ) : null}
        </View>
      );
    }
    case 'ENCERRAMENTO':
      return (
        <Texto>
          <Texto forte>{texto(d.desfecho)}</Texto>
          {d.destino ? ` · Destino: ${texto(d.destino)}` : null}
        </Texto>
      );
  }
}

export interface ItemEventoProps {
  evento: EventoLinha;
  /** Numero da entrada na ficha (ordem de ocorrencia). */
  numero: number;
  estado?: EstadoSync;
  /** No da entrada que este evento retifica. */
  retificaNumero?: number;
  /** No da retificacao que corrigiu este evento: ele aparece riscado, nunca some. */
  retificadoPorNumero?: number;
  /** Acabou de ser registrado. */
  recente?: boolean;
  fusoHorario?: string;
}

export function ItemEvento({ evento, numero: numeroEntrada, estado, retificaNumero, retificadoPorNumero, recente, fusoHorario }: ItemEventoProps) {
  const { cores } = useTema();
  const { rotulo, icone } = TIPO[evento.tipo];
  const retificado = retificadoPorNumero !== undefined;
  return (
    <View
      role="listitem"
      style={{
        flexDirection: 'row',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: MEDIDA.recuo,
        borderTopWidth: 1,
        borderTopColor: cores.fio,
        backgroundColor: recente ? cores.marcaSuave : 'transparent',
        opacity: retificado ? 0.6 : 1,
      }}
    >
      <View style={{ width: 64, gap: 2 }}>
        <Texto dado forte>
          {formatarHora(evento.ocorridoEm, fusoHorario)}
        </Texto>
        <Texto tamanho="rotulo" tom="tinta3" aria-label={`Entrada nº ${numeroEntrada}`}>
          nº {String(numeroEntrada).padStart(2, '0')}
        </Texto>
        {/* A via fica sempre aqui; so o estado normal (confirmado) dispensa a palavra. */}
        {estado ? <SeloSync estado={estado} somenteMarca={estado === 'confirmado'} /> : null}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <Icone icone={icone} cor={cores.tinta2} tamanho={16} />
          <Rotulo style={retificado ? { textDecorationLine: 'line-through' } : undefined}>{rotulo}</Rotulo>
          {retificaNumero !== undefined ? <Etiqueta tom="cheia">Retifica nº {retificaNumero}</Etiqueta> : null}
          {retificado ? <Etiqueta>Retificado pela nº {retificadoPorNumero}</Etiqueta> : null}
        </View>
        <CorpoEvento evento={evento} />
        {evento.profissionalNome ? (
          <Texto tamanho="pequeno" tom="tinta3">
            {evento.profissionalNome}
          </Texto>
        ) : null}
      </View>
    </View>
  );
}

export interface LinhaDoTempoProps {
  /** Ja ordenados por `ocorridoEm` (use a funcao de `packages/dominio`). */
  eventos: ReadonlyArray<EventoLinha>;
  /** Situacao de sincronizacao por id de evento. */
  estados?: Readonly<Record<string, EstadoSync>>;
  /** Id do evento recem-registrado. */
  recenteId?: string;
  fusoHorario?: string;
  /** Mais recente primeiro (uso em campo). A numeracao nao muda. */
  invertida?: boolean;
  'aria-label'?: string;
}

export function LinhaDoTempo({ eventos, estados, recenteId, fusoHorario, invertida, 'aria-label': rotulo = 'Linha do tempo do atendimento' }: LinhaDoTempoProps) {
  const numeroPorId = new Map(eventos.map((evento, indice) => [evento.id, indice + 1]));
  const retificadoPor = new Map<string, number>();
  eventos.forEach((evento, indice) => {
    if (evento.retificaEventoId) retificadoPor.set(evento.retificaEventoId, indice + 1);
  });
  const itens = eventos.map((evento, indice) => (
    <ItemEvento
      key={evento.id}
      evento={evento}
      numero={indice + 1}
      estado={estados?.[evento.id]}
      retificaNumero={evento.retificaEventoId ? numeroPorId.get(evento.retificaEventoId) : undefined}
      retificadoPorNumero={retificadoPor.get(evento.id)}
      recente={evento.id === recenteId}
      fusoHorario={fusoHorario}
    />
  ));
  return (
    <View role="list" aria-label={rotulo}>
      {invertida ? itens.reverse() : itens}
    </View>
  );
}
