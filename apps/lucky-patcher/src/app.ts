// Raiz de composicao: liga banco, cliente HTTP unico, monitor (Observer), sessao, motor e repositorios.
import type { Profissional } from '@medicalfield/contratos';
import { Banco, migrar } from './banco/banco.ts';
import type { ExecutorSql } from './banco/executor.ts';
import { RepositorioAtendimentos } from './dados/atendimentos.ts';
import type { ContextoDados } from './dados/contexto.ts';
import { sqlLog } from './dados/outbox.ts';
import { RepositorioPendencias } from './dados/pendencias.ts';
import { RepositorioMedicamentos, RepositorioPessoas, RepositorioProntuarios } from './dados/pessoas.ts';
import { MonitorConectividade } from './sync/conectividade.ts';
import { ClienteHttp, servidorRespondeu } from './sync/http.ts';
import { MotorSincronizacao } from './sync/motor.ts';
import { GerenciadorSessao, SessaoExpirada } from './sync/sessao.ts';

export interface OpcoesApp {
  executor: ExecutorSql;
  fetch: typeof fetch;
  /** No navegador o padrao e o mesmo host (caminhos relativos); no aparelho (Android/iOS) e obrigatorio informar. */
  exigeEnderecoServidor: boolean;
  /** `navigator.onLine` no navegador. */
  redeDoAparelho?: () => boolean;
  agora?: () => Date;
  novoId?: () => string;
  aleatorio?: () => number;
  agendar?: (funcao: () => void, ms: number) => () => void;
}

export type App = Awaited<ReturnType<typeof criarApp>>;

/** Tira barra final e valida o endereco digitado; `''` = mesmo host. */
export function normalizarEndereco(texto: string): string {
  const limpo = texto.trim().replace(/\/+$/, '');
  if (limpo === '') return '';
  const url = new URL(limpo); // lanca se nao for URL
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Use http:// ou https://');
  return limpo;
}

export async function criarApp(opcoes: OpcoesApp) {
  const agora = opcoes.agora ?? (() => new Date());
  const novoId = opcoes.novoId ?? (() => crypto.randomUUID());

  await migrar(opcoes.executor);
  const banco = new Banco(opcoes.executor);

  let dispositivoId = await banco.lerEstado('dispositivo_id');
  if (!dispositivoId) {
    dispositivoId = novoId();
    await banco.gravarEstado('dispositivo_id', dispositivoId);
  }
  let enderecoServidor: string | null = await banco.lerEstado('servidor');
  if (enderecoServidor === null && !opcoes.exigeEnderecoServidor) enderecoServidor = '';

  let monitor!: MonitorConectividade;
  const http = new ClienteHttp({
    fetch: opcoes.fetch,
    enderecoServidor: () => enderecoServidor,
    simulandoOffline: () => monitor.estado.simulandoOffline,
    dispositivoId: () => dispositivoId,
    // Uma requisicao real ficou sem resposta: confere ja se o servidor caiu (o ping decide o estado).
    aoFalharTransporte: () => void monitor.verificar(),
  });
  const sessao = new GerenciadorSessao(banco, http, agora);
  await sessao.carregar();

  monitor = new MonitorConectividade({
    simulacaoInicial: (await banco.lerEstado('modo_simulado')) === 'offline',
    persistirSimulacao: (simulando) => banco.gravarEstado('modo_simulado', simulando ? 'offline' : 'online'),
    // O ping vai autenticado (e renova o token se preciso).
    ping: async () => {
      // Sem sessao valida nao ha o que sincronizar: basta a rede do aparelho (o login confere o resto),
      // e nenhuma requisicao anonima vai para o log de acesso.
      const temRede = opcoes.redeDoAparelho?.() ?? true;
      if (!temRede) return false; // o aparelho ja sabe que esta sem rede: nem tenta
      if (sessao.atual === null || sessao.atual.precisaLogin) return true;
      try {
        const resposta = await sessao.requisitar({ metodo: 'GET', rota: '/api/v1/auth/me' });
        return servidorRespondeu(resposta.status);
      } catch (erro) {
        return erro instanceof SessaoExpirada; // o servidor respondeu (recusou a sessao): esta alcancavel
      }
    },
    agendar: opcoes.agendar,
  });

  const motor = new MotorSincronizacao({ banco, sessao, monitor, agora, novoId, aleatorio: opcoes.aleatorio, agendar: opcoes.agendar });

  const profissional = (): Profissional => {
    if (!sessao.atual) throw new Error('Nenhum profissional logado.');
    return sessao.atual.profissional;
  };
  const ctx: ContextoDados = {
    banco,
    profissional,
    estaOnline: () => monitor.estado.online,
    agora,
    novoId,
    aposEscrita: () => void motor.sincronizar('escrita'),
  };

  /** Log local de algo que nao e escrita clinica (login, seletor, sair, erro). */
  const registrarLog = (acao: string, resultado: 'SUCESSO' | 'FALHA' = 'SUCESSO', detalhe?: Record<string, unknown>) =>
    banco
      .gravar([
        sqlLog({
          id: novoId(),
          ocorridoEm: agora().toISOString(),
          acao,
          resultado,
          estavaOnline: monitor.estado.online,
          detalhe,
          profissionalId: sessao.atual?.profissional.id ?? null,
        }),
      ])
      .catch(() => undefined);

  return {
    banco,
    http,
    sessao,
    monitor,
    motor,
    dispositivoId,
    exigeEnderecoServidor: opcoes.exigeEnderecoServidor,
    pessoas: new RepositorioPessoas(ctx),
    prontuarios: new RepositorioProntuarios(ctx),
    medicamentos: new RepositorioMedicamentos(ctx),
    atendimentos: new RepositorioAtendimentos(ctx),
    pendencias: new RepositorioPendencias(ctx),
    registrarLog,

    enderecoServidor: () => enderecoServidor,
    async definirEnderecoServidor(texto: string): Promise<void> {
      const novo = normalizarEndereco(texto);
      if (novo === '' && opcoes.exigeEnderecoServidor) throw new Error('Informe o endereço do servidor.');
      await banco.gravarEstado('servidor', novo);
      enderecoServidor = novo;
      await monitor.verificar();
    },

    /** O seletor "Simular conectividade": persistido, registrado em log, e o Observer faz o resto. */
    async simularOffline(simulando: boolean): Promise<void> {
      await monitor.definirSimulacao(simulando);
      await registrarLog('SIMULACAO_CONECTIVIDADE', 'SUCESSO', { modo: simulando ? 'offline' : 'online' });
    },

    /** Liga o motor e o monitor; a primeira verificacao online dispara a sincronizacao de abertura. */
    async iniciar(): Promise<void> {
      await motor.iniciar();
      void monitor.iniciar();
    },

    parar(): void {
      motor.parar();
      monitor.parar();
    },
  };
}
