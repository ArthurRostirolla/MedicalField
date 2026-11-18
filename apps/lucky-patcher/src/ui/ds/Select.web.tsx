// Select na web: o <select> do proprio navegador (teclado, leitor de tela e lista do sistema).
import { ChevronDown } from 'lucide-react-native';
import { View } from 'react-native';
import { Icone, Rotulo } from './base.tsx';
import { Mensagens, type SelectProps } from './mensagens.tsx';
import { useTema } from './tema.tsx';
import { MEDIDA } from './tokens.ts';

export function Select({ rotulo, ajuda, erro, opcoes, valor, aoMudar, vazio, disabled, style }: SelectProps) {
  const { cores } = useTema();
  return (
    <View style={style}>
      <View
        style={{
          borderWidth: 1,
          borderColor: erro ? cores.carmim : cores.fioForte,
          borderRadius: MEDIDA.raio,
          backgroundColor: disabled ? cores.papel2 : cores.papel,
          paddingHorizontal: MEDIDA.recuo,
          paddingTop: 6,
          paddingBottom: 7,
        }}
      >
        <Rotulo>{rotulo}</Rotulo>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <select
            aria-label={rotulo}
            aria-invalid={erro ? true : undefined}
            disabled={disabled}
            value={valor}
            onChange={(evento) => aoMudar(evento.target.value)}
            style={{
              flex: 1,
              minHeight: MEDIDA.alvo - 24,
              border: 0,
              padding: 0,
              background: 'transparent',
              color: cores.tinta,
              fontSize: MEDIDA.corpo,
              fontWeight: 500,
              appearance: 'none',
              fontFamily: 'inherit',
            }}
          >
            {vazio !== undefined ? <option value="">{vazio}</option> : null}
            {opcoes.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
          <Icone icone={ChevronDown} cor={cores.tinta2} />
        </View>
      </View>
      <Mensagens ajuda={ajuda} erro={erro} />
    </View>
  );
}
