// Abre o banco local e compoe o nucleo (criarApp) antes das telas. Fica num grupo, e nao na raiz,
// para o navegador ja estar montado e o expo-router respeitar a URL de entrada (link direto).
import { randomUUID } from 'expo-crypto';
import { Stack, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
import { criarApp, type App } from '../../src/app.ts';
import { abrirExecutor, assinarRede, ehNativo, OutraAbaAberta, redeDoAparelho } from '../../src/plataforma';
import { CascaSimples } from '../../src/ui/Casca.tsx';
import { ProvedorApp } from '../../src/ui/contexto.tsx';
import { Botao, EstadoErro, useTema } from '../../src/ui/ds/index.ts';

// A casca do app abre sem rede: o service worker guarda os arquivos (so no build web).
if (Platform.OS === 'web' && !__DEV__ && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(`${process.env.EXPO_BASE_URL ?? ''}/sw.js`).catch(() => undefined);
}

type Estado ={ tipo: 'abrindo' } | { tipo: 'pronto'; app: App } | { tipo: 'erro'; erro: unknown };

let abertura: Promise<App> | null = null;

/** Uma unica abertura por processo (o StrictMode e o recarregamento rapido montam a raiz duas vezes). */
function abrirApp(): Promise<App> {
  abertura ??= (async () => {
    const executor = await abrirExecutor();
    const app = await criarApp({
      executor,
      fetch: (entrada, opcoes) => fetch(entrada, opcoes),
      exigeEnderecoServidor: ehNativo(),
      redeDoAparelho,
      novoId: randomUUID,
    });
    // Porta de diagnostico dos testes automatizados: so no build web com EXPO_PUBLIC_DIAGNOSTICO=1.
    if (Platform.OS === 'web' && process.env.EXPO_PUBLIC_DIAGNOSTICO === '1') {
      const { criarPortaDiagnostico } = await import('../../src/diagnostico.ts');
      (window as unknown as { __mf: unknown }).__mf = criarPortaDiagnostico(executor);
    }
    await app.iniciar();

    // Gatilhos de sincronizacao que dependem do ambiente: voltar ao primeiro plano e rede do aparelho.
    AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void app.monitor.verificar().then(() => app.motor.sincronizar('primeiro-plano'));
    });
    assinarRede(
      () => void app.monitor.verificar(),
      () => app.monitor.informarSemRede(),
    );
    return app;
  })();
  abertura.catch(() => {
    abertura = null; // "Tentar de novo" abre do zero
  });
  return abertura;
}

function Bloqueio({ erro, aoTentar }: { erro: unknown; aoTentar: () => void }) {
  const outraAba = erro instanceof OutraAbaAberta;
  return (
    <CascaSimples>
      <EstadoErro
        titulo={outraAba ? 'O app já está aberto em outra aba' : 'Não foi possível abrir o banco local'}
        descricao={
          outraAba
            ? 'O banco local só pode ser usado por uma aba de cada vez. Feche a outra aba (ou use aquela) e tente de novo aqui.'
            : `Sem o banco local o app não grava nada, então ele não abre. ${erro instanceof Error ? erro.message : String(erro)}`
        }
      />
      <Botao variante="primario" largo onPress={aoTentar}>
        Tentar de novo
      </Botao>
    </CascaSimples>
  );
}

/** Endereco pedido na web (link direto ou recarga), sem o prefixo /app. */
function enderecoDeEntrada(): string | null {
  if (Platform.OS !== 'web') return null;
  const base = process.env.EXPO_BASE_URL ?? '';
  const caminho = window.location.pathname.slice(window.location.pathname.startsWith(base) ? base.length : 0) || '/';
  return caminho === '/' ? null : caminho + window.location.search;
}

export default function AbrirApp() {
  const { cores } = useTema();
  const roteador = useRouter();
  // As telas so montam depois do banco aberto; ate la o expo-router nao tem onde pendurar a URL
  // de entrada e cai no Inicio. Guarda o endereco e volta para ele quando o app abrir.
  const entrada = useRef(enderecoDeEntrada());
  const [estado, setEstado] = useState<Estado>({ tipo: 'abrindo' });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    abrirApp().then(
      (app) => vivo && setEstado({ tipo: 'pronto', app }),
      (erro: unknown) => vivo && setEstado({ tipo: 'erro', erro }),
    );
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  useEffect(() => {
    if (estado.tipo !== 'pronto' || !entrada.current) return;
    const destino = entrada.current;
    entrada.current = null;
    roteador.replace(destino as Href);
  }, [estado.tipo, roteador]);

  return estado.tipo === 'pronto' ? (
    <ProvedorApp app={estado.app}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: cores.mesa } }} />
    </ProvedorApp>
  ) : estado.tipo === 'erro' ? (
    <Bloqueio
      erro={estado.erro}
      aoTentar={() => {
        setEstado({ tipo: 'abrindo' });
        setTentativa((n) => n + 1);
      }}
    />
  ) : (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.mesa }}>
      <ActivityIndicator color={cores.marca} size="large" aria-label="Abrindo o banco local" />
    </View>
  );
}
