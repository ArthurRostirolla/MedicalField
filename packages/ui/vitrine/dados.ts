// Dados FICTÍCIOS da vitrine. Nenhum paciente, profissional ou hospital aqui é real.
import type { CorTriagem, EventoLinha, ProtocoloTriagem, ResumoPassagem } from '../src';

export const FUSO = 'America/Sao_Paulo';

/** 17/11/2026, horário de Brasília (UTC−3). */
const em = (hora: string): string => `2026-11-18T${hora}:00.000Z`;

export const PACIENTE = { nome: 'Marlene Antunes Figueiró', identificacao: '58 anos · F' };
export const QUEIXA = 'Dor torácica há cerca de 40 minutos';
export const ID_ATENDIMENTO = '7f3c9a12-5b1e-4c0a-9d2f-3e8a41c6b7d0';

export const EVENTOS: EventoLinha[] = [
  {
    id: 'e1',
    tipo: 'TRIAGEM',
    ocorridoEm: em('00:02'),
    profissionalNome: 'Enf. Caio Brandão',
    dados: { protocolo: 'MANCHESTER', classificacao: 'LARANJA' },
  },
  {
    id: 'e2',
    tipo: 'SINAIS_VITAIS',
    ocorridoEm: em('00:04'),
    profissionalNome: 'Enf. Caio Brandão',
    dados: {
      pressaoSistolica: 168,
      pressaoDiastolica: 102,
      frequenciaCardiaca: 121,
      frequenciaRespiratoria: 22,
      saturacao: 93,
      temperatura: 36.4,
      glicemia: 142,
    },
  },
  {
    id: 'e3',
    tipo: 'GLASGOW',
    ocorridoEm: em('00:05'),
    profissionalNome: 'Enf. Caio Brandão',
    dados: { ocular: 4, verbal: 5, motora: 6, total: 15 },
  },
  {
    id: 'e4',
    tipo: 'MEDICACAO',
    ocorridoEm: em('00:08'),
    profissionalNome: 'Enf. Caio Brandão',
    dados: { medicamentoId: 'm-aas', nome: 'Ácido acetilsalicílico', dose: '200', unidade: 'mg', via: 'VO' },
  },
  {
    id: 'e5',
    tipo: 'PROCEDIMENTO',
    ocorridoEm: em('00:11'),
    profissionalNome: 'Soc. Lia Moura',
    dados: { descricao: 'Acesso venoso periférico em membro superior esquerdo' },
  },
  {
    id: 'e6',
    tipo: 'RETIFICACAO',
    ocorridoEm: em('00:13'),
    profissionalNome: 'Enf. Caio Brandão',
    retificaEventoId: 'e2',
    dados: { motivo: 'Frequência cardíaca digitada errada.', dadosCorrigidos: { frequenciaCardiaca: 112 } },
  },
  {
    id: 'e7',
    tipo: 'SINAIS_VITAIS',
    ocorridoEm: em('00:19'),
    profissionalNome: 'Enf. Caio Brandão',
    dados: { pressaoSistolica: 152, pressaoDiastolica: 96, frequenciaCardiaca: 104, saturacao: 96 },
  },
  {
    id: 'e8',
    tipo: 'MEDICACAO',
    ocorridoEm: em('00:21'),
    profissionalNome: 'Enf. Caio Brandão',
    dados: { medicamentoId: null, nome: 'Dinitrato de isossorbida', dose: '5', unidade: 'mg', via: 'SL' },
  },
  {
    id: 'e9',
    tipo: 'OBSERVACAO',
    ocorridoEm: em('00:27'),
    profissionalNome: 'Soc. Lia Moura',
    dados: { texto: 'Paciente refere melhora parcial da dor. Filha acompanha na viatura.' },
  },
  {
    id: 'e10',
    tipo: 'ENCERRAMENTO',
    ocorridoEm: em('00:41'),
    profissionalNome: 'Enf. Caio Brandão',
    dados: { desfecho: 'Entregue à equipe hospitalar', destino: 'Hospital Regional do Vale — Emergência' },
  },
];

