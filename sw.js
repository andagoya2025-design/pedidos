/**
 * ============================================================
 * AYUDANTE DE LA APP (service worker)
 * - Guarda la pantalla en el teléfono: abre rápido aunque la señal sea mala.
 * - Para publicar una actualización: subir el número de VERSION.
 *   Todos los teléfonos la reciben solos al volver a abrir (sin Ctrl+F5
 *   y sin ?v= en index.html).
 * - Nunca guarda datos del negocio: los pedidos van siempre al servidor.
 * ============================================================
 */
var VERSION = 'app-2.0.1';

var ARCHIVOS = [
  './',
  'index.html',
  'instalar.html',
  'pedir.html',
  'manifest.json',
  'css/app.css',
  'css/modulos.css',
  'js/config.js',
  'js/ui.js',
  'js/datos.js',
  'js/app.js',
  'js/configuracion.js',
  'js/instalar.js',
  'js/comun.js',
  'js/pedir.js',
  'js/pedidos.js',
  'js/menu.js',
  'js/motorizados.js',
  'js/caja.js',
  'js/inventario.js',
  'js/reportes.js',
  'iconos/icono-180.png',
  'iconos/icono-192.png',
  'iconos/icono-512.png',
  'iconos/icono-mascara-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (claves) {
      return Promise.all(claves.filter(function (k) { return k !== VERSION && k.indexOf('app-') === 0; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // guardados: siempre al servidor
  var url = new URL(req.url);
  if (url.hostname.indexOf('script.google') >= 0) return; // datos: nunca desde la memoria

  // Letras de Google: se guardan la primera vez.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(VERSION + '-letras').then(function (c) {
      return c.match(req).then(function (r) {
        return r || fetch(req).then(function (resp) { c.put(req, resp.clone()); return resp; });
      });
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Pantalla de la app: primero la copia guardada (rápido); si no está, internet.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (r) {
      return r || fetch(req).then(function (resp) {
        if (resp.ok && resp.type === 'basic') {
          var copia = resp.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copia); });
        }
        return resp;
      });
    })
  );
});
