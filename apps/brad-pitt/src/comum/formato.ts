// Formatação para exibir. Nada aqui interpreta valor clínico.
import { ErroApi } from '../api/cliente';

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const DATA_HORA_LONGA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

/** `18/11 00:55` — para colunas de lista. */
export function formatarDataHora(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? '—' : DATA_HORA.format(data).replace(',', '');
}

/** `18/11/2026 00:55:56` — para auditoria e detalhe. */
export function formatarDataHoraLonga(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? '—' : DATA_HORA_LONGA.format(data).replace(',', '');
}

const DATA_PURA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Data pura `YYYY-MM-DD` → `DD/MM/YYYY`, sem passar por fuso. */
export function formatarData(data: string | null): string {
  const partes = data ? DATA_PURA.exec(data) : null;
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : '—';
}

/** Idade em anos completos na data de referência. */
export function idadeEm(dataNascimento: string | null, referencia: Date = new Date()): number | null {
  const partes = dataNascimento ? DATA_PURA.exec(dataNascimento) : null;
  if (!partes) return null;
  const [ano, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const mesAtual = referencia.getMonth() + 1;
  const jaFez = mesAtual > mes || (mesAtual === mes && referencia.getDate() >= dia);
  return referencia.getFullYear() - ano - (jaFez ? 0 : 1);
}

export function formatarCpf(cpf: string | null): string {
  if (!cpf) return '—';
  return /^\d{11}$/.test(cpf) ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` : cpf;
}

export function formatarTamanho(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} kB`
    : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Valor de `<input type="datetime-local">` (hora local) → ISO-8601 UTC; vazio → `undefined`. */
export function localParaIso(valor: string): string | undefined {
  const data = valor ? new Date(valor) : null;
  return data && !Number.isNaN(data.getTime()) ? data.toISOString() : undefined;
}

export interface ErroDescrito {
  titulo: string;
  descricao: string;
  requestId?: string;
}

/** Diz o que falhou e o que fazer, nas palavras de quem usa o portal. */
export function descreverErro(erro: unknown, oQue = 'os dados'): ErroDescrito {
  if (!(erro instanceof ErroApi)) {
    return { titulo: `Não foi possível carregar ${oQue}`, descricao: 'Tente de novo. Se continuar, avise o suporte.' };
  }
  const requestId = erro.requestId;
  switch (erro.codigo) {
    case 'SEM_CONEXAO':
      return { titulo: 'Sem conexão com o servidor', descricao: 'Confira a rede deste computador e tente de novo.' };
    case 'SERVICO_INDISPONIVEL':
      return {
        titulo: 'Serviço fora do ar',
        descricao: `O serviço que entrega ${oQue} não respondeu. Tente de novo em instantes.`,
        requestId,
      };
    case 'SEM_PERMISSAO':
      return { titulo: 'Sem permissão', descricao: 'Seu perfil não tem acesso a esta área do portal.', requestId };
    case 'NAO_ENCONTRADO':
      return {
        titulo: 'Registro não encontrado',
        descricao: 'O endereço pode estar errado ou o registro ainda não chegou à central.',
        requestId,
      };
    case 'NAO_AUTENTICADO':
      return { titulo: 'Sessão encerrada', descricao: 'Entre de novo para continuar.' };
    case 'RESPOSTA_INVALIDA':
      return { titulo: 'Resposta fora do contrato', descricao: erro.message };
    default:
      return { titulo: `Não foi possível carregar ${oQue}`, descricao: erro.message, requestId };
  }
}
