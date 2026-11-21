/**
 * ============================================================
 * PEDIDO DEL CLIENTE (pedir.html) — pantalla pública.
 * - Carga el menú en UNA sola llamada (menuPublico).
 * - El precio final lo calcula el servidor; aquí solo se muestra.
 * - Código único de envío: si se toca dos veces o se corta la señal,
 *   el servidor devuelve el MISMO pedido (no duplica).
 * - Al final: botón para avisar al local por WhatsApp (gratis).
 * Enlace con local fijo: pedir.html?local=ID (para QR de cada local).
 * ============================================================
 */
(function (global) {
  'use strict';
  var UI = global.UI, DATOS = global.DATOS, MEM = global.APP_MEMORIA;

  var M = null;                 // menú
  var localId = '';
  var categoria = '';
  var carrito = {};             // clave -> { plato, extras:[nombres], cantidad }
  var codigoEnvio = '';         // se crea al abrir el resumen y se reusa hasta que el pedido entra
  var ubic = null;

  function $(s) { return UI.$(s); }
  function cuerpo() { return $('#pedir-cuerpo'); }

  function localesConMenu() {
    return M.locales.filter(function (l) { return platosDe(l.id).length; });
  }
  function platosDe(lid) {
    return M.platos.filter(function (p) { return p.local_id === 'TODOS' || p.local_id === lid; });
  }
  function categoriasDe(lid) {
    var usadas = {};
    platosDe(lid).forEach(function (p) { usadas[p.categoria_id] = true; });
    return M.categorias.filter(function (c) { return usadas[c.id] && (c.local_id === 'TODOS' || c.local_id === lid); });
  }
  function zonasDe(lid) { return M.zonas.filter(function (z) { return z.local_id === 'TODOS' || z.local_id === lid; }); }
  function local() { return M.locales.filter(function (l) { return l.id === localId; })[0] || {}; }

  function claveItem(p, extras) { return p.id + '|' + extras.slice().sort().join(','); }
  function unitario(it) {
    return it.plato.precio + it.plato.extras.filter(function (x) { return it.extras.indexOf(x.nombre) >= 0; }).reduce(function (s, x) { return s + x.precio; }, 0);
  }
  function items() { return Object.keys(carrito).map(function (k) { return carrito[k]; }).filter(function (i) { return i.cantidad > 0; }); }
  function subtotal() { return Math.round(items().reduce(function (s, i) { return s + unitario(i) * i.cantidad; }, 0) * 100) / 100; }
  function cantidadTotal() { return items().reduce(function (s, i) { return s + i.cantidad; }, 0); }
  function cantidadPlato(pid) { return items().filter(function (i) { return i.plato.id === pid; }).reduce(function (s, i) { return s + i.cantidad; }, 0); }

  /* ---------------- Carga ---------------- */
  async function iniciar() {
    UI.tema();
    if (!global.APP_CONFIG.configurada) return bloqueo('Muy pronto', 'Este negocio aún está preparando sus pedidos en línea.');
    try {
      M = await DATOS.pedir('menuPublico', {});
    } catch (err) {
      return bloqueo('No pudimos cargar el menú', err.message + ' Toque para intentar de nuevo.', true);
    }
    var cfg = M.config || {};
    if (cfg.zona_horaria) UI.zona = cfg.zona_horaria;
    UI.aplicarMarca(cfg);
    $('#pedir-bienvenida').textContent = cfg.mensaje_bienvenida || '';
    if (cfg.licencia && cfg.licencia.estado !== 'activa') {
      return bloqueo('Pedidos en línea pausados', 'Por ahora no estamos recibiendo pedidos por aquí.' , false, cfg.whatsapp);
    }
    var conMenu = localesConMenu();
    if (!conMenu.length) return bloqueo('Menú en preparación', 'Aún no hay platos publicados. Vuelve pronto.', false, cfg.whatsapp);
    var pedido = new URLSearchParams(global.location.search).get('local') || MEM.leer('pedir_local');
    localId = conMenu.some(function (l) { return l.id === pedido; }) ? pedido : (conMenu.length === 1 ? conMenu[0].id : '');
    if (localId) pintarMenu(); else pintarLocales();
  }

  function bloqueo(titulo, texto, reintentar, whatsapp) {
    cuerpo().innerHTML = '<div class="tarjeta" style="text-align:center;margin-top:10px"><div style="font-size:44px">🍽️</div>' +
      '<h2 style="margin:6px 0">' + UI.esc(titulo) + '</h2><p class="subtitulo">' + UI.esc(texto) + '</p>' +
      '<div class="acciones">' + (reintentar ? '<button class="btn" type="button" id="btn-reintentar">↻ Intentar de nuevo</button>' : '') +
      (whatsapp ? '<button class="btn borde" type="button" id="btn-wa-bloqueo">💬 Escribir por WhatsApp</button>' : '') + '</div></div>';
    $('#pedir-bienvenida').textContent = '';
    var r = $('#btn-reintentar'); if (r) r.addEventListener('click', function () { global.location.reload(); });
    var w = $('#btn-wa-bloqueo'); if (w) w.addEventListener('click', function () { UI.abrirWhatsApp(whatsapp, 'Hola, quiero hacer un pedido.'); });
    $('#barra-pedido').hidden = true;
  }

  /* ---------------- Elegir local ---------------- */
  function pintarLocales() {
    $('#barra-pedido').hidden = true;
    cuerpo().innerHTML = '<h2 style="margin:6px 0 12px">¿De qué local pides?</h2><div class="lista">' +
      localesConMenu().map(function (l) {
        return '<button class="item" type="button" data-local="' + UI.esc(l.id) + '" style="text-align:left;cursor:pointer;width:100%">' +
          '<div class="avatar" aria-hidden="true">📍</div><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(l.nombre) + '</div>' +
          '<div class="item-sub">' + UI.esc(l.direccion || '') + '</div></div><span aria-hidden="true">›</span></button>';
      }).join('') + '</div>';
    UI.$$('[data-local]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () { cambiarLocal(b.getAttribute('data-local')); });
    });
  }

  function cambiarLocal(id) {
    if (id !== localId && cantidadTotal()) carrito = {}; // el carrito es por local
    localId = id; categoria = ''; codigoEnvio = '';
    MEM.guardar('pedir_local', id);
    pintarMenu();
  }

  /* ---------------- Menú ---------------- */
  function pintarMenu() {
    var cats = categoriasDe(localId);
    if (!categoria || !cats.some(function (c) { return c.id === categoria; })) categoria = cats.length ? cats[0].id : '';
    var varios = localesConMenu().length > 1;
    cuerpo().innerHTML =
      (varios ? '<button class="btn secundario chico" type="button" id="btn-cambiar-local" style="margin-bottom:6px">📍 ' + UI.esc(local().nombre) + ' · cambiar</button>' : '<p class="subtitulo" style="margin:0 0 4px">📍 ' + UI.esc(local().nombre) + '</p>') +
      '<div class="categorias-barra"><div class="pestanas" role="tablist" style="padding-bottom:0;margin-bottom:0">' + cats.map(function (c) {
        return '<button class="pestana" role="tab" type="button" data-cat="' + UI.esc(c.id) + '" aria-selected="' + (c.id === categoria) + '">' + UI.esc(c.nombre) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="platos" id="lista-platos"></div>';
    var cl = $('#btn-cambiar-local'); if (cl) cl.addEventListener('click', pintarLocales);
    UI.$$('[data-cat]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () {
        categoria = b.getAttribute('data-cat');
        UI.$$('[data-cat]', cuerpo()).forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
        pintarPlatos();
      });
    });
    pintarPlatos();
    pintarBarra();
  }

  function fotoHtml(p) {
    return p.foto_url ? '<img src="' + UI.esc(p.foto_url) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.textContent=\'🍽️\'">' : '🍽️';
  }

  function pintarPlatos() {
    var lista = platosDe(localId).filter(function (p) { return p.categoria_id === categoria; });
    var cont = $('#lista-platos');
    cont.innerHTML = lista.length ? lista.map(function (p) {
      var cant = cantidadPlato(p.id);
      return '<article class="plato' + (p.agotado ? ' agotado' : '') + '">' +
        '<div class="plato-foto" aria-hidden="true">' + fotoHtml(p) + '</div>' +
        '<div class="plato-info"><h3>' + UI.esc(p.nombre) + '</h3>' + (p.descripcion ? '<p>' + UI.esc(p.descripcion) + '</p>' : '') +
        (p.extras.length ? '<p style="font-size:13px">＋ ' + p.extras.length + ' opción(es) para personalizar</p>' : '') +
        '<div class="plato-pie"><span class="precio">' + UI.dinero(p.precio) + '</span><span style="flex:1"></span>' +
        (p.agotado ? '<span class="etiqueta">Agotado</span>' :
          (cant && !p.extras.length ? '<div class="contador"><button type="button" data-menos="' + UI.esc(p.id) + '" aria-label="Quitar uno">−</button><span>' + cant + '</span><button type="button" data-mas="' + UI.esc(p.id) + '" aria-label="Agregar uno">＋</button></div>'
            : '<button class="btn chico" type="button" data-agregar="' + UI.esc(p.id) + '">' + (cant ? 'Agregar otro (' + cant + ')' : 'Agregar') + '</button>')) +
        '</div></div></article>';
    }).join('') : UI.vacio('🍽️', 'No hay platos en esta categoría.');
    UI.$$('[data-agregar]', cont).forEach(function (b) { b.addEventListener('click', function () { agregar(b.getAttribute('data-agregar')); }); });
    UI.$$('[data-mas]', cont).forEach(function (b) { b.addEventListener('click', function () { sumar(b.getAttribute('data-mas'), 1); }); });
    UI.$$('[data-menos]', cont).forEach(function (b) { b.addEventListener('click', function () { sumar(b.getAttribute('data-menos'), -1); }); });
  }

  function plato(id) { return M.platos.filter(function (p) { return p.id === id; })[0]; }

  function sumar(pid, n) {
    var p = plato(pid);
    var k = claveItem(p, []);
    carrito[k] = carrito[k] || { plato: p, extras: [], cantidad: 0 };
    carrito[k].cantidad = Math.max(0, Math.min(50, carrito[k].cantidad + n));
    codigoEnvio = '';
    pintarPlatos(); pintarBarra(true);
  }

  async function agregar(pid) {
    var p = plato(pid);
    if (!p.extras.length) return sumar(pid, 1);
    var elegidos = [];
    var ok = await UI.ventana({
      icono: '🍽️', titulo: p.nombre, texto: 'Personaliza tu plato (opcional).',
      html: '<div class="opciones">' + p.extras.map(function (x, i) {
        return '<label class="opcion"><input type="checkbox" value="' + i + '"><span>' + UI.esc(x.nombre) + '</span><span class="derecha">' + (x.precio ? '+ ' + UI.dinero(x.precio) : '') + '</span></label>';
      }).join('') + '</div>',
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Agregar al pedido', valor: true, antes: function (v) {
        elegidos = UI.$$('input:checked', v).map(function (c) { return p.extras[Number(c.value)].nombre; });
        return true;
      } }]
    });
    if (!ok) return;
    var k = claveItem(p, elegidos);
    carrito[k] = carrito[k] || { plato: p, extras: elegidos, cantidad: 0 };
    carrito[k].cantidad = Math.min(50, carrito[k].cantidad + 1);
    codigoEnvio = '';
    UI.aviso('Agregado: ' + p.nombre, 'ok');
    pintarPlatos(); pintarBarra(true);
  }

  function pintarBarra(saltar) {
    var n = cantidadTotal();
    var barra = $('#barra-pedido');
    barra.hidden = !n;
    var b = $('#btn-ver-pedido');
    b.innerHTML = '<span class="cant">' + n + '</span> Ver pedido · ' + UI.esc(UI.dinero(subtotal()));
    if (saltar) { b.classList.remove('saltito'); void b.offsetWidth; b.classList.add('saltito'); }
  }

  /* ---------------- Resumen y datos ---------------- */
  function pintarResumen() {
    if (!codigoEnvio) codigoEnvio = UI.codigoEnvio();
    var cli = MEM.leer('cliente') || {};
    var zonas = zonasDe(localId);
    var cfg = M.config;
    $('#barra-pedido').hidden = true;
    global.scrollTo(0, 0);
    cuerpo().innerHTML =
      '<button class="btn secundario chico" type="button" id="btn-volver">← Seguir eligiendo</button>' +
      '<h2 style="margin:14px 0 10px">Tu pedido</h2>' +
      '<div class="tarjeta" id="resumen-items"></div>' +
      '<form id="form-pedido" class="rejilla" style="margin-top:14px" autocomplete="on" novalidate>' +
      '<div class="tarjeta"><h3 style="margin-top:0">Tus datos</h3>' +
      '<div class="campo"><label for="pe-nombre">Nombre</label><input class="entrada" id="pe-nombre" name="nombre" autocomplete="name" maxlength="80" value="' + UI.esc(cli.nombre || '') + '"></div>' +
      '<div class="campo"><label for="pe-tel">Celular (WhatsApp)</label><input class="entrada" id="pe-tel" name="telefono" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="0991234567" value="' + UI.esc(cli.telefono || '') + '"></div>' +
      '<h3>¿Cómo lo recibes?</h3><div class="opciones" id="op-entrega">' +
      zonas.map(function (z, i) {
        return '<label class="opcion"><input type="radio" name="zona" value="' + UI.esc(z.id) + '"' + (i === 0 ? ' checked' : '') + '><span>🛵 A domicilio · ' + UI.esc(z.nombre) + (z.minutos ? ' <small style="color:var(--texto-2)">(~' + z.minutos + ' min)</small>' : '') + '</span><span class="derecha">' + UI.dinero(z.costo) + '</span></label>';
      }).join('') +
      '<label class="opcion"><input type="radio" name="zona" value=""' + (zonas.length ? '' : ' checked') + '><span>🏪 Retiro en el local</span><span class="derecha">' + UI.dinero(0) + '</span></label></div>' +
      '<div id="bloque-direccion"><div class="campo" style="margin-top:14px"><label for="pe-dir">Dirección</label><input class="entrada" id="pe-dir" name="direccion" autocomplete="street-address" maxlength="200" value="' + UI.esc(cli.direccion || '') + '"></div>' +
      '<div class="campo"><label for="pe-ref">Referencia</label><input class="entrada" id="pe-ref" name="referencia" maxlength="200" placeholder="Ej. casa azul, junto a la farmacia" value="' + UI.esc(cli.referencia || '') + '"></div>' +
      '<button class="btn borde bloque" type="button" id="btn-ubicacion">📍 Usar mi ubicación</button><p class="ayuda" id="ubic-estado" style="margin:6px 0 0"></p></div>' +
      '</div>' +
      '<div class="tarjeta"><h3 style="margin-top:0">Pago</h3><div class="opciones">' +
      '<label class="opcion"><input type="radio" name="forma_pago" value="efectivo" checked><span>💵 Efectivo al recibir</span></label>' +
      '<label class="opcion"><input type="radio" name="forma_pago" value="transferencia"><span>🏦 Transferencia</span></label></div>' +
      (cfg.datos_transferencia ? '<div class="banda" id="datos-transf" hidden style="margin-top:10px;white-space:pre-line">' + UI.esc(cfg.datos_transferencia) + '</div>' : '') +
      '<div class="campo" style="margin-top:14px"><label for="pe-cupon">Cupón de descuento (opcional)</label><input class="entrada" id="pe-cupon" name="cupon" maxlength="30" autocapitalize="characters" spellcheck="false"><span class="ayuda">El descuento se aplica al enviar.</span></div>' +
      '<div class="campo"><label for="pe-notas">Nota para la cocina (opcional)</label><textarea class="entrada" id="pe-notas" name="notas" maxlength="300" placeholder="Ej. sin ají"></textarea></div>' +
      '<div id="totales"></div>' +
      '<button class="btn bloque" type="submit" style="margin-top:12px;min-height:56px;font-size:17px">Enviar pedido</button>' +
      '<p class="ayuda" style="text-align:center;margin-top:8px">Recibirás tu número de pedido al instante.</p></div>' +
      '</form>';

    $('#btn-volver').addEventListener('click', function () { pintarMenu(); });
    var f = $('#form-pedido');
    UI.$$('input[name=zona]', f).forEach(function (r) { r.addEventListener('change', actualizarEntrega); });
    UI.$$('input[name=forma_pago]', f).forEach(function (r) {
      r.addEventListener('change', function () { var d = $('#datos-transf'); if (d) d.hidden = r.value !== 'transferencia' || !r.checked; });
    });
    $('#btn-ubicacion').addEventListener('click', function (e) {
      var b = e.currentTarget;
      UI.trabajando(b, async function () {
        $('#ubic-estado').textContent = 'Buscando tu ubicación…';
        ubic = await UI.ubicacion();
        $('#ubic-estado').textContent = ubic ? '✅ Ubicación lista (precisión ~' + ubic.precision + ' m). Igual escribe una referencia.' : 'No se pudo obtener la ubicación. Revisa el permiso o escribe tu dirección.';
      });
    });
    f.addEventListener('submit', enviar);
    pintarItemsResumen();
    actualizarEntrega();
  }

  function zonaElegida() {
    var r = UI.$('input[name=zona]:checked');
    return r ? M.zonas.filter(function (z) { return z.id === r.value; })[0] || null : null;
  }

  function actualizarEntrega() {
    var z = zonaElegida();
    $('#bloque-direccion').hidden = !z;
    var envio = z ? z.costo : 0;
    $('#totales').innerHTML =
      '<div class="resumen-linea"><span>Subtotal</span><span>' + UI.dinero(subtotal()) + '</span></div>' +
      '<div class="resumen-linea"><span>Envío</span><span>' + UI.dinero(envio) + '</span></div>' +
      '<div class="resumen-linea total"><span>Total</span><span>' + UI.dinero(subtotal() + envio) + '</span></div>';
  }

  function pintarItemsResumen() {
    var lista = items();
    if (!lista.length) return pintarMenu();
    $('#resumen-items').innerHTML = lista.map(function (it, i) {
      return '<div class="resumen-linea" style="align-items:center"><div style="min-width:0"><b>' + UI.esc(it.plato.nombre) + '</b>' +
        (it.extras.length ? '<div class="item-sub">' + UI.esc(it.extras.join(', ')) + '</div>' : '') + '<div class="item-sub">' + UI.dinero(unitario(it)) + ' c/u</div></div>' +
        '<div class="contador"><button type="button" data-r-menos="' + i + '" aria-label="Quitar uno">−</button><span>' + it.cantidad + '</span><button type="button" data-r-mas="' + i + '" aria-label="Agregar uno">＋</button></div></div>';
    }).join('');
    UI.$$('[data-r-mas],[data-r-menos]', $('#resumen-items')).forEach(function (b) {
      b.addEventListener('click', function () {
        var mas = b.hasAttribute('data-r-mas');
        var it = lista[Number(b.getAttribute(mas ? 'data-r-mas' : 'data-r-menos'))];
        it.cantidad = Math.max(0, Math.min(50, it.cantidad + (mas ? 1 : -1)));
        codigoEnvio = UI.codigoEnvio(); // cambió el pedido: es otro envío
        pintarItemsResumen(); actualizarEntrega();
      });
    });
  }

  async function enviar(ev) {
    ev.preventDefault();
    var f = ev.target, boton = f.querySelector('button[type=submit]');
    var d = UI.leerFormulario(f);
    var z = zonaElegida();
    var malo = !d.nombre ? ['pe-nombre', 'Escribe tu nombre.'] :
      UI.digitos(d.telefono).length < 7 ? ['pe-tel', 'Escribe tu número de celular.'] :
      (z && !d.direccion && !ubic) ? ['pe-dir', 'Escribe tu dirección o toca «Usar mi ubicación».'] : null;
    UI.$$('[aria-invalid]', f).forEach(function (x) { x.removeAttribute('aria-invalid'); });
    if (malo) { var c = $('#' + malo[0]); c.setAttribute('aria-invalid', 'true'); c.focus(); return UI.aviso(malo[1], 'error'); }
    var forma = (UI.$('input[name=forma_pago]:checked', f) || {}).value || 'efectivo';
    var datos = {
      op_id: codigoEnvio, local_id: localId, zona_id: z ? z.id : '', forma_pago: forma, cupon: d.cupon, notas: d.notas,
      items: items().map(function (it) { return { plato_id: it.plato.id, cantidad: it.cantidad, extras: it.extras }; }),
      cliente: { nombre: d.nombre, telefono: d.telefono, direccion: z ? d.direccion : '', referencia: z ? d.referencia : '', lat: z && ubic ? ubic.lat : '', lng: z && ubic ? ubic.lng : '' }
    };
    await UI.trabajando(boton, async function () {
      try {
        var r = await DATOS.pedir('pedidoCrear', datos, { guardar: true });
        MEM.guardar('cliente', { nombre: d.nombre, telefono: d.telefono, direccion: d.direccion, referencia: d.referencia });
        MEM.guardar('ultimo_pedido', { numero: r.pedido.numero, telefono: d.telefono });
        carrito = {}; codigoEnvio = ''; ubic = null;
        pintarExito(r.pedido, datos);
      } catch (err) {
        // El código de envío se conserva: si vuelve a intentar, no se duplica.
        UI.ventana({ icono: '⚠️', titulo: 'Tu pedido no se envió', texto: err.message, botones: [{ texto: 'Entendido', valor: true }] });
      }
    });
  }

  function textoWhatsApp(p) {
    var lineas = (p.detalle || []).map(function (x) { return '• ' + x.cantidad + ' × ' + x.nombre + (x.extras ? ' (' + x.extras + ')' : ''); });
    return 'Hola, acabo de hacer el pedido *' + p.numero + '* en ' + (local().nombre || '') + '.\n' + lineas.join('\n') +
      '\nTotal: ' + UI.dinero(p.total) + ' · Pago: ' + (p.forma_pago === 'transferencia' ? 'transferencia' : 'efectivo') +
      (p.zona_id ? '\nDirección: ' + p.direccion + (p.referencia ? ' (' + p.referencia + ')' : '') : '\nRetiro en el local') +
      (p.lat !== '' && p.lat != null ? '\nUbicación: https://maps.google.com/?q=' + p.lat + ',' + p.lng : '') + '\nNombre: ' + p.cliente_nombre;
  }

  function pintarExito(p) {
    var wa = local().telefono || M.config.whatsapp;
    global.scrollTo(0, 0);
    $('#barra-pedido').hidden = true;
    cuerpo().innerHTML = '<div class="tarjeta exito-grande" style="margin-top:6px"><div class="ico">🎉</div>' +
      '<h2 style="margin:4px 0">¡Pedido recibido!</h2><p class="subtitulo" style="margin-bottom:6px">Tu número es</p>' +
      '<div style="font-size:34px;font-weight:800;letter-spacing:-.02em">' + UI.esc(p.numero) + '</div>' +
      '<p style="margin:8px 0 0">Total: <b>' + UI.dinero(p.total) + '</b>' + (p.descuento ? ' · Descuento ' + UI.dinero(p.descuento) : '') + '</p>' +
      (p.hora_estimada ? '<p class="subtitulo" style="margin:4px 0 0">Hora estimada: ' + UI.esc(UI.hora(p.hora_estimada)) + '</p>' : '') +
      (p.forma_pago === 'transferencia' && M.config.datos_transferencia ? '<div class="banda" style="margin-top:12px;text-align:left;white-space:pre-line">🏦 ' + UI.esc(M.config.datos_transferencia) + '</div>' : '') +
      '<div class="acciones" style="margin-top:16px">' +
      (UI.digitos(wa) ? '<button class="btn" type="button" id="btn-wa">💬 Avisar por WhatsApp</button>' : '') +
      '<button class="btn borde" type="button" id="btn-seguir">🔎 Ver estado</button>' +
      '<button class="btn secundario" type="button" id="btn-nuevo">Hacer otro pedido</button></div></div>';
    var b = $('#btn-wa'); if (b) b.addEventListener('click', function () { UI.abrirWhatsApp(wa, textoWhatsApp(p)); });
    $('#btn-nuevo').addEventListener('click', pintarMenu);
    $('#btn-seguir').addEventListener('click', function (e) { consultar(e.currentTarget, p.numero, (MEM.leer('cliente') || {}).telefono); });
  }

  function consultar(boton, numero, telefono) {
    UI.trabajando(boton, async function () {
      try {
        var r = await DATOS.pedir('pedidoConsultar', { numero: numero, telefono: telefono });
        var pasos = [['Recibido', r.creado], ['Preparando', r.preparando], ['En camino', r.en_camino], ['Entregado', r.entregado]];
        UI.ventana({ icono: (UI.ESTADOS[r.estado] || {}).icono || '🧾', titulo: 'Pedido ' + r.numero,
          html: '<p>' + UI.chipEstado(r.estado) + '</p><div class="lista">' + pasos.map(function (x) {
            return '<div class="item" style="min-height:48px"><div class="item-cuerpo">' + UI.esc(x[0]) + '</div><b>' + (x[1] ? UI.esc(UI.hora(x[1])) : '—') + '</b></div>';
          }).join('') + '</div>' + (r.hora_estimada && r.estado !== 'Entregado' && r.estado !== 'Anulado' ? '<p class="subtitulo" style="margin-top:10px">Hora estimada: ' + UI.esc(UI.hora(r.hora_estimada)) + '</p>' : '') });
      } catch (err) { UI.error('No se pudo consultar', err.message); }
    });
  }

  /* Personal con sesión abierta en este teléfono: botón para regresar a la app. */
  function botonVolverApp() {
    if (!MEM.leer('token')) return;
    var a = document.createElement('a');
    a.className = 'btn secundario chico';
    a.href = './';
    a.textContent = '← Volver a la app';
    a.style.cssText = 'position:relative;z-index:1;margin-bottom:10px';
    var portada = document.querySelector('.pedir-portada');
    portada.insertBefore(a, portada.firstChild);
  }

  document.addEventListener('DOMContentLoaded', function () {
    botonVolverApp();
    $('#btn-ver-pedido').addEventListener('click', pintarResumen);
    iniciar();
  });
})(window);
