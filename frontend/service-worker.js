const CACHE_NAME = "estaciona-cache-v4";

const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/offline.html"
];

// Instalação
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Ativação
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) return caches.delete(name);
        })
      )
    )
  );
  self.clients.claim();
});

// Interceptação de requisições
self.addEventListener("fetch", event => {
  const req = event.request;

  // Não cachear chamadas ao backend (Render)
  if (req.url.includes("estacione-facil.onrender.com")) {
    return event.respondWith(fetch(req));
  }

  // Não cachear PDFs (recibos)
  if (req.destination === "document" && req.url.endsWith(".pdf")) {
    return event.respondWith(fetch(req));
  }

  // Apenas GET deve ser cacheado
  if (req.method !== "GET") {
    return event.respondWith(fetch(req));
  }

  event.respondWith(
    fetch(req)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        return response;
      })
      .catch(() => {
        return caches.match(req).then(response => {
          if (response) return response;

          // Se for navegação e offline → offline.html
          if (req.mode === "navigate") {
            return caches.match("/offline.html");
          }
        });
      })
  );
});
