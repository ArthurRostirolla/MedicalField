import { aplicarTema } from '@medicalfield/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { lerTema } from './casca/tema';
import './estilos.css';

aplicarTema(lerTema());

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz ausente no index.html');
createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
