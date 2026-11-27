/**
 * ============================================================
 * RASTREO DEL MOTORIZADO (3.1.48) — solo mientras lleva un pedido
 * «En camino» y la app está abierta (privacidad: nunca fuera de la
 * entrega). Manda un punto por minuto y, si el teléfono lo permite,
 * mantiene la pantalla encendida durante la entrega.
 * RASTREO.actualizar(pedidosEnCamino) se llama cada vez que se
 * pinta «Mis entregas»; con lista vacía se detiene solo.
 *
 * 3.1.48:
 *  - La banda dice la verdad: verde solo si el último envío llegó;
 *    si no, explica qué pasa (buscando GPS, permiso bloqueado,
 *    sin GPS, sin conexión).
 *  - Nunca se envía una posición vieja como si fuera de ahora: si la
 *    última lectura pasó de 90 s, se pide una nueva primero.
 *  - Al cerrar sesión o vencer la sesión se apaga el GPS al instante.
 *  - Botón «Ayuda» (solo motorizado): mantener 2 s
 *    abre una hoja que prepara un WhatsApp para la administración con
 *    nombre, pedido, hora y ubicación. No envía nada solo; el
 *    motorizado toca «Enviar» en WhatsApp. Usa el WhatsApp del negocio
 *    que ya configura el administrador (no hay datos nuevos).
 * ============================================================
 */
