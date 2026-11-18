// Itens do prontuário pelo portal: acrescentar e inativar (nada se apaga), como no app.
import type { ProntuarioItem, TipoItem } from '@medicalfield/contratos';
import { Botao, CampoTexto, Dialogo, SeletorSegmentado } from '@medicalfield/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { acrescentarItem, cadastrarProntuario, inativarItem } from '../api/recursos';
import { useAvisar } from '../comum/avisos';
import { descreverErro } from '../comum/formato';

export const TIPO_ITEM: Record<TipoItem, string> = {
  ALERGIA: 'Alergia',
  COMORBIDADE: 'Comorbidade',
  MEDICACAO_CONTINUA: 'Medicação contínua',
};

/** Pessoa sem prontuário: o primeiro item abre o prontuário (o servidor une se já existir). */
export function NovoItem({ pessoaId, semProntuario = false }: { pessoaId: string; semProntuario?: boolean }) {
  const avisar = useAvisar();
  const consultas = useQueryClient();
  const [tipo, setTipo] = useState<TipoItem>('ALERGIA');
  const [descricao, setDescricao] = useState('');
  // Um id por item digitado: repetir após falha de rede não duplica.
  const [id, setId] = useState(() => crypto.randomUUID());
  const [falha, setFalha] = useState<string | null>(null);

  const gravacao = useMutation({
    mutationFn: async () => {
      const item = { id, tipo, descricao: descricao.trim(), registradoEm: new Date().toISOString() };
      if (semProntuario) await cadastrarProntuario({ id: crypto.randomUUID(), pessoaId, itens: [item] });
      else await acrescentarItem({ ...item, pessoaId });
    },
    onSuccess: () => {
      void consultas.invalidateQueries({ queryKey: ['prontuario', pessoaId] });
      void consultas.invalidateQueries({ queryKey: ['prontuarios'] });
      avisar({ tom: 'sucesso', titulo: `${TIPO_ITEM[tipo]} registrada`, descricao: descricao.trim() });
      setDescricao('');
      setId(crypto.randomUUID());
    },
    onError: (erro) => setFalha(descreverErro(erro, 'o item').descricao),
  });

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setFalha(null);
    if (!descricao.trim()) return setFalha('Descreva o item.');
    gravacao.mutate();
  }

  return (
    <form className="grid grid-cols-1 items-end gap-3 border-t border-fio p-3 md:grid-cols-[1fr_auto]" onSubmit={aoEnviar} noValidate aria-label="Acrescentar item ao prontuário">
      <SeletorSegmentado
        className="md:col-span-2 md:max-w-xl"
        rotulo="Acrescentar ao prontuário"
        valor={tipo}
        aoMudar={setTipo}
        opcoes={(Object.keys(TIPO_ITEM) as TipoItem[]).map((t) => ({ valor: t, rotulo: TIPO_ITEM[t] }))}
      />
      <CampoTexto
        rotulo={`Descrição da ${TIPO_ITEM[tipo].toLowerCase()}`}
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        autoComplete="off"
        maxLength={500}
      />
      <Botao type="submit" icone={<Plus aria-hidden />} carregando={gravacao.isPending}>
        Acrescentar
      </Botao>
      {falha ? (
        <p className="mf-campo__erro m-0 md:col-span-2" role="alert">
          <CircleAlert aria-hidden />
          <span>{falha}</span>
        </p>
      ) : null}
    </form>
  );
}

export function ConfirmarInativacao({ pessoaId, item, aoFechar }: { pessoaId: string; item: ProntuarioItem | null; aoFechar: () => void }) {
  const avisar = useAvisar();
  const consultas = useQueryClient();
  const inativacao = useMutation({
    mutationFn: inativarItem,
    onSuccess: () => {
      void consultas.invalidateQueries({ queryKey: ['prontuario', pessoaId] });
      void consultas.invalidateQueries({ queryKey: ['prontuarios'] });
      avisar({ tom: 'sucesso', titulo: 'Item inativado' });
      aoFechar();
    },
    onError: (erro) => avisar({ tom: 'erro', titulo: 'Não foi possível inativar', descricao: descreverErro(erro, 'o item').descricao }),
  });
  return (
    <Dialogo
      aberto={item !== null}
      aoFechar={aoFechar}
      titulo={item ? `Inativar ${TIPO_ITEM[item.tipo].toLowerCase()}?` : ''}
      acoes={
        <>
          <Botao onClick={aoFechar}>Manter ativo</Botao>
          <Botao variante="primario" carregando={inativacao.isPending} onClick={() => item && inativacao.mutate(item.id)}>
            Inativar
          </Botao>
        </>
      }
    >
      <p className="m-0">
        <strong>{item?.descricao}</strong> continua no prontuário, marcado como inativo com a hora de agora.
      </p>
    </Dialogo>
  );
}
