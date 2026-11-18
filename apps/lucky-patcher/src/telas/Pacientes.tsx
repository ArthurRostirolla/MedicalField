import { Botao, CampoTexto, EstadoErro, EstadoVazio, Esqueleto, SeloSync } from '@medicalfield/ui';
import { ChevronRight, Search, UserPlus, UserRoundX, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Casca } from '../ui/Casca.tsx';
import { useApp, useConsulta } from '../ui/contexto.tsx';
import { formatarCpf, formatarMomento, identificacaoCurta } from '../ui/formato.ts';

export function Pacientes() {
  const app = useApp();
  const [busca, setBusca] = useState('');
  const pessoas = useConsulta(() => app.pessoas.buscar(busca), [busca]);
  const termo = busca.trim();

  return (
    <Casca titulo="Pacientes" subtitulo="Escolha ou crie o paciente para iniciar o atendimento" atual="pacientes">
      <CampoTexto
        rotulo="Buscar por nome ou CPF"
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        autoComplete="off"
        enterKeyHint="search"
        sufixo={
          busca ? (
            <Botao variante="fantasma" somenteIcone aria-label="Limpar busca" icone={<X aria-hidden />} onClick={() => setBusca('')} />
          ) : (
            <Search aria-hidden style={{ width: '1.25rem', height: '1.25rem' }} />
          )
        }
      />
      <div className="lp-acoes">
        <Link className="mf-botao mf-botao--primario" to={termo ? `/pacientes/novo?nome=${encodeURIComponent(termo)}` : '/pacientes/novo'}>
          <UserPlus aria-hidden />
          Novo paciente
        </Link>
        <Link className="mf-botao" to="/pacientes/novo?naoIdentificado=1">
          <UserRoundX aria-hidden />
          Não identificado
        </Link>
      </div>

      <section aria-label="Resultado da busca" aria-busy={pessoas.carregando}>
        <div className="lp-cabecalho">
          <h2 className="mf-secao__titulo">{termo ? 'Encontrados' : 'Mais recentes'}</h2>
          {pessoas.dados ? <span className="mf-rotulo">{pessoas.dados.length === 50 ? '50 primeiros' : pessoas.dados.length}</span> : null}
        </div>
        {pessoas.erro ? (
          <EstadoErro titulo="Não foi possível ler o banco local" descricao={pessoas.erro.message} aoTentarDeNovo={pessoas.recarregar} />
        ) : !pessoas.dados ? (
          <Esqueleto linhas={4} altura="2.5rem" />
        ) : pessoas.dados.length === 0 ? (
          termo ? (
            <EstadoVazio
              titulo={`Ninguém com “${termo}” neste aparelho`}
              descricao="A busca só enxerga o que já foi baixado ou criado aqui. Se for um paciente novo, crie o cadastro agora; se já existir na central, ele é sinalizado como possível duplicata, nunca recusado."
            />
          ) : (
            <EstadoVazio
              titulo="Nenhum paciente neste aparelho"
              descricao="Sincronize no Início para baixar os cadastros, ou crie um paciente novo. Dá para atender sem ter sincronizado."
            />
          )
        ) : (
          <ul className="lp-lista">
            {pessoas.dados.map((pessoa) => (
              <li key={pessoa.id}>
                <Link className="lp-linha" to={`/pacientes/${pessoa.id}`}>
                  <span className="lp-linha__texto">
                    <span className="lp-linha__titulo">{pessoa.nome}</span>
                    <span className="lp-linha__apoio">
                      {[
                        identificacaoCurta(pessoa),
                        formatarCpf(pessoa.cpf) ? `CPF ${formatarCpf(pessoa.cpf)}` : null,
                        pessoa.naoIdentificada ? pessoa.descricaoIdentificacao : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || `Cadastrado em ${formatarMomento(pessoa.criadoEm)}`}
                    </span>
                  </span>
                  {pessoa.envio !== 'confirmado' ? <SeloSync estado={pessoa.envio} /> : null}
                  <ChevronRight aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Casca>
  );
}
