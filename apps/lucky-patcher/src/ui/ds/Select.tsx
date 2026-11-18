// Select no aparelho: campo que abre uma lista em folha (Modal). Na web vale Select.web.tsx.
import { Check, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { Icone, Rotulo, Texto, Titulo } from './base.tsx';
import { Mensagens, type SelectProps } from './mensagens.tsx';
import { useTema } from './tema.tsx';
import { MEDIDA } from './tokens.ts';

export function Select({ rotulo, ajuda, erro, opcoes, valor, aoMudar, vazio, disabled, style }: SelectProps) {
  const { cores } = useTema();
  const [aberto, setAberto] = useState(false);
  const lista = vazio !== undefined ? [{ valor: '', rotulo: vazio }, ...opcoes] : opcoes;
  const atual = lista.find((opcao) => opcao.valor === valor);
  return (
    <View style={style}>
      <Pressable
        role="combobox"
        aria-label={rotulo}
        aria-expanded={aberto}
        disabled={disabled}
        onPress={() => setAberto(true)}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: MEDIDA.alvo - 24 }}>
          <Texto style={{ flex: 1 }} tom={atual?.valor ? 'tinta' : 'tinta3'}>
            {atual?.rotulo ?? ''}
          </Texto>
          <Icone icone={ChevronDown} cor={cores.tinta2} />
        </View>
      </Pressable>
      <Mensagens ajuda={ajuda} erro={erro} />
      <Modal visible={aberto} transparent animationType="slide" onRequestClose={() => setAberto(false)}>
        <Pressable style={{ flex: 1, backgroundColor: cores.veu }} onPress={() => setAberto(false)} aria-label="Fechar lista" />
        <View style={{ maxHeight: '70%', backgroundColor: cores.papel, borderTopLeftRadius: MEDIDA.raioSobreposicao, borderTopRightRadius: MEDIDA.raioSobreposicao }}>
          <Titulo nivel={2} style={{ padding: MEDIDA.recuo }}>
            {rotulo}
          </Titulo>
          <FlatList
            data={lista}
            keyExtractor={(opcao) => opcao.valor}
            renderItem={({ item }) => (
              <Pressable
                role="option"
                aria-selected={item.valor === valor}
                onPress={() => {
                  aoMudar(item.valor);
                  setAberto(false);
                }}
                style={{
                  minHeight: MEDIDA.alvo,
                  paddingHorizontal: MEDIDA.recuo,
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderTopWidth: 1,
                  borderTopColor: cores.fio,
                }}
              >
                <Texto style={{ flex: 1 }}>{item.rotulo}</Texto>
                {item.valor === valor ? <Icone icone={Check} /> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}
