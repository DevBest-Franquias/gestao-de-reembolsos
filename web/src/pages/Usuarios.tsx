import { useEffect, useState, type FormEvent } from 'react';
import { api, type Usuario } from '../api';
import { Modal, avisar, msgErro } from '../components/ui';

type Novo = { nome: string; email: string; senha: string; papel: 'admin' | 'usuario' };

export default function Usuarios({ eu }: { eu: Usuario }) {
  const [lista, setLista] = useState<Usuario[]>([]);
  const [novo, setNovo] = useState<Novo | null>(null);

  const carregar = () => api<Usuario[]>('/usuarios').then(setLista).catch((e) => avisar(msgErro(e), 'erro'));
  useEffect(() => { carregar(); }, []);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/usuarios', { method: 'POST', json: novo });
      avisar('Usuário criado. Passe o e-mail e a senha para a pessoa.');
      setNovo(null);
      carregar();
    } catch (e) { avisar(msgErro(e), 'erro'); }
  };

  const excluir = async (u: Usuario) => {
    if (!confirm(`Remover o acesso de ${u.nome}?`)) return;
    try { await api(`/usuarios/${u.id}`, { method: 'DELETE' }); carregar(); }
    catch (e) { avisar(msgErro(e), 'erro'); }
  };

  return (
    <section>
      <div className="pagina-topo">
        <div>
          <h1>Usuários</h1>
          <p className="mudo">Quem pode entrar no sistema. Administradores também gerenciam esta lista.</p>
        </div>
        <button className="btn btn-primario" onClick={() => setNovo({ nome: '', email: '', senha: '', papel: 'usuario' })}>Novo usuário</button>
      </div>
      <div className="tabela-caixa">
        <table className="tabela">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th className="acoes-col" /></tr></thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id}>
                <td>{u.nome}</td>
                <td>{u.email}</td>
                <td><span className={`selo ${u.papel === 'admin' ? 'selo-roxo' : 'selo-cinza'}`}>{u.papel === 'admin' ? 'Administrador' : 'Usuário'}</span></td>
                <td className="acoes">
                  {u.id !== eu.id && <button className="btn btn-fantasma btn-pequeno perigo" onClick={() => excluir(u)}>Remover</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal titulo="Novo usuário" aberto={!!novo} aoFechar={() => setNovo(null)}>
        {novo && (
          <form onSubmit={salvar} className="form">
            <label className="campo"><span>Nome</span>
              <input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} required autoFocus />
            </label>
            <label className="campo"><span>E-mail</span>
              <input type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} required />
            </label>
            <label className="campo"><span>Senha inicial</span>
              <input type="text" value={novo.senha} minLength={8} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} required />
            </label>
            <label className="campo"><span>Perfil</span>
              <select value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value as Novo['papel'] })}>
                <option value="usuario">Usuário</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            <div className="form-rodape">
              <button type="button" className="btn btn-fantasma" onClick={() => setNovo(null)}>Cancelar</button>
              <button className="btn btn-primario">Criar usuário</button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
