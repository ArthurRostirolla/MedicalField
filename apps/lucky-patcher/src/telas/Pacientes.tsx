import { useRouter } from 'expo-router';
import { Search, UserPlus, UserRoundX, X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { Casca } from '../ui/Casca.tsx';
import { useApp, useConsulta } from '../ui/contexto.tsx';
import { Botao, CampoTexto, EstadoErro, EstadoVazio, Esqueleto, Icone, useTema } from '../ui/ds/index.ts';
import { formatarCpf, formatarMomento, identificacaoCurta } from '../ui/formato.ts';
import { Cabecalho, LinhaLista, Lista } from './Inicio.tsx';

export function Pacientes() {
  const app = useApp();
  const roteador = useRouter();
  const { cores } = useTema();
  const [busca, setBusca] = useState('');
  const pessoas = useConsulta(() => app.pessoas.buscar(busca), [busca]);
  const termo = busca.trim();

  return (
    <Casca titulo="Pacientes" atual="pacientes">
      <CampoTexto
        rotulo="Buscar por nome ou CPF"
        inputMode="search"
        value={busca}
        onChangeText={setBusca}
        autoComplete="off"
        autoCorrect={false}
        enterKeyHint="search"
        sufixo={
          busca ? (
            <Botao variante="fantasma" somenteIcone aria-label="Limpar busca" icone={X} onPress={() => setBusca('')} />
          ) : (
            <Icone icone={Search} cor={cores.tinta3} />
          )
        }
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Botao
          variante="primario"
          icone={UserPlus}
          role="link"
          style={{ flexGrow: 1 }}
          onPress={() => roteador.navigate(termo ? { pathname: '/pacientes/novo', params: { nome: termo } } : '/pacientes/novo')}
        >
          Novo paciente
        </Botao>
        <Botao
          icone={UserRoundX}
          role="link"
          style={{ flexGrow: 1 }}
          onPress={() => roteador.navigate({ pathname: '/pacientes/novo', params: { naoIdentificado: '1' } })}
        >
          Não identificado
        </Botao>
      </View>

      <View role="region" aria-label="Resultado da busca" aria-busy={pessoas.carregando}>
        <Cabecalho
          titulo={termo ? 'Encontrados' : 'Mais recentes'}
          contagem={pessoas.dados ? (pessoas.dados.length === 50 ? '50 primeiros' : pessoas.dados.length) : undefined}
        />
        {pessoas.erro ? (
          <EstadoErro titulo="Não foi possível ler o banco local" descricao={pessoas.erro.message} aoTentarDeNovo={pessoas.recarregar} />
        ) : !pessoas.dados ? (
          <Esqueleto linhas={4} altura={40} />
        ) : pessoas.dados.length === 0 ? (
          termo ? (
            <EstadoVazio titulo={`Ninguém com “${termo}” neste aparelho`} />
          ) : (
            <EstadoVazio titulo="Nenhum paciente neste aparelho" />
          )
        ) : (
          <Lista>
            {pessoas.dados.map((pessoa) => (
              <LinhaLista
                key={pessoa.id}
                para={`/pacientes/${pessoa.id}`}
                titulo={pessoa.nome}
                apoio={
                  [
                    identificacaoCurta(pessoa),
                    formatarCpf(pessoa.cpf) ? `CPF ${formatarCpf(pessoa.cpf)}` : null,
                    pessoa.naoIdentificada ? pessoa.descricaoIdentificacao : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || `Cadastrado em ${formatarMomento(pessoa.criadoEm)}`
                }
                envio={pessoa.envio}
              />
            ))}
          </Lista>
        )}
      </View>
    </Casca>
  );
}
