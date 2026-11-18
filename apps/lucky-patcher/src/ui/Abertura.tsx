// Abertura do login: o simbolo aparece no centro, o nome sai de tras dele e a marca sobe para o lugar no topo.
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { MarcaNome, MarcaSimbolo, MOVIMENTO, movimentoReduzido, NATIVO, SAIDA } from './ds/index.ts';

export { Entra } from './ds/index.ts';
const ESCALA = 2; // a marca no centro tem o dobro do tamanho da marca do topo
const VAO = 8; // o gap da Marca

export interface AberturaProps {
  /** Onde a Marca de verdade esta, relativo ao mesmo pai da abertura. */
  medirAlvo: () => Promise<{ x: number; y: number } | null>;
  aoTerminar: () => void;
}

/** Sobreposta a tela (mesmo pai da Marca escondida). Um toque pula. Com movimento reduzido, nao aparece. */
export function Abertura({ medirAlvo, aoTerminar }: AberturaProps) {
  const [v] = useState(() => ({ entra: new Animated.Value(0), nome: new Animated.Value(0), sobe: new Animated.Value(0) }));
  const [origem, setOrigem] = useState<{ x: number; y: number } | null>(null);
  const [nomeLargura, setNomeLargura] = useState<number | null>(null);
  const [destino, setDestino] = useState({ x: 0, y: 0 });
  const terminou = useRef(false);
  const terminar = useRef(aoTerminar);
  terminar.current = aoTerminar;

  function fim() {
    if (terminou.current) return;
    terminou.current = true;
    terminar.current();
  }

  useEffect(() => {
    if (!origem || nomeLargura === null) return;
    let sequencia: Animated.CompositeAnimation | null = null;
    let vivo = true;
    void movimentoReduzido().then(async (reduzido) => {
      if (!vivo) return;
      if (reduzido) return fim();
      const aparece = Animated.sequence([
        Animated.timing(v.entra, { toValue: 1, duration: 280, easing: SAIDA, useNativeDriver: NATIVO }),
        Animated.delay(100),
        Animated.timing(v.nome, { toValue: 1, duration: 380, easing: SAIDA, useNativeDriver: NATIVO }),
        Animated.delay(320),
      ]);
      sequencia = aparece;
      aparece.start(async ({ finished }) => {
        if (!finished || !vivo) return;
        // Mede so agora: a tela ja assentou (fontes, area segura).
        const alvo = await medirAlvo();
        if (!vivo) return;
        if (!alvo) return fim();
        setDestino({ x: alvo.x - origem.x, y: alvo.y - origem.y });
        sequencia = Animated.timing(v.sobe, { toValue: 1, duration: 480, easing: MOVIMENTO, useNativeDriver: NATIVO });
        sequencia.start(({ finished: acabou }) => acabou && fim());
      });
    });
    return () => {
      vivo = false;
      sequencia?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origem, nomeLargura]);

  // Antes do nome sair, o simbolo fica no centro exato da linha (simbolo + vao + nome).
  const recuo = ((nomeLargura ?? 0) + VAO) / 2;
  const simbolo = {
    opacity: v.entra,
    transform: [{ translateX: v.nome.interpolate({ inputRange: [0, 1], outputRange: [recuo, 0] }) }, { scale: v.entra.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
  };
  // O nome parte de tras do simbolo e desliza para a direita.
  const nome = {
    opacity: v.nome.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0, 1] }),
    transform: [{ translateX: v.nome.interpolate({ inputRange: [0, 1], outputRange: [recuo - 24 - VAO, 0] }) }],
  };
  const linha = {
    opacity: nomeLargura === null ? 0 : 1,
    transform: [
      { translateX: v.sobe.interpolate({ inputRange: [0, 1], outputRange: [0, destino.x] }) },
      { translateY: v.sobe.interpolate({ inputRange: [0, 1], outputRange: [0, destino.y] }) },
      { scale: v.sobe.interpolate({ inputRange: [0, 1], outputRange: [ESCALA, 1] }) },
    ],
  };

  return (
    <Pressable aria-label="Pular abertura" onPress={fim} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View
        aria-hidden
        onLayout={(e) => setOrigem({ x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y })}
        style={[{ flexDirection: 'row', alignItems: 'center', gap: VAO }, linha]}
      >
        <Animated.View style={[{ zIndex: 1 }, simbolo]}>
          <MarcaSimbolo />
        </Animated.View>
        <Animated.View onLayout={(e) => setNomeLargura(e.nativeEvent.layout.width)} style={nome}>
          <MarcaNome />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/** Posicao de `alvo` relativa a `raiz`, em pixels de tela. */
type Caixa = ComponentRef<typeof View>;
export function medirDentro(raiz: Caixa | null, alvo: Caixa | null): Promise<{ x: number; y: number } | null> {
  return new Promise((resolver) => {
    if (!raiz || !alvo) return resolver(null);
    raiz.measureInWindow((rx, ry) => alvo.measureInWindow((ax, ay) => resolver({ x: ax - rx, y: ay - ry })));
  });
}
