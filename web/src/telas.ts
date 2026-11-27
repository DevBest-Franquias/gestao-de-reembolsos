import { useEffect, useState } from 'react';

/** Pontos de quebra do layout (mobile-first: o padrão é o celular, estes são os maiores) */
export const TELA = { tablet: 768, desktop: 1100 };

/** true quando a tela tem pelo menos essa largura; acompanha mudanças (girar o celular, redimensionar) */
export function useTelaMinima(px: number) {
  const consulta = `(min-width: ${px}px)`;
  const [ok, setOk] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches);
  useEffect(() => {
    const m = window.matchMedia(consulta);
    const f = () => setOk(m.matches);
    f();
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [consulta]);
  return ok;
}

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let eventoGuardado: EventoInstalar | null = null;
const ouvintes = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    eventoGuardado = e as EventoInstalar;
    ouvintes.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    eventoGuardado = null;
    ouvintes.forEach((f) => f());
  });
}

export const rodandoComoApp = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
export const ehIphone = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

/** Instalação do app: no Android/Chrome abre o pedido do navegador; no iPhone é pelo menu Compartilhar */
export function useInstalarApp() {
  const [, forcar] = useState(0);
  useEffect(() => {
    const f = () => forcar((n) => n + 1);
    ouvintes.add(f);
    return () => { ouvintes.delete(f); };
  }, []);
  const instalado = rodandoComoApp();
  return {
    instalado,
    podeInstalar: !instalado && (!!eventoGuardado || ehIphone()),
    precisaInstrucaoIphone: !instalado && !eventoGuardado && ehIphone(),
    instalar: async () => {
      if (!eventoGuardado) return false;
      await eventoGuardado.prompt();
      const r = await eventoGuardado.userChoice;
      eventoGuardado = null;
      ouvintes.forEach((f) => f());
      return r.outcome === 'accepted';
    },
  };
}
