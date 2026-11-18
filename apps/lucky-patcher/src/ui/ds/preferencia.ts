// Preferencia de tema no aparelho: fora do banco clinico (vale antes de o banco abrir).
import * as SecureStore from 'expo-secure-store';

export type PreferenciaTema = 'claro' | 'escuro' | 'sistema';
const CHAVE = 'mf-tema';

export function lerPreferenciaGuardada(): PreferenciaTema {
  const guardado = SecureStore.getItem(CHAVE);
  return guardado === 'claro' || guardado === 'escuro' ? guardado : 'sistema';
}

export function guardarPreferencia(preferencia: PreferenciaTema): void {
  if (preferencia === 'sistema') void SecureStore.deleteItemAsync(CHAVE);
  else SecureStore.setItem(CHAVE, preferencia);
}
