// Tokens do design system em valores para o React Native.
// ponytail: copia manual de packages/ui/src/tokens.css (densidade "campo"); se divergir, gerar do CSS.
import { Platform } from 'react-native';

export type Tema = 'claro' | 'escuro';

const claro = {
  mesa: '#f6f7f9',
  papel: '#ffffff',
  papel2: '#f7f8fa',
  inverso: '#1b2129',
  sobreInverso: '#ffffff',
  tinta: '#161b22',
  tinta2: '#3d4653',
  tinta3: '#5e6775',
  fio: '#e4e7ec',
  fioForte: '#868f9c',
  marca: '#c8102e',
  marcaForte: '#a00c25',
  marcaSuave: '#fdeef0',
  sobreMarca: '#ffffff',
  foco: '#c8102e',
  rosa: '#fff7f8',
  rosaFio: '#eab3bc',
  rosaTinta: '#a30d2a',
  carmim: '#b42318',
  carmimSuave: '#fdf0ee',
  triagemContorno: 'transparent',
  hachura: 'rgba(22,27,34,0.06)',
  veu: 'rgba(22,27,34,0.45)',
};

export type Cores = typeof claro;

const escuro: Cores = {
  mesa: '#0d1014',
  papel: '#151a20',
  papel2: '#1c222a',
  inverso: '#e8ecf1',
  sobreInverso: '#151a20',
  tinta: '#eef1f5',
  tinta2: '#c3cad4',
  tinta3: '#97a1ae',
  fio: '#2b323c',
  fioForte: '#6e7887',
  marca: '#ff6b7f',
  marcaForte: '#ff9aa8',
  marcaSuave: '#3b1820',
  sobreMarca: '#1a0a0e',
  foco: '#ff6b7f',
  rosa: '#22161a',
  rosaFio: '#5e2f39',
  rosaTinta: '#ffb0bb',
  carmim: '#ff8a7a',
  carmimSuave: '#3a1714',
  triagemContorno: 'rgba(238,241,245,0.55)',
  hachura: 'rgba(238,241,245,0.08)',
  veu: 'rgba(0,0,0,0.65)',
};

export const CORES: Record<Tema, Cores> = { claro, escuro };

/** Cores de triagem: codigo clinico convencional, iguais nos dois temas. */
export const TRIAGEM = {
  VERMELHO: { fundo: '#c4161c', texto: '#ffffff' },
  LARANJA: { fundo: '#f07d12', texto: '#1a1320' },
  AMARELO: { fundo: '#f6d21a', texto: '#1a1320' },
  VERDE: { fundo: '#1b7a3a', texto: '#ffffff' },
  AZUL: { fundo: '#1d5bb5', texto: '#ffffff' },
  PRETO: { fundo: '#101010', texto: '#ffffff' },
} as const;

/** Densidade de campo: alvos de 56 px, corpo de 17 px. */
export const MEDIDA = {
  alvo: 56,
  corpo: 17,
  corpoAltura: 24,
  rotulo: 12,
  pequeno: 15,
  pequenoAltura: 20,
  numeral: 40,
  recuo: 16,
  raio: 4,
  raioSobreposicao: 8,
  titulo1: 32,
  titulo2: 24,
  titulo3: 20,
} as const;

// ponytail: fonte do sistema; Archivo/Martian Mono (fontsource, so woff2) entram quando houver TTF.
export const FONTE = {
  dados: Platform.select({ android: 'monospace', ios: 'Menlo', default: "ui-monospace, 'Cascadia Mono', monospace" }),
} as const;
