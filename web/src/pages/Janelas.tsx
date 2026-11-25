import { useEffect, useMemo, useState } from 'react';
import { api, carregarJanelas, carregarLinks, guardarJanelas, guardarLinks, type Janela, type LinkUtil, type Usuario } from '../api';
import { LinksUteis } from '../components/LinksUteis';
import { Modal, avisar, msgErro } from '../components/ui';
import { FERIADOS, MESES, SEMANA_CURTA, chaveMes, descreverDistancia, formatarDia, hoje, proximasJanelas } from '../janelas';

export default function Janelas({ eu }: { eu: Usuario }) {
  const admin = eu.papel === 'admin';
  const [janelas, setJanelas] = useState<Janela[]>([]);
  const [links, setLinks] = useState<LinkUtil[]>([]);
  const [offline, setOffline] = useState(false);
  const [ref, setRef] = useState(() => { const h = hoje(); return { ano: h.getFullYear(), mes: h.getMonth() }; });
  const [editando, setEditando] = useState<{ dias: number[]; observacao: string } | null>(null);
  const [editLinks, setEditLinks] = useState<LinkUtil[] | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarJanelas().then((r) => {
      setJanelas(r.janelas);
      setOffline((o) => o || r.offline);
      // Abre no mês da próxima janela, se houver uma mais adiante
      const prox = proximasJanelas(r.janelas, 1)[0];
      const h = hoje();
      if (prox && (prox.getFullYear() !== h.getFullYear() || prox.getMonth() !== h.getMonth()) && !r.janelas.some((j) => j.mes === chaveMes(h.getFullYear(), h.getMonth()))) {
        setRef({ ano: prox.getFullYear(), mes: prox.getMonth() });
      }
    });
    carregarLinks().then((r) => { setLinks(r.links); setOffline((o) => o || r.offline); });
  }, []);

  const chave = chaveMes(ref.ano, ref.mes);
  const janelaMes = janelas.find((j) => j.mes === chave);
  const diasMarcados = editando ? editando.dias : janelaMes?.dias ?? [];
  const proximas = useMemo(() => proximasJanelas(janelas, 3), [janelas]);

  const mudarMes = (delta: number) => {
    if (editando) return;
    setRef((r) => {
      const d = new Date(r.ano, r.mes + delta, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() };
    });
  };

  const alternarDia = (dia: number) => {
    if (!editando) return;
    setEditando((e) => e && { ...e, dias: e.dias.includes(dia) ? e.dias.filter((d) => d !== dia) : [...e.dias, dia].sort((a, b) => a - b) });
  };

  const salvarJanela = async () => {
    if (!editando) return;
    setSalvando(true);
    try {
      const r = await api<Janela>(`/janelas/${chave}`, { method: 'PUT', json: editando });
      const novas = [...janelas.filter((j) => j.mes !== chave), r].sort((a, b) => a.mes.localeCompare(b.mes));
      setJanelas(novas);
      guardarJanelas(novas);
      setEditando(null);
      avisar(`Janelas de ${MESES[ref.mes]} salvas.`);
    } catch (e) { avisar(msgErro(e), 'erro'); }
    finally { setSalvando(false); }
  };

  const salvarLinks = async () => {
    if (!editLinks) return;
    setSalvando(true);
    try {
      const r = await api<LinkUtil[]>('/links', { method: 'PUT', json: { links: editLinks } });
      setLinks(r);
      guardarLinks(r);
      setEditLinks(null);
      avisar('Links salvos.');
    } catch (e) { avisar(msgErro(e), 'erro'); }
    finally { setSalvando(false); }
  };

  // Monta a grade do mês: espaços vazios antes do dia 1 e depois os dias
  const primeiroDiaSemana = new Date(ref.ano, ref.mes, 1).getDay();
  const totalDias = new Date(ref.ano, ref.mes + 1, 0).getDate();
  const celulas: (number | null)[] = [...Array(primeiroDiaSemana).fill(null), ...Array.from({ length: totalDias }, (_, i) => i + 1)];
  const h = hoje();
  const proximaTime = proximas[0]?.getTime();

  return (
    <section>
      <div className="pagina-topo">
        <div>
          <h1>Janelas de pagamento</h1>
          <p className="mudo">Dias em que o contas a pagar processa comissão, folha e fornecedores. Envie as solicitações o quanto antes e com as informações corretas.</p>
        </div>
      </div>

      {offline && (
        <p className="nota nota-alerta">
          Não foi possível falar com o servidor agora. Você está vendo a última cópia guardada neste navegador. Se precisar solicitar um pagamento, use os links ao lado.
        </p>
      )}

      <div className="janelas-grade">
        <div className="cartao-branco calendario-caixa">
          <div className="calendario-topo">
            <button className="icone-btn seta" aria-label="Mês anterior" onClick={() => mudarMes(-1)} disabled={!!editando}>‹</button>
            <h2 className="calendario-titulo">
              <span>{MESES[ref.mes]}</span> {ref.ano}
            </h2>
            <button className="icone-btn seta" aria-label="Próximo mês" onClick={() => mudarMes(1)} disabled={!!editando}>›</button>
          </div>

          <div className={`calendario ${editando ? 'editando' : ''}`} role="grid" aria-label={`Janelas de ${MESES[ref.mes]} de ${ref.ano}`}>
            {SEMANA_CURTA.map((s, i) => (
              <div key={i} className={`cal-semana ${i === 0 ? 'domingo' : ''}`}>{s}</div>
            ))}
            {celulas.map((dia, i) => {
              if (dia === null) return <div key={`v${i}`} />;
              const data = new Date(ref.ano, ref.mes, dia);
              const marcado = diasMarcados.includes(dia);
              const passado = data.getTime() < h.getTime();
              const ehHoje = data.getTime() === h.getTime();
              const feriado = FERIADOS[`${String(ref.mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`];
              const proxima = !editando && marcado && data.getTime() === proximaTime;
              const classes = [
                'cal-dia',
                marcado && 'janela',
                passado && 'passado',
                ehHoje && 'hoje',
                (data.getDay() === 0 || feriado) && 'vermelho',
                proxima && 'proxima',
              ].filter(Boolean).join(' ');
              const titulo = [feriado, marcado ? 'Janela de pagamento' : '', ehHoje ? 'Hoje' : ''].filter(Boolean).join(' · ');
              return (
                <button key={dia} type="button" className={classes} title={titulo || undefined} onClick={() => alternarDia(dia)} disabled={!editando} aria-pressed={marcado}>
                  <span>{dia}</span>
                </button>
              );
            })}
          </div>

          <div className="cal-legenda">
            <span><i className="leg leg-janela" /> Janela de pagamento</span>
            <span><i className="leg leg-proxima" /> Próxima janela</span>
            <span><i className="leg leg-hoje" /> Hoje</span>
            <span className="leg-vermelho">Domingos e feriados</span>
          </div>

          {Object.entries(FERIADOS)
            .filter(([md]) => md.startsWith(String(ref.mes + 1).padStart(2, '0')))
            .map(([md, nome]) => <p key={md} className="mudo pequeno feriado-nota">{Number(md.slice(3))} · {nome}</p>)}

          {editando ? (
            <div className="cal-edicao">
              <p className="mudo pequeno" style={{ margin: 0 }}>Clique nos dias para marcar ou desmarcar. {editando.dias.length} dia(s) marcado(s).</p>
              <label className="campo">
                <span>Aviso do mês</span>
                <textarea rows={3} value={editando.observacao} onChange={(e) => setEditando({ ...editando, observacao: e.target.value })} />
              </label>
              <div className="form-rodape">
                <button className="btn btn-fantasma" onClick={() => setEditando(null)}>Cancelar</button>
                <button className="btn btn-primario" onClick={salvarJanela} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar janelas'}</button>
              </div>
            </div>
          ) : (
            <>
              {janelaMes?.observacao && <p className="aviso-mes">{janelaMes.observacao}</p>}
              {!janelaMes?.dias.length && <p className="mudo" style={{ textAlign: 'center' }}>Nenhuma janela cadastrada para {MESES[ref.mes]}.</p>}
              {admin && !offline && (
                <div className="cal-acoes">
                  <button className="btn btn-primario" onClick={() => setEditando({ dias: janelaMes?.dias ?? [], observacao: janelaMes?.observacao ?? '' })}>
                    {janelaMes?.dias.length ? 'Editar janelas do mês' : 'Cadastrar janelas do mês'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <aside className="janelas-lateral">
          <div className="cartao-branco">
            <h2>Próximas janelas</h2>
            {proximas.length ? (
              <ol className="proximas">
                {proximas.map((d, i) => (
                  <li key={d.getTime()} className={i === 0 ? 'primeira' : ''}>
                    <span className="prox-dia">{d.getDate()}</span>
                    <span className="prox-texto">
                      <strong>{formatarDia(d)}</strong>
                      <span className="mudo pequeno">{descreverDistancia(d)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mudo">Nenhuma janela futura cadastrada.</p>
            )}
          </div>

          <div className="cartao-branco">
            <div className="lateral-topo">
              <h2>Links de solicitação</h2>
              {admin && !offline && <button className="btn btn-fantasma btn-pequeno" onClick={() => setEditLinks(links.map((l) => ({ ...l })))}>Editar</button>}
            </div>
            <p className="mudo pequeno" style={{ marginTop: 4 }}>Use estes links se o sistema estiver fora do ar. Eles também aparecem na tela de login.</p>
            <LinksUteis links={links} />
          </div>
        </aside>
      </div>

      <Modal titulo="Editar links de solicitação" aberto={!!editLinks} aoFechar={() => setEditLinks(null)} largo>
        {editLinks && (
          <div className="form">
            {editLinks.map((l, i) => (
              <div key={i} className="link-edicao">
                <label className="campo"><span>Nome</span>
                  <input value={l.titulo} onChange={(e) => setEditLinks(editLinks.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))} />
                </label>
                <label className="campo"><span>Endereço</span>
                  <input value={l.url} placeholder="https://" onChange={(e) => setEditLinks(editLinks.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                </label>
                <button type="button" className="icone-btn" aria-label={`Excluir link ${l.titulo}`} title="Excluir link" onClick={() => setEditLinks(editLinks.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <button type="button" className="btn btn-fantasma btn-pequeno" style={{ alignSelf: 'flex-start' }} onClick={() => setEditLinks([...editLinks, { titulo: '', url: '' }])}>+ Adicionar link</button>
            <div className="form-rodape">
              <button type="button" className="btn btn-fantasma" onClick={() => setEditLinks(null)}>Cancelar</button>
              <button type="button" className="btn btn-primario" onClick={salvarLinks} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar links'}</button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
