import type { Reembolso } from '../../web/src/api';

/** Endereço do formulário de solicitação de pagamento no Bitrix */
export const BITRIX_URL = 'https://hubsmart.bitrix24.site/solicitacao_pag_investidas/';
export const BITRIX_PADRAO = 'https://hubsmart.bitrix24.site/solicitacao_pag_investidas/*';

/**
 * Códigos internos do formulário 1149 do Bitrix (lidos da configuração do próprio formulário).
 * Se alguém mudar o formulário no Bitrix, é aqui que se ajusta.
 */
const P = 'DYNAMIC_1136_UF_CRM_381_';
export const CAMPOS = {
  nome: P + 'NOME_SOLICITANTE_EXTERNO',
  email: P + 'EMAIL_SOLICITANTE_INVESTIDAS',
  fornecedorNovo: P + 'FORNECEDOR',
  fornecedorNome: P + 'NOME_FORNECEDOR',
  fornecedorDoc: P + 'CNPJ_FORNECEDOR',
  numeroDoc: P + 'NUMERO_DOCUMENTO',
  vencimento: P + 'DATA_VENCIMENTO',
  valor: P + 'VALOR_PAGAMENTO',
  descricao: P + 'DESCRICAO_PAGAMENTO',
  forma: P + 'FORMA_PAGAMENTO',
  chavePix: P + 'CHAVE_PIX',
  banco: P + 'BANCO',
  agencia: P + 'AGENCIA',
  conta: P + 'CONTA_CORRENTE',
  empresa: P + 'CCUSTO_N1',
  variosCentros: P + 'VARIOS_CCUSTOS',
  centroN5: P + 'CCUSTO_N5_MATRIZ',
  anexos: P + 'ANEXO_DOCUMENTO',
};
const OPCOES = {
  fornecedorNao: '196001',
  formaPix: '196019',
  empresaBestInvestidas: '208413', // [1026] - BEST INVESTIDAS LTDA
  variosCentrosNao: '196099',
  centroFranquias: '205207', // [5766] FRANQUIAS
};

const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
// O formulário pede ponto só quando há centavos: 2000 ou 2000.50
const valorBitrix = (centavos: number) => (centavos % 100 === 0 ? String(centavos / 100) : (centavos / 100).toFixed(2));
const mascara = (d: string) => {
  const n = d.replace(/\D/g, '');
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d;
};

/** Texto do campo Descrição do pagamento no Bitrix, montado a partir da descrição do sistema */
export function textoDescricao(r: Reembolso) {
  const d = r.descricao.trim().replace(/[.\s]+$/, '');
  if (!d) return `Olá, equipe! Esse valor é referente a um reembolso de despesa de ${r.solicitante_nome}.`;
  return `Olá, equipe! Esse valor é referente a ${d}.`;
}

/** Valores do formulário do Bitrix a partir de uma solicitação do sistema */
export function valoresBitrix(r: Reembolso): Record<string, string | string[]> {
  return {
    [CAMPOS.nome]: r.solicitante_nome,
    [CAMPOS.email]: r.solicitante_email,
    [CAMPOS.fornecedorNovo]: OPCOES.fornecedorNao,
    [CAMPOS.fornecedorNome]: r.fornecedor_nome,
    [CAMPOS.fornecedorDoc]: mascara(r.fornecedor_documento),
    [CAMPOS.numeroDoc]: r.numero_documento || '0',
    [CAMPOS.vencimento]: dataBr(r.data_pagamento),
    [CAMPOS.valor]: valorBitrix(r.valor_centavos),
    [CAMPOS.descricao]: textoDescricao(r),
    [CAMPOS.forma]: OPCOES.formaPix,
    [CAMPOS.chavePix]: r.chave_pix,
    [CAMPOS.banco]: r.banco,
    [CAMPOS.agencia]: r.agencia,
    [CAMPOS.conta]: r.conta,
    [CAMPOS.empresa]: OPCOES.empresaBestInvestidas,
    [CAMPOS.variosCentros]: OPCOES.variosCentrosNao,
    [CAMPOS.centroN5]: [OPCOES.centroFranquias],
  };
}

export type ArquivoParaAnexar = { nome: string; tipo: string; base64: string };
export type ResultadoPreenchimento = { ok: true; preenchidos: number } | { ok: false; erro: string };

/**
 * Roda DENTRO da página do Bitrix (mundo principal), por isso não pode usar nada de fora desta função.
 * Preenche o formulário pela função setValues do próprio Bitrix, anexa o arquivo e fica de olho no envio.
 */
