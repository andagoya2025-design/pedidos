/**
 * ============================================================
 * MAPA LIVIANO (3.0) — sin librerías ni claves de pago.
 * Mapas de OpenStreetMap. El pin queda fijo en el centro y la
 * persona MUEVE el mapa con el dedo (como las apps de taxi).
 * UI.mapa(contenedor, { lat, lng, zoom, alMover(punto) }) devuelve
 * { centro(), fijar(lat, lng, zoom), destruir() }.
 * ============================================================
 */
(function (global) {
  'use strict';
  var UI = global.UI;
  var T = 256;

  function aPixel(lat, lng, z) {
    var n = T * Math.pow(2, z);
    var s = Math.sin(lat * Math.PI / 180);
    return { x: (lng + 180) / 360 * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
  }
  function aLatLng(x, y, z) {
    var n = T * Math.pow(2, z);
    var lng = x / n * 360 - 180;
    var k = Math.PI - 2 * Math.PI * y / n;
    var lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k)));
    return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  }

  UI.mapa = function (cont, op) {
    op = op || {};
    var z = op.zoom || 17;
    var c = aPixel(op.lat || -0.1807, op.lng || -78.4678, z); // Quito por defecto
    cont.classList.add('mapa');
    cont.innerHTML = '<div class="mapa-capa" aria-hidden="true"></div>' +
      '<div class="mapa-pin" aria-hidden="true"><span>📍</span></div>' +
      '<div class="mapa-zoom"><button type="button" data-z="1" aria-label="Acercar">＋</button><button type="button" data-z="-1" aria-label="Alejar">−</button></div>' +
      '<div class="mapa-ayuda">Mueve el mapa hasta que el pin quede en tu puerta</div>' +
      '<div class="mapa-error" role="status" hidden>Mapa base no disponible. Comprueba la dirección o utiliza el GPS.</div>' +
      '<a class="mapa-credito" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>';
    var capa = cont.querySelector('.mapa-capa');
    var cache = {};

    function pintar() {
      var w = cont.clientWidth, h = cont.clientHeight;
      var x0 = c.x - w / 2, y0 = c.y - h / 2;
      var max = Math.pow(2, z);
      var tx0 = Math.floor(x0 / T), ty0 = Math.floor(y0 / T), tx1 = Math.floor((x0 + w) / T), ty1 = Math.floor((y0 + h) / T);
      var usadas = {};
      for (var tx = tx0; tx <= tx1; tx++) {
        for (var ty = ty0; ty <= ty1; ty++) {
          if (ty < 0 || ty >= max) continue;
          var nx = ((tx % max) + max) % max;
          var k = z + '/' + nx + '/' + ty + '@' + tx;
          usadas[k] = true;
          var img = cache[k];
          if (!img) {
            img = document.createElement('img');
            img.alt = ''; img.draggable = false; img.decoding = 'async';
            img.crossOrigin = 'anonymous'; img.referrerPolicy = 'strict-origin-when-cross-origin';
            img.onerror = function () { this.style.visibility = 'hidden'; var aviso = cont.querySelector('.mapa-error'); if (aviso) aviso.hidden = false; };
            img.src = 'https://tile.openstreetmap.org/' + z + '/' + nx + '/' + ty + '.png';
            cache[k] = img; capa.appendChild(img);
          }
          img.style.transform = 'translate(' + Math.round(tx * T - x0) + 'px,' + Math.round(ty * T - y0) + 'px)';
        }
      }
      Object.keys(cache).forEach(function (k) { if (!usadas[k]) { cache[k].remove(); delete cache[k]; } });
    }
    function avisar() { if (op.alMover) op.alMover(aLatLng(c.x, c.y, z)); }

    var arrastre = null;
    cont.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button,a')) return;
      arrastre = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y };
      cont.setPointerCapture(e.pointerId);
      cont.classList.add('moviendo');
    });
    cont.addEventListener('pointermove', function (e) {
      if (!arrastre) return;
      c = { x: arrastre.cx - (e.clientX - arrastre.x), y: arrastre.cy - (e.clientY - arrastre.y) };
      pintar();
    });
    function soltar() { if (!arrastre) return; arrastre = null; cont.classList.remove('moviendo'); avisar(); }
    cont.addEventListener('pointerup', soltar);
    cont.addEventListener('pointercancel', soltar);
    function zoom(d) {
      var nz = Math.max(12, Math.min(19, z + d));
      if (nz === z) return;
      var ll = aLatLng(c.x, c.y, z);
      z = nz; c = aPixel(ll.lat, ll.lng, z);
      Object.keys(cache).forEach(function (k) { cache[k].remove(); delete cache[k]; });
      pintar();
    }
    cont.querySelector('.mapa-zoom').addEventListener('click', function (e) {
      var b = e.target.closest('[data-z]');
      if (b) zoom(Number(b.getAttribute('data-z')));
    });
    var obs = global.ResizeObserver ? new ResizeObserver(pintar) : null;
    if (obs) obs.observe(cont);
    setTimeout(pintar, 0);

    return {
      centro: function () { return aLatLng(c.x, c.y, z); },
      fijar: function (lat, lng, nz) {
        if (nz) { z = nz; Object.keys(cache).forEach(function (k) { cache[k].remove(); delete cache[k]; }); }
        c = aPixel(lat, lng, z); pintar();
      },
      destruir: function () { if (obs) obs.disconnect(); cont.innerHTML = ''; }
    };
  };

  /* Punto -> enlace de Google Maps para mirarlo. */
  UI.enlacePunto = function (lat, lng) { return 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng; };
})(window);
