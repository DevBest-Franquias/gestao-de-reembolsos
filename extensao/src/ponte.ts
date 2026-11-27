// Roda na página do Bitrix (mundo isolado): repassa para a extensão o aviso de "formulário enviado"
window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  const d = e.data as { origem?: string; tipo?: string; id?: number };
  if (d?.origem === 'reembolsos-best' && d.tipo === 'enviado' && typeof d.id === 'number') {
    chrome.runtime.sendMessage({ tipo: 'enviado', id: d.id });
  }
});
