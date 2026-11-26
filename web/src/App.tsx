import { useEffect, useState } from 'react';
import { api, quandoSessaoExpirar, sessao, type Usuario } from './api';
import { Avisos } from './components/ui';
import Login from './pages/Login';
import Reembolsos from './pages/Reembolsos';
import Solicitantes from './pages/Solicitantes';
import Fornecedores from './pages/Fornecedores';
import Usuarios from './pages/Usuarios';

type Aba = 'reembolsos' | 'solicitantes' | 'fornecedores' | 'usuarios';

const lerAba = (): Aba => {
  const h = window.location.hash.replace('#', '');
  return (['reembolsos', 'solicitantes', 'fornecedores', 'usuarios'] as Aba[]).includes(h as Aba) ? (h as Aba) : 'reembolsos';
};

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<Aba>(lerAba);

  useEffect(() => {
    quandoSessaoExpirar(() => setUsuario(null));
    if (!sessao.token) { setCarregando(false); return; }
    api<Usuario>('/me').then(setUsuario).catch(() => setUsuario(null)).finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    const f = () => setAba(lerAba());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  const sair = async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    sessao.token = '';
    setUsuario(null);
  };

  if (carregando) return <div className="tela-cheia">Carregando…</div>;
  if (!usuario) return (<><Login aoEntrar={(u) => setUsuario(u)} /><Avisos /></>);

  const abas: [Aba, string][] = [
    ['reembolsos', 'Reembolsos'],
    ['solicitantes', 'Solicitantes'],
    ['fornecedores', 'Fornecedores'],
    ...(usuario.papel === 'admin' ? [['usuarios', 'Usuários'] as [Aba, string]] : []),
  ];

  return (
    <div className="app">
      <header className="topo">
        <img src="/logo-best-franquias-branco.png" alt="Best Franquias" className="logo" />
        <nav className="abas">
          {abas.map(([id, rotulo]) => (
            <a key={id} href={`#${id}`} className={aba === id ? 'ativa' : ''}>{rotulo}</a>
          ))}
        </nav>
        <div className="usuario">
          <span>{usuario.nome}</span>
          <button className="btn btn-fantasma-claro" onClick={sair}>Sair</button>
        </div>
      </header>
      <main className="conteudo">
        {aba === 'reembolsos' && <Reembolsos eu={usuario} />}
        {aba === 'solicitantes' && <Solicitantes />}
        {aba === 'fornecedores' && <Fornecedores />}
        {aba === 'usuarios' && usuario.papel === 'admin' && <Usuarios eu={usuario} />}
      </main>
      <Avisos />
    </div>
  );
}
