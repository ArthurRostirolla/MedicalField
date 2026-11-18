// Etiquetas: generica, triagem (cor + forma + palavra) e selo de sincronizacao.
import { Check } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Icone, Rotulo, Texto, type LucideIcon } from './base.tsx';
import { useTema } from './tema.tsx';
import { MEDIDA, TRIAGEM } from './tokens.ts';

/* ───────── Etiqueta generica (contorno; nunca bloco em matiz de triagem) ───────── */

export interface EtiquetaProps {
  children: ReactNode;
  tom?: 'neutra' | 'marca' | 'carmim' | 'cheia';
  icone?: LucideIcon;
}

export function Etiqueta({ children, tom = 'neutra', icone }: EtiquetaProps) {
  const { cores } = useTema();
  const cor = tom === 'marca' ? cores.marca : tom === 'carmim' ? cores.carmim : tom === 'cheia' ? cores.sobreInverso : cores.tinta2;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 4,
        paddingHorizontal: 6,
        borderWidth: 1,
        borderRadius: MEDIDA.raio,
        borderColor: tom === 'cheia' ? cores.inverso : cor,
        backgroundColor: tom === 'cheia' ? cores.inverso : 'transparent',
      }}
    >
      {icone ? <Icone icone={icone} cor={cor} tamanho={14} /> : null}
      <Rotulo style={{ color: cor, lineHeight: 18 }}>{children}</Rotulo>
    </View>
  );
}

/* ───────── Triagem ───────── */

export type ProtocoloTriagem = 'MANCHESTER' | 'START';
export type CorTriagem = 'VERMELHO' | 'LARANJA' | 'AMARELO' | 'VERDE' | 'AZUL' | 'PRETO';

/** Classificacoes validas por protocolo, na ordem do protocolo (contrato §6). */
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

/** Nome convencional de cada nivel no protocolo: rotulo do protocolo, nao interpretacao do sistema. */
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

export function descricaoTriagem(protocolo: ProtocoloTriagem, classificacao: CorTriagem): string | undefined {
  return DESCRICAO[protocolo][classificacao];
}

/** Uma forma fixa por cor: a classificacao continua legivel sem cor. */
const FORMA: Record<CorTriagem, string> = {
  VERMELHO: 'M8 0.5 15.5 8 8 15.5 0.5 8z',
  LARANJA: 'M8 1 15.5 14.5H0.5z',
  AMARELO: 'M1.5 1.5h13v13h-13z',
  VERDE: 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z',
  AZUL: 'M4.25 1.5h7.5L15.5 8l-3.75 6.5h-7.5L0.5 8z',
  PRETO: 'M3.2 1 8 5.8 12.8 1 15 3.2 10.2 8 15 12.8 12.8 15 8 10.2 3.2 15 1 12.8 5.8 8 1 3.2z',
};

export function FormaTriagem({ cor, tamanho = 14 }: { cor: CorTriagem; tamanho?: number }) {
  return (
    <Svg viewBox="0 0 16 16" width={tamanho} height={tamanho} aria-hidden>
      <Path d={FORMA[cor]} fill={TRIAGEM[cor].texto} />
    </Svg>
  );
}

export interface EtiquetaTriagemProps {
  protocolo: ProtocoloTriagem;
  classificacao: CorTriagem;
  tamanho?: 'p' | 'g';
  /** Mostra o nome do nivel no protocolo ao lado da cor. */
  comDescricao?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Bloco chapado na cor do protocolo + forma + palavra. O unico bloco em matiz de triagem do sistema. */
export function EtiquetaTriagem({ protocolo, classificacao, tamanho = 'p', comDescricao, children, style }: EtiquetaTriagemProps) {
  const { cores } = useTema();
  const { fundo, texto } = TRIAGEM[classificacao];
  const descricao = DESCRICAO[protocolo][classificacao];
  const grande = tamanho === 'g';
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: grande ? 10 : 6,
          minHeight: grande ? 48 : 22,
          paddingLeft: grande ? 12 : 6,
          paddingRight: grande ? 12 : 8,
          borderWidth: 1,
          borderColor: cores.triagemContorno,
          borderRadius: MEDIDA.raio,
          backgroundColor: fundo,
        },
        style,
      ]}
    >
      <FormaTriagem cor={classificacao} tamanho={grande ? 18 : 14} />
      <Texto style={{ color: texto, fontWeight: '800', fontSize: grande ? MEDIDA.corpo : MEDIDA.rotulo, textTransform: 'uppercase' }}>
        {NOME_COR[classificacao]}
      </Texto>
      {comDescricao && descricao ? (
        <Texto style={{ color: texto, flex: grande ? 1 : undefined, fontSize: grande ? MEDIDA.pequeno : MEDIDA.rotulo }}>{descricao}</Texto>
      ) : null}
      {children}
    </View>
  );
}

