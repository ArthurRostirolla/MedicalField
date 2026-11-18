import { CampoMaisRecente } from './campo-mais-recente.ts';
import { RevisaoManual } from './revisao-manual.ts';
import { ServidorVence } from './servidor-vence.ts';
import { UniaoImutavel } from './uniao-imutavel.ts';

const uniao = new UniaoImutavel();

/** Tabela do plano arquitetural (H.5): qual estrategia cuida de cada tipo de dado. */
const ESTRATEGIAS = {
  evento: uniao,
  prontuarioItem: uniao,
  pessoa: new CampoMaisRecente(),
  medicamento: new ServidorVence(),
  pessoaDuplicada: new RevisaoManual(),
} as const;

export type TipoDeDado = keyof typeof ESTRATEGIAS;

/** Registro que escolhe a estrategia de conflito pelo tipo de dado. */
export class RegistroEstrategias {
  para<T extends TipoDeDado>(tipo: T): (typeof ESTRATEGIAS)[T] {
    return ESTRATEGIAS[tipo];
  }
}
