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
  var est = { datos: null, motos: [], cargadoEn: 0, verAnulados: false, diaEntregado: '', alertados: {} }; // 3.1.6

  var COLUMNAS = ['Recibido', 'Preparando', 'En camino', 'Entregado'];

  APP.vistas.pedidos = {
    titulo: 'Pedidos', icono: '🧾', orden: 10, roles: ['dueno', 'cajero'],
    pintar: function (cont) {
      est = { datos: null, motos: [], cargadoEn: 0, verAnulados: false, diaEntregado: UI.hoy(), alertados: {} }; // 3.1.6
      var sonido = global.APP_MEMORIA.leer('sonido_pedidos') !== false;
      cont.innerHTML = UI.encabezado('Pedidos', APP.nombreLocal(APP.local),
        '<button class="btn secundario chico sonido-btn" type="button" id="btn-sonido" aria-pressed="' + sonido + '" title="Sonido de pedido nuevo">' + (sonido ? '🔔' : '🔕') + '</button>' +
        '<button class="btn secundario chico" type="button" id="btn-buscar-pedido" aria-label="Buscar pedido">🔎</button>' +
        '<button class="btn chico" type="button" id="btn-nuevo-pedido">＋ Nuevo</button>') +
        '<div id="pd-cuerpo">' + UI.esqueleto(4) + '</div>';
      UI.$('[data-actualizar]', cont).addEventListener('click', function (e) { UI.trabajando(e.currentTarget, cargar); });
      UI.$('#btn-nuevo-pedido', cont).addEventListener('click', nuevoPedido);
      UI.$('#btn-buscar-pedido', cont).addEventListener('click', buscarPedido);
      UI.$('#btn-sonido', cont).addEventListener('click', function (e) {
        var b = e.currentTarget;
        avisosVentana().then(function () {
          var on = global.APP_MEMORIA.leer('sonido_pedidos') !== false;
          b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '🔔' : '🔕';
        });
      });
      cargar().then(function () { var ver = (APP.parametros || {}).ver; if (ver) { APP.parametros = {}; abrirPorNumero(ver); } });
      vigilar();
    }
  };

  function cuerpo() { return UI.$('#pd-cuerpo'); }

  async function cargar() {
    var r = await Promise.allSettled([
      DATOS.pedir('pedidosListar', { local_id: APP.local, dia: est.diaEntregado || UI.hoy() }),
      DATOS.pedir('motorizadosListar', { local_id: APP.local })
    ]);
    if (!cuerpo()) return; // se cambió de pantalla mientras cargaba
    if (r[0].status !== 'fulfilled') { cuerpo().innerHTML = '<div class="banda error">⚠️ <span>' + UI.esc(r[0].reason.message) + '</span></div>'; return; }
    est.datos = r[0].value;
    est.motos = r[1].status === 'fulfilled' ? r[1].value.motorizados || [] : [];
    est.cargadoEn = Date.now();
    alertarRecibidos();
    pintar();
  }

  function ahoraServidor() {
    return new Date(new Date(est.datos.ahora).getTime() + (Date.now() - est.cargadoEn)).toISOString();
  }

  function atrasado(p) {
    if (['Entregado', 'Anulado'].indexOf(p.estado) >= 0) return false;
    return UI.minutosDesde(p.creado, ahoraServidor()) > est.datos.minutos_atraso;
  }

  function fechaAnterior(ymd) { var d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
  function esRecibidoAtrasado(p) { return p.estado === 'Recibido' && UI.minutosDesde(p.creado, ahoraServidor()) >= (Number(est.datos.minutos_alerta_pedido) || 15); }
  function alertarRecibidos() {
    if (!est.datos) return;
    est.datos.pedidos.filter(esRecibidoAtrasado).forEach(function (p) {
      if (est.alertados[p.id]) return;
      est.alertados[p.id] = true;
      if (global.APP_MEMORIA.leer('sonido_pedidos') !== false) UI.sonar();
      UI.notificar('🔴 Pedido sin atender', p.numero + ' sigue en Recibido.');
    });
  }
  function pintar() {
    var lista = est.datos.pedidos;
    var anulados = lista.filter(function (p) { return p.estado === 'Anulado'; });
    var activos = lista.filter(function (p) { return p.estado !== 'Anulado'; });
    var tarde = activos.filter(atrasado).length;
    var pendientes = activos.filter(esRecibidoAtrasado).length;
    var html = (pendientes ? '<div class="banda error">🔴 <span>' + pendientes + ' pedido(s) en Recibido sin atender. Revise la primera columna.</span></div>' : '') +
      (tarde ? '<div class="banda error">⏰ <span>' + tarde + ' pedido(s) atrasado(s) (más de ' + est.datos.minutos_atraso + ' min).</span></div>' : '') +
      '<div class="tablero">' + COLUMNAS.map(function (c) {
        var col = activos.filter(function (p) { return p.estado === c; });
        if (c === 'Entregado') col = col.filter(function (p) { return (p.entregado ? UI.fechaLocal(p.entregado) : p.dia_trabajo) === (est.diaEntregado || est.datos.dia); });
        col.sort(function (a, b) { return a.creado < b.creado ? 1 : -1; }); // 3.1.5: el más nuevo arriba (elegido por el dueño)
        return '<section class="columna" aria-label="' + UI.esc(c) + '"><div class="columna-cabeza">' + UI.chipEstado(c) + '<span class="cuenta">' + col.length + '</span></div>' +
          (c === 'Entregado' ? '<div class="fecha-entregados"><button class="btn secundario chico" type="button" data-dia-ent="hoy">Hoy</button><button class="btn secundario chico" type="button" data-dia-ent="ayer">Ayer</button><input aria-label="Otra fecha de entrega" class="entrada" id="pd-fecha-ent" type="date" value="' + UI.esc(est.diaEntregado || UI.hoy()) + '"></div>' : '') +
          '<div class="lista">' + (col.length ? col.map(tarjeta).join('') : UI.vacio((UI.ESTADOS[c] || {}).icono || '•', c === 'Recibido' ? 'Aún no hay pedidos nuevos.' : 'Nada aquí por ahora.')) + '</div></section>';
      }).join('') + '</div>' +
      (anulados.length ? '<button class="btn borde bloque" type="button" id="ver-anulados" style="margin-top:16px">' + (est.verAnulados ? 'Ocultar' : 'Ver') + ' anulados (' + anulados.length + ')</button>' +
        (est.verAnulados ? '<div class="lista" style="margin-top:10px">' + anulados.map(tarjeta).join('') + '</div>' : '') : '');
    cuerpo().innerHTML = html;
    UI.$$('[data-dia-ent]', cuerpo()).forEach(function (b) { b.addEventListener('click', function () { est.diaEntregado = b.getAttribute('data-dia-ent') === 'hoy' ? UI.hoy() : fechaAnterior(UI.hoy()); cargar(); }); });
    var fe = UI.$('#pd-fecha-ent'); if (fe) fe.addEventListener('change', function () { if (/^\d{4}-\d{2}-\d{2}$/.test(fe.value)) { est.diaEntregado = fe.value; cargar(); } });
    var va = UI.$('#ver-anulados');
    if (va) va.addEventListener('click', function () { est.verAnulados = !est.verAnulados; pintar(); });
    UI.$$('[data-accion]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () { accion(b, b.getAttribute('data-accion'), b.getAttribute('data-id')); });
    });
  }

  function tarjeta(p) {
    var min = UI.minutosDesde(p.creado, ahoraServidor());
    var tarde = atrasado(p) || esRecibidoAtrasado(p);
    var principal = '';
    if (p.estado === 'Recibido') principal = '<button class="btn chico" type="button" data-accion="preparar" data-id="' + UI.esc(p.id) + '">👨‍🍳 Preparar</button>';
    var dom = UI.tipoEntrega(p) === 'domicilio';
    if (p.estado === 'Preparando') principal = dom
      ? (p.motorizado_id ? '<button class="btn chico" type="button" data-accion="despachar" data-id="' + UI.esc(p.id) + '">🛵 Despachar</button>' : '<button class="btn chico" type="button" data-accion="asignar" data-id="' + UI.esc(p.id) + '">🛵 Asignar motorizado</button>')
      : '<button class="btn chico" type="button" data-accion="entregar" data-id="' + UI.esc(p.id) + '">' + (UI.tipoEntrega(p) === 'mesa' ? '🍽️ Marcar servido' : '📦 Marcar entregado') + '</button>';
    // 3.0: pago digital sin verificar → primero verificar (el servidor tampoco deja despachar).
    var sinPago = UI.esDigital(p.forma_pago) && !p.pago_verificado && (p.estado === 'Preparando' || p.estado === 'Recibido');
    if (sinPago && (verificarActivo() || preparaTrasVerificar())) {
      // 3.1.5: con «no preparar hasta verificar», en Recibido solo se puede verificar
      principal = (p.estado === 'Recibido' && !preparaTrasVerificar() ? principal : '') + '<button class="btn chico" type="button" data-accion="verificar" data-id="' + UI.esc(p.id) + '">🏦 Verificar pago</button>';
    }
    var espera = sinPago ? UI.minutosDesde(p.creado, ahoraServidor()) : 0, limitePago = Number(APP.publico && APP.publico.minutos_alerta_pago) || 30;
    if (p.estado === 'En camino') principal = '<button class="btn chico" type="button" data-accion="entregar" data-id="' + UI.esc(p.id) + '">📦 Marcar entregado</button>';
    // 3.1.1: ya entregado → sin botones de trabajo, solo la constancia (y «Más» para consultar).
    if (p.estado === 'Entregado') principal = '<span class="hecho-final">✔ Entregado' + (p.entregado ? ' a las ' + UI.esc(UI.hora(p.entregado)) : '') + '</span>';
    return '<article class="pedido' + (tarde ? ' atrasado' : '') + '">' +
      '<div class="pedido-top"><span class="pedido-num">' + UI.esc(p.numero) + '</span>' + (p.estado === 'Anulado' ? UI.chipEstado('Anulado') : '') +
      '<span class="reloj' + (tarde ? ' tarde' : '') + '">' + UI.esc(UI.hora(p.creado)) + (['Entregado', 'Anulado'].indexOf(p.estado) < 0 ? ' · ' + min + ' min' : '') + '</span>' +
      '<span class="pedido-total">' + UI.dinero(p.total) + '</span></div>' +
      '<div class="pedido-chips">' + (p.distancia_km !== '' && Number(p.distancia_km) > Number(APP.publico && APP.publico.cobertura_km || 0) && Number(APP.publico && APP.publico.cobertura_km) > 0 ? '<span class="etiqueta aviso">⚠️ Lejos: ' + UI.esc(p.distancia_km) + ' km</span>' : '') + UI.etiquetaTipo(p) + (p.cliente_nuevo ? '<span class="chip-nuevo">✨ Cliente nuevo</span>' : '') + (p.origen ? '<span class="chip-tipo">📊 ' + UI.esc(p.origen) + '</span>' : '') + '</div>' +
      '<div class="pedido-linea"><b style="color:var(--texto)">' + UI.esc(p.cliente_nombre) + '</b> · ' + UI.esc(p.telefono) + '</div>' +
      (APP.local === 'TODOS' ? '<div class="pedido-linea">📍 ' + UI.esc(APP.nombreLocal(p.local_id)) + '</div>' : '') +
      '<ul class="pedido-items">' + (p.detalle || []).map(function (d) { return '<li><b>' + d.cantidad + '×</b> ' + UI.esc(d.nombre) + (d.extras ? ' <span class="pedido-linea">(' + UI.esc(d.extras) + ')</span>' : '') + '</li>'; }).join('') + '</ul>' +
      (p.notas ? '<div class="banda" style="margin:0;padding:8px 10px">📝 <span>' + UI.esc(p.notas) + '</span></div>' : '') +
      (dom ? '<div class="pedido-linea">🛵 ' + UI.esc(p.direccion || 'Ubicación por mapa') + (p.referencia ? ' · ' + UI.esc(p.referencia) : '') + '<br><small>' + UI.fuenteUbicacion(p) + '</small></div>' : '') +
      '<div class="pedido-linea">' + (UI.esDigital(p.forma_pago) ? UI.NOMBRE_PAGO[p.forma_pago] + ' ' + (p.pago_verificado ? '<span class="etiqueta ok">verificado</span>' : '<span class="etiqueta aviso">por verificar</span>') : '💵 Efectivo') +
      (p.propina ? ' · 🙌 propina ' + UI.dinero(p.propina) : '') + (p.calificacion ? ' · ' + '★'.repeat(p.calificacion) : '') +
      (p.motorizado ? ' · 🛵 ' + UI.esc(p.motorizado.nombre) : '') + '</div>' +
      (p.cuenta_pago ? '<div class="pedido-linea">🏦 Dijo que pagó a: <b>' + UI.esc(p.cuenta_pago) + '</b></div>' : '') +
      (sinPago && preparaTrasVerificar() ? '<div class="pago-bloqueo' + (espera >= limitePago ? ' tarde' : '') + '">⛔ <span><b>No preparar ni despachar: pago sin verificar.</b> Esperando ' + espera + ' min' + (espera >= limitePago ? ' · escríbale o llame al cliente' : '') + '.</span></div>' : '') +
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

  /* 3.1.3: enlace propio de cada pedido: abre su seguimiento en cualquier teléfono, sin escribir nada. */
  function enlaceSeguimiento(p) {
    return UI.enlaceApp() + 'pedir.html' + (p.clave_seguimiento ? '?s=' + encodeURIComponent(p.numero + '-' + p.clave_seguimiento) : '');
  }

  function mensajeCliente(p) {
    var neg = (APP.publico && APP.publico.negocio_nombre) || '';
    var tipo = UI.tipoEntrega(p);
    var link = enlaceSeguimiento(p);
    var ver = '\n👉 Mira cómo va tu pedido: ' + link;
    var misPed = p.cliente_clave ? '\n📋 Todos tus pedidos: ' + UI.enlaceApp() + 'pedir.html?c=' + p.cliente_clave : ''; // 3.1.5: enlace personal «Mis pedidos»
    var pagar = UI.esDigital(p.forma_pago) ? (p.pago_verificado ? 'pagado ✅' : 'por ' + (p.forma_pago === 'deuna' ? 'Deuna' : 'transferencia')) : 'en efectivo';
    if (p.estado === 'Preparando' && tipo !== 'domicilio') return 'Hola ' + p.cliente_nombre + ', tu pedido ' + p.numero + ' ya se está preparando 👨‍🍳.' + (p.hora_estimada ? ' Estará listo a las ' + UI.hora(p.hora_estimada) + '.' : '') + ver;
    if (p.estado === 'Entregado' && tipo !== 'domicilio') return '¡Gracias por tu compra, ' + p.cliente_nombre + '! ' + neg + '\n⭐ Califícanos aquí: ' + link;
    var t = {
      'Recibido': 'Hola ' + p.cliente_nombre + ', recibimos tu pedido ' + p.numero + ' en ' + neg + '. Total: ' + UI.dinero(p.total) + '. ¡Gracias!' + (UI.esDigital(p.forma_pago) && !p.pago_verificado ? '\n🔒 Lo preparamos apenas confirmemos tu pago en nuestra cuenta (si pagaste desde otro banco puede tardar un poco).' : '') + ver + misPed,
      'Preparando': 'Hola ' + p.cliente_nombre + ', tu pedido ' + p.numero + ' ya se está preparando 👨‍🍳.' + (p.hora_estimada ? ' Hora estimada: ' + UI.hora(p.hora_estimada) + '.' : '') + ver,
      'En camino': 'Hola ' + p.cliente_nombre + ', tu pedido ' + p.numero + ' va en camino 🛵' +
        (p.motorizado ? '\nTe lo lleva: ' + String(p.motorizado.nombre).split(/\s+/).slice(0, 2).join(' ') + (p.motorizado.placa ? ' · Placa ' + p.motorizado.placa : '') : '') +
        '\nTotal: ' + UI.dinero(p.total) + ' ' + pagar + '.' +
        (APP.publico && APP.publico.codigo_entrega !== 'NO' && p.pide_codigo !== false ? '\n🔢 Al recibir, dale al motorizado tu código de 4 números (está en el enlace).' : '') +
        '\n👉 Mira a tu motorizado y tu código aquí: ' + link,
      'Entregado': '¡Gracias por tu compra, ' + p.cliente_nombre + '! Esperamos que disfrutes tu pedido ' + p.numero + '. ' + neg + '\n⭐ Califícanos aquí: ' + link + misPed
    };
    var ventana = p.hora_llegada ? ' Ventana solicitada: ' + UI.ventanaHora(p.hora_llegada, p.hora_ventana_fin, Number(APP.publico && APP.publico.ventana_minutos) || 30) + ' aprox. Sujeta a confirmación por WhatsApp.' : '';
    return (t[p.estado] || '') + ventana;
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
    if (que === 'verificar') return verificar(boton, p);
    if (que === 'mas') return mas(boton, p);
  }

  function preparaTrasVerificar() { return !APP.publico || APP.publico.verificar_antes_preparar !== 'NO'; } // 3.1.5
  function verificarActivo() { return !APP.publico || APP.publico.verificar_antes_salir !== 'NO'; }

  async function verificar(boton, p) {
    var ok = await UI.ventana({
      icono: p.forma_pago === 'deuna' ? '📲' : '🏦', titulo: 'Verificar pago de ' + p.numero,
      texto: 'Abra la app de su banco' + (p.forma_pago === 'deuna' ? ' o Deuna Negocios' : '') + ' y confirme que llegaron ' + UI.dinero(p.total) + ' de ' + p.cliente_nombre + '. Una captura de pantalla NO es prueba: puede ser falsa.',
      botones: [{ texto: 'Todavía no', valor: false, clase: 'secundario' }, { texto: '✅ Sí, el dinero llegó', valor: true }]
    });
    if (!ok) return;
    var listo = await guardar(boton, 'pedidoPagoVerificar', { id: p.id, verificado: true }, 'Pago verificado. Ya puede prepararlo.');
    if (listo && UI.digitos(p.telefono)) { // 3.1.5: avisar al cliente que su pago se confirmó en la cuenta
      var av = await UI.confirmar('¿Avisar a ' + p.cliente_nombre + '?', 'Le mandamos por WhatsApp que su pago de ' + UI.dinero(p.total) + ' ya se confirmó en la cuenta, con su enlace de seguimiento.', '💬 Avisar al cliente');
      if (av) UI.abrirWhatsApp(p.telefono, '✅ Hola ' + p.cliente_nombre + ', confirmamos tu pago de ' + UI.dinero(p.total) + ' en nuestra cuenta. Ya estamos preparando tu pedido ' + p.numero + ' 👨‍🍳\n👉 Míralo aquí: ' + enlaceSeguimiento(p));
    }
    return listo;
  }

  /* ----- 3.1: AVISO DE PEDIDO NUEVO (sonido + notificación del sistema) -----
   * Vigila en TODA la app (no solo en el panel) para dueño y cajero, también con
   * la pestaña en segundo plano. Consulta liviana: solo una marca de tiempo. */
  var vigia = null, ultimaMarca = 0;
  function vigilar() {
    if (vigia) return;
    async function revisar() {
      vigia = null;
      var s = APP.sesion;
      if (!s || (s.rol !== 'dueno' && s.rol !== 'cajero')) return; // se detiene al salir
      try {
        var r = await DATOS.pedir('pedidosNuevos', {});
        if (ultimaMarca && r.ultimo > ultimaMarca) avisarNuevo();
        // La marca de pedido nuevo no cambia cuando solo cambia un estado.
        // Actualizar el tablero desde el servidor sin generar una nueva notificación.
        if (APP.vistaActual === 'pedidos' && est.datos && document.visibilityState === 'visible') {
          try { await cargar(); } catch (e) { /* conservar tablero anterior si falla la red */ }
        }
        ultimaMarca = r.ultimo || ultimaMarca;
      } catch (e) { /* sin red: se intenta en la próxima vuelta */ }
      vigia = setTimeout(revisar, 25000);
    }
    vigia = setTimeout(revisar, 1500);
  }
  async function avisarNuevo() {
    if (global.APP_MEMORIA.leer('sonido_pedidos') !== false) { UI.sonar(); setTimeout(UI.sonar, 900); }
    UI.vibrar([80, 60, 80, 60, 80]);
    UI.notificar('🛎️ ¡Pedido nuevo!', 'Toque para abrir el panel de pedidos.');
    avisoTitulo(true);
    if (APP.vistaActual === 'pedidos' && UI.$('#pd-cuerpo')) { await cargar(); UI.aviso('🛎️ ¡Pedido nuevo!', 'ok'); }
    else {
      var ir = await UI.ventana({ icono: '🛎️', titulo: '¡Pedido nuevo!', texto: 'Acaba de entrar un pedido.', botones: [{ texto: 'Luego', valor: false, clase: 'secundario' }, { texto: 'Ver pedidos', valor: true }] });
      if (ir) APP.ir('pedidos');
    }
  }
  function avisoTitulo(on) {
    var t = document.title.replace(/^🛎️ /, '');
    document.title = on ? '🛎️ ' + t : t;
    if (on) document.addEventListener('visibilitychange', function q() { if (!document.hidden) { avisoTitulo(false); document.removeEventListener('visibilitychange', q); } });
  }
  /* Ventana de avisos: probar sonido, activar notificaciones, silenciar. */
  async function avisosVentana() {
    UI.desbloquearSonido();
    var on = global.APP_MEMORIA.leer('sonido_pedidos') !== false;
    var permiso = UI.permisoNotificaciones();
    var v = await UI.ventana({
      icono: '🔔', titulo: 'Avisos de pedido nuevo',
      texto: 'El panel revisa cada 25 segundos. Deje esta app abierta (puede estar en otra pestaña) y el volumen arriba.',
      html: '<p class="ayuda">Sonido: <b>' + (on ? 'activado' : 'silenciado') + '</b> · Notificación en pantalla: <b>' +
        (permiso === 'granted' ? 'activada' : permiso === 'denied' ? 'bloqueada (actívela en el candado 🔒 de la barra de dirección)' : permiso === 'no' ? 'este teléfono no la permite' : 'sin activar') + '</b></p>',
      botones: [
        { texto: '🔊 Probar sonido', valor: 'probar', clase: 'borde opcion-lista' },
        { texto: '🖥️ Activar notificación en pantalla', valor: 'notif', clase: 'borde opcion-lista' },
        { texto: on ? '🔕 Silenciar' : '🔔 Activar sonido', valor: 'cambiar', clase: 'borde opcion-lista' },
        { texto: 'Listo', valor: null, clase: 'secundario' }
      ]
    });
    if (v === 'probar') { global.APP_MEMORIA.guardar('sonido_pedidos', true); UI.sonar(); UI.notificar('🛎️ Prueba', 'Así se verá un pedido nuevo.'); return avisosVentana(); }
    if (v === 'notif') { await UI.pedirNotificaciones(); return avisosVentana(); }
    if (v === 'cambiar') { global.APP_MEMORIA.guardar('sonido_pedidos', !on); if (!on) UI.sonar(); }
  }
  /* Arranca al entrar a la app y en cada cambio de vista (si ya corre, no se duplica). */
  document.addEventListener('DOMContentLoaded', function () {
    var ir = APP.ir;
    APP.ir = function () { var r = ir.apply(this, arguments); vigilar(); return r; };
    setTimeout(vigilar, 3000); // si la sesión ya estaba abierta
  });

  /* ----- Buscar / escanear el QR del pedido ----- */
  /* 3.1: busca por número, nombre del cliente o celular (últimos 30 días). */
  async function buscarPedido() {
    var n = await UI.pedirDato({ icono: '🔎', titulo: 'Buscar pedido', etiqueta: 'Número, nombre del cliente o celular', ph: 'PED-0005, Ana o 0987…', modo: 'text', boton: 'Buscar',
      texto: 'Si el cliente muestra el QR de su pedido, escanéelo con la cámara del teléfono: se abre aquí solo.',
      validar: function (v) { return v.replace(/\s/g, '').length >= 1 ? '' : 'Escriba algo para buscar.'; } });
    if (n === null) return;
    var limpio = n.replace(/\s/g, '');
    if (/^(ped-?)?\d{1,6}$/i.test(limpio)) {
      var num = limpio.toUpperCase().replace(/^PED-?/, '');
      return abrirPorNumero('PED-' + ('000' + num).slice(-Math.max(4, num.length)));
    }
    try {
      var r = await DATOS.pedir('pedidoBuscar', { texto: n });
      var lista = r.pedidos || [];
      if (!lista.length) return UI.error('Sin resultados', 'No hay pedidos de los últimos 30 días con «' + n + '».');
      if (lista.length === 1) return abrirPorNumero(lista[0].numero);
      var elegido = await UI.ventana({
        icono: '🔎', titulo: lista.length + ' pedido(s) con «' + n + '»',
        html: '<div class="lista">' + lista.map(function (p) {
          return '<button class="item item-boton" type="button" data-num="' + UI.esc(p.numero) + '"><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(p.numero) + ' · ' + UI.esc(p.cliente) + '</div>' +
            '<div class="item-sub">' + UI.esc(UI.fechaHora(p.creado)) + ' · ' + UI.dinero(p.total) + '</div></div>' + UI.chipEstado(p.estado) + '</button>';
        }).join('') + '</div>',
        alAbrir: function (v, cerrar) { UI.$$('[data-num]', v).forEach(function (b) { b.addEventListener('click', function () { cerrar(b.getAttribute('data-num')); }); }); },
        botones: [{ texto: 'Cerrar', valor: null, clase: 'secundario' }]
      });
      if (elegido) abrirPorNumero(elegido);
    } catch (err) { UI.error('No se pudo buscar', err.message); }
  }
  async function abrirPorNumero(numero) {
    try {
      var r = await DATOS.pedir('pedidoBuscar', { numero: numero });
      var p = r.pedido;
      var enLista = est.datos && buscar(p.id);
      if (enLista) {
        var art = UI.$('[data-id="' + p.id + '"]');
        if (art) { art = art.closest('.pedido'); art.classList.add('resaltado'); art.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { art.classList.remove('resaltado'); }, 2600); }
        return mas(null, enLista);
      }
      UI.ventana({ icono: '🧾', titulo: p.numero + ' · ' + p.cliente_nombre, html: '<div class="lista">' + tarjeta(p) + '</div>', botones: [{ texto: 'Cerrar', valor: true, clase: 'secundario' }] });
    } catch (err) { UI.error('No se encontró', err.message); }
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
    if (!ok) return;
    var motivo = '';
    if (p.estado === 'En camino' && elegido !== p.motorizado_id) {
      motivo = await UI.pedirDato({ icono: '🛵', titulo: 'Motivo del cambio', etiqueta: '¿Por qué cambia el motorizado?', ph: 'Moto dañada, accidente u otro', max: 200, validar: function (v) { return v.trim().length < 3 ? 'Escriba el motivo.' : ''; } });
      if (motivo === null) return;
    }
    if (elegido === p.motorizado_id) return UI.aviso('Ese motorizado ya está asignado.', '');
    var listo = await guardar(boton, 'pedidoAsignar', { id: p.id, motorizado_id: elegido, motivo: motivo }, 'Motorizado asignado.');
    if (listo && p.estado === 'En camino' && UI.digitos(p.telefono)) UI.abrirWhatsApp(p.telefono, 'Hola ' + p.cliente_nombre + ', cambiamos a quien te lleva tu pedido ' + p.numero + '. Puedes ver a tu nuevo motorizado en el seguimiento: ' + enlaceSeguimiento(p));
  }

  function imprimirComanda(p) {
    var items = (p.detalle || []).map(function (d) { return '<li><strong>' + Number(d.cantidad) + ' × ' + UI.esc(d.nombre) + '</strong>' + (d.extras ? '<small>Extras: ' + UI.esc(d.extras) + '</small>' : '') + '</li>'; }).join('');
    var html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comanda ' + UI.esc(p.numero) + '</title><style>@page{margin:3mm}body{font:14px Arial,sans-serif;max-width:78mm;margin:auto;color:#111}h2{text-align:center;font-size:18px}ul{list-style:none;padding:0}li{padding:5px 0;border-bottom:1px dashed #777;break-inside:avoid}small{display:block}p{overflow-wrap:anywhere}@media print{button{display:none}}@media (min-width:600px){body{max-width:190mm}}</style></head><body>' +
      '<h2>COMANDA ' + UI.esc(p.numero) + '</h2><p>Local: ' + UI.esc(APP.nombreLocal(p.local_id)) + '<br>Hora: ' + UI.esc(UI.fechaHora(p.creado)) + '<br>' + UI.esc(UI.tipoEntrega(p) === 'mesa' ? 'Mesa ' + p.mesa : UI.tipoEntrega(p) === 'domicilio' ? 'Domicilio · ' + p.direccion : 'Retiro') + '</p><ul>' + items + '</ul>' + (p.notas ? '<p>NOTAS: ' + UI.esc(p.notas) + '</p>' : '') + '</body></html>';
    var w = global.open('', '_blank');
    if (!w) return UI.aviso('Permita abrir la pestaña de impresión.', 'error');
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    var imprimir = w.document.createElement('button'); imprimir.textContent = '🖨️ Imprimir'; imprimir.style.cssText = 'display:block;margin:14px auto;padding:14px 25px;font-size:17px';
    imprimir.addEventListener('click', function () { w.print(); }); w.document.body.insertBefore(imprimir, w.document.body.firstChild);
    setTimeout(function () { if (!w.closed) w.print(); }, 250); // botón de respaldo por si el navegador bloquea impresión automática
  }

  async function mas(boton, p) {
    var dom = UI.tipoEntrega(p) === 'domicilio';
    var opciones = [['avisar', '💬 Avisar al cliente por WhatsApp'], ['llamar', '📞 Llamar al cliente']];
    var cerrado = p.estado === 'Entregado'; // 3.1.1: entregado = solo consultar
    if (p.tiene_foto) opciones.unshift(['foto', '📷 Ver foto de entrega']); // 3.1.3
    if (p.clave_seguimiento && p.estado !== 'Anulado') opciones.push(['copiar', '🔗 Copiar enlace de seguimiento']);
    if (dom && !cerrado) opciones.push(['mapa', '🗺️ Ver en el mapa · ' + UI.fuenteUbicacion(p).replace(/^\S+\s/, '')], ['pedir_ubic', '📍 Pedir ubicación por WhatsApp'], ['ubicacion', '📋 Pegar ubicación que mandó']);
    if (dom && (p.estado === 'Recibido' || p.estado === 'Preparando' || p.estado === 'En camino')) opciones.push(['asignar', '🛵 ' + (p.motorizado_id ? 'Cambiar' : 'Asignar') + ' motorizado']);
    if (p.estado === 'En camino') opciones.push(['regresar', '↩️ Regresó al local']);
    opciones.push(['imprimir', '🖨️ Imprimir comanda']);
    if (p.motorizado && !cerrado) opciones.push(['wa_moto', '💬 WhatsApp al motorizado']);
    if (UI.esDigital(p.forma_pago) && !cerrado) opciones.push(['verificar', p.pago_verificado ? '↩️ Marcar pago sin verificar' : '🏦 Marcar pago verificado']);
    if (UI.esDigital(p.forma_pago) && !p.pago_verificado && p.estado === 'Recibido') opciones.push(['anular_pago', '⛔ Anular: el pago no se acreditó']); // 3.1.5
    if (p.estado !== 'Entregado' || APP.sesion.rol === 'dueno') opciones.push(['anular', '⛔ Anular pedido']);
    var op = await UI.ventana({
      icono: '🧾', titulo: p.numero + ' · ' + p.cliente_nombre, texto: 'Creado ' + UI.hora(p.creado) + (p.preparando ? ' · preparando ' + UI.hora(p.preparando) : '') + (p.en_camino ? ' · salió ' + UI.hora(p.en_camino) : '') + (p.entregado ? ' · entregado ' + UI.hora(p.entregado) : ''),
      botones: opciones.map(function (o) { return { texto: o[1], valor: o[0], clase: 'borde opcion-lista' + (o[0] === 'anular' ? ' texto-peligro' : '') }; }).concat([{ texto: 'Cerrar', valor: null, clase: 'secundario' }])
    });
    if (!op) return;
    if (op === 'imprimir') return imprimirComanda(p);
    if (op === 'regresar') {
      var motivo = await UI.pedirDato({ icono: '↩️', titulo: 'Regreso de ' + p.numero, etiqueta: 'Motivo del regreso', ph: 'Faltó algo, se derramó, moto dañada…', max: 200, validar: function (v) { return v.trim().length < 3 ? 'Indique el motivo.' : ''; } });
      if (motivo === null) return;
      var listo = await guardar(boton, 'pedidoRegresar', { id: p.id, motivo: motivo }, 'Pedido regresó a Preparando.');
      if (listo && UI.digitos(p.telefono)) UI.abrirWhatsApp(p.telefono, 'Hola ' + p.cliente_nombre + ', tu pedido ' + p.numero + ' tuvo un inconveniente y lo estamos alistando de nuevo. Disculpa la demora. ' + enlaceSeguimiento(p));
      return;
    }
    if (op === 'avisar') return UI.abrirWhatsApp(p.telefono, mensajeCliente(p));
    if (op === 'foto') return UI.verFotoEntrega(p.id, p.numero);
    if (op === 'copiar') return UI.copiar(enlaceSeguimiento(p), 'Enlace copiado. Pégalo en el chat del cliente.');
    if (op === 'llamar') { global.location.href = 'tel:+' + UI.digitos(p.telefono); return; }
    if (op === 'pedir_ubic') return UI.abrirWhatsApp(p.telefono, 'Hola ' + p.cliente_nombre + ', somos ' + ((APP.publico && APP.publico.negocio_nombre) || 'el local') + '. Para llevarte tu pedido ' + p.numero + ', ¿nos envías tu ubicación por aquí? 📍 (toca 📎 → Ubicación → Enviar tu ubicación actual). ¡Gracias!');
    if (op === 'verificar' && !p.pago_verificado) return verificar(boton, p);
    if (op === 'mapa') { var u = UI.enlaceMapa(p); if (u) global.open(u, '_blank', 'noopener'); else UI.aviso('Este pedido no tiene dirección ni ubicación.', 'error'); return; }
    if (op === 'wa_moto') return UI.abrirWhatsApp(p.motorizado.celular, 'Pedido ' + p.numero + ' · ' + p.cliente_nombre + ' · ' + p.telefono + '\n' + (p.direccion || '') + (p.referencia ? ' (' + p.referencia + ')' : '') + '\nMapa: ' + UI.enlaceMapa(p) + '\nCobrar: ' + (p.forma_pago === 'efectivo' ? UI.dinero(p.total) : 'ya pagado, no cobrar') +
      (APP.publico && APP.publico.codigo_entrega !== 'NO' && p.pide_codigo !== false ? '\n🔢 Al entregar, pide al cliente su código de 4 números.' : ''));
    if (op === 'asignar') return asignar(boton, p);
    if (op === 'verificar') return guardar(boton, 'pedidoPagoVerificar', { id: p.id, verificado: !p.pago_verificado }, 'Listo.');
    if (op === 'ubicacion') {
      var enlace = await UI.pedirDato({ icono: '📍', titulo: 'Ubicación de ' + p.numero, etiqueta: 'Enlace de ubicación', valor: p.ubicacion_enlace, ph: 'https://maps.app.goo.gl/…', ayuda: 'En WhatsApp: abra la ubicación que mandó el cliente → Compartir → Copiar enlace, y péguelo aquí. Reemplaza a la ubicación anterior.', max: 400, validar: function (v) { return v && !/^https:\/\//.test(v) ? 'Pegue el enlace completo (empieza con https://).' : ''; } });
      if (enlace !== null) guardar(boton, 'pedidoUbicacion', { id: p.id, enlace: enlace }, 'Ubicación guardada: el motorizado usará esta.');
      return;
    }
    if (op === 'anular_pago') {
      var okA = await UI.confirmar('¿Anular ' + p.numero + '?', 'El pago de ' + UI.dinero(p.total) + ' no se acreditó en la cuenta. El pedido queda anulado con ese motivo.', 'Sí, anular', true);
      if (okA && await guardar(boton, 'pedidoAnular', { id: p.id, motivo: 'El pago no se acreditó en la cuenta del local.' }, p.numero + ' anulado.') && UI.digitos(p.telefono)) {
        UI.abrirWhatsApp(p.telefono, 'Hola ' + p.cliente_nombre + ', no recibimos el pago de tu pedido ' + p.numero + ' (' + UI.dinero(p.total) + ') en nuestra cuenta, por eso lo anulamos. Si ya pagaste, respóndenos con el comprobante y lo revisamos. 🙏');
      }
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
