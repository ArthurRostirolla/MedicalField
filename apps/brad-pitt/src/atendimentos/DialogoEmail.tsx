import { envioEntradaSchema, type Vinculo } from '@medicalfield/contratos';
import { Botao, CampoTexto, Dialogo, SeletorSegmentado } from '@medicalfield/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Mail } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { ErroApi } from '../api/cliente';
import { enviarPorEmail } from '../api/recursos';
import { useAvisar } from '../comum/avisos';

type Campo = 'destinatarioNome' | 'destinatarioEmail' | 'vinculo';

const MENSAGEM: Record<Campo, string> = {
  destinatarioNome: 'Informe o nome de quem vai receber.',
  destinatarioEmail: 'Digite um e-mail válido, como nome@dominio.com.',
  vinculo: 'Escolha o vínculo com o paciente.',
};

interface FormularioProps {
  documentoId: string;
  idForm: string;
  aoConcluir: () => void;
  /** O botão de enviar fica no rodapé do diálogo, fora do formulário. */
  aoMudarEnviando: (enviando: boolean) => void;
}

function Formulario({ documentoId, idForm, aoConcluir, aoMudarEnviando }: FormularioProps) {
  const avisar = useAvisar();
  const consultas = useQueryClient();
  // Uma chave por abertura do diálogo: repetir o envio depois de uma falha de rede não duplica o e-mail.
  const [chave] = useState(() => crypto.randomUUID());
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [vinculo, setVinculo] = useState<Vinculo | null>(null);
  const [erros, setErros] = useState<Partial<Record<Campo, string>>>({});
  const [falha, setFalha] = useState<string | null>(null);

  const envio = useMutation({
    mutationFn: (entrada: Parameters<typeof enviarPorEmail>[1]) => enviarPorEmail(documentoId, entrada, chave),
    onSuccess: () => {
      void consultas.invalidateQueries({ queryKey: ['envios', documentoId] });
      avisar({ titulo: 'Envio na fila', descricao: 'A situação aparece em “Ficha em PDF e envios” e se atualiza sozinha.' });
      aoConcluir();
    },
    onError: (erro) => {
      if (erro instanceof ErroApi && erro.codigo === 'VALIDACAO' && erro.detalhes.length > 0) {
        setErros(
          Object.fromEntries(
            erro.detalhes.filter((d) => d.campo in MENSAGEM).map((d) => [d.campo, MENSAGEM[d.campo as Campo]]),
          ),
        );
        return;
      }
      setFalha(
        erro instanceof ErroApi && !erro.transitorio
          ? erro.message
          : 'O envio não foi registrado: o serviço de documentos não respondeu. Tente de novo.',
      );
    },
  });

  const enviando = envio.isPending;
  useEffect(() => {
    aoMudarEnviando(enviando);
    return () => aoMudarEnviando(false);
  }, [aoMudarEnviando, enviando]);

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setFalha(null);
    const entrada = envioEntradaSchema.safeParse({ destinatarioNome: nome, destinatarioEmail: email.trim(), vinculo });
    if (!entrada.success) {
      setErros(
        Object.fromEntries(entrada.error.issues.map((problema) => [problema.path[0], MENSAGEM[problema.path[0] as Campo]])),
      );
      return;
    }
    setErros({});
    envio.mutate(entrada.data);
  }

  return (
    <form id={idForm} className="grid grid-cols-1 gap-3" onSubmit={aoEnviar} noValidate>
      <p className="m-0 text-tinta-2">O PDF segue anexado. Confira o endereço: a ficha contém dados de saúde.</p>
      <CampoTexto
        rotulo="Nome do destinatário"
        name="destinatarioNome"
        value={nome}
        onChange={(evento) => setNome(evento.target.value)}
        autoComplete="off"
        erro={erros.destinatarioNome}
      />
      <CampoTexto
        rotulo="E-mail"
        name="destinatarioEmail"
        type="email"
        value={email}
        onChange={(evento) => setEmail(evento.target.value)}
        autoComplete="off"
        spellCheck={false}
        erro={erros.destinatarioEmail}
      />
      <div>
        <SeletorSegmentado
          rotulo="Vínculo"
          valor={vinculo}
          aoMudar={setVinculo}
          opcoes={[
            { valor: 'PACIENTE', rotulo: 'Paciente' },
            { valor: 'FAMILIAR', rotulo: 'Familiar' },
          ]}
        />
        {erros.vinculo ? (
          <p className="mf-campo__erro" role="alert">
            <CircleAlert aria-hidden />
            <span>{erros.vinculo}</span>
          </p>
        ) : null}
      </div>
      {falha ? (
        <p className="mf-campo__erro m-0" role="alert">
          <CircleAlert aria-hidden />
          <span>{falha}</span>
        </p>
      ) : null}
    </form>
  );
}

export function DialogoEmail({ documentoId, aberto, aoFechar }: { documentoId: string; aberto: boolean; aoFechar: () => void }) {
  const idForm = useId();
  const [enviando, setEnviando] = useState(false);
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Enviar a ficha por e-mail"
      acoes={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" icone={<Mail aria-hidden />} carregando={enviando}>
            Enviar ficha
          </Botao>
        </>
      }
    >
      {aberto ? <Formulario documentoId={documentoId} idForm={idForm} aoConcluir={aoFechar} aoMudarEnviando={setEnviando} /> : null}
    </Dialogo>
  );
}
