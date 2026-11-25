import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatarMoeda } from '../formato';

export function Modal({ titulo, aberto, aoFechar, children, largo }: {
  titulo: string; aberto: boolean; aoFechar: () => void; children: ReactNode; largo?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // O modal só fecha pelo X: nem clique fora, nem tecla Esc
    d.setAttribute('closedby', 'none');
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);
  return (
    <dialog
      ref={ref}
      className={`modal ${largo ? 'modal-largo' : ''}`}
      onCancel={(e) => e.preventDefault()}
      onKeyDown={(e) => { if (e.key === 'Escape') e.preventDefault(); }}
    >
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

export const msgErro = (e: unknown) => {
  if (e instanceof TypeError) return 'Não foi possível conectar ao servidor. Verifique a internet e tente de novo.';
  return e instanceof Error ? e.message : 'Algo deu errado.';
};

/** Campo de senha com botão para mostrar ou esconder o que foi digitado */
export function CampoSenha({ valor, aoMudar, minimo, autoFocus, autoComplete }: {
  valor: string; aoMudar: (v: string) => void; minimo?: number; autoFocus?: boolean; autoComplete?: string;
}) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="campo-senha">
      <input
        type={visivel ? 'text' : 'password'}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        minLength={minimo}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        required
      />
      <button
        type="button"
        className="olho"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? 'Esconder senha' : 'Mostrar senha'}
        title={visivel ? 'Esconder senha' : 'Mostrar senha'}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {visivel ? (
            <>
              <path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.2" />
              <path d="M6.6 6.6A17.3 17.3 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              <path d="m2 2 20 20" />
            </>
          ) : (
            <>
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
