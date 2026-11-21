/**
 * ============================================================
 * REPORTES (dueño) — fase 5. Todo se calcula en el servidor
 * a partir de los pedidos y sus detalles (nada copiado a mano).
 * ============================================================
 */
(function (global) {
  'use strict';
  var UI = global.UI, DATOS = global.DATOS, APP = global.APP;
  var rango = null;
  var hoyNegocio = ''; // día de trabajo según el servidor (después de medianoche puede ser «ayer»)

  APP.vistas.reportes = {
    titulo: 'Reportes', icono: '📊', orden: 60, roles: ['dueno'],
    pintar: function (cont) {
      rango = rango || { desde: '', hasta: '' };
      cont.innerHTML = UI.encabezado('Reportes', APP.nombreLocal(APP.local)) +
        '<div class="filtros" id="rp-rapidos">' + [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7', '7 días'], ['30', '30 días'], ['mes', 'Este mes']].map(function (x) {
          return '<button class="pestana" type="button" data-r="' + x[0] + '" aria-selected="false">' + x[1] + '</button>';
        }).join('') + '</div>' +
        '<form class="fila-campos" id="rp-form"><div class="campo"><label for="rp-desde">Desde</label><input class="entrada" id="rp-desde" type="date" value="' + rango.desde + '"></div>' +
        '<div class="campo"><label for="rp-hasta">Hasta</label><input class="entrada" id="rp-hasta" type="date" value="' + rango.hasta + '"></div></form>' +
        '<div id="rp-cuerpo">' + UI.esqueleto(4) + '</div>';
      UI.$$('[data-r]', cont).forEach(function (b) {
        b.addEventListener('click', function () {
          var r = rapido(b.getAttribute('data-r'));
          UI.$('#rp-desde').value = r[0]; UI.$('#rp-hasta').value = r[1];
          UI.$$('[data-r]', cont).forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
          cargar();
        });
      });
      UI.$$('#rp-form input', cont).forEach(function (i) { i.addEventListener('change', cargar); });
      UI.$('[data-actualizar]', cont).addEventListener('click', function (e) { UI.trabajando(e.currentTarget, cargar); });
      cargar();
    }
  };

  function sumarDias(ymd, n) {
    var d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function rapido(k) {
    var hoy = hoyNegocio || UI.hoy();
    if (k === 'ayer') return [sumarDias(hoy, -1), sumarDias(hoy, -1)];
    if (k === '7') return [sumarDias(hoy, -6), hoy];
    if (k === '30') return [sumarDias(hoy, -29), hoy];
    if (k === 'mes') return [hoy.slice(0, 8) + '01', hoy];
    return [hoy, hoy];
  }

  async function cargar() {
    var c = UI.$('#rp-cuerpo');
    if (!c) return;
    rango = { desde: UI.$('#rp-desde').value, hasta: UI.$('#rp-hasta').value };
    c.innerHTML = UI.esqueleto(4);
    try {
      var r = await DATOS.pedir('reportes', { desde: rango.desde, hasta: rango.hasta, local_id: APP.local });
      hoyNegocio = r.hoy || hoyNegocio;
      rango = { desde: r.desde, hasta: r.hasta };
      if (UI.$('#rp-desde')) { UI.$('#rp-desde').value = r.desde; UI.$('#rp-hasta').value = r.hasta; }
      if (UI.$('#rp-cuerpo')) pintar(r);
    } catch (err) {
      if (UI.$('#rp-cuerpo')) UI.$('#rp-cuerpo').innerHTML = '<div class="banda error">⚠️ <span>' + UI.esc(err.message) + '</span></div>';
    }
  }

  function barras(lista, etiqueta, valor, formato) {
    var max = Math.max.apply(null, lista.map(valor).concat([0])) || 1;
    return '<div class="barras">' + lista.map(function (x) {
      return '<div class="barra-fila"><span class="nombre" title="' + UI.esc(etiqueta(x)) + '">' + UI.esc(etiqueta(x)) + '</span><div class="barra"><span style="width:' + Math.round(valor(x) / max * 100) + '%"></span></div><span class="num">' + UI.esc(formato(x)) + '</span></div>';
    }).join('') + '</div>';
  }

  function cifra(rotulo, valor, clase) { return '<div class="cifra' + (clase ? ' ' + clase : '') + '"><div class="rotulo">' + UI.esc(rotulo) + '</div><div class="valor">' + valor + '</div></div>'; }
  function signo(n) { return '<span class="' + (n < 0 ? 'negativo' : n > 0 ? 'positivo' : '') + '">' + UI.esc(UI.dinero(n)) + '</span>'; }

  function pintar(r) {
    var t = r.totales;
    var maxHora = Math.max.apply(null, r.horas.map(function (h) { return h.pedidos; }).concat([1]));
    var hayDatos = t.pedidos > 0;
    UI.$('#rp-cuerpo').innerHTML =
      '<div class="cifras">' +
      cifra('Ventas', UI.esc(UI.dinero(t.ventas)), 'destacada') + cifra('Pedidos', t.pedidos) + cifra('Ticket promedio', UI.esc(UI.dinero(t.ticket_promedio))) +
      cifra('Entrega promedio', t.minutos_entrega === null ? '—' : t.minutos_entrega + ' min') +
      cifra('Efectivo', UI.esc(UI.dinero(t.efectivo))) + cifra('Transferencias', UI.esc(UI.dinero(t.transferencia))) + cifra('Envíos cobrados', UI.esc(UI.dinero(t.envio))) + cifra('Anulados', t.anulados) +
      '</div>' +
      (!hayDatos ? UI.vacio('📊', 'No hay ventas en estas fechas.') :
      '<div class="rejilla" style="margin-top:14px">' +
      (r.por_local.length > 1 || APP.local === 'TODOS' ? '<div class="tarjeta"><h3 style="margin-top:0">Ventas por local</h3>' + barras(r.por_local, function (x) { return x.nombre; }, function (x) { return x.total; }, function (x) { return UI.dinero(x.total) + ' · ' + x.pedidos; }) + '</div>' : '') +
      '<div class="tarjeta"><h3 style="margin-top:0">Platos más vendidos</h3>' + barras(r.platos.slice(0, 10), function (x) { return x.nombre; }, function (x) { return x.cantidad; }, function (x) { return x.cantidad + ' u'; }) + '</div>' +
      '<div class="tarjeta"><h3 style="margin-top:0">Horas pico</h3><div class="columnas-hora" role="img" aria-label="Pedidos por hora">' + r.horas.map(function (h) {
        return '<div title="' + h.hora + ':00 · ' + h.pedidos + ' pedido(s)" style="height:' + Math.round(h.pedidos / maxHora * 100) + '%"></div>';
      }).join('') + '</div><div class="eje-hora">' + r.horas.map(function (h) { return '<span>' + (h.hora % 3 === 0 ? h.hora : '') + '</span>'; }).join('') + '</div></div>' +
      '<div class="tarjeta"><h3 style="margin-top:0">Días de la semana</h3>' + barras(r.dias, function (x) { return x.dia; }, function (x) { return x.pedidos; }, function (x) { return x.pedidos + ' · ' + UI.dinero(x.total); }) + '</div>' +
      '</div>' +
      '<div class="tarjeta" style="margin-top:14px"><h3 style="margin-top:0">Rendimiento por motorizado</h3>' + (r.motorizados.length ?
        '<table class="tabla"><thead><tr><th>Motorizado</th><th class="n">Entregas</th><th class="n">Efectivo</th><th class="n">Min. promedio</th><th class="n">Diferencia</th></tr></thead><tbody>' +
        r.motorizados.map(function (m) { return '<tr><td data-r="Motorizado"><b>' + UI.esc(m.nombre) + '</b></td><td class="n" data-r="Entregas">' + m.entregas + '</td><td class="n" data-r="Efectivo">' + UI.esc(UI.dinero(m.efectivo)) + '</td><td class="n" data-r="Min. promedio">' + (m.minutos === null ? '—' : m.minutos) + '</td><td class="n" data-r="Diferencia">' + signo(m.diferencia) + '</td></tr>'; }).join('') +
        '</tbody></table>' : '<p class="subtitulo">Sin entregas a domicilio en estas fechas.</p>') + '</div>') +
      '<div class="tarjeta" style="margin-top:14px"><h3 style="margin-top:0">Diferencias de caja por cajero</h3>' + (r.cajeros.length ?
        '<table class="tabla"><thead><tr><th>Cajero</th><th class="n">Cierres</th><th class="n">Diferencia</th></tr></thead><tbody>' +
        r.cajeros.map(function (c) { return '<tr><td data-r="Cajero"><b>' + UI.esc(c.nombre) + '</b></td><td class="n" data-r="Cierres">' + c.cierres + '</td><td class="n" data-r="Diferencia">' + signo(c.diferencia) + '</td></tr>'; }).join('') +
        '</tbody></table>' : '<p class="subtitulo">No hay cierres de caja en estas fechas.</p>') + '</div>';
  }
})(window);
