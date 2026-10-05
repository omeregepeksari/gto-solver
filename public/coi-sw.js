// Service worker that makes the page cross-origin isolated on hosts that can't send
// COOP/COEP headers themselves (e.g. GitHub Pages). Isolation unlocks SharedArrayBuffer,
// which the multithreaded solver needs. Registered from index.html only when needed.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  event.respondWith(
    fetch(req).then(res => {
      if (res.status === 0) return res; // opaque cross-origin response; leave it alone
      const headers = new Headers(res.headers);
      headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }),
  );
});
