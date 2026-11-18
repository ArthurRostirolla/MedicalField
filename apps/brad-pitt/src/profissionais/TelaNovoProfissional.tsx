import { profissionalEntradaSchema, type Papel, type TipoRegistro } from '@medicalfield/contratos';
import { Botao, CampoTexto, Secao, Select } from '@medicalfield/ui';
import { useMutation } from '@tanstack/react-query';
import { CircleAlert, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErroApi } from '../api/cliente';
import { cadastrarProfissional } from '../api/recursos';
import { useAvisar } from '../comum/avisos';
import { descreverErro } from '../comum/formato';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

const TIPOS: { valor: TipoRegistro; rotulo: string }[] = [
  { valor: 'CRM', rotulo: 'CRM (medicina)' },
  { valor: 'COREN', rotulo: 'COREN (enfermagem)' },
  { valor: 'SOCORRISTA', rotulo: 'Socorrista' },
];

const PAPEIS: { valor: Papel; rotulo: string }[] = [
  { valor: 'PROFISSIONAL', rotulo: 'Profissional' },
  { valor: 'ADMIN', rotulo: 'Administração (vê auditoria e cadastra)' },
];

type Erros = Partial<Record<string, string>>;

/** Cadastro de profissional pelo ADMIN: a senha inicial é definida aqui e repassada à pessoa. */
export function TelaNovoProfissional() {
  const avisar = useAvisar();
  const [nome, setNome] = useState('');
  const [tipoRegistro, setTipoRegistro] = useState<TipoRegistro>('CRM');
  const [registro, setRegistro] = useState('');
  const [uf, setUf] = useState('RS');
  const [papel, setPapel] = useState<Papel>('PROFISSIONAL');
  const [senha, setSenha] = useState('');
  const [erros, setErros] = useState<Erros>({});
  const [falha, setFalha] = useState<string | null>(null);

  const comUf = tipoRegistro !== 'SOCORRISTA';

  const criacao = useMutation({
    mutationFn: cadastrarProfissional,
    onSuccess: (p) => {
      avisar({
        tom: 'sucesso',
        titulo: 'Profissional cadastrado',
        descricao: `${p.nome} já pode entrar com ${p.tipoRegistro} ${p.registro}${p.uf ? `/${p.uf}` : ''}.`,
      });
      setNome('');
      setRegistro('');
      setSenha('');
    },
    onError: (erro) => {
      if (erro instanceof ErroApi && erro.codigo === 'VALIDACAO' && erro.detalhes.length) {
        setErros(Object.fromEntries(erro.detalhes.map((d) => [d.campo, d.mensagem])));
        return;
      }
      setFalha(descreverErro(erro, 'o cadastro').descricao);
    },
  });

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErros({});
    setFalha(null);
    const entrada = profissionalEntradaSchema.safeParse({
      nome,
      tipoRegistro,
      registro,
      ...(comUf && { uf }),
      papel,
      senha,
    });
    if (!entrada.success) {
      return setErros(Object.fromEntries(entrada.error.issues.map((i) => [String(i.path[0]), i.message])));
    }
    criacao.mutate(entrada.data);
  }

  return (
    <Secao
      titulo="Novo profissional"
      descricao="Quem for cadastrado aqui entra no app e no portal com o registro e a senha definidos abaixo."
    >
      <form className="grid max-w-xl grid-cols-1 gap-3" onSubmit={aoEnviar} noValidate>
        <CampoTexto rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" erro={erros.nome} />
        <Select
          rotulo="Tipo de registro"
          value={tipoRegistro}
          onChange={(e) => setTipoRegistro(e.target.value as TipoRegistro)}
          opcoes={TIPOS}
          erro={erros.tipoRegistro}
        />
        <div className="mf-grade-campos" style={{ gridTemplateColumns: comUf ? 'minmax(0, 1fr) 6.5rem' : 'minmax(0, 1fr)' }}>
          <CampoTexto
            rotulo="Número do registro"
            value={registro}
            onChange={(e) => setRegistro(e.target.value)}
            autoComplete="off"
            erro={erros.registro}
          />
          {comUf ? (
            <Select
              rotulo="UF"
              value={uf}
              onChange={(e) => setUf(e.target.value)}
              opcoes={UFS.map((sigla) => ({ valor: sigla, rotulo: sigla }))}
              erro={erros.uf}
            />
          ) : null}
        </div>
        <Select rotulo="Papel" value={papel} onChange={(e) => setPapel(e.target.value as Papel)} opcoes={PAPEIS} erro={erros.papel} />
        <CampoTexto
          rotulo="Senha inicial"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="new-password"
          erro={erros.senha}
        />
        {falha ? (
          <p className="mf-campo__erro m-0" role="alert">
            <CircleAlert aria-hidden />
            <span>{falha}</span>
          </p>
        ) : null}
        <div className="flex justify-end">
          <Botao type="submit" variante="primario" icone={<UserPlus aria-hidden />} carregando={criacao.isPending}>
            Cadastrar
          </Botao>
        </div>
      </form>
    </Secao>
  );
}
