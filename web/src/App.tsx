import { useEffect, useRef, useState } from 'react';
import { api, quandoSessaoExpirar, sessao, type Usuario } from './api';
import { Avisos, Modal, avisar } from './components/ui';
import { Icone, type NomeIcone } from './components/Icone';
import { useInstalarApp } from './telas';
import Login from './pages/Login';
import Reembolsos from './pages/Reembolsos';
import Solicitantes from './pages/Solicitantes';
import Usuarios from './pages/Usuarios';
import Extensao from './pages/Extensao';

type Aba = 'reembolsos' | 'solicitantes' | 'extensao' | 'usuarios';

const lerAba = (): Aba => {
  const h = window.location.hash.replace('#', '');
  return (['reembolsos', 'solicitantes', 'extensao', 'usuarios'] as Aba[]).includes(h as Aba) ? (h as Aba) : 'reembolsos';
};

const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

/** Explica como instalar no iPhone, onde o navegador não tem botão de instalar */
function InstrucaoIphone({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  return (
    <Modal titulo="Instalar o app no iPhone" aberto={aberto} aoFechar={aoFechar}>
      <ol className="passos">
        <li>Abra este site no <strong>Safari</strong>.</li>
        <li>Toque no botão <strong>Compartilhar</strong> <Icone nome="compartilhar" tamanho={16} /> na barra do Safari.</li>
        <li>Role a lista e toque em <strong>Adicionar à Tela de Início</strong>.</li>
        <li>Toque em <strong>Adicionar</strong>. O ícone "Reembolsos" aparece junto dos seus apps.</li>
      </ol>
    </Modal>
  );
}

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<Aba>(lerAba);
  const [menuAberto, setMenuAberto] = useState(false);
  const [ajudaIphone, setAjudaIphone] = useState(false);
  const [convite, setConvite] = useState(() => {
    try { return localStorage.getItem('reembolsos_convite_app') !== 'fechado'; } catch { return true; }
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const app = useInstalarApp();

  useEffect(() => {
    quandoSessaoExpirar(() => setUsuario(null));
    if (!sessao.token) { setCarregando(false); return; }
    api<Usuario>('/me').then(setUsuario).catch(() => setUsuario(null)).finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    const f = () => { setAba(lerAba()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  // Fecha o menu do usuário ao tocar fora dele
  useEffect(() => {
    if (!menuAberto) return;
    const f = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuAberto(false); };
    document.addEventListener('pointerdown', f);
    return () => document.removeEventListener('pointerdown', f);
  }, [menuAberto]);

  const sair = async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    sessao.token = '';
    setUsuario(null);
  };

  const instalar = async () => {
    setMenuAberto(false);
    if (app.precisaInstrucaoIphone) return setAjudaIphone(true);
    const ok = await app.instalar();
    if (ok) avisar('App instalado. Procure o ícone "Reembolsos" no seu celular.');
  };

  const fecharConvite = () => {
    setConvite(false);
    try { localStorage.setItem('reembolsos_convite_app', 'fechado'); } catch { /* sem storage */ }
  };

  if (carregando) return <div className="tela-cheia">Carregando…</div>;
  if (!usuario) return (<><Login aoEntrar={(u) => setUsuario(u)} /><Avisos /></>);

  const abas: [Aba, string, string, NomeIcone][] = [
    ['reembolsos', 'Reembolsos', 'Reembolsos', 'recibo'],
    ['solicitantes', 'Solicitantes', 'Solicitantes', 'pessoas'],
    ['extensao', 'Extensão do Bitrix', 'Extensão', 'peca'],
    ...(usuario.papel === 'admin' ? [['usuarios', 'Usuários', 'Usuários', 'escudo'] as [Aba, string, string, NomeIcone]] : []),
  ];

  return (
    <div className="app">
      <header className="topo">
        <img src="/logo-best-franquias-branco.png" alt="Best Franquias" className="logo" />
        <nav className="abas" aria-label="Seções">
          {abas.map(([id, rotulo]) => (
            <a key={id} href={`#${id}`} className={aba === id ? 'ativa' : ''} aria-current={aba === id ? 'page' : undefined}>{rotulo}</a>
          ))}
        </nav>
        <div className="usuario" ref={menuRef}>
          <span className="usuario-nome">{usuario.nome}</span>
          <button className="avatar" onClick={() => setMenuAberto((m) => !m)} aria-expanded={menuAberto} aria-haspopup="menu" aria-label="Menu do usuário">
            {iniciais(usuario.nome)}
          </button>
          {menuAberto && (
            <div className="menu-usuario" role="menu">
              <div className="menu-cabecalho">
                <strong>{usuario.nome}</strong>
                <span className="mudo pequeno">{usuario.email}</span>
              </div>
              {app.podeInstalar && (
                <button role="menuitem" onClick={instalar}><Icone nome="celular" tamanho={18} /> Instalar app no celular</button>
              )}
              <button role="menuitem" onClick={sair}><Icone nome="sair" tamanho={18} /> Sair</button>
            </div>
          )}
        </div>
      </header>

      {app.podeInstalar && convite && (
        <div className="convite-app">
          <Icone nome="celular" tamanho={18} />
          <span>Use como app no celular</span>
          <button className="btn btn-primario btn-pequeno" onClick={instalar}>Instalar</button>
          <button className="icone-btn" aria-label="Agora não" onClick={fecharConvite}><Icone nome="fechar" tamanho={16} /></button>
        </div>
      )}

      <main className="conteudo">
        {aba === 'reembolsos' && <Reembolsos eu={usuario} />}
        {aba === 'solicitantes' && <Solicitantes />}
        {aba === 'extensao' && <Extensao />}
        {aba === 'usuarios' && usuario.papel === 'admin' && <Usuarios eu={usuario} />}
      </main>

      {/* Celular: abas fixas embaixo, ao alcance do polegar */}
      <nav className="nav-inferior" aria-label="Seções">
        {abas.map(([id, , curto, icone]) => (
          <a key={id} href={`#${id}`} className={aba === id ? 'ativa' : ''} aria-current={aba === id ? 'page' : undefined}>
            <Icone nome={icone} tamanho={22} />
            <span>{curto}</span>
          </a>
        ))}
      </nav>

      <InstrucaoIphone aberto={ajudaIphone} aoFechar={() => setAjudaIphone(false)} />
      <Avisos />
    </div>
  );
}
