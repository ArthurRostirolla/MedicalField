// Pecas basicas: texto com a tinta do tema, titulo com nivel, botao e chave.
// Papeis e nomes acessiveis seguem o design system web (os e2e procuram por eles).
import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type PressableProps, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import { Toque } from './movimento.tsx';
import { useEstilos, useTema } from './tema.tsx';
import { FONTE, MEDIDA } from './tokens.ts';

export type { LucideIcon };

type Tom = 'tinta' | 'tinta2' | 'tinta3' | 'marca' | 'carmim' | 'sobreInverso' | 'rosaTinta';

export interface TextoProps extends TextProps {
  tom?: Tom;
  tamanho?: 'corpo' | 'pequeno' | 'rotulo';
  forte?: boolean;
  /** Fonte de dados (numeros, codigos). */
  dado?: boolean;
}

/** Texto padrao: no RN a cor nao herda de View, entao todo texto passa por aqui. */
export function Texto({ tom = 'tinta', tamanho = 'corpo', forte, dado, style, ...resto }: TextoProps) {
  const { cores } = useTema();
  const fonte =
    tamanho === 'pequeno'
      ? { fontSize: MEDIDA.pequeno, lineHeight: MEDIDA.pequenoAltura }
      : tamanho === 'rotulo'
        ? { fontSize: MEDIDA.rotulo, lineHeight: 16 }
        : { fontSize: MEDIDA.corpo, lineHeight: MEDIDA.corpoAltura };
  return (
    <Text
      {...resto}
      style={[
        { color: cores[tom], ...fonte },
        forte && { fontWeight: '700' },
        dado && { fontFamily: FONTE.dados },
        style,
      ]}
    />
  );
}

/** Rotulo pequeno em caixa alta (`.mf-rotulo`). */
export function Rotulo({ style, ...resto }: TextProps) {
  const { cores } = useTema();
  return (
    <Text
      {...resto}
      style={[
        { color: cores.tinta2, fontSize: MEDIDA.rotulo, lineHeight: 16, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
        style,
      ]}
    />
  );
}

/** Titulo com nivel de cabecalho para leitor de tela (h1..h3 na web). */
export function Titulo({ nivel = 2, style, ...resto }: TextProps & { nivel?: 1 | 2 | 3 }) {
  const { cores } = useTema();
  const tamanho = nivel === 1 ? MEDIDA.titulo2 : nivel === 2 ? MEDIDA.titulo3 : MEDIDA.corpo;
  return (
    <Text
      {...resto}
      role="heading"
      {...({ 'aria-level': nivel } as object)}
      style={[{ color: cores.tinta, fontSize: tamanho, lineHeight: tamanho * 1.2, fontWeight: '800' }, style]}
    />
  );
}

/** Icone lucide com a cor e o tamanho do contexto. */
export function Icone({ icone: IconeLucide, cor, tamanho = 20 }: { icone: LucideIcon; cor?: string; tamanho?: number }) {
  const { cores } = useTema();
  return <IconeLucide color={cor ?? cores.tinta} size={tamanho} aria-hidden />;
}

export interface BotaoProps extends Omit<PressableProps, 'children' | 'style'> {
  /** `primario`: uma unica acao principal por tela. */
  variante?: 'primario' | 'secundario' | 'fantasma' | 'perigo';
  icone?: LucideIcon;
  /** Botao quadrado so com icone; exige `aria-label`. */
  somenteIcone?: boolean;
  largo?: boolean;
  /** Mantem o rotulo, troca o icone pelo indicador e ignora toques. */
  carregando?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Botao({
  variante = 'secundario',
  icone,
  somenteIcone,
  largo,
  carregando,
  disabled,
  onPress,
  children,
  style,
  ...resto
}: BotaoProps) {
  const { cores } = useTema();
  const s = useEstilos((c) => ({
    botao: {
      minHeight: MEDIDA.alvo,
      paddingHorizontal: MEDIDA.recuo * 1.25,
      borderWidth: 1,
      borderRadius: MEDIDA.raio,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderColor: c.fioForte,
      backgroundColor: c.papel,
    },
    primario: { backgroundColor: c.tinta, borderColor: c.tinta },
    fantasma: { backgroundColor: 'transparent', borderColor: 'transparent' },
    perigo: { borderColor: c.carmim },
    icone: { width: MEDIDA.alvo, paddingHorizontal: 0 },
    largo: { alignSelf: 'stretch' },
    apagado: { opacity: 0.45 },
  }));
  const corTexto = variante === 'primario' ? cores.papel : variante === 'perigo' ? cores.carmim : cores.tinta;
  const conteudo =
    typeof children === 'string' || typeof children === 'number' ? (
      <Text style={{ color: corTexto, fontSize: MEDIDA.corpo, fontWeight: '700' }} numberOfLines={1}>
        {children}
      </Text>
    ) : (
      children
    );
  return (
    <Toque
      {...resto}
      role="button"
      disabled={disabled}
      aria-disabled={disabled || undefined}
      aria-busy={carregando || undefined}
      onPress={carregando ? undefined : onPress}
      style={({ pressed }) => [
        s.botao,
        variante !== 'secundario' && s[variante],
        somenteIcone && s.icone,
        largo && s.largo,
        disabled && s.apagado,
        pressed && !disabled && { backgroundColor: variante === 'primario' ? cores.tinta2 : cores.papel2 },
        style,
      ]}
    >
      {carregando ? <ActivityIndicator color={corTexto} /> : icone ? <Icone icone={icone} cor={corTexto} /> : null}
      {conteudo}
    </Toque>
  );
}

export interface ChaveProps {
  marcado: boolean;
  aoMudar: (marcado: boolean) => void;
  children: ReactNode;
  desabilitado?: boolean;
  'aria-label'?: string;
}

/** Chave liga/desliga (`role="switch"`). O estado aparece pela posicao do cursor, nao so pela cor. */
export function Chave({ marcado, aoMudar, children, desabilitado, 'aria-label': rotulo }: ChaveProps) {
  const { cores } = useTema();
  return (
    <Pressable
      role="switch"
      aria-checked={marcado}
      aria-label={rotulo}
      disabled={desabilitado}
      onPress={() => aoMudar(!marcado)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, opacity: desabilitado ? 0.45 : 1 }}
    >
      <View
        aria-hidden
        style={{
          width: 40,
          height: 24,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: marcado ? cores.tinta : cores.fioForte,
          backgroundColor: marcado ? cores.tinta : cores.papel2,
          padding: 2,
          alignItems: marcado ? 'flex-end' : 'flex-start',
        }}
      >
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: marcado ? cores.papel : cores.fioForte }} />
      </View>
      {typeof children === 'string' ? <Texto tamanho="rotulo" forte>{children}</Texto> : children}
    </Pressable>
  );
}

/** Estilo de texto para numeros grandes (sinais vitais, Glasgow). */
export const estiloNumeral: TextStyle = { fontSize: MEDIDA.numeral, lineHeight: MEDIDA.numeral, fontWeight: '800', fontVariant: ['tabular-nums'] };
