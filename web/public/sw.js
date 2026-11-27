// Service worker do app: deixa o sistema instalável e abre rápido, mesmo com internet ruim.
// Os dados (API) nunca ficam guardados aqui: sempre vêm do servidor.
const VERSAO = 'reembolsos-v2';
const ESSENCIAIS = ['/', '/index.html', '/manifest.webmanifest', '/icones/app-192.png', '/fonts/ZalandoSans-Variable.ttf', '/logo-best-franquias-branco.png', '/logo-best-franquias-roxoescuro.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // API e outros sites: direto na rede

  // Páginas: tenta a rede primeiro (versão mais nova); sem internet, usa a cópia guardada
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copia = r.clone();
          caches.open(VERSAO).then((c) => c.put('/index.html', copia));
          return r;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Arquivos do app (js, css, fontes, imagens): usa a cópia e atualiza em segundo plano
  if (/\.(js|css|ttf|woff2?|png|svg|webmanifest)$/.test(url.pathname) && !url.pathname.endsWith('.zip')) {
    e.respondWith(
      caches.open(VERSAO).then(async (c) => {
        const guardado = await c.match(req);
        const rede = fetch(req)
          .then((r) => {
            if (r.ok) c.put(req, r.clone());
            return r;
          })
          .catch(() => guardado);
        return guardado || rede;
      }),
    );
  }
});
