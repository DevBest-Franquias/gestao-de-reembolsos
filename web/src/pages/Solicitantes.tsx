import { useEffect, useState, type FormEvent } from 'react';
import { api, type Solicitante } from '../api';
import { Modal, avisar, msgErro } from '../components/ui';

export default function Solicitantes() {
  const [lista, setLista] = useState<Solicitante[]>([]);
  const [editando, setEditando] = useState<Partial<Solicitante> | null>(null);
  const [busca, setBusca] = useState('');

  const carregar = () => api<Solicitante[]>('/solicitantes').then(setLista).catch((e) => avisar(msgErro(e), 'erro'));
  useEffect(() => { carregar(); }, []);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    try {
      await api(editando.id ? `/solicitantes/${editando.id}` : '/solicitantes', {
        method: editando.id ? 'PUT' : 'POST',
        json: editando,
      });
      avisar('Solicitante salvo.');
      setEditando(null);
      carregar();
    } catch (e) { avisar(msgErro(e), 'erro'); }
  };

  const excluir = async (s: Solicitante) => {
    if (!confirm(`Excluir ${s.nome}? As solicitações já feitas continuam com o nome e e-mail registrados.`)) return;
    try { await api(`/solicitantes/${s.id}`, { method: 'DELETE' }); carregar(); }
    catch (e) { avisar(msgErro(e), 'erro'); }
  };

  const filtrados = lista.filter((s) => `${s.nome} ${s.email}`.toLowerCase().includes(busca.toLowerCase()));

  return (
    <section>
      <div className="pagina-topo">
        <div>
          <h1>Solicitantes</h1>
          <p className="mudo">Quem pede reembolso. Ao escolher um solicitante na solicitação, nome e e-mail entram sozinhos.</p>
        </div>
        <button className="btn btn-primario" onClick={() => setEditando({ nome: '', email: '' })}>Novo solicitante</button>
      </div>
      <div className="filtros">
        <input className="busca" placeholder="Buscar por nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div className="tabela-caixa">
        <table className="tabela">
          <thead><tr><th>Nome</th><th>E-mail</th><th className="acoes-col" /></tr></thead>
          <tbody>
            {filtrados.map((s) => (
              <tr key={s.id}>
                <td>{s.nome}</td>
                <td>{s.email}</td>
                <td className="acoes">
                  <button className="btn btn-fantasma btn-pequeno" onClick={() => setEditando(s)}>Editar</button>
                  <button className="btn btn-fantasma btn-pequeno perigo" onClick={() => excluir(s)}>Excluir</button>
                </td>
              </tr>
            ))}
            {!filtrados.length && <tr><td colSpan={3} className="vazio">Nenhum solicitante cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal titulo={editando?.id ? 'Editar solicitante' : 'Novo solicitante'} aberto={!!editando} aoFechar={() => setEditando(null)}>
        <form onSubmit={salvar} className="form">
          <label className="campo"><span>Nome</span>
            <input value={editando?.nome ?? ''} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} required autoFocus />
          </label>
          <label className="campo"><span>E-mail</span>
            <input type="email" value={editando?.email ?? ''} onChange={(e) => setEditando({ ...editando, email: e.target.value })} required />
          </label>
          <div className="form-rodape">
            <button type="button" className="btn btn-fantasma" onClick={() => setEditando(null)}>Cancelar</button>
            <button className="btn btn-primario">Salvar</button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
