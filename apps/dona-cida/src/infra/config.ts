import { z } from 'zod';

const porta = (padrao: number) => z.coerce.number().int().min(0).max(65535).default(padrao);

/** Variaveis de ambiente (docs/contratos.md, secao 4). Faltou obrigatoria, o processo nao sobe. */
const esquema = z.object({
  PORTA: porta(8080),
  PORTA_GESTAO: porta(9090),
  DATABASE_URL: z.string().min(1, 'obrigatória'),
  JWKS_URL: z.url('deve ser uma URL'),
  PROXIES_CONFIAVEIS: z.string().default('127.0.0.1/32,::1/128,10.42.0.0/16'),
  AMBIENTE: z.enum(['desenvolvimento', 'producao']).default('desenvolvimento'),
  NIVEL_LOG: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = {
  porta: number;
  portaGestao: number;
  databaseUrl: string;
  jwksUrl: string;
  proxiesConfiaveis: string[];
  ambiente: 'desenvolvimento' | 'producao';
  nivelLog: 'debug' | 'info' | 'warn' | 'error';
};

export const CONFIG = Symbol('Config');

/** @throws Error com a lista das variaveis invalidas (sem os valores, que podem ser segredo) */
export function carregarConfig(ambiente: NodeJS.ProcessEnv): Config {
  const lido = esquema.safeParse(ambiente);
  if (!lido.success) {
    const problemas = lido.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Configuração inválida - ${problemas.join('; ')}`);
  }
  const env = lido.data;
  return {
    porta: env.PORTA,
    portaGestao: env.PORTA_GESTAO,
    databaseUrl: env.DATABASE_URL,
    jwksUrl: env.JWKS_URL,
    proxiesConfiaveis: env.PROXIES_CONFIAVEIS.split(',').map((cidr) => cidr.trim()).filter(Boolean),
    ambiente: env.AMBIENTE,
    nivelLog: env.NIVEL_LOG,
  };
}
