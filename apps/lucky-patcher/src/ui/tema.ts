// Preferencia de tema: por aparelho, fora do banco clinico (precisa valer antes de o banco abrir).
import { aplicarTema, temaPreferido, type Tema } from '@medicalfield/ui';

export type PreferenciaTema = Tema | 'sistema';
const CHAVE = 'mf-tema';

export function lerPreferenciaTema(): PreferenciaTema {
  const guardado = localStorage.getItem(CHAVE);
  return guardado === 'claro' || guardado === 'escuro' ? guardado : 'sistema';
}

export function aplicarPreferenciaTema(preferencia: PreferenciaTema = lerPreferenciaTema()): void {
  const tema = preferencia === 'sistema' ? temaPreferido() : preferencia;
  aplicarTema(tema);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'escuro' ? '#18121f' : '#fbfafc');
}

export function definirPreferenciaTema(preferencia: PreferenciaTema): void {
  if (preferencia === 'sistema') localStorage.removeItem(CHAVE);
  else localStorage.setItem(CHAVE, preferencia);
  aplicarPreferenciaTema(preferencia);
}
