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
  var T = 256, reloj = null, datos = null, solicitud = 0;

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
        tiles += '<img alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility=\'hidden\'" src="https://tile.openstreetmap.org/' + z + '/' + txx + '/' + ty + '.png" style="left:' + Math.round(tx * T - x0) + 'px;top:' + Math.round(ty * T - y0) + 'px">';
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
      '<span class="mapa-credito">© OpenStreetMap</span></div>';
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
      var respuesta = await DATOS.pedir('monitoreo', { local_id: local });
      if (n !== solicitud || local !== APP.local || sesion !== APP.sesion || !UI.$('#mn-cuerpo')) return;
      datos = respuesta; pintar();
    } catch (err) {
      if (n === solicitud && local === APP.local && sesion === APP.sesion && UI.$('#mn-cuerpo')) UI.$('#mn-cuerpo').innerHTML = '<div class="banda error">⚠️ <span>' + UI.esc(err.message) + '</span></div>';
    }
  }

  function pintar() {
    var c = UI.$('#mn-cuerpo');
    if (!c) return;
    var m = datos.motorizados || [];
    var cuenta = function (e) { return m.filter(function (x) { return x.estado === e; }).length; };
    var puntos = m.filter(function (x) { return x.ultimo_punto && x.estado === 'en_camino'; }).map(function (x) {
      return { lat: x.ultimo_punto.lat, lng: x.ultimo_punto.lng, etiqueta: String(x.nombre).split(' ')[0], color: x.pedidos.every(function (p) { return p.estado !== 'En camino' || p.gps_estado === 'confirmado'; }) && !x.alertas.length ? '#2b8a3e' : '#d97706' };
    });
    c.innerHTML =
      '<div class="resumen-mini">' +
      '<div><b>' + cuenta('en_camino') + '</b><span>en camino</span></div>' +
      '<div><b>' + (cuenta('libre') + cuenta('asignado')) + '</b><span>libres o por salir</span></div>' +
      '<div class="' + (datos.alertas ? 'mal' : '') + '"><b>' + datos.alertas + '</b><span>alertas</span></div></div>' +
      '<div class="tarjeta"><div class="item-titulo">Ubicación de entregas activas</div><div class="item-sub">Última consulta: ' + UI.esc(UI.hora(datos.ahora)) + ' · Verde: señal confirmada; ámbar: revisar estado.</div>' + (puntos.length ? UI.mapaPuntos(puntos, { ancho: Math.max(220, Math.min(600, (c.clientWidth || 340) - 28)), alto: 240 }) : '<div class="mapa-vacio">Sin puntos GPS confirmados de entregas activas.</div>') + '</div>' +
      (m.length ? '<div class="lista" style="margin-top:12px">' + m.map(tarjeta).join('') + '</div>' : UI.vacio('🛵', 'No hay motorizados activos.')) +
      '<details class="tarjeta guia-gps" style="margin-top:16px"><summary>💡 ¿Cómo ver al motorizado aunque tenga el teléfono bloqueado?</summary>' +
      '<p>Esta app avisa la ubicación cada minuto <b>solo mientras lleva un pedido y tiene la app abierta</b>. Para verlo todo el turno, pídale que comparta su ubicación con usted en <b>Google Maps</b> (foto → Compartir ubicación → su cuenta) y que la apague al terminar. Es lo más confiable y es gratis.</p>' +
      '<p class="ayuda">Por la ley de protección de datos: solo durante el turno, nunca fuera de él, y avíseles por escrito que se hace.</p></details>';
    UI.$$('[data-llamar]', c).forEach(function (b) { b.addEventListener('click', function () { global.location.href = 'tel:' + UI.digitos(b.getAttribute('data-llamar')); }); });
    UI.$$('[data-wa]', c).forEach(function (b) { b.addEventListener('click', function () { UI.abrirWhatsApp(b.getAttribute('data-wa'), 'Hola ' + b.getAttribute('data-nombre') + ', ¿cómo vas con el pedido?'); }); });
    UI.$$('[data-ruta]', c).forEach(function (b) { b.addEventListener('click', function () { verRuta(b.getAttribute('data-ruta'), b.getAttribute('data-num')); }); });
  }

  function estadoGps(p) {
    var e = { confirmado: ['GPS confirmado', 'ok'], sin_senal: ['Señal interrumpida', 'aviso'], esperando: ['Esperando señal GPS', 'aviso'], pendiente: ['Esperando salida', ''] }[p.gps_estado] || ['GPS sin confirmar', 'aviso'];
    return '<span class="etiqueta ' + e[1] + '">' + e[0] + '</span>' + (p.gps_fecha ? '<span class="item-sub"> · ' + UI.esc(UI.hora(p.gps_fecha)) + '</span>' : '');
  }

  function tarjeta(m) {
    var e = ESTADO[m.estado] || ESTADO.fuera;
    var nombre = String(m.nombre).split(' ')[0];
    var hace = m.ultimo_punto ? UI.minutosDesde(m.ultimo_punto.fecha, datos.ahora) : null;
    return '<article class="tarjeta monitor ' + (m.alertas.length ? 'con-alerta' : '') + '">' +
      '<div class="monitor-cabeza"><div class="avatar">' + (m.foto_url ? '<img src="' + UI.esc(m.foto_url) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '') + UI.esc(UI.iniciales(m.nombre)) + '</div>' +
      '<div class="item-cuerpo"><div class="item-titulo">' + UI.esc(m.nombre) + (m.placa ? ' <small>' + UI.esc(m.placa) + '</small>' : '') + '</div>' +
      '<div class="item-sub"><span class="etiqueta ' + e.c + '">' + e.t + '</span>' + (m.turno_inicio ? ' · turno desde ' + UI.esc(UI.hora(m.turno_inicio)) : '') + '</div></div></div>' +
      (m.alertas.length ? '<div class="alertas">' + m.alertas.map(function (a) { return '<div class="alerta ' + a.tipo + '">' + (ICONO_ALERTA[a.tipo] || '⚠️') + ' ' + UI.esc(a.texto) + '</div>'; }).join('') + '</div>' : '') +
      m.pedidos.map(function (p) {
        return '<div class="monitor-pedido"><div class="monitor-linea"><b>' + UI.esc(p.numero) + '</b><span>' + UI.esc(p.cliente) + '</span>' + UI.chipEstado(p.estado) + '</div>' +
          (p.en_camino ? '<div class="item-sub">Salió ' + UI.esc(UI.hora(p.en_camino)) + ' (' + UI.minutosDesde(p.en_camino, datos.ahora) + ' min)' + (p.hora_estimada ? ' · llega ' + UI.esc(UI.hora(p.hora_estimada)) : '') + '</div>' : '') +
          '<div class="monitor-linea">' + estadoGps(p) + '</div>' +
          (p.estado === 'En camino' ? '<button class="btn borde chico" type="button" data-ruta="' + UI.esc(p.id) + '" data-num="' + UI.esc(p.numero) + '">🗺️ Ver recorrido</button>' : '') + '</div>';
      }).join('') +
      '<div class="monitor-datos"><span>Hoy: <b>' + m.hoy.entregas + '</b> entregas</span>' + (m.hoy.minutos !== null ? '<span>⏱️ ' + m.hoy.minutos + ' min</span>' : '') + (m.hoy.estrellas !== null ? '<span>⭐ ' + m.hoy.estrellas + '</span>' : '') +
      '<span>💵 Debe ' + UI.esc(UI.dinero(m.debe)) + '</span></div>' +
      (m.ultimo_punto ? '<div class="item-sub">📍 Último punto: hace ' + hace + ' min · <a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + m.ultimo_punto.lat + ',' + m.ultimo_punto.lng + '">abrir en Maps</a></div>' : '') +
      '<div class="acciones"><button class="btn secundario chico" type="button" data-llamar="' + UI.esc(m.celular) + '">📞 Llamar</button>' +
      '<button class="btn secundario chico" type="button" data-wa="' + UI.esc(m.celular) + '" data-nombre="' + UI.esc(nombre) + '">💬 WhatsApp</button></div></article>';
  }

  async function verRuta(id, numero) {
    try {
      var r = await DATOS.pedir('rutaPedido', { pedido_id: id });
      UI.ventana({
        icono: '🗺️', titulo: 'Recorrido de ' + numero,
        html: (r.puntos.length ? UI.mapaPuntos(r.puntos, { ruta: true, ancho: 340, alto: 260 }) +
          '<p class="ayuda">🔵 salida · 🟢 último punto · ' + r.puntos.length + ' punto(s), uno por minuto.</p>' : '<p>Aún no hay puntos: el motorizado debe tener la app abierta mientras lleva el pedido.</p>'),
        botones: [{ texto: 'Cerrar', valor: true, clase: 'secundario' }]
      });
    } catch (err) { UI.error('No se pudo abrir', err.message); }
  }
})(window);
