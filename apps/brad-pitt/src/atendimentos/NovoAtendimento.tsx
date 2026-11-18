// Abre um atendimento pelo portal para uma pessoa ja cadastrada; os registros entram depois, na tela do atendimento.
import { atendimentoEntradaSchema } from '@medicalfield/contratos';
import { Botao, CampoTexto, Dialogo } from '@medicalfield/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { registrarAtendimento } from '../api/recursos';
import { useAvisar } from '../comum/avisos';
import { descreverErro } from '../comum/formato';

export function BotaoNovoAtendimento({ pessoaId }: { pessoaId: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Botao icone={<Plus aria-hidden />} onClick={() => setAberto(true)}>
        Novo atendimento
      </Botao>
      <Dialogo aberto={aberto} aoFechar={() => setAberto(false)} titulo="Novo atendimento">
        {aberto ? <Formulario pessoaId={pessoaId} aoFechar={() => setAberto(false)} /> : null}
      </Dialogo>
    </>
  );
}

function Formulario({ pessoaId, aoFechar }: { pessoaId: string; aoFechar: () => void }) {
  const navegar = useNavigate();
  const avisar = useAvisar();
  const consultas = useQueryClient();
  // Um id por abertura: repetir depois de falha de rede devolve o mesmo atendimento (200), nao cria outro.
  const [id] = useState(() => crypto.randomUUID());
  const [queixa, setQueixa] = useState('');
  const [local, setLocal] = useState('');
  const [falha, setFalha] = useState<string | null>(null);

  const criacao = useMutation({
    mutationFn: registrarAtendimento,
    onSuccess: () => {
      void consultas.invalidateQueries({ queryKey: ['atendimentos'] });
      void consultas.invalidateQueries({ queryKey: ['atendimentos-da-pessoa', pessoaId] });
      avisar({ tom: 'sucesso', titulo: 'Atendimento aberto' });
      aoFechar();
      void navegar(`/atendimentos/${id}`);
    },
    onError: (erro) => setFalha(descreverErro(erro, 'o atendimento').descricao),
  });

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setFalha(null);
    const entrada = atendimentoEntradaSchema.safeParse({
      id,
      pessoaId,
      iniciadoEm: new Date().toISOString(),
      ...(queixa.trim() ? { queixaPrincipal: queixa.trim() } : {}),
      ...(local.trim() ? { localDescricao: local.trim() } : {}),
    });
    if (!entrada.success) return setFalha('Confira a queixa e o local.');
    criacao.mutate(entrada.data);
  }

  return (
    <form className="grid grid-cols-1 gap-3" onSubmit={aoEnviar} noValidate>
      <CampoTexto rotulo="Queixa principal" value={queixa} onChange={(e) => setQueixa(e.target.value)} autoComplete="off" autoFocus />
      <CampoTexto rotulo="Local" value={local} onChange={(e) => setLocal(e.target.value)} autoComplete="off" />
      {falha ? (
        <p className="mf-campo__erro m-0" role="alert">
          <CircleAlert aria-hidden />
          <span>{falha}</span>
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao type="submit" variante="primario" carregando={criacao.isPending}>
          Abrir atendimento
        </Botao>
      </div>
    </form>
  );
}
