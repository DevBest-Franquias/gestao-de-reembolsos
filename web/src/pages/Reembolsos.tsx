import { useEffect, useMemo, useState } from 'react';
import { api, abrirAnexo, STATUS, type Usuario, type Reembolso, type Solicitante, type Status } from '../api';
import ReembolsoForm from '../components/ReembolsoForm';
import { Modal, avisar, msgErro } from '../components/ui';
import { Icone } from '../components/Icone';
import { Info, LinhaExpansivel } from '../components/Expansivel';
import { formatarData, formatarMoeda, mascaraDocumento } from '../formato';
import { TELA, useTelaMinima } from '../telas';

type Filtro = Status | 'todos';
const BITRIX = 'https://hubsmart.bitrix24.site/solicitacao_pag_investidas/';

const tituloAnexo = (categoria: string, nome: string) =>
  `${categoria === 'cobranca' ? 'Print de cobrança / comprovante de Pix' : 'Nota fiscal / documento de pagamento'}: ${nome}`;

export default function Reembolsos({ eu }: { eu: Usuario }) {
  const [lista, setLista] = useState<Reembolso[]>([]);
  const [solicitantes, setSolicitantes] = useState<Solicitante[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<{ item: Reembolso | null } | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');
  const [filtroSolicitante, setFiltroSolicitante] = useState('');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [gerando, setGerando] = useState<number | null>(null);
  const tabela = useTelaMinima(TELA.desktop); // tabela só em tela grande; abaixo disso, lista que expande ao toque

  // Atalho do app instalado ("Nova solicitação" no ícone) abre o formulário direto
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('nova') === '1') {
      setForm({ item: null });
      history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
  }, []);

  const baixarPdf = async (r: Reembolso) => {
    setGerando(r.id);
    try {
      const { gerarPdfCombinado } = await import('../pdfCombinado');
      await gerarPdfCombinado(r);
    } catch (e) {
      avisar(msgErro(e), 'erro');
    } finally {
      setGerando(null);
    }
  };

  const carregar = async () => {
    try {
      const [r, s] = await Promise.all([api<Reembolso[]>('/reembolsos'), api<Solicitante[]>('/solicitantes')]);
      setLista(r); setSolicitantes(s);
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

  const nomesSolicitantes = useMemo(
    () => [...new Set(lista.map((r) => r.solicitante_nome))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [lista],
  );

  const contagem = useMemo(() => {
    const base = filtroSolicitante ? lista.filter((r) => r.solicitante_nome === filtroSolicitante) : lista;
    const c: Record<Filtro, number> = { todos: base.length, nao_solicitado: 0, solicitado: 0, pago: 0 };
    base.forEach((r) => { c[r.status]++; });
    return c;
  }, [lista, filtroSolicitante]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const tDig = t.replace(/\D/g, '');
    return lista.filter((r) => {
      if (filtro !== 'todos' && r.status !== filtro) return false;
      if (filtroSolicitante && r.solicitante_nome !== filtroSolicitante) return false;
      if (!t) return true;
      const alvo = `${r.chave_pix ?? ''} ${r.solicitante_nome} ${r.solicitante_email} ${r.solicitante_cpf} ${mascaraDocumento(r.solicitante_cpf || '')} ${r.fornecedor_nome} ${r.numero_documento} ${r.descricao}`.toLowerCase();
      return alvo.includes(t) || (tDig.length >= 3 && r.fornecedor_documento.includes(tDig));
    });
  }, [lista, filtro, filtroSolicitante, busca]);

  const total = filtrados.reduce((s, r) => s + r.valor_centavos, 0);
  const filtrosAtivos = [filtroSolicitante, filtro !== 'todos' ? filtro : '', busca.trim()].filter(Boolean).length;
  const limpar = () => { setFiltroSolicitante(''); setFiltro('todos'); setBusca(''); };

  /* ---------- Peças usadas na tabela e na lista ---------- */
  const anexosDe = (r: Reembolso) =>
    r.anexos.length === 0 ? <span className="mudo">Nenhum</span> : (
      <div className="anexos-celula">
        {r.anexos.map((a, i) => (
          <button key={a.id} className="link" title={tituloAnexo(a.categoria, a.nome_arquivo)} onClick={() => abrirAnexo(a.id).catch((e) => avisar(msgErro(e), 'erro'))}>
            {r.anexos.length > 1 ? `Abrir ${i + 1}` : 'Abrir'}
          </button>
        ))}
      </div>
    );

  const statusDe = (r: Reembolso) => (
    <select className={`status status-${r.status}`} value={r.status} onChange={(e) => atualizar(r.id, { status: e.target.value as Status })} aria-label="Status">
      {Object.entries(STATUS).map(([v, rot]) => <option key={v} value={v}>{rot}</option>)}
    </select>
  );

  const dataReembolsoDe = (r: Reembolso) => (
    <input type="date" className="data-inline" value={r.data_reembolso ?? ''} onChange={(e) => atualizar(r.id, { data_reembolso: e.target.value || null })} aria-label="Data do reembolso" />
  );

  const acoesDe = (r: Reembolso) => (
    <>
      <button className="icone-acao" onClick={() => baixarPdf(r)} disabled={gerando !== null} aria-label="Baixar PDF com os comprovantes" title="Baixar PDF com nota fiscal, comprovante de cobrança/Pix e imagem do cartão">
        {gerando === r.id ? <span className="girando" aria-hidden="true" /> : <Icone nome="baixar" tamanho={18} />}
        <span className="acao-texto">{gerando === r.id ? 'Gerando…' : 'PDF'}</span>
      </button>
      <button className="icone-acao" onClick={() => setForm({ item: r })} aria-label="Editar" title="Editar">
        <Icone nome="editar" tamanho={18} />
        <span className="acao-texto">Editar</span>
      </button>
      <button className="icone-acao perigo" onClick={() => excluir(r)} aria-label="Excluir" title="Excluir">
        <Icone nome="lixeira" tamanho={18} />
        <span className="acao-texto">Excluir</span>
      </button>
    </>
  );

  const vazio = carregando ? 'Carregando…' : lista.length ? 'Nenhuma solicitação com esses filtros.' : 'Nenhuma solicitação registrada ainda.';

  return (
    <section>
      <div className="pagina-topo">
        <div className="pagina-titulo">
          <h1>Reembolsos</h1>
          <p className="mudo">Registre as solicitações e acompanhe o andamento de cada uma.</p>
        </div>
        <div className="topo-acoes">
          <a className="btn btn-contorno" href={BITRIX} target="_blank" rel="noopener noreferrer" title="Abrir o formulário do Bitrix">
            <Icone nome="externo" tamanho={16} /> <span>Link do bitrix</span>
          </a>
          <button className="btn btn-primario acao-principal" aria-label="Nova solicitação" onClick={() => setForm({ item: null })}>
            <Icone nome="mais" tamanho={20} /> <span>Nova solicitação</span>
          </button>
        </div>
      </div>

      {/* Celular: resumo + botão que abre os filtros */}
      <div className="resumo-filtros">
        <div>
          <strong>{formatarMoeda(total)}</strong>
          <span className="mudo pequeno"> · {filtrados.length} {filtrados.length === 1 ? 'solicitação' : 'solicitações'}</span>
        </div>
        <button className={`btn btn-contorno btn-pequeno ${filtrosAtivos ? 'com-filtro' : ''}`} onClick={() => setFiltrosAbertos((a) => !a)} aria-expanded={filtrosAbertos}>
          <Icone nome="filtro" tamanho={16} /> Filtros{filtrosAtivos ? ` (${filtrosAtivos})` : ''}
        </button>
      </div>

      <div className={`filtros ${filtrosAbertos ? 'aberto' : ''}`}>
        <label className="filtro-campo">
          <span>Solicitante</span>
          <select value={filtroSolicitante} onChange={(e) => setFiltroSolicitante(e.target.value)}>
            <option value="">Todos os solicitantes</option>
            {nomesSolicitantes.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="filtro-campo">
          <span>Status</span>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
            {(['todos', 'nao_solicitado', 'solicitado', 'pago'] as Filtro[]).map((f) => (
              <option key={f} value={f}>{f === 'todos' ? 'Todos os status' : STATUS[f]} ({contagem[f]})</option>
            ))}
          </select>
        </label>
        <label className="filtro-campo filtro-busca">
          <span>Descrição</span>
          <input className="busca" type="search" placeholder="Buscar na descrição" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        {filtrosAtivos > 0 && (
          <button type="button" className="btn btn-fantasma btn-pequeno limpar-filtros" onClick={limpar}>Limpar filtros</button>
        )}
        <div className="total">
          <span className="mudo">Total filtrado</span>
          <strong>{formatarMoeda(total)}</strong>
        </div>
      </div>

      {tabela ? (
        <div className="tabela-caixa">
          <table className="tabela tabela-reembolsos">
            <colgroup>
              <col className="c-nome" /><col className="c-venc" /><col className="c-valor" /><col />
              <col className="c-anexo" /><col className="c-status" /><col className="c-data" /><col className="c-acoes" />
            </colgroup>
            <thead>
              <tr>
                <th>Nome do solicitante</th>
                <th>Data de vencimento</th>
                <th className="num">Valor</th>
                <th>Descrição</th>
                <th>Anexo</th>
                <th>Status</th>
                <th>Data do reembolso</th>
                <th className="acoes-col" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((r) => (
                <tr key={r.id}>
                  <td className="forte">{r.solicitante_nome}</td>
                  <td>{formatarData(r.data_pagamento) || <span className="mudo">-</span>}</td>
                  <td className="num forte">{formatarMoeda(r.valor_centavos)}</td>
                  <td className="descricao" title={r.descricao}><span className="duas-linhas">{r.descricao || <span className="mudo">-</span>}</span></td>
                  <td>{anexosDe(r)}</td>
                  <td>{statusDe(r)}</td>
                  <td>{dataReembolsoDe(r)}</td>
                  <td className="acoes">{acoesDe(r)}</td>
                </tr>
              ))}
              {!filtrados.length && <tr><td colSpan={8} className="vazio">{vazio}</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="lista-exp">
          {filtrados.map((r) => (
            <LinhaExpansivel
              key={r.id}
              resumo={
                <>
                  <strong className="linha-titulo">{r.solicitante_nome}</strong>
                  <span className="linha-sub">{r.descricao || 'Sem descrição'}</span>
                </>
              }
              lateral={
                <>
                  <strong className="linha-valor">{formatarMoeda(r.valor_centavos)}</strong>
                  <span className={`selo selo-status selo-${r.status}`}>{STATUS[r.status]}</span>
                </>
              }
            >
              <div className="info-grade">
                <Info rotulo="Vencimento">{formatarData(r.data_pagamento) || '-'}</Info>
                <Info rotulo="Anexos">{anexosDe(r)}</Info>
                {r.descricao && <Info rotulo="Descrição" largo>{r.descricao}</Info>}
                <label className="info"><span className="info-rotulo">Status</span>{statusDe(r)}</label>
                <label className="info"><span className="info-rotulo">Data do reembolso</span>{dataReembolsoDe(r)}</label>
              </div>
              <div className="linha-acoes">{acoesDe(r)}</div>
            </LinhaExpansivel>
          ))}
          {!filtrados.length && <li className="vazio-lista">{vazio}</li>}
        </ul>
      )}

      <Modal titulo={form?.item ? 'Editar solicitação' : 'Nova solicitação de reembolso'} aberto={!!form} aoFechar={() => setForm(null)} largo={!!form?.item}>
        {form && (
          <ReembolsoForm
            eu={eu}
            inicial={form.item}
            solicitantes={solicitantes}
            aoCancelar={() => setForm(null)}
            aoSalvar={() => { setForm(null); carregar(); }}
          />
        )}
      </Modal>
    </section>
  );
}
