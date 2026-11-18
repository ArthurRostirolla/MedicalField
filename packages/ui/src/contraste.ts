/** Luminância relativa WCAG 2.x de uma cor `#rrggbb`. */
function luminancia(hex: string): number {
  const limpo = hex.trim().replace('#', '');
  const canais = [0, 2, 4].map((inicio) => {
    const canal = parseInt(limpo.slice(inicio, inicio + 2), 16) / 255;
    return canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

/** Razão de contraste WCAG entre duas cores `#rrggbb` (1 a 21). */
export function razaoContraste(a: string, b: string): number {
  const [clara, escura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (clara + 0.05) / (escura + 0.05);
}
