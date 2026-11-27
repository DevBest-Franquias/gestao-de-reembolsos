import { BITRIX_PADRAO, BITRIX_URL, CAMPOS, preencherNoBitrix, type ArquivoParaAnexar } from './bitrix';
import { api } from './comum';

type Pedido =
  | { tipo: 'preencher'; id: number; valores: Record<string, string | string[]>; arquivo: ArquivoParaAnexar | null }
  | { tipo: 'enviado'; id: number };

/** Usa a aba do formulário que já estiver aberta; se não houver, abre uma */
async function abaDoFormulario(): Promise<chrome.tabs.Tab> {
  const [ativa] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (ativa?.url?.startsWith(BITRIX_URL)) return ativa;
  const [existente] = await chrome.tabs.query({ url: BITRIX_PADRAO });
  if (existente?.id) {
    await chrome.tabs.update(existente.id, { active: true });
    return existente;
  }
  const nova = await chrome.tabs.create({ url: BITRIX_URL, active: true });
  await new Promise<void>((ok) => {
    const ouvir = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === nova.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(ouvir);
        ok();
      }
    };
    chrome.tabs.onUpdated.addListener(ouvir);
  });
  return nova;
}

async function preencher(p: Extract<Pedido, { tipo: 'preencher' }>) {
  const aba = await abaDoFormulario();
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: aba.id! },
    world: 'MAIN',
    func: preencherNoBitrix,
    args: [p.valores, p.arquivo, CAMPOS.anexos, p.id],
  });
  const resultado = res?.result ?? { ok: false, erro: 'O Chrome não conseguiu acessar a página do Bitrix.' };
  if (resultado.ok) await chrome.storage.local.set({ aguardandoEnvio: { id: p.id, aba: aba.id } });
  return resultado;
}

/** O formulário foi enviado no Bitrix: marca a solicitação como Solicitado no sistema */
async function marcarSolicitado(id: number) {
  try {
    await api(`/reembolsos/${id}`, { method: 'PATCH', json: { status: 'solicitado' } });
    await chrome.storage.local.set({ ultimoEnvio: { id, quando: Date.now(), ok: true } });
    await chrome.action.setBadgeBackgroundColor({ color: '#1E9E6A' });
    await chrome.action.setBadgeText({ text: 'OK' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 15000);
  } catch (e) {
    await chrome.storage.local.set({ ultimoEnvio: { id, quando: Date.now(), ok: false, erro: String((e as Error).message) } });
    await chrome.action.setBadgeBackgroundColor({ color: '#D6334A' });
    await chrome.action.setBadgeText({ text: '!' });
  }
  await chrome.storage.local.remove('aguardandoEnvio');
}

chrome.runtime.onMessage.addListener((pedido: Pedido, _remetente, responder) => {
  if (pedido.tipo === 'preencher') {
    preencher(pedido).then(responder, (e) => responder({ ok: false, erro: String(e?.message ?? e) }));
    return true; // resposta assíncrona
  }
  if (pedido.tipo === 'enviado') {
    marcarSolicitado(pedido.id).then(() => responder({ ok: true }));
    return true;
  }
  return false;
});
