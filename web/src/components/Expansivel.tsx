import { useId, useState, type ReactNode } from 'react';
import { Icone } from './Icone';

/** Linha de lista que mostra um resumo e abre os detalhes ao toque (usada no celular no lugar das tabelas) */
export function LinhaExpansivel({ resumo, lateral, children, aberta: abertaInicial = false }: {
  resumo: ReactNode;
  lateral?: ReactNode;
  children: ReactNode;
  aberta?: boolean;
}) {
  const [aberta, setAberta] = useState(abertaInicial);
  const id = useId();
  return (
    <li className={`linha-exp ${aberta ? 'aberta' : ''}`}>
      <button type="button" className="linha-exp-topo" aria-expanded={aberta} aria-controls={id} onClick={() => setAberta((a) => !a)}>
        <span className="linha-exp-resumo">{resumo}</span>
        {lateral && <span className="linha-exp-lateral">{lateral}</span>}
        <Icone nome="seta" tamanho={18} className="linha-exp-seta" />
      </button>
      {aberta && <div className="linha-exp-detalhes" id={id}>{children}</div>}
    </li>
  );
}

/** Par rótulo + valor dentro dos detalhes */
export function Info({ rotulo, children, largo }: { rotulo: string; children: ReactNode; largo?: boolean }) {
  return (
    <div className={`info ${largo ? 'info-larga' : ''}`}>
      <span className="info-rotulo">{rotulo}</span>
      <span className="info-valor">{children}</span>
    </div>
  );
}
