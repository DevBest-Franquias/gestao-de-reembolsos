import type { Reembolso, Usuario } from '../../web/src/api';
import { montarPdfCombinado, nomePdfCombinado } from '../../web/src/pdfCombinado';
import { valoresBitrix, textoDescricao, BITRIX_URL, type ResultadoEnvio, type ResultadoPreenchimento } from './bitrix';
import { API, api, lerSessao, salvarSessao } from './comum';

declare const WEB_URL: string;
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const conteudo = $('#conteudo');
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '-');
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const ROTULO_STATUS: Record<string, string> = { nao_solicitado: 'Não solicitado', solicitado: 'Solicitado', pago: 'Pago' };

function base64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Busca arquivos da API com o login da extensão (usado para montar o PDF) */
async function buscar(caminho: string) {
  const s = await lerSessao();
  const r = await fetch(`${API}/api${caminho}`, { headers: { Authorization: `Bearer ${s?.token ?? ''}` } });
  if (!r.ok) throw new Error('Não foi possível baixar um dos arquivos da solicitação.');
  const blob = await r.blob();
  return { blob, tipo: blob.type || r.headers.get('Content-Type') || '' };
}

/** Compara versões no formato 1.2.3 */
const maisNova = (a: string, b: string) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

/** Mostra um aviso no topo quando o site tem uma versão mais nova da extensão */
async function verificarAtualizacao() {
  try {
    const r = await fetch(`${WEB_URL}/extensao-versao.json`, { cache: 'no-store' });
    const { versao } = (await r.json()) as { versao: string };
    const atual = chrome.runtime.getManifest().version;
    if (versao && maisNova(versao, atual)) {
      const aviso = document.createElement('a');
      aviso.className = 'atualizacao';
      aviso.href = `${WEB_URL}/#extensao`;
      aviso.target = '_blank';
      aviso.textContent = `Nova versão da extensão disponível (${versao}). Clique para ver como atualizar.`;
      document.body.insertBefore(aviso, conteudo);
    }
  } catch {
    /* sem internet ou site fora do ar: segue sem aviso */
  }
}

function telaLogin(erro = '') {
  $('#sair').hidden = true;
  conteudo.innerHTML = `
    <h2>Entre com o seu login do sistema de reembolsos</h2>
    <form id="login">
      <label for="email">E-mail</label>
      <input id="email" type="email" required autocomplete="username" />
      <label for="senha">Senha</label>
      <input id="senha" type="password" required autocomplete="current-password" />
      ${erro ? `<p class="erro">${esc(erro)}</p>` : ''}
      <button class="btn largo">Entrar</button>
    </form>`;
  $<HTMLFormElement>('#login').onsubmit = async (e) => {
    e.preventDefault();
    const botao = $<HTMLButtonElement>('#login .btn');
    botao.disabled = true;
    try {
      const r = await api<{ token: string; usuario: Usuario }>('/login', {
        method: 'POST',
        json: { email: $<HTMLInputElement>('#email').value, senha: $<HTMLInputElement>('#senha').value },
      });
      await salvarSessao({ token: r.token, nome: r.usuario.nome, email: r.usuario.email });
      telaLista();
    } catch (err) {
      telaLogin((err as Error).message);
    }
  };
}

let lista: Reembolso[] = [];

