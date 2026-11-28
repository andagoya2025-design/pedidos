/**
 * ============================================================
 * MONITOREO DE MOTORIZADOS (3.1) — dueño y cajero.
 * Quién está en turno, quién lleva pedidos, último punto y alertas
 * (atrasado, sin señal, detenido). Se actualiza sola cada minuto
 * SOLO mientras esta pantalla está abierta y visible.
 * También: UI.mapaPuntos(puntos, op) — mapa liviano (OpenStreetMap)
 * con marcas y, si se pide, la ruta dibujada. Lo usa el informe.
 * ============================================================
 */
(function (global) {
  'use strict';
  var UI = global.UI, DATOS = global.DATOS, APP = global.APP;
  var T = 256, reloj = null, datos = null, solicitud = 0, ultimoContexto = null;

  /* ---------- Mapa liviano de puntos y ruta ---------- */
  function aPixel(lat, lng, z) {
    var n = T * Math.pow(2, z), s = Math.sin(lat * Math.PI / 180);
    return { x: (lng + 180) / 360 * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
  }
  UI.mapaPuntos = function (puntos, op) {
    op = op || {};
    var ok = (puntos || []).filter(function (p) { return isFinite(p.lat) && isFinite(p.lng) && p.lat !== '' && p.lng !== ''; });
    if (!ok.length) return '<div class="mapa-vacio">Sin puntos para mostrar en el mapa.</div>';
    var ancho = op.ancho || 340, alto = op.alto || 220, z = 17;
    var lats = ok.map(function (p) { return Number(p.lat); }), lngs = ok.map(function (p) { return Number(p.lng); });
    var n = Math.max.apply(null, lats), s = Math.min.apply(null, lats), e = Math.max.apply(null, lngs), o = Math.min.apply(null, lngs);
    for (; z > 3; z--) { var a = aPixel(n, o, z), b = aPixel(s, e, z); if (b.x - a.x < ancho - 50 && b.y - a.y < alto - 50) break; }
    var c1 = aPixel(n, o, z), c2 = aPixel(s, e, z);
    var cx = (c1.x + c2.x) / 2, cy = (c1.y + c2.y) / 2, x0 = cx - ancho / 2, y0 = cy - alto / 2;
    var tiles = '', max = Math.pow(2, z);
    for (var tx = Math.floor(x0 / T); tx <= Math.floor((x0 + ancho) / T); tx++) {
      for (var ty = Math.floor(y0 / T); ty <= Math.floor((y0 + alto) / T); ty++) {
        if (ty < 0 || ty >= max) continue;
        var txx = ((tx % max) + max) % max;
        tiles += '<img alt="" loading="lazy" crossorigin="anonymous" referrerpolicy="strict-origin-when-cross-origin" onerror="this.style.visibility=\'hidden\';this.closest(\'.mapa-puntos\').querySelector(\'.mapa-error\').hidden=false" src="https://tile.openstreetmap.org/' + z + '/' + txx + '/' + ty + '.png" style="left:' + Math.round(tx * T - x0) + 'px;top:' + Math.round(ty * T - y0) + 'px">';
      }
    }
    var px = ok.map(function (p) { var q = aPixel(Number(p.lat), Number(p.lng), z); return { x: Math.round(q.x - x0), y: Math.round(q.y - y0), p: p }; });
    var svg = '<svg viewBox="0 0 ' + ancho + ' ' + alto + '" aria-hidden="true">' +
      (op.ruta && px.length > 1 ? '<polyline points="' + px.map(function (q) { return q.x + ',' + q.y; }).join(' ') + '" fill="none" stroke="#e8590c" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>' : '') +
      px.map(function (q, i) {
        var fin = op.ruta && i === px.length - 1, ini = op.ruta && i === 0;
        if (op.ruta && !ini && !fin) return '';
        return '<g><circle cx="' + q.x + '" cy="' + q.y + '" r="9" fill="' + (q.p.color || (fin ? '#2b8a3e' : ini ? '#1c7ed6' : '#e8590c')) + '" stroke="#fff" stroke-width="3"/>' +
          (q.p.etiqueta ? '<text x="' + q.x + '" y="' + (q.y - 14) + '" text-anchor="middle" font-size="12" font-weight="800" fill="#212529" stroke="#fff" stroke-width="3" paint-order="stroke">' + UI.esc(q.p.etiqueta) + '</text>' : '') + '</g>';
      }).join('') + '</svg>';
    return '<div class="mapa-puntos" style="height:' + alto + 'px"><div class="mapa-lienzo" style="width:' + ancho + 'px;height:' + alto + 'px">' + tiles + svg + '</div>' +
      '<div class="mapa-error" role="status" hidden>Mapa base no disponible. Los puntos GPS y el recorrido se conservan. <a href="https://www.openstreetmap.org/?mlat=' + Number(ok[0].lat) + '&amp;mlon=' + Number(ok[0].lng) + '#map=17/' + Number(ok[0].lat) + '/' + Number(ok[0].lng) + '" target="_blank" rel="noopener">Abrir mapa</a></div>' +
      '<a class="mapa-credito" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a></div>';
  };

  /* ---------- Pantalla de monitoreo ---------- */
  var ESTADO = {
    en_camino: { t: '🛵 En camino', c: 'ok' }, asignado: { t: '📦 Con pedido asignado', c: 'aviso' },
    libre: { t: '🟢 En turno, libre', c: 'ok' }, fuera: { t: '⚪ Fuera de turno', c: '' }
  };
  var ICONO_ALERTA = { atraso: '⏰', senal: '📵', detenido: '🛑' };

  APP.vistas.monitoreo = {
    titulo: 'Monitoreo', icono: '📡', orden: 45, roles: ['dueno', 'cajero'],
    pintar: function (cont) {
      cont.innerHTML = UI.encabezado('📡 Monitoreo', 'Centro de seguimiento · actualización cada minuto con la app abierta') + '<div id="mn-cuerpo">' + UI.esqueleto(3) + '</div>';
      UI.$('[data-actualizar]', cont).addEventListener('click', function (e) { UI.trabajando(e.currentTarget, cargar); });
      cargar();
      if (reloj) clearInterval(reloj);
      reloj = setInterval(function () {
        if (!UI.$('#mn-cuerpo')) { clearInterval(reloj); reloj = null; return; } // salió de la pantalla
        if (!document.hidden) cargar();
      }, 60000);
    }
  };

  async function cargar() {
    var n = ++solicitud, local = APP.local, sesion = APP.sesion;
    try {
      var respuesta = await DATOS.pedir('monitoreoSeguro', { local_id: local });
      if (n !== solicitud || local !== APP.local || sesion !== APP.sesion || !UI.$('#mn-cuerpo')) return;
      if (!respuesta || respuesta.gps_version !== 2) { var error = new Error('Servidor de monitoreo anterior'); error.codigo = 'VERSION_GPS'; throw error; }
      datos = respuesta; ultimoContexto = {local:local,sesion:sesion}; pintar();
    } catch (err) {
      if (n !== solicitud || local !== APP.local || sesion !== APP.sesion || !UI.$('#mn-cuerpo')) return;
      // Mantener los últimos datos del mismo local con aviso inequívoco de desconexión; jamás reutilizar otro contexto.
      var c = UI.$('#mn-cuerpo');
      if (err.codigo !== 'ACCION' && err.codigo !== 'VERSION_GPS' && err.codigo !== 'SESION' && err.codigo !== 'PERMISO' && datos && ultimoContexto && ultimoContexto.local === local && ultimoContexto.sesion === sesion) {
        pintar(true);
      } else c.innerHTML = '<div class="banda error">⚠️ <span>' + UI.esc((err.codigo === 'ACCION' || err.codigo === 'VERSION_GPS') ? 'El centro de monitoreo necesita el servidor 3.1.32. Contacta al administrador. Los demás módulos siguen disponibles.' : err.message) + '</span></div>';
    }
  }

  function pintar(sinConexion) {
    var c = UI.$('#mn-cuerpo');
    if (!c) return;
    var m = datos.motorizados || [];
    var cuenta = function (e) { return m.filter(function (x) { return x.estado === e; }).length; };
    var puntos = m.filter(function (x) { return x.ultimo_punto && x.estado === 'en_camino'; }).map(function (x) {
      return { lat: x.ultimo_punto.lat, lng: x.ultimo_punto.lng, etiqueta: String(x.nombre).split(' ')[0], color: !sinConexion && x.pedidos.every(function (p) { return p.estado !== 'En camino' || p.gps_estado === 'confirmado'; }) && !x.alertas.length ? '#2b8a3e' : '#d97706' };
    });
    c.innerHTML =
      (sinConexion ? '<div class="banda error monitor-desconexion" role="status">⚠️ <span>Sin actualización. Mostrando la última consulta de este local; el GPS no está confirmado en vivo.</span></div>' : '') +
      '<div class="resumen-mini monitor-resumen">' +
      '<div><b>' + cuenta('en_camino') + '</b><span>En camino</span></div>' +
      '<div><b>' + cuenta('asignado') + '</b><span>Por salir</span></div>' +
      '<div><b>' + cuenta('libre') + '</b><span>Disponibles</span></div>' +
      '<div class="' + (datos.alertas ? 'mal' : '') + '"><b>' + datos.alertas + '</b><span>alertas</span></div></div>' +
      '<div class="tarjeta monitor-mapa"><div class="item-titulo">Ubicación de entregas activas</div><div class="item-sub">Última consulta: ' + UI.esc(UI.hora(datos.ahora)) + ' · Verde: señal confirmada; ámbar: revisar estado.</div>' + (puntos.length ? UI.mapaPuntos(puntos, { ancho: Math.max(220, Math.min(600, (c.clientWidth || 340) - 28)), alto: 240 }) : '<div class="mapa-vacio">Sin puntos GPS confirmados de entregas activas.</div>') + '</div>' +
      (m.length ? '<div class="lista" style="margin-top:12px">' + m.map(function (x) { return tarjeta(x, sinConexion); }).join('') + '</div>' : UI.vacio('🛵', 'No hay motorizados activos.')) +
      '<details class="tarjeta guia-gps" style="margin-top:16px"><summary>💡 ¿Cómo ver al motorizado aunque tenga el teléfono bloqueado?</summary>' +
      '<p>Esta app avisa la ubicación cada minuto <b>solo mientras lleva un pedido y tiene la app abierta</b>. Para verlo todo el turno, pídale que comparta su ubicación con usted en <b>Google Maps</b> (foto → Compartir ubicación → su cuenta) y que la apague al terminar. Es lo más confiable y es gratis.</p>' +
      '<p class="ayuda">Por la ley de protección de datos: solo durante el turno, nunca fuera de él, y avíseles por escrito que se hace.</p></details>';
    UI.$$('[data-llamar]', c).forEach(function (b) { b.addEventListener('click', function () { global.location.href = 'tel:' + UI.digitos(b.getAttribute('data-llamar')); }); });
    UI.$$('[data-wa]', c).forEach(function (b) { b.addEventListener('click', function () { UI.abrirWhatsApp(b.getAttribute('data-wa'), 'Hola ' + b.getAttribute('data-nombre') + ', ¿cómo vas con el pedido?'); }); });
    UI.$$('[data-ruta]', c).forEach(function (b) { b.addEventListener('click', function () { verRuta(b.getAttribute('data-ruta'), b.getAttribute('data-num')); }); });
  }

  function estadoGps(p, sinConexion) {
    var e = { confirmado: ['GPS confirmado', 'ok'], sin_senal: ['Señal interrumpida', 'aviso'], esperando: ['Esperando señal GPS', 'aviso'], pendiente: ['Esperando salida', ''] }[p.gps_estado] || ['GPS sin confirmar', 'aviso'];
    if (sinConexion && p.estado === 'En camino') e = ['Última señal sin actualizar', 'aviso'];
    return '<span class="etiqueta ' + e[1] + '">' + e[0] + '</span>' + (p.gps_fecha ? '<span class="item-sub"> · ' + UI.esc(UI.hora(p.gps_fecha)) + '</span>' : '');
  }

  function tarjeta(m, sinConexion) {
    var e = ESTADO[m.estado] || ESTADO.fuera;
    var nombre = String(m.nombre).split(' ')[0];
    var hace = m.ultimo_punto ? UI.minutosDesde(m.ultimo_punto.fecha, datos.ahora) : null;
    var activos = m.pedidos.filter(function(p){return p.estado === 'En camino';});
    var confirmados = sinConexion ? 0 : activos.filter(function(p){return p.gps_estado === 'confirmado';}).length;
    return '<article class="tarjeta monitor ' + (m.alertas.length ? 'con-alerta' : '') + '">' +
      '<div class="monitor-cabeza"><div class="avatar">' + (m.foto_url ? '<img src="' + UI.esc(m.foto_url) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '') + UI.esc(UI.iniciales(m.nombre)) + '</div>' +
      '<div class="item-cuerpo"><div class="item-titulo">' + UI.esc(m.nombre) + (m.placa ? ' <small>' + UI.esc(m.placa) + '</small>' : '') + '</div>' +
      '<div class="item-sub"><span class="etiqueta ' + e.c + '">' + e.t + '</span>' + (m.turno_inicio ? ' · turno desde ' + UI.esc(UI.hora(m.turno_inicio)) : '') + '</div></div></div>' +
      (activos.length ? '<div class="monitor-cobertura" role="status"><span>' + (sinConexion ? 'Señal sin actualizar' : 'Señal confirmada') + '</span><b>' + confirmados + ' de ' + activos.length + '</b></div>' : '') +
      (m.alertas.length ? '<div class="alertas">' + m.alertas.map(function (a) { return '<div class="alerta ' + a.tipo + '">' + (ICONO_ALERTA[a.tipo] || '⚠️') + ' ' + UI.esc(a.texto) + '</div>'; }).join('') + '</div>' : '') +
      m.pedidos.map(function (p) {
        return '<div class="monitor-pedido"><div class="monitor-linea"><b>' + UI.esc(p.numero) + '</b><span>' + UI.esc(p.cliente) + '</span>' + UI.chipEstado(p.estado) + '</div>' +
          (p.en_camino ? '<div class="item-sub">Salió ' + UI.esc(UI.hora(p.en_camino)) + ' (' + UI.minutosDesde(p.en_camino, datos.ahora) + ' min)' + (p.hora_estimada ? ' · llega ' + UI.esc(UI.hora(p.hora_estimada)) : '') + '</div>' : '') +
          '<div class="monitor-linea monitor-gps">' + estadoGps(p, sinConexion) + '</div>' +
          (p.estado === 'En camino' ? '<button class="btn borde chico" type="button" data-ruta="' + UI.esc(p.id) + '" data-num="' + UI.esc(p.numero) + '">🗺️ Ver recorrido</button>' : '') + '</div>';
      }).join('') +
      '<div class="monitor-datos"><span>Hoy: <b>' + m.hoy.entregas + '</b> entregas</span>' + (m.hoy.minutos !== null ? '<span>⏱️ ' + m.hoy.minutos + ' min</span>' : '') + (m.hoy.estrellas !== null ? '<span>⭐ ' + m.hoy.estrellas + '</span>' : '') +
      '<span>💵 Debe' + (APP.local && APP.local !== 'TODOS' ? ' en este local' : '') + ' ' + UI.esc(UI.dinero(m.debe)) + '</span></div>' +
      (m.ultimo_punto ? '<div class="item-sub">📍 Último punto: hace ' + hace + ' min · <a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + m.ultimo_punto.lat + ',' + m.ultimo_punto.lng + '">abrir en Maps</a></div>' : '') +
      '<div class="acciones"><button class="btn secundario chico" type="button" data-llamar="' + UI.esc(m.celular) + '">📞 Llamar</button>' +
      '<button class="btn secundario chico" type="button" data-wa="' + UI.esc(m.celular) + '" data-nombre="' + UI.esc(nombre) + '">💬 WhatsApp</button></div></article>';
  }

  global.addEventListener('online', function () { if (APP.sesion && UI.$('#mn-cuerpo') && !document.hidden) cargar(); });
  global.addEventListener('offline', function () {
    var c = UI.$('#mn-cuerpo'); if (!c) return;
    solicitud++;
    if (APP.sesion && datos && ultimoContexto && ultimoContexto.local === APP.local && ultimoContexto.sesion === APP.sesion) pintar(true);
    else c.innerHTML = '<div class="banda error" role="status">⚠️ <span>Sin conexión para consultar este local.</span></div>';
  });

  async function verRuta(id, numero) {
    var local = APP.local, sesion = APP.sesion;
    try {
      var r = await DATOS.pedir('rutaPedido', { pedido_id: id });
      if (local !== APP.local || sesion !== APP.sesion || !UI.$('#mn-cuerpo')) return;
      UI.ventana({
        icono: '🗺️', titulo: 'Recorrido de ' + numero,
        html: (r.puntos.length ? UI.mapaPuntos(r.puntos, { ruta: true, ancho: Math.max(220, Math.min(340, (global.innerWidth || 360) - 48)), alto: 260 }) +
          '<p class="ayuda">🔵 salida · 🟢 último punto · ' + r.puntos.length + ' punto(s), uno por minuto.</p>' : '<p>Aún no hay puntos: el motorizado debe tener la app abierta mientras lleva el pedido.</p>'),
        botones: [{ texto: 'Cerrar', valor: true, clase: 'secundario' }]
      });
    } catch (err) { if (local === APP.local && sesion === APP.sesion && UI.$('#mn-cuerpo')) UI.error('No se pudo abrir', err.message); }
  }
})(window);
