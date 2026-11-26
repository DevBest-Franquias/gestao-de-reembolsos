import { useEffect, useMemo, useState } from 'react';
import { api, abrirAnexo, STATUS, type Fornecedor, type Reembolso, type Solicitante, type Status } from '../api';
import ReembolsoForm from '../components/ReembolsoForm';
import { Modal, avisar, msgErro } from '../components/ui';
import { formatarData, formatarMoeda, mascaraDocumento } from '../formato';

type Filtro = Status | 'todos';

export default function Reembolsos() {
  const [lista, setLista] = useState<Reembolso[]>([]);
  const [solicitantes, setSolicitantes] = useState<Solicitante[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<{ item: Reembolso | null } | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');

  const carregar = async () => {
    try {
      const [r, s, f] = await Promise.all([
        api<Reembolso[]>('/reembolsos'),
        api<Solicitante[]>('/solicitantes'),
        api<Fornecedor[]>('/fornecedores'),
      ]);
      setLista(r); setSolicitantes(s); setFornecedores(f);
    } catch (e) { avisar(msgErro(e), 'erro'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { carregar(); }, []);

  const atualizar = async (id: number, mudanca: Partial<Pick<Reembolso, 'status' | 'data_reembolso'>>) => {
    try {
      const r = await api<Reembolso>(`/reembolsos/${id}`, { method: 'PATCH', json: mudanca });
      setLista((l) => l.map((x) => (x.id === id ? { ...x, ...r, anexos: x.anexos } : x)));
    } catch (e) { avisar(msgErro(e), 'erro'); }
  };

  const excluir = async (r: Reembolso) => {
    if (!confirm(`Excluir a solicitação de ${r.solicitante_nome} (${formatarMoeda(r.valor_centavos)})? Os anexos também serão apagados.`)) return;
    try {
      await api(`/reembolsos/${r.id}`, { method: 'DELETE' });
      setLista((l) => l.filter((x) => x.id !== r.id));
      avisar('Solicitação excluída.');
    } catch (e) { avisar(msgErro(e), 'erro'); }
  };

  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = { todos: lista.length, nao_solicitado: 0, solicitado: 0, pago: 0 };
    lista.forEach((r) => { c[r.status]++; });
    return c;
  }, [lista]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const tDig = t.replace(/\D/g, '');
    return lista.filter((r) => {
      if (filtro !== 'todos' && r.status !== filtro) return false;
      if (!t) return true;
      const alvo = `${r.chave_pix ?? ''} ${r.solicitante_nome} ${r.solicitante_email} ${r.solicitante_cpf} ${mascaraDocumento(r.solicitante_cpf || '')} ${r.fornecedor_nome} ${r.numero_documento} ${r.descricao}`.toLowerCase();
      return alvo.includes(t) || (tDig.length >= 3 && r.fornecedor_documento.includes(tDig));
    });
  }, [lista, filtro, busca]);

  const total = filtrados.reduce((s, r) => s + r.valor_centavos, 0);

  return (
    <section>
      <div className="pagina-topo">
        <div>
          <h1>Reembolsos</h1>
          <p className="mudo">Registre as solicitações e acompanhe o andamento de cada uma.</p>
        </div>
        <button className="btn btn-primario" onClick={() => setForm({ item: null })}>Nova solicitação</button>
      </div>

      <div className="filtros">
        <div className="pilulas" role="tablist">
          {(['todos', 'nao_solicitado', 'solicitado', 'pago'] as Filtro[]).map((f) => (
            <button key={f} role="tab" aria-selected={filtro === f} className={`pilula ${filtro === f ? 'ativa' : ''}`} onClick={() => setFiltro(f)}>
              {f === 'todos' ? 'Todos' : STATUS[f]} <span className="contador">{contagem[f]}</span>
            </button>
          ))}
        </div>
        <input className="busca" placeholder="Buscar por solicitante ou descrição" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="total">
          <span className="mudo">Total filtrado</span>
          <strong>{formatarMoeda(total)}</strong>
        </div>
      </div>

      <div className="tabela-caixa">
        <table className="tabela tabela-reembolsos">
          <colgroup>
            <col className="c-nome" />
            <col className="c-venc" />
            <col className="c-valor" />
            <col />
            <col className="c-anexo" />
            <col className="c-status" />
            <col className="c-data" />
            <col className="c-acoes" />
          </colgroup>
          <thead>
            <tr>
              <th>Nome do solicitante</th>
              <th>Data de vencimento</th>
              <th className="num">Valor</th>
              <th>Descrição</th>
              <th>Anexo</th>
              <th className="col-acomp">Status</th>
              <th className="col-acomp">Data do reembolso</th>
              <th className="acoes-col" />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((r) => (
              <tr key={r.id}>
                <td className="forte c-nome-td" data-rotulo="Solicitante">{r.solicitante_nome}</td>
                <td data-rotulo="Vencimento">{formatarData(r.data_pagamento) || <span className="mudo">-</span>}</td>
                <td className="num forte" data-rotulo="Valor">{formatarMoeda(r.valor_centavos)}</td>
                <td className="descricao" data-rotulo="Descrição" title={r.descricao}><span className="duas-linhas">{r.descricao || <span className="mudo">-</span>}</span></td>
                <td data-rotulo="Anexo">
                  {r.anexos.length === 0 ? <span className="mudo">Nenhum</span> : (
                    <div className="anexos-celula">
                      {r.anexos.map((a) => (
                        <button key={a.id} className="link" title={a.nome_arquivo} onClick={() => abrirAnexo(a.id).catch((e) => avisar(msgErro(e), 'erro'))}>
                          {a.nome_arquivo}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                <td className="col-acomp" data-rotulo="Status">
                  <select className={`status status-${r.status}`} value={r.status} onChange={(e) => atualizar(r.id, { status: e.target.value as Status })} aria-label="Status">
                    {Object.entries(STATUS).map(([v, rot]) => <option key={v} value={v}>{rot}</option>)}
                  </select>
                </td>
                <td className="col-acomp" data-rotulo="Data do reembolso">
                  <input type="date" className="data-inline" value={r.data_reembolso ?? ''} onChange={(e) => atualizar(r.id, { data_reembolso: e.target.value || null })} aria-label="Data do reembolso" />
                </td>
                <td className="acoes">
                  <button className="icone-acao" onClick={() => setForm({ item: r })} aria-label="Editar" title="Editar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                    <span className="acao-texto">Editar</span>
                  </button>
                  <button className="icone-acao perigo" onClick={() => excluir(r)} aria-label="Excluir" title="Excluir">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" />
                    </svg>
                    <span className="acao-texto">Excluir</span>
                  </button>
                </td>
              </tr>
            ))}
            {!carregando && !filtrados.length && (
              <tr><td colSpan={8} className="vazio">{lista.length ? 'Nenhuma solicitação com esses filtros.' : 'Nenhuma solicitação registrada ainda.'}</td></tr>
            )}
            {carregando && <tr><td colSpan={8} className="vazio">Carregando…</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal titulo={form?.item ? 'Editar solicitação' : 'Nova solicitação de reembolso'} aberto={!!form} aoFechar={() => setForm(null)} largo>
        {form && (
            <ReembolsoForm
              inicial={form.item}
              solicitantes={solicitantes}
              fornecedores={fornecedores}
              aoCancelar={() => setForm(null)}
              aoSalvar={() => { setForm(null); carregar(); }}
            />
        )}
      </Modal>
    </section>
  );
}
