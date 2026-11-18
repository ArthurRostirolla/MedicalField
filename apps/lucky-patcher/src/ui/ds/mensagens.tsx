// Mensagem de ajuda ou erro sob um campo, e as props do Select (fora de campos.tsx para nao haver ciclo).
import { CircleAlert } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Icone, Texto } from './base.tsx';
import { useTema } from './tema.tsx';

export function Mensagens({ ajuda, erro }: { ajuda?: ReactNode; erro?: ReactNode }) {
  const { cores } = useTema();
  if (erro) {
    return (
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, alignItems: 'flex-start' }} role="alert">
        <Icone icone={CircleAlert} cor={cores.carmim} tamanho={16} />
        <Texto tamanho="pequeno" tom="carmim" style={{ flex: 1 }}>
          {erro}
        </Texto>
      </View>
    );
  }
  return ajuda ? (
    <Texto tamanho="pequeno" tom="tinta3" style={{ marginTop: 4 }}>
      {ajuda}
    </Texto>
  ) : null;
}

export interface SelectProps {
  rotulo: string;
  ajuda?: ReactNode;
  erro?: ReactNode;
  style?: StyleProp<ViewStyle>;
  opcoes: ReadonlyArray<{ valor: string; rotulo: string }>;
  valor: string;
  aoMudar: (valor: string) => void;
  /** Texto da opcao vazia inicial. */
  vazio?: string;
  disabled?: boolean;
}
