import { calcularResumo } from '@medicalfield/dominio';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Casca } from '../ui/Casca.tsx';
import { useApp, useConsulta } from '../ui/contexto.tsx';
import { EstadoErro, Esqueleto, PainelPassagemDeCaso, SeloSync, Texto } from '../ui/ds/index.ts';
import { formatarMomento, identificacaoCurta } from '../ui/formato.ts';

/** Passagem de caso: o resumo e a MESMA funcao pura que o servidor e o portal usam. */
export function Passagem() {
  const app = useApp();
  const { atendimentoId = '' } = useLocalSearchParams<{ atendimentoId: string }>();
  const dados = useConsulta(async () => {
    const atendimento = await app.atendimentos.obter(atendimentoId);
    if (!atendimento) return null;
    const [pessoa, prontuario, eventos] = await Promise.all([
      app.pessoas.obter(atendimento.pessoaId),
      app.prontuarios.obter(atendimento.pessoaId),
      app.atendimentos.eventos(atendimentoId),
    ]);
    return { atendimento, pessoa, eventos, resumo: calcularResumo(eventos, prontuario.itens) };
  }, [atendimentoId]);

  const voltar = { para: `/atendimentos/${atendimentoId}` as const, rotulo: 'Atendimento' };
  if (dados.erro) {
    return (
      <Casca titulo="Passagem de caso" atual="inicio" voltar={voltar}>
        <EstadoErro titulo="Não foi possível ler o banco local" descricao={dados.erro.message} aoTentarDeNovo={dados.recarregar} />
      </Casca>
    );
  }
  if (dados.dados === undefined) {
    return (
      <Casca titulo="Passagem de caso" atual="inicio" voltar={voltar}>
        <Esqueleto linhas={6} altura={40} />
      </Casca>
    );
  }
  if (dados.dados === null) {
    return (
      <Casca titulo="Passagem de caso" atual="inicio" voltar={{ para: '/', rotulo: 'Início' }}>
        <EstadoErro titulo="Atendimento não encontrado neste aparelho" />
      </Casca>
    );
  }
  const { atendimento, pessoa, eventos, resumo } = dados.dados;
  const naoEnviados = eventos.filter((evento) => evento.envio !== 'confirmado').length + (atendimento.envio !== 'confirmado' ? 1 : 0);

  return (
    <Casca
      titulo="Passagem de caso"
      subtitulo={
        <Texto tamanho="pequeno" tom="tinta2">
          início {formatarMomento(atendimento.iniciadoEm)}
        </Texto>
      }
      atual="inicio"
      voltar={voltar}
    >
      <PainelPassagemDeCaso
        resumo={resumo}
        paciente={{ nome: atendimento.pessoaNome, identificacao: pessoa ? identificacaoCurta(pessoa) || undefined : undefined }}
        queixaPrincipal={atendimento.queixaPrincipal}
      />
      <View role={'status' as 'alert'} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <SeloSync estado={naoEnviados === 0 ? 'confirmado' : 'local'} somenteMarca />
        <Texto style={{ flex: 1 }}>
          {naoEnviados === 0 ? 'Tudo na central.' : `${naoEnviados} ${naoEnviados === 1 ? 'registro só neste aparelho' : 'registros só neste aparelho'}.`}
        </Texto>
      </View>
    </Casca>
  );
}
