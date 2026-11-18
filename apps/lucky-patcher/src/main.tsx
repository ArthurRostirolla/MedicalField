import './estilos.css';
import { Botao, EstadoErro } from '@medicalfield/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { criarApp } from './app.ts';
import { abrirExecutor, ehNativo, OutraAbaAberta } from './plataforma.ts';
import { Rotas } from './Rotas.tsx';
import { CascaSimples } from './ui/Casca.tsx';
import { ProvedorApp } from './ui/contexto.tsx';
import { aplicarPreferenciaTema } from './ui/tema.ts';

aplicarPreferenciaTema();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => aplicarPreferenciaTema());

const raiz = createRoot(document.getElementById('raiz') as HTMLElement);

function Bloqueio({ erro }: { erro: unknown }) {
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
      <Botao variante="primario" largo onClick={() => window.location.reload()}>
        Tentar de novo
      </Botao>
    </CascaSimples>
  );
}

async function iniciar() {
  try {
    const executor = await abrirExecutor();
    const app = await criarApp({
      executor,
      fetch: (entrada, opcoes) => window.fetch(entrada, opcoes),
      exigeEnderecoServidor: ehNativo(),
      redeDoAparelho: () => navigator.onLine,
    });
    // Porta de diagnostico dos testes automatizados: so entra no pacote quando o build e feito com
    // VITE_DIAGNOSTICO=1 (ver README). No build de producao normal este bloco nem existe.
    if (import.meta.env.VITE_DIAGNOSTICO === '1') {
      const { criarPortaDiagnostico } = await import('./diagnostico.ts');
      (window as unknown as { __mf: unknown }).__mf = criarPortaDiagnostico(executor);
    }
    await app.iniciar();

    // Gatilhos de sincronizacao que dependem do ambiente: voltar ao primeiro plano e rede do aparelho.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      void app.monitor.verificar().then(() => app.motor.sincronizar('primeiro-plano'));
    });
    window.addEventListener('online', () => void app.monitor.verificar());
    window.addEventListener('offline', () => app.monitor.informarSemRede());

    raiz.render(
      <StrictMode>
        <ProvedorApp app={app}>
          <Rotas />
        </ProvedorApp>
      </StrictMode>,
    );
  } catch (erro) {
    raiz.render(<Bloqueio erro={erro} />);
  }
}

void iniciar();

// A casca do app abre sem rede: o service worker guarda os arquivos (so na versao web).
if (!ehNativo() && import.meta.env.PROD) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}
