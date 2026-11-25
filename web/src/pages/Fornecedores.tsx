import { useEffect, useState, type FormEvent } from 'react';
import { api, type Fornecedor } from '../api';
import { Modal, avisar, msgErro } from '../components/ui';
import { documentoValido, mascaraDocumento } from '../formato';

export default function Fornecedores() {
  const [lista, setLista] = useState<Fornecedor[]>([]);
  const [editando, setEditando] = useState<Partial<Fornecedor> | null>(null);
  const [busca, setBusca] = useState('');

  const carregar = () => api<Fornecedor[]>('/fornecedores').then(setLista).catch((e) => avisar(msgErro(e), 'erro'));
  useEffect(() => { carregar(); }, []);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    if (!documentoValido(editando.documento ?? '')) return avisar('CPF ou CNPJ inválido.', 'erro');
    try {
      await api(editando.id ? `/fornecedores/${editando.id}` : '/fornecedores', {
        method: editando.id ? 'PUT' : 'POST',
        json: editando,
      });
      avisar('Fornecedor salvo.');
      setEditando(null);
      carregar();
    } catch (e) { avisar(msgErro(e), 'erro'); }
  };

  const excluir = async (f: Fornecedor) => {
    if (!confirm(`Excluir ${f.nome}? As solicitações já feitas continuam com os dados registrados.`)) return;
    try { await api(`/fornecedores/${f.id}`, { method: 'DELETE' }); carregar(); }
    catch (e) { avisar(msgErro(e), 'erro'); }
  };

  const termo = busca.toLowerCase().replace(/[.\-/]/g, '');
  const filtrados = lista.filter((f) => `${f.nome} ${f.documento}`.toLowerCase().includes(termo));

  return (
    <section>
      <div className="pagina-topo">
        <div>
          <h1>Fornecedores</h1>
          <p className="mudo">Ao escolher um fornecedor na solicitação, razão social e CPF/CNPJ entram sozinhos. Fornecedores novos informados numa solicitação também entram aqui.</p>
        </div>
        <button className="btn btn-primario" onClick={() => setEditando({ nome: '', documento: '' })}>Novo fornecedor</button>
      </div>
      <div className="filtros">
        <input className="busca" placeholder="Buscar por nome ou CPF/CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div className="tabela-caixa">
        <table className="tabela">
          <thead><tr><th>Nome / Razão social</th><th>CPF / CNPJ</th><th className="acoes-col" /></tr></thead>
          <tbody>
            {filtrados.map((f) => (
              <tr key={f.id}>
                <td>{f.nome}</td>
                <td className="mono">{mascaraDocumento(f.documento)}</td>
                <td className="acoes">
                  <button className="btn btn-fantasma btn-pequeno" onClick={() => setEditando({ ...f, documento: mascaraDocumento(f.documento) })}>Editar</button>
                  <button className="btn btn-fantasma btn-pequeno perigo" onClick={() => excluir(f)}>Excluir</button>
                </td>
              </tr>
            ))}
            {!filtrados.length && <tr><td colSpan={3} className="vazio">Nenhum fornecedor cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal titulo={editando?.id ? 'Editar fornecedor' : 'Novo fornecedor'} aberto={!!editando} aoFechar={() => setEditando(null)}>
        <form onSubmit={salvar} className="form">
          <label className="campo"><span>Nome / Razão social</span>
            <input value={editando?.nome ?? ''} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} required autoFocus />
          </label>
          <label className="campo"><span>CPF / CNPJ</span>
            <input inputMode="numeric" value={editando?.documento ?? ''} onChange={(e) => setEditando({ ...editando, documento: mascaraDocumento(e.target.value) })} required />
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
