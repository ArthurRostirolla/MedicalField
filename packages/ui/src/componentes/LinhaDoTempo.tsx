import {
  Activity,
  Brain,
  CircleStop,
  NotebookPen,
  PenLine,
  Stethoscope,
  Syringe,
  Tags,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { formatarHora } from '../util';
import { Etiqueta, EtiquetaTriagem, SeloSync, type CorTriagem, type EstadoSync, type ProtocoloTriagem } from './etiquetas';

export type TipoEvento =
  | 'SINAIS_VITAIS'
  | 'GLASGOW'
  | 'TRIAGEM'
  | 'MEDICACAO'
  | 'PROCEDIMENTO'
  | 'OBSERVACAO'
  | 'RETIFICACAO'
  | 'ENCERRAMENTO';

/** Compatível estruturalmente com `Evento` de `docs/contratos.md` §6. */
export interface EventoLinha {
  id: string;
  tipo: TipoEvento;
  ocorridoEm: string;
  dados: object;
  profissionalNome?: string;
  retificaEventoId?: string;
}

/** Nome do tipo de evento, como aparece na linha do tempo. */
export const rotuloEvento = (tipo: TipoEvento): string => TIPO[tipo].rotulo;

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

/** Sinais vitais em leituras prontas para exibir. Só formata; não interpreta. */
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
    if (valor !== null) {
      leituras.push({ rotulo, valor: casas ? valor.toFixed(casas).replace('.', ',') : String(valor), unidade });
    }
  }
  return leituras;
}

export function Leituras({ leituras }: { leituras: Leitura[] }) {
  return (
    <dl className="mf-leituras">
      {leituras.map((leitura) => (
        <div key={leitura.rotulo} className="mf-leitura">
          <dt>{leitura.rotulo}</dt>
          <dd>
            {leitura.valor}
            <small>{leitura.unidade}</small>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function CorpoEvento({ evento }: { evento: EventoLinha }): ReactNode {
  const d = evento.dados as Record<string, unknown>;
  switch (evento.tipo) {
    case 'SINAIS_VITAIS':
      return <Leituras leituras={leiturasSinaisVitais(d)} />;
    case 'GLASGOW':
      return (
        <>
          <Leituras leituras={[{ rotulo: 'Total', valor: String(d.total ?? '—'), unidade: '/15' }]} />
          <Leituras
            leituras={[
              { rotulo: 'Ocular', valor: String(d.ocular ?? '—'), unidade: '' },
              { rotulo: 'Verbal', valor: String(d.verbal ?? '—'), unidade: '' },
              { rotulo: 'Motora', valor: String(d.motora ?? '—'), unidade: '' },
            ]}
          />
        </>
      );
    case 'TRIAGEM':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <EtiquetaTriagem
            protocolo={d.protocolo as ProtocoloTriagem}
            classificacao={d.classificacao as CorTriagem}
            comDescricao
          />
          <span className="mf-rotulo">{d.protocolo === 'START' ? 'START' : 'Manchester'}</span>
        </span>
      );
    case 'MEDICACAO':
      return (
        <>
          <strong>{texto(d.nome)}</strong> · <span className="mf-num">{texto(d.dose)}</span> {texto(d.unidade)} ·{' '}
          {texto(d.via)}
          {d.medicamentoId === null ? (
            <>
              {' '}
              <Etiqueta>Fora do catálogo</Etiqueta>
            </>
          ) : null}
        </>
      );
    case 'PROCEDIMENTO':
      return texto(d.descricao);
    case 'OBSERVACAO':
      return texto(d.texto);
    case 'RETIFICACAO': {
      const corrigidos = (d.dadosCorrigidos ?? null) as Record<string, unknown> | null;
      const leituras = corrigidos ? leiturasSinaisVitais(corrigidos) : [];
      return (
        <>
          <span>Motivo: {texto(d.motivo)}</span>
          {leituras.length > 0 ? (
            <Leituras leituras={leituras} />
          ) : corrigidos ? (
            <Leituras
              leituras={Object.entries(corrigidos).map(([chave, valor]) => ({
                rotulo: chave,
                valor: String(valor),
                unidade: '',
              }))}
            />
          ) : null}
        </>
      );
    }
    case 'ENCERRAMENTO':
      return (
        <>
          <strong>{texto(d.desfecho)}</strong>
          {d.destino ? <> · Destino: {texto(d.destino)}</> : null}
        </>
      );
  }
}

export interface ItemEventoProps {
  evento: EventoLinha;
  /** Número da entrada na ficha (ordem de ocorrência). */
  numero: number;
  estado?: EstadoSync;
  /** Nº da entrada que este evento retifica. */
  retificaNumero?: number;
  /** Nº da retificação que corrigiu este evento: ele aparece riscado, nunca some. */
  retificadoPorNumero?: number;
  /** Acabou de ser registrado: recebe o "carimbo". */
  recente?: boolean;
  fusoHorario?: string;
}

export function ItemEvento({
  evento,
  numero: numeroEntrada,
  estado,
  retificaNumero,
  retificadoPorNumero,
  recente,
  fusoHorario,
}: ItemEventoProps) {
  const { rotulo, icone: Icone } = TIPO[evento.tipo];
  return (
    <li
      className="mf-evento"
      data-tipo={evento.tipo}
      data-retificado={retificadoPorNumero !== undefined}
      data-recente={recente || undefined}
    >
      <div className="mf-evento__carimbo">
        <time className="mf-evento__hora" dateTime={evento.ocorridoEm}>
          {formatarHora(evento.ocorridoEm, fusoHorario)}
        </time>
        <span className="mf-evento__numero">
          <span className="mf-so-leitor">Entrada </span>nº {String(numeroEntrada).padStart(2, '0')}
        </span>
        {/* A via fica sempre aqui; só o estado normal (confirmado) dispensa a palavra. */}
        {estado ? <SeloSync estado={estado} somenteMarca={estado === 'confirmado'} /> : null}
      </div>
      <div>
        <div className="mf-evento__tipo">
          <Icone aria-hidden />
          <span className="mf-rotulo">{rotulo}</span>
          {retificaNumero !== undefined ? <Etiqueta tom="cheia">Retifica nº {retificaNumero}</Etiqueta> : null}
          {retificadoPorNumero !== undefined ? (
            <Etiqueta>Retificado pela nº {retificadoPorNumero}</Etiqueta>
          ) : null}
        </div>
        <div className="mf-evento__corpo">
          <CorpoEvento evento={evento} />
        </div>
        {evento.profissionalNome ? <div className="mf-evento__autor">{evento.profissionalNome}</div> : null}
      </div>
    </li>
  );
}

export interface LinhaDoTempoProps {
  /** Já ordenados por `ocorridoEm` (use a função de `packages/dominio`). */
  eventos: ReadonlyArray<EventoLinha>;
  /** Situação de sincronização por id de evento (app de campo). */
  estados?: Readonly<Record<string, EstadoSync>>;
  /** Id do evento recém-registrado. */
  recenteId?: string;
  fusoHorario?: string;
  /** Mais recente primeiro (uso em campo). A numeração não muda. */
  invertida?: boolean;
  'aria-label'?: string;
}

/** Linha do tempo imutável: pauta numerada; retificação cita o número que corrige. */
export function LinhaDoTempo({
  eventos,
  estados,
  recenteId,
  fusoHorario,
  invertida,
  'aria-label': rotulo = 'Linha do tempo do atendimento',
}: LinhaDoTempoProps) {
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
    <ol className="mf-linha" aria-label={rotulo} reversed={invertida}>
      {invertida ? itens.reverse() : itens}
    </ol>
  );
}
