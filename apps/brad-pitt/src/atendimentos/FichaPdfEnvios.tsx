import type { Envio, StatusEnvio } from '@medicalfield/contratos';
import {
  Botao,
  Esqueleto,
  EstadoErro,
  EstadoVazio,
  Etiqueta,
  formatarHora,
  Secao,
  Select,
  SeloSync,
  Tabela,
  type Coluna,
  type EstadoSync,
} from '@medicalfield/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, FileText, Mail, MailQuestion, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { useState } from 'react';
import { baixarPdf, listarDocumentos, listarEnvios, obterDocumento, reenviar } from '../api/recursos';
import { salvarArquivo, useAvisar } from '../comum/avisos';
import { descreverErro, formatarDataHora, formatarTamanho } from '../comum/formato';
import { RegiaoRolavel } from '../comum/RegiaoRolavel';
import { DialogoEmail } from './DialogoEmail';

const SITUACAO: Record<StatusEnvio, { estado: EstadoSync; rotulo: string }> = {
  PENDENTE: { estado: 'local', rotulo: 'Na fila' },
  ENVIANDO: { estado: 'enviando', rotulo: 'Enviando' },
  ENVIADO: { estado: 'confirmado', rotulo: 'Enviado' },
  FALHA_DEFINITIVA: { estado: 'rejeitado', rotulo: 'Falha definitiva' },
};

const VINCULO: Record<string, string> = { PACIENTE: 'Paciente', FAMILIAR: 'Familiar' };

const emAndamento = (envio: Envio) => envio.status === 'PENDENTE' || envio.status === 'ENVIANDO';

/** Linha sob o selo: quantas tentativas e o que vem (ou veio) depois. */
function detalheDoEnvio(envio: Envio): string {
  const tentativas = `${envio.tentativas} ${envio.tentativas === 1 ? 'tentativa' : 'tentativas'}`;
  if (envio.status === 'ENVIADO' && envio.enviadoEm) return `${tentativas} · entregue em ${formatarDataHora(envio.enviadoEm)}`;
  if (envio.status === 'PENDENTE' && envio.tentativas > 0 && envio.proximaTentativaEm) {
    return `${tentativas} · a próxima às ${formatarHora(envio.proximaTentativaEm)}`;
  }
  if (envio.status === 'FALHA_DEFINITIVA' && envio.ultimoErro) return `${tentativas} · ${envio.ultimoErro}`;
  return tentativas;
}

export interface FichaPdfEnviosProps {
  atendimentoId: string;
  /** Nome de quem gerou, quando o portal conhece o id (a API só devolve o id). */
  nomeDe: (profissionalId: string) => string | undefined;
}

