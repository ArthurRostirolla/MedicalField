import { createHash } from 'node:crypto';

/** JSON com as chaves de todo objeto em ordem alfabetica: o mesmo corpo sempre vira o mesmo texto. */
export function jsonCanonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(',')}]`;
  if (valor !== null && typeof valor === 'object') {
    const objeto = valor as Record<string, unknown>;
    const pares = Object.keys(objeto)
      .filter((chave) => objeto[chave] !== undefined)
      .sort()
      .map((chave) => `${JSON.stringify(chave)}:${jsonCanonico(objeto[chave])}`);
    return `{${pares.join(',')}}`;
  }
  return JSON.stringify(valor) ?? 'null';
}

/** sha256 (hex) do corpo canonico; e o que a idempotencia compara (regra de escrita 1). */
export function hashDoCorpo(corpo: unknown): string {
  return createHash('sha256').update(jsonCanonico(corpo)).digest('hex');
}
