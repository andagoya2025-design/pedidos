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
  var versiones = Object.create(null), tramos = Object.create(null), secuencia = 0, epocaRed = 0, solicitudGps = 0, reenviar = false;

  function ahora() { return Date.now(); }
  function fresca() { return !!ultimo && ahora() - ultimo.t <= VIEJA_MS && ultimo.t - ahora() <= 15000; }
  function sinRed() { return global.navigator.onLine === false; }
  function dos(n) { return ('0' + n).slice(-2); }
  function hhmm(ms) { var d = new Date(ms); return dos(d.getHours()) + ':' + dos(d.getMinutes()); }
  function sesionActiva() { return !global.APP || !!global.APP.sesion; }

  var MENSAJES = {
    buscando: ['📡', 'Buscando tu ubicación… Sal a un lugar abierto y revisa que el GPS esté activado. Deja esta pantalla abierta.'],
    permiso: ['🚫', 'Tu teléfono bloqueó la ubicación. Actívala para esta app en los Ajustes del teléfono y vuelve aquí.'],
    gps: ['📍', 'No encontramos tu GPS. Revisa que la ubicación esté activada y sal a un lugar abierto. Se reintenta solo.'],
    parcial: ['📡', 'Ubicación confirmada solo para parte de tus pedidos. Reintentando… Deja esta pantalla abierta.'],
    pendiente: ['📡', 'Esperando confirmación del servidor. Deja esta pantalla abierta.'],
    servidor: ['📡', 'Para varios pedidos, el local necesita actualizar el servidor de rastreo. Avísale al administrador.'],
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
    if (!c || typeof c.latitude !== 'number' || typeof c.longitude !== 'number' || !isFinite(c.latitude) || !isFinite(c.longitude) || Math.abs(c.latitude) > 90 || Math.abs(c.longitude) > 180) { if (!fresca()) cambiar('gps'); return; }
    var t = typeof pos.timestamp === 'number' && pos.timestamp > 0 ? pos.timestamp : ahora();
    if (t - ahora() > 15000 || ahora() - t > VIEJA_MS || ultimo && t < ultimo.t) return;
    var lat = Math.round(c.latitude * 1e6) / 1e6, lng = Math.round(c.longitude * 1e6) / 1e6;
    var id = ultimo && ultimo.t === t && ultimo.lat === lat && ultimo.lng === lng ? ultimo.id : t.toString(36) + '-' + Math.random().toString(36).slice(2, 12) + '-' + (++secuencia).toString(36);
    ultimo = { lat:lat, lng:lng, precision:Math.round(c.accuracy || 0), t:t, id:id };
    if (!sinRed() && (estado === 'permiso' || estado === 'gps')) cambiar('buscando');
    if (primeroPendiente && pedidos.length && !global.document.hidden) enviar(); // primer punto apenas haya GPS
  }

  function alError(err) {
    if (err && err.code === 1) { ultimo = null; confirmaciones = Object.create(null); epocaRed++; solicitudGps++; buscando = false; reenviar = false; primeroPendiente = true; return cambiar('permiso'); }
    if (!fresca()) cambiar('gps'); // sin señal o tiempo agotado: avisar solo si no hay una lectura reciente
  }

  /* Pide una lectura nueva (sin usar la memoria del teléfono). */
  function pedirPosicionFresca() {
    if (buscando || !global.navigator.geolocation || sinRed()) return;
    buscando = true;
    var turno = generacion, solicitud = ++solicitudGps;
    global.navigator.geolocation.getCurrentPosition(function (pos) { if (turno !== generacion || solicitud !== solicitudGps) return; buscando = false; alPosicion(pos); enviar(); },
      function (err) { if (turno !== generacion || solicitud !== solicitudGps) return; buscando = false; alError(err); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }

  function enviar() {
    if (!sesionActiva()) { reiniciarTodo(); return Promise.resolve(); }
    if (!pedidos.length || global.document.hidden || enviando) return Promise.resolve();
    if (sinRed()) { cambiar('red'); return Promise.resolve(); }
    if (!fresca()) {
      if (estado === 'ok' || estado === 'red' || estado === 'parcial' || estado === 'pendiente') cambiar('buscando');
      pedirPosicionFresca(); return Promise.resolve();
    }
    var punto = ultimo, lista = pedidos.slice(), turno = generacion, red = epocaRed, vigentes = Object.create(null);
    lista.forEach(function (id) { vigentes[id] = versiones[id]; });
    enviando = true;
    var datos = { lat:punto.lat, lng:punto.lng, precision:punto.precision, muestra_id:punto.id, capturado_ms:punto.t };
    if (lista.some(function(id){return !!tramos[id];})) { datos.gps_tramos = Object.create(null); lista.forEach(function(id){if(tramos[id]) datos.gps_tramos[id]=tramos[id];}); }
    var operacion = lista.length === 1 ?
      DATOS.pedir('rastreoPunto', Object.assign({ pedido_id:lista[0] }, datos)).then(function (v) { return [{ id:lista[0], respuesta:v }]; }) :
      DATOS.pedir('rastreoLote', Object.assign({ pedido_ids:lista }, datos)).then(function (v) {
        var porId = Object.create(null);
        (v && Array.isArray(v.resultados) ? v.resultados : []).forEach(function (x) { porId[String(x.pedido_id)] = x; });
        return lista.map(function (id) { return { id:id, respuesta:porId[id] }; });
      });
    return operacion.catch(function (e) {
      return lista.map(function (id) { return { id:id, error:true, servidor:e && e.codigo === 'ACCION' }; });
    }).then(function (resultados) {
      if (turno !== generacion || red !== epocaRed || sinRed() || !sesionActiva() || !pedidos.length) return;
      var fallos = 0, servidor = false, antigua = false;
      resultados.forEach(function (x) {
        if (pedidos.indexOf(x.id) < 0 || vigentes[x.id] !== versiones[x.id]) return;
        var v = x.respuesta, fecha = v && v.fecha ? Date.parse(v.fecha) : NaN;
        if (v && (v.guardado === true || v.motivo === 'intervalo_minimo') && isFinite(fecha) && ahora() - fecha <= VIEJA_MS && fecha - ahora() <= 15000) confirmaciones[x.id] = fecha;
        else if (v && v.guardado === true && !v.fecha) confirmaciones[x.id] = ahora(); // respuesta válida del servidor anterior para un solo pedido
        else { delete confirmaciones[x.id]; if (x.error) fallos++; if (x.servidor) servidor = true; if (v && (v.motivo === 'ubicacion_antigua' || v.motivo === 'tramo_cambiado')) antigua = true; }
      });
      var n = pedidos.filter(function (id) { return confirmaciones[id] !== undefined && ahora() - confirmaciones[id] <= VIEJA_MS; }).length;
      primeroPendiente = false;
      if (n === pedidos.length) { ultimoEnvio = Math.min.apply(null, pedidos.map(function (id) { return confirmaciones[id]; })); cambiar('ok'); }
      else if (n) cambiar('parcial');
      else cambiar(servidor ? 'servidor' : fallos ? 'red' : 'pendiente');
      if (antigua && ultimo === punto) ultimo = null;
    }).finally(function () {
      if (turno !== generacion) return;
      enviando = false;
      if (reenviar) { reenviar = false; enviar(); }
    });
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
    generacion++; solicitudGps++; epocaRed++; enviando = false; reenviar = false; confirmaciones = Object.create(null); versiones = Object.create(null); tramos = Object.create(null);
    vigilancia = null; temporizador = null; ultimo = null; ultimoEnvio = null; buscando = false; primeroPendiente = false;
    estado = 'buscando';
    try { if (candadoPantalla) candadoPantalla.release(); } catch (e) { /* ya liberado */ }
    candadoPantalla = null;
    pintarBanda();
  }


  /* ---------- Botón de ayuda (solo motorizado) ----------
   * 3.1.33: UN SOLO TOQUE. Avisa a la administración de inmediato (sale en su app con sonido y una banda roja).
   * Luego ofrece avisar también por WhatsApp o marcar «Falsa alarma». Nunca dice «enviado» sin la confirmación del servidor. */
  var ayuda = null, hoja = null, posAyuda = null, aviso = null;

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
  function alTeclaHoja(e) { if (e.key === 'Escape' && !(aviso && aviso.estado === 'enviando')) cerrarHoja(); }

  function numeroAyuda() { return global.UI && global.UI.digitos ? global.UI.digitos((global.APP.publico || {}).whatsapp) : ''; }

  function nuevoIdAyuda() {
    var letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = 'AYU-' + ahora().toString(36).toUpperCase();
    for (var i = 0; i < 6; i++) s += letras.charAt(Math.floor(Math.random() * letras.length));
    return s;
  }

  /* Muestra la ventana de ayuda con botones: [{ clase, texto, alClick }]. Reemplaza la anterior sin cerrar la sesión de aviso. */
  function mostrarHoja(titulo, texto, botones) {
    var anterior = hoja;
    var nueva = crear('div', 'ayuda-fondo');
    nueva.addEventListener('click', function (e) { if (e.target === nueva && !(aviso && aviso.estado === 'enviando')) cerrarHoja(); });
    var caja = crear('div', 'ayuda-hoja');
    caja.setAttribute('role', 'dialog'); caja.setAttribute('aria-modal', 'true'); caja.setAttribute('aria-labelledby', 'ayuda-titulo');
    caja.appendChild(crear('div', 'ayuda-asa'));
    var t = crear('h2', 'ayuda-titulo', titulo); t.id = 'ayuda-titulo'; caja.appendChild(t);
    if (texto) { var p = crear('p', 'ayuda-texto', texto); p.setAttribute('role', 'status'); caja.appendChild(p); }
    var primero = null;
    botones.forEach(function (b) {
      var x = crear('button', b.clase, b.texto); x.type = 'button'; x.addEventListener('click', b.alClick); caja.appendChild(x);
      if (!primero) primero = x;
    });
    nueva.appendChild(caja);
    global.document.body.appendChild(nueva);
    if (anterior) anterior.remove();
    hoja = nueva;
    global.document.removeEventListener('keydown', alTeclaHoja);
    global.document.addEventListener('keydown', alTeclaHoja);
    if (primero) primero.focus();
  }

  function abrirWhatsAppAyuda() {
    var numero = numeroAyuda();
    if (!numero) return;
    global.open(global.UI.enlaceWhatsApp(numero, mensajeAyuda()), '_blank', 'noopener');
  }

  function botonesFinales(mensajeCancelar) {
    var b = [];
    if (numeroAyuda()) b.push({ clase: 'ayuda-avisar', texto: 'Avisar también por WhatsApp', alClick: abrirWhatsAppAyuda });
    b.push({ clase: 'ayuda-cancelar', texto: 'Falsa alarma', alClick: falsaAlarma });
    b.push({ clase: 'ayuda-cancelar', texto: 'Cerrar', alClick: cerrarHoja });
    return b;
  }

  function mostrarEnviado(extra) {
    var sinUbic = aviso && !aviso.pos;
    mostrarHoja('✅ Aviso enviado',
      (extra ? extra + ' ' : '') + 'Tu aviso quedó registrado y aparece en la app de la administración' + (sinUbic ? ' (sin ubicación: no se pudo leer)' : ' con tu ubicación') + '. Si es seguro, quédate donde estás.',
      botonesFinales());
  }

  function mostrarError() {
    var numero = numeroAyuda(), viejo = aviso && aviso.servidorViejo;
    var b = [];
    if (numero) b.push({ clase: 'ayuda-avisar', texto: 'Avisar por WhatsApp', alClick: abrirWhatsAppAyuda });
    b.push({ clase: numero ? 'ayuda-cancelar' : 'ayuda-avisar', texto: 'Reintentar', alClick: function () { if (aviso) enviarAyuda(aviso.pos); } });
    b.push({ clase: 'ayuda-cancelar', texto: 'Cerrar', alClick: cerrarHoja });
    mostrarHoja('⚠️ No se pudo avisar a la app',
      (viejo ? 'La app de la administración todavía no recibe estos avisos. ' : 'Revisa tu conexión a internet. ') + (numero ? 'Avisa por WhatsApp o vuelve a intentar.' : 'No hay un WhatsApp configurado: avisa por otro medio.'), b);
  }

  function enviarAyuda(pos) {
    var mio = aviso;
    if (!mio) return;
    mio.estado = 'enviando'; mio.pos = pos || null; mio.servidorViejo = false;
    mostrarHoja('🆘 Avisando…', 'Estamos avisando a la administración.', []);
    var datos = { ayuda_id: mio.id };
    if (pos) { datos.lat = pos.lat; datos.lng = pos.lng; datos.precision = pos.precision || 0; }
    global.DATOS.pedir('ayudaAviso', datos).then(function (r) {
      if (aviso !== mio) return;
      if (r && r.guardado === true) { if (r.ayuda_id) mio.id = String(r.ayuda_id); mio.estado = 'enviado'; mostrarEnviado(r.ya_activo ? 'Ya habías avisado y la administración aún no lo marca como atendido.' : ''); }
      else { mio.estado = 'error'; mostrarError(); }
    }, function (e) {
      if (aviso !== mio) return;
      mio.estado = 'error'; mio.servidorViejo = !!(e && e.codigo === 'ACCION'); mostrarError();
    });
  }

  function falsaAlarma() {
    var mio = aviso;
    if (!mio || mio.estado !== 'enviado') return;
    mio.estado = 'enviando';
    mostrarHoja('Cancelando…', 'Estamos avisando que fue una falsa alarma.', []);
    global.DATOS.pedir('ayudaAviso', { ayuda_id: mio.id, accion: 'falsa' }).then(function (r) {
      if (aviso !== mio) return;
      if (r && r.cancelado === true) {
        aviso = null;
        mostrarHoja('Falsa alarma registrada', 'Avisamos a la administración que fue una falsa alarma. Gracias.', [{ clase: 'ayuda-cancelar', texto: 'Cerrar', alClick: cerrarHoja }]);
      } else { mio.estado = 'enviado'; mostrarEnviado('No se pudo cancelar el aviso. Inténtalo otra vez.'); }
    }, function () {
      if (aviso !== mio) return;
      mio.estado = 'enviado'; mostrarEnviado('No se pudo cancelar el aviso: revisa tu conexión e inténtalo otra vez.');
    });
  }

  /* Ubicación lo más rápida posible: la que ya hay, o una lectura de hasta 3 s. Un pánico no espera al GPS. */
  function posicionRapida(listo) {
    var p = mejorPosicion();
    if (p) return listo(p);
    if (!global.navigator.geolocation) return listo(null);
    var hecho = false, espera = null;
    function fin(pos) { if (hecho) return; hecho = true; if (espera) clearTimeout(espera); listo(pos); }
    espera = setTimeout(function () { fin(null); }, 3500);
    global.navigator.geolocation.getCurrentPosition(function (pos) {
      var c = pos && pos.coords;
      if (!c) return fin(null);
      posAyuda = { lat: Math.round(c.latitude * 1e6) / 1e6, lng: Math.round(c.longitude * 1e6) / 1e6, precision: Math.round(c.accuracy || 0), t: ahora() };
      fin(posAyuda);
    }, function () { fin(null); }, { enableHighAccuracy: true, maximumAge: 120000, timeout: 3000 });
  }

  function pulsarAyuda() {
    if (!esMotorizado() || hoja) return; // con una ventana abierta no se duplica
    try { if (global.navigator.vibrate) global.navigator.vibrate(60); } catch (x) { /* sin vibración */ }
    var mio = aviso = { id: nuevoIdAyuda(), estado: 'enviando', pos: null, servidorViejo: false };
    mostrarHoja('🆘 Avisando…', 'Estamos avisando a la administración.', []);
    posicionRapida(function (pos) { if (aviso === mio && hoja) enviarAyuda(pos); });
  }

  function asegurarAyuda() {
    if (!esMotorizado()) return quitarAyuda();
    if (ayuda) return ubicarAyuda();
    ayuda = crear('button', 'btn-ayuda');
    ayuda.type = 'button'; ayuda.id = 'btn-ayuda';
    ayuda.setAttribute('aria-label', 'Pedir ayuda a la administración. Un solo toque avisa de inmediato');
    var ico = crear('span', 'ayuda-ico', '🆘'); ico.setAttribute('aria-hidden', 'true');
    ayuda.appendChild(ico); ayuda.appendChild(crear('span', 'ayuda-txt', 'Ayuda'));
    ayuda.addEventListener('click', pulsarAyuda);
    ayuda.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    global.document.body.appendChild(ayuda);
    ubicarAyuda();
  }

  function quitarAyuda() {
    aviso = null; cerrarHoja(); posAyuda = null;
    if (ayuda) { ayuda.remove(); ayuda = null; }
  }
  global.addEventListener('resize', ubicarAyuda);

  function reiniciarTodo() { pedidos = []; detener(); quitarAyuda(); }

  function cambioRed(enLinea) {
    if (!pedidos.length || !sesionActiva()) return;
    epocaRed++; solicitudGps++; buscando = false; ultimo = null; confirmaciones = Object.create(null);
    if (!enLinea) { reenviar = false; cambiar('red'); return; }
    cambiar('buscando');
    if (global.document.hidden) return;
    if (enviando) reenviar = true;
    pedirPosicionFresca();
  }
  global.addEventListener('online', function () { cambioRed(true); });
  global.addEventListener('offline', function () { cambioRed(false); });

  global.document.addEventListener('visibilitychange', function () {
    if (global.document.hidden || !pedidos.length) return;
    mantenerPantalla();
    if (fresca()) enviar(); else { if (estado === 'ok' || estado === 'red') cambiar('buscando'); pedirPosicionFresca(); }
  });

  /* 3.1.51: «Activar mi ubicación». Pide el permiso del teléfono ANTES de salir y explica el resultado.
   * Prueba local: no guarda ni envía nada al servidor. */
  var probandoUbicacion = false;

  function pasosAjustes() {
    var ua = String((global.navigator && global.navigator.userAgent) || '');
    if (/iPhone|iPad|iPod/.test(ua)) {
      return '<ol><li>Abre <b>Ajustes</b> del iPhone.</li><li>Entra a <b>Privacidad y seguridad</b> → <b>Localización</b>.</li><li>Toca <b>Safari</b> (o <b>MiPedido</b>) y elige <b>Mientras se usa la app</b>.</li><li>Activa <b>Ubicación precisa</b> y vuelve aquí.</li></ol>';
    }
    return '<ol><li>Abre <b>Ajustes</b> del teléfono.</li><li>Entra a <b>Aplicaciones</b> → <b>Chrome</b> (o <b>MiPedido</b>) → <b>Permisos</b>.</li><li>Toca <b>Ubicación</b> y elige <b>Permitir</b> (con ubicación exacta).</li><li>Vuelve aquí y toca otra vez «Activar mi ubicación».</li></ol>';
  }

  function mostrarUbicacion(resultado, precision) {
    var UI = global.UI;
    if (!UI || typeof UI.ventana !== 'function') return Promise.resolve();
    var limite = '<p>Recuerda: tu ubicación se envía <b>solo mientras MiPedido está abierta</b> y con la pantalla encendida.</p>';
    var op = {
      ok: { icono: '✅', titulo: 'Tu ubicación funciona', html: '<p>Precisión aproximada: <b>' + Math.round(precision || 0) + ' m</b>.</p>' + ((precision || 0) > 100 ? '<p>La precisión es baja. Activa la ubicación exacta (alta precisión) del teléfono y sal a un lugar abierto.</p>' : '') + limite },
      permiso: { icono: '🚫', titulo: 'La ubicación está bloqueada', html: '<p>El teléfono no deja que MiPedido use tu ubicación. Actívala así:</p>' + pasosAjustes() },
      senal: { icono: '📡', titulo: 'No encontramos señal GPS', html: '<p>Activa la <b>ubicación</b> del teléfono, sal a un lugar abierto y vuelve a intentarlo.</p>' + limite },
      soporte: { icono: '📵', titulo: 'Este navegador no permite la ubicación', html: '<p>Abre MiPedido en <b>Chrome</b> (Android) o en <b>Safari</b> (iPhone).</p>' }
    }[resultado];
    op.botones = [{ texto: 'Entendido', valor: true }];
    return UI.ventana(op);
  }

  function activarUbicacion(boton) {
    if (probandoUbicacion || !esMotorizado()) return;
    var original = boton ? boton.textContent : '';
    function fin() { probandoUbicacion = false; if (boton) { boton.disabled = false; boton.textContent = original; } }
    if (!global.navigator.geolocation) { mostrarUbicacion('soporte'); return; }
    probandoUbicacion = true;
    if (boton) { boton.disabled = true; boton.textContent = 'Buscando tu ubicación…'; }
    global.navigator.geolocation.getCurrentPosition(
      function (pos) { fin(); mostrarUbicacion('ok', pos && pos.coords ? pos.coords.accuracy : 0); },
      function (err) { fin(); mostrarUbicacion(err && err.code === 1 ? 'permiso' : 'senal'); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }

  global.document.addEventListener('click', function (e) {
    var b = e && e.target && typeof e.target.closest === 'function' ? e.target.closest('#btn-ubic-activar') : null;
    if (b) activarUbicacion(b);
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
    actualizar: function (lista, rutas) {
      if (!esMotorizado()) { reiniciarTodo(); return; }
      var nueva = (lista || []).filter(function (id, i, arr) { return arr.indexOf(id) === i; });
      var nuevosTramos = Object.create(null);
      nueva.forEach(function (id) { if (rutas && rutas[id]) nuevosTramos[id] = String(rutas[id]); });
      var agregados = nueva.filter(function (id) { return pedidos.indexOf(id) < 0 || nuevosTramos[id] !== tramos[id]; });
      agregados.forEach(function(id){delete confirmaciones[id];});
      tramos = nuevosTramos;
      var estabaActivo = pedidos.length > 0;
      pedidos = nueva;
      Object.keys(versiones).forEach(function (id) { if (pedidos.indexOf(id) < 0) { delete confirmaciones[id]; delete versiones[id]; } });
      agregados.forEach(function (id) { versiones[id] = ++secuencia; });
      if (pedidos.length) {
        iniciar();
        if (estabaActivo && agregados.length) {
          ultimo = null; solicitudGps++; buscando = false; cambiar('buscando');
          if (enviando) reenviar = true;
          if (!global.document.hidden) pedirPosicionFresca();
        }
      } else detener();
      pintarBanda();
      asegurarAyuda();
    },
    detener: reiniciarTodo,
    estado: function () { return estado; }
  };
})(window);
