/**
 * ============================================================
 * PANEL DE PEDIDOS (dueño y cajero/cocina) — fase 3.
 * Tablero por estados: Recibido → Preparando → En camino → Entregado.
 * Sin refresco automático: botón «Actualizar». Atrasados en rojo.
 * ============================================================
 */
(function (global) {
  'use strict';
  var UI = global.UI, DATOS = global.DATOS, APP = global.APP;
  var est = { datos: null, motos: [], cargadoEn: 0, verAnulados: false };

  var COLUMNAS = ['Recibido', 'Preparando', 'En camino', 'Entregado'];

  APP.vistas.pedidos = {
    titulo: 'Pedidos', icono: '🧾', orden: 10, roles: ['dueno', 'cajero'],
    pintar: function (cont) {
      est = { datos: null, motos: [], cargadoEn: 0, verAnulados: false };
      cont.innerHTML = UI.encabezado('Pedidos', APP.nombreLocal(APP.local), '<button class="btn chico" type="button" id="btn-nuevo-pedido">＋ Nuevo</button>') +
        '<div id="pd-cuerpo">' + UI.esqueleto(4) + '</div>';
      UI.$('[data-actualizar]', cont).addEventListener('click', function (e) { UI.trabajando(e.currentTarget, cargar); });
      UI.$('#btn-nuevo-pedido', cont).addEventListener('click', nuevoPedido);
      cargar();
    }
  };

  function cuerpo() { return UI.$('#pd-cuerpo'); }

  async function cargar() {
    var r = await Promise.allSettled([
      DATOS.pedir('pedidosListar', { local_id: APP.local }),
      DATOS.pedir('motorizadosListar', { local_id: APP.local })
    ]);
    if (!cuerpo()) return; // se cambió de pantalla mientras cargaba
    if (r[0].status !== 'fulfilled') { cuerpo().innerHTML = '<div class="banda error">⚠️ <span>' + UI.esc(r[0].reason.message) + '</span></div>'; return; }
    est.datos = r[0].value;
    est.motos = r[1].status === 'fulfilled' ? r[1].value.motorizados || [] : [];
    est.cargadoEn = Date.now();
    pintar();
  }

  function ahoraServidor() {
    return new Date(new Date(est.datos.ahora).getTime() + (Date.now() - est.cargadoEn)).toISOString();
  }

  function atrasado(p) {
    if (['Entregado', 'Anulado'].indexOf(p.estado) >= 0) return false;
    return UI.minutosDesde(p.creado, ahoraServidor()) > est.datos.minutos_atraso;
  }

  function pintar() {
    var lista = est.datos.pedidos;
    var anulados = lista.filter(function (p) { return p.estado === 'Anulado'; });
    var activos = lista.filter(function (p) { return p.estado !== 'Anulado'; });
    var tarde = activos.filter(atrasado).length;
    var html = (tarde ? '<div class="banda error">⏰ <span>' + tarde + ' pedido(s) atrasado(s) (más de ' + est.datos.minutos_atraso + ' min).</span></div>' : '') +
      '<div class="tablero">' + COLUMNAS.map(function (c) {
        var col = activos.filter(function (p) { return p.estado === c; });
        if (c === 'Entregado') col = col.filter(function (p) { return p.dia_trabajo === est.datos.hoy; });
        if (c !== 'Entregado') col.sort(function (a, b) { return a.creado < b.creado ? -1 : 1; }); // el más antiguo arriba
        return '<section class="columna" aria-label="' + UI.esc(c) + '"><div class="columna-cabeza">' + UI.chipEstado(c) + '<span class="cuenta">' + col.length + '</span></div>' +
          '<div class="lista">' + (col.length ? col.map(tarjeta).join('') : UI.vacio((UI.ESTADOS[c] || {}).icono || '•', c === 'Recibido' ? 'Aún no hay pedidos nuevos.' : 'Nada aquí por ahora.')) + '</div></section>';
      }).join('') + '</div>' +
      (anulados.length ? '<button class="btn borde bloque" type="button" id="ver-anulados" style="margin-top:16px">' + (est.verAnulados ? 'Ocultar' : 'Ver') + ' anulados (' + anulados.length + ')</button>' +
        (est.verAnulados ? '<div class="lista" style="margin-top:10px">' + anulados.map(tarjeta).join('') + '</div>' : '') : '');
    cuerpo().innerHTML = html;
    var va = UI.$('#ver-anulados');
    if (va) va.addEventListener('click', function () { est.verAnulados = !est.verAnulados; pintar(); });
    UI.$$('[data-accion]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () { accion(b, b.getAttribute('data-accion'), b.getAttribute('data-id')); });
    });
  }

  function tarjeta(p) {
    var min = UI.minutosDesde(p.creado, ahoraServidor());
    var tarde = atrasado(p);
    var principal = '';
    if (p.estado === 'Recibido') principal = '<button class="btn chico" type="button" data-accion="preparar" data-id="' + UI.esc(p.id) + '">👨‍🍳 Preparar</button>';
    if (p.estado === 'Preparando') principal = p.zona_id
      ? (p.motorizado_id ? '<button class="btn chico" type="button" data-accion="despachar" data-id="' + UI.esc(p.id) + '">🛵 Despachar</button>' : '<button class="btn chico" type="button" data-accion="asignar" data-id="' + UI.esc(p.id) + '">🛵 Asignar motorizado</button>')
      : '<button class="btn chico" type="button" data-accion="entregar" data-id="' + UI.esc(p.id) + '">✅ Entregado</button>';
    if (p.estado === 'En camino') principal = '<button class="btn chico" type="button" data-accion="entregar" data-id="' + UI.esc(p.id) + '">✅ Entregado</button>';
    return '<article class="pedido' + (tarde ? ' atrasado' : '') + '">' +
      '<div class="pedido-top"><span class="pedido-num">' + UI.esc(p.numero) + '</span>' + (p.estado === 'Anulado' ? UI.chipEstado('Anulado') : '') +
      '<span class="reloj' + (tarde ? ' tarde' : '') + '">' + UI.esc(UI.hora(p.creado)) + (['Entregado', 'Anulado'].indexOf(p.estado) < 0 ? ' · ' + min + ' min' : '') + '</span>' +
      '<span class="pedido-total">' + UI.dinero(p.total) + '</span></div>' +
      '<div class="pedido-linea"><b style="color:var(--texto)">' + UI.esc(p.cliente_nombre) + '</b> · ' + UI.esc(p.telefono) + '</div>' +
      (APP.local === 'TODOS' ? '<div class="pedido-linea">📍 ' + UI.esc(APP.nombreLocal(p.local_id)) + '</div>' : '') +
      '<ul class="pedido-items">' + (p.detalle || []).map(function (d) { return '<li><b>' + d.cantidad + '×</b> ' + UI.esc(d.nombre) + (d.extras ? ' <span class="pedido-linea">(' + UI.esc(d.extras) + ')</span>' : '') + '</li>'; }).join('') + '</ul>' +
      (p.notas ? '<div class="banda" style="margin:0;padding:8px 10px">📝 <span>' + UI.esc(p.notas) + '</span></div>' : '') +
      '<div class="pedido-linea">' + (p.zona_id ? '🛵 ' + UI.esc(p.direccion || 'Ubicación por mapa') + (p.referencia ? ' · ' + UI.esc(p.referencia) : '') : '🏪 Retira en el local') + '</div>' +
      '<div class="pedido-linea">' + (p.forma_pago === 'transferencia' ? '🏦 Transferencia ' + (p.pago_verificado ? '<span class="etiqueta ok">verificada</span>' : '<span class="etiqueta aviso">por verificar</span>') : '💵 Efectivo') +
      (p.motorizado ? ' · 🛵 ' + UI.esc(p.motorizado.nombre) : '') + '</div>' +
      (p.estado === 'Anulado' ? '<div class="pedido-linea">Motivo: ' + UI.esc(p.motivo_anulacion) + '</div>' : '') +
      (p.estado !== 'Anulado' ? '<div class="pedido-acciones">' + principal + '<button class="btn secundario chico" type="button" data-accion="mas" data-id="' + UI.esc(p.id) + '">⋯ Más</button></div>' : '') +
      '</article>';
  }

  function buscar(id) { return est.datos.pedidos.filter(function (p) { return p.id === id; })[0]; }

  function reemplazar(nuevo) {
    var lista = est.datos.pedidos;
    for (var i = 0; i < lista.length; i++) if (lista[i].id === nuevo.id) { nuevo.detalle = lista[i].detalle; nuevo.motorizado = est.motos.filter(function (m) { return m.id === nuevo.motorizado_id; })[0] || lista[i].motorizado; lista[i] = nuevo; }
    pintar();
  }

  async function guardar(boton, accion, datos, okTexto) {
    return UI.trabajando(boton, async function () {
      try {
        var r = await DATOS.pedir(accion, datos, { guardar: true });
        if (r.pedido) reemplazar(r.pedido);
        if (okTexto) UI.aviso(okTexto, 'ok');
        return true;
      } catch (err) {
        await UI.error('No se guardó', err.message);
        if (err.codigo === 'CAMBIO' || err.codigo === 'NO_EXISTE') cargar();
        return false;
      }
    });
  }

  function mensajeCliente(p) {
    var neg = (APP.publico && APP.publico.negocio_nombre) || '';
    var t = {
      'Recibido': 'Hola ' + p.cliente_nombre + ', recibimos tu pedido ' + p.numero + ' en ' + neg + '. Total: ' + UI.dinero(p.total) + '. ¡Gracias!',
      'Preparando': 'Hola ' + p.cliente_nombre + ', tu pedido ' + p.numero + ' ya se está preparando 👨‍🍳.' + (p.hora_estimada ? ' Hora estimada: ' + UI.hora(p.hora_estimada) + '.' : ''),
      'En camino': 'Hola ' + p.cliente_nombre + ', tu pedido ' + p.numero + ' va en camino 🛵' + (p.motorizado ? ' con ' + p.motorizado.nombre : '') + '. Total a pagar: ' + UI.dinero(p.total) + (p.forma_pago === 'efectivo' ? ' en efectivo.' : '.'),
      'Entregado': '¡Gracias por tu compra, ' + p.cliente_nombre + '! Esperamos que disfrutes tu pedido ' + p.numero + '. ' + neg
    };
    return t[p.estado] || '';
  }

  async function accion(boton, que, id) {
    var p = buscar(id);
    if (!p) return;
    if (que === 'preparar') return guardar(boton, 'pedidoEstado', { id: id, desde: p.estado, a: 'Preparando' }, p.numero + ' en preparación.');
    if (que === 'despachar') return guardar(boton, 'pedidoEstado', { id: id, desde: p.estado, a: 'En camino' }, p.numero + ' en camino.');
    if (que === 'entregar') {
      var ok = await UI.confirmar('¿Marcar ' + p.numero + ' como entregado?', p.forma_pago === 'efectivo' ? 'Cobro en efectivo: ' + UI.dinero(p.total) + '.' : 'Pago por transferencia.', 'Sí, entregado');
      if (ok) return guardar(boton, 'pedidoEstado', { id: id, desde: p.estado, a: 'Entregado' }, p.numero + ' entregado.');
      return;
    }
    if (que === 'asignar') return asignar(boton, p);
    if (que === 'mas') return mas(boton, p);
  }

  async function asignar(boton, p) {
    var motos = est.motos.filter(function (m) { return m.activo !== false && (m.local_id === 'TODOS' || m.local_id === p.local_id); });
    if (!motos.length) return UI.error('No hay motorizados', 'Registre motorizados activos para este local (dueño → Motorizados).');
    var elegido = null;
    var ok = await UI.ventana({
      icono: '🛵', titulo: 'Asignar ' + p.numero,
      html: '<div class="opciones">' + motos.map(function (m) {
        return '<label class="opcion"><input type="radio" name="moto" value="' + UI.esc(m.id) + '"' + (m.id === p.motorizado_id ? ' checked' : '') + '><span>' + UI.esc(m.nombre) + (m.placa ? ' <small style="color:var(--texto-2)">' + UI.esc(m.placa) + '</small>' : '') + '</span></label>';
      }).join('') + '</div>',
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Asignar', valor: true, antes: function (v) {
        var r = UI.$('input[name=moto]:checked', v);
        if (!r) { UI.aviso('Elija un motorizado.', 'error'); return false; }
        elegido = r.value; return true;
      } }]
    });
    if (ok) guardar(boton, 'pedidoAsignar', { id: p.id, motorizado_id: elegido }, 'Motorizado asignado.');
  }

  async function mas(boton, p) {
    var opciones = [['avisar', '💬 Avisar al cliente por WhatsApp'], ['llamar', '📞 Llamar al cliente']];
    if (p.zona_id) opciones.push(['mapa', '🗺️ Ver en el mapa'], ['ubicacion', '📍 Pegar ubicación de WhatsApp']);
    if (p.zona_id && (p.estado === 'Recibido' || p.estado === 'Preparando')) opciones.push(['asignar', '🛵 ' + (p.motorizado_id ? 'Cambiar' : 'Asignar') + ' motorizado']);
    if (p.motorizado) opciones.push(['wa_moto', '💬 WhatsApp al motorizado']);
    if (p.forma_pago === 'transferencia') opciones.push(['verificar', p.pago_verificado ? '↩️ Marcar transferencia sin verificar' : '🏦 Marcar transferencia verificada']);
    if (p.estado !== 'Entregado' || APP.sesion.rol === 'dueno') opciones.push(['anular', '⛔ Anular pedido']);
    var op = await UI.ventana({
      icono: '🧾', titulo: p.numero + ' · ' + p.cliente_nombre, texto: 'Creado ' + UI.hora(p.creado) + (p.preparando ? ' · preparando ' + UI.hora(p.preparando) : '') + (p.en_camino ? ' · salió ' + UI.hora(p.en_camino) : '') + (p.entregado ? ' · entregado ' + UI.hora(p.entregado) : ''),
      botones: opciones.map(function (o) { return { texto: o[1], valor: o[0], clase: 'borde opcion-lista' + (o[0] === 'anular' ? ' texto-peligro' : '') }; }).concat([{ texto: 'Cerrar', valor: null, clase: 'secundario' }])
    });
    if (!op) return;
    if (op === 'avisar') return UI.abrirWhatsApp(p.telefono, mensajeCliente(p));
    if (op === 'llamar') { global.location.href = 'tel:+' + UI.digitos(p.telefono); return; }
    if (op === 'mapa') { var u = UI.enlaceMapa(p); if (u) global.open(u, '_blank', 'noopener'); else UI.aviso('Este pedido no tiene dirección ni ubicación.', 'error'); return; }
    if (op === 'wa_moto') return UI.abrirWhatsApp(p.motorizado.celular, 'Pedido ' + p.numero + ' · ' + p.cliente_nombre + ' · ' + p.telefono + '\n' + (p.direccion || '') + (p.referencia ? ' (' + p.referencia + ')' : '') + '\nMapa: ' + UI.enlaceMapa(p) + '\nCobrar: ' + (p.forma_pago === 'efectivo' ? UI.dinero(p.total) : 'pagado por transferencia'));
    if (op === 'asignar') return asignar(boton, p);
    if (op === 'verificar') return guardar(boton, 'pedidoPagoVerificar', { id: p.id, verificado: !p.pago_verificado }, 'Listo.');
    if (op === 'ubicacion') {
      var enlace = await UI.pedirDato({ icono: '📍', titulo: 'Ubicación de ' + p.numero, etiqueta: 'Enlace de ubicación', valor: p.ubicacion_enlace, ph: 'https://maps.app.goo.gl/…', ayuda: 'Pegue el enlace que el cliente mandó por WhatsApp.', validar: function (v) { return v && !/^https:\/\//.test(v) ? 'Pegue el enlace completo (empieza con https://).' : ''; } });
      if (enlace !== null) guardar(boton, 'pedidoUbicacion', { id: p.id, enlace: enlace }, 'Ubicación guardada.');
      return;
    }
    if (op === 'anular') {
      var motivo = await UI.pedirDato({ icono: '⛔', titulo: 'Anular ' + p.numero, texto: 'El pedido no se borra: queda anulado con el motivo.', etiqueta: 'Motivo', area: true, boton: 'Anular pedido', peligro: true, validar: function (v) { return v.length < 3 ? 'Escriba el motivo.' : ''; } });
      if (motivo !== null) guardar(boton, 'pedidoAnular', { id: p.id, motivo: motivo }, p.numero + ' anulado.');
    }
  }

  function nuevoPedido() {
    var url = 'pedir.html' + (APP.local !== 'TODOS' ? '?local=' + encodeURIComponent(APP.local) : '');
    global.open(url, '_blank', 'noopener');
  }
})(window);
