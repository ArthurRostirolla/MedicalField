// Apoio dos testes: SQLite de verdade em memoria (o mesmo motor WASM do navegador) e um servidor HTTP falso.
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { criarApp } from '../app.ts';
import type { ExecutorSql } from '../banco/executor.ts';
import { criarExecutorOo1, type BancoOo1 } from '../banco/executorOo1.ts';
import { FORMULARIO_PESSOA_VAZIO, type FormularioPessoa } from '../dados/pessoas.ts';

let sqlite3: Awaited<ReturnType<typeof sqlite3InitModule>> | null = null;

export async function executorEmMemoria(): Promise<ExecutorSql> {
  sqlite3 ??= await sqlite3InitModule();
  const banco = new sqlite3.oo1.DB(':memory:');
  banco.exec('PRAGMA foreign_keys=ON');
  return criarExecutorOo1(banco as unknown as BancoOo1);
}

export interface RequisicaoVista {
  metodo: string;
  rota: string;
  corpo: unknown;
  cabecalhos: Record<string, string>;
}

type Resultado = { status: number; corpo?: unknown } | 'rede' | 'pendurar';

export const PROFISSIONAL = {
  id: '11111111-1111-4111-8111-111111111111',
  nome: 'Enf. Caio Brandão',
  tipoRegistro: 'COREN',
  registro: '200002',
  uf: 'RS',
  papel: 'PROFISSIONAL' as const,
};

/** Servidor falso com idempotencia por chave, como o de verdade. `interceptar` sobrepoe a resposta. */
export class ServidorFalso {
  vistas: RequisicaoVista[] = [];
  /** Corpos aceitos por rota de escrita (so a primeira vez de cada Idempotency-Key). */
  gravados: Array<{ rota: string; corpo: unknown }> = [];
  private porChave = new Map<string, unknown>();
  paginas: Array<Record<string, unknown>> = [];
  logs: Array<{ id: string }> = [];
  tokenValido = 'token-1';
  refreshValido: string | null = 'refresh-1';
  private emissao = 1;
  interceptar: ((requisicao: RequisicaoVista) => Resultado | undefined) | null = null;
  /** Quantas escritas (POST/PATCH) estavam em andamento ao mesmo tempo, no pico. */
  picoSimultaneas = 0;
  private emAndamento = 0;
  atrasoMs = 0;

  escritas(): RequisicaoVista[] {
    return this.vistas.filter((r) => r.metodo !== 'GET' && !r.rota.startsWith('/api/v1/auth') && r.rota !== '/api/v1/log');
  }

  private sessao() {
    this.emissao++;
    this.tokenValido = `token-${this.emissao}`;
    this.refreshValido = `refresh-${this.emissao}`;
    return { accessToken: this.tokenValido, expiraEm: 900, refreshToken: this.refreshValido, profissional: PROFISSIONAL };
  }

  private responder(requisicao: RequisicaoVista): Resultado {
    const { metodo, rota, corpo, cabecalhos } = requisicao;
    if (rota === '/api/v1/auth/login') return { status: 200, corpo: this.sessao() };
    if (rota === '/api/v1/auth/refresh') {
      const enviado = (corpo as { refreshToken?: string }).refreshToken;
      return this.refreshValido !== null && enviado === this.refreshValido
        ? { status: 200, corpo: this.sessao() }
        : { status: 401, corpo: { codigo: 'NAO_AUTENTICADO', mensagem: 'Sessão expirada', requestId: 'r' } };
    }
    if (cabecalhos.authorization !== `Bearer ${this.tokenValido}`) {
      return { status: 401, corpo: { codigo: 'NAO_AUTENTICADO', mensagem: 'Token inválido', requestId: 'r' } };
    }
    if (rota === '/api/v1/auth/me') return { status: 200, corpo: PROFISSIONAL };
    if (rota === '/api/v1/auth/logout') return { status: 204 };
    if (rota === '/api/v1/log') {
      const novos = (corpo as { logs: Array<{ id: string }> }).logs.filter((log) => !this.logs.some((l) => l.id === log.id));
      this.logs.push(...novos);
      return { status: 200, corpo: { aceitos: novos.length, duplicados: 0 } };
    }
    if (rota.startsWith('/api/v1/sync/alteracoes')) {
      const desde = Number(new URL(rota, 'http://x').searchParams.get('desde'));
      const pagina = this.paginas[desde];
      return {
        status: 200,
        corpo: {
          medicamentos: [],
          pessoas: [],
          prontuarios: [],
          prontuarioItens: [],
          ...pagina,
          proximoCursor: String(pagina ? desde + 1 : desde),
          temMais: desde + 1 < this.paginas.length,
        },
      };
    }
    if (metodo === 'POST' || metodo === 'PATCH') {
      const chave = cabecalhos['idempotency-key'];
      if (chave && this.porChave.has(chave)) return { status: 200, corpo: this.porChave.get(chave) };
      this.gravados.push({ rota, corpo });
      if (chave) this.porChave.set(chave, corpo);
      return { status: 201, corpo };
    }
    return { status: 404, corpo: { codigo: 'NAO_ENCONTRADO', mensagem: 'Rota desconhecida', requestId: 'r' } };
  }

