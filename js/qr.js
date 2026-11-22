/**
 * ============================================================
 * CÓDIGOS QR Y COMPARTIR (3.0)
 * - UI.qrUrl(texto): imagen del QR (servicio gratuito goqr.me /
 *   api.qrserver.com; el contenido es solo un enlace público).
 * - UI.hojaQR({...}): ventana con el QR listo para imprimir o
 *   descargar (logo, nombre y «Escanea y pide»).
 * - UI.compartirEnlace({...}): WhatsApp, copiar, Instagram y QR
 *   en un solo botón, con el texto de invitación ya escrito.
 * ============================================================
 */
(function (global) {
  'use strict';
  var UI = global.UI;

  UI.qrUrl = function (texto, px) {
    px = px || 480;
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + px + 'x' + px + '&margin=12&ecc=M&format=png&data=' + encodeURIComponent(texto);
  };

  /* Enlace público de pedido: pedir.html (misma carpeta que la app) + local, mesa y origen. */
  UI.enlacePedir = function (op) {
    op = op || {};
    var base = UI.enlaceApp ? UI.enlaceApp() : global.location.href.replace(/[^/]*$/, '');
    var q = [];
    if (op.local) q.push('local=' + encodeURIComponent(op.local));
    if (op.mesa) q.push('mesa=' + encodeURIComponent(op.mesa));
    if (op.origen) q.push('o=' + encodeURIComponent(op.origen));
    return base + 'pedir.html' + (q.length ? '?' + q.join('&') : '');
  };

  UI.copiar = async function (texto) {
    try { await global.navigator.clipboard.writeText(texto); UI.aviso('Copiado. Ya puedes pegarlo.', 'ok'); return true; }
    catch (e) {
      var t = document.createElement('textarea');
      t.value = texto; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(t); t.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e2) {}
      t.remove();
      UI.aviso(ok ? 'Copiado. Ya puedes pegarlo.' : 'No se pudo copiar: mantén el dedo sobre el enlace y elige «Copiar».', ok ? 'ok' : 'error');
      return ok;
    }
  };

  /* Ventana con el QR grande, para imprimir o descargar. */
  UI.hojaQR = function (op) {
    var img = UI.qrUrl(op.enlace, 600);
    var marca = op.logo ? '<img class="qr-logo" src="' + UI.esc(op.logo) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '';
    return UI.ventana({
      icono: '📱', titulo: op.titulo || 'Código QR',
      html: '<div class="hoja-qr imprimible" id="hoja-qr">' + marca +
        '<div class="qr-nombre">' + UI.esc(op.nombre || '') + '</div>' +
        (op.subtitulo ? '<div class="qr-sub">' + UI.esc(op.subtitulo) + '</div>' : '') +
        '<img class="qr-img" src="' + UI.esc(img) + '" alt="Código QR" width="260" height="260">' +
        '<div class="qr-llamado">' + UI.esc(op.llamado || 'Escanea y pide') + '</div>' +
        '<div class="qr-enlace">' + UI.esc(op.enlace.replace(/^https:\/\//, '')) + '</div></div>',
      botones: [
        { texto: 'Cerrar', valor: null, clase: 'secundario' },
        { texto: '⬇️ Descargar', valor: 'bajar', clase: 'borde' },
        { texto: '🖨️ Imprimir', valor: 'imprimir' }
      ]
    }).then(function (v) {
      if (v === 'bajar') global.open(img, '_blank', 'noopener');
      if (v === 'imprimir') imprimir(op, img, marca);
      return v;
    });
  };

  /* Imprime SOLO la hoja del QR (letra grande, centrada). */
  function imprimir(op, img, marca) {
    var cont = document.createElement('div');
    cont.className = 'solo-impresion';
    cont.innerHTML = '<div class="hoja-qr">' + marca + '<div class="qr-nombre">' + UI.esc(op.nombre || '') + '</div>' +
      (op.subtitulo ? '<div class="qr-sub">' + UI.esc(op.subtitulo) + '</div>' : '') +
      '<img class="qr-img" src="' + UI.esc(img) + '" alt="">' +
      '<div class="qr-llamado">' + UI.esc(op.llamado || 'Escanea y pide') + '</div><div class="qr-enlace">' + UI.esc(op.enlace.replace(/^https:\/\//, '')) + '</div></div>';
    document.body.appendChild(cont);
    document.body.classList.add('imprimiendo');
    var im = cont.querySelector('.qr-img');
    function listo() { global.print(); setTimeout(function () { document.body.classList.remove('imprimiendo'); cont.remove(); }, 500); }
    if (im.complete) setTimeout(listo, 100); else { im.onload = listo; im.onerror = listo; }
  }

  /* Botón único para compartir el enlace de pedidos. */
  UI.compartirEnlace = function (op) {
    var texto = op.texto || ('¡Haz tu pedido en ' + (op.nombre || 'nuestro local') + ' desde tu celular! 🍽️\nMenú con fotos, pago fácil y entrega rápida:\n' + op.enlace);
    return UI.ventana({
      icono: '🔗', titulo: op.titulo || 'Compartir enlace de pedidos',
      html: '<div class="compartir-enlace"><code>' + UI.esc(op.enlace) + '</code></div>' +
        '<div class="compartir-grid">' +
        '<button class="compartir-op" type="button" data-c="wa"><span>💬</span>WhatsApp</button>' +
        '<button class="compartir-op" type="button" data-c="estado"><span>🟢</span>Estado de WhatsApp</button>' +
        '<button class="compartir-op" type="button" data-c="ig"><span>📸</span>Instagram</button>' +
        '<button class="compartir-op" type="button" data-c="copiar"><span>📋</span>Copiar enlace</button>' +
        '<button class="compartir-op" type="button" data-c="qr"><span>📱</span>Código QR</button>' +
        (global.navigator.share ? '<button class="compartir-op" type="button" data-c="mas"><span>⋯</span>Más apps</button>' : '') +
        '</div><p class="ayuda" style="margin-top:12px">El mensaje ya va escrito: solo eliges a quién enviarlo.</p>',
      alAbrir: function (v) {
        v.addEventListener('click', function (e) {
          var b = e.target.closest('[data-c]');
          if (!b) return;
          var c = b.getAttribute('data-c');
          if (c === 'wa' || c === 'estado') UI.compartirWhatsApp(texto, '');
          if (c === 'copiar') UI.copiar(op.enlace);
          if (c === 'ig') { UI.copiar(op.enlace); UI.aviso('Enlace copiado: pégalo en tu biografía o en una historia con el sticker «Enlace».', 'ok'); }
          if (c === 'qr') UI.hojaQR({ titulo: 'QR de pedidos', nombre: op.nombre, subtitulo: op.subtitulo, enlace: op.enlace, logo: op.logo });
          if (c === 'mas') global.navigator.share({ title: op.nombre || 'Pedidos', text: texto, url: op.enlace }).catch(function () {});
        });
      },
      botones: [{ texto: 'Listo', valor: true, clase: 'secundario' }]
    });
  };

  /* Sonido de pedido nuevo (sin archivos). 3.1: los navegadores solo dejan sonar si
   * antes hubo un toque en la página: se «desbloquea» con el primer toque. */
  var audio = null;
  UI.desbloquearSonido = function () {
    try {
      audio = audio || new (global.AudioContext || global.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      var o = audio.createOscillator(), g = audio.createGain(); g.gain.value = 0.0001; o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.01);
    } catch (e) { /* sin audio */ }
  };
  ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) {
    document.addEventListener(ev, function una() { UI.desbloquearSonido(); document.removeEventListener(ev, una, true); }, true);
  });
  UI.sonar = function () {
    try {
      audio = audio || new (global.AudioContext || global.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      [0, 0.2, 0.4].forEach(function (t, i) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = 'triangle'; o.frequency.value = [880, 1175, 1568][i];
        g.gain.setValueAtTime(0.0001, audio.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.6, audio.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.18);
        o.connect(g); g.connect(audio.destination);
        o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.2);
      });
    } catch (e) { /* sin sonido en este equipo */ }
  };
  /* Notificación del sistema (se ve aunque la app esté en otra pestaña o minimizada). */
  UI.permisoNotificaciones = function () { return 'Notification' in global ? global.Notification.permission : 'no'; };
  UI.pedirNotificaciones = async function () {
    if (!('Notification' in global)) { UI.aviso('Este teléfono no permite notificaciones desde el navegador. En iPhone: instale la app en la pantalla de inicio.', 'error'); return 'no'; }
    var p = await global.Notification.requestPermission();
    UI.aviso(p === 'granted' ? 'Notificaciones activadas.' : 'No se activaron. Puede permitirlas en el candado 🔒 junto a la dirección.', p === 'granted' ? 'ok' : 'error');
    return p;
  };
  UI.notificar = function (titulo, texto) {
    try {
      if (UI.permisoNotificaciones() !== 'granted') return;
      var op = { body: texto, icon: 'iconos/icono-192.png', tag: 'pedido-nuevo', renotify: true, requireInteraction: true };
      if (global.navigator.serviceWorker && global.navigator.serviceWorker.controller) {
        global.navigator.serviceWorker.ready.then(function (r) { r.showNotification(titulo, op); });
      } else {
        var n = new global.Notification(titulo, op);
        n.onclick = function () { global.focus(); if (global.APP) global.APP.ir('pedidos'); n.close(); };
      }
    } catch (e) { /* sin notificación */ }
  };
  UI.vibrar = function (ms) { try { if (global.navigator.vibrate) global.navigator.vibrate(ms || 20); } catch (e) {} };
})(window);
