// Apoio aos testes de ponta a ponta: fala com o backend REAL (sem simulação).
import { expect, type Page } from '@playwright/test';

export const MIKE = process.env.MF_MIKE_URL ?? 'http://localhost:8081';
export const CIDA = process.env.MF_CIDA_URL ?? 'http://localhost:8082';
export const MAILPIT = process.env.MF_MAILPIT_URL ?? 'http://localhost:8025';

/** A senha de demonstração está em services/mike-baguncinha/README.md; aqui ela só entra por variável. */
export function senhaDemo(): string {
  const senha = process.env.MF_SENHA_DEMO;
  if (!senha) throw new Error('Defina MF_SENHA_DEMO com a senha de demonstração (services/mike-baguncinha/README.md).');
  return senha;
}

export const ADMIN = { tipo: 'CRM', registro: '100001', uf: 'RS', nome: 'Dra. Helena Prado' } as const;
export const PROFISSIONAL = { tipo: 'COREN', registro: '200002', uf: 'RS', nome: 'Enf. Caio Brandão' } as const;

type Quem = typeof ADMIN | typeof PROFISSIONAL;

/** Login pela API, para preparar dados e conferir permissões sem passar pela tela. */
export async function tokenDe(quem: Quem): Promise<string> {
  const resposta = await fetch(`${MIKE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipoRegistro: quem.tipo, registro: quem.registro, uf: quem.uf, senha: senhaDemo() }),
  });
  if (!resposta.ok) throw new Error(`Login de apoio falhou: HTTP ${resposta.status}`);
  return ((await resposta.json()) as { accessToken: string }).accessToken;
}

/** Login pela tela do portal. */
export async function entrar(pagina: Page, quem: Quem = ADMIN, caminho = './'): Promise<void> {
  await pagina.goto(caminho);
  await pagina.getByRole('radio', { name: quem.tipo, exact: true }).check();
  await pagina.getByLabel(/Número do/).fill(quem.registro);
  await pagina.getByLabel('UF').selectOption(quem.uf);
  await pagina.getByLabel('Senha').fill(senhaDemo());
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await expect(pagina.getByRole('navigation', { name: 'Seções do portal' })).toBeVisible();
}

/* ───────── Atendimentos de demonstração ───────── */

// Ids fixos: o POST é idempotente pelo id, então rodar de novo não duplica nada.
const ATENDIMENTOS = ['e2e00000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-000000000002', 'e2e00000-0000-4000-8000-000000000003'];
export const ATENDIMENTO_COMPLETO = ATENDIMENTOS[0] as string;
export const QUEIXA_COMPLETO = 'Dor torácica há cerca de 40 minutos';

const evento = (atendimento: number, n: number) => `e2e00000-0000-4000-8${atendimento}00-${String(n).padStart(12, '0')}`;

/** Cria (uma vez) três atendimentos fictícios para as pessoas de demonstração. */
export async function garantirAtendimentos(): Promise<void> {
  const token = await tokenDe(PROFISSIONAL);
  const cabecalhos = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const prontuarios = (await (await fetch(`${CIDA}/api/v1/prontuario?limite=3`, { headers: cabecalhos })).json()) as {
    itens: { pessoaId: string }[];
  };
  const pessoas = prontuarios.itens.map((p) => p.pessoaId);
  if (pessoas.length === 0) throw new Error('Sem pessoas de demonstração na DonaCida.');
  const pessoa = (indice: number) => pessoas[indice % pessoas.length] as string;

  // Horários no passado recente; o servidor limita o que estiver à frente do relógio dele.
  const base = Date.now() - 3 * 60 * 60 * 1000;
  const em = (minutos: number) => new Date(base + minutos * 60_000).toISOString();

  const corpos = [
    {
      id: ATENDIMENTOS[0],
      pessoaId: pessoa(0),
      iniciadoEm: em(0),
      localDescricao: 'Av. Fictícia, 100 — via pública',
      queixaPrincipal: QUEIXA_COMPLETO,
      eventos: [
        { id: evento(1, 1), tipo: 'TRIAGEM', ocorridoEm: em(1), dados: { protocolo: 'MANCHESTER', classificacao: 'LARANJA' } },
        {
          id: evento(1, 2),
          tipo: 'SINAIS_VITAIS',
          ocorridoEm: em(2),
          dados: { pressaoSistolica: 168, pressaoDiastolica: 102, frequenciaCardiaca: 121, frequenciaRespiratoria: 22, saturacao: 93, temperatura: 36.4, glicemia: 142 },
        },
        { id: evento(1, 3), tipo: 'GLASGOW', ocorridoEm: em(3), dados: { ocular: 4, verbal: 5, motora: 6, total: 15 } },
        { id: evento(1, 4), tipo: 'MEDICACAO', ocorridoEm: em(6), dados: { medicamentoId: null, nome: 'Ácido acetilsalicílico', dose: '200', unidade: 'mg', via: 'VO' } },
        { id: evento(1, 5), tipo: 'PROCEDIMENTO', ocorridoEm: em(9), dados: { descricao: 'Acesso venoso periférico em membro superior esquerdo' } },
        {
          id: evento(1, 6),
          tipo: 'RETIFICACAO',
          ocorridoEm: em(11),
          retificaEventoId: evento(1, 2),
          dados: { motivo: 'Frequência cardíaca digitada errada.', dadosCorrigidos: { frequenciaCardiaca: 112 } },
        },
        { id: evento(1, 7), tipo: 'SINAIS_VITAIS', ocorridoEm: em(17), dados: { pressaoSistolica: 152, pressaoDiastolica: 96, frequenciaCardiaca: 104, saturacao: 96 } },
        { id: evento(1, 8), tipo: 'OBSERVACAO', ocorridoEm: em(25), dados: { texto: 'Paciente refere melhora parcial da dor. Familiar acompanha na viatura.' } },
        { id: evento(1, 9), tipo: 'ENCERRAMENTO', ocorridoEm: em(39), dados: { desfecho: 'Entregue à equipe hospitalar', destino: 'Hospital Fictício do Vale — Emergência' } },
      ],
    },
    {
      id: ATENDIMENTOS[1],
      pessoaId: pessoa(1),
      iniciadoEm: em(60),
      localDescricao: 'Rodovia Fictícia, km 12',
      queixaPrincipal: 'Colisão moto × carro',
      eventos: [
        { id: evento(2, 1), tipo: 'TRIAGEM', ocorridoEm: em(61), dados: { protocolo: 'START', classificacao: 'AMARELO' } },
        { id: evento(2, 2), tipo: 'SINAIS_VITAIS', ocorridoEm: em(63), dados: { pressaoSistolica: 118, pressaoDiastolica: 76, frequenciaCardiaca: 98, saturacao: 97 } },
        { id: evento(2, 3), tipo: 'PROCEDIMENTO', ocorridoEm: em(66), dados: { descricao: 'Imobilização em prancha rígida com colar cervical' } },
      ],
    },
    { id: ATENDIMENTOS[2], pessoaId: pessoa(2), iniciadoEm: em(120), queixaPrincipal: 'Queda da própria altura' },
  ];

  for (const corpo of corpos) {
    const resposta = await fetch(`${CIDA}/api/v1/atendimento`, { method: 'POST', headers: cabecalhos, body: JSON.stringify(corpo) });
    if (!resposta.ok) throw new Error(`POST /atendimento falhou: HTTP ${resposta.status} ${await resposta.text()}`);
  }
}

/** Espera o e-mail chegar ao Mailpit e devolve os anexos dele. */
export async function anexosDoEmailPara(destinatario: string): Promise<{ FileName: string; ContentType: string; Size: number }[]> {
  let anexos: { FileName: string; ContentType: string; Size: number }[] | null = null;
  await expect
    .poll(
      async () => {
        const lista = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${destinatario}`)}`)).json()) as {
          messages: { ID: string }[];
        };
        const id = lista.messages[0]?.ID;
        if (!id) return 0;
        const mensagem = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Attachments: typeof anexos };
        anexos = mensagem.Attachments ?? [];
        return anexos.length;
      },
      { message: `e-mail para ${destinatario} com anexo no Mailpit`, timeout: 45_000, intervals: [1000] },
    )
    .toBeGreaterThan(0);
  return anexos ?? [];
}

/** Junta erros de console e exceções da página; o critério de aceite é a lista vazia. */
export function vigiarConsole(pagina: Page): string[] {
  const erros: string[] = [];
  pagina.on('console', (mensagem) => {
    if (mensagem.type() === 'error') erros.push(mensagem.text());
  });
  pagina.on('pageerror', (erro) => erros.push(erro.message));
  return erros;
}
