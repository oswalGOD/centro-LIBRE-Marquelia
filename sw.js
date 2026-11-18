// Service worker: guarda la app en el dispositivo para que abra y funcione sin internet.
// Al publicar cambios, sube el número de VERSION para que los dispositivos se actualicen.

const VERSION = "clm-v0.47.0";
const ARCHIVOS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "css/fonts.css",
  "js/app.js",
  "js/registro-sw.js",
  "js/core/auth.js",
  "js/core/catalogos.js",
  "js/core/config.js",
  "js/core/db.js",
  "js/core/firma.js",
  "js/core/permisos.js",
  "js/core/sync.js",
  "js/core/ui.js",
  "js/core/iconos.js",
  "js/core/componentes.js",
  "js/core/resumen.js",
  "js/core/kiosko.js",
  "js/core/teclado-pin.js",
  "js/core/pdf.js",
  "js/core/cursos.js",
  "js/core/duplicados.js",
  "js/core/calendario.js",
  "js/core/expedientes.js",
  "js/core/casos.js",
  "js/core/citas.js",
  "js/modulos/citas.js",
  "js/modulos/casos.js",
  "js/core/canalizaciones.js",
  "js/modulos/canalizaciones.js",
  "js/modulos/actividades.js",
  "js/modulos/ajustes.js",
  "js/modulos/captura.js",
  "js/modulos/estadisticas.js",
  "js/modulos/formato.js",
  "js/modulos/inicio.js",
  "js/modulos/evidencias.js",
  "js/modulos/evidencias-formato.js",
  "js/modulos/constancias.js",
  "js/modulos/anexo2.js",
  "js/modulos/informes.js",
  "js/core/informe.js",
  "js/core/xlsx.js",
  "js/core/evidencias.js",
  "js/core/camaras.js",
  "js/core/camara.js",
  "js/modulos/duplicadas.js",
  "js/modulos/usuarias.js",
  "js/modulos/perfiles.js",
  "js/core/escaner.js",
  "js/core/bitacora.js",
  "js/core/cifrado.js",
  "js/modulos/desarrollo.js",
  "js/vendor/jsQR.min.js",
  "js/core/ine.js",
  "js/core/qr.js",
  "js/core/verificacion.js",
  "js/vendor/qrcode.js",
  "js/vendor/tesseract/tesseract.min.js",
  "js/vendor/tesseract/worker.min.js",
  "js/vendor/tesseract/tesseract-core-simd-lstm.wasm.js",
  "js/vendor/tesseract/eng.traineddata.gz",
  "assets/logos.png",
  "assets/pie.png",
  "assets/marca-agua.jpg",
  "assets/anexo2-encabezado.png",
  "assets/anexo2-pie.png",
  "assets/anexo2-marca.png",
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
  // cache: "reload" evita tomar copias viejas de la memoria del navegador (GitHub Pages las guarda 10 minutos)
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: "reload" })))));
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

// Primero la copia guardada; si no existe, la red. Lo que se descarga del lector de texto
// (la versión para dispositivos sin SIMD) también se guarda para usarlo después sin internet.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(guardado =>
      guardado || fetch(e.request).then(r => {
        if (r.ok && e.request.url.includes("/js/vendor/tesseract/")) {
          const copia = r.clone();
          caches.open(VERSION).then(c => c.put(e.request, copia));
        }
        return r;
      }).catch(() => (e.request.mode === "navigate" ? caches.match("index.html") : Response.error()))
    )
  );
});
