import { BlockList, isIP } from 'node:net';

/** `::ffff:10.0.0.1` (IPv4 mapeado em IPv6) vira `10.0.0.1`. */
const normalizar = (ip: string): string => ip.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');

const familia = (ip: string): 'ipv4' | 'ipv6' => (isIP(ip) === 6 ? 'ipv6' : 'ipv4');

/** Monta a lista de proxies confiaveis a partir dos CIDRs de `PROXIES_CONFIAVEIS`. */
export function criarListaDeProxies(cidrs: readonly string[]): BlockList {
  const lista = new BlockList();
  for (const cidr of cidrs) {
    const [endereco = '', prefixo] = cidr.split('/');
    if (isIP(endereco) === 0) throw new Error(`PROXIES_CONFIAVEIS: "${cidr}" não é um CIDR válido`);
    lista.addSubnet(endereco, prefixo === undefined ? (isIP(endereco) === 6 ? 128 : 32) : Number(prefixo), familia(endereco));
  }
  return lista;
}

/**
 * Regra do contrato (secao 4): se o par direto da conexao e um proxy confiavel, vale o IP mais a direita
 * de `X-Forwarded-For` que NAO seja proxy confiavel; senao vale o par direto e o cabecalho e ignorado
 * (qualquer cliente pode forja-lo).
 */
export function resolverIpCliente(
  parDireto: string | undefined,
  xForwardedFor: string | undefined,
  proxies: BlockList,
): string {
  const par = normalizar(parDireto ?? '');
  const confiavel = (ip: string): boolean => isIP(ip) !== 0 && proxies.check(ip, familia(ip));
  if (!confiavel(par) || !xForwardedFor) return par || 'desconhecido';

  const cadeia = xForwardedFor.split(',').map(normalizar).filter((ip) => isIP(ip) !== 0);
  return cadeia.findLast((ip) => !confiavel(ip)) ?? par;
}
