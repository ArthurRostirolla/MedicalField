// Sem sessao local, so a tela de entrada. Com sessao (mesmo expirada), o app abre e grava.
import { Redirect, Stack } from 'expo-router';
import { useSessao } from '../../../src/ui/contexto.tsx';

export default function ExigeSessao() {
  if (!useSessao()) return <Redirect href="/entrar" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
