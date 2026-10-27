// Service worker: guarda la app en el dispositivo para que abra y funcione sin internet.
// Al publicar cambios, sube el número de VERSION para que los dispositivos se actualicen.

const VERSION = "clm-v0.4.1";
const ARCHIVOS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "css/fonts.css",
  "js/app.js",
  "js/core/auth.js",
  "js/core/catalogos.js",
  "js/core/config.js",
  "js/core/db.js",
  "js/core/firma.js",
  "js/core/permisos.js",
  "js/core/sync.js",
  "js/core/ui.js",
  "js/modulos/actividades.js",
  "js/modulos/ajustes.js",
  "js/modulos/captura.js",
  "js/modulos/estadisticas.js",
  "js/modulos/formato.js",
  "js/modulos/padron.js",
  "js/modulos/usuarias.js",
  "assets/logos.png",
  "assets/pie.png",
  "assets/marca-agua.jpg",
  "fonts/atkinson-hyperlegible-400.woff2",
  "fonts/atkinson-hyperlegible-700.woff2",
  "fonts/bricolage-grotesque-700.woff2",
  "fonts/carlito-400.woff2",
  "fonts/carlito-700.woff2",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => {
  if (e.data === "activar") self.skipWaiting();
});

// Primero la copia guardada; si no existe, la red.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(guardado =>
      guardado || fetch(e.request).catch(() => (e.request.mode === "navigate" ? caches.match("index.html") : Response.error()))
    )
  );
});
