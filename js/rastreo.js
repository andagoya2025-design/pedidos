/**
 * ============================================================
 * RASTREO DEL MOTORIZADO (3.1) — solo mientras lleva un pedido
 * «En camino» y la app está abierta (privacidad: nunca fuera de la
 * entrega). Manda un punto por minuto y, si el teléfono lo permite,
 * mantiene la pantalla encendida durante la entrega.
 * RASTREO.actualizar(pedidosEnCamino) se llama cada vez que se
 * pinta «Mis entregas»; con lista vacía se detiene solo.
 * ============================================================
 */
(function (global) {
  'use strict';
  var UI = global.UI, DATOS = global.DATOS;
  var vigilancia = null, temporizador = null, pedidos = [], ultimo = null, candadoPantalla = null;

  function enviar() {
    if (!ultimo || !pedidos.length || document.hidden) return;
    pedidos.forEach(function (id) {
      DATOS.pedir('rastreoPunto', { pedido_id: id, lat: ultimo.lat, lng: ultimo.lng, precision: ultimo.precision }).catch(function () { /* sin red: va el siguiente */ });
    });
    pintarBanda(true);
  }

  async function mantenerPantalla() {
    try { if ('wakeLock' in global.navigator && !candadoPantalla) { candadoPantalla = await global.navigator.wakeLock.request('screen'); candadoPantalla.addEventListener('release', function () { candadoPantalla = null; }); } } catch (e) { /* no disponible */ }
  }

  function pintarBanda(ok) {
    var b = document.getElementById('banda-rastreo');
    if (!b) return;
    b.hidden = !pedidos.length;
    b.innerHTML = '📡 <span>' + (ok ? 'Compartiendo tu ubicación con el local mientras llevas el pedido. Deja esta pantalla abierta.' : 'Activa el GPS para que el local vea tu avance.') + '</span>';
  }

  function iniciar() {
    if (vigilancia !== null || !('geolocation' in global.navigator)) return;
    vigilancia = global.navigator.geolocation.watchPosition(function (pos) {
      ultimo = { lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6, precision: Math.round(pos.coords.accuracy || 0) };
    }, function () { pintarBanda(false); }, { enableHighAccuracy: true, maximumAge: 20000, timeout: 30000 });
    temporizador = setInterval(enviar, 60000); // una vez por minuto, solo durante la entrega
    setTimeout(enviar, 8000);
    mantenerPantalla();
  }

  function detener() {
    if (vigilancia !== null) global.navigator.geolocation.clearWatch(vigilancia);
    if (temporizador) clearInterval(temporizador);
    vigilancia = null; temporizador = null; ultimo = null;
    try { if (candadoPantalla) candadoPantalla.release(); } catch (e) {}
    candadoPantalla = null;
    pintarBanda(true);
  }

  document.addEventListener('visibilitychange', function () { if (!document.hidden && pedidos.length) { mantenerPantalla(); enviar(); } });

  global.RASTREO = {
    actualizar: function (lista) {
      pedidos = (lista || []).slice();
      if (pedidos.length) iniciar(); else detener();
      pintarBanda(true);
    },
    detener: function () { pedidos = []; detener(); }
  };
})(window);
