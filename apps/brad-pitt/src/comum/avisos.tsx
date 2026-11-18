import { PilhaToasts, useToasts, type ToastProps } from '@medicalfield/ui';
import { createContext, useContext, type ReactNode } from 'react';

const Avisos = createContext<(toast: ToastProps) => void>(() => undefined);

/** Uma pilha de avisos para o portal inteiro. */
export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const { toasts, avisar, dispensar } = useToasts();
  return (
    <Avisos.Provider value={avisar}>
      {children}
      <PilhaToasts toasts={toasts} aoDispensar={dispensar} />
    </Avisos.Provider>
  );
}

export const useAvisar = (): ((toast: ToastProps) => void) => useContext(Avisos);

/** Entrega um arquivo já baixado (com `Authorization`) como download do navegador. */
export function salvarArquivo(arquivo: Blob, nome: string): void {
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
