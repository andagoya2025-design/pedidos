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
var VERSION = 'app-3.1.36-sustitucion-premium';
var FOTOS = 'fotos-1';      // 3.1: fotos de platos y mapas (sobrevive a las actualizaciones)
var MAX_FOTOS = 150;

var ARCHIVOS = [
  './',
  'index.html',
  'instalar.html',
  'pedir.html',
  'manifest.json',
  'manifest-cliente.json',
  'manifest-driver.json',
  'driver.html',
  'js/pwa-cliente.js',
  'css/app.css',
  'css/modulos.css',
  'js/config.js',
  'js/ui.js',
  'js/datos.js',
  'js/app.js',
  'js/configuracion.js',
  'js/instalar.js',
  'js/comun.js',
  'js/mapa.js',
  'js/qr.js',
  'js/pedir.js',
  'js/pedidos.js',
  'js/menu.js',
  'js/motorizados.js',
  'js/caja.js',
  'js/inventario.js',
  'js/reportes.js',
  'js/rastreo.js',
  'js/monitoreo.js',
  'js/informe_motorizados.js',
  'privacidad.html',
  'politicas.html',
  'img/platos/pollo.svg',
  'img/platos/bebida.svg',
  'img/platos/postre.svg',
  'img/platos/desayuno.svg',
  'img/platos/hamburguesa.svg',
  'img/platos/pizza.svg',
  'img/platos/almuerzo.svg',
  'img/platos/general.svg',
  'img/platos/portada.svg',
  'iconos/icono-180.png',
  'iconos/icono-192.png',
  'iconos/icono-512.png',
  'iconos/icono-mascara-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS.map(function(p){return new Request(new URL(p,self.registration.scope).href,{cache:'reload'});})); }).then(function () { return self.skipWaiting(); })
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

  // 3.1: fotos (Drive) y cuadros del mapa: se muestra la guardada al instante y se renueva por detrás.
  if (req.destination === 'image' && /(^|\.)(drive\.google\.com|googleusercontent\.com|tile\.openstreetmap\.org)$/.test(url.hostname)) {
    e.respondWith(caches.open(FOTOS).then(function (c) {
      return c.match(req).then(function (guardada) {
        var nueva = fetch(req).then(function (resp) {
          if (resp && (resp.ok || resp.type === 'opaque')) { c.put(req, resp.clone()).then(function () { recortar(c); }); }
          return resp;
        }).catch(function () { return guardada; });
        return guardada || nueva;
      });
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (!ARCHIVOS.some(function (p) { return new URL(p, self.registration.scope).pathname === url.pathname; })) return;

  // Pantalla de la app: primero la copia guardada (rápido); si no está, internet.
  e.respondWith(
    caches.open(VERSION).then(function(c){return c.match(req, { ignoreSearch: true });}).then(function (r) {
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

function recortar(c) {
  c.keys().then(function (k) { if (k.length > MAX_FOTOS) return Promise.all(k.slice(0, k.length - MAX_FOTOS).map(function (x) { return c.delete(x); })); });
}

/* 3.1: al tocar la notificación de pedido nuevo, abre (o enfoca) el panel de pedidos. */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (lista) {
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].url.indexOf('pedir.html') < 0 && lista[i].url.indexOf('driver.html') < 0 && 'focus' in lista[i]) { lista[i].navigate(self.registration.scope + '#pedidos'); return lista[i].focus(); }
    }
    return self.clients.openWindow(self.registration.scope + '#pedidos');
  }));
});
