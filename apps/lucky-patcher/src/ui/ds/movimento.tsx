// Movimento do app: curvas, entrada curta e toque que afunda. Seco como o web (--ease-seco, 120 ms).
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

export const NATIVO = Platform.OS !== 'web';
export const SAIDA = Easing.bezier(0.23, 1, 0.32, 1); // entradas e respostas ao toque
export const MOVIMENTO = Easing.bezier(0.77, 0, 0.175, 1); // algo que ja esta na tela muda de lugar
export const SECO = Easing.bezier(0.2, 0, 0, 1); // o --ease-seco do web

export const movimentoReduzido = () => AccessibilityInfo.isReduceMotionEnabled().catch(() => false);

/** Entrada curta (220 ms, sobe 8 px), com atraso opcional para escalonar; nada com movimento reduzido. */
export function Entra({ atraso = 0, children, style }: { atraso?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [progresso] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let vivo = true;
    let animacao: Animated.CompositeAnimation | null = null;
    void movimentoReduzido().then((reduzido) => {
      if (!vivo) return;
      if (reduzido) return progresso.setValue(1);
      animacao = Animated.timing(progresso, { toValue: 1, duration: 220, delay: atraso, easing: SAIDA, useNativeDriver: NATIVO });
      animacao.start();
    });
    return () => {
      vivo = false;
      animacao?.stop();
    };
  }, [progresso, atraso]);
  const translateY = progresso.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  return <Animated.View style={[{ opacity: progresso, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}

const PressionavelAnimado = Animated.createAnimatedComponent(Pressable);

export interface ToqueProps extends Omit<PressableProps, 'style'> {
  /** Quanto afunda ao apertar (0.95 a 0.98). */
  escala?: number;
  style?: StyleProp<ViewStyle> | ((estado: { pressed: boolean }) => StyleProp<ViewStyle>);
}

/** Pressable que afunda um pouco ao apertar e volta rapido: o toque foi ouvido. */
export function Toque({ escala = 0.97, style, onPressIn, onPressOut, ...resto }: ToqueProps) {
  const [pressed, setPressed] = useState(false);
  const [valor] = useState(() => new Animated.Value(1));
  const ir = (para: number, duracao: number) => Animated.timing(valor, { toValue: para, duration: duracao, easing: SAIDA, useNativeDriver: NATIVO }).start();
  return (
    <PressionavelAnimado
      {...resto}
      onPressIn={(e) => {
        setPressed(true);
        ir(escala, 100);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        ir(1, 200);
        onPressOut?.(e);
      }}
      style={[typeof style === 'function' ? style({ pressed }) : style, { transform: [{ scale: valor }] }]}
    />
  );
}