/** Bloco "Ficha em PDF e envios": versão da ficha, integridade, download e a fila de e-mails. */
export function FichaPdfEnvios({ atendimentoId, nomeDe }: FichaPdfEnviosProps) {
  const avisar = useAvisar();
  const consultas = useQueryClient();
  const [versao, setVersao] = useState<string | null>(null);
  const [dialogoAberto, setDialogoAberto] = useState(false);

  const documentos = useQuery({
    queryKey: ['documentos', atendimentoId],
    queryFn: () => listarDocumentos(atendimentoId),
    select: (dados) => [...dados.itens].sort((a, b) => Date.parse(b.geradoEm) - Date.parse(a.geradoEm)),
  });
  const documento = documentos.data?.find((d) => d.id === versao) ?? documentos.data?.[0];
  const documentoId = documento?.id;

  const integridade = useQuery({
    queryKey: ['documento', documentoId],
    queryFn: () => obterDocumento(documentoId as string),
    enabled: !!documentoId,
  });
  const envios = useQuery({
    queryKey: ['envios', documentoId],
    queryFn: () => listarEnvios(documentoId as string),
    enabled: !!documentoId,
    // Enquanto houver e-mail na fila, a situação se atualiza sozinha.
    refetchInterval: (consulta) => (consulta.state.data?.itens.some(emAndamento) ? 3000 : false),
  });

  const download = useMutation({
    mutationFn: async () => {
      if (!documento) return;
      const { arquivo, nome } = await baixarPdf(documento.id);
      salvarArquivo(arquivo, nome ?? `ficha-${documento.codigoVerificacao}.pdf`);
    },
    onError: (erro) => avisar({ tom: 'erro', ...descreverErro(erro, 'o PDF'), titulo: 'O PDF não foi baixado' }),
  });
  const reenvio = useMutation({
    mutationFn: reenviar,
    onSuccess: () => {
      void consultas.invalidateQueries({ queryKey: ['envios', documentoId] });
      avisar({ titulo: 'Envio de volta à fila' });
    },
    onError: (erro) => avisar({ tom: 'erro', ...descreverErro(erro, 'o envio'), titulo: 'O reenvio não foi registrado' }),
  });

  const colunas: Coluna<Envio>[] = [
    {
      id: 'destinatario',
      titulo: 'Destinatário',
      quebra: true,
      celula: (envio) => (
        <>
          {envio.destinatarioNome} · {VINCULO[envio.vinculo] ?? envio.vinculo}
          <div className="mf-dado text-rotulo text-tinta-2 [overflow-wrap:anywhere]">{envio.destinatarioEmail}</div>
        </>
      ),
    },
    {
      id: 'situacao',
      titulo: 'Situação e tentativas',
      quebra: true,
      celula: (envio) => (
        <>
          <SeloSync
            {...SITUACAO[envio.status]}
            className={envio.status === 'ENVIADO' ? '[&_svg]:text-[var(--mf-tri-verde)]' : undefined}
          />
          <div className="mf-num text-pequeno text-tinta-2">{detalheDoEnvio(envio)}</div>
        </>
      ),
    },
    {
      id: 'acao',
      titulo: '',
      alinhar: 'fim',
      celula: (envio) =>
        envio.status === 'FALHA_DEFINITIVA' ? (
          <Botao
            carregando={reenvio.isPending && reenvio.variables === envio.id}
            onClick={() => reenvio.mutate(envio.id)}
            aria-label={`Reenviar para ${envio.destinatarioNome}`}
          >
            Reenviar
          </Botao>
        ) : null,
    },
  ];

  const titulo = 'Ficha em PDF e envios';

  if (documentos.isPending) {
    return (
      <Secao titulo={titulo}>
        <div aria-busy="true">
          <Esqueleto linhas={2} />
        </div>
      </Secao>
    );
  }
  if (documentos.isError) {
    return (
      <Secao titulo={titulo}>
        <EstadoErro {...descreverErro(documentos.error, 'as fichas em PDF')} aoTentarDeNovo={() => void documentos.refetch()} />
      </Secao>
    );
  }
  if (!documento) {
    return (
      <Secao titulo={titulo}>
        <EstadoVazio icone={<FileText aria-hidden />} titulo="Ficha ainda não gerada" />
      </Secao>
    );
  }

  const autor = nomeDe(documento.geradoPor);

  return (
    <Secao
      titulo={titulo}
      descricao={
        <>
          Código <span className="mf-dado">{documento.codigoVerificacao}</span> · gerada em {formatarDataHora(documento.geradoEm)}
          {autor ? ` por ${autor}` : ''} · {formatarTamanho(documento.tamanhoBytes)}
        </>
      }
      acoes={
        <>
          <span className="self-center">
            {integridade.isPending ? (
              <span className="mf-so-leitor" role="status">
                Conferindo a integridade…
              </span>
            ) : integridade.isError ? (
              <Etiqueta icone={<ShieldQuestion aria-hidden />}>Integridade não conferida</Etiqueta>
            ) : integridade.data.integro ? (
              <Etiqueta icone={<ShieldCheck aria-hidden />}>Íntegra</Etiqueta>
            ) : (
              <Etiqueta tom="carmim" icone={<ShieldAlert aria-hidden />}>
                Não confere
              </Etiqueta>
            )}
          </span>
          <Botao icone={<FileDown aria-hidden />} carregando={download.isPending} onClick={() => download.mutate()}>
            Baixar PDF
          </Botao>
          <Botao icone={<Mail aria-hidden />} onClick={() => setDialogoAberto(true)}>
            Enviar por e-mail
          </Botao>
        </>
      }
      rente
    >
      {documentos.data.length > 1 ? (
        <div className="border-b border-fio p-3">
          <Select
            rotulo="Versão da ficha"
            value={documento.id}
            onChange={(evento) => setVersao(evento.target.value)}
            opcoes={documentos.data.map((d, indice) => ({
              valor: d.id,
              rotulo: `${d.codigoVerificacao} · ${formatarDataHora(d.geradoEm)}${indice === 0 ? ' · mais recente' : ''}`,
            }))}
          />
        </div>
      ) : null}
      {envios.isError && !envios.data ? (
        <EstadoErro
          {...descreverErro(envios.error, 'os envios')}
          aoTentarDeNovo={() => void envios.refetch()}
          className="m-3"
        />
      ) : (
        <RegiaoRolavel rotulo="Envios da ficha por e-mail">
          <Tabela
            legenda="Envios da ficha por e-mail"
            colunas={colunas}
            linhas={envios.data?.itens ?? []}
            chave={(envio) => envio.id}
            carregando={envios.isPending}
            vazio={
              <EstadoVazio className="m-3" icone={<MailQuestion aria-hidden />} titulo="Nenhum envio desta ficha" />
            }
          />
        </RegiaoRolavel>
      )}
      <DialogoEmail documentoId={documento.id} aberto={dialogoAberto} aoFechar={() => setDialogoAberto(false)} />
    </Secao>
  );
}
