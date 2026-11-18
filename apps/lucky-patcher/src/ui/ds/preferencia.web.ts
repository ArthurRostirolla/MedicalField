// Preferencia de tema no navegador (localStorage, como antes da migracao).
export type PreferenciaTema = 'claro' | 'escuro' | 'sistema';
const CHAVE = 'mf-tema';

export function lerPreferenciaGuardada(): PreferenciaTema {
  try {
    const guardado = localStorage.getItem(CHAVE);
    return guardado === 'claro' || guardado === 'escuro' ? guardado : 'sistema';
  } catch {
    return 'sistema';
  }
}

export function guardarPreferencia(preferencia: PreferenciaTema): void {
  try {
    if (preferencia === 'sistema') localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, preferencia);
  } catch {
    // sem armazenamento: vale so nesta sessao
  }
}