  fetch: typeof fetch = async (entrada, opcoes) => {
    const requisicao: RequisicaoVista = {
      metodo: opcoes?.method ?? 'GET',
      rota: String(entrada),
      corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined,
      cabecalhos: Object.fromEntries(Object.entries((opcoes?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])),
    };
    this.vistas.push(requisicao);
    const escrita = requisicao.metodo !== 'GET';
    if (escrita) this.emAndamento++;
    this.picoSimultaneas = Math.max(this.picoSimultaneas, this.emAndamento);
    try {
      if (this.atrasoMs) await new Promise((r) => setTimeout(r, this.atrasoMs));
      const resultado = this.interceptar?.(requisicao) ?? this.responder(requisicao);
      if (resultado === 'rede') throw new TypeError('Failed to fetch');
      if (resultado === 'pendurar') {
        // So termina quando o cliente desiste (timeout).
        await new Promise((_, rejeitar) =>
          opcoes?.signal?.addEventListener('abort', () => rejeitar(new DOMException('Aborted', 'AbortError'))),
        );
      }
      const { status, corpo } = resultado as { status: number; corpo?: unknown };
      return new Response(corpo === undefined ? null : JSON.stringify(corpo), { status });
    } finally {
      if (escrita) this.emAndamento--;
    }
  };

  /** Processa a requisicao no servidor (grava) mas derruba a resposta: "resposta perdida". */
  perderResposta(filtro: (requisicao: RequisicaoVista) => boolean): void {
    let usado = false;
    this.interceptar = (requisicao) => {
      if (usado || !filtro(requisicao)) return undefined;
      usado = true;
      this.responder(requisicao);
      return 'rede';
    };
  }
}

/** Temporizadores sob controle do teste. */
export class AgendaManual {
  tarefas: Array<{ funcao: () => void; ms: number }> = [];
  agendar = (funcao: () => void, ms: number) => {
    const tarefa = { funcao, ms };
    this.tarefas.push(tarefa);
    return () => {
      this.tarefas = this.tarefas.filter((t) => t !== tarefa);
    };
  };
}

export class Relogio {
  constructor(public ms = Date.parse('2026-11-17T21:00:00.000Z')) {}
  agora = () => new Date(this.ms);
  avancar(ms: number) {
    this.ms += ms;
  }
}

/** App completo sobre SQLite em memoria e servidor falso; ja logado e, por padrao, simulando offline. */
export async function montar(opcoes: { executor?: ExecutorSql; servidor?: ServidorFalso; logar?: boolean; offline?: boolean } = {}) {
  const executor = opcoes.executor ?? (await executorEmMemoria());
  const servidor = opcoes.servidor ?? new ServidorFalso();
  const agenda = new AgendaManual();
  const relogio = new Relogio();
  const app = await criarApp({
    executor,
    fetch: servidor.fetch,
    exigeEnderecoServidor: false,
    agora: relogio.agora,
    aleatorio: () => 1, // sem jitter: o recuo e o valor cheio
    agendar: agenda.agendar,
  });
  await app.motor.iniciar();
  if (opcoes.logar ?? true) {
    if (!app.sessao.atual) await app.sessao.entrar({ tipoRegistro: 'COREN', registro: '200002', uf: 'RS', senha: 'x' });
  }
  if (opcoes.offline ?? true) await app.monitor.definirSimulacao(true);
  else {
    await app.monitor.verificar();
    await app.motor.ocioso();
  }
  /** Volta a online (o Observer dispara o motor) e espera a sincronizacao terminar. */
  const ficarOnline = async () => {
    await app.monitor.definirSimulacao(false);
    await app.motor.ocioso();
  };
  return { app, servidor, agenda, relogio, executor, ficarOnline };
}

export const pessoa = (nome: string, extra: Partial<FormularioPessoa> = {}): FormularioPessoa => ({
  ...FORMULARIO_PESSOA_VAZIO,
  nome,
  ...extra,
});

export async function statusDoOutbox(executor: ExecutorSql): Promise<Array<{ rota: string; status: string; tentativas: number; recuo: number }>> {
  return executor.consultar('SELECT rota, status, tentativas, recuo FROM outbox ORDER BY ordem');
}