(function (global) {
  'use strict';
  var UI = global.UI, DATOS = global.DATOS;
  var VIEJA_MS = 90000; // una lectura más vieja que esto no se envía
  var vigilancia = null, temporizador = null, pedidos = [], ultimo = null, candadoPantalla = null;
  var estado = 'buscando'; // buscando | ok | permiso | gps | red
  var ultimoEnvio = null, buscando = false, primeroPendiente = false, enviando = false, generacion = 0, confirmaciones = Object.create(null);

  function ahora() { return Date.now(); }
  function fresca() { return !!ultimo && ahora() - ultimo.t <= VIEJA_MS; }
  function dos(n) { return ('0' + n).slice(-2); }
  function hhmm(ms) { var d = new Date(ms); return dos(d.getHours()) + ':' + dos(d.getMinutes()); }
  function sesionActiva() { return !global.APP || !!global.APP.sesion; }

  var MENSAJES = {
    buscando: ['📡', 'Buscando tu ubicación… Sal a un lugar abierto y revisa que el GPS esté activado. Deja esta pantalla abierta.'],
    permiso: ['🚫', 'Tu teléfono bloqueó la ubicación. Actívala para esta app en los Ajustes del teléfono y vuelve aquí.'],
    gps: ['📍', 'No encontramos tu GPS. Revisa que la ubicación esté activada y sal a un lugar abierto. Se reintenta solo.'],
    parcial: ['📡', 'Ubicación confirmada solo para parte de tus pedidos. Reintentando… Deja esta pantalla abierta.'],
    pendiente: ['📡', 'Esperando confirmación del servidor. Deja esta pantalla abierta.'],
    red: ['📶', 'Sin conexión: el local no recibió tu ubicación. Se reintenta cada minuto. Deja esta pantalla abierta.']
  };

  function pintarBanda() {
    var b = global.document.getElementById('banda-rastreo');
    if (!b) return;
    b.hidden = !pedidos.length;
    if (!pedidos.length) return;
    var texto, icono;
    if (estado === 'ok') {
      icono = '📡';
      texto = 'Compartiendo tu ubicación con el local' + (ultimoEnvio ? '. Último envío: ' + hhmm(ultimoEnvio) : '') + '. Deja esta pantalla abierta.';
    } else { icono = MENSAJES[estado][0]; texto = MENSAJES[estado][1]; }
    b.className = 'banda' + (estado === 'ok' ? ' ok' : estado === 'buscando' ? '' : ' error');
    b.setAttribute('data-estado', estado);
    b.setAttribute('role', 'status');
    b.innerHTML = icono + ' <span></span>';
    b.lastChild.textContent = texto;
  }

  function cambiar(nuevo) { estado = nuevo; pintarBanda(); }

  function alPosicion(pos) {
    var c = pos && pos.coords;
    if (!c) return;
    ultimo = {
      lat: Math.round(c.latitude * 1e6) / 1e6, lng: Math.round(c.longitude * 1e6) / 1e6,
      precision: Math.round(c.accuracy || 0),
      t: typeof pos.timestamp === 'number' && pos.timestamp > 0 ? pos.timestamp : ahora()
    };
    if (estado === 'permiso' || estado === 'gps') cambiar('buscando');
    if (primeroPendiente && pedidos.length && !global.document.hidden) enviar(); // primer punto apenas haya GPS
  }

  function alError(err) {
    if (err && err.code === 1) return cambiar('permiso'); // PERMISSION_DENIED
    if (!fresca()) cambiar('gps'); // sin señal o tiempo agotado: avisar solo si no hay una lectura reciente
  }

  /* Pide una lectura nueva (sin usar la memoria del teléfono). */
  function pedirPosicionFresca() {
    if (buscando || !global.navigator.geolocation) return;
    buscando = true;
    var turno = generacion;
    global.navigator.geolocation.getCurrentPosition(function (pos) { if (turno !== generacion) return; buscando = false; alPosicion(pos); enviar(); },
      function (err) { if (turno !== generacion) return; buscando = false; alError(err); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }

  function enviar() {
    if (!sesionActiva()) { reiniciarTodo(); return Promise.resolve(); }
    if (!pedidos.length || global.document.hidden || enviando) return Promise.resolve();
    if (!fresca()) { // nunca se envía una posición vieja como si fuera de ahora
      if (estado === 'ok' || estado === 'red' || estado === 'parcial' || estado === 'pendiente') cambiar('buscando');
      pedirPosicionFresca();
      return Promise.resolve();
    }
    var punto = ultimo, lista = pedidos.slice(), turno = generacion;
    enviando = true;
    return Promise.all(lista.map(function (id) {
      return DATOS.pedir('rastreoPunto', { pedido_id: id, lat: punto.lat, lng: punto.lng, precision: punto.precision }).then(function (respuesta) {
        return { id: id, respuesta: respuesta };
      }, function () { return { id: id, error: true }; });
    })).then(function (resultados) {
      if (turno !== generacion || !sesionActiva() || !pedidos.length) return;
      var fallos = 0;
      resultados.forEach(function (x) {
        if (pedidos.indexOf(x.id) < 0) return;
        var v = x.respuesta, fecha = v && v.fecha ? Date.parse(v.fecha) : NaN;
        if (v && v.guardado === true) confirmaciones[x.id] = ahora();
        else if (v && v.motivo === 'intervalo_minimo' && isFinite(fecha) && Math.abs(ahora() - fecha) <= VIEJA_MS) confirmaciones[x.id] = fecha;
        else { delete confirmaciones[x.id]; if (x.error) fallos++; }
      });
      var n = pedidos.filter(function (id) { return confirmaciones[id] !== undefined && ahora() - confirmaciones[id] <= VIEJA_MS; }).length;
      primeroPendiente = false;
      if (n === pedidos.length) { ultimoEnvio = Math.min.apply(null, pedidos.map(function (id) { return confirmaciones[id]; })); cambiar('ok'); }
      else if (n) cambiar('parcial');
      else cambiar(fallos ? 'red' : 'pendiente');
    }).finally(function () { if (turno === generacion) enviando = false; });
  }

  async function mantenerPantalla() {
    var turno = generacion;
    try { if ('wakeLock' in global.navigator && !candadoPantalla) { var nuevo = await global.navigator.wakeLock.request('screen'); if (turno !== generacion || !pedidos.length || !sesionActiva() || candadoPantalla) { nuevo.release(); return; } candadoPantalla = nuevo; nuevo.addEventListener('release', function () { if (candadoPantalla === nuevo) candadoPantalla = null; }); } } catch (e) { /* no disponible */ }
  }

  function iniciar() {
    if (vigilancia !== null) return;
    if (!global.navigator.geolocation) { cambiar('gps'); return; }
    primeroPendiente = true;
    var turno = generacion;
    vigilancia = global.navigator.geolocation.watchPosition(function (p) { if (turno === generacion) alPosicion(p); }, function (e) { if (turno === generacion) alError(e); }, { enableHighAccuracy: true, maximumAge: 20000, timeout: 30000 });
    temporizador = setInterval(function () { if (turno === generacion) enviar(); }, 60000);
    setTimeout(function () { if (turno === generacion) enviar(); }, 8000);
    mantenerPantalla();
  }

  function detener() {
    if (vigilancia !== null && global.navigator.geolocation) global.navigator.geolocation.clearWatch(vigilancia);
    if (temporizador) clearInterval(temporizador);
    generacion++; enviando = false; confirmaciones = Object.create(null);
    vigilancia = null; temporizador = null; ultimo = null; ultimoEnvio = null; buscando = false; primeroPendiente = false;
    estado = 'buscando';
    try { if (candadoPantalla) candadoPantalla.release(); } catch (e) { /* ya liberado */ }
    candadoPantalla = null;
    pintarBanda();
  }


  /* ---------- Botón de ayuda (solo motorizado) ---------- */
  var AYUDA_MS = 2000;
  var ayuda = null, hoja = null, posAyuda = null, temporizadorAyuda = null, pistaAyuda = null;

  function esMotorizado() { var s = global.APP && global.APP.sesion; return !!s && s.rol === 'motorizado'; }

  function crear(tag, clase, texto) {
    var e = global.document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  /* Queda justo encima del menú de abajo (sin tapar sus palabras). */
  function ubicarAyuda() {
    if (!ayuda) return;
    var nav = global.document.getElementById('navegacion');
    var lateral = global.innerWidth >= 900;
    ayuda.style.bottom = lateral ? '20px' : ((nav ? nav.offsetHeight : 72) + 12) + 'px';
  }

  function cancelarPulso() {
    if (temporizadorAyuda) { clearTimeout(temporizadorAyuda); temporizadorAyuda = null; }
    if (ayuda) ayuda.classList.remove('pulsando');
  }

  function textoAyuda(nuevo) { if (ayuda) ayuda.lastChild.textContent = nuevo; }

  function pistaCorta() {
    textoAyuda('Mantén 2 s');
    if (pistaAyuda) clearTimeout(pistaAyuda);
    pistaAyuda = setTimeout(function () { textoAyuda('Ayuda'); }, 2500);
  }

  function pedidosEnCamino() {
    var r = [];
    global.document.querySelectorAll('.pedido').forEach(function (a) {
      var n = a.querySelector('.pedido-num');
      if (n && /En camino/i.test(a.textContent || '')) r.push(String(n.textContent).trim());
    });
    return r;
  }

  function mejorPosicion() {
    if (fresca()) return ultimo;
    if (posAyuda && ahora() - posAyuda.t <= 5 * 60000) return posAyuda;
    return null;
  }

  function mensajeAyuda() {
    var s = (global.APP && global.APP.sesion) || {}, peds = pedidosEnCamino(), pos = mejorPosicion();
    return '🆘 AYUDA: ' + String(s.nombre || 'Un motorizado') + ' (motorizado) necesita ayuda.' +
      (peds.length ? '\nPedido: ' + peds.join(', ') : '') +
      '\nHora: ' + hhmm(ahora()) +
      (pos ? '\nUbicación: https://www.google.com/maps?q=' + pos.lat + ',' + pos.lng : '\nUbicación: no disponible');
  }

  function cerrarHoja() {
    if (!hoja) return;
    global.document.removeEventListener('keydown', alTeclaHoja);
    hoja.remove(); hoja = null;
    if (ayuda) try { ayuda.focus(); } catch (e) { /* sin foco */ }
  }
  function alTeclaHoja(e) { if (e.key === 'Escape') cerrarHoja(); }

  function abrirHoja() {
    if (hoja || !esMotorizado()) return;
    var numero = global.UI && UI.digitos ? UI.digitos((global.APP.publico || {}).whatsapp) : '';
    hoja = crear('div', 'ayuda-fondo');
    hoja.addEventListener('click', function (e) { if (e.target === hoja) cerrarHoja(); });
    var caja = crear('div', 'ayuda-hoja');
    caja.setAttribute('role', 'dialog'); caja.setAttribute('aria-modal', 'true'); caja.setAttribute('aria-labelledby', 'ayuda-titulo');
    caja.appendChild(crear('div', 'ayuda-asa'));
    var t = crear('h2', 'ayuda-titulo', '¿Necesitas ayuda?'); t.id = 'ayuda-titulo'; caja.appendChild(t);
    caja.appendChild(crear('p', 'ayuda-texto', numero
      ? 'Preparamos un WhatsApp para la administración con tu nombre, tu pedido y tu ubicación. Tú solo tocas «Enviar».'
      : 'La administración todavía no tiene un WhatsApp configurado. Avísale por otro medio.'));
    var est = crear('p', 'ayuda-estado', ''); est.setAttribute('role', 'status');
    var avisar = crear('button', 'ayuda-avisar', 'Avisar por WhatsApp'); avisar.type = 'button';
    avisar.addEventListener('click', function () {
      if (!numero) { est.textContent = 'No hay un WhatsApp configurado.'; return; }
      global.open(UI.enlaceWhatsApp(numero, mensajeAyuda()), '_blank', 'noopener');
      cerrarHoja();
    });
    var cancelar = crear('button', 'ayuda-cancelar', 'Cancelar'); cancelar.type = 'button';
    cancelar.addEventListener('click', cerrarHoja);
    if (numero) caja.appendChild(est);
    if (numero) caja.appendChild(avisar);
    caja.appendChild(cancelar);
    hoja.appendChild(caja);
    global.document.body.appendChild(hoja);
    global.document.addEventListener('keydown', alTeclaHoja);
    (numero ? avisar : cancelar).focus();
    // Mientras decide, se busca la ubicación para que vaya en el mensaje.
    if (numero) {
      if (mejorPosicion()) est.textContent = 'Ubicación lista.';
      else if (global.navigator.geolocation) {
        est.textContent = 'Buscando tu ubicación…';
        global.navigator.geolocation.getCurrentPosition(function (pos) {
          posAyuda = { lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6, t: ahora() };
          est.textContent = 'Ubicación lista.';
        }, function () { est.textContent = 'No se pudo leer tu ubicación; el aviso irá sin ella.'; }, { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
      } else est.textContent = 'No se pudo leer tu ubicación; el aviso irá sin ella.';
    }
  }

  function asegurarAyuda() {
    if (!esMotorizado()) return quitarAyuda();
    if (ayuda) return ubicarAyuda();
    ayuda = crear('button', 'btn-ayuda');
    ayuda.type = 'button'; ayuda.id = 'btn-ayuda';
    ayuda.setAttribute('aria-label', 'Pedir ayuda a la administración. Mantén presionado 2 segundos');
    var ico = crear('span', 'ayuda-ico', '🆘'); ico.setAttribute('aria-hidden', 'true');
    ayuda.appendChild(ico); ayuda.appendChild(crear('span', 'ayuda-txt', 'Ayuda'));
    ayuda.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button > 0) return;
      cancelarPulso();
      ayuda.classList.add('pulsando');
      temporizadorAyuda = setTimeout(function () {
        temporizadorAyuda = null; ayuda.classList.remove('pulsando');
        try { if (global.navigator.vibrate) global.navigator.vibrate(40); } catch (x) { /* sin vibración */ }
        abrirHoja();
      }, AYUDA_MS);
    });
    ayuda.addEventListener('pointerup', function () { if (temporizadorAyuda) { cancelarPulso(); pistaCorta(); } });
    ['pointerleave', 'pointercancel'].forEach(function (ev) { ayuda.addEventListener(ev, cancelarPulso); });
    ayuda.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    ayuda.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirHoja(); } });
    global.document.body.appendChild(ayuda);
    ubicarAyuda();
  }

  function quitarAyuda() {
    cancelarPulso(); cerrarHoja(); posAyuda = null;
    if (pistaAyuda) { clearTimeout(pistaAyuda); pistaAyuda = null; }
    if (ayuda) { ayuda.remove(); ayuda = null; }
  }
  global.addEventListener('resize', ubicarAyuda);

  function reiniciarTodo() { pedidos = []; detener(); quitarAyuda(); }

  global.document.addEventListener('visibilitychange', function () {
    if (global.document.hidden || !pedidos.length) return;
    mantenerPantalla();
    if (fresca()) enviar(); else { if (estado === 'ok' || estado === 'red') cambiar('buscando'); pedirPosicionFresca(); }
  });

  // Cerrar sesión o vencer la sesión apaga el GPS al instante (privacidad).
  global.addEventListener('app:sesion-terminada', reiniciarTodo);
  if (global.APP && typeof global.APP.salir === 'function') {
    var salirOriginal = global.APP.salir;
    global.APP.salir = async function () {
      var r = await salirOriginal.apply(this, arguments);
      if (!sesionActiva()) reiniciarTodo();
      return r;
    };
  }

  global.RASTREO = {
    actualizar: function (lista) {
      var nueva = (lista || []).filter(function (id, i, arr) { return arr.indexOf(id) === i; });
      var cambio = nueva.length !== pedidos.length || nueva.some(function (id) { return pedidos.indexOf(id) < 0; });
      pedidos = nueva;
      Object.keys(confirmaciones).forEach(function (id) { if (pedidos.indexOf(id) < 0) delete confirmaciones[id]; });
      if (pedidos.length) { iniciar(); if (cambio && fresca()) { cambiar('buscando'); enviar(); } } else detener();
      pintarBanda();
      asegurarAyuda();
    },
    detener: reiniciarTodo,
    estado: function () { return estado; }
  };
})(window);
