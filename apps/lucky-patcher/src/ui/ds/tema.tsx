// Tema claro/escuro: preferencia do aparelho (ou do sistema) e estilos que reagem a ela.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { lerPreferenciaGuardada, guardarPreferencia, type PreferenciaTema } from './preferencia';
import { CORES, type Cores, type Tema } from './tokens.ts';

export type { PreferenciaTema };

interface ContextoTema {
  tema: Tema;
  cores: Cores;
  preferencia: PreferenciaTema;
  definirPreferencia: (preferencia: PreferenciaTema) => void;
}

const Contexto = createContext<ContextoTema | null>(null);

export function ProvedorTema({ children }: { children: ReactNode }) {
  const sistema = useColorScheme();
  const [preferencia, setPreferencia] = useState<PreferenciaTema>(lerPreferenciaGuardada);
  const tema: Tema = preferencia === 'sistema' ? (sistema === 'dark' ? 'escuro' : 'claro') : preferencia;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Barra do navegador acompanha o papel do tema.
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', CORES[tema].papel);
    document.documentElement.style.colorScheme = tema === 'escuro' ? 'dark' : 'light';
  }, [tema]);
  const valor = useMemo(
    () => ({
      tema,
      cores: CORES[tema],
      preferencia,
      definirPreferencia: (nova: PreferenciaTema) => {
        guardarPreferencia(nova);
        setPreferencia(nova);
      },
    }),
    [tema, preferencia],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTema(): ContextoTema {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('Fora do ProvedorTema');
  return contexto;
}

/** `const s = useEstilos((c) => ({ caixa: { backgroundColor: c.papel } }))`: refeito so quando o tema muda. */
type Estilos = Record<string, ViewStyle | TextStyle | ImageStyle>;

export function useEstilos<T extends Estilos>(criar: (cores: Cores) => T): T {
  const { cores } = useTema();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create(criar(cores)), [cores]);
}
