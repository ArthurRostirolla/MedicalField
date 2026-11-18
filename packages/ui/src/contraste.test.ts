import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { razaoContraste } from './contraste';

/** Lê os tokens `--mf-*: #hex` do bloco CSS que começa em `seletor`. A fonte é o CSS real. */
function tokensDe(arquivo: string, seletor: string): Record<string, string> {
  const css = readFileSync(join(import.meta.dirname, arquivo), 'utf8');
  const inicio = css.indexOf(seletor);
  if (inicio < 0) throw new Error(`Seletor não encontrado em ${arquivo}: ${seletor}`);
  const bloco = css.slice(css.indexOf('{', inicio) + 1, css.indexOf('}', inicio));
  return Object.fromEntries([...bloco.matchAll(/(--mf-[\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2]]));
}

const triagem = tokensDe('tokens.css', ':root {\n  --mf-tri-vermelho');
const temas = {
  claro: tokensDe('tokens.css', ":root,\n[data-tema='claro']"),
  escuro: tokensDe('tokens.css', "[data-tema='escuro'] {"),
  'invertido no claro': { ...tokensDe('tokens.css', ":root,\n[data-tema='claro']"), ...tokensDe('base.css', '.mf-invertido,') },
  'invertido no escuro': {
    ...tokensDe('tokens.css', "[data-tema='escuro'] {"),
    ...tokensDe('base.css', "[data-tema='escuro'] .mf-invertido"),
  },
};

// [texto, fundo, mínimo]. 7 = AAA (texto principal do app de campo), 4.5 = AA, 3 = contorno de controle.
const PARES: Array<[string, string, number]> = [
  ['--mf-tinta', '--mf-papel', 7],
  ['--mf-tinta', '--mf-papel-2', 7],
  ['--mf-tinta', '--mf-mesa', 7],
  ['--mf-tinta-2', '--mf-papel', 7],
  ['--mf-tinta-2', '--mf-papel-2', 4.5],
  ['--mf-tinta-2', '--mf-mesa', 4.5],
  ['--mf-tinta-3', '--mf-papel', 4.5],
  ['--mf-tinta-3', '--mf-papel-2', 4.5],
  ['--mf-sobre-marca', '--mf-marca', 4.5],
  ['--mf-sobre-marca', '--mf-marca-forte', 4.5],
  ['--mf-marca', '--mf-papel', 4.5],
  ['--mf-marca', '--mf-papel-2', 4.5],
  ['--mf-marca', '--mf-marca-suave', 4.5],
  ['--mf-tinta', '--mf-marca-suave', 7],
  ['--mf-carmim', '--mf-papel', 4.5],
  ['--mf-carmim', '--mf-carmim-suave', 4.5],
  ['--mf-tinta', '--mf-carmim-suave', 7],
  ['--mf-fio-forte', '--mf-papel', 3],
  ['--mf-foco', '--mf-papel', 3],
  ['--mf-foco', '--mf-mesa', 3],
];

// Só existem fora do bloco invertido.
const PARES_DE_TEMA: Array<[string, string, number]> = [
  ['--mf-sobre-inverso', '--mf-inverso', 7],
  ['--mf-tinta', '--mf-rosa', 7],
  ['--mf-tinta-2', '--mf-rosa', 7],
  ['--mf-rosa-tinta', '--mf-rosa', 4.5],
  ['--mf-rosa-fio', '--mf-rosa', 1.5],
];

describe('contraste dos tokens', () => {
  for (const [nome, tokens] of Object.entries(temas)) {
    // O bloco invertido redefine papel e tinta, não a mesa.
    const pares = nome.startsWith('invertido')
      ? PARES.filter(([, fundo]) => fundo !== '--mf-mesa')
      : [...PARES, ...PARES_DE_TEMA];
    it.each(pares)(`${nome}: %s sobre %s ≥ %s:1`, (texto, fundo, minimo) => {
      const [a, b] = [tokens[texto], tokens[fundo]];
      expect(a, `${texto} não definido`).toBeDefined();
      expect(b, `${fundo} não definido`).toBeDefined();
      expect(razaoContraste(a as string, b as string)).toBeGreaterThanOrEqual(minimo);
    });
  }

  it.each(['vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'preto'])('triagem %s: rótulo legível (AA)', (cor) => {
    const [fundo, texto] = [triagem[`--mf-tri-${cor}`], triagem[`--mf-tri-${cor}-texto`]];
    expect(razaoContraste(texto as string, fundo as string)).toBeGreaterThanOrEqual(4.5);
  });

  it('a marca e o carmim não se confundem com nenhuma cor de triagem', () => {
    // Guarda simples: nenhum token de interface repete um valor do protocolo.
    const protocolo = new Set(Object.values(triagem).map((v) => v.toLowerCase()));
    for (const tokens of [temas.claro, temas.escuro]) {
      for (const nome of ['--mf-marca', '--mf-carmim', '--mf-rosa', '--mf-rosa-tinta']) {
        expect(protocolo.has((tokens[nome] as string).toLowerCase())).toBe(false);
      }
    }
  });

  it('calcula a razão WCAG', () => {
    expect(razaoContraste('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(razaoContraste('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});
