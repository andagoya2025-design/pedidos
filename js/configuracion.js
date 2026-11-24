/**
 * ============================================================
 * CONFIGURACIÓN (solo dueño): negocio, locales, usuarios,
 * licencia y bitácora. Cada pestaña tiene su botón Actualizar.
 * ============================================================
 */
(function (global) {
  'use strict';

  var UI = global.UI, DATOS = global.DATOS, APP = global.APP;
  var pestanaActual = 'negocio';
  var cache = { config: null, usuarios: null };

  var PESTANAS = [
    ['negocio', '🏪 Negocio'],
    ['locales', '📍 Locales'],
    ['usuarios', '👥 Usuarios'],
    ['licencia', '🔑 Licencia'],
    ['bitacora', '📜 Bitácora']
  ];

  APP.vistas.config = {
    titulo: 'Configuración', icono: '⚙️', orden: 80, roles: ['dueno'],
    pintar: function (cont) {
      cont.innerHTML =
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
        '<h1 class="titulo" style="flex:1">Configuración</h1>' +
        '<button class="btn secundario chico" id="cfg-actualizar" type="button">↻ Actualizar</button></div>' +
        '<p class="subtitulo">Todo lo del negocio se cambia aquí; nada está fijo en el programa.</p>' +
        '<div class="pestanas" role="tablist">' + PESTANAS.map(function (p) {
          return '<button class="pestana" role="tab" type="button" data-p="' + p[0] + '" aria-selected="' + (p[0] === pestanaActual) + '">' + p[1] + '</button>';
        }).join('') + '</div><div id="cfg-cuerpo"></div>';

      UI.$('.pestanas', cont).addEventListener('click', function (e) {
        var b = e.target.closest('[data-p]');
        if (!b) return;
        pestanaActual = b.getAttribute('data-p');
        UI.$$('.pestana', cont).forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
        pintarPestana(false);
      });
      UI.$('#cfg-actualizar', cont).addEventListener('click', function (e) {
        UI.trabajando(e.currentTarget, function () { return pintarPestana(true); });
      });
      pintarPestana(false);
    }
  };

  function cuerpo() { return UI.$('#cfg-cuerpo'); }

  async function pintarPestana(forzar) {
    var c = cuerpo();
    if (!c) return;
    c.innerHTML = UI.esqueleto(3);
    try {
      if (pestanaActual === 'negocio') await pintarNegocio(forzar);
      else if (pestanaActual === 'locales') await pintarLocales(forzar);
      else if (pestanaActual === 'usuarios') await pintarUsuarios(forzar);
      else if (pestanaActual === 'licencia') await pintarLicencia(forzar);
      else if (pestanaActual === 'bitacora') await pintarBitacora();
    } catch (err) {
      c.innerHTML = '<div class="banda error">⚠️ <span>' + UI.esc(err.message) + '</span></div>';
    }
  }

  async function traerConfig(forzar) {
    if (!cache.config || forzar) cache.config = await DATOS.pedir('configObtener', {});
    return cache.config;
  }

  /* ---------------- Negocio ---------------- */
  function campo(id, etiqueta, valor, extra) {
    extra = extra || {};
    return '<div class="campo"><label for="cf-' + id + '">' + UI.esc(etiqueta) + '</label>' +
      '<input class="entrada" id="cf-' + id + '" name="' + id + '" value="' + UI.esc(valor) + '"' +
      (extra.tipo ? ' type="' + extra.tipo + '"' : '') + (extra.modo ? ' inputmode="' + extra.modo + '"' : '') +
      (extra.ph ? ' placeholder="' + UI.esc(extra.ph) + '"' : '') + '>' +
      (extra.ayuda ? '<span class="ayuda">' + UI.esc(extra.ayuda) + '</span>' : '') + '</div>';
  }

  function campoColor(id, etiqueta, valor) {
    return '<div class="campo"><label for="cf-' + id + '">' + UI.esc(etiqueta) + '</label><div class="color-campo">' +
      '<input type="color" id="cf-' + id + '" name="' + id + '" value="' + UI.esc(valor) + '">' +
      '<span class="ayuda">' + UI.esc(valor) + '</span></div></div>';
  }

  async function pintarNegocio(forzar) {
    var r = await traerConfig(forzar);
    var c = r.config;
    cuerpo().innerHTML =
      '<form id="form-negocio" class="rejilla" autocomplete="off">' +
      '<div class="tarjeta"><h3 style="margin-top:0">Marca</h3>' +
      campo('negocio_nombre', 'Nombre del negocio', c.negocio_nombre) +
      '<div class="campo"><label for="cf-logo-archivo">Logo</label><div class="item" style="padding:8px"><div class="miniatura" id="cf-logo-prev">' + (c.logo_url ? '<img src="' + UI.esc(c.logo_url) + '" alt="" referrerpolicy="no-referrer">' : '🏷️') + '</div>' +
      '<div class="item-cuerpo"><input class="entrada" id="cf-logo-archivo" type="file" accept="image/*"><span class="ayuda">Desde el teléfono o la computadora. Sale en la app, en el menú de los clientes y en los códigos QR.</span></div></div></div>' +
      campo('logo_url', 'O enlace del logo', c.logo_url, { ph: 'https://…', ayuda: 'Imagen de Google Drive compartida o cualquier enlace público.' }) +
      '<div class="fila-campos">' + campoColor('color_primario', 'Color principal', c.color_primario) + campoColor('color_acento', 'Color de acento', c.color_acento) + '</div>' +
      campo('mensaje_bienvenida', 'Mensaje para el cliente', c.mensaje_bienvenida) + '</div>' +
      '<div class="tarjeta"><h3 style="margin-top:0">Contacto y región</h3>' +
      campo('whatsapp', 'WhatsApp del negocio', c.whatsapp, { modo: 'tel', ph: '0991234567' }) +
      '<div class="fila-campos">' +
      campo('ciudad', 'Ciudad', c.ciudad) +
      campo('pais_codigo', 'Código de país', c.pais_codigo, { modo: 'numeric', ayuda: 'Ecuador: 593' }) +
      campo('moneda', 'Moneda', c.moneda, { ayuda: 'USD' }) +
      campo('zona_horaria', 'Zona horaria', c.zona_horaria, { ayuda: 'Ecuador: America/Guayaquil' }) +
      campo('iva_porcentaje', 'IVA (%)', c.iva_porcentaje, { modo: 'decimal' }) +
      '<div class="campo"><label for="cf-precios_incluyen_iva">Precios con IVA incluido</label><select class="entrada" id="cf-precios_incluyen_iva" name="precios_incluyen_iva">' +
      '<option value="SI"' + (c.precios_incluyen_iva === 'SI' ? ' selected' : '') + '>Sí</option><option value="NO"' + (c.precios_incluyen_iva === 'NO' ? ' selected' : '') + '>No</option></select></div>' +
      campo('hora_cierre_dia', 'Hora de cierre del día', c.hora_cierre_dia, { tipo: 'time', ayuda: 'Lo vendido antes de esta hora cuenta para el día anterior.' }) +
      '</div></div>' +
      '<div style="grid-column:1/-1"><button class="btn bloque" type="submit">Guardar cambios</button></div>' +
      '</form>';

    var f = UI.$('#form-negocio');
    UI.$('#cf-logo-archivo', f).addEventListener('change', async function (e) {
      var archivo = e.target.files[0]; if (!archivo) return;
      try {
        var base64 = await UI.leerFoto(archivo, 512, { cuadrado: true });
        UI.$('#cf-logo-prev').innerHTML = '<img src="' + UI.esc(base64) + '" alt="">';
        UI.aviso('Subiendo el logo…', '');
        var s = await DATOS.pedir('fotoSubir', { foto: base64 }, { guardar: true });
        UI.$('#cf-logo_url', f).value = s.url;
        // 3.1.5: el logo se guarda al instante (no hace falta «Guardar cambios»)
        var rg = await DATOS.pedir('configGuardar', { config: { logo_url: s.url } }, { guardar: true });
        if (cache.config && rg.config) cache.config.config = rg.config;
        APP.publico.logo_url = s.url; UI.aplicarMarca(APP.publico); global.APP_MEMORIA.guardar('marca', APP.publico);
        UI.aviso('✅ Logo guardado.', 'ok');
      } catch (err) { UI.error('No se subió el logo', err.message); }
    });
    UI.$$('input[type=color]', f).forEach(function (inp) {
      inp.addEventListener('input', function () {
        inp.nextElementSibling.textContent = inp.value;
        UI.aplicarMarca(Object.assign({}, APP.publico, { [inp.name]: inp.value })); // vista previa en vivo
      });
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var boton = f.querySelector('button[type=submit]');
      var datos = UI.leerFormulario(f);
      if (!datos.negocio_nombre) return UI.aviso('El nombre del negocio no puede quedar vacío.', 'error');
      UI.trabajando(boton, async function () {
        try {
          var res = await DATOS.pedir('configGuardar', { config: datos }, { guardar: true });
          cache.config = { config: res.config, licencia: cache.config.licencia };
          Object.keys(APP.publico).forEach(function (k) { if (k in res.config) APP.publico[k] = res.config[k]; });
          UI.zona = res.config.zona_horaria || UI.zona;
          UI.aplicarMarca(APP.publico);
          global.APP_MEMORIA.guardar('marca', APP.publico);
          UI.aviso(res.escritas ? 'Cambios guardados.' : 'No había cambios que guardar.', 'ok');
          pintarNegocio(false);
        } catch (err) {
          UI.aplicarMarca(APP.publico);
          UI.error('No se guardaron los cambios', err.message);
        }
      });
    });
  }

  /* ---------------- Locales ---------------- */
  async function pintarLocales(forzar) {
    if (forzar) await APP.cargarLocales();
    var lista = APP.locales;
    cuerpo().innerHTML =
      '<div class="acciones" style="margin:0 0 12px"><button class="btn" id="btn-nuevo-local" type="button">＋ Agregar local</button></div>' +
      (lista.length ? '<div class="lista">' + lista.map(function (l) {
        return '<div class="item"><div class="avatar" aria-hidden="true">📍</div><div class="item-cuerpo">' +
          '<div class="item-titulo">' + UI.esc(l.nombre) + '</div>' +
          '<div class="item-sub">' + UI.esc(l.direccion || 'Sin dirección') + (l.telefono ? ' · ' + UI.esc(l.telefono) : '') + '</div></div>' +
          '<span class="etiqueta ' + (l.activo ? 'ok' : 'mal') + '">' + (l.activo ? 'Activo' : 'Inactivo') + '</span>' +
          '<button class="btn secundario chico" type="button" data-editar="' + UI.esc(l.id) + '">Editar</button>' +
          '<button class="btn secundario chico" type="button" data-pausar="' + UI.esc(l.id) + '">' + (l.pausado ? '▶ Reanudar pedidos' : '⏸ Pausar pedidos') + '</button></div>';
      }).join('') + '</div>' : UI.vacio('📍', 'Aún no hay locales.'));

    UI.$('#btn-nuevo-local').addEventListener('click', function () { editarLocal(null); });
    UI.$$('[data-pausar]', cuerpo()).forEach(function (b) { b.addEventListener('click', function () {
      UI.trabajando(b, async function () {
        var l = APP.locales.filter(function (x) { return x.id === b.getAttribute('data-pausar'); })[0];
        if (!l) return;
        var mensaje = '';
        if (!l.pausado) {
          mensaje = await UI.pedirDato({ titulo: '⏸ Pausar ' + l.nombre, etiqueta: '¿Qué verá el cliente?', ph: 'Hoy cerramos temprano', max: 160 });
          if (mensaje === null) return;
        }
        try {
          var r = await DATOS.pedir('localPausar', { id: l.id, mensaje: mensaje }, { guardar: true });
          APP.locales = r.locales || [];
          UI.aviso(l.pausado ? 'Local reanudado.' : 'Local pausado.', 'ok');
          pintarLocales(false);
        } catch (err) { UI.error('No se pudo cambiar el estado del local', err.message); }
      });
    }); });
    UI.$$('[data-editar]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () {
        editarLocal(APP.locales.filter(function (l) { return l.id === b.getAttribute('data-editar'); })[0]);
      });
    });
  }

  async function editarLocal(local) {
    local = local || { id: '', nombre: '', direccion: '', telefono: '', activo: true, lat: '', lng: '', minimo_domicilio: '' };
    var datos = null;
    var ok = await UI.ventana({
      icono: '📍', titulo: local.id ? 'Editar local' : 'Nuevo local',
      html: '<form id="form-local" autocomplete="off">' +
        '<div class="campo"><label for="lo-nombre">Nombre</label><input class="entrada" id="lo-nombre" name="nombre" value="' + UI.esc(local.nombre) + '" placeholder="Ej. Local 1 – Norte" maxlength="60"></div>' +
        '<div class="campo"><label for="lo-dir">Dirección</label><input class="entrada" id="lo-dir" name="direccion" value="' + UI.esc(local.direccion) + '"></div>' +
        '<div class="campo"><label for="lo-tel">Teléfono</label><input class="entrada" id="lo-tel" name="telefono" inputmode="tel" value="' + UI.esc(local.telefono) + '"></div>' +
        '<div class="campo"><label for="lo-min">Pedido mínimo a domicilio (opcional)</label><input class="entrada" id="lo-min" name="minimo_domicilio" inputmode="decimal" placeholder="Sin mínimo" value="' + UI.esc(local.minimo_domicilio || '') + '"></div>' +
        '<div class="campo"><label>📍 Ubicación del local</label><button class="btn secundario chico" type="button" id="lo-gps">📍 Marcar con mi ubicación</button>' +
        '<input type="hidden" name="lat" id="lo-lat" value="' + UI.esc(local.lat === '' ? '' : local.lat) + '"><input type="hidden" name="lng" id="lo-lng" value="' + UI.esc(local.lng === '' ? '' : local.lng) + '">' +
        '<input class="entrada" name="enlace" id="lo-enlace" placeholder="O pega enlace de Google Maps" style="margin-top:8px"><span class="ayuda" id="lo-pos">' + (local.lat !== '' && local.lat != null ? 'Punto marcado: ' + UI.esc(local.lat) + ', ' + UI.esc(local.lng) : 'Sin punto: el local sigue funcionando normalmente') + '</span></div>' +
        '<label class="interruptor"><input type="checkbox" name="activo"' + (local.activo ? ' checked' : '') + '> Local activo</label></form>',
      alAbrir: function (v) {
        UI.$('#lo-gps', v).addEventListener('click', function (e) { UI.trabajando(e.currentTarget, async function () {
          var pt = await UI.ubicacion(); if (!pt) return UI.aviso('No encontramos tu GPS. También puedes pegar un enlace de Maps.', 'error');
          UI.$('#lo-lat', v).value = pt.lat; UI.$('#lo-lng', v).value = pt.lng;
          UI.$('#lo-enlace', v).value = ''; UI.$('#lo-pos', v).textContent = 'Punto marcado: ' + pt.lat + ', ' + pt.lng;
        }); });
        UI.$('#lo-enlace', v).addEventListener('input', function () { UI.$('#lo-lat', v).value = ''; UI.$('#lo-lng', v).value = ''; });
      },
      botones: [
        { texto: 'Cancelar', valor: false, clase: 'secundario' },
        { texto: 'Guardar', valor: true, antes: function (v) {
          datos = UI.leerFormulario(UI.$('#form-local', v));
          if (!datos.nombre) { UI.$('#lo-nombre', v).setAttribute('aria-invalid', 'true'); UI.aviso('Escriba el nombre del local.', 'error'); return false; }
          if (datos.minimo_domicilio && !(Number(datos.minimo_domicilio) >= 0)) { UI.aviso('Revise el pedido mínimo.', 'error'); return false; }
          return true;
        } }
      ]
    });
    if (!ok) return;
    datos.id = local.id;
    try {
      var r = await DATOS.pedir('localGuardar', datos, { guardar: true });
      APP.locales = r.locales || [];
      await APP.cargarLocales();
      UI.aviso('Local guardado.', 'ok');
      pintarLocales(false);
    } catch (err) {
      UI.error('No se guardó el local', err.message);
    }
  }

  /* ---------------- Usuarios ---------------- */
  async function pintarUsuarios(forzar) {
    if (!cache.usuarios || forzar) cache.usuarios = (await DATOS.pedir('usuariosListar', {})).usuarios || [];
    var lista = cache.usuarios;
    var conteo = { dueno: 0, cajero: 0, motorizado: 0 };
    lista.forEach(function (u) { if (u.activo && conteo[u.rol] != null) conteo[u.rol]++; });
    cuerpo().innerHTML =
      '<div class="acciones" style="margin:0 0 12px"><button class="btn" id="btn-nuevo-usuario" type="button">＋ Nuevo usuario</button></div>' +
      '<p class="subtitulo">Activos: ' + conteo.dueno + ' dueño(s) · ' + conteo.cajero + ' cajero(s) · ' + conteo.motorizado + ' motorizado(s). Desactivar no borra el historial.</p>' +
      '<div class="lista">' + lista.map(function (u) {
        return '<div class="item usuario-fila"><div class="avatar">' + UI.esc(UI.iniciales(u.nombre)) + '</div><div class="item-cuerpo">' +
          '<div class="item-titulo">' + UI.esc(u.nombre) + '</div>' +
          '<div class="item-sub">@' + UI.esc(u.usuario) + ' · ' + UI.esc(APP.nombreRol(u.rol)) + ' · ' + UI.esc(APP.nombreLocal(u.local_id)) + '</div>' +
          '<div class="item-sub">Último ingreso: ' + UI.esc(UI.fechaHora(u.ultimo_acceso)) + '</div></div>' +
          '<span class="etiqueta ' + (u.activo ? 'ok' : 'mal') + '">' + (u.activo ? 'Activo' : 'Inactivo') + '</span>' +
          (u.activo ? '<button class="btn secundario chico" type="button" data-acceso="' + UI.esc(u.id) + '" aria-label="Enviar acceso por WhatsApp">📲</button>' : '') +
          '<button class="btn secundario chico" type="button" data-editar="' + UI.esc(u.id) + '">Editar</button></div>';
      }).join('') + '</div>';

    UI.$('#btn-nuevo-usuario').addEventListener('click', function () { editarUsuario(null); });
    UI.$$('[data-acceso]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () {
        var u = cache.usuarios.filter(function (x) { return x.id === b.getAttribute('data-acceso'); })[0];
        if (u) ofrecerAcceso(u, '');
      });
    });
    UI.$$('[data-editar]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () {
        editarUsuario(cache.usuarios.filter(function (u) { return u.id === b.getAttribute('data-editar'); })[0]);
      });
    });
  }

  async function editarUsuario(u) {
    var nuevo = !u;
    u = u || { id: '', usuario: '', nombre: '', rol: 'cajero', local_id: '', activo: true };
    var opcionesLocal = APP.locales.filter(function (l) { return l.activo || l.id === u.local_id; }).map(function (l) {
      return '<option value="' + UI.esc(l.id) + '"' + (l.id === u.local_id ? ' selected' : '') + '>' + UI.esc(l.nombre) + '</option>';
    }).join('');
    var datos = null;
    var accion = await UI.ventana({
      icono: '👤', titulo: nuevo ? 'Nuevo usuario' : 'Editar usuario',
      html: '<form id="form-usuario" autocomplete="off">' +
        '<div class="campo"><label for="us-nombre">Nombre de la persona</label><input class="entrada" id="us-nombre" name="nombre" value="' + UI.esc(u.nombre) + '" maxlength="80"></div>' +
        '<div class="campo"><label for="us-usuario">Usuario para ingresar</label><input class="entrada" id="us-usuario" name="usuario" value="' + UI.esc(u.usuario) + '" autocapitalize="none" spellcheck="false" maxlength="30"><span class="ayuda">3 a 30 letras o números, sin espacios. Ej. maria.norte</span></div>' +
        '<div class="fila-campos"><div class="campo"><label for="us-rol">Rol</label><select class="entrada" id="us-rol" name="rol">' +
        ['dueno', 'cajero', 'motorizado'].map(function (r) { return '<option value="' + r + '"' + (r === u.rol ? ' selected' : '') + '>' + APP.nombreRol(r) + '</option>'; }).join('') +
        '</select></div><div class="campo" id="us-local-campo"><label for="us-local">Local</label><select class="entrada" id="us-local" name="local_id"><option value="">Elegir…</option>' + opcionesLocal + '</select></div></div>' +
        (nuevo ? '<div class="campo"><label for="us-clave">Clave inicial</label><input class="entrada" id="us-clave" name="clave" type="text" autocomplete="off" minlength="6"><span class="ayuda">Mínimo 6 caracteres. La persona puede cambiarla en «Mi cuenta».</span></div>' : '') +
        '<label class="interruptor"><input type="checkbox" name="activo"' + (u.activo ? ' checked' : '') + '> Usuario activo</label></form>',
      alAbrir: function (v) {
        var rol = UI.$('#us-rol', v), campoLocal = UI.$('#us-local-campo', v);
        function ver() { campoLocal.hidden = rol.value === 'dueno'; }
        rol.addEventListener('change', ver); ver();
      },
      botones: [
        { texto: 'Cancelar', valor: null, clase: 'secundario' }
      ].concat(nuevo ? [] : [{ texto: 'Restablecer clave', valor: 'clave', clase: 'borde' }]).concat([
        { texto: 'Guardar', valor: 'guardar', antes: function (v) {
          datos = UI.leerFormulario(UI.$('#form-usuario', v));
          datos.usuario = datos.usuario.toLowerCase().replace(/\s+/g, ''); // «motorizado 1» -> «motorizado1»
          var malo = !datos.nombre ? 'Escriba el nombre.' : !/^[a-z0-9._-]{3,30}$/.test(datos.usuario) ? 'Usuario no válido: 3 a 30 letras o números, sin espacios.' :
            (datos.rol !== 'dueno' && !datos.local_id) ? 'Elija el local.' : (nuevo && (datos.clave || '').length < 6) ? 'La clave debe tener al menos 6 caracteres.' : '';
          if (malo) { UI.aviso(malo, 'error'); return false; }
          return true;
        } }
      ])
    });
    if (accion === 'clave') return restablecerClave(u);
    if (accion !== 'guardar') return;
    datos.id = u.id;
    try {
      var r = await DATOS.pedir('usuarioGuardar', datos, { guardar: true });
      cache.usuarios = r.usuarios || [];
      UI.aviso(nuevo ? 'Usuario creado.' : 'Usuario guardado.', 'ok');
      pintarUsuarios(false);
      if (nuevo && datos.activo !== false) ofrecerAcceso(datos, datos.clave);
    } catch (err) {
      UI.error('No se guardó el usuario', err.message);
    }
  }

  /* Enviar por WhatsApp el enlace de la app + usuario (+ clave si se acaba de poner). */
  async function ofrecerAcceso(u, clave) {
    var texto = UI.textoAcceso(u.nombre, u.usuario, clave, APP.nombreRol(u.rol));
    var enviar = await UI.ventana({
      icono: '📲', titulo: 'Acceso de ' + u.nombre,
      texto: clave ? 'Mándale este mensaje para que entre desde su teléfono.' : 'Mándale el enlace y su usuario. La clave se la das tú (el sistema la guarda escondida y no puede mostrarla).',
      html: '<pre style="white-space:pre-wrap;font:inherit;background:var(--superficie-2);border-radius:14px;padding:12px;margin:0 0 12px">' + UI.esc(texto) + '</pre>',
      botones: [{ texto: 'Cerrar', valor: false, clase: 'secundario' }, { texto: '💬 Enviar por WhatsApp', valor: true }]
    });
    if (enviar) UI.compartirWhatsApp(texto);
  }

  async function restablecerClave(u) {
    var clave = '';
    var ok = await UI.ventana({
      icono: '🔑', titulo: 'Nueva clave para ' + u.nombre,
      texto: 'Se cerrarán sus sesiones abiertas en todos los equipos.',
      html: '<div class="campo"><label for="rc-clave">Clave nueva</label><input class="entrada" id="rc-clave" type="text" autocomplete="off" minlength="6"></div>',
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Guardar clave', valor: true, antes: function (v) {
        clave = UI.$('#rc-clave', v).value;
        if (clave.length < 6) { UI.aviso('Mínimo 6 caracteres.', 'error'); return false; }
        return true;
      } }]
    });
    if (!ok) return;
    try {
      await DATOS.pedir('usuarioClave', { id: u.id, clave: clave }, { guardar: true });
      UI.aviso('Clave restablecida.', 'ok');
      ofrecerAcceso(u, clave);
    } catch (err) {
      UI.error('No se cambió la clave', err.message);
    }
  }

  /* ---------------- Licencia ---------------- */
  async function pintarLicencia(forzar) {
    var r = await traerConfig(forzar), lic = r.licencia || {};
    cuerpo().innerHTML = '<div class="tarjeta"><h3>Licencia del sistema</h3><p>Estado: '+UI.esc(lic.estado||'No disponible')+'</p><p>Vencimiento: '+UI.esc(lic.vence||'No disponible')+'</p><p>Contacte al proveedor para renovar. Sus datos se conservan.</p></div>';
  }

  /* ---------------- Bitácora ---------------- */
  async function pintarBitacora() {
    var r = await DATOS.pedir('bitacoraListar', { limite: 200 });
    var lista = r.registros || [];
    var modulos = Array.from(new Set(lista.map(function (x) { return x.modulo; }))).sort();
    cuerpo().innerHTML =
      '<div class="fila-campos"><div class="campo"><label for="bi-modulo">Módulo</label><select class="entrada" id="bi-modulo"><option value="">Todos</option>' +
      modulos.map(function (m) { return '<option>' + UI.esc(m) + '</option>'; }).join('') + '</select></div>' +
      '<div class="campo"><label for="bi-buscar">Buscar</label><input class="entrada" id="bi-buscar" placeholder="Usuario, acción o detalle"></div></div>' +
      '<div id="bi-lista"></div>';
    function pintar() {
      var mod = UI.$('#bi-modulo').value, txt = UI.$('#bi-buscar').value.toLowerCase();
      var f = lista.filter(function (x) {
        return (!mod || x.modulo === mod) && (!txt || (x.usuario + ' ' + x.accion + ' ' + x.detalle).toLowerCase().indexOf(txt) >= 0);
      });
      UI.$('#bi-lista').innerHTML = f.length ? '<div class="lista">' + f.map(function (x) {
        return '<div class="item"><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(x.accion) + ' <span class="etiqueta">' + UI.esc(x.modulo) + '</span></div>' +
          '<div class="item-sub">' + UI.esc(UI.fechaHora(x.fecha)) + ' · ' + UI.esc(x.usuario || '—') + (x.detalle ? ' · ' + UI.esc(x.detalle) : '') + '</div></div></div>';
      }).join('') + '</div>' : UI.vacio('📜', 'No hay registros con ese filtro.');
    }
    UI.$('#bi-modulo').addEventListener('change', pintar);
    UI.$('#bi-buscar').addEventListener('input', pintar);
    pintar();
  }

  /* Al cerrar sesión se olvida lo cargado (otra persona puede ingresar en este equipo). */
  global.addEventListener('app:sesion-terminada', function () { cache = { config: null, usuarios: null }; });
  APP.limpiarConfiguracion = function () { cache = { config: null, usuarios: null }; pestanaActual = 'negocio'; };
})(window);
