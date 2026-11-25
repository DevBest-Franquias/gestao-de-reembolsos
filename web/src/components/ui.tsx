import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatarMoeda } from '../formato';

export function Modal({ titulo, aberto, aoFechar, children, largo }: {
  titulo: string; aberto: boolean; aoFechar: () => void; children: ReactNode; largo?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);
  return (
    <dialog ref={ref} className={`modal ${largo ? 'modal-largo' : ''}`} onClose={aoFechar} onCancel={aoFechar}>
      <header className="modal-topo">
        <h2>{titulo}</h2>
        <button type="button" className="icone-btn" aria-label="Fechar" onClick={aoFechar}>×</button>
      </header>
      {aberto && <div className="modal-corpo">{children}</div>}
    </dialog>
  );
}

export function Dica({ texto }: { texto: string }) {
  return (
    <span className="dica" tabIndex={0} aria-label={texto}>
      ?
      <span className="dica-balao" role="tooltip">{texto}</span>
    </span>
  );
}

/** Campo monetário: digita só números e exibe como R$ 1.234,56 */
export function CampoMoeda({ centavos, aoMudar, id }: { centavos: number; aoMudar: (c: number) => void; id?: string }) {
  return (
    <input
      id={id}
      inputMode="numeric"
      value={centavos ? formatarMoeda(centavos) : ''}
      placeholder="R$ 0,00"
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, '').slice(0, 13);
        aoMudar(Number(d || 0));
      }}
    />
  );
}

type Aviso = { id: number; texto: string; tipo: 'ok' | 'erro' };
let empurrar: (a: Omit<Aviso, 'id'>) => void = () => {};
export const avisar = (texto: string, tipo: 'ok' | 'erro' = 'ok') => empurrar({ texto, tipo });

export function Avisos() {
  const [lista, setLista] = useState<Aviso[]>([]);
  useEffect(() => {
    empurrar = (a) => {
      const id = Date.now() + Math.random();
      setLista((l) => [...l, { ...a, id }]);
      setTimeout(() => setLista((l) => l.filter((x) => x.id !== id)), 4000);
    };
  }, []);
  return (
    <div className="avisos" aria-live="polite">
      {lista.map((a) => (
        <div key={a.id} className={`aviso aviso-${a.tipo}`}>{a.texto}</div>
      ))}
    </div>
  );
}

export const msgErro = (e: unknown) => (e instanceof Error ? e.message : 'Algo deu errado.');
