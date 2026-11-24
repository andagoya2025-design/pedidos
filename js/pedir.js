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
  var envioPendiente = null;    // carga original inmutable para reintentos tras una respuesta incierta
  var recuperacionEnCurso = false; // impedir consultas y reintentos simultáneos
  // Solo esta pestaña: recuperar un envío incierto al recargar, con caducidad de 24 h.
  try {
    var recuperado = JSON.parse(global.sessionStorage.getItem('mipedido_envio_pendiente') || 'null');
    if (recuperado && recuperado.fecha && Date.now() - recuperado.fecha < 86400000 && recuperado.datos && recuperado.datos.op_id) {
      envioPendiente = recuperado.datos;
      codigoEnvio = envioPendiente.op_id;
    } else global.sessionStorage.removeItem('mipedido_envio_pendiente');
  } catch (e) { /* almacenamiento bloqueado: continuar sin persistencia */ }
  var ubic = null;              // { lat, lng, precision, fuente:'gps'|'enlace', enlace }
  var mapa = null;
  var paso = 1;
  var params = new URLSearchParams(global.location.search);
  var entrega = { tipo: '', zona: '', mesa: params.get('mesa') || '', cuando: 'ya', hora: '' };
  var cuponAplicado = null; // nunca afirmar descuento hasta respuesta real del servidor
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
  /* 3.1.3: agotado a mano o porque no quedan insumos en este local */
  function marcarAgotados() {
    M.platos.forEach(function (p) {
      if (p.agotado_manual === undefined) p.agotado_manual = p.agotado === true;
      p.agotado = p.agotado_manual || (p.agotado_locales || []).indexOf(localId) >= 0;
    });
  }
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
  function cambio() { if (!envioPendiente) codigoEnvio = ''; cuponAplicado = null; }
  function puntoValido(x) { return x && x.lat !== '' && x.lng !== '' && x.lat != null && x.lng != null && isFinite(Number(x.lat)) && isFinite(Number(x.lng)); }
  function distanciaLocal() { return puntoValido(local()) && puntoValido(ubic) ? UI.haversineKm(local(), ubic) : null; }
  function minimoZona() { var z = zonaElegida(), l = local(); return z && z.minimo_domicilio !== '' && z.minimo_domicilio != null ? Number(z.minimo_domicilio) || 0 : Number(l.minimo_domicilio) || 0; }
  function mensajeMinimo() { var falta = minimoZona() - subtotal(); return entrega.tipo === 'domicilio' && falta > 0 ? 'Te faltan ' + UI.dinero(falta) + ' para el envío a domicilio. Puedes agregar platos o continuar; el local te confirmará.' : ''; }
  function mensajeCobertura() {
    var d = distanciaLocal(), limite = Number(cfg().cobertura_km) || 0;
    return d !== null && limite > 0 && d > limite ? '📍 Estás a ' + d + ' km del local. ¿Es para otra dirección? Escríbela o marca el punto donde lo recibes. También puedes elegir Retiro.' : '';
  }
  function zonaPorPunto() {
    if (!puntoValido(ubic)) return;
    var candidatas = zonasDe(localId).filter(function (z) { return puntoValido(z) && Number(z.radio_km) > 0; }).map(function (z) { return { zona: z, km: UI.haversineKm(ubic, z) }; })
      .filter(function (x) { return x.km <= Number(x.zona.radio_km); }).sort(function (a, b) { return a.km - b.km; });
    entrega.zona = candidatas.length ? candidatas[0].zona.id : ''; // sin coincidencia: no se elige a ciegas
    UI.$$('input[name=zona]').forEach(function (r) { r.checked = r.value === entrega.zona; });
    var aviso = $('#ubic-cobertura');
    if (aviso) aviso.textContent = mensajeCobertura() || (candidatas.length ? '✅ Zona detectada: ' + candidatas[0].zona.nombre + ' · ' + UI.dinero(candidatas[0].zona.costo) : 'No identificamos una zona automáticamente. Elige tu zona de envío manualmente.');
  }
  function ventanaTexto(hora) {
    if (!hora) return '';
    var n = Number(cfg().ventana_minutos) || 30, a = hora.split(':');
    var fin = (Number(a[0]) * 60 + Number(a[1]) + n) % 1440;
    return 'Entre ' + hora + ' y ' + ('0' + Math.floor(fin / 60)).slice(-2) + ':' + ('0' + (fin % 60)).slice(-2);
  }
  function rangoPreparacion() { var n = (Number(cfg().minutos_preparacion) || 20) + Number((zonaElegida() || {}).minutos || 0); return n + ' a ' + (n + Math.max(10, Math.ceil((Number(cfg().ventana_minutos) || 30) / 3))) + ' min aprox.'; }


  /* 3.1.7: cada cliente elige SU prefijo; no se cambia el país del negocio. */
  var PAISES_TEL = [
    { codigo: '593', nombre: '🇪🇨 Ecuador (+593)' },
    { codigo: '1', nombre: '🇺🇸 EE. UU. / Canadá (+1)' },
    { codigo: '57', nombre: '🇨🇴 Colombia (+57)' },
    { codigo: '51', nombre: '🇵🇪 Perú (+51)' },
    { codigo: '52', nombre: '🇲🇽 México (+52)' },
    { codigo: '34', nombre: '🇪🇸 España (+34)' },
    { codigo: '54', nombre: '🇦🇷 Argentina (+54)' },
    { codigo: '55', nombre: '🇧🇷 Brasil (+55)' },
    { codigo: '44', nombre: '🇬🇧 Reino Unido (+44)' },
    { codigo: '33', nombre: '🇫🇷 Francia (+33)' },
    { codigo: '49', nombre: '🇩🇪 Alemania (+49)' },
    { codigo: '39', nombre: '🇮🇹 Italia (+39)' }
  ];
  function telefonoDeCliente(c) {
    var valor = String(c.telefono || '').trim();
    var codigo = String(c.pais_telefono || cfg().pais_codigo || '593').replace(/\D/g, '');
    if (!/^[1-9]\d{0,2}$/.test(codigo)) codigo = '593';
    var pref = '';
    if (valor.charAt(0) === '+') {
      var opciones = PAISES_TEL.map(function (p) { return p.codigo; });
      if (opciones.indexOf(codigo) < 0) opciones.push(codigo);
      opciones.sort(function (a, b) { return b.length - a.length; });
      for (var i = 0; i < opciones.length; i++) {
        if (valor.indexOf('+' + opciones[i]) === 0 && valor.replace(/\D/g, '').length - opciones[i].length >= 7) { pref = opciones[i]; break; }
      }
      if (pref) { codigo = pref; valor = valor.slice(pref.length + 1); }
      // Si no identificamos el prefijo, mostramos el + completo para NO alterarlo.
      else codigo = '';
    }
    return { codigo: codigo, seleccion: PAISES_TEL.some(function (p) { return p.codigo === codigo; }) ? codigo : 'otro', numero: valor };
  }
  function selectorTelefono(c) {
    var t = telefonoDeCliente(c);
    return '<div class="telefono-internacional">' +
      '<div class="campo"><label for="pe-pais">País del celular</label><select class="entrada" id="pe-pais" autocomplete="off">' +
      PAISES_TEL.map(function (p) { return '<option value="' + p.codigo + '"' + (t.seleccion === p.codigo ? ' selected' : '') + '>' + UI.esc(p.nombre) + '</option>'; }).join('') +
      '<option value="otro"' + (t.seleccion === 'otro' ? ' selected' : '') + '>🌎 Otro país</option></select></div>' +
      '<div class="campo" id="pe-otro-campo"' + (t.seleccion === 'otro' ? '' : ' hidden') + '><label for="pe-otro-codigo">Código de país</label><input class="entrada" id="pe-otro-codigo" inputmode="numeric" maxlength="3" placeholder="Ej. 972" value="' + UI.esc(t.seleccion === 'otro' ? t.codigo : '') + '"></div>' +
      '<div class="campo"><label for="pe-tel">Celular (WhatsApp)</label><input class="entrada" id="pe-tel" name="telefono" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="24" placeholder="' + (t.codigo === '1' ? '202 555 0147' : '099 123 4567') + '" value="' + UI.esc(t.numero) + '"><span class="ayuda">Escribe el número local, o el número completo empezando con +.</span></div></div>';
  }
  function codigoTelefonoElegido() {
    var sel = $('#pe-pais');
    return sel && sel.value === 'otro' ? String(($('#pe-otro-codigo') || {}).value || '').trim() : sel ? sel.value : String(cfg().pais_codigo || '593');
  }

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
    // Al recargar, priorizar el restaurante del envío incierto para permitir recuperarlo.
    if (envioPendiente && conMenu.some(function (l) { return l.id === envioPendiente.local_id; })) localId = envioPendiente.local_id;
    if (entrega.mesa && mesasOn()) entrega.tipo = 'mesa';
    marcarAgotados();
    pintarRedes();
    /* 3.1.3: enlace propio del pedido (?s=PED-0006-clave): abre directo su seguimiento */
    var sg = String(params.get('s') || '').trim();
    if (/^PED-\d{4,}-[a-z0-9]{6,12}$/i.test(sg)) {
      var num = sg.replace(/-[a-z0-9]+$/i, '').toUpperCase();
      if (!misPedidos().some(function (x) { return x.n === num; })) guardarMiPedido({ n: num, s: sg, f: Date.now(), t: 0, e: 'Recibido', i: [] });
      try { global.history.replaceState(null, '', global.location.pathname + (params.get('local') ? '?local=' + encodeURIComponent(params.get('local')) : '')); } catch (e) { /* sin historial */ }
      pintarSeguimiento(true);
    } else if (/^[a-z0-9]{12,24}$/i.test(String(params.get('c') || ''))) { // 3.1.5: enlace personal «Mis pedidos»
      var cc = String(params.get('c'));
      try { global.history.replaceState(null, '', global.location.pathname); } catch (e) { /* sin historial */ }
      traerMisPedidos(cc).then(function () { pintarSeguimiento(true); });
    } else pintarSeguimiento();
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
    var nombres = ['Tus platos', 'Tus datos', 'Enviar'];
    var ayuda = ['Elige lo que quieres comer y toca «Agregar».', 'Dinos cómo lo recibes: a domicilio, retiro o mesa.', 'Elige cómo pagas y envía tu pedido.'];
    return '<ol class="pasos" aria-label="Pasos del pedido">' + nombres.map(function (n, i) {
      var k = i + 1;
      return '<li class="' + (k < paso ? 'hecho' : k === paso ? 'actual' : '') + '"' + (k === paso ? ' aria-current="step"' : '') + '><span>' + (k < paso ? '✓' : k) + '</span>' + n + '</li>';
    }).join('') + '</ol>' + (ayuda[paso - 1] ? '<p class="pasos-ayuda"><b>Paso ' + paso + ' de 3:</b> ' + ayuda[paso - 1] + '</p>' : '');
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
    if (id === localId) return irA(1);
    if (!localesConMenu().some(function (l) { return l.id === id; })) return UI.aviso('Este restaurante no está disponible.', 'error');
    if (envioPendiente) return UI.aviso('Hay un envío sin confirmar. Verifica primero ese pedido antes de cambiar de restaurante.', 'error');
    if (cantidadTotal() && !global.confirm('Cambiar de restaurante vaciará los productos de tu carrito actual. ¿Quieres continuar?')) return;
    carrito = {}; // los productos pertenecen exclusivamente al restaurante anterior
    localId = id; categoria = ''; busqueda = ''; cambio(); entrega.zona = ''; entrega.hora = ''; ubic = null; marcarAgotados();
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
    var hayVendidos = platosDe(localId).some(function (p) { return (M.populares || []).indexOf(p.id) >= 0; });
    if (categoria !== '_top' && (!categoria || !cats.some(function (c) { return c.id === categoria; }))) categoria = hayVendidos ? '_top' : (cats.length ? cats[0].id : '');
    var varios = localesConMenu().length > 1;
    var rep = envioPendiente ? null : ultimoCarrito();
    cuerpo().innerHTML = pasos() +
      (envioPendiente ? '<div class="banda aviso-cerrado" role="alert">⚠️ <span><b>Pedido anterior sin confirmar.</b> No hagas otro pedido hasta verificar si llegó al restaurante. El reintento conserva los productos y el código originales.</span></div>' : '') +
      (envioPendiente ? '<button class="btn" type="button" id="btn-recuperar-envio" style="margin-bottom:12px">↻ Recuperar pedido anterior</button>' : '') +
      (varios ? '<button class="btn secundario chico" type="button" id="btn-cambiar-local" style="margin-bottom:8px">📍 ' + UI.esc(local().nombre) + ' · cambiar</button>' : '<p class="subtitulo" style="margin:0 0 6px">📍 ' + UI.esc(local().nombre) + '</p>') +
      (entrega.tipo === 'mesa' && entrega.mesa ? '<div class="banda" style="margin:0 0 10px">🍽️ <span>Estás en la <b>mesa ' + UI.esc(entrega.mesa) + '</b>. Pide aquí y te lo llevamos.</span></div>' : '') +
      (local().pausado ? '<div class="banda aviso-cerrado" style="margin:0 0 10px">⏸ <span>' + UI.esc(local().mensaje_pausa || 'Este local pausó los pedidos por hoy.') + '</span></div>' : '') +
      (!abierto() ? '<div class="banda aviso-cerrado" style="margin:0 0 10px">🌙 <span>' + UI.esc(M.abierto.mensaje || 'Estamos cerrados.') + (cfg().recibir_cerrado !== 'NO' ? ' Puedes dejarnos tu pedido y lo atenderemos cuando abramos.' : '') + '</span></div>' : '') +
      (rep && !cantidadTotal() ? '<button class="tarjeta repetir" type="button" id="btn-repetir"><span class="repetir-ico">🔁</span><span><b>Repetir mi último pedido</b><small>' + UI.esc(rep.map(function (i) { var p = plato(i.plato_id); return i.cantidad + '× ' + (p ? p.nombre : 'Producto no disponible'); }).join(', ')) + '</small></span><span aria-hidden="true">›</span></button>' : '') +
      '<div class="buscador"><span aria-hidden="true">🔎</span><input class="entrada" id="buscar" type="search" placeholder="Buscar un plato…" autocomplete="off" value="' + UI.esc(busqueda) + '" aria-label="Buscar un plato"></div>' +
      '<div class="categorias-barra"><div class="pestanas" role="tablist" style="padding-bottom:0;margin-bottom:0">' +
      (hayVendidos ? '<button class="pestana" role="tab" type="button" data-cat="_top" aria-selected="' + (categoria === '_top') + '">🔥 Lo más pedido</button>' : '') +
      cats.map(function (c) {
        return '<button class="pestana" role="tab" type="button" data-cat="' + UI.esc(c.id) + '" aria-selected="' + (c.id === categoria) + '">' + UI.esc(c.nombre) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="platos" id="lista-platos"></div>';
    var re = $('#btn-recuperar-envio'); if (re) re.addEventListener('click', function () { recuperarEnvio(re); });
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
    var agregados = 0, omitidos = 0;
    lista.forEach(function (i) {
      var p = plato(i.plato_id);
      var cantidad = Math.floor(Number(i.cantidad));
      if (!p || p.agotado || (p.local_id !== 'TODOS' && p.local_id !== localId) || !isFinite(cantidad) || cantidad < 1) { omitidos++; return; }
      var extras = (Array.isArray(i.extras) ? i.extras : []).filter(function (n) {
        return (p.extras || []).some(function (x) { return x.nombre === n; });
      });
      var k = claveItem(p, extras);
      var anterior = carrito[k] ? Number(carrito[k].cantidad) || 0 : 0;
      carrito[k] = { plato: p, extras: extras, cantidad: Math.min(50, anterior + cantidad) };
      agregados++;
    });
    if (!agregados) return UI.aviso('Los productos de ese pedido ya no están disponibles.', 'error');
    cambio(); UI.vibrar();
    UI.aviso(omitidos ? 'Agregamos los productos disponibles; algunos ya no están en el menú.' : 'Listo: los productos están en tu carrito.', 'ok');
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
      : categoria === '_top' ? todos.filter(function (p) { return (M.populares || []).indexOf(p.id) >= 0; })
      : todos.filter(function (p) { return p.categoria_id === categoria; });
    var cont = $('#lista-platos');
    cont.innerHTML = lista.length ? lista.map(function (p) {
      var cant = cantidadPlato(p.id);
      return '<article class="plato' + (p.agotado ? ' agotado' : '') + (cant ? ' en-carrito' : '') + '">' +
        '<button class="plato-foto" type="button" data-ver="' + UI.esc(p.id) + '" aria-label="Ver ' + UI.esc(p.nombre) + '" data-ico="' + iconoCategoria(p) + '">' + fotoHtml(p) +
        (cant ? '<span class="plato-cant">' + cant + '</span>' : '') + '</button>' +
        '<div class="plato-info">' + (p.etiquetas || (M.populares || []).indexOf(p.id) >= 0 ? '<div class="chips">' + ((M.populares || []).indexOf(p.id) >= 0 ? '<span class="chip-etiqueta">🔥 Lo más pedido</span>' : '') + UI.chipsEtiquetas(p.etiquetas) + '</div>' : '') +
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
    // 3.1.6: nunca seleccionar una zona por existir una sola; primero verificar el punto GPS.
    if (cfg().permitir_programar !== 'SI') entrega.cuando = 'ya';
    var horas = cfg().permitir_programar === 'SI' ? horasProgramables() : [];
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
      '<button type="button" data-cuando="ya" class="' + (entrega.cuando === 'ya' ? 'activo' : '') + '">⚡ Lo antes posible</button>' +
      (cfg().permitir_programar === 'SI' ? '<button type="button" data-cuando="programar" class="' + (entrega.cuando === 'programar' ? 'activo' : '') + '">⏰ Solicitar ventana</button>' : '') + '</div>' +
      (entrega.cuando === 'programar' ? (horas.length ? '<div class="campo" style="margin:12px 0 0"><label for="pe-hora">Preferencia aproximada</label><select class="entrada" id="pe-hora">' + '<option value="">Elige una ventana</option>' + horas.map(function (h) { return '<option value="' + h + '"' + (entrega.hora === h ? ' selected' : '') + '>' + ventanaTexto(h) + '</option>'; }).join('') + '</select><span class="ayuda">Es una hora aproximada. Intentamos llegar en ese rato y te avisamos por WhatsApp si hay cambios. El negocio confirma la preferencia.</span></div>' : '<p class="ayuda">Hoy ya no quedan ventanas disponibles. Escríbenos por WhatsApp.</p>') : '<p class="ayuda" style="margin:10px 0 0">Tiempo aproximado: ' + rangoPreparacion() + (!abierto() ? ' · Tu pedido se preparará cuando el local abra.' : '') + '</p>') +
      '</div>' +
      '<div class="tarjeta"><h3 style="margin-top:0">Tus datos</h3>' +
      '<div class="campo"><label for="pe-nombre">Nombre</label><input class="entrada" id="pe-nombre" name="nombre" autocomplete="name" maxlength="80" value="' + UI.esc(cli.nombre || '') + '"></div>' +
      selectorTelefono(cli) + '</div>' +
      '<div class="acciones-paso"><button class="btn secundario" type="button" id="btn-atras">← Platos</button><button class="btn" type="submit">Continuar →</button></div>' +
      '</form>';

    UI.$$('[data-tipo]').forEach(function (b) { b.addEventListener('click', function () { guardarCampos(); entrega.tipo = b.getAttribute('data-tipo'); cambio(); pintarEntrega(); }); });
    UI.$$('[data-cuando]').forEach(function (b) { b.addEventListener('click', function () { guardarCampos(); entrega.cuando = b.getAttribute('data-cuando'); pintarEntrega(); }); });
    UI.$$('[data-zona]').forEach(function (b) { b.addEventListener('change', function () { entrega.zona = b.value; cambio(); var m = $('#aviso-minimo'); if (m) m.textContent = mensajeMinimo(); }); });
    $('#btn-atras').addEventListener('click', function () { guardarCampos(); irA(1); });
    var paisTel = $('#pe-pais');
    if (paisTel) paisTel.addEventListener('change', function () {
      var otro = $('#pe-otro-campo'); if (otro) otro.hidden = paisTel.value !== 'otro';
      var tel = $('#pe-tel'); if (tel) {
        // Al cambiar país, no convertir silenciosamente el número anterior a otro.
        tel.value = '';
        tel.placeholder = paisTel.value === '1' ? '202 555 0147' : 'Número de celular';
      }
      var pref = $('#pe-otro-codigo'); if (paisTel.value === 'otro' && pref) pref.focus();
    });
    var h = $('#pe-hora'); if (h) h.addEventListener('change', function () { entrega.hora = h.value; });
    var me = $('#pe-mesa'); if (me) me.addEventListener('change', function () { entrega.mesa = me.value; });
    if (entrega.tipo === 'domicilio') conectarUbicacion();
    $('#form-entrega').addEventListener('submit', function (e) {
      e.preventDefault();
      guardarCampos();
      var c = MEM.leer('cliente') || {};
      var numeroInternacional = '', errorTelefono = '';
      try { numeroInternacional = UI.telefonoInternacional(c.telefono, c.pais_telefono || cfg().pais_codigo); }
      catch (err) { errorTelefono = err.message; }
      var malo = !c.nombre ? ['pe-nombre', 'Escribe tu nombre.'] :
        errorTelefono ? ['pe-tel', errorTelefono] :
        (entrega.tipo === 'domicilio' && !entrega.zona) ? ['op-zonas', 'Elige tu zona de envío.'] :
        (entrega.tipo === 'domicilio' && !c.direccion && (!ubic || ubic.fuente === 'whatsapp')) ? ['pe-dir', ubic ? 'Escribe tu dirección (la ubicación la mandas luego por WhatsApp).' : 'Escribe tu dirección o marca tu ubicación.'] :
        (entrega.tipo === 'mesa' && !entrega.mesa) ? ['pe-mesa', 'Elige tu número de mesa.'] :
        (entrega.cuando === 'programar' && !entrega.hora) ? ['pe-hora', 'Elige la ventana.'] : null;
      UI.$$('[aria-invalid]').forEach(function (x) { x.removeAttribute('aria-invalid'); });
      UI.$$('.error-campo').forEach(function (x) { x.remove(); });
      if (malo) {
        /* 3.1.1: el aviso queda escrito junto al campo (en iPhone el teclado tapaba el mensaje)
           y primero se baja al campo y recién después se abre el teclado. */
        var el = $('#' + malo[0]);
        if (el) {
          el.setAttribute('aria-invalid', 'true');
          var aviso = document.createElement('p'); aviso.className = 'error-campo'; aviso.setAttribute('role', 'alert'); aviso.textContent = '⚠️ ' + malo[1];
          (el.closest('.campo') || el.parentNode).appendChild(aviso);
          el.scrollIntoView({ block: 'center' });
          if (el.focus && /^(INPUT|TEXTAREA)$/.test(el.tagName)) setTimeout(function () { el.focus({ preventScroll: true }); }, 350);
        }
        return UI.aviso(malo[1], 'error');
      }
      if (entrega.tipo === 'domicilio' && mensajeCobertura() && cfg().cobertura_modo === 'bloquear') return UI.aviso('Fuera de cobertura: cambia la dirección o selecciona Retiro.', 'error');
      if (local().pausado) return UI.aviso(local().mensaje_pausa || 'Este local pausó los pedidos.', 'error');
      c.telefono = numeroInternacional;
      MEM.guardar('cliente', c);
      irA(3);
    });
  }

  function guardarCampos() {
    var c = MEM.leer('cliente') || {};
    ['nombre', 'telefono', 'direccion', 'referencia'].forEach(function (k) { var el = UI.$('[name=' + k + ']'); if (el) c[k] = el.value.trim(); });
    var sel = $('#pe-pais');
    if (sel) c.pais_telefono = codigoTelefonoElegido();
    MEM.guardar('cliente', c);
    var h = $('#pe-hora'); if (h) entrega.hora = h.value;
    var z = UI.$('input[name=zona]:checked'); if (z) entrega.zona = z.value;
  }

  function bloqueDomicilio(zonas, cli) {
    return '<div class="tarjeta"><h3 style="margin-top:0">¿Dónde te lo llevamos?</h3>' +
      '<div class="ubic-opciones">' +
      '<button class="ubic-op" type="button" id="btn-gps"><span>📍</span><b>Usar mi ubicación</b><small>La más exacta</small></button>' +
      '<button class="ubic-op" type="button" id="btn-pegar"><span>📋</span><b>Pegar ubicación</b><small>Copiada de Google Maps</small></button>' +
      '<button class="ubic-op" type="button" id="btn-ubic-wa"><span>💬</span><b>Por WhatsApp</b><small>La mandas al terminar</small></button></div>' +
      '<div id="ubic-zona"></div><div class="ayuda" id="ubic-cobertura" style="margin-top:8px"></div>' +
      '<div class="campo" style="margin-top:14px"><label for="pe-dir">Dirección</label><input class="entrada" id="pe-dir" name="direccion" autocomplete="street-address" maxlength="200" placeholder="Calle principal y secundaria" value="' + UI.esc(cli.direccion || '') + '"></div>' +
      '<div class="campo" style="margin-bottom:0"><label for="pe-ref">Referencia</label><input class="entrada" id="pe-ref" name="referencia" maxlength="200" placeholder="Ej. casa azul, junto a la farmacia" value="' + UI.esc(cli.referencia || '') + '"></div></div>' +
      '<div class="tarjeta"><h3 style="margin-top:0">Zona de envío</h3><p class="ayuda">Marca tu ubicación arriba para detectar la zona. También puedes elegirla manualmente.</p><div class="opciones" id="op-zonas">' +
      zonas.map(function (z) { return '<label class="opcion"><input type="radio" name="zona" data-zona value="' + UI.esc(z.id) + '"' + (entrega.zona === z.id ? ' checked' : '') + '><span>' + UI.esc(z.nombre) + (z.minutos ? ' <small style="color:var(--texto-2)">~' + z.minutos + ' min</small>' : '') + '</span><span class="derecha">' + UI.dinero(z.costo) + '</span></label>'; }).join('') +
      '</div><p class="ayuda" id="aviso-minimo">' + UI.esc(mensajeMinimo()) + '</p></div>';
  }

  /* ----- Ubicación: GPS con mapa, pegar enlace, quitar ----- */
  function conectarUbicacion() {
    $('#btn-gps').addEventListener('click', function (e) {
      var b = e.currentTarget;
      UI.trabajando(b, async function () {
        var estado = $('#ubic-zona');
        estado.innerHTML = '<p class="ayuda">Buscando tu ubicación… acepta el permiso si te lo pide.</p>';
        var pos = await UI.ubicacion();
        if (!pos) { estado.innerHTML = '<div class="banda error" style="margin:10px 0 0;text-align:left">⚠️ <span>No pudimos tomar tu ubicación.<br>' + UI.ayudaUbicacion() + '<br><br>Si no se puede, usa <b>«Pegar ubicación»</b> o <b>«Por WhatsApp»</b>, o escribe tu dirección.</span></div>'; return; }
        ubic = { lat: pos.lat, lng: pos.lng, precision: pos.precision, fuente: 'gps' };
        cambio(); mostrarMapa(); zonaPorPunto();
      });
    });
    $('#btn-pegar').addEventListener('click', pegarUbicacion);
    $('#btn-ubic-wa').addEventListener('click', function () {
      ubic = { lat: '', lng: '', fuente: 'whatsapp', enlace: '' }; cambio();
      if (mapa) { mapa.destruir(); mapa = null; }
      $('#ubic-zona').innerHTML = '<div class="ubic-lista">💬 <span>Al enviar el pedido te sale el botón <b>«Enviar mi ubicación por WhatsApp»</b>. En el chat toca <b>📎 (o +) → Ubicación → Enviar mi ubicación actual</b>.</span><button class="btn secundario chico" type="button" id="btn-quitar">✕</button></div>';
      $('#btn-quitar').addEventListener('click', quitarUbicacion);
    });
    if (ubic && ubic.fuente === 'whatsapp') $('#btn-ubic-wa').click();
    else if (ubic) { mostrarMapa(); zonaPorPunto(); }
  }

  /* 3.1.1: saca el enlace o las coordenadas de cualquier texto copiado (Maps, WhatsApp, mensajes). */
  function sacarEnlace(t) {
    t = String(t || '');
    var m = /https:\/\/[^\s"<>]+/.exec(t);
    if (m) return m[0].replace(/[.,;)]+$/, '');
    var c = /-?\d{1,2}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/.exec(t);
    return c ? c[0].replace(/\s/g, '') : '';
  }
  async function leerCopiado() { try { return sacarEnlace(await global.navigator.clipboard.readText()); } catch (e) { return ''; } }

  async function pegarUbicacion() {
    /* Camino rápido: si ya copió el enlace, se usa con un solo toque.
       3.1.5: en iPhone el navegador no deja leer lo copiado → se va directo al cuadro para pegar con el dedo. */
    var ios = /iPhone|iPad|iPod/.test(global.navigator.userAgent);
    var enlace = await leerCopiado(); // en iPhone aparece la burbuja «Pegar»: al tocarla se usa directo
    if (!enlace) {
      var dato = '';
      var ok = await UI.ventana({
        icono: '📋', titulo: 'Pegar ubicación',
        html: '<ol class="pasos-lista"><li>Abre <b>Google Maps</b> y toca el punto de tu casa.</li><li>Toca <b>Compartir</b> → <b>Copiar</b>.</li><li>Vuelve aquí y toca <b>📋 Pegar</b>.</li></ol>' +
          '<button class="btn bloque" type="button" id="pu-pegar" style="margin-bottom:6px">📋 Pegar</button>' +
          (ios ? '<p class="ayuda" style="margin:0 0 10px">En iPhone sale una burbujita negra que dice <b>«Pegar»</b> justo encima del botón: <b>tócala</b>.</p>' : '') +
          '<div class="campo"><label for="pu-dato">Si no funciona, pega aquí (mantén el dedo → Pegar)</label><input class="entrada" id="pu-dato" maxlength="400" placeholder="Mantén el dedo aquí → Pegar" autocomplete="off"></div>' +
          '<button class="btn secundario chico" type="button" id="pu-maps">🗺️ Abrir Google Maps</button>',
        alAbrir: function (v, cerrar) {
          var pb = UI.$('#pu-pegar', v); if (pb) pb.addEventListener('click', async function () {
            var e = await leerCopiado();
            if (e) { dato = e; cerrar(true); } else { UI.aviso(ios ? 'Toca «Pegar» en la burbujita del iPhone, o mantén el dedo en el cuadro → Pegar.' : 'No hay un enlace copiado. Cópialo en Google Maps o pégalo abajo.', 'error'); var c = UI.$('#pu-dato', v); if (c) c.focus(); }
          });
          UI.$('#pu-maps', v).addEventListener('click', function () { global.open('https://www.google.com/maps', '_blank', 'noopener'); });
        },
        botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Usar esta ubicación', valor: true, antes: function (v) {
          dato = sacarEnlace(UI.$('#pu-dato', v).value);
          if (!dato) { UI.aviso('Pega el enlace completo (empieza con https://).', 'error'); return false; }
          return true;
        } }]
      });
      if (!ok || !dato) return;
      enlace = dato;
    }
    var estado = $('#ubic-zona');
    estado.innerHTML = '<p class="ayuda">Leyendo la ubicación…</p>';
    try {
      var r = await DATOS.pedir('ubicacionResolver', { enlace: enlace, disp_id: UI.dispId() });
      if (r.punto) { ubic = { lat: r.punto.lat, lng: r.punto.lng, fuente: 'enlace', enlace: enlace }; cambio(); mostrarMapa(); zonaPorPunto(); return; }
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
    mapa = UI.mapa($('#mapa'), { lat: ubic.lat, lng: ubic.lng, zoom: 17, alMover: function (pt) { ubic.lat = pt.lat; ubic.lng = pt.lng; cambio(); zonaPorPunto(); } });
    $('#btn-quitar').addEventListener('click', quitarUbicacion);
  }
  function quitarUbicacion() { ubic = null; entrega.zona = ''; cambio(); if (mapa) { mapa.destruir(); mapa = null; } $('#ubic-zona').innerHTML = ''; UI.$$('input[name=zona]').forEach(function (x) { x.checked = false; }); if ($('#ubic-cobertura')) $('#ubic-cobertura').textContent = ''; }

  /* ---------------- 3.1.5: cuentas bancarias, políticas y efectivo por cliente ---------------- */
  function cuentasBanco() {
    var t = String(cfg().cuentas_bancarias || ''), lista = [];
    try { lista = t ? JSON.parse(t) : []; } catch (e) { lista = []; }
    return lista.filter(function (x) { return x && x.activa !== false && x.numero; });
  }
  function hayTransferencia() { return cuentasBanco().length > 0 || !!String(cfg().datos_transferencia || '').trim(); }
  function etiquetaCuenta(x) { return x.banco + ' · ' + x.numero; }
  function colorBanco(n) { var h = 0; String(n).split('').forEach(function (ch) { h = (h * 31 + ch.charCodeAt(0)) % 360; }); return 'hsl(' + h + ' 55% 32%)'; }
  /* Tarjetas «premium» de las cuentas del negocio, con botón de copiar cada dato. */
  function tarjetasCuentasSolo(p) { return tarjetasCuentas(p.total, p.numero, false, p.cuenta_pago); }
  function tarjetasCuentas(monto, referencia, elegir, solo) {
    var lista = cuentasBanco(), nota = String(cfg().datos_transferencia || '').trim();
    if (solo && lista.some(function (x) { return etiquetaCuenta(x) === solo; })) lista = lista.filter(function (x) { return etiquetaCuenta(x) === solo; });
    if (!lista.length) return nota ? '<div class="banda" style="margin-top:10px;text-align:left;white-space:pre-line">🏦 <span>' + UI.esc(nota) + (referencia ? '\nReferencia: ' + UI.esc(referencia) : '') + '</span></div>' : '';
    var elegida = pago.cuenta || '';
    return '<div class="cuentas">' + lista.map(function (x) {
      var et = etiquetaCuenta(x), sel = elegir && elegida === et;
      return '<div class="cuenta-banco' + (sel ? ' elegida' : '') + '" style="--banco:' + colorBanco(x.banco) + '">' +
        '<div class="cb-cabeza"><span class="cb-logo" aria-hidden="true">' + UI.esc(String(x.banco).replace(/^(banco|cooperativa)\s+(de(l)?\s+)?/i, '').charAt(0).toUpperCase()) + '</span>' +
        '<div><b>' + UI.esc(x.banco) + '</b><small>Cuenta ' + (x.tipo === 'corriente' ? 'corriente' : 'de ahorros') + '</small></div></div>' +
        '<div class="cb-numero"><span>' + UI.esc(x.numero) + '</span><button type="button" class="cb-copiar" data-copiar="' + UI.esc(x.numero.replace(/\D/g, '')) + '" aria-label="Copiar número de cuenta">📋</button></div>' +
        '<div class="cb-dato"><span>Titular</span><b>' + UI.esc(x.titular) + '</b></div>' +
        (x.documento ? '<div class="cb-dato"><span>' + (x.documento.length === 13 ? 'RUC' : 'Cédula') + '</span><b>' + UI.esc(x.documento) + '</b><button type="button" class="cb-copiar" data-copiar="' + UI.esc(x.documento) + '" aria-label="Copiar documento">📋</button></div>' : '') +
        (x.correo ? '<div class="cb-dato"><span>Correo</span><b>' + UI.esc(x.correo) + '</b></div>' : '') +
        (elegir ? '<button type="button" class="btn ' + (sel ? '' : 'secundario ') + 'chico bloque cb-elegir" data-cuenta="' + UI.esc(et) + '">' + (sel ? '✓ Pagaré a esta cuenta' : 'Pagaré a esta cuenta') + '</button>' : '') +
        '</div>';
    }).join('') + '</div>' +
      (monto ? '<div class="cb-monto"><span>Monto exacto</span><b>' + UI.dinero(monto) + '</b><button type="button" class="cb-copiar" data-copiar="' + Number(monto).toFixed(2) + '" aria-label="Copiar monto">📋</button>' + (referencia ? '<small>Referencia: ' + UI.esc(referencia) + '</small>' : '') + '</div>' : '') +
      (nota ? '<p class="ayuda" style="white-space:pre-line;margin:6px 0 0">' + UI.esc(nota) + '</p>' : '') +
      (lista.length > 1 ? '<p class="ayuda" style="margin:6px 0 0">💡 Si pagas desde el mismo banco, se acredita al instante.</p>' : '');
  }
  var POLITICAS_DEFECTO = '🔒 Pago con transferencia o Deuna: tu pedido se prepara cuando confirmamos el pago en nuestra cuenta (la foto del comprobante sola no basta).\n' +
    '⏳ Si pagas desde otro banco, la acreditación puede tardar; preparamos apenas llegue.\n' +
    '🔢 Te damos un código de 4 números: dáselo al motorizado solo cuando tengas tu pedido en la mano.\n' +
    '✏️ Una vez enviado, el pedido no se puede editar: para cambios escríbenos por WhatsApp.\n' +
    '↩️ Si tu pago no se acredita, el pedido se anula. Si anulamos un pedido ya pagado, te devolvemos el dinero.\n' +
    '🕒 La hora es aproximada y el envío depende de tu zona.';
  function textoPoliticas() { return String(cfg().politicas_texto || '').trim() || POLITICAS_DEFECTO; }
  function verPoliticas() {
    UI.ventana({ icono: '📋', titulo: 'Cómo funciona tu pedido', html: '<div class="politicas-lista">' + textoPoliticas().split('\n').filter(String).map(function (l) { return '<p>' + UI.esc(l) + '</p>'; }).join('') + '</div>' });
  }
  var efectivoCliente = null, efectivoTel = '';
  async function revisarEfectivoCliente() {
    var tel = (MEM.leer('cliente') || {}).telefono || '';
    if (!UI.digitos(tel) || tel === efectivoTel) return;
    efectivoTel = tel;
    try { efectivoCliente = (await DATOS.pedir('pagoOpciones', { telefono: tel })).efectivo === true; } catch (e) { efectivoCliente = false; }
    if (efectivoCliente && paso === 3 && !UI.$('[data-forma=efectivo]')) { guardarNotas(); pintarConfirmar(); restaurarNotas(); }
  }

  /* ---------------- Paso 3: confirmar y pagar ---------------- */
  function pintarConfirmar() {
    $('#barra-pedido').hidden = true;
    if (!items().length && !envioPendiente) return irA(1);
    if (envioPendiente) {
      cuerpo().innerHTML = '<div class="tarjeta" role="alert"><h2>Pedido anterior pendiente de confirmación</h2><p>Primero comprobaremos si el restaurante recibió tu pedido. No necesitas volver a llenar tus datos ni crear otro carrito.</p><button class="btn bloque" type="button" id="btn-recuperar-confirmar">↻ Comprobar y recuperar pedido</button><button class="btn secundario bloque" type="button" id="btn-volver-menu" style="margin-top:8px">Volver al menú</button></div>';
      $('#btn-recuperar-confirmar').addEventListener('click', function (ev) { recuperarEnvio(ev.currentTarget); });
      $('#btn-volver-menu').addEventListener('click', function () { irA(1); });
      return;
    }
    var c = cfg(), cli = MEM.leer('cliente') || {};
    var z = zonaElegida();
    /* 3.1.3: efectivo solo si el dueño lo permite y hasta su monto máximo */
    var efOk = efectivoPermitido();
    var formas = efOk ? [['efectivo', '💵', 'Efectivo', entrega.tipo === 'domicilio' ? 'Pagas al recibir' : 'Pagas en el local']] : [];
    if (hayTransferencia()) formas.push(['transferencia', '🏦', 'Transferencia', cuentasBanco().length > 1 ? cuentasBanco().length + ' bancos' : 'A la cuenta del local']); // 3.1.5: sin cuenta no se ofrece
    if (c.deuna_qr_url) formas.push(['deuna', '📲', 'Deuna', 'Escaneas el QR']);
    if (!formas.length) formas.push(['transferencia', '🏦', 'Transferencia', 'Te damos los datos por WhatsApp']); // nunca sin forma de pago
    if (!formas.some(function (f) { return f[0] === pago.forma; })) pago.forma = formas[0][0];
    var conPropina = entrega.tipo === 'domicilio' && c.propinas !== 'NO';
    var resumenEntrega = entrega.tipo === 'domicilio' ? '🛵 A domicilio · ' + UI.esc(z ? z.nombre : '') + '<br><small>' + UI.esc(cli.direccion || (ubic ? 'Ubicación marcada en el mapa' : '')) + '</small>'
      : entrega.tipo === 'mesa' ? '🍽️ Mesa ' + UI.esc(entrega.mesa) : '🏪 Retiro en ' + UI.esc(local().nombre);
    cuerpo().innerHTML = pasos() +
      '<h2 class="paso-titulo">Revisa y confirma</h2>' +
      (envioPendiente ? '<div class="banda aviso-cerrado" role="alert">⚠️ <span><b>Envío anterior sin confirmar.</b> Al pulsar enviar se reintentará exactamente el pedido original, no los cambios posteriores del carrito. No hagas otro pedido hasta verificar el resultado.</span></div>' : '') +
      '<div class="tarjeta" id="resumen-items"></div>' +
      (mensajeMinimo() ? '<div class="banda">⚠️ <span>' + UI.esc(mensajeMinimo()) + '</span></div>' : '') +
      (mensajeCobertura() ? '<div class="banda">⚠️ <span>' + UI.esc(mensajeCobertura()) + ' Puedes corregirla o seguir con tu pedido.</span></div>' : '') +
      '<div class="tarjeta resumen-entrega"><div>' + resumenEntrega + (entrega.cuando === 'programar' && entrega.hora ? '<br><small>⏰ ' + UI.esc(ventanaTexto(entrega.hora)) + ' aprox. (sujeto a confirmación por WhatsApp)</small>' : '') +
      '<br><small>👤 ' + UI.esc(cli.nombre || '') + ' · ' + UI.esc(cli.telefono || '') + '</small></div><button class="btn secundario chico" type="button" id="btn-editar-entrega">Cambiar</button></div>' +
      '<form id="form-pedido" class="rejilla" autocomplete="off" novalidate>' +
      '<div class="tarjeta"><h3 style="margin-top:0">¿Cómo pagas?</h3><div class="tipos-entrega formas">' + formas.map(function (f) {
        return '<button type="button" class="tipo-op' + (pago.forma === f[0] ? ' activo' : '') + '" data-forma="' + f[0] + '" aria-pressed="' + (pago.forma === f[0]) + '"><span class="tipo-ico">' + f[1] + '</span><b>' + f[2] + '</b><small>' + f[3] + '</small></button>';
      }).join('') + '</div>' +
      (pago.forma === 'transferencia' ? tarjetasCuentas(0, '', cuentasBanco().length > 1) : '') +
      (pago.forma === 'deuna' ? '<div class="banda" style="margin-top:10px">📲 <span>Al enviar te mostramos el QR de Deuna para pagar.</span></div>' : '') +
      (UI.esDigital(pago.forma) ? '<div class="politica-linea">🔒 <span>Tu pedido <b>se prepara cuando confirmemos el pago en nuestra cuenta</b>. Si pagas desde otro banco puede tardar un poco.</span></div>' : '') +
      (!efOk && c.efectivo_permitido !== 'NO' ? '<p class="ayuda">💵 En efectivo se aceptan pedidos de hasta ' + UI.dinero(Number(c.efectivo_maximo)) + '.</p>' : '') +
      '</div>' +
      (conPropina ? '<div class="tarjeta"><h3 style="margin-top:0">Propina para el motorizado <small style="font-weight:600;color:var(--texto-2)">(opcional)</small></h3><div class="segmento">' +
        [0, 0.5, 1, 2].map(function (v) { return '<button type="button" data-propina="' + v + '" class="' + (pago.propina === v ? 'activo' : '') + '">' + (v ? UI.dinero(v) : 'Sin propina') + '</button>'; }).join('') + '</div><p class="ayuda" style="margin:8px 0 0">Va completa para quien te lleva el pedido. 🙌</p></div>' : '') +
      '<div class="tarjeta"><details' + (MEM.leer('ultimo_cupon') ? ' open' : '') + '><summary>🏷️ ¿Tienes un cupón o una nota para la cocina?</summary>' +
      '<div class="campo" style="margin-top:12px"><label for="pe-cupon">Cupón de descuento</label><input class="entrada" id="pe-cupon" name="cupon" maxlength="30" autocapitalize="characters" spellcheck="false"><button class="btn secundario chico" type="button" id="pe-aplicar" style="margin-top:7px">Aplicar</button><span class="ayuda" id="pe-cupon-estado">Comprueba el descuento antes de enviar tu pedido.</span></div>' +
      '<div class="campo" style="margin-bottom:0"><label for="pe-notas">Nota para la cocina</label><textarea class="entrada" id="pe-notas" name="notas" maxlength="300" placeholder="Ej. sin ají"></textarea></div></details></div>' +
      '<div class="tarjeta"><div id="totales"></div>' +
      '<label class="casilla"><input type="checkbox" name="acepta_privacidad" id="pe-privacidad"' + (MEM.leer('acepta_privacidad') ? ' checked' : '') + '> <span>Acepto que usen mi nombre, celular y dirección solo para este pedido. <a href="privacidad.html" target="_blank" rel="noopener">Aviso de privacidad</a></span></label>' +
      '<label class="casilla"><input type="checkbox" id="pe-politicas"' + (MEM.leer('acepta_politicas') ? ' checked' : '') + '> <span>Leí <a href="#" id="ver-politicas">cómo funciona el pedido</a> (pago, entrega y cambios).</span></label>' +
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
        if (efectivoPermitido() !== !!UI.$('[data-forma=efectivo]')) { guardarNotas(); pintarConfirmar(); restaurarNotas(); return; } // 3.1.3: cambió si alcanza para efectivo
        UI.$$('[data-propina]').forEach(function (x) { x.classList.toggle('activo', x === b); });
        totales();
      });
    });
    $('#form-pedido').addEventListener('submit', enviar);
    $('#pe-aplicar').addEventListener('click', function (e) { UI.trabajando(e.currentTarget, async function () {
      var codigo = ($('#pe-cupon').value || '').trim().toUpperCase();
      cuponAplicado = null;
      if (!codigo) { totales(); return UI.aviso('Escribe un cupón.', 'error'); }
      try {
        var r = await DATOS.pedir('cuponValidar', { cupon: codigo, local_id: localId, telefono: (MEM.leer('cliente') || {}).telefono, items: items().map(function (it) { return { plato_id: it.plato.id, cantidad: it.cantidad, extras: it.extras }; }) });
        cuponAplicado = { codigo: r.codigo, descuento: r.descuento };
        $('#pe-cupon-estado').textContent = '✅ Cupón aplicado: −' + UI.dinero(r.descuento) + ' en platos.';
        totales();
      } catch (err) { $('#pe-cupon-estado').textContent = '⚠️ ' + err.message; UI.aviso(err.message, 'error'); totales(); }
    }); });
    $('#pe-cupon').addEventListener('input', function () { cuponAplicado = null; $('#pe-cupon-estado').textContent = 'Toca Aplicar para comprobar el cupón.'; totales(); });
    $('#ver-politicas').addEventListener('click', function (e) { e.preventDefault(); verPoliticas(); });
    UI.$$('[data-cuenta]').forEach(function (b) { b.addEventListener('click', function () { pago.cuenta = b.getAttribute('data-cuenta'); guardarNotas(); pintarConfirmar(); restaurarNotas(); }); });
    if (pago.forma === 'transferencia' && cuentasBanco().length === 1) pago.cuenta = etiquetaCuenta(cuentasBanco()[0]);
    pintarItemsResumen();
    totales();
    revisarEfectivoCliente();
  }
  function totalActual() { return Math.round((subtotal() + envio() + propina()) * 100) / 100; }
  function efectivoPermitido() {
    var c = cfg();
    if (efectivoCliente) return true; // 3.1.5: el local autorizó a este cliente
    if (c.efectivo_permitido === 'NO') return false;
    var max = Number(c.efectivo_maximo);
    return !(max > 0 && totalActual() > max);
  }
  var notasTmp = {};
  function guardarNotas() { notasTmp = { cupon: ($('#pe-cupon') || {}).value || '', notas: ($('#pe-notas') || {}).value || '' }; }
  function restaurarNotas() { if ($('#pe-cupon')) $('#pe-cupon').value = notasTmp.cupon || ''; if ($('#pe-notas')) $('#pe-notas').value = notasTmp.notas || ''; }

  function totales() {
    var e = envio(), pr = propina(), descuento = cuponAplicado ? cuponAplicado.descuento : 0, t = subtotal() + e + pr - descuento;
    $('#totales').innerHTML =
      '<div class="resumen-linea"><span>Subtotal</span><span>' + UI.dinero(subtotal()) + '</span></div>' +
      (entrega.tipo === 'domicilio' ? '<div class="resumen-linea"><span>Envío</span><span>' + UI.dinero(e) + '</span></div>' : '') +
      (pr ? '<div class="resumen-linea"><span>Propina</span><span>' + UI.dinero(pr) + '</span></div>' : '') +
      (descuento ? '<div class="resumen-linea"><span>Descuento en platos</span><span>−' + UI.dinero(descuento) + '</span></div>' : '') +
      '<div class="resumen-linea total"><span>Total</span><span>' + UI.dinero(t) + '</span></div>' +
      (cfg().precios_incluyen_iva !== 'NO' ? (function () { // 3.1.5: IVA desglosado (el precio no cambia; la propina no lleva IVA)
        var pct = Number(cfg().iva_porcentaje) || 15, gravado = subtotal() + e - descuento, iva = Math.round((gravado - gravado / (1 + pct / 100)) * 100) / 100;
        return '<div class="resumen-linea iva-linea"><span>Incluye IVA ' + pct + ' %</span><span>' + UI.dinero(iva) + '</span></div>';
      })() : '');
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
        if ($('#pe-cupon-estado')) $('#pe-cupon-estado').textContent = 'Carrito modificado: vuelve a aplicar el cupón.';
        pintarItemsResumen(); totales();
      });
    });
  }

  async function enviar(ev) {
    ev.preventDefault();
    var f = ev.target, boton = f.querySelector('button[type=submit]');
    if (envioPendiente) return recuperarEnvio(boton);
    var d = UI.leerFormulario(f);
    var cli = MEM.leer('cliente') || {};
    var priv = $('#pe-privacidad'), promos = f.querySelector('[name=acepta_promos]');
    if (!priv.checked) { UI.aviso('Marca la casilla del aviso de privacidad para enviar.', 'error'); priv.focus(); priv.closest('.casilla').classList.add('falta'); return; }
    var pol = $('#pe-politicas');
    if (pol && !pol.checked) { UI.aviso('Marca que leíste cómo funciona el pedido.', 'error'); pol.focus(); pol.closest('.casilla').classList.add('falta'); return; }
    if (d.cupon && (!cuponAplicado || cuponAplicado.codigo !== d.cupon.trim().toUpperCase())) return UI.aviso('Toca Aplicar para confirmar el cupón antes de enviar.', 'error');
    if (local().pausado) return UI.aviso(local().mensaje_pausa || 'Este local pausó los pedidos.', 'error');
    if (mensajeCobertura() && cfg().cobertura_modo === 'bloquear' && entrega.tipo === 'domicilio') return UI.aviso('La ubicación está fuera de cobertura. Cambia a Retiro o corrige la dirección.', 'error');
    if (pago.forma === 'transferencia' && cuentasBanco().length > 1 && !pago.cuenta) { UI.aviso('Elige a qué cuenta vas a pagar.', 'error'); var cb = UI.$('.cuentas'); if (cb) cb.scrollIntoView({ block: 'center' }); return; }
    MEM.guardar('acepta_politicas', true);
    MEM.guardar('acepta_privacidad', true); MEM.guardar('acepta_promos', !!(promos && promos.checked));
    if (!codigoEnvio) codigoEnvio = envioPendiente ? envioPendiente.op_id : UI.codigoEnvio();
    var dom = entrega.tipo === 'domicilio';
    var datos = {
      op_id: codigoEnvio, local_id: localId, tipo_entrega: entrega.tipo, zona_id: dom ? entrega.zona : '', mesa: entrega.tipo === 'mesa' ? entrega.mesa : '',
      hora_llegada: entrega.cuando === 'programar' ? entrega.hora : '', forma_pago: pago.forma, cuenta_pago: pago.forma === 'transferencia' ? (pago.cuenta || '') : '', propina: propina(), cupon: d.cupon, notas: d.notas,
      origen: origen, canal: 'cliente', disp_id: UI.dispId(), acepta_privacidad: true, acepta_promos: !!(promos && promos.checked),
      items: items().map(function (it) { return { plato_id: it.plato.id, cantidad: it.cantidad, extras: it.extras }; }),
      cliente: { nombre: cli.nombre, telefono: cli.telefono, direccion: dom ? cli.direccion : '', referencia: dom ? cli.referencia : '',
        lat: dom && ubic && ubic.lat !== '' ? ubic.lat : '', lng: dom && ubic && ubic.lng !== '' ? ubic.lng : '',
        ubicacion_fuente: dom && ubic ? ubic.fuente : '', ubicacion_enlace: dom && ubic && ubic.enlace ? ubic.enlace : '' }
    };
    // Si la respuesta anterior se perdió, reintentar exactamente la misma carga.
    // Nunca reutilizar un op_id con platos, importes o dirección distintos.
    if (envioPendiente) datos = envioPendiente;
    else {
      envioPendiente = JSON.parse(JSON.stringify(datos));
      try { global.sessionStorage.setItem('mipedido_envio_pendiente', JSON.stringify({ fecha: Date.now(), datos: envioPendiente })); } catch (e) { /* sin almacenamiento */ }
    }
    await procesarEnvio(datos, boton);
  }

  async function procesarEnvio(datos, boton) {
    await UI.trabajando(boton, async function () {
      try {
        var r = await DATOS.pedir('pedidoCrear', datos, { guardar: true });
        MEM.guardar('ultimo_carrito', { local: datos.local_id, items: datos.items });
        guardarMiPedido({ n: r.pedido.numero, tel: datos.cliente.telefono, s: r.pedido.clave_seguimiento ? r.pedido.numero + '-' + r.pedido.clave_seguimiento : '', f: Date.now(), t: r.pedido.total, e: 'Recibido', l: datos.local_id,
          i: datos.items.map(function (x) { var pl = plato(x.plato_id); return { p: x.plato_id, c: x.cantidad, x: x.extras, n: pl ? pl.nombre : '' }; }) });
        var detalle = datos.items.map(function (x) { var pl = plato(x.plato_id); return { plato: pl, cantidad: x.cantidad, extras: x.extras }; });
        r.pedido.ubic_por_wa = !!(ubic && ubic.fuente === 'whatsapp'); // 3.1.1: solo entonces se pide la ubicación por WhatsApp
        carrito = {}; codigoEnvio = ''; envioPendiente = null; ubic = null; pago.propina = 0;
        try { global.sessionStorage.removeItem('mipedido_envio_pendiente'); } catch (e) { /* sin almacenamiento */ }
        UI.vibrar([30, 40, 30]);
        pintarExito(r.pedido, detalle);
      } catch (err) {
        // El código de envío se conserva: si vuelve a intentar, no se duplica.
        UI.ventana({ icono: '⚠️', titulo: 'No pudimos confirmar el envío', texto: 'No sabemos si el pedido llegó al restaurante. No hagas otro pedido todavía. Puedes reintentar el envío original con el mismo código, aunque hayas cambiado el carrito. No hagas un pedido nuevo hasta confirmar el anterior. Detalle: ' + err.message, botones: [{ texto: 'Entendido', valor: true }] });
      }
    });
  }

  async function recuperarEnvio(boton) {
    if (!envioPendiente) return UI.aviso('No hay ningún envío pendiente de recuperación.', 'error');
    if (envioPendiente.local_id !== localId) return UI.aviso('El envío pendiente pertenece a otro local. No se puede reintentar desde este menú.', 'error');
    if (recuperacionEnCurso) return;
    recuperacionEnCurso = true;
    if (boton) boton.disabled = true;
    var original = envioPendiente;
    try {
    try {
      var consulta = await DATOS.pedir('pedidoRecuperar', { op_id: original.op_id, telefono: original.cliente.telefono });
      if (consulta.encontrado && consulta.pedido) {
        var p = consulta.pedido;
        guardarMiPedido({ n: p.numero, tel: original.cliente.telefono, s: p.clave_seguimiento ? p.numero + '-' + p.clave_seguimiento : '', f: Date.now(), t: p.total, e: p.estado || 'Recibido', l: original.local_id,
          i: original.items.map(function (x) { var pl = plato(x.plato_id); return { p: x.plato_id, c: x.cantidad, x: x.extras, n: pl ? pl.nombre : '' }; }) });
        // Recuperar el pedido no significa que el carrito actual sea el original.
        // Solo vaciarlo cuando sus artículos coinciden con el envío recuperado;
        // de lo contrario preservar el nuevo pedido que el cliente esté armando.
        var firmaItems = function (items) { return JSON.stringify((items || []).map(function (x) {
          return { p: String(x.plato_id || x.p || ''), c: Number(x.cantidad || x.c || 0), e: x.extras || x.x || '' };
        }).sort(function (a, b) { return JSON.stringify(a).localeCompare(JSON.stringify(b)); })); };
        var carritoActual = Object.keys(carrito).map(function (k) { var x = carrito[k]; return { plato_id: x.plato_id || x.p || k, cantidad: x.cantidad || x.c, extras: x.extras || x.x || '' }; });
        var esMismoCarrito = firmaItems(carritoActual) === firmaItems(original.items);
        MEM.guardar('ultimo_carrito', { local: original.local_id, items: original.items });
        if (esMismoCarrito) { carrito = {}; ubic = null; pago.propina = 0; }
        codigoEnvio = ''; envioPendiente = null;
        try { global.sessionStorage.removeItem('mipedido_envio_pendiente'); } catch (e) { /* sin almacenamiento */ }
        UI.aviso('Pedido ' + p.numero + ' localizado. No se ha creado otro.', 'exito');
        if (esMismoCarrito) pintarExito(p);
        else { pintarMenu(); pintarSeguimiento(true); }
        return;
      }
    } catch (err) {
      // La consulta también puede fallar por mala conexión: NO crear otro pedido con otro código.
      return UI.aviso('No se pudo comprobar el pedido. Revisa tu conexión y vuelve a intentarlo; no hagas otro pedido.', 'error');
    }
    // El servidor no encontró el código: reintentar la carga ORIGINAL, protegida por op_id.
    await procesarEnvio(original, boton);
    } finally {
      recuperacionEnCurso = false;
      if (boton && boton.isConnected) boton.disabled = false;
    }
  }

  function textoWhatsApp(p) {
    var lineas = (p.detalle || []).map(function (x) { return '• ' + x.cantidad + ' × ' + x.nombre + (x.extras ? ' (' + x.extras + ')' : ''); });
    var tipo = UI.tipoEntrega(p);
    return 'Hola, acabo de hacer el pedido *' + p.numero + '* en ' + (local().nombre || '') + '.\n' + lineas.join('\n') +
      '\nTotal: ' + UI.dinero(p.total) + ' · Pago: ' + (UI.NOMBRE_PAGO[p.forma_pago] || p.forma_pago).replace(/^\S+\s/, '') +
      (tipo === 'domicilio' ? '\nDirección: ' + (p.direccion || '—') + (p.referencia ? ' (' + p.referencia + ')' : '') : tipo === 'mesa' ? '\nMesa ' + p.mesa : '\nRetiro en el local') +
      (p.hora_llegada ? '\nVentana solicitada: ' + UI.ventanaHora(p.hora_llegada, p.hora_ventana_fin, Number(cfg().ventana_minutos) || 30) + ' aprox. (por confirmar)' : '') +
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
      (p.hora_llegada ? '<p class="subtitulo">Ventana solicitada: ' + UI.esc(UI.ventanaHora(p.hora_llegada, p.hora_ventana_fin, Number(cfg().ventana_minutos) || 30)) + ' aprox. Por confirmar.</p>' : '<p class="subtitulo">Tiempo orientativo: ' + UI.esc(rangoPreparacion()) + '</p>') +
      (p.forma_pago === 'deuna' && c.deuna_qr_url ? '<div class="pago-qr"><b>Paga con Deuna</b><img src="' + UI.esc(c.deuna_qr_url) + '" alt="QR de Deuna del local" referrerpolicy="no-referrer"><small>Monto: ' + UI.dinero(p.total) + ' · Referencia: ' + UI.esc(p.numero) + '</small>' +
        '<button class="btn borde chico" type="button" id="btn-guardar-qr">💾 Guardar QR</button><small>¿Pagas desde este mismo teléfono? Guarda el QR y en Deuna elige «Escanear» → «Galería».</small></div>' : '') +
      (p.forma_pago === 'transferencia' ? '<div style="text-align:left;margin-top:12px">' + tarjetasCuentasSolo(p) + '</div>' : '') +
      (UI.esDigital(p.forma_pago) ? '<div class="politica-linea" style="text-align:left">🔒 <span><b>Tu pedido se prepara cuando confirmemos el pago en nuestra cuenta.</b> Envía el comprobante por WhatsApp para ubicarlo más rápido. Si pagas desde otro banco puede tardar un poco.</span></div>' : '') +
      '<div class="acciones" style="margin-top:16px">' +
      (UI.digitos(wa) ? '<button class="btn" type="button" id="btn-wa">💬 ' + (UI.esDigital(p.forma_pago) ? 'Enviar comprobante' : 'Avisar por WhatsApp') + '</button>' : '') +
      '<button class="btn borde" type="button" id="btn-seguir">🔎 Ver cómo va</button></div>' +
      (UI.tipoEntrega(p) === 'domicilio' && p.ubic_por_wa && UI.digitos(wa) ? '<div class="banda" style="margin-top:12px;text-align:left">💬 <span>Falta tu ubicación. Toca el botón y en el chat elige <b>📎 (o +) → Ubicación → Enviar mi ubicación actual</b>.</span></div><button class="btn bloque" type="button" id="btn-wa-ubic">📍 Enviar mi ubicación por WhatsApp</button>' : '') +
      (UI.tipoEntrega(p) !== 'domicilio' ? '<div class="qr-pedido"><img src="' + UI.esc(qrPedido) + '" alt="" width="150" height="150"><small>Muestra este código al llegar y te lo entregamos más rápido.</small></div>' : '') +
      '<button class="btn secundario bloque" type="button" id="btn-nuevo" style="margin-top:12px">Hacer otro pedido</button></div>';
    var b = $('#btn-wa'); if (b) b.addEventListener('click', function () { UI.abrirWhatsApp(wa, textoWhatsApp(p)); });
    var wu = $('#btn-wa-ubic'); if (wu) wu.addEventListener('click', function () { UI.abrirWhatsApp(wa, 'Hola, soy ' + p.cliente_nombre + '. Te envío mi ubicación para el pedido *' + p.numero + '* 👇'); });
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

  /* ---------------- 3.1.5: «Mis pedidos» del cliente (guardado liviano en su teléfono) ---------------- */
  var PASOS_SEG = ['Recibido', 'Preparando', 'En camino', 'Entregado'];
  var FINALES = ['Entregado', 'Anulado'];
  function diasHistorial() { return Math.max(1, Number(cfg().dias_historial_cliente) || 30); }
  function misPedidos() {
    var l = MEM.leer('mis_pedidos'); if (!Array.isArray(l)) l = [];
    var u = MEM.leer('ultimo_pedido'); // pedidos hechos antes de la 3.1.5
    if (u && u.numero && !l.some(function (x) { return x.n === u.numero; })) l.unshift({ n: u.numero, s: u.s || '', tel: u.telefono || '', f: u.fecha || Date.now(), t: 0, e: 'Recibido', i: [] });
    var corte = Date.now() - diasHistorial() * 86400000;
    return l.filter(function (x) { return x && x.n && (x.f || 0) >= corte; }).slice(0, 30);
  }
  function guardarMisPedidos(l) { MEM.guardar('mis_pedidos', l.slice(0, 30)); }
  function guardarMiPedido(x) { var l = misPedidos().filter(function (y) { return y.n !== x.n; }); l.unshift(x); guardarMisPedidos(l); }
  function activo(x) { return FINALES.indexOf(x.e) < 0 || (x.e === 'Entregado' && !x.cal && Date.now() - (x.fe || x.f || 0) < 6 * 3600000); }

  async function pintarSeguimiento(abrir) {
    var cont = $('#seguimiento');
    if (!cont) return;
    var lista = misPedidos();
    if (!lista.length) { cont.hidden = true; cont.innerHTML = ''; return; }
    cont.hidden = false;
    var act = lista.filter(activo), hist = lista.filter(function (x) { return !activo(x); });
    var res = {};
    if (act.length) {
      if (!cont.innerHTML) cont.innerHTML = '<div class="seg-caja"><b>Mis pedidos</b><span class="item-sub">Consultando…</span></div>';
      try {
        var conClave = act.filter(function (x) { return x.s; });
        // El servidor admite máximo diez claves por consulta: procesar por lotes.
        for (var lote = 0; lote < conClave.length; lote += 10) {
          var grupo = conClave.slice(lote, lote + 10);
          try {
            var r = await DATOS.pedir('pedidosSeguir', { s: grupo.map(function (x) { return x.s; }) });
            // Asociar por clave y no por posición: una respuesta parcial no puede
            // mostrar el pedido de otro cliente en esta pantalla.
            var porClave = {};
            (Array.isArray(r.pedidos) ? r.pedidos : []).forEach(function (p) {
              if (p && p.seguimiento) porClave[String(p.seguimiento)] = p;
            });
            grupo.forEach(function (x) {
              var encontrado = porClave[String(x.s)];
              res[x.n] = encontrado && String(encontrado.numero) === String(x.n) ? encontrado : { consulta_error: true };
            });
          } catch (e) {
            grupo.forEach(function (x) { res[x.n] = { consulta_error: true }; });
          }
        }
        for (var j = 0; j < act.length; j++) { // pedidos viejos sin clave: número + celular
          var x = act[j]; if (x.s || res[x.n]) continue;
          try { res[x.n] = await DATOS.pedir('pedidoConsultar', { numero: x.n, telefono: x.tel || (MEM.leer('cliente') || {}).telefono || '' }); } catch (e) { res[x.n] = { consulta_error: true }; }
        }
        var cambio2 = false;
        lista.forEach(function (x) {
          var p = res[x.n]; if (!p) return;
          if (p.no_existe || p.consulta_error) { return; }
          if (p.estado !== x.e) { x.e = p.estado; if (p.estado === 'Entregado') x.fe = Date.now(); cambio2 = true; }
          if (p.total && !x.t) { x.t = p.total; cambio2 = true; }
          if (p.seguimiento && !x.s) { x.s = p.seguimiento; cambio2 = true; }
          if (p.calificacion && !x.cal) { x.cal = p.calificacion; cambio2 = true; }
        });
        if (cambio2) guardarMisPedidos(lista);
        act = lista.filter(activo); hist = lista.filter(function (x) { return !activo(x); });
      } catch (err) {
        cont.innerHTML = '<div class="seg-caja"><b>Mis pedidos</b><span class="item-sub">No se pudo consultar ahora. <button class="enlace" type="button" id="seg-act">Reintentar</button></span></div>';
        $('#seg-act').addEventListener('click', function () { pintarSeguimiento(true); });
        return;
      }
    }
    // Consultar respuestas sin bloquear el seguimiento ni ocultar el último estado
    // válido cuando la bandeja de solicitudes no está disponible.
    var solicitudesPorPedido = {};
    await Promise.all(act.filter(function (x) { return res[x.n] && !res[x.n].consulta_error && !res[x.n].no_existe; }).map(async function (x) {
      try {
        var respuesta = await DATOS.pedir('pedidoCambiosConsultar', x.s ? { s: x.s } :
          { numero: x.n, telefono: x.tel || (MEM.leer('cliente') || {}).telefono || '' });
        if (respuesta.numero === x.n) solicitudesPorPedido[x.n] = respuesta.solicitudes || [];
      } catch (e) { /* Seguimiento sigue funcionando si falla la consulta de solicitudes. */ }
    }));
    cont.innerHTML = act.map(function (x) { return res[x.n] && !res[x.n].no_existe && !res[x.n].consulta_error ? tarjetaSeguimiento(res[x.n], x) + (solicitudesPorPedido[x.n] || []).slice(-3).map(function (sol) {
      return '<div class="seg-caja"><b>📝 Solicitud: ' + UI.esc(sol.tipo) + '</b>' +
        '<div class="item-sub">Estado: ' + UI.esc(sol.estado) + '</div>' +
        '<p>' + UI.esc(sol.detalle) + '</p>' +
        (sol.respuesta ? '<p><b>Respuesta del restaurante:</b> ' + UI.esc(sol.respuesta) + '</p>' : '') +
        (sol.cotizacion ? '<div class="item-sub"><b>Productos cotizados:</b> ' +
          UI.esc((sol.cotizacion.lineas || []).map(function (l) { return l.cantidad + '× ' + l.nombre +
            (l.extras && l.extras.length ? ' (' + l.extras.join(', ') + ')' : ''); }).join('; ')) + '</div>' +
          '<p><b>Adicional a confirmar: ' + UI.esc(UI.dinero(sol.cotizacion.adicional)) + '</b>' +
          ' · Total estimado: ' + UI.esc(UI.dinero(sol.cotizacion.total_estimado)) + '</p>' +
          (sol.estado === 'Cotizada'
            ? '<button class="btn chico" type="button" data-aceptar-cambio="' + UI.esc(sol.id) +
              '" data-numero-cambio="' + UI.esc(x.n) + '">Aceptar importe</button> ' +
              '<button class="btn secundario chico" type="button" data-rechazar-cambio="' + UI.esc(sol.id) +
              '" data-numero-cambio="' + UI.esc(x.n) + '">Rechazar</button>'
            : (sol.aplicado ? '<p><b>Adicional aplicado al pedido.</b> El total actualizado aparece en el seguimiento.</p>' :
              sol.estado === 'Aplicando' ? '<p><b>Aplicación en revisión.</b> El restaurante debe conciliarla antes de despachar.</p>' :
              '<p><b>Importe aceptado por ti.</b> Pendiente de gestión y verificación del pago en el restaurante.</p>'))
          : '') +
        '<small>Esta solicitud no modifica el pedido ni autoriza un cobro automático.</small></div>';
    }).join('') : '<div class="seg-caja"><b>' + UI.esc(x.n) + '</b><div class="item-sub">No se pudo actualizar el estado. Conservamos el último estado conocido: ' + UI.esc(x.e) + '.</div><button class="enlace" type="button" data-seg-act>Reintentar</button></div>'; }).join('') +
      (hist.length ? '<details class="seg-caja mis-pedidos"' + (act.length ? '' : ' open') + '><summary><b>🧾 Mis pedidos anteriores</b> <small>(' + hist.length + ')</small></summary>' +
        '<div class="lista">' + hist.map(function (x) {
          var fecha = new Date(x.f || Date.now());
          return '<div class="mp-fila"><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(x.n) + ' · ' + (x.t ? UI.esc(UI.dinero(x.t)) : '') + '</div>' +
            '<div class="item-sub">' + UI.esc(fecha.toLocaleDateString('es-EC', { day: 'numeric', month: 'short' })) + ' · ' + UI.esc(x.e) + (x.i && x.i.length ? ' · ' + UI.esc(x.i.map(function (y) { return y.c + '× ' + (y.n || ''); }).join(', ')) : '') + '</div></div>' +
            (x.i && x.i.length ? '<button class="btn secundario chico" type="button" data-repetir="' + UI.esc(x.n) + '">🔁 Repetir</button>' : '') + '</div>';
        }).join('') + '</div>' +
        '<p class="ayuda" style="margin:8px 0 4px">Tu historial se guarda solo en este teléfono y se borra solo a los ' + diasHistorial() + ' días.</p>' +
        '<button class="btn borde chico" type="button" id="mp-borrar">🗑 Borrar mi historial</button></details>' : '');
    // La confirmación del cliente se vincula a la cotización vigente y al pedido autenticado.
    ['aceptar', 'rechazar'].forEach(function (accion) {
      UI.$$('[data-' + accion + '-cambio]', cont).forEach(function (b) {
        b.addEventListener('click', function () {
          UI.trabajando(b, async function () {
            var numero = b.getAttribute('data-numero-cambio');
            var id = b.getAttribute('data-' + accion + '-cambio');
            var x = lista.filter(function (p) { return p.n === numero; })[0];
            var sol = (solicitudesPorPedido[numero] || []).filter(function (p) {
              return p.id === id && p.cotizacion && p.estado === 'Cotizada';
            })[0];
            if (!x || !sol) return UI.aviso('La cotización cambió. Actualiza tu pedido.', 'error');
            var acepta = accion === 'aceptar';
            var texto = acepta
              ? '¿Aceptas el adicional de ' + UI.dinero(sol.cotizacion.adicional) + ' para ' + numero +
                '? Total estimado: ' + UI.dinero(sol.cotizacion.total_estimado) +
                '. Esto no realiza un cargo ni modifica todavía el pedido.'
              : '¿Rechazas el adicional de ' + UI.dinero(sol.cotizacion.adicional) + '? Tu pedido original no cambiará.';
            var confirmado = await UI.confirmar(acepta ? 'Confirmar importe adicional' : 'Rechazar cotización',
              texto, acepta ? 'Sí, acepto el importe' : 'Sí, rechazar');
            if (!confirmado) return;
            try {
              var payload = x.s ? { s: x.s } : {
                numero: x.n, telefono: x.tel || (MEM.leer('cliente') || {}).telefono || ''
              };
              payload.id = sol.id;
              payload.cotizacion_id = sol.cotizacion.id;
              payload.acepta = acepta;
              var resultado = await DATOS.pedir('pedidoCambioConfirmar', payload);
              UI.aviso(resultado.estado === 'Confirmada cliente'
                ? 'Importe aceptado. Espera la verificación de pago y aplicación por el restaurante.'
                : 'Cotización rechazada; el pedido original no cambia.', 'ok');
              await pintarSeguimiento(false);
            } catch (err) {
              UI.aviso('No se registró la respuesta: ' + (err.message || 'intenta nuevamente'), 'error');
            }
          });
        });
      });
    });
    UI.$$('[data-seg-act]', cont).forEach(function (b) { b.addEventListener('click', function (e) { UI.trabajando(e.currentTarget, function () { return pintarSeguimiento(true); }); }); });
    UI.$$('[data-calificar]', cont).forEach(function (b) { b.addEventListener('click', function () { var x = lista.filter(function (y) { return y.n === b.getAttribute('data-calificar'); })[0]; if (x) calificar({ numero: x.n, telefono: x.tel || (MEM.leer('cliente') || {}).telefono || '', s: x.s }); }); });
    UI.$$('[data-comprobante]', cont).forEach(function (b) { b.addEventListener('click', function () { var p = res[b.getAttribute('data-comprobante')]; if (p) UI.abrirWhatsApp(cfg().whatsapp, 'Hola, envío el comprobante del pedido *' + p.numero + '* por ' + UI.dinero(p.total) + (p.cuenta_pago ? ' (a ' + p.cuenta_pago + ')' : '') + '. 👇'); }); });
    UI.$$('[data-escribir]', cont).forEach(function (b) { b.addEventListener('click', async function () {
      var numero = b.getAttribute('data-escribir');
      var pedido = res[numero];
      var x = lista.filter(function (y) { return y.n === numero; })[0];
      if (!x || !pedido || pedido.consulta_error || pedido.no_existe) return UI.aviso('Actualiza el estado antes de solicitar cambios.', 'error');
      var estado = pedido.estado;
      // Preguntar qué desea hacer, en vez de suponer que toda solicitud
      // es una sustitución. Cada opción tiene restricciones distintas.
      var opciones = estado === 'Recibido' ? [
        { texto: 'Cerrar', valor: null, clase: 'secundario' },
        { texto: '＋ Agregar', valor: 'agregar' },
        { texto: '↑ Aumentar', valor: 'aumentar' },
        { texto: '↔ Cambiar', valor: 'cambiar' },
        { texto: '− Quitar', valor: 'quitar' },
        { texto: '↓ Reducir', valor: 'reducir' },
        { texto: 'Cancelar', valor: 'cancelar' }
      ] : estado === 'Preparando' ? [
        { texto: 'Cerrar', valor: null, clase: 'secundario' },
        { texto: '＋ Agregar', valor: 'agregar' },
        { texto: '↑ Aumentar', valor: 'aumentar' }
      ] : [
        { texto: 'Cerrar', valor: null, clase: 'secundario' },
        { texto: 'Consultar opciones', valor: 'agregar' }
      ];
      var tipo = await UI.ventana({
        icono: '📝', titulo: '¿Qué necesitas hacer?',
        texto: estado === 'En camino' ? 'El motorizado ya salió. Los adicionales necesitan otro envío o retiro.' :
          estado === 'Preparando' ? 'Ya están preparando tu pedido. Solo puedes consultar adicionales o aumentar cantidades.' :
          estado === 'Recibido' ? 'Selecciona la modificación que quieres solicitar. Ningún cambio se aplica sin aprobación del restaurante.' :
          'Este pedido ya no admite cambios. Puedes consultar las alternativas.',
        botones: opciones
      });
      if (!tipo) return;
      var politica;
      try {
        b.disabled = true;
        politica = await DATOS.pedir('pedidoPoliticaCambios', x.s ? { s: x.s, tipo: tipo } : { numero: numero, telefono: x.tel || (MEM.leer('cliente') || {}).telefono || '', tipo: tipo });
      } catch (err) {
        UI.aviso('No se pudo verificar si el restaurante acepta cambios. Intenta nuevamente.', 'error');
        return;
      } finally { b.disabled = false; }
      if (politica.numero !== numero) return UI.aviso('No se pudo validar el pedido. Actualiza el seguimiento.', 'error');
      var nombres = { agregar: 'agregar productos', aumentar: 'aumentar cantidades', cambiar: 'cambiar productos', quitar: 'quitar productos', reducir: 'reducir cantidades', cancelar: 'cancelar el pedido' };
      if (politica.permitido) {
        var detalle = await UI.pedirDato({
          icono: '📝', titulo: 'Solicitar cambio',
          etiqueta: 'Productos, cantidades y detalles',
          ph: 'Ejemplo: agregar 2 jugos de naranja',
          modo: 'text', boton: 'Enviar solicitud',
          texto: 'El restaurante debe confirmar el cambio antes de aplicarlo.',
          validar: function (v) { return v.trim().length >= 5 && v.length <= 500 ? '' : 'Describe el cambio entre 5 y 500 caracteres.'; }
        });
        if (detalle === null || detalle === undefined) return;
        detalle = String(detalle).trim();
        if (detalle.length < 5 || detalle.length > 500) return UI.aviso('Describe el cambio entre 5 y 500 caracteres.', 'error');
        try {
          b.disabled = true;
          var solicitud = await DATOS.pedir('pedidoCambioSolicitar', x.s ?
            { s: x.s, tipo: tipo, detalle: detalle } :
            { numero: numero, telefono: x.tel || (MEM.leer('cliente') || {}).telefono || '', tipo: tipo, detalle: detalle });
          if (solicitud.estado === 'Pendiente') {
            UI.aviso(solicitud.repetida ? 'Tu solicitud ya está pendiente de respuesta.' : 'Solicitud enviada al restaurante. Espera su confirmación; tu pedido no cambió todavía.', 'exito');
            return;
          }
        } catch (err) {
          UI.aviso('No pudimos registrar la solicitud: ' + (err.message || 'intenta nuevamente'), 'error');
          return;
        } finally { b.disabled = false; }
      }
      var texto = 'Quisiera ' + (nombres[tipo] || 'consultar opciones') + '. ' + politica.mensaje +
        (politica.permitido ? ' Por favor, confirmen disponibilidad, importe y horario antes de aplicar cualquier modificación.' : ' Quisiera conocer las opciones disponibles.');
      var telefonoLocal = cfg().whatsapp;
      if (!UI.digitos(telefonoLocal)) return UI.aviso('Este restaurante no tiene WhatsApp configurado para solicitudes.', 'error');
      UI.abrirWhatsApp(telefonoLocal, 'Hola, sobre mi pedido *' + numero + '* (' + politica.estado + '): ' + texto + ' Entiendo que este mensaje no modifica el pedido ni autoriza cobros.');
    }); });
    UI.$$('[data-repetir]', cont).forEach(function (b) { b.addEventListener('click', function () { var x = lista.filter(function (y) { return y.n === b.getAttribute('data-repetir'); })[0]; repetirDe(x); }); });
    var bb = $('#mp-borrar'); if (bb) bb.addEventListener('click', async function () {
      var ok = await UI.confirmar('¿Borrar tu historial?', 'Se borra la lista de pedidos de este teléfono. Tus pedidos ya hechos no se cancelan.', 'Sí, borrar', true);
      if (!ok) return;
      guardarMisPedidos(misPedidos().filter(activo)); MEM.guardar('ultimo_pedido', null); UI.aviso('Historial borrado.', 'ok'); pintarSeguimiento();
    });
    if (abrir) cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Orientación honesta mientras no exista una operación de cambios autorizada en el servidor.
  function mensajeCambioPedido(estado) {
    if (estado === 'Recibido') return '¿Quieres modificar tu pedido? Solicítalo antes de que el restaurante empiece a prepararlo. El cambio requiere confirmación.';
    if (estado === 'Preparando') return '¿Quieres agregar productos? Consulta su disponibilidad y precio. No se pueden quitar productos que ya están en preparación.';
    if (estado === 'En camino') return 'Tu pedido ya salió. El motorizado no debe regresar por productos adicionales; consulta un nuevo envío o retiro.';
    return 'Consulta cualquier cambio directamente con el restaurante.';
  }

  /* Tarjeta de seguimiento de un pedido en curso. */
  function tarjetaSeguimiento(r, x) {
    var tipo = r.tipo_entrega;
    var pasos = tipo === 'domicilio' ? PASOS_SEG : ['Recibido', 'Preparando', 'Entregado'];
    var i = r.estado === 'Anulado' ? -1 : pasos.indexOf(r.estado);
    var nombreFin = tipo === 'domicilio' ? 'Entregado' : 'Listo';
    var digital = UI.esDigital(r.forma_pago) && r.estado !== 'Anulado';
    return '<div class="seg-caja"><div class="seg-cabeza"><b>Tu pedido ' + UI.esc(r.numero) + '</b>' + UI.chipEstado(r.estado) +
      '<button class="btn secundario chico" type="button" data-seg-act aria-label="Actualizar">↻</button></div>' +
      (r.estado === 'Anulado' ? '<p class="item-sub">' + UI.esc(r.motivo_anulacion || 'Fue anulado. Escríbenos por WhatsApp si tienes dudas.') + '</p>' :
        '<div class="seg-linea">' + pasos.map(function (n, k) { return '<span class="' + (k <= i ? 'hecho' : '') + (k === i ? ' actual' : '') + '"><i></i>' + UI.esc(k === pasos.length - 1 ? nombreFin : n) + '</span>'; }).join('') + '</div>' +
        (r.estado !== 'Entregado' ? '<p class="item-sub" style="margin:6px 0 0">' +
          (r.ventana_fin ? 'Ventana solicitada: <b>' + UI.esc(UI.ventanaHora(r.hora_estimada, r.ventana_fin, Number(cfg().ventana_minutos) || 30)) + ' aprox.</b> Sujeta a confirmación.' :
            r.estado === 'En camino' ? (r.eta_moto ? '<b>Llega en unos ' + r.eta_moto.desde + ' a ' + r.eta_moto.hasta + ' min.</b> Tiempo orientativo; puede variar.' : (r.en_camino ? 'Salió hace ' + UI.minutosDesde(r.en_camino) + ' min. ' + (UI.minutosDesde(r.en_camino) > (Number(cfg().minutos_preparacion) || 20) + 30 ? 'Hay más tráfico de lo normal; seguimos atentos a tu entrega.' : 'Te avisaremos si hay cambios.') : 'Pronto estará en camino.')) :
            'Tiempo aproximado: <b>' + ((Number(r.tiempo_preparacion) || 20) + (Number(r.tiempo_zona) || 0)) + ' a ' + ((Number(r.tiempo_preparacion) || 20) + (Number(r.tiempo_zona) || 0) + 10) + ' min.</b> Puede variar') + '</p>' : '')) +
      (digital ? (r.pago_verificado
        ? '<div class="pago-estado ok">✅ <span><b>Pago confirmado en nuestra cuenta.</b>' + (r.estado === 'Recibido' ? ' El restaurante ya puede revisar tu pedido.' : '') + '</span></div>'
        : '<div class="pago-estado espera">⏳ <span><b>Pago por confirmar.</b> Tu pedido se prepara cuando confirmemos el pago de <b>' + UI.esc(UI.dinero(r.total)) + '</b> en nuestra cuenta' + (r.cuenta_pago ? ' (' + UI.esc(r.cuenta_pago) + ')' : '') + '. Si pagaste desde otro banco puede tardar un poco.</span></div>' +
          (r.forma_pago === 'transferencia' ? tarjetasCuentasSolo(r) : '') +
          (UI.digitos(cfg().whatsapp) ? '<button class="btn chico bloque" type="button" data-comprobante="' + UI.esc(r.numero) + '" style="margin-top:8px">💬 Enviar comprobante por WhatsApp</button>' : '')) : '') +
      (r.motorizado ? tarjetaMoto(r.motorizado) : '') +
      (r.codigo_entrega ? '<div class="codigo-entrega"><span>🔢 Tu código de entrega</span><b>' + UI.esc(r.codigo_entrega) + '</b><small>Dáselo al motorizado solo cuando tengas tu pedido en la mano.</small></div>' : '') +
      (r.estado === 'Entregado' && !r.calificacion ? '<button class="btn chico bloque" type="button" data-calificar="' + UI.esc(r.numero) + '" style="margin-top:10px">⭐ ¿Cómo estuvo? Califícanos</button>' : '') +
      (r.sellos_meta ? '<div class="sellos" title="Tarjeta de sellos">' + sellosHtml(r.sellos, r.sellos_meta) + '</div>' : '') +
      (FINALES.indexOf(r.estado) < 0 && UI.digitos(cfg().whatsapp) ? '<p class="ayuda" style="margin:8px 0 0">' + UI.esc(mensajeCambioPedido(r.estado)) + ' <button class="enlace" type="button" data-escribir="' + UI.esc(r.numero) + '">Consultar por WhatsApp</button></p>' : '') +
      '</div>';
  }

  /* Repetir un pedido del historial (solo platos que siguen disponibles en ese local). */
  function repetirDe(x) {
    if (!x || !x.i) return;
    if (envioPendiente) return UI.aviso('Primero recupera o verifica el pedido pendiente antes de repetir otro.', 'error');
    if (x.l && x.l !== localId && M.locales.some(function (l) { return l.id === x.l; })) {
      // Nunca mezclar productos de dos restaurantes al repetir un pedido histórico.
      if (cantidadTotal()) return UI.aviso('Tu carrito tiene productos de otro local. Vacíalo antes de repetir este pedido.', 'error');
      if (!localesConMenu().some(function (l) { return l.id === x.l; })) return UI.aviso('El restaurante de ese pedido ya no recibe pedidos.', 'error');
      localId = x.l; categoria = ''; busqueda = ''; entrega.zona = ''; entrega.hora = ''; ubic = null;
      MEM.guardar('pedir_local', localId); marcarAgotados();
    }
    var lista = x.i.map(function (y) { return { plato_id: y.p, cantidad: y.c, extras: y.x || [] }; }).filter(function (y) { var p = plato(y.plato_id); return p && !p.agotado && (p.local_id === 'TODOS' || p.local_id === localId); });
    if (!lista.length) return UI.aviso('Esos platos ya no están disponibles.', 'error');
    if (paso !== 1) { paso = 1; pintarMenu(); }
    repetir(lista);
    // repetir() ya informa si algún producto fue omitido; evitar avisos duplicados.
  }

  /* 3.1.5: enlace personal «Mis pedidos» (?c=…): trae el historial a este teléfono. */
  async function traerMisPedidos(c) {
    try {
      var r = await DATOS.pedir('misPedidos', { c: c });
      var l = misPedidos();
      r.pedidos.forEach(function (p) {
        if (l.some(function (x) { return x.n === p.numero; })) return;
        l.push({ n: p.numero, s: p.s, f: p.creado ? Date.parse(p.creado) : Date.now(), t: p.total, e: p.estado, l: p.local_id, i: p.items.map(function (y) { return { p: y.p, c: y.c, n: y.n }; }) });
      });
      l.sort(function (a, b) { return (b.f || 0) - (a.f || 0); });
      guardarMisPedidos(l);
      UI.aviso('¡Hola ' + r.nombre + '! Aquí están tus pedidos.', 'ok');
    } catch (err) { UI.aviso(err.message, 'error'); }
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
      await DATOS.pedir('pedidoCalificar', { numero: u.numero, telefono: u.telefono || '', s: u.s || '', estrellas: estrellas, comentario: comentario }, { guardar: true });
      UI.aviso('¡Gracias por calificarnos!', 'ok');
      pintarSeguimiento();
    } catch (err) { UI.error('No se envió', err.message); }
  }

  /* 3.1.3: redes y página web del negocio (solo las que el dueño llenó). */
  function pintarRedes() {
    var c = cfg(), redes = [['red_instagram', 'Instagram', '📸'], ['red_facebook', 'Facebook', '👍'], ['red_tiktok', 'TikTok', '🎵'], ['pagina_web', 'Página web', '🌐']]
      .filter(function (x) { return /^https:\/\//.test(c[x[0]] || ''); });
    var caja = $('#pedir-redes');
    if (!caja) {
      caja = document.createElement('nav'); caja.id = 'pedir-redes'; caja.className = 'pedir-redes'; caja.setAttribute('aria-label', 'Redes del negocio');
      var b = $('#pedir-bienvenida'); if (b && b.parentNode) b.parentNode.insertBefore(caja, b.nextSibling);
    }
    caja.hidden = !redes.length;
    caja.innerHTML = redes.map(function (x) { return '<a href="' + UI.esc(c[x[0]]) + '" target="_blank" rel="noopener"><span aria-hidden="true">' + x[2] + '</span>' + x[1] + '</a>'; }).join('');
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
    /* 3.1.5: botones «📋» de las cuentas bancarias */
    document.addEventListener('click', function (e) { var b = e.target.closest('[data-copiar]'); if (b) { e.preventDefault(); UI.copiar(b.getAttribute('data-copiar')); } });
    var pp = $('#pie-politicas'); if (pp) pp.addEventListener('click', verPoliticas);
    $('#btn-ver-pedido').addEventListener('click', async function () {
      if (!cantidadTotal()) return;
      await sugerir();
      irA(2);
    });
    iniciar();
  });
})(window);
