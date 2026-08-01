const CACHE_NAME = 'catalogo-lulu-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  'https://unpkg.com/lucide@latest'
];

// Instalar e salvar assets no Cache Storage
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Ativar e limpar caches antigos
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// interceptar requisições
self.addEventListener('fetch', (e) => {
  // Ignorar requisições da API, de uploads ou requisições não-GET
  if (
    e.request.method !== 'GET' ||
    e.request.url.includes('/api/') || 
    e.request.url.includes('/uploads/')
  ) {
    return; // Deixa passar direto para a rede
  }
  
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Buscar na rede caso não esteja no cache
      return fetch(e.request).then((response) => {
        // Não cacheia respostas que não sejam de sucesso
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Cacheia os novos arquivos estáticos acessados
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });

        return response;
      }).catch(() => {
        // Fallback caso falhe e não tenha cache
        if (e.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