export async function preencherNoBitrix(
  valores: Record<string, string | string[]>,
  arquivo: ArquivoParaAnexar | null,
  campoAnexo: string,
  reembolsoId: number,
): Promise<ResultadoPreenchimento> {
  type FormB24 = {
    setValues: (v: Record<string, unknown>) => void;
    values: () => Record<string, unknown[]>;
    sent?: boolean;
    node?: HTMLElement;
  };
  const w = window as unknown as { b24form?: { App?: { list: () => FormB24[] } } };

  // Espera o formulário carregar (até 20 segundos)
  let form: FormB24 | undefined;
  for (let i = 0; i < 80 && !form; i++) {
    form = w.b24form?.App?.list?.()[0];
    if (!form) await new Promise((r) => setTimeout(r, 250));
  }
  if (!form) return { ok: false, erro: 'O formulário do Bitrix não carregou nesta aba. Recarregue a página e tente de novo.' };

  try {
    // Primeiro os campos que fazem outros aparecerem (fornecedor e forma de pagamento), depois o resto
    form.setValues(valores);
    await new Promise((r) => setTimeout(r, 300));
    form.setValues(valores);
  } catch (e) {
    return { ok: false, erro: 'Não foi possível preencher os campos: ' + String(e) };
  }

  if (arquivo) {
    const seletor = '.b24-form-field-file input[type=file]';
    const input = ((form.node instanceof Element ? form.node.querySelector(seletor) : null) ??
      document.querySelector(seletor)) as HTMLInputElement | null;
    if (!input) return { ok: false, erro: 'Campos preenchidos, mas não achei o campo de anexo no formulário.' };
    const bin = atob(arquivo.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], arquivo.nome, { type: arquivo.tipo }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    // Confere se o Bitrix aceitou o arquivo
    let anexado = false;
    for (let i = 0; i < 40 && !anexado; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const lista = form.values()[campoAnexo] as { name?: string }[] | undefined;
      anexado = !!lista?.some((f) => f?.name === arquivo.nome);
    }
    if (!anexado) return { ok: false, erro: 'Campos preenchidos, mas o Bitrix não aceitou o anexo. Anexe o PDF manualmente.' };
  }

  // Quando o formulário for enviado, avisa a extensão para marcar como Solicitado
  const marca = '__reembolsoBestObservando';
  const win = window as unknown as Record<string, unknown>;
  if (win[marca]) clearInterval(win[marca] as number);
  win[marca] = setInterval(() => {
    if (form!.sent) {
      clearInterval(win[marca] as number);
      win[marca] = null;
      window.postMessage({ origem: 'reembolsos-best', tipo: 'enviado', id: reembolsoId }, '*');
    }
  }, 500);

  const preenchidos = Object.values(form.values()).filter((v) => Array.isArray(v) && v.length > 0).length;
  return { ok: true, preenchidos };
}

export type ResultadoEnvio = { ok: true } | { ok: false; erro: string };

/**
 * Roda DENTRO da página do Bitrix (mundo principal): clica no botão Enviar do próprio formulário,
 * como a pessoa faria, e espera o Bitrix confirmar o envio.
 */
export async function enviarNoBitrix(): Promise<ResultadoEnvio> {
  type FormB24 = { sent?: boolean; loading?: boolean; node?: HTMLElement };
  const w = window as unknown as { b24form?: { App?: { list: () => FormB24[] } } };
  const form = w.b24form?.App?.list?.()[0];
  if (!form) return { ok: false, erro: 'O formulário do Bitrix não está carregado nesta aba.' };
  if (form.sent) return { ok: true };
  const raiz: ParentNode = form.node instanceof Element ? form.node : document;
  const botao = (raiz.querySelector('button[type=submit]') ?? document.querySelector('.b24-form button[type=submit]')) as HTMLButtonElement | null;
  if (!botao) return { ok: false, erro: 'Não achei o botão Enviar do formulário.' };
  botao.click();
  // Espera até 30 segundos pela confirmação do Bitrix
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (form.sent) return { ok: true };
    // Se o Bitrix não está enviando e mostra campos com erro, para de esperar
    if (i > 4 && !form.loading) {
      const erros = [...document.querySelectorAll('.b24-form-control-alert-message')].filter((e) => (e as HTMLElement).offsetParent);
      if (erros.length) return { ok: false, erro: 'O Bitrix apontou campos obrigatórios sem preencher. Confira o formulário, corrija e clique em Enviar de novo.' };
    }
  }
  return { ok: false, erro: 'O Bitrix não confirmou o envio. Confira na aba do formulário se ele foi enviado.' };
}
