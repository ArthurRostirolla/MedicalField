import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cx } from '../util';

/* ───────── Etiqueta genérica (contorno; nunca bloco em matiz de triagem) ───────── */

export interface EtiquetaProps {
  children: ReactNode;
  tom?: 'neutra' | 'marca' | 'carmim' | 'cheia';
  icone?: ReactNode;
  className?: string;
}

export function Etiqueta({ children, tom = 'neutra', icone, className }: EtiquetaProps) {
  return (
    <span className={cx('mf-etiqueta', tom !== 'neutra' && `mf-etiqueta--${tom}`, className)}>
      {icone}
      {children}
    </span>
  );
}

/* ───────── Triagem ───────── */

export type ProtocoloTriagem = 'MANCHESTER' | 'START';
export type CorTriagem = 'VERMELHO' | 'LARANJA' | 'AMARELO' | 'VERDE' | 'AZUL' | 'PRETO';

/** Classificações válidas por protocolo, na ordem do protocolo (contrato §6). */
export const CLASSIFICACOES_TRIAGEM: Record<ProtocoloTriagem, ReadonlyArray<CorTriagem>> = {
  MANCHESTER: ['VERMELHO', 'LARANJA', 'AMARELO', 'VERDE', 'AZUL'],
  START: ['VERMELHO', 'AMARELO', 'VERDE', 'PRETO'],
};

const NOME_COR: Record<CorTriagem, string> = {
  VERMELHO: 'Vermelho',
  LARANJA: 'Laranja',
  AMARELO: 'Amarelo',
  VERDE: 'Verde',
  AZUL: 'Azul',
  PRETO: 'Preto',
};

/**
 * Nome convencional de cada nível no protocolo. É rótulo do protocolo, não interpretação
 * do sistema; só aparece com `comDescricao` e deve ser validado pelo responsável clínico.
 */
const DESCRICAO: Record<ProtocoloTriagem, Partial<Record<CorTriagem, string>>> = {
  MANCHESTER: {
    VERMELHO: 'Emergência',
    LARANJA: 'Muito urgente',
    AMARELO: 'Urgente',
    VERDE: 'Pouco urgente',
    AZUL: 'Não urgente',
  },
  START: { VERMELHO: 'Imediato', AMARELO: 'Pode aguardar', VERDE: 'Leve', PRETO: 'Expectante' },
};

/** Nome convencional do nível no protocolo (ex.: Manchester laranja = "Muito urgente"). */
export function descricaoTriagem(protocolo: ProtocoloTriagem, classificacao: CorTriagem): string | undefined {
  return DESCRICAO[protocolo][classificacao];
}

/** Uma forma fixa por cor: a classificação continua legível sem cor (daltonismo, sol, impressão P&B). */
const FORMA: Record<CorTriagem, string> = {
  VERMELHO: 'M8 0.5 15.5 8 8 15.5 0.5 8z', // losango
  LARANJA: 'M8 1 15.5 14.5H0.5z', // triângulo
  AMARELO: 'M1.5 1.5h13v13h-13z', // quadrado
  VERDE: 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z', // círculo
  AZUL: 'M4.25 1.5h7.5L15.5 8l-3.75 6.5h-7.5L0.5 8z', // hexágono
  PRETO: 'M3.2 1 8 5.8 12.8 1 15 3.2 10.2 8 15 12.8 12.8 15 8 10.2 3.2 15 1 12.8 5.8 8 1 3.2z', // cruz
};

export function FormaTriagem({ cor }: { cor: CorTriagem }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d={FORMA[cor]} />
    </svg>
  );
}

export interface EtiquetaTriagemProps {
  protocolo: ProtocoloTriagem;
  classificacao: CorTriagem;
  tamanho?: 'p' | 'g';
  /** Mostra o nome do nível no protocolo ao lado da cor. */
  comDescricao?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Bloco chapado na cor do protocolo + forma + palavra. O único bloco em matiz de triagem do sistema. */
export function EtiquetaTriagem({
  protocolo,
  classificacao,
  tamanho = 'p',
  comDescricao,
  className,
  children,
}: EtiquetaTriagemProps) {
  const descricao = DESCRICAO[protocolo][classificacao];
  const nomeProtocolo = protocolo === 'MANCHESTER' ? 'Manchester' : 'START';
  return (
    <span className={cx('mf-triagem', tamanho === 'g' && 'mf-triagem--g', className)} data-cor={classificacao}>
      <FormaTriagem cor={classificacao} />
      <span className="mf-so-leitor">Triagem {nomeProtocolo}: </span>
      <span>{NOME_COR[classificacao]}</span>
      {comDescricao && descricao ? <span className="mf-triagem__descricao">{descricao}</span> : null}
      {children}
    </span>
  );
}

export interface SeletorTriagemProps {
  protocolo: ProtocoloTriagem;
  valor: CorTriagem | null;
  aoMudar: (classificacao: CorTriagem) => void;
  rotulo?: string;
  comDescricao?: boolean;
}

/** Grupo de rádio em que cada opção é o próprio bloco de triagem. O profissional escolhe; o sistema não sugere. */
export function SeletorTriagem({
  protocolo,
  valor,
  aoMudar,
  rotulo = 'Classificação',
  comDescricao = true,
}: SeletorTriagemProps) {
  const nome = useId();
  return (
    <fieldset className="mf-segmentado">
      <legend className="mf-rotulo">{rotulo}</legend>
      <div className="mf-seletor-triagem">
        {CLASSIFICACOES_TRIAGEM[protocolo].map((cor) => (
          <label key={cor} className="mf-seletor-triagem__opcao">
            <input type="radio" name={nome} value={cor} checked={valor === cor} onChange={() => aoMudar(cor)} />
            <EtiquetaTriagem protocolo={protocolo} classificacao={cor} tamanho="g" comDescricao={comDescricao}>
              <Check className="mf-seletor-triagem__marca" aria-hidden />
            </EtiquetaTriagem>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ───────── Selo de sincronização ───────── */

export type EstadoSync = 'local' | 'enviando' | 'confirmado' | 'rejeitado';

const ROTULO_SYNC: Record<EstadoSync, string> = {
  local: 'Local',
  enviando: 'Enviando',
  confirmado: 'Confirmado',
  rejeitado: 'Rejeitado',
};

/** Marca em célula fixa: vazada = só no aparelho, meia = enviando, cheia = confirmada, riscada = rejeitada. */
export function MarcaSync({ estado }: { estado: EstadoSync }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="8" cy="8" r="6" fill={estado === 'confirmado' ? 'currentColor' : 'none'} />
      {estado === 'enviando' ? <path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor" stroke="none" /> : null}
      {estado === 'rejeitado' ? <path d="M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2" strokeLinecap="square" /> : null}
    </svg>
  );
}

export interface SeloSyncProps {
  estado: EstadoSync;
  /** Troca o texto (ex.: "Na fila", "Enviado" para e-mail). */
  rotulo?: string;
  /** Mostra só a marca; o rótulo continua disponível para leitor de tela e em `title`. */
  somenteMarca?: boolean;
  className?: string;
}

export function SeloSync({ estado, rotulo, somenteMarca, className }: SeloSyncProps) {
  const texto = rotulo ?? ROTULO_SYNC[estado];
  return (
    <span className={cx('mf-selo', className)} data-estado={estado} title={somenteMarca ? texto : undefined}>
      <MarcaSync estado={estado} />
      <span className={somenteMarca ? 'mf-so-leitor' : undefined}>{texto}</span>
    </span>
  );
}
