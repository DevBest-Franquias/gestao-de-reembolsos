const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8787').replace(/\/$/, '');
const CHAVE = 'reembolsos_token';

export const sessao = {
  get token() {
    try { return localStorage.getItem(CHAVE) || ''; } catch { return ''; }
  },
  set token(v: string) {
    try { v ? localStorage.setItem(CHAVE, v) : localStorage.removeItem(CHAVE); } catch { /* sem storage */ }
  },
};

export class ErroApi extends Error {
  constructor(msg: string, public status: number) { super(msg); }
}

let aoExpirar: () => void = () => {};
export const quandoSessaoExpirar = (fn: () => void) => { aoExpirar = fn; };

export async function api<T = unknown>(caminho: string, opcoes: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(opcoes.headers);
  if (sessao.token) headers.set('Authorization', `Bearer ${sessao.token}`);
  let body = opcoes.body;
  if (opcoes.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(opcoes.json);
  }
  const r = await fetch(`${BASE}/api${caminho}`, { ...opcoes, headers, body });
  if (r.status === 401 && caminho !== '/login') { sessao.token = ''; aoExpirar(); }
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroApi(dados.erro || 'Não foi possível concluir a operação.', r.status);
  return dados as T;
}

export const abrirAnexo = (id: number) => abrirArquivo(`/anexos/${id}`);
export const abrirComprovante = (cartaoId: number) => abrirArquivo(`/cartoes/${cartaoId}/comprovante`);

async function abrirArquivo(caminho: string) {
  const janela = window.open('', '_blank');
  const r = await fetch(`${BASE}/api${caminho}`, { headers: { Authorization: `Bearer ${sessao.token}` } });
  if (!r.ok) { janela?.close(); throw new ErroApi('Não foi possível abrir o arquivo.', r.status); }
  const url = URL.createObjectURL(await r.blob());
  if (janela) janela.location.href = url; else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function enviarAnexos(reembolsoId: number, arquivos: File[]) {
  const fd = new FormData();
  arquivos.forEach((f) => fd.append('arquivos', f));
  return api<Anexo[]>(`/reembolsos/${reembolsoId}/anexos`, { method: 'POST', body: fd });
}

export async function enviarComprovante(cartaoId: number, arquivo: File) {
  const fd = new FormData();
  fd.append('arquivo', arquivo);
  return api<Cartao>(`/cartoes/${cartaoId}/comprovante`, { method: 'POST', body: fd });
}

/* ---------- Tipos ---------- */
export type Usuario = { id: number; nome: string; email: string; papel: 'admin' | 'usuario' };
export type Cartao = {
  id: number;
  solicitante_id: number;
  final: string;
  comprovante: { nome: string; tamanho: number } | null;
};
export type Solicitante = { id: number; nome: string; email: string; cpf: string; chave_pix: string; cartoes: Cartao[] };
export type Fornecedor = { id: number; nome: string; documento: string };
export type Anexo = { id: number; reembolso_id: number; nome_arquivo: string; tipo: string; tamanho: number };
export type Status = 'nao_solicitado' | 'solicitado' | 'pago';
export type Forma = 'boleto' | 'cartao_credito' | 'pix' | 'pix_qr_code';
export type Reembolso = {
  id: number;
  solicitante_id: number | null;
  solicitante_nome: string;
  solicitante_email: string;
  fornecedor_novo: number;
  fornecedor_id: number | null;
  fornecedor_nome: string;
  fornecedor_documento: string;
  numero_documento: string;
  data_pagamento: string | null;
  valor_centavos: number;
  descricao: string;
  forma_pagamento: Forma;
  status: Status;
  data_reembolso: string | null;
  criado_em: string;
  anexos: Anexo[];
};

export const FORMAS: Record<Forma, string> = {
  boleto: 'Boleto',
  cartao_credito: 'Cartão de crédito',
  pix: 'Pix',
  pix_qr_code: 'Pix QR Code',
};
export const STATUS: Record<Status, string> = {
  nao_solicitado: 'Não solicitado',
  solicitado: 'Solicitado',
  pago: 'Pago',
};
