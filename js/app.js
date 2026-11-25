/**
 * ============================================================
 * APP — arranque, ingreso, selector de local, navegación por rol.
 * Sin refresco automático: cada pantalla tiene su botón Actualizar.
 * ============================================================
 */
(function (global) {
  'use strict';

  var UI = global.UI, DATOS = global.DATOS, MEM = global.APP_MEMORIA;

  var APP = {
    sesion: null,
    publico: {},
    locales: [],
    local: 'TODOS',
    vistas: {},          // cada módulo se registra aquí: APP.vistas.config = { titulo, icono, roles, pintar }
    vistaActual: ''
  };
  global.APP = APP;

  var NOMBRE_ROL = { dueno: 'Dueño', cajero: 'Cajero / cocina', motorizado: 'Motorizado' };
  APP.nombreRol = function (r) { return NOMBRE_ROL[r] || r; };

  /* ---------- Vistas base de la fase 1 ---------- */
  APP.vistas.inicio = {
    titulo: 'Inicio', icono: '🏠', orden: 1, roles: ['dueno', 'cajero', 'motorizado'],
    pintar: function (cont) {
      var s = APP.sesion;
      var modulos = [
        ['🧾', 'Pedidos', 'Recibir, preparar y despachar', ['dueno', 'cajero'], 'pedidos'],
        ['🍔', 'Menú', 'Platos, precios, fotos y extras', ['dueno', 'cajero'], 'menu'],
        ['🛵', 'Motorizados', 'Fichas, entregas y efectivo', ['dueno'], 'motorizados'],
        ['📡', 'Monitoreo', 'Motorizados en vivo y alertas', ['dueno', 'cajero'], 'monitoreo'],
        ['📍', 'Mis entregas', 'Tus pedidos asignados', ['motorizado'], 'entregas'],
        ['💵', 'Caja', 'Apertura, cobros y cierre', ['dueno', 'cajero'], 'caja'],
        ['📦', 'Inventario', 'Insumos, compras y mínimos', ['dueno', 'cajero'], 'inventario'],
        ['📊', 'Reportes', 'Ventas, platos y horas pico', ['dueno'], 'reportes'],
        ['🏍️', 'Informe motorizados', 'Ranking, caja, pagos y recorridos', ['dueno'], 'informeMotos']
      ].filter(function (m) { return m[3].indexOf(s.rol) >= 0; });

      var lic = APP.publico.licencia || {};
      if (s.rol === 'dueno' && APP.guiaInicio) setTimeout(function () { APP.guiaInicio(UI.$('#guia-inicio')); }, 0);
      cont.innerHTML =
        (lic.estado === 'suspendida' ? '<div class="banda error">⛔ <span>La licencia está suspendida' + (lic.vencida ? ' (venció el ' + UI.esc(lic.vence) + ')' : '') + '. No se recibirán pedidos nuevos; sus datos están a salvo.</span></div>' : '') +
        '<div class="tarjeta bienvenida"><h2>Hola, ' + UI.esc(s.nombre.split(' ')[0]) + ' 👋</h2>' +
        '<p>' + UI.esc(APP.nombreRol(s.rol)) + ' · ' + UI.esc(APP.nombreLocal(APP.local)) + '</p></div>' +
        (s.rol !== 'motorizado' ? '<button class="btn bloque btn-enlace-clientes" type="button" id="btn-enlace-clientes"><span>📤</span><span><b>Enlace para clientes</b><small>Compártelo por WhatsApp, Instagram o QR para que pidan</small></span></button>' : '') +
        (s.rol === 'dueno' ? '<div id="guia-inicio"></div>' : '') +
        '<h3 style="margin:22px 0 10px">Módulos</h3>' +
        '<div class="rejilla r3">' + modulos.map(function (m) {
          var lista = !!APP.vistas[m[4]];
          return '<div class="tarjeta modulo' + (lista ? ' enlace' : '') + '"' + (lista ? ' role="button" tabindex="0" data-ir="' + m[4] + '"' : '') + '><div class="modulo-ico" aria-hidden="true">' + m[0] + '</div>' +
            '<div style="flex:1;min-width:0"><h3>' + UI.esc(m[1]) + '</h3><p>' + UI.esc(m[2]) + '</p></div>' +
            (lista ? '<span aria-hidden="true" style="font-size:22px;color:var(--texto-2)">›</span>' : '<span class="etiqueta">Próximamente</span>') + '</div>';
        }).join('') + '</div>';
      var be = UI.$('#btn-enlace-clientes', cont);
      if (be) be.addEventListener('click', function () {
        var p = APP.publico || {};
        UI.compartirEnlace({ nombre: p.negocio_nombre || 'Haz tu pedido', subtitulo: APP.local && APP.local !== 'TODOS' ? APP.nombreLocal(APP.local) : '', enlace: UI.enlacePedir(APP.local && APP.local !== 'TODOS' ? { local: APP.local } : {}), logo: p.logo_url });
      });
      UI.$$('[data-ir]', cont).forEach(function (el) {
        el.addEventListener('click', function () { APP.ir(el.getAttribute('data-ir')); });
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); APP.ir(el.getAttribute('data-ir')); } });
      });
    }
  };

  APP.vistas.cuenta = {
    titulo: 'Mi cuenta', icono: '👤', orden: 90, roles: ['dueno', 'cajero', 'motorizado'],
    pintar: function (cont) {
      var s = APP.sesion;
      var tema = document.documentElement.getAttribute('data-tema');
      cont.innerHTML =
        '<h1 class="titulo">Mi cuenta</h1><p class="subtitulo">' + UI.esc(s.nombre) + ' · ' + UI.esc(APP.nombreRol(s.rol)) + '</p>' +
        '<div class="rejilla">' +
        '<section class="tarjeta" id="panel-mi-clave" hidden><h3 style="margin-top:0">Seguridad</h3><button class="btn borde bloque" id="abrir-mi-clave" type="button">Cambiar mi clave</button>' +
        '<form id="form-mi-clave" autocomplete="off" hidden>' +
        '<div class="campo"><label for="mc-actual">Clave actual</label><input class="entrada" id="mc-actual" name="actual" type="password" autocomplete="current-password" required></div>' +
        '<div class="campo"><label for="mc-nueva">Clave nueva</label><input class="entrada" id="mc-nueva" name="nueva" type="password" minlength="6" autocomplete="new-password" required><span class="ayuda">Mínimo 6 caracteres.</span></div>' +
        '<button class="btn bloque" type="submit">Guardar clave</button><button class="btn secundario bloque" id="cancelar-mi-clave" type="button">Cancelar</button></form></section>' +
        '<div class="tarjeta"><h3 style="margin-top:0">Apariencia</h3>' +
        '<label class="interruptor"><input type="checkbox" id="tema-oscuro"' + (tema === 'oscuro' ? ' checked' : '') + '> Modo oscuro</label>' +
        '<hr style="border:0;border-top:1px solid var(--borde);margin:14px 0">' +
        '<button class="btn borde bloque" id="btn-salir" type="button">🚪 Cerrar sesión</button></div>' +
        '</div>';

      UI.$('#tema-oscuro', cont).addEventListener('change', function (e) { UI.tema(e.target.checked ? 'oscuro' : 'claro'); });
      UI.$('#btn-salir', cont).addEventListener('click', APP.salir);
      var panel = UI.$('#panel-mi-clave', cont), form = UI.$('#form-mi-clave', cont), abrir = UI.$('#abrir-mi-clave', cont);
      function cerrarClave() { form.reset(); form.hidden = true; abrir.hidden = false; }
      abrir.addEventListener('click', function () { abrir.hidden = true; form.hidden = false; });
      UI.$('#cancelar-mi-clave', cont).addEventListener('click', cerrarClave);
      // No confiar en permisos guardados localmente: consultar cada vez que se abre Mi cuenta.
      DATOS.pedir('sesion', {}).then(function (r) {
        if (APP.sesion === s && APP.vistaActual === 'cuenta' && panel.isConnected) panel.hidden = !(r.puede_cambiar_clave === true);
      }).catch(function () {});
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var f = e.target, boton = f.querySelector('button[type=submit]');
        var datos = UI.leerFormulario(f);
        if (datos.nueva.length < 6) return UI.aviso('La clave nueva debe tener al menos 6 caracteres.', 'error');
        UI.trabajando(boton, async function () {
          try {
            await DATOS.pedir('miClave', datos, { guardar: true });
            cerrarClave();
            UI.aviso('Clave actualizada.', 'ok');
          } catch (err) {
            if (err.codigo === 'PERMISO') { cerrarClave(); panel.hidden = true; }
            UI.error('No se cambió la clave', err.message);
          }
        });
      });
    }
  };

  /* ---------- Locales ---------- */
  APP.nombreLocal = function (id) {
    if (id === 'TODOS') return 'Todos los locales';
    var l = APP.locales.filter(function (x) { return x.id === id; })[0];
    return l ? l.nombre : '—';
  };

  APP.cargarLocales = async function () {
    var r = await DATOS.pedir('localesListar', {});
    APP.locales = r.locales || [];
    pintarSelectorLocal();
  };

  function pintarSelectorLocal() {
    var sel = UI.$('#selector-local');
    if (!sel) return;
    var s = APP.sesion;
    var activos = APP.locales.filter(function (l) { return l.activo; });
    if (s.rol === 'dueno') {
      sel.innerHTML = '<option value="TODOS">Todos</option>' + activos.map(function (l) {
        return '<option value="' + UI.esc(l.id) + '">' + UI.esc(l.nombre) + '</option>';
      }).join('');
      var guardado = MEM.leer('local');
      APP.local = (guardado === 'TODOS' || activos.some(function (l) { return l.id === guardado; })) ? guardado : 'TODOS';
      sel.disabled = false;
    } else {
      APP.local = s.local_id;
      sel.innerHTML = '<option value="' + UI.esc(s.local_id) + '">' + UI.esc(APP.nombreLocal(s.local_id)) + '</option>';
      sel.disabled = true;
    }
    sel.value = APP.local;
  }

  /* ---------- Navegación ---------- */
  function vistasPermitidas() {
    var rol = APP.sesion.rol;
    return Object.keys(APP.vistas)
      .filter(function (k) { return APP.vistas[k].roles.indexOf(rol) >= 0; })
      .sort(function (a, b) { return (APP.vistas[a].orden || 50) - (APP.vistas[b].orden || 50); });
  }

  function pintarNavegacion() {
    var nav = UI.$('#navegacion');
    nav.innerHTML = vistasPermitidas().map(function (k) {
      var v = APP.vistas[k];
      return '<button class="nav-btn" type="button" data-vista="' + k + '"><span class="ico" aria-hidden="true">' + v.icono + '</span>' + UI.esc(v.titulo) + '</button>';
    }).join('');
  }

  function inicioPorRol(rol) { return rol === 'motorizado' ? 'entregas' : rol === 'cajero' ? 'pedidos' : 'inicio'; }
  function destinoIngreso(rol, hash, nuevoIngreso) {
    var h = String(hash || '').replace(/^#/, '');
    if (/^pedidos\?ver=PED-\d{4,}(?:&|$)/i.test(h) && (rol === 'dueno' || rol === 'cajero')) return h;
    return nuevoIngreso || !h || h === 'cuenta' ? inicioPorRol(rol) : h;
  }
  APP.parametros = {};
  APP.ir = function (clave) {
    // 3.0: «#pedidos?ver=PED-0005» (QR del pedido) → vista + parámetros.
    var partes = String(clave || '').split('?');
    clave = partes[0];
    APP.parametros = {};
    if (partes[1]) new URLSearchParams(partes[1]).forEach(function (v, k) { APP.parametros[k] = v; });
    var permitidas = vistasPermitidas();
    if (permitidas.indexOf(clave) < 0) { clave = inicioPorRol(APP.sesion.rol); APP.parametros = {}; }
    APP.vistaActual = clave;
    if (global.MIP_AVISOS) global.MIP_AVISOS.sync();
    UI.$$('#navegacion .nav-btn').forEach(function (b) {
      if (b.getAttribute('data-vista') === clave) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    var cont = UI.$('#contenido');
    cont.innerHTML = '';
    APP.vistas[clave].pintar(cont);
    if (global.location.hash !== '#' + clave) history.replaceState(null, '', '#' + clave);
    global.scrollTo(0, 0);
  };

  /* ---------- Ingreso ---------- */
  function mostrarIngreso(mensaje) {
    UI.$('#app').hidden = true;
    var ing = UI.$('#ingreso');
    ing.hidden = false;
    var banda = UI.$('#ingreso-mensaje');
    banda.hidden = !mensaje;
    banda.textContent = mensaje || '';
    setTimeout(function () { var u = UI.$('#ing-usuario'); if (u) u.focus(); }, 50);
  }

  async function entrar(ev) {
    ev.preventDefault();
    var f = ev.target, boton = f.querySelector('button[type=submit]');
    var datos = UI.leerFormulario(f);
    if (!datos.usuario || !datos.clave) return UI.aviso('Escriba su usuario y su clave.', 'error');
    if (UI.dispId) datos.disp_id = UI.dispId(); // 3.0: el bloqueo por intentos es por teléfono
    await UI.trabajando(boton, async function () {
      try {
        var r = await DATOS.pedir('login', datos, { guardar: true });
        MEM.guardar('token', r.token);
        f.reset();
        await abrirApp(r.sesion, r.publico, true);
      } catch (err) {
        UI.$('#ingreso-mensaje').hidden = false;
        UI.$('#ingreso-mensaje').textContent = err.message;
      }
    });
  }

  async function abrirApp(sesion, publico, nuevoIngreso) {
    if (/\/driver\.html$/.test(global.location.pathname) && sesion.rol !== 'motorizado') { MEM.limpiarSesion(); return mostrarIngreso('Este acceso es exclusivo para motorizados.'); }
    MEM.guardar('sesion', sesion); // para abrir sin internet (solo datos de la persona, nunca listas ajenas)
    APP.sesion = sesion;
    APP.publico = publico || {};
    if (APP.publico.zona_horaria) UI.zona = APP.publico.zona_horaria;
    UI.aplicarMarca(APP.publico);
    UI.$('#ingreso').hidden = true;
    UI.$('#app').hidden = false;
    UI.$('#usuario-chip').textContent = sesion.nombre + ' · ' + APP.nombreRol(sesion.rol);
    pintarNavegacion();
    try {
      await APP.cargarLocales();
    } catch (err) {
      UI.aviso('No se pudieron cargar los locales: ' + err.message, 'error');
    }
    APP.ir(destinoIngreso(sesion.rol, global.location.hash, nuevoIngreso));
  }

  APP.salir = async function () {
    var ok = await UI.confirmar('¿Cerrar sesión?', 'Tendrá que ingresar de nuevo con su usuario y clave.', 'Cerrar sesión');
    if (!ok) return;
    try { await DATOS.pedir('cerrarSesion', {}, { guardar: true }); } catch (e) { /* se cierra igual en este equipo */ }
    MEM.limpiarSesion();
    if (APP.limpiarConfiguracion) APP.limpiarConfiguracion();
    APP.sesion = null;
    if (global.MIP_AVISOS) global.MIP_AVISOS.reset();
    APP.locales = [];
    APP.local = 'TODOS';
    history.replaceState(null, '', global.location.pathname + global.location.search);
    mostrarIngreso('');
  };

  /* ---------- Arranque ---------- */
  function pantallaBloqueada(titulo, texto, enlace) {
    document.body.innerHTML =
      '<main class="ingreso"><div class="ingreso-caja tarjeta" style="text-align:center">' +
      '<div style="font-size:44px">🔧</div><h1 style="font-size:22px">' + UI.esc(titulo) + '</h1>' +
      '<p class="subtitulo">' + UI.esc(texto) + '</p>' +
      (enlace ? '<a class="btn bloque" href="' + UI.esc(enlace[1]) + '">' + UI.esc(enlace[0]) + '</a>' : '') +
      '</div></main>';
  }

  async function arrancar() {
    UI.tema();
    var marcaGuardada = MEM.leer('marca');
    if (marcaGuardada) UI.aplicarMarca(marcaGuardada);

    if (!global.APP_CONFIG.configurada) {
      return pantallaBloqueada('Instalación sin configurar', 'Falta la dirección del servidor de este negocio en js/config.js. Ningún dato se envió a ningún lado.', ['Ir al instalador', 'instalar.html']);
    }

    UI.$('#form-ingreso').addEventListener('submit', entrar);
    UI.$('#ver-clave').addEventListener('click', function () {
      var c = UI.$('#ing-clave');
      c.type = c.type === 'password' ? 'text' : 'password';
    });
    UI.$('#selector-local').addEventListener('change', function (e) {
      APP.local = e.target.value;
      MEM.guardar('local', APP.local);
      APP.ir(APP.vistaActual || 'inicio'); // al cambiar de local se limpia y se repinta la vista
    });
    UI.$('#navegacion').addEventListener('click', function (e) {
      var b = e.target.closest('[data-vista]');
      if (b) APP.ir(b.getAttribute('data-vista'));
    });
    global.addEventListener('app:sesion-terminada', function () {
      if (APP.sesion) { APP.sesion = null; mostrarIngreso('Su sesión terminó. Ingrese de nuevo.'); }
    });

    var estado;
    try {
      estado = await DATOS.estado();
    } catch (err) {
      if (MEM.leer('token') && MEM.leer('sesion')) {
        // Sin internet: se abre con lo último conocido; guardar fallará con aviso claro.
        UI.aviso('Sin conexión. Mostrando la última información.', 'error');
        return abrirApp(MEM.leer('sesion'), MEM.leer('marca'));
      }
      return mostrarIngreso('Sin conexión con el servidor. Revise su internet y vuelva a abrir.');
    }
    if (!estado.instalado) {
      return pantallaBloqueada('Falta instalar', 'El servidor está listo, pero el sistema aún no se instaló en la hoja de este negocio.', ['Abrir el instalador', 'instalar.html']);
    }
    MEM.guardar('marca', Object.assign({}, estado.config, { licencia: estado.licencia }));
    UI.aplicarMarca(estado.config);

    if (MEM.leer('token')) {
      try {
        var r = await DATOS.pedir('sesion', {});
        MEM.guardar('sesion', r.sesion);
        return abrirApp(r.sesion, r.publico);
      } catch (err) {
        if (err.codigo !== 'SESION' && MEM.leer('sesion')) return abrirApp(MEM.leer('sesion'), MEM.leer('marca'));
      }
    }
    mostrarIngreso('');
  }

  document.addEventListener('DOMContentLoaded', arrancar);
})(window);
