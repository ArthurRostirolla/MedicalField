import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/estilos.css';
import { aplicarTema, temaPreferido, type Tema } from '../src';
import { ComposicaoApp, ComposicaoPortal } from './composicoes';
import { Vitrine } from './Vitrine';

// ?tema=claro|escuro fixa o tema; ?vista=portal|app abre só uma composição em tela cheia (capturas).
const parametros = new URLSearchParams(location.search);
const temaInicial = (parametros.get('tema') as Tema | null) ?? temaPreferido();
const vista = parametros.get('vista');

function Raiz() {
  const [tema, setTema] = useState<Tema>(temaInicial);
  useEffect(() => aplicarTema(tema), [tema]);
  if (vista === 'portal') return <ComposicaoPortal />;
  if (vista === 'app') return <ComposicaoApp offlineInicial={parametros.has('offline')} />;
  return <Vitrine tema={tema} aoMudarTema={setTema} />;
}

createRoot(document.getElementById('raiz') as HTMLElement).render(
  <StrictMode>
    <Raiz />
  </StrictMode>,
);