async function telaLista(aviso?: { tipo: 'ok' | 'falha' | 'info'; texto: string }) {
  const sessao = await lerSessao();
  if (!sessao) return telaLogin();
  $('#sair').hidden = false;
  conteudo.innerHTML = `<p class="mudo">Carregando solicitações…</p>`;
  try {
    lista = await api<Reembolso[]>('/reembolsos');
  } catch (e) {
    if (!(await lerSessao())) return telaLogin('Sua sessão expirou. Entre de novo.');
    conteudo.innerHTML = `<p class="erro">${esc((e as Error).message)}</p>`;
    return;
  }
  const { ultimoEnvio, prefs, aguardandoEnvio } = await chrome.storage.local.get(['ultimoEnvio', 'prefs', 'aguardandoEnvio']);
  const pendente = aguardandoEnvio ? lista.find((r) => r.id === aguardandoEnvio.id) : undefined;
  const filtro = (prefs as { status?: string; minhas?: boolean })?.status ?? 'nao_solicitado';
  const minhas = (prefs as { minhas?: boolean })?.minhas ?? true;
  if (!aviso && ultimoEnvio && Date.now() - ultimoEnvio.quando < 5 * 60_000) {
    aviso = ultimoEnvio.ok
      ? { tipo: 'ok', texto: `Formulário enviado no Bitrix. A solicitação nº ${ultimoEnvio.id} foi marcada como Solicitado.` }
      : { tipo: 'falha', texto: `O formulário foi enviado, mas não consegui marcar a solicitação nº ${ultimoEnvio.id}: ${ultimoEnvio.erro}` };
  }

  const visiveis = lista.filter(
    (r) => (filtro === 'todos' || r.status === filtro) && (!minhas || r.solicitante_email.toLowerCase() === sessao.email.toLowerCase()),
  );

  conteudo.innerHTML = `
    ${aviso ? `<div class="aviso ${aviso.tipo}">${esc(aviso.texto)}</div>` : ''}
    ${
      pendente
        ? `<div class="pendente">
        <div class="pendente-titulo">Preenchido no Bitrix, aguardando sua conferência</div>
        <div class="item-topo"><strong>${esc(pendente.solicitante_nome)}</strong><span class="valor">${moeda.format(pendente.valor_centavos / 100)}</span></div>
        <div class="previa">"${esc(textoDescricao(pendente))}"</div>
        <p class="mudo pequeno">Confira os dados na aba do formulário. Se estiver tudo certo, clique em Enviar.</p>
        <div class="pendente-acoes">
          <button class="btn btn-claro" id="cancelar">Cancelar</button>
          <button class="btn" id="enviar">Enviar ao Bitrix</button>
        </div>
      </div>`
        : ''
    }`
    + `
    <div class="filtros">
      <select id="filtro">
        <option value="nao_solicitado">Não solicitadas</option>
        <option value="solicitado">Solicitadas</option>
        <option value="pago">Pagas</option>
        <option value="todos">Todas</option>
      </select>
      <label><input type="checkbox" id="minhas" ${minhas ? 'checked' : ''} /> Só as minhas</label>
    </div>
    <div class="lista">
      ${
        visiveis.length
          ? visiveis
              .map(
                (r) => `
        <div class="item">
          <div class="item-topo"><strong title="${esc(r.solicitante_nome)}">${esc(r.solicitante_nome)}</strong><span class="valor">${moeda.format(r.valor_centavos / 100)}</span></div>
          <div class="desc" title="${esc(r.descricao)}">${esc(r.descricao || 'Sem descrição')}</div>
          <div class="item-rodape">
            <span class="mudo pequeno">Venc. ${dataBr(r.data_pagamento)} · <span class="selo ${r.status}">${ROTULO_STATUS[r.status]}</span></span>
            ${
              pendente?.id === r.id
                ? `<button class="btn btn-enviar" data-enviar="1" title="Enviar o formulário já preenchido no Bitrix">Enviar</button>`
                : `<button class="btn" data-id="${r.id}" title="Preencher o formulário do Bitrix com esta solicitação">Preencher</button>`
            }
          </div>
        </div>`,
              )
              .join('')
          : `<p class="vazio mudo">Nenhuma solicitação ${filtro === 'todos' ? '' : ROTULO_STATUS[filtro].toLowerCase()} ${minhas ? 'sua ' : ''}por aqui.</p>`
      }
    </div>
    <div class="rodape pequeno">
      <a href="${WEB_URL}" target="_blank">Abrir o sistema</a>
      <a href="${BITRIX_URL}" target="_blank">Abrir o formulário do Bitrix</a>
      <span class="mudo">v${chrome.runtime.getManifest().version}</span>
    </div>`;

  $<HTMLSelectElement>('#filtro').value = filtro;
  const salvarPrefs = async () => {
    await chrome.storage.local.set({ prefs: { status: $<HTMLSelectElement>('#filtro').value, minhas: $<HTMLInputElement>('#minhas').checked } });
    telaLista();
  };
  $<HTMLSelectElement>('#filtro').onchange = salvarPrefs;
  $<HTMLInputElement>('#minhas').onchange = salvarPrefs;
  conteudo.querySelectorAll<HTMLButtonElement>('button[data-id]').forEach((b) => (b.onclick = () => preencher(Number(b.dataset.id), b)));
  conteudo.querySelectorAll<HTMLButtonElement>('#enviar, button[data-enviar]').forEach((b) => (b.onclick = () => enviar(b)));
  const cancelar = document.querySelector<HTMLButtonElement>('#cancelar');
  if (cancelar) cancelar.onclick = async () => { await chrome.runtime.sendMessage({ tipo: 'cancelar' }); telaLista(); };
}

async function preencher(id: number, botao: HTMLButtonElement) {
  const r = lista.find((x) => x.id === id);
  if (!r) return;
  if (r.status !== 'nao_solicitado' && !confirm(`Esta solicitação já está como "${ROTULO_STATUS[r.status]}". Preencher o Bitrix mesmo assim?`)) return;
  conteudo.querySelectorAll<HTMLButtonElement>('button[data-id]').forEach((b) => (b.disabled = true));
  botao.textContent = 'Montando o PDF…';
  try {
    const bytes = await montarPdfCombinado(r, buscar);
    botao.textContent = 'Preenchendo…';
    const resultado: ResultadoPreenchimento = await chrome.runtime.sendMessage({
      tipo: 'preencher',
      id: r.id,
      valores: valoresBitrix(r),
      arquivo: { nome: nomePdfCombinado(r), tipo: 'application/pdf', base64: base64(bytes) },
    });
    if (resultado.ok) {
      telaLista({
        tipo: 'info',
        texto: 'Formulário preenchido e PDF anexado. Confira os dados na aba do Bitrix. Se estiver tudo certo, clique em Enviar aqui na extensão.',
      });
    } else {
      telaLista({ tipo: 'falha', texto: resultado.erro });
    }
  } catch (e) {
    telaLista({ tipo: 'falha', texto: (e as Error).message });
  }
}

async function enviar(botao: HTMLButtonElement) {
  conteudo.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = true));
  botao.textContent = 'Enviando…';
  const r: ResultadoEnvio = await chrome.runtime.sendMessage({ tipo: 'enviar' });
  if (r.ok) telaLista({ tipo: 'ok', texto: 'Enviado ao Bitrix. A solicitação foi marcada como Solicitado no sistema.' });
  else telaLista({ tipo: 'falha', texto: r.erro });
}

$('#sair').onclick = async () => {
  await api('/logout', { method: 'POST' }).catch(() => {});
  await salvarSessao(null);
  telaLogin();
};

verificarAtualizacao();
telaLista();
