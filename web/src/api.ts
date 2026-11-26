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
export const abrirComprovanteCartaoReembolso = (reembolsoId: number) => abrirArquivo(`/reembolsos/${reembolsoId}/comprovante-cartao`);

async function abrirArquivo(caminho: string) {
  const janela = window.open('', '_blank');
  const r = await fetch(`${BASE}/api${caminho}`, { headers: { Authorization: `Bearer ${sessao.token}` } });
  if (!r.ok) { janela?.close(); throw new ErroApi('Não foi possível abrir o arquivo.', r.status); }
  const url = URL.createObjectURL(await r.blob());
  if (janela) janela.location.href = url;
  else {
    // Navegador bloqueou a nova aba: baixa o arquivo sem sair do sistema
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    link.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function enviarAnexos(reembolsoId: number, arquivos: File[], categoria: CategoriaAnexo = 'documento') {
  const fd = new FormData();
  arquivos.forEach((f) => fd.append('arquivos', f));
  fd.append('categoria', categoria);
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
export type Solicitante = {
  id: number; nome: string; email: string; cpf: string;
  banco: string; agencia: string; conta: string; chave_pix: string;
  cartoes: Cartao[];
};
export type CategoriaAnexo = 'documento' | 'cobranca';
export type Anexo = { id: number; reembolso_id: number; nome_arquivo: string; tipo: string; tamanho: number; categoria: CategoriaAnexo };
export const CATEGORIAS_ANEXO: Record<CategoriaAnexo, string> = {
  documento: 'Anexo da nota fiscal ou documento de pagamento',
  cobranca: 'Anexo do print de cobrança do cartão ou comprovante de envio de Pix',
};
export type Status = 'nao_solicitado' | 'solicitado' | 'pago';
export type Forma = 'boleto' | 'cartao_credito' | 'pix' | 'pix_qr_code';
export type Reembolso = {
  id: number;
  solicitante_id: number | null;
  solicitante_nome: string;
  solicitante_email: string;
  solicitante_cpf: string;
  fornecedor_novo: number;
  fornecedor_eh_solicitante: number;
  chave_pix: string;
  banco: string;
  agencia: string;
  conta: string;
  empresa_pagadora: string;
  multiplos_centros_custo: number;
  centro_custo: string;
  cartao_id: number | null;
  cartao_final: string;
  cartao_comprovante: { nome: string; tamanho: number } | null;
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

/* ---------- Links úteis ---------- */
export type LinkUtil = { id?: number; titulo: string; url: string };

/** Links usados quando a API está fora do ar e ainda não há nada guardado no navegador */
export const LINKS_PADRAO: LinkUtil[] = [
  { titulo: 'Solicitação de pagamento geral', url: 'https://crm.hub-bnk.com/marketplace/app/621/' },
  { titulo: 'Solicitação de investidas', url: 'https://hubsmart.bitrix24.site/solicitacao_pag_investidas/' },
];

const lerCache = <T,>(chave: string): T | null => {
  try { const v = localStorage.getItem(chave); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
};
const gravarCache = (chave: string, valor: unknown) => {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem storage */ }
};

/** Busca os links na API e guarda uma cópia; se a API falhar, usa a última cópia ou os links padrão */
export async function carregarLinks(): Promise<{ links: LinkUtil[]; offline: boolean }> {
  try {
    const links = await api<LinkUtil[]>('/links');
    gravarCache('reembolsos_links', links);
    return { links, offline: false };
  } catch {
    return { links: lerCache<LinkUtil[]>('reembolsos_links') ?? LINKS_PADRAO, offline: true };
  }
}
export const linksEmCache = () => lerCache<LinkUtil[]>('reembolsos_links') ?? LINKS_PADRAO;
export const guardarLinks = (links: LinkUtil[]) => gravarCache('reembolsos_links', links);

/* Valores fixos da solicitação de reembolso (a API grava os mesmos) */
export const EMPRESA_PAGADORA = '[1026] BEST INVESTIDAS LTDA';
export const CENTRO_CUSTO_N5 = '[5766] FRANQUIAS';
