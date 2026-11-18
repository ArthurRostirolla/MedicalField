import type { Pagina } from '@medicalfield/contratos';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

export interface ListaPorCursor<T> {
  consulta: UseQueryResult<Pagina<T>>;
  /** Número da página na tela (1 = primeira). */
  pagina: number;
  aoAnterior?: () => void;
  aoProxima?: () => void;
}

/**
 * Lista paginada por cursor opaco (docs/contratos.md §2). A API só sabe ir para a frente;
 * "anterior" volta pela pilha de cursores já visitados.
 *
 * @param chave chave da consulta, sem o cursor; quando muda (filtro novo), volta à página 1
 */
export function useListaPorCursor<T>(
  chave: readonly unknown[],
  buscar: (cursor: string | undefined) => Promise<Pagina<T>>,
): ListaPorCursor<T> {
  const assinatura = JSON.stringify(chave);
  const [estado, setEstado] = useState<{ assinatura: string; cursores: string[] }>({ assinatura, cursores: [] });
  // Filtro novo descarta a pilha: os cursores antigos pertencem a outra consulta.
  const cursores = estado.assinatura === assinatura ? estado.cursores : [];
  const definir = (novos: string[]) => setEstado({ assinatura, cursores: novos });

  const cursor = cursores.at(-1);
  const consulta = useQuery({
    queryKey: [...chave, cursor ?? null],
    queryFn: () => buscar(cursor),
    placeholderData: keepPreviousData,
  });
  const proximo = consulta.data?.proximoCursor;

  return {
    consulta,
    pagina: cursores.length + 1,
    aoAnterior: cursores.length > 0 ? () => definir(cursores.slice(0, -1)) : undefined,
    aoProxima: proximo && !consulta.isPlaceholderData ? () => definir([...cursores, proximo]) : undefined,
  };
}
