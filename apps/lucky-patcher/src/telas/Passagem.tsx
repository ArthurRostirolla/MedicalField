import { calcularResumo } from '@medicalfield/dominio';
import { EstadoErro, Esqueleto, PainelPassagemDeCaso, SeloSync } from '@medicalfield/ui';
import { useParams } from 'react-router';
import { Casca } from '../ui/Casca.tsx';
import { useApp, useConsulta } from '../ui/contexto.tsx';
import { formatarMomento, identificacaoCurta } from '../ui/formato.ts';

/** Passagem de caso: o resumo e a MESMA funcao pura que o servidor e o portal usam. */
export function Passagem() {
  const app = useApp();
  const { atendimentoId = '' } = useParams();
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

  const voltar = { para: `/atendimentos/${atendimentoId}`, rotulo: 'Atendimento' };
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
        <Esqueleto linhas={6} altura="2.5rem" />
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
        <>
          Ficha <span className="mf-dado">{atendimento.id.slice(0, 8)}</span> · início {formatarMomento(atendimento.iniciadoEm)}
        </>
      }
      atual="inicio"
      voltar={voltar}
    >
      <PainelPassagemDeCaso
        resumo={resumo}
        paciente={{ nome: atendimento.pessoaNome, identificacao: pessoa ? identificacaoCurta(pessoa) || undefined : undefined }}
        queixaPrincipal={atendimento.queixaPrincipal}
      />
      <p className="lp-registrado" role="status">
        <SeloSync estado={naoEnviados === 0 ? 'confirmado' : 'local'} somenteMarca />
        <span>
          {naoEnviados === 0
            ? 'Tudo deste atendimento já está na central.'
            : `${naoEnviados} ${naoEnviados === 1 ? 'registro deste atendimento ainda está' : 'registros deste atendimento ainda estão'} só neste aparelho.`}
        </span>
      </p>
      <p className="lp-nota">Resumo factual do que foi registrado, sem interpretação. Registros retificados não entram.</p>
    </Casca>
  );
}
