/**
 * ============================================================
 * PEDIDO DEL CLIENTE (pedir.html) — pantalla pública. Versión 3.0
 * Tres pasos claros: ① Platos → ② Entrega y datos → ③ Confirmar.
 * - Menú en UNA sola llamada (menuPublico). El precio final lo
 *   calcula el servidor; aquí solo se muestra.
 * - Código único de envío: si se toca dos veces o se corta la señal,
 *   el servidor devuelve el MISMO pedido (no duplica).
 * - Domicilio, retiro o comer en el local (QR de mesa).
 * - Ubicación de 3 formas: GPS con mapa y pin, pegar enlace, WhatsApp.
 * - Barra «Tu pedido» con avance, repetir último pedido, sugerencias,
 *   buscador, propina, Deuna, calificación y QR del pedido.
 * Enlaces: pedir.html?local=ID&mesa=N&o=volante
 * ============================================================
 */
(function (global) {
  'use strict';
  var UI = global.UI, DATOS = global.DATOS, MEM = global.APP_MEMORIA;

  var M = null;                 // menú
  var localId = '';
  var categoria = '';
  var busqueda = '';
  var carrito = {};             // clave -> { plato, extras:[nombres], cantidad }
  var codigoEnvio = '';         // se crea al confirmar y se reusa hasta que el pedido entra
  var ubic = null;              // { lat, lng, precision, fuente:'gps'|'enlace', enlace }
  var mapa = null;
  var paso = 1;
  var params = new URLSearchParams(global.location.search);
  var entrega = { tipo: '', zona: '', mesa: params.get('mesa') || '', cuando: 'ya', hora: '' };
  var pago = { forma: 'efectivo', propina: 0 };
  var origen = (params.get('o') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);

  function $(s) { return UI.$(s); }
  function cuerpo() { return $('#pedir-cuerpo'); }
  function cfg() { return (M && M.config) || {}; }

  function localesConMenu() { return M.locales.filter(function (l) { return platosDe(l.id).length; }); }
  function platosDe(lid) { return M.platos.filter(function (p) { return p.local_id === 'TODOS' || p.local_id === lid; }); }
  function categoriasDe(lid) {
    var usadas = {};
    platosDe(lid).forEach(function (p) { usadas[p.categoria_id] = true; });
    return M.categorias.filter(function (c) { return usadas[c.id] && (c.local_id === 'TODOS' || c.local_id === lid); });
  }
  function zonasDe(lid) { return M.zonas.filter(function (z) { return z.local_id === 'TODOS' || z.local_id === lid; }); }
  function local() { return M.locales.filter(function (l) { return l.id === localId; })[0] || {}; }
  function plato(id) { return M.platos.filter(function (p) { return p.id === id; })[0]; }
  function mesasOn() { return Number(cfg().mesas) > 0; }

  function claveItem(p, extras) { return p.id + '|' + extras.slice().sort().join(','); }
  function unitario(it) {
    return it.plato.precio + it.plato.extras.filter(function (x) { return it.extras.indexOf(x.nombre) >= 0; }).reduce(function (s, x) { return s + x.precio; }, 0);
  }
  function items() { return Object.keys(carrito).map(function (k) { return carrito[k]; }).filter(function (i) { return i.cantidad > 0; }); }
  function subtotal() { return Math.round(items().reduce(function (s, i) { return s + unitario(i) * i.cantidad; }, 0) * 100) / 100; }
  function cantidadTotal() { return items().reduce(function (s, i) { return s + i.cantidad; }, 0); }
  function cantidadPlato(pid) { return items().filter(function (i) { return i.plato.id === pid; }).reduce(function (s, i) { return s + i.cantidad; }, 0); }
  function zonaElegida() { return entrega.tipo === 'domicilio' ? M.zonas.filter(function (z) { return z.id === entrega.zona; })[0] || null : null; }
  function envio() { var z = zonaElegida(); return z ? z.costo : 0; }
  function propina() { return entrega.tipo === 'domicilio' && cfg().propinas !== 'NO' ? pago.propina : 0; }
  function cambio() { codigoEnvio = ''; }

  /* ---------------- Horario ---------------- */
  function horaAhora() {
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: UI.zona, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); } catch (e) { return new Date().toTimeString().slice(0, 5); }
  }
  function abierto() { return !M.abierto || M.abierto.abierto !== false; }
  /* Horas de 15 en 15 min desde dentro de 30 min hasta el cierre. */
  function horasProgramables() {
    var ap = cfg().horario_apertura, ci = cfg().horario_cierre, ahora = horaAhora();
    var out = [];
    function min(t) { var p = t.split(':'); return Number(p[0]) * 60 + Number(p[1]); }
    var desde = min(ahora) + 30;
    desde = Math.ceil(desde / 15) * 15;
    var fin = /^\d{2}:\d{2}$/.test(ci) ? min(ci) : 24 * 60 - 15;
    var inicio = /^\d{2}:\d{2}$/.test(ap) ? min(ap) : 0;
    if (fin <= inicio) fin = 24 * 60 - 15; // cierra después de medianoche: hasta las 23:45
    for (var m = Math.max(desde, inicio); m < fin && m < 24 * 60; m += 15) {
      out.push(('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2));
    }
    return out;
  }
  function chipHorario() {
    var ap = cfg().horario_apertura, ci = cfg().horario_cierre;
    if (!abierto()) return '<span class="chip-horario cerrado">● Cerrado' + (ap ? ' · abre ' + UI.esc(ap) : '') + '</span>';
    return ci ? '<span class="chip-horario">● Abierto · hasta ' + UI.esc(ci) + '</span>' : '<span class="chip-horario">● Abierto</span>';
  }

  /* ---------------- Carga ---------------- */
  async function iniciar() {
    UI.tema();
    if (!global.APP_CONFIG.configurada) return bloqueo('Muy pronto', 'Este negocio aún está preparando sus pedidos en línea.');
    try {
      M = await DATOS.pedir('menuPublico', {});
    } catch (err) {
      return bloqueo('No pudimos cargar el menú', err.message + ' Toque para intentar de nuevo.', true);
    }
    var c = cfg();
    if (c.zona_horaria) UI.zona = c.zona_horaria;
    UI.aplicarMarca(c);
    $('#pedir-bienvenida').innerHTML = UI.esc(c.mensaje_bienvenida || '') + '<br>' + chipHorario();
    if (c.licencia && c.licencia.estado !== 'activa') {
      return bloqueo('Pedidos en línea pausados', 'Por ahora no estamos recibiendo pedidos por aquí.', false, c.whatsapp);
    }
    var conMenu = localesConMenu();
    if (!conMenu.length) return bloqueo('Menú en preparación', 'Aún no hay platos publicados. Vuelve pronto.', false, c.whatsapp);
    var pedido = params.get('local') || MEM.leer('pedir_local');
    localId = conMenu.some(function (l) { return l.id === pedido; }) ? pedido : (conMenu.length === 1 ? conMenu[0].id : '');
    if (entrega.mesa && mesasOn()) entrega.tipo = 'mesa';
    pintarSeguimiento();
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

  /* ---------------- Pasos ---------------- */
  function pasos() {
    var nombres = ['Platos', 'Entrega', 'Confirmar'];
    return '<ol class="pasos" aria-label="Pasos del pedido">' + nombres.map(function (n, i) {
      var k = i + 1;
      return '<li class="' + (k < paso ? 'hecho' : k === paso ? 'actual' : '') + '"' + (k === paso ? ' aria-current="step"' : '') + '><span>' + (k < paso ? '✓' : k) + '</span>' + n + '</li>';
    }).join('') + '</ol>';
  }
  function irA(n) {
    paso = n;
    if (mapa) { mapa.destruir(); mapa = null; }
    global.scrollTo({ top: 0, behavior: 'smooth' });
    if (n === 1) pintarMenu(); else if (n === 2) pintarEntrega(); else pintarConfirmar();
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
    localId = id; categoria = ''; cambio(); entrega.zona = '';
    MEM.guardar('pedir_local', id);
    irA(1);
  }

  /* ---------------- Paso 1: menú ---------------- */
  function ultimoCarrito() {
    var u = MEM.leer('ultimo_carrito');
    if (!u || u.local !== localId || !Array.isArray(u.items)) return null;
    var validos = u.items.filter(function (i) { var p = plato(i.plato_id); return p && !p.agotado && (p.local_id === 'TODOS' || p.local_id === localId); });
    return validos.length ? validos : null;
  }

  function pintarMenu() {
    paso = 1;
    var cats = categoriasDe(localId);
    var hayVendidos = platosDe(localId).some(function (p) { return /mas_vendido/.test(p.etiquetas); });
    if (categoria !== '_top' && (!categoria || !cats.some(function (c) { return c.id === categoria; }))) categoria = hayVendidos ? '_top' : (cats.length ? cats[0].id : '');
    var varios = localesConMenu().length > 1;
    var rep = ultimoCarrito();
    cuerpo().innerHTML = pasos() +
      (varios ? '<button class="btn secundario chico" type="button" id="btn-cambiar-local" style="margin-bottom:8px">📍 ' + UI.esc(local().nombre) + ' · cambiar</button>' : '<p class="subtitulo" style="margin:0 0 6px">📍 ' + UI.esc(local().nombre) + '</p>') +
      (entrega.tipo === 'mesa' && entrega.mesa ? '<div class="banda" style="margin:0 0 10px">🍽️ <span>Estás en la <b>mesa ' + UI.esc(entrega.mesa) + '</b>. Pide aquí y te lo llevamos.</span></div>' : '') +
      (!abierto() ? '<div class="banda aviso-cerrado" style="margin:0 0 10px">🌙 <span>' + UI.esc(M.abierto.mensaje || 'Estamos cerrados.') + '</span></div>' : '') +
      (rep && !cantidadTotal() ? '<button class="tarjeta repetir" type="button" id="btn-repetir"><span class="repetir-ico">🔁</span><span><b>Repetir mi último pedido</b><small>' + UI.esc(rep.map(function (i) { return i.cantidad + '× ' + plato(i.plato_id).nombre; }).join(', ')) + '</small></span><span aria-hidden="true">›</span></button>' : '') +
      '<div class="buscador"><span aria-hidden="true">🔎</span><input class="entrada" id="buscar" type="search" placeholder="Buscar un plato…" autocomplete="off" value="' + UI.esc(busqueda) + '" aria-label="Buscar un plato"></div>' +
      '<div class="categorias-barra"><div class="pestanas" role="tablist" style="padding-bottom:0;margin-bottom:0">' +
      (hayVendidos ? '<button class="pestana" role="tab" type="button" data-cat="_top" aria-selected="' + (categoria === '_top') + '">⭐ Más pedidos</button>' : '') +
      cats.map(function (c) {
        return '<button class="pestana" role="tab" type="button" data-cat="' + UI.esc(c.id) + '" aria-selected="' + (c.id === categoria) + '">' + UI.esc(c.nombre) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="platos" id="lista-platos"></div>';
    var cl = $('#btn-cambiar-local'); if (cl) cl.addEventListener('click', pintarLocales);
    var br = $('#btn-repetir'); if (br) br.addEventListener('click', function () { repetir(rep); });
    $('#buscar').addEventListener('input', function (e) { busqueda = e.target.value; pintarPlatos(); });
    UI.$$('[data-cat]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () {
        categoria = b.getAttribute('data-cat'); busqueda = ''; $('#buscar').value = '';
        UI.$$('[data-cat]', cuerpo()).forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
        pintarPlatos();
      });
    });
    pintarPlatos();
    pintarBarra();
  }

  function repetir(lista) {
    lista.forEach(function (i) {
      var p = plato(i.plato_id);
      var extras = (i.extras || []).filter(function (n) { return p.extras.some(function (x) { return x.nombre === n; }); });
      var k = claveItem(p, extras);
      carrito[k] = { plato: p, extras: extras, cantidad: Math.min(50, i.cantidad) };
    });
    cambio(); UI.vibrar(); UI.aviso('Listo: tu último pedido está en el carrito.', 'ok');
    pintarPlatos(); pintarBarra(true);
  }

  /* 3.1: ilustración premium cuando el plato no tiene foto (o la foto no carga). */
  function ilustracion(p) {
    var t = sinTildes(((M.categorias.filter(function (x) { return x.id === p.categoria_id; })[0] || {}).nombre || '') + ' ' + p.nombre);
    var k = /bebida|jugo|cola|gaseosa|cafe|batido|limonada|agua/.test(t) ? 'bebida' : /pollo|alita|broaster/.test(t) ? 'pollo' : /postre|dulce|torta|helado|pastel/.test(t) ? 'postre' :
      /desayuno|huevo|tostada/.test(t) ? 'desayuno' : /hamburg|burger|sanduche|sandwich/.test(t) ? 'hamburguesa' : /pizza/.test(t) ? 'pizza' : /almuerzo|seco|arroz|menestra|sopa|caldo|plato|fuerte|churrasco|encebollado/.test(t) ? 'almuerzo' : 'general';
    return 'img/platos/' + k + '.svg';
  }
  function fotoHtml(p, grande) {
    var il = ilustracion(p);
    return p.foto_url ? '<img src="' + UI.esc(p.foto_url) + '" alt="" loading="' + (grande ? 'eager' : 'lazy') + '" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'' + il + '\';this.classList.add(\'ilustracion\')">'
      : '<img class="ilustracion" src="' + il + '" alt="" loading="' + (grande ? 'eager' : 'lazy') + '">';
  }
  function iconoCategoria(p) {
    var c = (M.categorias.filter(function (x) { return x.id === p.categoria_id; })[0] || {}).nombre || '';
    return /bebida|jugo|cola/i.test(c) ? '🥤' : /pollo/i.test(c) ? '🍗' : /postre|dulce/i.test(c) ? '🍰' : /desayuno/i.test(c) ? '🍳' : /hamburg|burger/i.test(c) ? '🍔' : /pizza/i.test(c) ? '🍕' : '🍽️';
  }
  function sinTildes(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function pintarPlatos() {
    var todos = platosDe(localId);
    var q = sinTildes(busqueda.trim());
    var lista = q ? todos.filter(function (p) { return sinTildes(p.nombre + ' ' + p.descripcion).indexOf(q) >= 0; })
      : categoria === '_top' ? todos.filter(function (p) { return /mas_vendido/.test(p.etiquetas); })
      : todos.filter(function (p) { return p.categoria_id === categoria; });
    var cont = $('#lista-platos');
    cont.innerHTML = lista.length ? lista.map(function (p) {
      var cant = cantidadPlato(p.id);
      return '<article class="plato' + (p.agotado ? ' agotado' : '') + (cant ? ' en-carrito' : '') + '">' +
        '<button class="plato-foto" type="button" data-ver="' + UI.esc(p.id) + '" aria-label="Ver ' + UI.esc(p.nombre) + '" data-ico="' + iconoCategoria(p) + '">' + fotoHtml(p) +
        (cant ? '<span class="plato-cant">' + cant + '</span>' : '') + '</button>' +
        '<div class="plato-info">' + (p.etiquetas ? '<div class="chips">' + UI.chipsEtiquetas(p.etiquetas) + '</div>' : '') +
        '<h3>' + UI.esc(p.nombre) + '</h3>' + (p.descripcion ? '<p>' + UI.esc(p.descripcion) + '</p>' : '') +
        (p.extras.length ? '<p class="plato-extras">＋ Puedes personalizarlo</p>' : '') +
        '<div class="plato-pie"><span class="precio">' + UI.dinero(p.precio) + '</span><span style="flex:1"></span>' +
        (p.agotado ? '<span class="etiqueta">Agotado</span>' :
          (cant && !p.extras.length ? '<div class="contador"><button type="button" data-menos="' + UI.esc(p.id) + '" aria-label="Quitar uno">−</button><span>' + cant + '</span><button type="button" data-mas="' + UI.esc(p.id) + '" aria-label="Agregar uno">＋</button></div>'
            : '<button class="btn chico btn-agregar" type="button" data-agregar="' + UI.esc(p.id) + '">' + (cant ? '＋ Otro' : '＋ Agregar') + '</button>')) +
        '</div></div></article>';
    }).join('') : UI.vacio('🔎', q ? 'No encontramos «' + busqueda + '». Prueba con otra palabra.' : 'No hay platos en esta categoría.');
    UI.$$('[data-agregar]', cont).forEach(function (b) { b.addEventListener('click', function () { agregar(b.getAttribute('data-agregar'), b); }); });
    UI.$$('[data-mas]', cont).forEach(function (b) { b.addEventListener('click', function () { sumar(b.getAttribute('data-mas'), 1); }); });
    UI.$$('[data-menos]', cont).forEach(function (b) { b.addEventListener('click', function () { sumar(b.getAttribute('data-menos'), -1); }); });
    UI.$$('[data-ver]', cont).forEach(function (b) { b.addEventListener('click', function () { verPlato(b.getAttribute('data-ver')); }); });
  }

  /* Foto grande + descripción + agregar. */
  async function verPlato(pid) {
    var p = plato(pid);
    var v = await UI.ventana({
      titulo: p.nombre,
      html: '<div class="plato-grande" data-ico="' + iconoCategoria(p) + '">' + fotoHtml(p, true) + '</div>' +
        (p.etiquetas ? '<div class="chips" style="justify-content:center">' + UI.chipsEtiquetas(p.etiquetas) + '</div>' : '') +
        (p.descripcion ? '<p>' + UI.esc(p.descripcion) + '</p>' : '') + '<p class="precio" style="font-size:22px;margin:6px 0 0">' + UI.dinero(p.precio) + '</p>',
      botones: p.agotado ? [{ texto: 'Cerrar', valor: null, clase: 'secundario' }] : [{ texto: 'Cerrar', valor: null, clase: 'secundario' }, { texto: '＋ Agregar', valor: 'agregar' }]
    });
    if (v === 'agregar') agregar(pid);
  }

  function sumar(pid, n) {
    var p = plato(pid);
    var k = claveItem(p, []);
    carrito[k] = carrito[k] || { plato: p, extras: [], cantidad: 0 };
    carrito[k].cantidad = Math.max(0, Math.min(50, carrito[k].cantidad + n));
    cambio(); UI.vibrar(12);
    pintarPlatos(); pintarBarra(true);
  }

  async function agregar(pid, boton) {
    var p = plato(pid);
    if (!p.extras.length) { if (boton) volarAlCarrito(boton); return sumar(pid, 1); }
    var elegidos = [], cantidad = 1;
    var ok = await UI.ventana({
      icono: '🍽️', titulo: p.nombre, texto: 'Personaliza tu plato (opcional).',
      html: '<div class="opciones">' + p.extras.map(function (x, i) {
        return '<label class="opcion"><input type="checkbox" value="' + i + '"><span>' + UI.esc(x.nombre) + '</span><span class="derecha">' + (x.precio ? '+ ' + UI.dinero(x.precio) : '') + '</span></label>';
      }).join('') + '</div>' +
        '<div class="cantidad-fila"><span>Cantidad</span><div class="contador"><button type="button" data-q="-1" aria-label="Menos">−</button><span id="q-num">1</span><button type="button" data-q="1" aria-label="Más">＋</button></div></div>',
      alAbrir: function (v) {
        v.addEventListener('click', function (e) {
          var b = e.target.closest('[data-q]'); if (!b) return;
          cantidad = Math.max(1, Math.min(20, cantidad + Number(b.getAttribute('data-q'))));
          UI.$('#q-num', v).textContent = cantidad;
        });
      },
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Agregar al pedido', valor: true, antes: function (v) {
        elegidos = UI.$$('input:checked', v).map(function (c) { return p.extras[Number(c.value)].nombre; });
        return true;
      } }]
    });
    if (!ok) return;
    var k = claveItem(p, elegidos);
    carrito[k] = carrito[k] || { plato: p, extras: elegidos, cantidad: 0 };
    carrito[k].cantidad = Math.min(50, carrito[k].cantidad + cantidad);
    cambio(); UI.vibrar();
    UI.aviso('Agregado: ' + cantidad + ' × ' + p.nombre, 'ok');
    pintarPlatos(); pintarBarra(true);
  }

  /* Pequeña animación: un punto vuela del botón al carrito. */
  function volarAlCarrito(boton) {
    try {
      var a = boton.getBoundingClientRect(), b = $('#btn-ver-pedido').getBoundingClientRect();
      if (!b.width) return;
      var d = document.createElement('span');
      d.className = 'vuela'; d.style.left = (a.left + a.width / 2) + 'px'; d.style.top = (a.top + a.height / 2) + 'px';
      document.body.appendChild(d);
      requestAnimationFrame(function () { d.style.transform = 'translate(' + (b.left + 30 - a.left - a.width / 2) + 'px,' + (b.top + b.height / 2 - a.top - a.height / 2) + 'px) scale(.4)'; d.style.opacity = '.2'; });
      setTimeout(function () { d.remove(); }, 650);
    } catch (e) {}
  }

  function pintarBarra(saltar) {
    var n = cantidadTotal();
    var barra = $('#barra-pedido');
    barra.hidden = !n || paso !== 1;
    var b = $('#btn-ver-pedido');
    b.innerHTML = '<span class="cant">' + n + '</span> Continuar <span class="barra-total">' + UI.esc(UI.dinero(subtotal())) + ' →</span>';
    if (saltar) { b.classList.remove('saltito'); void b.offsetWidth; b.classList.add('saltito'); }
  }

  /* Antes del paso 2: ¿una bebida? (solo si hay sugeridos y no lleva ninguno). */
  async function sugerir() {
    var sug = platosDe(localId).filter(function (p) { return p.sugerido && !p.agotado && !p.extras.length; });
    if (!sug.length || items().some(function (i) { return i.plato.sugerido; }) || MEM.leer('sugerido_visto') === codigoSesion()) return;
    MEM.guardar('sugerido_visto', codigoSesion());
    var elegido = await UI.ventana({
      icono: '🥤', titulo: '¿Le agregas algo?', texto: 'Lo que más piden para acompañar:',
      html: '<div class="sugeridos">' + sug.slice(0, 4).map(function (p) {
        return '<button class="sugerido" type="button" data-s="' + UI.esc(p.id) + '"><span class="sug-foto" data-ico="' + iconoCategoria(p) + '">' + fotoHtml(p) + '</span><b>' + UI.esc(p.nombre) + '</b><span>' + UI.dinero(p.precio) + '</span></button>';
      }).join('') + '</div>',
      alAbrir: function (v) {
        v.addEventListener('click', function (e) {
          var b = e.target.closest('[data-s]'); if (!b) return;
          sumar(b.getAttribute('data-s'), 1); b.classList.add('elegido'); b.querySelector('span:last-child').textContent = '✓ Agregado';
        });
      },
      botones: [{ texto: 'Continuar', valor: true }]
    });
    return elegido;
  }
  function codigoSesion() { return String(Math.floor(Date.now() / 3600000)); } // una vez por hora

  /* ---------------- Paso 2: entrega y datos ---------------- */
  function pintarEntrega() {
    $('#barra-pedido').hidden = true;
    var cli = MEM.leer('cliente') || {};
    var zonas = zonasDe(localId);
    if (!entrega.tipo) entrega.tipo = zonas.length ? 'domicilio' : 'retiro';
    if (entrega.tipo === 'domicilio' && !zonas.length) entrega.tipo = 'retiro';
    if (entrega.tipo === 'domicilio' && !entrega.zona && zonas.length === 1) entrega.zona = zonas[0].id;
    if (!abierto()) entrega.cuando = 'programar';
    var horas = horasProgramables();
    var tipos = [];
    if (zonas.length) tipos.push(['domicilio', '🛵', 'A domicilio', 'Te lo llevamos']);
    tipos.push(['retiro', '🏪', 'Retiro', 'Pasas a recoger']);
    if (mesasOn()) tipos.push(['mesa', '🍽️', 'Comer aquí', 'En el local']);
    cuerpo().innerHTML = pasos() +
      '<h2 class="paso-titulo">¿Cómo lo recibes?</h2>' +
      '<div class="tipos-entrega">' + tipos.map(function (t) {
        return '<button type="button" class="tipo-op' + (entrega.tipo === t[0] ? ' activo' : '') + '" data-tipo="' + t[0] + '" aria-pressed="' + (entrega.tipo === t[0]) + '"><span class="tipo-ico">' + t[1] + '</span><b>' + t[2] + '</b><small>' + t[3] + '</small></button>';
      }).join('') + '</div>' +
      '<form id="form-entrega" class="rejilla" style="margin-top:14px" autocomplete="on" novalidate>' +
      (entrega.tipo === 'domicilio' ? bloqueDomicilio(zonas, cli) : '') +
      (entrega.tipo === 'mesa' ? '<div class="tarjeta"><div class="campo" style="margin:0"><label for="pe-mesa">Número de mesa</label><select class="entrada" id="pe-mesa">' +
        '<option value="">Elegir…</option>' + Array.apply(null, { length: Number(cfg().mesas) }).map(function (_, i) { var n = String(i + 1); return '<option' + (entrega.mesa === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') +
        '</select><span class="ayuda">Está en el letrero de tu mesa.</span></div></div>' : '') +
      (entrega.tipo === 'retiro' && local().direccion ? '<div class="tarjeta retiro-info">🏪 <span><b>' + UI.esc(local().nombre) + '</b><br>' + UI.esc(local().direccion) + '</span><a class="btn secundario chico" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(local().direccion + ' ' + (cfg().ciudad || '')) + '">Cómo llegar</a></div>' : '') +
      '<div class="tarjeta"><h3 style="margin-top:0">¿Cuándo?</h3><div class="segmento">' +
      (abierto() ? '<button type="button" data-cuando="ya" class="' + (entrega.cuando === 'ya' ? 'activo' : '') + '">⚡ Lo antes posible</button>' : '') +
      '<button type="button" data-cuando="programar" class="' + (entrega.cuando === 'programar' ? 'activo' : '') + '">⏰ ' + (entrega.tipo === 'domicilio' ? 'Programar hora' : 'Llego a las…') + '</button></div>' +
      (entrega.cuando === 'programar' ? (horas.length ? '<div class="campo" style="margin:12px 0 0"><label for="pe-hora">Hora</label><select class="entrada" id="pe-hora">' + horas.map(function (h) { return '<option' + (entrega.hora === h ? ' selected' : '') + '>' + h + '</option>'; }).join('') + '</select><span class="ayuda">' + (entrega.tipo === 'domicilio' ? 'Te lo llevamos a esa hora.' : 'Lo tendremos listo cuando llegues.') + '</span></div>' : '<p class="ayuda">Hoy ya no quedan horas disponibles. Escríbenos por WhatsApp.</p>') : '<p class="ayuda" style="margin:10px 0 0">Tiempo estimado: ~' + (Number(cfg().minutos_preparacion) + ((zonaElegida() || {}).minutos || 0)) + ' min.</p>') +
      '</div>' +
      '<div class="tarjeta"><h3 style="margin-top:0">Tus datos</h3>' +
      '<div class="campo"><label for="pe-nombre">Nombre</label><input class="entrada" id="pe-nombre" name="nombre" autocomplete="name" maxlength="80" value="' + UI.esc(cli.nombre || '') + '"></div>' +
      '<div class="campo" style="margin-bottom:0"><label for="pe-tel">Celular (WhatsApp)</label><input class="entrada" id="pe-tel" name="telefono" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="0991234567" value="' + UI.esc(cli.telefono || '') + '"><span class="ayuda">Para avisarte cuando tu pedido esté en camino.</span></div></div>' +
      '<div class="acciones-paso"><button class="btn secundario" type="button" id="btn-atras">← Platos</button><button class="btn" type="submit">Continuar →</button></div>' +
      '</form>';

    UI.$$('[data-tipo]').forEach(function (b) { b.addEventListener('click', function () { guardarCampos(); entrega.tipo = b.getAttribute('data-tipo'); cambio(); pintarEntrega(); }); });
    UI.$$('[data-cuando]').forEach(function (b) { b.addEventListener('click', function () { guardarCampos(); entrega.cuando = b.getAttribute('data-cuando'); pintarEntrega(); }); });
    UI.$$('[data-zona]').forEach(function (b) { b.addEventListener('change', function () { entrega.zona = b.value; cambio(); }); });
    $('#btn-atras').addEventListener('click', function () { guardarCampos(); irA(1); });
    var h = $('#pe-hora'); if (h) h.addEventListener('change', function () { entrega.hora = h.value; });
    var me = $('#pe-mesa'); if (me) me.addEventListener('change', function () { entrega.mesa = me.value; });
    if (entrega.tipo === 'domicilio') conectarUbicacion();
    $('#form-entrega').addEventListener('submit', function (e) {
      e.preventDefault();
      guardarCampos();
      var c = MEM.leer('cliente') || {};
      var malo = !c.nombre ? ['pe-nombre', 'Escribe tu nombre.'] :
        UI.digitos(c.telefono).length < 7 ? ['pe-tel', 'Escribe tu número de celular.'] :
        (entrega.tipo === 'domicilio' && !entrega.zona) ? ['op-zonas', 'Elige tu zona de envío.'] :
        (entrega.tipo === 'domicilio' && !c.direccion && !ubic) ? ['pe-dir', 'Escribe tu dirección o marca tu ubicación.'] :
        (entrega.tipo === 'mesa' && !entrega.mesa) ? ['pe-mesa', 'Elige tu número de mesa.'] :
        (entrega.cuando === 'programar' && !entrega.hora) ? ['pe-hora', 'Elige la hora.'] : null;
      UI.$$('[aria-invalid]').forEach(function (x) { x.removeAttribute('aria-invalid'); });
      if (malo) { var el = $('#' + malo[0]); if (el) { el.setAttribute('aria-invalid', 'true'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (el.focus) el.focus(); } return UI.aviso(malo[1], 'error'); }
      irA(3);
    });
  }

  function guardarCampos() {
    var c = MEM.leer('cliente') || {};
    ['nombre', 'telefono', 'direccion', 'referencia'].forEach(function (k) { var el = UI.$('[name=' + k + ']'); if (el) c[k] = el.value.trim(); });
    MEM.guardar('cliente', c);
    var h = $('#pe-hora'); if (h) entrega.hora = h.value;
    var z = UI.$('input[name=zona]:checked'); if (z) entrega.zona = z.value;
  }

  function bloqueDomicilio(zonas, cli) {
    return '<div class="tarjeta"><h3 style="margin-top:0">Zona de envío</h3><div class="opciones" id="op-zonas">' +
      zonas.map(function (z) {
        return '<label class="opcion"><input type="radio" name="zona" data-zona value="' + UI.esc(z.id) + '"' + (entrega.zona === z.id ? ' checked' : '') + '><span>' + UI.esc(z.nombre) + (z.minutos ? ' <small style="color:var(--texto-2)">~' + z.minutos + ' min</small>' : '') + '</span><span class="derecha">' + UI.dinero(z.costo) + '</span></label>';
      }).join('') + '</div></div>' +
      '<div class="tarjeta"><h3 style="margin-top:0">¿Dónde te lo llevamos?</h3>' +
      '<div class="ubic-opciones">' +
      '<button class="ubic-op" type="button" id="btn-gps"><span>📍</span><b>Usar mi ubicación</b><small>La más exacta</small></button>' +
      '<button class="ubic-op" type="button" id="btn-pegar"><span>📋</span><b>Pegar ubicación</b><small>De Google Maps o Mapas</small></button>' +
      '</div>' +
      '<div id="ubic-zona"></div>' +
      '<div class="campo" style="margin-top:14px"><label for="pe-dir">Dirección</label><input class="entrada" id="pe-dir" name="direccion" autocomplete="street-address" maxlength="200" placeholder="Calle principal y secundaria" value="' + UI.esc(cli.direccion || '') + '"></div>' +
      '<div class="campo" style="margin-bottom:0"><label for="pe-ref">Referencia</label><input class="entrada" id="pe-ref" name="referencia" maxlength="200" placeholder="Ej. casa azul, junto a la farmacia" value="' + UI.esc(cli.referencia || '') + '">' +
      '<span class="ayuda">¿Prefieres mandarla por WhatsApp? Al final te damos un botón para enviarla al local.</span></div></div>';
  }

  /* ----- Ubicación: GPS con mapa, pegar enlace, quitar ----- */
  function conectarUbicacion() {
    $('#btn-gps').addEventListener('click', function (e) {
      var b = e.currentTarget;
      UI.trabajando(b, async function () {
        var estado = $('#ubic-zona');
        estado.innerHTML = '<p class="ayuda">Buscando tu ubicación… acepta el permiso si te lo pide.</p>';
        var pos = await UI.ubicacion();
        if (!pos) { estado.innerHTML = '<div class="banda error" style="margin:10px 0 0">⚠️ <span>No pudimos tomar tu ubicación. Revisa que el GPS esté encendido y que el navegador tenga permiso, o usa «Pegar ubicación».</span></div>'; return; }
        ubic = { lat: pos.lat, lng: pos.lng, precision: pos.precision, fuente: 'gps' };
        cambio(); mostrarMapa();
      });
    });
    $('#btn-pegar').addEventListener('click', pegarUbicacion);
    if (ubic) mostrarMapa();
  }

  async function pegarUbicacion() {
    var texto = '';
    try { texto = await global.navigator.clipboard.readText(); } catch (e) { /* sin permiso: se pide en la ventana */ }
    var enlace = await UI.pedirDato({
      icono: '📋', titulo: 'Pegar ubicación', etiqueta: 'Enlace del mapa', valor: /^https:\/\//.test(texto) ? texto.trim() : '', ph: 'https://maps.app.goo.gl/…', max: 400,
      texto: 'En Google Maps: toca tu casa → Compartir → Copiar. En iPhone (Mapas): mantén el dedo en el lugar → Compartir → Copiar. Luego pégalo aquí.',
      boton: 'Usar esta ubicación',
      validar: function (v) { return !v ? 'Pega el enlace.' : (!/^https:\/\//.test(v) && !/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(v)) ? 'Pega el enlace completo (empieza con https://).' : ''; }
    });
    if (enlace === null) return;
    var estado = $('#ubic-zona');
    estado.innerHTML = '<p class="ayuda">Leyendo la ubicación…</p>';
    try {
      var r = await DATOS.pedir('ubicacionResolver', { enlace: enlace, disp_id: UI.dispId() });
      if (r.punto) { ubic = { lat: r.punto.lat, lng: r.punto.lng, fuente: 'enlace', enlace: enlace }; cambio(); mostrarMapa(); return; }
    } catch (err) { /* se guarda el enlace tal cual */ }
    ubic = { lat: '', lng: '', fuente: 'enlace', enlace: enlace }; cambio();
    estado.innerHTML = '<div class="ubic-lista">✅ <span>Ubicación guardada. El motorizado abrirá tu enlace.</span><button class="btn secundario chico" type="button" id="btn-quitar">✕ Quitar</button></div>';
    $('#btn-quitar').addEventListener('click', quitarUbicacion);
  }

  function mostrarMapa() {
    var estado = $('#ubic-zona');
    estado.innerHTML = '<div class="mapa-caja" id="mapa"></div>' +
      '<div class="ubic-lista">✅ <span>' + (ubic.fuente === 'gps' && ubic.precision ? 'Ubicación lista (±' + ubic.precision + ' m). ' : 'Ubicación lista. ') + '¿No es tu puerta? Mueve el mapa.</span>' +
      '<button class="btn secundario chico" type="button" id="btn-quitar">✕ Quitar</button></div>';
    if (mapa) mapa.destruir();
    mapa = UI.mapa($('#mapa'), { lat: ubic.lat, lng: ubic.lng, zoom: 17, alMover: function (pt) { ubic.lat = pt.lat; ubic.lng = pt.lng; cambio(); } });
    $('#btn-quitar').addEventListener('click', quitarUbicacion);
  }
  function quitarUbicacion() { ubic = null; cambio(); if (mapa) { mapa.destruir(); mapa = null; } $('#ubic-zona').innerHTML = ''; }

  /* ---------------- Paso 3: confirmar y pagar ---------------- */
  function pintarConfirmar() {
    $('#barra-pedido').hidden = true;
    if (!items().length) return irA(1);
    var c = cfg(), cli = MEM.leer('cliente') || {};
    var z = zonaElegida();
    var formas = [['efectivo', '💵', 'Efectivo', entrega.tipo === 'domicilio' ? 'Pagas al recibir' : 'Pagas en el local']];
    formas.push(['transferencia', '🏦', 'Transferencia', 'A la cuenta del local']);
    if (c.deuna_qr_url) formas.push(['deuna', '📲', 'Deuna', 'Escaneas el QR']);
    if (!formas.some(function (f) { return f[0] === pago.forma; })) pago.forma = 'efectivo';
    var conPropina = entrega.tipo === 'domicilio' && c.propinas !== 'NO';
    var resumenEntrega = entrega.tipo === 'domicilio' ? '🛵 A domicilio · ' + UI.esc(z ? z.nombre : '') + '<br><small>' + UI.esc(cli.direccion || (ubic ? 'Ubicación marcada en el mapa' : '')) + '</small>'
      : entrega.tipo === 'mesa' ? '🍽️ Mesa ' + UI.esc(entrega.mesa) : '🏪 Retiro en ' + UI.esc(local().nombre);
    cuerpo().innerHTML = pasos() +
      '<h2 class="paso-titulo">Revisa y confirma</h2>' +
      '<div class="tarjeta" id="resumen-items"></div>' +
      '<div class="tarjeta resumen-entrega"><div>' + resumenEntrega + (entrega.cuando === 'programar' && entrega.hora ? '<br><small>⏰ ' + UI.esc(entrega.hora) + '</small>' : '') +
      '<br><small>👤 ' + UI.esc(cli.nombre || '') + ' · ' + UI.esc(cli.telefono || '') + '</small></div><button class="btn secundario chico" type="button" id="btn-editar-entrega">Cambiar</button></div>' +
      '<form id="form-pedido" class="rejilla" autocomplete="off" novalidate>' +
      '<div class="tarjeta"><h3 style="margin-top:0">¿Cómo pagas?</h3><div class="tipos-entrega formas">' + formas.map(function (f) {
        return '<button type="button" class="tipo-op' + (pago.forma === f[0] ? ' activo' : '') + '" data-forma="' + f[0] + '" aria-pressed="' + (pago.forma === f[0]) + '"><span class="tipo-ico">' + f[1] + '</span><b>' + f[2] + '</b><small>' + f[3] + '</small></button>';
      }).join('') + '</div>' +
      (pago.forma === 'transferencia' && c.datos_transferencia ? '<div class="banda" style="margin-top:10px;white-space:pre-line">🏦 <span>' + UI.esc(c.datos_transferencia) + '</span></div>' : '') +
      (pago.forma === 'deuna' ? '<div class="banda" style="margin-top:10px">📲 <span>Al enviar te mostramos el QR de Deuna para pagar.</span></div>' : '') +
      (UI.esDigital(pago.forma) ? '<p class="ayuda">Prepararemos tu pedido apenas confirmemos el pago.</p>' : '') +
      '</div>' +
      (conPropina ? '<div class="tarjeta"><h3 style="margin-top:0">Propina para el motorizado <small style="font-weight:600;color:var(--texto-2)">(opcional)</small></h3><div class="segmento">' +
        [0, 0.5, 1, 2].map(function (v) { return '<button type="button" data-propina="' + v + '" class="' + (pago.propina === v ? 'activo' : '') + '">' + (v ? UI.dinero(v) : 'Sin propina') + '</button>'; }).join('') + '</div><p class="ayuda" style="margin:8px 0 0">Va completa para quien te lleva el pedido. 🙌</p></div>' : '') +
      '<div class="tarjeta"><details' + (MEM.leer('ultimo_cupon') ? ' open' : '') + '><summary>🏷️ ¿Tienes un cupón o una nota para la cocina?</summary>' +
      '<div class="campo" style="margin-top:12px"><label for="pe-cupon">Cupón de descuento</label><input class="entrada" id="pe-cupon" name="cupon" maxlength="30" autocapitalize="characters" spellcheck="false"><span class="ayuda">El descuento se aplica al enviar.</span></div>' +
      '<div class="campo" style="margin-bottom:0"><label for="pe-notas">Nota para la cocina</label><textarea class="entrada" id="pe-notas" name="notas" maxlength="300" placeholder="Ej. sin ají"></textarea></div></details></div>' +
      '<div class="tarjeta"><div id="totales"></div>' +
      '<label class="casilla"><input type="checkbox" name="acepta_privacidad" id="pe-privacidad"' + (MEM.leer('acepta_privacidad') ? ' checked' : '') + '> <span>Acepto que usen mi nombre, celular y dirección solo para este pedido. <a href="privacidad.html" target="_blank" rel="noopener">Aviso de privacidad</a></span></label>' +
      '<label class="casilla"><input type="checkbox" name="acepta_promos"' + (MEM.leer('acepta_promos') ? ' checked' : '') + '> <span>Quiero recibir promociones por WhatsApp (opcional).</span></label>' +
      '<button class="btn bloque btn-enviar" type="submit">Enviar pedido · <span id="total-boton"></span></button>' +
      '<p class="ayuda" style="text-align:center;margin-top:8px">Recibirás tu número de pedido al instante.</p></div>' +
      '<button class="btn secundario" type="button" id="btn-atras">← Volver</button>' +
      '</form>';
    $('#btn-atras').addEventListener('click', function () { irA(2); });
    $('#btn-editar-entrega').addEventListener('click', function () { irA(2); });
    UI.$$('[data-forma]').forEach(function (b) { b.addEventListener('click', function () { pago.forma = b.getAttribute('data-forma'); guardarNotas(); pintarConfirmar(); restaurarNotas(); }); });
    UI.$$('[data-propina]').forEach(function (b) {
      b.addEventListener('click', function () {
        pago.propina = Number(b.getAttribute('data-propina')); cambio();
        UI.$$('[data-propina]').forEach(function (x) { x.classList.toggle('activo', x === b); });
        totales();
      });
    });
    $('#form-pedido').addEventListener('submit', enviar);
    pintarItemsResumen();
    totales();
  }
  var notasTmp = {};
  function guardarNotas() { notasTmp = { cupon: ($('#pe-cupon') || {}).value || '', notas: ($('#pe-notas') || {}).value || '' }; }
  function restaurarNotas() { if ($('#pe-cupon')) $('#pe-cupon').value = notasTmp.cupon || ''; if ($('#pe-notas')) $('#pe-notas').value = notasTmp.notas || ''; }

  function totales() {
    var e = envio(), pr = propina(), t = subtotal() + e + pr;
    $('#totales').innerHTML =
      '<div class="resumen-linea"><span>Subtotal</span><span>' + UI.dinero(subtotal()) + '</span></div>' +
      (entrega.tipo === 'domicilio' ? '<div class="resumen-linea"><span>Envío</span><span>' + UI.dinero(e) + '</span></div>' : '') +
      (pr ? '<div class="resumen-linea"><span>Propina</span><span>' + UI.dinero(pr) + '</span></div>' : '') +
      '<div class="resumen-linea total"><span>Total</span><span>' + UI.dinero(t) + '</span></div>' +
      (cfg().precios_incluyen_iva !== 'NO' ? '<p class="ayuda" style="margin:2px 0 8px">Precios con IVA incluido.</p>' : '');
    $('#total-boton').textContent = UI.dinero(t);
  }

  function pintarItemsResumen() {
    var lista = items();
    if (!lista.length) return irA(1);
    $('#resumen-items').innerHTML = '<div class="resumen-cabeza"><h3 style="margin:0">Tu pedido</h3><button class="btn secundario chico" type="button" id="btn-mas-platos">＋ Agregar más</button></div>' + lista.map(function (it, i) {
      return '<div class="resumen-linea" style="align-items:center"><div style="min-width:0"><b>' + UI.esc(it.plato.nombre) + '</b>' +
        (it.extras.length ? '<div class="item-sub">' + UI.esc(it.extras.join(', ')) + '</div>' : '') + '<div class="item-sub">' + UI.dinero(unitario(it)) + ' c/u</div></div>' +
        '<div class="contador"><button type="button" data-r-menos="' + i + '" aria-label="Quitar uno">' + (it.cantidad === 1 ? '🗑' : '−') + '</button><span>' + it.cantidad + '</span><button type="button" data-r-mas="' + i + '" aria-label="Agregar uno">＋</button></div></div>';
    }).join('');
    $('#btn-mas-platos').addEventListener('click', function () { irA(1); });
    UI.$$('[data-r-mas],[data-r-menos]', $('#resumen-items')).forEach(function (b) {
      b.addEventListener('click', function () {
        var mas = b.hasAttribute('data-r-mas');
        var it = lista[Number(b.getAttribute(mas ? 'data-r-mas' : 'data-r-menos'))];
        it.cantidad = Math.max(0, Math.min(50, it.cantidad + (mas ? 1 : -1)));
        cambio(); UI.vibrar(10);
        pintarItemsResumen(); totales();
      });
    });
  }

  async function enviar(ev) {
    ev.preventDefault();
    var f = ev.target, boton = f.querySelector('button[type=submit]');
    var d = UI.leerFormulario(f);
    var cli = MEM.leer('cliente') || {};
    var priv = $('#pe-privacidad'), promos = f.querySelector('[name=acepta_promos]');
    if (!priv.checked) { UI.aviso('Marca la casilla del aviso de privacidad para enviar.', 'error'); priv.focus(); priv.closest('.casilla').classList.add('falta'); return; }
    MEM.guardar('acepta_privacidad', true); MEM.guardar('acepta_promos', !!(promos && promos.checked));
    if (!codigoEnvio) codigoEnvio = UI.codigoEnvio();
    var dom = entrega.tipo === 'domicilio';
    var datos = {
      op_id: codigoEnvio, local_id: localId, tipo_entrega: entrega.tipo, zona_id: dom ? entrega.zona : '', mesa: entrega.tipo === 'mesa' ? entrega.mesa : '',
      hora_llegada: entrega.cuando === 'programar' ? entrega.hora : '', forma_pago: pago.forma, propina: propina(), cupon: d.cupon, notas: d.notas,
      origen: origen, disp_id: UI.dispId(), acepta_privacidad: true, acepta_promos: !!(promos && promos.checked),
      items: items().map(function (it) { return { plato_id: it.plato.id, cantidad: it.cantidad, extras: it.extras }; }),
      cliente: { nombre: cli.nombre, telefono: cli.telefono, direccion: dom ? cli.direccion : '', referencia: dom ? cli.referencia : '',
        lat: dom && ubic && ubic.lat !== '' ? ubic.lat : '', lng: dom && ubic && ubic.lng !== '' ? ubic.lng : '',
        ubicacion_fuente: dom && ubic ? ubic.fuente : '', ubicacion_enlace: dom && ubic && ubic.enlace ? ubic.enlace : '' }
    };
    await UI.trabajando(boton, async function () {
      try {
        var r = await DATOS.pedir('pedidoCrear', datos, { guardar: true });
        MEM.guardar('ultimo_pedido', { numero: r.pedido.numero, telefono: cli.telefono, local: localId, fecha: Date.now() });
        MEM.guardar('ultimo_carrito', { local: localId, items: datos.items });
        var detalle = items();
        carrito = {}; codigoEnvio = ''; ubic = null; pago.propina = 0;
        UI.vibrar([30, 40, 30]);
        pintarExito(r.pedido, detalle);
      } catch (err) {
        // El código de envío se conserva: si vuelve a intentar, no se duplica.
        UI.ventana({ icono: '⚠️', titulo: 'Tu pedido no se envió', texto: err.message, botones: [{ texto: 'Entendido', valor: true }] });
      }
    });
  }

  function textoWhatsApp(p) {
    var lineas = (p.detalle || []).map(function (x) { return '• ' + x.cantidad + ' × ' + x.nombre + (x.extras ? ' (' + x.extras + ')' : ''); });
    var tipo = UI.tipoEntrega(p);
    return 'Hola, acabo de hacer el pedido *' + p.numero + '* en ' + (local().nombre || '') + '.\n' + lineas.join('\n') +
      '\nTotal: ' + UI.dinero(p.total) + ' · Pago: ' + (UI.NOMBRE_PAGO[p.forma_pago] || p.forma_pago).replace(/^\S+\s/, '') +
      (tipo === 'domicilio' ? '\nDirección: ' + (p.direccion || '—') + (p.referencia ? ' (' + p.referencia + ')' : '') : tipo === 'mesa' ? '\nMesa ' + p.mesa : '\nRetiro en el local') +
      (p.hora_llegada ? '\nHora: ' + UI.hora(p.hora_llegada) : '') +
      (p.lat !== '' && p.lat != null ? '\nUbicación: https://maps.google.com/?q=' + p.lat + ',' + p.lng : (p.ubicacion_enlace ? '\nUbicación: ' + p.ubicacion_enlace : '')) +
      '\nNombre: ' + p.cliente_nombre;
  }

  function pintarExito(p) {
    var wa = local().telefono || cfg().whatsapp;
    var c = cfg();
    global.scrollTo(0, 0);
    $('#barra-pedido').hidden = true;
    paso = 4;
    var qrPedido = UI.qrUrl(UI.enlaceApp() + '#pedidos?ver=' + encodeURIComponent(p.numero), 360);
    cuerpo().innerHTML = '<div class="tarjeta exito-grande" style="margin-top:6px"><div class="ico confeti">🎉</div>' +
      '<h2 style="margin:4px 0">¡Pedido recibido!</h2><p class="subtitulo" style="margin-bottom:6px">Tu número es</p>' +
      '<div class="numero-pedido">' + UI.esc(p.numero) + '</div>' +
      '<p style="margin:8px 0 0">Total: <b>' + UI.dinero(p.total) + '</b>' + (p.descuento ? ' · Descuento ' + UI.dinero(p.descuento) : '') + (p.premio ? ' · 🎁 Premio ' + UI.dinero(p.premio) : '') + '</p>' +
      (p.hora_estimada ? '<p class="subtitulo" style="margin:4px 0 0">' + (UI.tipoEntrega(p) === 'domicilio' ? 'Llega aprox. a las ' : 'Listo aprox. a las ') + UI.esc(UI.hora(p.hora_estimada)) + '</p>' : '') +
      (p.forma_pago === 'deuna' && c.deuna_qr_url ? '<div class="pago-qr"><b>Paga con Deuna</b><img src="' + UI.esc(c.deuna_qr_url) + '" alt="QR de Deuna del local" referrerpolicy="no-referrer"><small>Monto: ' + UI.dinero(p.total) + ' · Referencia: ' + UI.esc(p.numero) + '</small>' +
        '<button class="btn borde chico" type="button" id="btn-guardar-qr">💾 Guardar QR</button><small>¿Pagas desde este mismo teléfono? Guarda el QR y en Deuna elige «Escanear» → «Galería».</small></div>' : '') +
      (p.forma_pago === 'transferencia' && c.datos_transferencia ? '<div class="banda" style="margin-top:12px;text-align:left;white-space:pre-line">🏦 <span>' + UI.esc(c.datos_transferencia) + '\nReferencia: ' + UI.esc(p.numero) + '</span></div>' : '') +
      (UI.esDigital(p.forma_pago) ? '<p class="ayuda">Envía el comprobante por WhatsApp para que lo preparemos enseguida.</p>' : '') +
      '<div class="acciones" style="margin-top:16px">' +
      (UI.digitos(wa) ? '<button class="btn" type="button" id="btn-wa">💬 ' + (UI.esDigital(p.forma_pago) ? 'Enviar comprobante' : 'Avisar por WhatsApp') + '</button>' : '') +
      '<button class="btn borde" type="button" id="btn-seguir">🔎 Ver cómo va</button></div>' +
      (UI.tipoEntrega(p) !== 'domicilio' ? '<div class="qr-pedido"><img src="' + UI.esc(qrPedido) + '" alt="" width="150" height="150"><small>Muestra este código al llegar y te lo entregamos más rápido.</small></div>' : '') +
      '<button class="btn secundario bloque" type="button" id="btn-nuevo" style="margin-top:12px">Hacer otro pedido</button></div>';
    var b = $('#btn-wa'); if (b) b.addEventListener('click', function () { UI.abrirWhatsApp(wa, textoWhatsApp(p)); });
    var gq = $('#btn-guardar-qr'); if (gq) gq.addEventListener('click', function () { UI.trabajando(gq, function () { return guardarQR(c.deuna_qr_url, p.numero); }); });
    $('#btn-nuevo').addEventListener('click', function () { irA(1); });
    $('#btn-seguir').addEventListener('click', function () { pintarSeguimiento(true); });
    pintarSeguimiento();
  }

  /* 3.1: guarda el QR de Deuna en el teléfono (para pagar desde el mismo teléfono). */
  async function guardarQR(url, numero) {
    try {
      var r = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!r.ok) throw new Error('http');
      var blob = await r.blob();
      var archivo = new File([blob], 'QR-Deuna-' + numero + '.png', { type: blob.type || 'image/png' });
      if (global.navigator.canShare && global.navigator.canShare({ files: [archivo] })) { await global.navigator.share({ files: [archivo], title: 'QR de Deuna' }); return; }
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = archivo.name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      UI.aviso('QR guardado en Descargas.', 'ok');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      UI.ventana({ icono: '💾', titulo: 'Guardar el QR', html: '<img src="' + UI.esc(url) + '" alt="QR de Deuna" referrerpolicy="no-referrer" style="width:220px;max-width:100%;display:block;margin:0 auto 10px">' +
        '<p><b>Mantén presionado el QR</b> y elige «Guardar imagen» (o «Agregar a Fotos»). Luego en Deuna: Escanear → Galería.</p>', botones: [{ texto: 'Listo', valor: true }] });
    }
  }

  /* ---------------- Barra «Tu pedido» (seguimiento) ---------------- */
  var PASOS_SEG = ['Recibido', 'Preparando', 'En camino', 'Entregado'];
  async function pintarSeguimiento(abrir) {
    var u = MEM.leer('ultimo_pedido');
    var cont = $('#seguimiento');
    if (!cont) return;
    if (!u || !u.numero || Date.now() - (u.fecha || 0) > 24 * 3600 * 1000) { cont.hidden = true; return; }
    cont.hidden = false;
    if (!cont.innerHTML) cont.innerHTML = '<div class="seg-caja"><b>Tu pedido ' + UI.esc(u.numero) + '</b><span class="item-sub">Consultando…</span></div>';
    try {
      var r = await DATOS.pedir('pedidoConsultar', { numero: u.numero, telefono: u.telefono });
      if (r.estado === 'Entregado' && r.calificacion && !abrir) { cont.hidden = true; return; }
      var tipo = r.tipo_entrega;
      var pasos = tipo === 'domicilio' ? PASOS_SEG : ['Recibido', 'Preparando', 'Entregado'];
      var i = r.estado === 'Anulado' ? -1 : pasos.indexOf(r.estado);
      var nombreFin = tipo === 'domicilio' ? 'Entregado' : 'Listo';
      cont.innerHTML = '<div class="seg-caja"><div class="seg-cabeza"><b>Tu pedido ' + UI.esc(r.numero) + '</b>' + (r.estado === 'Anulado' ? UI.chipEstado('Anulado') : UI.chipEstado(r.estado)) +
        '<button class="btn secundario chico" type="button" id="seg-act" aria-label="Actualizar">↻</button></div>' +
        (r.estado === 'Anulado' ? '<p class="item-sub">' + UI.esc(r.motivo_anulacion || 'Fue anulado. Escríbenos por WhatsApp si tienes dudas.') + '</p>' :
          '<div class="seg-linea">' + pasos.map(function (n, k) { return '<span class="' + (k <= i ? 'hecho' : '') + (k === i ? ' actual' : '') + '"><i></i>' + UI.esc(k === pasos.length - 1 ? nombreFin : n) + '</span>'; }).join('') + '</div>' +
          (r.hora_estimada && r.estado !== 'Entregado' ? '<p class="item-sub" style="margin:6px 0 0">Hora estimada: <b>' + UI.esc(UI.hora(r.hora_estimada)) + '</b></p>' : '')) +
        (r.motorizado ? tarjetaMoto(r.motorizado) : '') +
        (r.codigo_entrega ? '<div class="codigo-entrega"><span>🔢 Tu código de entrega</span><b>' + UI.esc(r.codigo_entrega) + '</b><small>Dáselo al motorizado solo cuando tengas tu pedido en la mano.</small></div>' : '') +
        (r.estado === 'Entregado' && !r.calificacion ? '<button class="btn chico bloque" type="button" id="seg-calificar" style="margin-top:10px">⭐ ¿Cómo estuvo? Califícanos</button>' : '') +
        (r.sellos_meta ? '<div class="sellos" title="Tarjeta de sellos">' + sellosHtml(r.sellos, r.sellos_meta) + '</div>' : '') + '</div>';
      $('#seg-act').addEventListener('click', function (e) { UI.trabajando(e.currentTarget, function () { return pintarSeguimiento(true); }); });
      var cal = $('#seg-calificar'); if (cal) cal.addEventListener('click', function () { calificar(u); });
      if (abrir) cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      if (err.codigo === 'NO_EXISTE') { cont.hidden = true; return; }
      cont.innerHTML = '<div class="seg-caja"><b>Tu pedido ' + UI.esc(u.numero) + '</b><span class="item-sub">No se pudo consultar ahora. <button class="enlace" type="button" id="seg-act">Reintentar</button></span></div>';
      $('#seg-act').addEventListener('click', function () { pintarSeguimiento(true); });
    }
  }
  /* 3.1: quién te lleva el pedido (sin cédula ni celular personal). */
  function tarjetaMoto(m) {
    return '<div class="tarjeta-moto"><div class="moto-foto">' + (m.foto_url ? '<img src="' + UI.esc(m.foto_url) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '') + '🛵</div>' +
      '<div style="min-width:0"><small>Te lo lleva</small><b>' + UI.esc(m.nombre) + '</b>' +
      '<div class="moto-datos">' + (m.placa ? '<span class="placa">' + UI.esc(m.placa) + '</span>' : '') + (m.moto ? '<span>' + UI.esc(m.moto) + '</span>' : '') + '</div>' +
      (m.salio ? '<small>Salió a las ' + UI.esc(UI.hora(m.salio)) + '</small>' : '') + '</div></div>';
  }
  function sellosHtml(n, meta) {
    var s = '';
    for (var i = 0; i < meta; i++) s += '<span class="sello' + (i < n ? ' lleno' : '') + '">' + (i < n ? '★' : '') + '</span>';
    return s + '<small>' + (n >= meta ? '🎁 ¡Tu próximo pedido tiene premio!' : 'Te faltan ' + (meta - n) + ' para tu premio') + '</small>';
  }

  async function calificar(u) {
    var estrellas = 0, comentario = '';
    var ok = await UI.ventana({
      icono: '⭐', titulo: '¿Cómo estuvo tu pedido?',
      html: '<div class="estrellas" role="radiogroup" aria-label="Calificación">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" role="radio" aria-checked="false" data-e="' + n + '" aria-label="' + n + ' estrellas">★</button>'; }).join('') + '</div>' +
        '<div class="campo"><label for="cal-com">Comentario (opcional)</label><textarea class="entrada" id="cal-com" maxlength="300" placeholder="¿Qué te gustó? ¿Qué mejoramos?"></textarea></div>',
      alAbrir: function (v) {
        v.addEventListener('click', function (e) {
          var b = e.target.closest('[data-e]'); if (!b) return;
          estrellas = Number(b.getAttribute('data-e')); UI.vibrar(10);
          UI.$$('[data-e]', v).forEach(function (x) { var on = Number(x.getAttribute('data-e')) <= estrellas; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(Number(x.getAttribute('data-e')) === estrellas)); });
        });
      },
      botones: [{ texto: 'Ahora no', valor: false, clase: 'secundario' }, { texto: 'Enviar', valor: true, antes: function (v) {
        if (!estrellas) { UI.aviso('Toca las estrellas para calificar.', 'error'); return false; }
        comentario = UI.$('#cal-com', v).value.trim(); return true;
      } }]
    });
    if (!ok) return;
    try {
      await DATOS.pedir('pedidoCalificar', { numero: u.numero, telefono: u.telefono, estrellas: estrellas, comentario: comentario }, { guardar: true });
      UI.aviso('¡Gracias por calificarnos!', 'ok');
      pintarSeguimiento();
    } catch (err) { UI.error('No se envió', err.message); }
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
    $('#btn-ver-pedido').addEventListener('click', async function () {
      if (!cantidadTotal()) return;
      await sugerir();
      irA(2);
    });
    iniciar();
  });
})(window);
