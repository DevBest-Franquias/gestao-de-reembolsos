import { useEffect, useState } from 'react';
import { carregarJanelas, type Janela } from '../api';
import { FERIADOS, MESES, SEMANA, SEMANA_CURTA, chaveMes, descreverDistancia, formatarDia, hoje, proximasJanelas } from '../janelas';

/** Painel de conferência mostrado ao lado do formulário de solicitação */
export default function PainelJanela() {
  const [janelas, setJanelas] = useState<Janela[] | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    carregarJanelas().then((r) => { setJanelas(r.janelas); setOffline(r.offline); });
  }, []);

  const h = hoje();
  const proximas = janelas ? proximasJanelas(janelas, 2) : [];
  const proxima = proximas[0];
  const ehHojeJanela = proxima && proxima.getTime() === h.getTime();
  const depois = ehHojeJanela ? proximas[1] : undefined;

  // Calendário: mês da próxima janela (ou o mês atual, se não houver)
  const base = proxima ?? h;
  const ano = base.getFullYear();
  const mes = base.getMonth();
  const janelaMes = janelas?.find((j) => j.mes === chaveMes(ano, mes));
  const recomendacao =
    janelaMes?.observacao ||
    [...(janelas ?? [])].reverse().find((j) => j.observacao)?.observacao ||
    '';

  const primeiro = new Date(ano, mes, 1).getDay();
  const total = new Date(ano, mes + 1, 0).getDate();
  const celulas: (number | null)[] = [...Array(primeiro).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];

  return (
    <aside className="painel-janela" aria-label="Janela de pagamento">
      <div className="pj-bloco">
        <span className="pj-rotulo">Hoje</span>
        <strong className="pj-hoje">{formatarDia(h)}</strong>
      </div>

      <div className="pj-bloco pj-destaque">
        <span className="pj-rotulo">{ehHojeJanela ? 'Hoje é dia de janela' : 'Próxima janela de pagamento'}</span>
        {janelas === null ? (
          <span className="pj-carregando">Carregando…</span>
        ) : proxima ? (
          <>
            <strong className="pj-data">{ehHojeJanela ? 'Hoje' : `${SEMANA[proxima.getDay()]}, ${proxima.getDate()} de ${MESES[proxima.getMonth()]}`}</strong>
            {!ehHojeJanela && <span className="pj-distancia">{descreverDistancia(proxima)}</span>}
            {depois && <span className="pj-depois">Depois: {formatarDia(depois)} ({descreverDistancia(depois)})</span>}
          </>
        ) : (
          <strong className="pj-data pj-vazio">Nenhuma janela cadastrada</strong>
        )}
      </div>

      <div className="pj-calendario">
        <div className="pj-mes">{MESES[mes]} {ano}</div>
        <div className="pj-grade">
          {SEMANA_CURTA.map((s, i) => <span key={i} className={`pj-sem ${i === 0 ? 'dom' : ''}`}>{s}</span>)}
          {celulas.map((d, i) => {
            if (d === null) return <span key={`v${i}`} />;
            const data = new Date(ano, mes, d);
            const marcado = janelaMes?.dias.includes(d);
            const feriado = FERIADOS[`${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`];
            const classes = [
              'pj-dia',
              marcado && 'janela',
              proxima && data.getTime() === proxima.getTime() && 'proxima',
              data.getTime() === h.getTime() && 'hoje',
              data.getTime() < h.getTime() && 'passado',
              (data.getDay() === 0 || feriado) && 'vermelho',
            ].filter(Boolean).join(' ');
            return <span key={d} className={classes} title={feriado || undefined}>{d}</span>;
          })}
        </div>
      </div>

      {recomendacao && (
        <div className="pj-recomendacao" role="note">
          <span className="pj-alerta">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            Atenção às recomendações
          </span>
          <p>{recomendacao}</p>
        </div>
      )}

      {offline && <p className="mudo pequeno" style={{ margin: 0 }}>Mostrando a última cópia guardada neste navegador.</p>}
    </aside>
  );
}
