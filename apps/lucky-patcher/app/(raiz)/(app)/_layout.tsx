// Sem sessao local, so a tela de entrada. Com sessao (mesmo expirada), o app abre e grava.
// Abas fixas: a barra fica montada e so o conteudo troca (com um fade curto). Em tela larga a barra vira trilho lateral.
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useWindowDimensions } from 'react-native';
import { BarraAbas } from '../../../src/ui/Casca.tsx';
import { useSessao } from '../../../src/ui/contexto.tsx';
import { SECO, useTema } from '../../../src/ui/ds/index.ts';

/** A partir daqui (tablet deitado, desktop) a navegacao vai para a lateral, como no portal web. */
const LARGURA_TRILHO = 900;

export default function ExigeSessao() {
  const sessao = useSessao();
  const { cores } = useTema();
  const lateral = useWindowDimensions().width >= LARGURA_TRILHO;
  if (!sessao) return <Redirect href="/entrar" />;
  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <BarraAbas {...props} lateral={lateral} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: lateral ? 'left' : 'bottom',
        sceneStyle: { backgroundColor: cores.mesa },
        animation: 'fade',
        transitionSpec: { animation: 'timing', config: { duration: 150, easing: SECO } },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="pacientes" />
      <Tabs.Screen name="pendencias" />
      <Tabs.Screen name="ajustes" />
      {/* Atendimento abre de Inicio e do prontuario; sem botao na barra (BarraAbas so desenha as 4), que marca Inicio.
          Sem `href: null`: no expo-router atual isso marca a rota como oculta e ela redireciona para fora. */}
      <Tabs.Screen name="atendimentos" />
    </Tabs>
  );
}
