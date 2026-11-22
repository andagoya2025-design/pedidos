/**
 * ============================================================
 * INFORME DE MOTORIZADOS (3.1) — solo el dueño.
 * Por período: entregas, minutos, puntualidad, estrellas, caja
 * (cobrado / entregado / diferencia), propinas, horas de turno,
 * km aprox., lo que ganó, costo por entrega, zonas, comparación
 * con el período anterior, meta y bono. Ranking con semáforo,
 * detalle por entrega con su recorrido, Excel y resumen por WhatsApp.
 * ============================================================
 */
(function (global) {
  'use strict';
  var UI = global.UI, DATOS = global.DATOS, APP = global.APP;
  var rango = null, datos = null;
  var SEMAFORO = { verde: { i: '🟢', t: 'Bien' }, amarillo: { i: '🟡', t: 'Revisar' }, rojo: { i: '🔴', t: 'Atención' } };
  var PAGO = { entrega: 'por entrega', dia: 'por día', sueldo: 'sueldo' };

  function sumarDias(ymd, n) { var d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function rapido(k, hoy) {
    if (k === 'ayer') return [sumarDias(hoy, -1), sumarDias(hoy, -1)];
    if (k === '7') return [sumarDias(hoy, -6), hoy];
    if (k === '30') return [sumarDias(hoy, -29), hoy];
    if (k === 'mes') return [hoy.slice(0, 8) + '01', hoy];
    return [hoy, hoy];
  }
  function v(x, suf) { return x === null || x === undefined || x === '' ? '—' : x + (suf || ''); }
  function flecha(ahora, antes, mejorAlto) {
    if (ahora === null || antes === null || antes === undefined || ahora === antes) return '';
    var sube = ahora > antes, bueno = mejorAlto ? sube : !sube;
    return ' <small class="' + (bueno ? 'sube' : 'baja') + '">' + (sube ? '▲' : '▼') + '</small>';
  }

  APP.vistas.informeMotos = {
    titulo: 'Informe motos', icono: '🏍️', orden: 62, roles: ['dueno'],
    pintar: function (cont) {
      rango = rango || { desde: '', hasta: '' };
      cont.innerHTML = UI.encabezado('🏍️ Informe de motorizados', 'Rendimiento, caja y pagos por período',
        '<button class="btn borde chico" type="button" id="im-excel">⬇️ Excel</button>') +
        '<div class="filtros" id="im-rapidos">' + [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7', '7 días'], ['30', '30 días'], ['mes', 'Este mes']].map(function (x) {
          return '<button class="pestana" type="button" data-r="' + x[0] + '" aria-selected="false">' + x[1] + '</button>';
        }).join('') + '</div>' +
        '<details class="otras-fechas"><summary>📅 Otras fechas</summary>' +
        '<div class="fila-campos"><div class="campo"><label for="im-desde">Desde</label><input class="entrada" type="date" id="im-desde" value="' + UI.esc(rango.desde) + '"></div>' +
        '<div class="campo"><label for="im-hasta">Hasta</label><input class="entrada" type="date" id="im-hasta" value="' + UI.esc(rango.hasta) + '"></div></div></details>' +
        '<div id="im-cuerpo">' + UI.esqueleto(4) + '</div>';
      UI.$('[data-actualizar]', cont).addEventListener('click', function (e) { UI.trabajando(e.currentTarget, cargar); });
      UI.$('#im-excel', cont).addEventListener('click', excel);
      ['#im-desde', '#im-hasta'].forEach(function (s) { UI.$(s, cont).addEventListener('change', cargar); });
      UI.$$('[data-r]', cont).forEach(function (b) {
        b.addEventListener('click', function () {
          var r = rapido(b.getAttribute('data-r'), (datos && datos.hoy) || UI.hoy());
          UI.$('#im-desde').value = r[0]; UI.$('#im-hasta').value = r[1];
          UI.$$('[data-r]', cont).forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
          cargar();
        });
      });
      cargar();
    }
  };

  async function cargar() {
    var c = UI.$('#im-cuerpo');
    if (!c) return;
    c.innerHTML = UI.esqueleto(4);
    try {
      datos = await DATOS.pedir('informeMotorizados', { desde: UI.$('#im-desde').value, hasta: UI.$('#im-hasta').value, local_id: APP.local });
      rango = { desde: datos.desde, hasta: datos.hasta };
      if (UI.$('#im-desde')) { UI.$('#im-desde').value = datos.desde; UI.$('#im-hasta').value = datos.hasta; }
      marcarPeriodo();
      pintar();
    } catch (err) {
      if (UI.$('#im-cuerpo')) UI.$('#im-cuerpo').innerHTML = '<div class="banda error">⚠️ <span>' + UI.esc(err.message) + '</span></div>';
    }
  }

  /* Marca el botón (Hoy, Ayer, 7 días…) que coincide con las fechas elegidas. */
  function marcarPeriodo() {
    var hoy = datos.hoy || UI.hoy();
    UI.$$('#im-rapidos [data-r]').forEach(function (b) {
      var r = rapido(b.getAttribute('data-r'), hoy);
      b.setAttribute('aria-selected', String(r[0] === datos.desde && r[1] === datos.hasta));
    });
  }

  function totales(l) {
    var s = function (k) { return l.reduce(function (a, m) { return a + (Number(m[k]) || 0); }, 0); };
    return { entregas: s('entregas'), efectivo: s('efectivo'), diferencia: s('diferencia'), propinas: s('propinas'), gano: s('gano'), bono: s('bono'), km: s('km'), horas: s('horas') };
  }

  function pintar() {
    var c = UI.$('#im-cuerpo');
    if (!c) return;
    var l = datos.motorizados || [];
    if (!l.length) { c.innerHTML = UI.vacio('🏍️', 'No hay entregas de motorizados en este período.'); return; }
    var t = totales(l), pago = t.gano + t.bono;
    c.innerHTML =
      '<div class="resumen-mini rk-resumen">' +
      '<div><b>' + t.entregas + '</b><span>entregas</span></div>' +
      '<div><b>' + UI.esc(UI.dinero(t.efectivo)) + '</b><span>efectivo cobrado</span></div>' +
      '<div class="' + (t.diferencia < 0 ? 'mal' : '') + '"><b>' + UI.esc(UI.dinero(t.diferencia)) + '</b><span>diferencia en caja</span></div>' +
      '<div><b>' + UI.esc(UI.dinero(pago)) + '</b><span>a pagarles' + (t.entregas && pago ? ' · ' + UI.esc(UI.dinero(pago / t.entregas)) + ' c/u' : '') + '</span></div></div>' +
      (datos.meta_entregas_dia ? '<div class="banda">🎯 <span>Meta: ' + datos.meta_entregas_dia + ' entregas por día' + (datos.bono_meta ? ' · bono ' + UI.esc(UI.dinero(datos.bono_meta)) + ' por día cumplido' : '') + '.</span></div>'
        : '<div class="banda">🎯 <span>Puede poner una meta diaria y un bono en Menú → «🔗 Enlace y ajustes» → Motorizados y entrega.</span></div>') +
      '<h3 style="margin:14px 0 8px">🏆 Ranking</h3><div class="lista">' + l.map(function (m, i) {
        var s = SEMAFORO[m.semaforo] || SEMAFORO.verde, a = m.anterior || {};
        var dato = function (etq, val, extra, clase) {
          return '<div class="rk-dato' + (clase ? ' ' + clase : '') + '"><span>' + etq + '</span><b>' + val + (extra || '') + '</b></div>';
        };
        var celdas = [dato('Entregas', m.entregas, flecha(m.entregas, a.entregas, true))];
        if (m.minutos !== null && m.minutos !== undefined && m.minutos !== '') celdas.push(dato('Tiempo promedio', m.minutos + ' min', flecha(m.minutos, a.minutos, false)));
        if (m.puntualidad !== null && m.puntualidad !== undefined && m.puntualidad !== '') celdas.push(dato('Puntualidad', m.puntualidad + ' %'));
        if (m.estrellas !== null && m.estrellas !== undefined && m.estrellas !== '') celdas.push(dato('Calificación', m.estrellas + ' ⭐', flecha(m.estrellas, a.estrellas, true)));
        celdas.push(dato('Cobrado', UI.esc(UI.dinero(m.efectivo))));
        if (m.diferencia) celdas.push(dato('Diferencia en caja', UI.esc(UI.dinero(m.diferencia)), '', m.diferencia < 0 ? 'mal' : ''));
        if (m.horas) celdas.push(dato('Horas de turno', m.horas + ' h'));
        if (m.km) celdas.push(dato('Recorrido', '~' + m.km + ' km'));
        if (m.gano !== null && m.gano !== undefined) celdas.push(dato('A pagarle', UI.esc(UI.dinero((m.gano || 0) + (m.bono || 0)))));
        if (m.dias_meta !== null && m.dias_meta !== undefined) celdas.push(dato('Días con meta', m.dias_meta));
        return '<button class="tarjeta rk-tarjeta" type="button" data-id="' + UI.esc(m.id) + '">' +
          '<div class="rk-cabeza"><div class="ranking-pos rk-' + UI.esc(m.semaforo || 'verde') + '">' + (i + 1) + '</div>' +
          '<div class="item-cuerpo"><div class="item-titulo">' + UI.esc(m.nombre) + '</div>' +
          '<div class="item-sub">' + (m.placa ? 'Placa ' + UI.esc(m.placa) + ' · ' : '') + s.i + ' ' + s.t + '</div></div>' +
          '<span class="rk-flecha" aria-hidden="true">›</span></div>' +
          '<div class="rk-datos">' + celdas.join('') + '</div></button>';
      }).join('') + '</div>' +
      '<p class="ayuda rk-ayuda">🟢 Bien · 🟡 Revisar · 🔴 Atención. <button class="enlace" type="button" id="im-colores">¿Qué significa?</button></p>' +
      '<button class="btn secundario bloque" type="button" id="im-wa">💬 Enviarme el resumen por WhatsApp</button>';
    UI.$$('[data-id]', c).forEach(function (b) { b.addEventListener('click', function () { detalle(b.getAttribute('data-id')); }); });
    UI.$('#im-wa', c).addEventListener('click', resumenWhatsApp);
    UI.$('#im-colores', c).addEventListener('click', function () {
      UI.ventana({ icono: '🚦', titulo: '¿Qué significan los colores?',
        html: '<div class="lista rk-leyenda">' +
          '<div class="item"><div class="item-cuerpo"><div class="item-titulo">🟢 Bien</div><div class="item-sub">Llega a tiempo y los clientes lo califican bien.</div></div></div>' +
          '<div class="item"><div class="item-cuerpo"><div class="item-titulo">🟡 Revisar</div><div class="item-sub">Llega a tiempo menos del 85 % de las veces, tiene menos de 4,3 ⭐ o le anularon pedidos en camino.</div></div></div>' +
          '<div class="item"><div class="item-cuerpo"><div class="item-titulo">🔴 Atención</div><div class="item-sub">Falta dinero en su caja, tiene 2 o más malas notas o llega a tiempo menos del 60 % de las veces.</div></div></div>' +
          '</div><p class="ayuda">▲▼ comparan con el período anterior (' + UI.esc(datos.anterior.desde) + ' a ' + UI.esc(datos.anterior.hasta) + '). Los km son aproximados, según el GPS.</p>' });
    });
  }

  async function detalle(id) {
    try {
      var r = await DATOS.pedir('informeMotorizados', { desde: rango.desde, hasta: rango.hasta, local_id: APP.local, motorizado_id: id });
      var m = r.motorizados[0];
      if (!m) return;
      var problemas = (m.detalle || []).filter(function (d) { return (d.estrellas && d.estrellas <= 2) || d.a_tiempo === false; });
      var elegido = await UI.ventana({
        icono: '🏍️', titulo: m.nombre,
        html: '<div class="datos-grid">' +
          '<div><span>Entregas</span><b>' + m.entregas + '</b></div><div><span>Minutos promedio</span><b>' + v(m.minutos) + '</b></div>' +
          '<div><span>Puntualidad</span><b>' + v(m.puntualidad, '%') + '</b></div><div><span>Estrellas</span><b>' + v(m.estrellas) + ' (' + m.calificaciones + ')</b></div>' +
          '<div><span>Efectivo cobrado</span><b>' + UI.esc(UI.dinero(m.efectivo)) + '</b></div><div><span>Entregó en caja</span><b>' + UI.esc(UI.dinero(m.entregado_caja)) + '</b></div>' +
          '<div><span>Diferencia</span><b class="' + (m.diferencia < 0 ? 'mal' : '') + '">' + UI.esc(UI.dinero(m.diferencia)) + '</b></div><div><span>Propinas (suyas)</span><b>' + UI.esc(UI.dinero(m.propinas)) + '</b></div>' +
          '<div><span>Horas de turno</span><b>' + v(m.horas) + ' en ' + m.dias_trabajados + ' día(s)</b></div><div><span>Km aprox.</span><b>' + v(m.km) + '</b></div>' +
          '<div><span>Pago (' + UI.esc(PAGO[m.forma_pago] || 'sin definir') + ')</span><b>' + (m.gano === null ? '—' : UI.esc(UI.dinero(m.gano))) + '</b></div><div><span>Costo por entrega</span><b>' + (m.costo_por_entrega === null ? '—' : UI.esc(UI.dinero(m.costo_por_entrega))) + '</b></div>' +
          (m.bono ? '<div><span>Bono por meta</span><b>' + UI.esc(UI.dinero(m.bono)) + '</b></div>' : '') +
          (m.anulados_en_camino ? '<div><span>Anulados en camino</span><b class="mal">' + m.anulados_en_camino + '</b></div>' : '') + '</div>' +
          (m.por_zona.length ? '<h4>📍 Por zona</h4><div class="ranking-datos">' + m.por_zona.map(function (z) { return '<span>' + UI.esc(z.zona || 'Sin zona') + ': <b>' + z.entregas + '</b></span>'; }).join('') + '</div>' : '') +
          (problemas.length ? '<h4>⚠️ Problemas (' + problemas.length + ')</h4>' : '') +
          '<h4>🧾 Entregas</h4><div class="lista">' + (m.detalle || []).map(function (d) {
            return '<div class="item"><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(d.numero) + (d.a_tiempo === false ? ' <span class="etiqueta aviso">tarde</span>' : '') + (d.estrellas ? ' <span class="etiqueta ' + (d.estrellas <= 2 ? 'mal' : 'ok') + '">' + d.estrellas + '⭐</span>' : '') + '</div>' +
              '<div class="item-sub">' + UI.esc(d.dia) + ' · salió ' + UI.esc(UI.hora(d.salio)) + ' · ' + v(d.minutos, ' min') + (d.zona ? ' · ' + UI.esc(d.zona) : '') + ' · ' + UI.esc(UI.dinero(d.total)) + '</div>' +
              (d.comentario ? '<div class="item-sub">«' + UI.esc(d.comentario) + '»</div>' : '') + '</div>' +
              '<div class="det-botones">' + (d.tiene_foto ? '<button class="btn borde chico" type="button" data-foto="' + UI.esc(d.id) + '" data-num="' + UI.esc(d.numero) + '" aria-label="Ver foto de entrega ' + UI.esc(d.numero) + '">📷</button>' : '') +
              (d.con_ruta ? '<button class="btn borde chico" type="button" data-ruta="' + UI.esc(d.id) + '" data-num="' + UI.esc(d.numero) + '" aria-label="Ver recorrido">🗺️</button>' : '') + '</div></div>';
          }).join('') + '</div>',
        alAbrir: function (vv, cerrar) {
          UI.$$('[data-ruta]', vv).forEach(function (b) { b.addEventListener('click', function () { cerrar({ id: b.getAttribute('data-ruta'), num: b.getAttribute('data-num') }); }); });
          UI.$$('[data-foto]', vv).forEach(function (b) { b.addEventListener('click', function () { cerrar({ foto: b.getAttribute('data-foto'), num: b.getAttribute('data-num') }); }); }); // 3.1.3
        },
        botones: [{ texto: 'Cerrar', valor: null, clase: 'secundario' }]
      });
      if (elegido && elegido.foto) { await UI.verFotoEntrega(elegido.foto, elegido.num); return detalle(id); }
      if (elegido) {
        var ru = await DATOS.pedir('rutaPedido', { pedido_id: elegido.id });
        await UI.ventana({ icono: '🗺️', titulo: 'Recorrido de ' + elegido.num,
          html: ru.puntos.length ? UI.mapaPuntos(ru.puntos, { ruta: true, ancho: 340, alto: 260 }) + '<p class="ayuda">🔵 salida · 🟢 llegada · ' + ru.puntos.length + ' puntos. Se borran solos a los 30 días.</p>' : '<p>Este recorrido ya se borró (se guardan 30 días).</p>',
          botones: [{ texto: 'Volver', valor: true, clase: 'secundario' }] });
        detalle(id);
      }
    } catch (err) { UI.error('No se pudo abrir', err.message); }
  }

  function excel() {
    if (!datos || !datos.motorizados.length) return UI.aviso('No hay datos para exportar.', 'error');
    var filas = [['Motorizado', 'Placa', 'Semáforo', 'Entregas', 'Min. promedio', 'Puntualidad %', 'Estrellas', 'Malas notas', 'Anulados en camino', 'Efectivo cobrado', 'Entregado en caja', 'Diferencia', 'Propinas', 'Horas turno', 'Días', 'Km aprox.', 'Forma de pago', 'Pago', 'Bono', 'Costo por entrega', 'Entregas período anterior']];
    datos.motorizados.forEach(function (m) {
      filas.push([m.nombre, m.placa, m.semaforo, m.entregas, m.minutos, m.puntualidad, m.estrellas, m.malas, m.anulados_en_camino, m.efectivo, m.entregado_caja, m.diferencia, m.propinas, m.horas, m.dias_trabajados, m.km, PAGO[m.forma_pago] || '', m.gano, m.bono, m.costo_por_entrega, (m.anterior || {}).entregas]);
    });
    UI.descargarCSV(filas, 'informe-motorizados-' + datos.desde + '_' + datos.hasta);
  }

  function resumenWhatsApp() {
    var l = datos.motorizados, t = totales(l);
    var txt = '🏍️ Motorizados ' + (datos.desde === datos.hasta ? datos.desde : datos.desde + ' a ' + datos.hasta) + '\n' +
      'Entregas: ' + t.entregas + ' · Efectivo: ' + UI.dinero(t.efectivo) + ' · Diferencia caja: ' + UI.dinero(t.diferencia) + '\n\n' +
      l.map(function (m, i) {
        return (i + 1) + '. ' + (SEMAFORO[m.semaforo] || SEMAFORO.verde).i + ' ' + String(m.nombre).split(' ').slice(0, 2).join(' ') + ': ' + m.entregas + ' entregas, ' + v(m.minutos, ' min') + ', ⭐' + v(m.estrellas) +
          (m.diferencia ? ', Δ ' + UI.dinero(m.diferencia) : '') + (m.gano !== null ? ', pago ' + UI.dinero((m.gano || 0) + (m.bono || 0)) : '');
      }).join('\n');
    UI.compartirWhatsApp(txt, ''); // elige el chat (por ejemplo, su propio número)
  }
})(window);
