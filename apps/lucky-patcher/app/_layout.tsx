// Raiz: tema e navegador sempre montados. A abertura do banco fica em (raiz)/_layout.tsx.
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ProvedorTema, useTema } from '../src/ui/ds/index.ts';

function Navegador() {
  const { tema, cores } = useTema();
  return (
    <>
      <StatusBar style={tema === 'escuro' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: cores.mesa } }} />
    </>
  );
}

export default function Layout() {
  return (
    <ProvedorTema>
      <Navegador />
    </ProvedorTema>
  );
}
