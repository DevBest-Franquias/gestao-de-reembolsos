declare const API_URL: string;
export const API = API_URL.replace(/\/$/, '');

export type Sessao = { token: string; nome: string; email: string };

export async function lerSessao(): Promise<Sessao | null> {
  const r = await chrome.storage.local.get('sessao');
  return (r.sessao as Sessao) ?? null;
}
export const salvarSessao = (s: Sessao | null) => (s ? chrome.storage.local.set({ sessao: s }) : chrome.storage.local.remove('sessao'));

/** Chama a API do sistema com o login guardado na extensão */
export async function api<T>(caminho: string, opcoes: RequestInit & { json?: unknown } = {}): Promise<T> {
  const s = await lerSessao();
  const headers = new Headers(opcoes.headers);
  if (s) headers.set('Authorization', `Bearer ${s.token}`);
  let body = opcoes.body;
  if (opcoes.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(opcoes.json);
  }
  const r = await fetch(`${API}/api${caminho}`, { ...opcoes, headers, body });
  if (r.status === 401 && caminho !== '/login') await salvarSessao(null);
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((dados as { erro?: string }).erro || 'Não foi possível falar com o sistema.');
  return dados as T;
}