export interface SeletorTriagemProps {
  protocolo: ProtocoloTriagem;
  valor: CorTriagem | null;
  aoMudar: (classificacao: CorTriagem) => void;
  rotulo?: string;
  comDescricao?: boolean;
}

/** Grupo de radio em que cada opcao e o proprio bloco de triagem. O profissional escolhe; o sistema nao sugere. */
export function SeletorTriagem({ protocolo, valor, aoMudar, rotulo = 'Classificação', comDescricao = true }: SeletorTriagemProps) {
  const { cores } = useTema();
  return (
    <View role="radiogroup" aria-label={rotulo} style={{ gap: 8 }}>
      <Rotulo>{rotulo}</Rotulo>
      {CLASSIFICACOES_TRIAGEM[protocolo].map((cor) => {
        const marcado = valor === cor;
        return (
          <Pressable
            key={cor}
            role="radio"
            aria-checked={marcado}
            aria-label={NOME_COR[cor]}
            onPress={() => aoMudar(cor)}
            style={{ borderWidth: 3, borderColor: marcado ? cores.tinta : 'transparent', borderRadius: MEDIDA.raio + 3, padding: 2 }}
          >
            <EtiquetaTriagem protocolo={protocolo} classificacao={cor} tamanho="g" comDescricao={comDescricao} style={{ alignSelf: 'stretch' }}>
              {marcado ? <Icone icone={Check} cor={TRIAGEM[cor].texto} /> : null}
            </EtiquetaTriagem>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ───────── Selo de sincronizacao ───────── */

export type EstadoSync = 'local' | 'enviando' | 'confirmado' | 'rejeitado';

const ROTULO_SYNC: Record<EstadoSync, string> = {
  local: 'Local',
  enviando: 'Enviando',
  confirmado: 'Confirmado',
  rejeitado: 'Rejeitado',
};

/** Marca: vazada = so no aparelho, meia = enviando, cheia = confirmada, riscada = rejeitada. */
export function MarcaSync({ estado, cor, tamanho = 14 }: { estado: EstadoSync; cor: string; tamanho?: number }) {
  return (
    <Svg viewBox="0 0 16 16" width={tamanho} height={tamanho} fill="none" stroke={cor} strokeWidth={2} aria-hidden>
      <Circle cx={8} cy={8} r={6} fill={estado === 'confirmado' ? cor : 'none'} />
      {estado === 'enviando' ? <Path d="M8 2a6 6 0 0 0 0 12z" fill={cor} stroke="none" /> : null}
      {estado === 'rejeitado' ? <Path d="M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2" strokeLinecap="square" /> : null}
    </Svg>
  );
}

export interface SeloSyncProps {
  estado: EstadoSync;
  /** Troca o texto (ex.: "Na fila"). */
  rotulo?: string;
  /** Mostra so a marca; o rotulo continua disponivel para leitor de tela. */
  somenteMarca?: boolean;
}

export function SeloSync({ estado, rotulo, somenteMarca }: SeloSyncProps) {
  const { cores } = useTema();
  const texto = rotulo ?? ROTULO_SYNC[estado];
  const cor = estado === 'rejeitado' ? cores.carmim : estado === 'confirmado' ? cores.tinta2 : cores.marca;
  return (
    <View aria-label={somenteMarca ? texto : undefined} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4 }}>
      <MarcaSync estado={estado} cor={cor} />
      {somenteMarca ? null : (
        <Texto tamanho="rotulo" forte style={{ color: cor }}>
          {texto}
        </Texto>
      )}
    </View>
  );
}