export const RESUMO: ResumoPassagem = {
  triagem: { ocorridoEm: em('00:02'), dados: { protocolo: 'MANCHESTER', classificacao: 'LARANJA' } },
  glasgowMaisRecente: { ocorridoEm: em('00:05'), dados: { ocular: 4, verbal: 5, motora: 6, total: 15 } },
  ultimosSinaisVitais: {
    ocorridoEm: em('00:19'),
    dados: { pressaoSistolica: 152, pressaoDiastolica: 96, frequenciaCardiaca: 104, saturacao: 96 },
  },
  medicacoes: [
    { ocorridoEm: em('00:08'), nome: 'Ácido acetilsalicílico', dose: '200', unidade: 'mg', via: 'VO' },
    { ocorridoEm: em('00:21'), nome: 'Dinitrato de isossorbida', dose: '5', unidade: 'mg', via: 'SL' },
  ],
  procedimentos: [{ ocorridoEm: em('00:11'), descricao: 'Acesso venoso periférico em MSE' }],
  alergias: ['Dipirona', 'Látex'],
  comorbidades: ['Hipertensão arterial', 'Diabetes tipo 2'],
  medicacoesContinuas: ['Losartana 50 mg', 'Metformina 850 mg'],
  encerramento: {
    ocorridoEm: em('00:41'),
    desfecho: 'Entregue à equipe hospitalar',
    destino: 'Hospital Regional do Vale — Emergência',
  },
};

export interface AtendimentoLista {
  id: string;
  iniciadoEm: string;
  pessoaNome: string;
  profissionalNome: string;
  status: 'ABERTO' | 'ENCERRADO';
  triagem: { protocolo: ProtocoloTriagem; classificacao: CorTriagem } | null;
  queixa: string;
}

const linha = (
  id: string,
  hora: string,
  pessoaNome: string,
  profissionalNome: string,
  status: AtendimentoLista['status'],
  triagem: [ProtocoloTriagem, CorTriagem] | null,
  queixa: string,
): AtendimentoLista => ({
  id,
  iniciadoEm: `2026-11-17T${hora}:00.000Z`,
  pessoaNome,
  profissionalNome,
  status,
  triagem: triagem ? { protocolo: triagem[0], classificacao: triagem[1] } : null,
  queixa,
});

export const ATENDIMENTOS: AtendimentoLista[] = [
  { ...linha(ID_ATENDIMENTO, '00:02', PACIENTE.nome, 'Enf. Caio Brandão', 'ENCERRADO', ['MANCHESTER', 'LARANJA'], QUEIXA), iniciadoEm: em('00:02') },
  linha('a2', '23:31', 'Não identificado (masc., ~30 anos)', 'Soc. Lia Moura', 'ABERTO', ['START', 'VERMELHO'], 'Colisão moto × carro'),
  linha('a3', '22:48', 'Otávio Reis Schmitt', 'Soc. Lia Moura', 'ENCERRADO', ['START', 'AMARELO'], 'Colisão moto × carro'),
  linha('a4', '21:15', 'Iolanda Pires de Mello', 'Enf. Caio Brandão', 'ENCERRADO', ['MANCHESTER', 'AMARELO'], 'Queda da própria altura'),
  linha('a5', '19:52', 'Benício Lauro Kessler', 'Enf. Caio Brandão', 'ENCERRADO', ['MANCHESTER', 'VERDE'], 'Corte em antebraço'),
  linha('a6', '18:07', 'Dalva Nogueira Stein', 'Soc. Lia Moura', 'ENCERRADO', ['MANCHESTER', 'VERMELHO'], 'Inconsciência'),
  linha('a7', '16:40', 'Ruan Teixeira Borba', 'Enf. Caio Brandão', 'ENCERRADO', ['MANCHESTER', 'AZUL'], 'Mal-estar'),
  linha('a8', '15:22', 'Celina Mattos Horn', 'Soc. Lia Moura', 'ENCERRADO', null, 'Crise de ansiedade'),
  linha('a9', '13:05', 'Não identificada (fem., idosa)', 'Soc. Lia Moura', 'ENCERRADO', ['START', 'PRETO'], 'Desabamento'),
  linha('a10', '12:58', 'Hélio Valim Drumond', 'Enf. Caio Brandão', 'ENCERRADO', ['START', 'VERDE'], 'Desabamento'),
];

export const MEDICAMENTOS = [
  { valor: 'm-aas', rotulo: 'Ácido acetilsalicílico — comp. 100 mg' },
  { valor: 'm-adr', rotulo: 'Adrenalina — amp. 1 mg/mL' },
  { valor: 'm-gli', rotulo: 'Glicose 50% — amp. 10 mL' },
  { valor: 'm-sf', rotulo: 'Soro fisiológico 0,9% — 500 mL' },
];

export const ENVIOS = [
  { id: 'v1', destinatario: 'Paula Figueiró', email: 'paula.f@exemplo.test', vinculo: 'Familiar', estado: 'confirmado' as const, rotulo: 'Enviado', tentativas: 1, hora: em('01:06') },
  { id: 'v2', destinatario: 'Marlene A. Figueiró', email: 'marlene@exemplo.test', vinculo: 'Paciente', estado: 'rejeitado' as const, rotulo: 'Falha definitiva', tentativas: 5, hora: em('01:04') },
];
