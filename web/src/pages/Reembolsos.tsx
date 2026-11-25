import { useEffect, useMemo, useState } from 'react';
import { api, abrirAnexo, FORMAS, STATUS, type Fornecedor, type Reembolso, type Solicitante, type Status } from '../api';
import ReembolsoForm from '../components/ReembolsoForm';
import PainelJanela from '../components/PainelJanela';
import { Modal, avisar, msgErro } from '../components/ui';
import { formatarData, formatarMoeda, mascaraDocumento } from '../formato';
import { carregarJanelas } from '../api';
import { descreverDistancia, formatarDia, proximasJanelas } from '../janelas';

type Filtro = Status | 'todos';

export default function Reembolsos() {
  const [lista, setLista] = useState<Reembolso[]>([]);
  const [solicitantes, setSolicitantes] = useState<Solicitante[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<{ item: Reembolso | null } | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');
  const [proxima, setProxima] = useState<Date | null>(null);

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
  useEffect(() => {
    carregar();
    carregarJanelas().then((r) => setProxima(proximasJanelas(r.janelas, 1)[0] ?? null));
  }, []);

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
      const alvo = `${r.solicitante_nome} ${r.solicitante_email} ${r.fornecedor_nome} ${r.numero_documento} ${r.descricao}`.toLowerCase();
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

      {proxima && (
        <a href="#janelas" className="faixa-janela">
          <span className="faixa-rotulo">Próxima janela de pagamento</span>
          <strong>{formatarDia(proxima)}</strong>
          <span className="faixa-distancia">{descreverDistancia(proxima)}</span>
          <span className="faixa-link">Ver calendário ›</span>
        </a>
      )}

      <div className="filtros">
        <div className="pilulas" role="tablist">
          {(['todos', 'nao_solicitado', 'solicitado', 'pago'] as Filtro[]).map((f) => (
            <button key={f} role="tab" aria-selected={filtro === f} className={`pilula ${filtro === f ? 'ativa' : ''}`} onClick={() => setFiltro(f)}>
              {f === 'todos' ? 'Todos' : STATUS[f]} <span className="contador">{contagem[f]}</span>
            </button>
          ))}
        </div>
        <input className="busca" placeholder="Buscar solicitante, fornecedor, documento…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="total">
          <span className="mudo">Total filtrado</span>
          <strong>{formatarMoeda(total)}</strong>
        </div>
      </div>

      <div className="tabela-caixa">
        <table className="tabela tabela-reembolsos">
          <thead>
            <tr>
              <th>Nome do solicitante</th>
              <th>E-mail do solicitante</th>
              <th>Fornecedor novo</th>
              <th>Nome / Razão social</th>
              <th>CNPJ / CPF</th>
              <th>Nº documento</th>
              <th>Data do pagamento</th>
              <th className="num">Valor</th>
              <th>Descrição</th>
              <th>Forma de pagamento</th>
              <th>Anexos</th>
              <th className="col-acomp col-status">Status</th>
              <th className="col-acomp col-data">Data do reembolso</th>
              <th className="acoes-col" />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((r) => (
              <tr key={r.id}>
                <td className="forte">{r.solicitante_nome}</td>
                <td>{r.solicitante_email}</td>
                <td>{r.fornecedor_novo ? 'Sim' : 'Não'}</td>
                <td>{r.fornecedor_nome}</td>
                <td className="mono">{mascaraDocumento(r.fornecedor_documento)}</td>
                <td>{r.numero_documento}</td>
                <td>{formatarData(r.data_pagamento)}</td>
                <td className="num forte">{formatarMoeda(r.valor_centavos)}</td>
                <td className="descricao" title={r.descricao}>{r.descricao}</td>
                <td>{FORMAS[r.forma_pagamento]}</td>
                <td>
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
                <td className="col-acomp col-status">
                  <select className={`status status-${r.status}`} value={r.status} onChange={(e) => atualizar(r.id, { status: e.target.value as Status })} aria-label="Status">
                    {Object.entries(STATUS).map(([v, rot]) => <option key={v} value={v}>{rot}</option>)}
                  </select>
                </td>
                <td className="col-acomp col-data">
                  <input type="date" className="data-inline" value={r.data_reembolso ?? ''} onChange={(e) => atualizar(r.id, { data_reembolso: e.target.value || null })} aria-label="Data do pagamento do reembolso" />
                </td>
                <td className="acoes">
                  <button className="btn btn-fantasma btn-pequeno" onClick={() => setForm({ item: r })}>Editar</button>
                  <button className="btn btn-fantasma btn-pequeno perigo" onClick={() => excluir(r)}>Excluir</button>
                </td>
              </tr>
            ))}
            {!carregando && !filtrados.length && (
              <tr><td colSpan={14} className="vazio">{lista.length ? 'Nenhuma solicitação com esses filtros.' : 'Nenhuma solicitação registrada ainda.'}</td></tr>
            )}
            {carregando && <tr><td colSpan={14} className="vazio">Carregando…</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal titulo={form?.item ? 'Editar solicitação' : 'Nova solicitação de reembolso'} aberto={!!form} aoFechar={() => setForm(null)} largo extraLargo={!!form && !form.item}>
        {form && (
          <div className={form.item ? '' : 'form-com-janela'}>
            <ReembolsoForm
              inicial={form.item}
              solicitantes={solicitantes}
              fornecedores={fornecedores}
              aoCancelar={() => setForm(null)}
              aoSalvar={() => { setForm(null); carregar(); }}
            />
            {!form.item && <PainelJanela />}
          </div>
        )}
      </Modal>
    </section>
  );
}
