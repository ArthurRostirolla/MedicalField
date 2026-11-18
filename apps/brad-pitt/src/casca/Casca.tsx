import { aplicarTema, Botao, LayoutPortal, type ItemNavegacao, type Tema } from '@medicalfield/ui';
import { ClipboardList, FileCheck, FileText, LogOut, Moon, Pill, ScrollText, Sun, Users } from 'lucide-react';
import { useEffect, useState, type MouseEvent } from 'react';
import { Outlet, useHref, useLocation, useNavigate } from 'react-router';
import { sair } from '../api/cliente';
import { useProfissional } from '../sessao/sessao';
import { lerTema, salvarTema } from './tema';

const TITULOS: Record<string, string> = {
  atendimentos: 'Atendimentos',
  prontuarios: 'Prontuários',
  medicamentos: 'Medicamentos',
  acessos: 'Logs de acesso',
  duplicatas: 'Possíveis duplicatas',
  documentos: 'Verificação de documento',
};

const PAPEL = { ADMIN: 'Administração', PROFISSIONAL: 'Profissional' } as const;

/** Casca das telas autenticadas: índice lateral, cabeçalho com tema e saída, e a tela da rota. */
export function Casca() {
  const profissional = useProfissional();
  const navegar = useNavigate();
  const base = useHref('/');
  const local = useLocation();
  const [tema, setTema] = useState<Tema>(lerTema);

  const partes = local.pathname.split('/').filter(Boolean);
  const atual = (partes[0] === 'auditoria' ? partes[1] : partes[0]) ?? '';
  const titulo = TITULOS[atual] ?? 'Portal';
  useEffect(() => {
    document.title = titulo + ' — MedicalField';
  }, [titulo]);

  const href = (caminho: string) => `${base.replace(/\/$/, '')}${caminho}`;

  const itens: ItemNavegacao[] = [
    { id: 'atendimentos', rotulo: 'Atendimentos', icone: <ClipboardList aria-hidden />, href: href('/atendimentos'), grupo: 'Clínico' },
    { id: 'prontuarios', rotulo: 'Prontuários', icone: <FileText aria-hidden />, href: href('/prontuarios') },
    { id: 'medicamentos', rotulo: 'Medicamentos', icone: <Pill aria-hidden />, href: href('/medicamentos') },
    // Auditoria só existe para ADMIN: o PROFISSIONAL não vê os itens.
    ...(profissional.papel === 'ADMIN'
      ? [
          { id: 'acessos', rotulo: 'Logs de acesso', icone: <ScrollText aria-hidden />, href: href('/auditoria/acessos'), grupo: 'Auditoria' },
          { id: 'duplicatas', rotulo: 'Possíveis duplicatas', icone: <Users aria-hidden />, href: href('/auditoria/duplicatas') },
        ]
      : []),
    // O destino do QR não é uma seção: só aparece no índice enquanto se está nele.
    ...(atual === 'documentos'
      ? [{ id: 'documentos', rotulo: 'Verificação', icone: <FileCheck aria-hidden />, href: href(local.pathname), grupo: 'Documento' }]
      : []),
  ];

  // O índice do design system rende <a href> comuns; aqui o clique vira navegação do roteador
  // (sem recarregar a página, o que apagaria o token em memória). Ctrl/meio-clique seguem nativos.
  function aoClicar(evento: MouseEvent<HTMLDivElement>) {
    const link = (evento.target as HTMLElement).closest('a[href]');
    if (!link || evento.defaultPrevented || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey) return;
    const caminho = link.getAttribute('href') ?? '';
    const raiz = base.replace(/\/$/, '');
    if (!caminho.startsWith(`${raiz}/`)) return;
    evento.preventDefault();
    void navegar(caminho.slice(raiz.length));
  }

  function alternarTema() {
    const novo: Tema = tema === 'escuro' ? 'claro' : 'escuro';
    aplicarTema(novo);
    salvarTema(novo);
    setTema(novo);
  }

  const registro = `${profissional.tipoRegistro} ${profissional.registro}${profissional.uf ? `/${profissional.uf}` : ''}`;

  return (
    <div className="contents" onClick={aoClicar}>
      <LayoutPortal
        titulo={titulo}
        atual={atual}
        itens={itens}
        usuario={
          <>
            <strong>{profissional.nome}</strong>
            <div className="text-tinta-2">
              {registro} · {PAPEL[profissional.papel]}
            </div>
          </>
        }
        acoes={
          <>
            <span className="self-center text-pequeno text-tinta-2 lg:hidden">{profissional.nome}</span>
            <Botao
              variante="fantasma"
              somenteIcone
              aria-label={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}
              title={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}
              icone={tema === 'escuro' ? <Sun aria-hidden /> : <Moon aria-hidden />}
              onClick={alternarTema}
            />
            <Botao icone={<LogOut aria-hidden />} onClick={() => void sair()}>
              Sair
            </Botao>
          </>
        }
      >
        <Outlet />
      </LayoutPortal>
    </div>
  );
}
