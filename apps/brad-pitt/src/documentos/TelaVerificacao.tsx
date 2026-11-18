import { Botao, Esqueleto, EstadoErro, Secao } from '@medicalfield/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileDown, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ErroApi } from '../api/cliente';
import { baixarPdf, obterDocumento } from '../api/recursos';
import { salvarArquivo, useAvisar } from '../comum/avisos';
import { CampoLeitura, CamposLeitura } from '../comum/CamposLeitura';
import { BotaoAtualizar } from '../comum/FolhaLista';
import { descreverErro, formatarDataHoraLonga, formatarTamanho } from '../comum/formato';
import { useProfissional } from '../sessao/sessao';

/** Destino do QR impresso na ficha: confere se o PDF guardado na central continua íntegro. */
export function TelaVerificacao() {
  const { id = '' } = useParams();
  const eu = useProfissional();
  const avisar = useAvisar();
  const documento = useQuery({ queryKey: ['documento', id], queryFn: () => obterDocumento(id) });
  const download = useMutation({
    mutationFn: async () => {
      const { arquivo, nome } = await baixarPdf(id);
      salvarArquivo(arquivo, nome ?? `ficha-${documento.data?.codigoVerificacao ?? id}.pdf`);
    },
    onError: (erro) => avisar({ tom: 'erro', ...descreverErro(erro, 'o PDF'), titulo: 'O PDF não foi baixado' }),
  });

  if (documento.isPending) {
    return (
      <div className="max-w-3xl" aria-busy="true">
        <p className="mf-so-leitor" role="status">
          Conferindo o documento…
        </p>
        <Secao titulo="Verificação de documento">
          <Esqueleto linhas={5} />
        </Secao>
      </div>
    );
  }
  if (documento.isError) {
    const naoExiste = documento.error instanceof ErroApi && documento.error.codigo === 'NAO_ENCONTRADO';
    const erro = naoExiste
      ? {
          titulo: 'Documento não encontrado',
          descricao: 'Nenhuma ficha da central tem este identificador. Confira se o endereço do QR foi lido por inteiro.',
        }
      : descreverErro(documento.error, 'o documento');
    return <EstadoErro className="max-w-3xl" {...erro} aoTentarDeNovo={() => void documento.refetch()} />;
  }

  const doc = documento.data;
  return (
    <div className="grid max-w-3xl grid-cols-1 gap-6">
      <div className="bp-veredito" data-integro={doc.integro}>
        {doc.integro ? <ShieldCheck aria-hidden /> : <ShieldAlert aria-hidden />}
        <div>
          <h2 className="bp-veredito__titulo">{doc.integro ? 'Documento íntegro' : 'Documento não confere'}</h2>
          <p className="m-0">
            {doc.integro
              ? 'O PDF guardado na central é exatamente o que foi gerado: o resumo criptográfico confere.'
              : 'O PDF guardado na central não corresponde ao resumo criptográfico registrado na geração. Não use esta cópia; gere a ficha de novo pelo atendimento.'}
          </p>
        </div>
      </div>

      <Secao
        titulo="Ficha de atendimento"
        descricao={
          <>
            Código de verificação <span className="mf-dado">{doc.codigoVerificacao}</span>
          </>
        }
        acoes={
          <>
            <BotaoAtualizar atualizando={documento.isFetching} aoAtualizar={() => void documento.refetch()} />
            <Botao icone={<FileDown aria-hidden />} carregando={download.isPending} onClick={() => download.mutate()}>
              Baixar PDF
            </Botao>
          </>
        }
        rente
      >
        <CamposLeitura>
          <CampoLeitura rotulo="Gerada em">
            <time className="mf-dado" dateTime={doc.geradoEm}>
              {formatarDataHoraLonga(doc.geradoEm)}
            </time>
          </CampoLeitura>
          <CampoLeitura rotulo="Tamanho">
            <span className="mf-dado">{formatarTamanho(doc.tamanhoBytes)}</span>
          </CampoLeitura>
          <CampoLeitura rotulo="Gerada por" largo>
            {doc.geradoPor === eu.id ? eu.nome : <span className="mf-dado">{doc.geradoPor}</span>}
          </CampoLeitura>
          <CampoLeitura rotulo="Resumo do conteúdo (SHA-256)" largo>
            <span className="mf-dado">{doc.hashConteudo}</span>
          </CampoLeitura>
          <CampoLeitura rotulo="Atendimento" largo>
            <Link to={`/atendimentos/${doc.atendimentoId}`}>Abrir o atendimento desta ficha</Link>
          </CampoLeitura>
        </CamposLeitura>
      </Secao>
    </div>
  );
}
