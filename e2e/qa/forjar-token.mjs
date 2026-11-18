// Gera variantes invalidas de um JWT valido, para conferir que os servicos as recusam.
// Uso: node forjar-token.mjs <variante> <token-valido>
// Variantes: assinatura | payload | outra-chave | none | expirado | hs256
import { generateKeyPairSync, sign, createHmac } from 'node:crypto';

const [variante, token] = process.argv.slice(2);
const [h, p, s] = token.split('.');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ler = (x) => JSON.parse(Buffer.from(x, 'base64url').toString());
const cabecalho = ler(h);
const claims = ler(p);
const agora = Math.floor(Date.now() / 1000);
const assinarComChavePropria = (hh, pp) => {
  const { privateKey } = generateKeyPairSync('ed25519');
  return `${hh}.${pp}.${sign(null, Buffer.from(`${hh}.${pp}`), privateKey).toString('base64url')}`;
};

const saidas = {
  // troca o primeiro caractere da assinatura
  assinatura: () => `${h}.${p}.${s[0] === 'A' ? 'B' : 'A'}${s.slice(1)}`,
  // eleva o papel para ADMIN mantendo a assinatura original
  payload: () => `${h}.${b64({ ...claims, papel: 'ADMIN' })}.${s}`,
  // mesmo kid e claims, assinado por outra chave Ed25519 (outro emissor)
  'outra-chave': () => assinarComChavePropria(h, b64({ ...claims, papel: 'ADMIN', exp: agora + 900 })),
  none: () => `${b64({ ...cabecalho, alg: 'none' })}.${b64({ ...claims, papel: 'ADMIN', exp: agora + 900 })}.`,
  // exp no passado, chave propria (recusado pela assinatura; a expiracao real e testada com token antigo)
  expirado: () => assinarComChavePropria(h, b64({ ...claims, iat: agora - 3600, exp: agora - 1800 })),
  // confusao de algoritmo: HS256 com o kid real
  hs256: () => {
    const hh = b64({ ...cabecalho, alg: 'HS256' });
    const pp = b64({ ...claims, papel: 'ADMIN', exp: agora + 900 });
    return `${hh}.${pp}.${createHmac('sha256', cabecalho.kid).update(`${hh}.${pp}`).digest('base64url')}`;
  },
};
process.stdout.write(saidas[variante]());
