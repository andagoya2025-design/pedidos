/**
 * ============================================================
 * MOTORIZADOS (dueño) y MIS ENTREGAS (motorizado) — fase 4.
 * Cédula ecuatoriana validada en el servidor. Ubicación y hora
 * se guardan al tocar «Salí» y «Entregado» (no hay rastreo en vivo).
 * ============================================================
 */
(function (global) {
  'use strict';
  var UI = global.UI, DATOS = global.DATOS, APP = global.APP;

  /* =================== Fichas (dueño) =================== */
  var motos = [], usuarios = [];

  APP.vistas.motorizados = {
    titulo: 'Motorizados', icono: '🛵', orden: 30, roles: ['dueno'],
    pintar: function (cont) {
      cont.innerHTML = UI.encabezado('Motorizados', 'Fichas, último punto conocido y WhatsApp') +
        '<div class="acciones" style="margin:0 0 12px"><button class="btn" type="button" id="btn-nuevo-moto">＋ Nuevo motorizado</button></div><div id="mo-cuerpo">' + UI.esqueleto(3) + '</div>';
      UI.$('[data-actualizar]', cont).addEventListener('click', function (e) { UI.trabajando(e.currentTarget, cargar); });
      UI.$('#btn-nuevo-moto', cont).addEventListener('click', function () { editar(null); });
      cargar();
    }
  };

  async function cargar() {
    var c = UI.$('#mo-cuerpo');
    try {
      var r = await Promise.all([DATOS.pedir('motorizadosListar', { local_id: APP.local }), DATOS.pedir('usuariosListar', {})]);
      motos = r[0].motorizados || [];
      usuarios = (r[1].usuarios || []).filter(function (u) { return u.rol === 'motorizado'; });
      pintar();
    } catch (err) {
      if (UI.$('#mo-cuerpo')) UI.$('#mo-cuerpo').innerHTML = '<div class="banda error">⚠️ <span>' + UI.esc(err.message) + '</span></div>';
    }
  }

  function pintar() {
    var c = UI.$('#mo-cuerpo');
    if (!c) return;
    c.innerHTML = motos.length ? '<div class="rejilla">' + motos.map(function (m) {
      var u = usuarios.filter(function (x) { return x.id === m.usuario_id; })[0];
      return '<div class="tarjeta"><div class="plato-admin"><div class="miniatura" aria-hidden="true">' + (m.foto_url ? '<img src="' + UI.esc(m.foto_url) + '" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.textContent=\'🛵\'">' : '🛵') + '</div>' +
        '<div class="item-cuerpo"><div class="item-titulo">' + UI.esc(m.nombre) + ' ' + '<span class="etiqueta ' + (m.activo ? 'ok' : 'mal') + '">' + (m.activo ? 'Activo' : 'Inactivo') + '</span></div>' +
        '<div class="item-sub">CI ' + UI.esc(m.cedula) + (m.placa ? ' · ' + UI.esc(m.placa) : '') + '</div>' +
        '<div class="item-sub">' + UI.esc(m.celular) + ' · ' + UI.esc(m.local_id === 'TODOS' ? 'Todos los locales' : APP.nombreLocal(m.local_id)) + '</div>' +
        '<div class="item-sub">' + (u ? 'Usuario: @' + UI.esc(u.usuario) : '⚠️ Sin usuario para «Mis entregas»') + '</div>' +
        (m.ultimo_punto ? '<div class="item-sub">Último punto: ' + UI.esc(UI.fechaHora(m.ultimo_punto.fecha)) + '</div>' : '') + '</div></div>' +
        '<div class="acciones">' +
        '<button class="btn secundario chico" type="button" data-wa="' + UI.esc(m.id) + '">💬 WhatsApp</button>' +
        (u ? '<button class="btn chico" type="button" data-acceso="' + UI.esc(m.id) + '">📲 Enviar acceso</button>' : '') +
        (m.ultimo_punto ? '<a class="btn secundario chico" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + m.ultimo_punto.lat + ',' + m.ultimo_punto.lng + '">🗺️ Último punto</a>' : '') +
        '<button class="btn borde chico" type="button" data-editar="' + UI.esc(m.id) + '">Editar</button></div></div>';
    }).join('') + '</div>' : UI.vacio('🛵', 'Aún no hay motorizados. Primero cree su usuario (Configuración → Usuarios, rol Motorizado) y luego su ficha aquí.');
    UI.$$('[data-editar]', c).forEach(function (b) { b.addEventListener('click', function () { editar(motos.filter(function (m) { return m.id === b.getAttribute('data-editar'); })[0]); }); });
    UI.$$('[data-acceso]', c).forEach(function (b) {
      b.addEventListener('click', function () {
        var m = motos.filter(function (x) { return x.id === b.getAttribute('data-acceso'); })[0];
        var u = usuarios.filter(function (x) { return x.id === m.usuario_id; })[0];
        if (!u) return;
        UI.ventana({
          icono: '📲', titulo: 'Acceso de ' + m.nombre, texto: 'Se abre WhatsApp a su celular con el enlace y su usuario. Escribe tú la clave antes de enviar (el sistema la guarda escondida).',
          html: '<pre style="white-space:pre-wrap;font:inherit;background:var(--superficie-2);border-radius:14px;padding:12px;margin:0 0 12px">' + UI.esc(UI.textoAcceso(m.nombre, u.usuario, '', 'motorizado')) + '</pre>',
          botones: [{ texto: 'Cerrar', valor: false, clase: 'secundario' }, { texto: '💬 Enviar por WhatsApp', valor: true }]
        }).then(function (ok) { if (ok) UI.compartirWhatsApp(UI.textoAcceso(m.nombre, u.usuario, '', 'motorizado'), m.celular); });
      });
    });
    UI.$$('[data-wa]', c).forEach(function (b) {
      b.addEventListener('click', function () { var m = motos.filter(function (x) { return x.id === b.getAttribute('data-wa'); })[0]; UI.abrirWhatsApp(m.celular, 'Hola ' + m.nombre.split(' ')[0] + ', '); });
    });
  }

  async function editar(m) {
    // Lista de usuarios al día: si el usuario se creó recién, igual aparece aquí.
    try { usuarios = ((await DATOS.pedir('usuariosListar', {})).usuarios || []).filter(function (u) { return u.rol === 'motorizado' && u.activo; }); } catch (e) { /* se usa la lista que ya había */ }
    var nuevo = !m;
    m = m || { id: '', nombre: '', cedula: '', celular: '', direccion: '', placa: '', foto_url: '', usuario_id: '', local_id: APP.local, activo: true };
    var libres = usuarios.filter(function (u) { return u.id === m.usuario_id || !motos.some(function (x) { return x.usuario_id === u.id; }); });
    var enviar = null;
    var ok = await UI.ventana({
      icono: '🛵', titulo: nuevo ? 'Nuevo motorizado' : 'Editar motorizado',
      html: '<form id="form-moto" autocomplete="off">' +
        '<div class="campo"><label for="mo-nombre">Nombre completo</label><input class="entrada" id="mo-nombre" name="nombre" maxlength="80" value="' + UI.esc(m.nombre) + '"></div>' +
        '<div class="fila-campos"><div class="campo"><label for="mo-cedula">Cédula</label><input class="entrada" id="mo-cedula" name="cedula" inputmode="numeric" maxlength="13" value="' + UI.esc(m.cedula) + '"></div>' +
        '<div class="campo"><label for="mo-cel">Celular</label><input class="entrada" id="mo-cel" name="celular" inputmode="tel" maxlength="20" value="' + UI.esc(m.celular) + '"></div>' +
        '<div class="campo"><label for="mo-placa">Placa</label><input class="entrada" id="mo-placa" name="placa" maxlength="10" autocapitalize="characters" value="' + UI.esc(m.placa) + '"></div>' +
        '<div class="campo"><label for="mo-local">Local</label><select class="entrada" id="mo-local" name="local_id"><option value="TODOS"' + (m.local_id === 'TODOS' ? ' selected' : '') + '>Todos los locales</option>' +
        APP.locales.filter(function (l) { return l.activo || l.id === m.local_id; }).map(function (l) { return '<option value="' + UI.esc(l.id) + '"' + (l.id === m.local_id ? ' selected' : '') + '>' + UI.esc(l.nombre) + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="campo"><label for="mo-dir">Dirección</label><input class="entrada" id="mo-dir" name="direccion" maxlength="200" value="' + UI.esc(m.direccion) + '"></div>' +
        '<div class="campo"><label for="mo-foto">Foto (enlace, opcional)</label><input class="entrada" id="mo-foto" name="foto_url" value="' + UI.esc(m.foto_url) + '" placeholder="https://…"></div>' +
        '<div class="campo"><label for="mo-usuario">Usuario para «Mis entregas»</label><select class="entrada" id="mo-usuario" name="usuario_id"><option value="">Sin usuario</option>' +
        libres.map(function (u) { return '<option value="' + UI.esc(u.id) + '"' + (u.id === m.usuario_id ? ' selected' : '') + '>@' + UI.esc(u.usuario) + ' · ' + UI.esc(u.nombre) + '</option>'; }).join('') +
        '</select><span class="ayuda">' + (libres.length ? 'Sin esto, el motorizado ve «Su usuario aún no está unido a una ficha».' : '⚠️ No hay usuarios de rol «Motorizado» libres: créelo primero en Configuración → Usuarios.') + '</span></div>' +
        '<label class="interruptor"><input type="checkbox" name="activo"' + (m.activo ? ' checked' : '') + '> Activo</label></form>',
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Guardar', valor: true, antes: function (v) {
        enviar = UI.leerFormulario(UI.$('#form-moto', v));
        var malo = !enviar.nombre ? 'Escriba el nombre.' : !enviar.cedula ? 'Escriba la cédula.' : UI.digitos(enviar.celular).length < 7 ? 'Escriba el celular.' : '';
        if (malo) { UI.aviso(malo, 'error'); return false; }
        return true;
      } }]
    });
    if (!ok) return;
    enviar.id = m.id;
    try {
      await DATOS.pedir('motorizadoGuardar', enviar, { guardar: true });
      UI.aviso('Motorizado guardado.', 'ok');
      cargar();
    } catch (err) { UI.error('No se guardó', err.message); }
  }

  /* =================== Mis entregas (motorizado) =================== */
  var mias = null;

  APP.vistas.entregas = {
    titulo: 'Mis entregas', icono: '📍', orden: 10, roles: ['motorizado'],
    pintar: function (cont) {
      cont.innerHTML = UI.encabezado('Mis entregas', 'Toque «Salí» al salir y «Entregado» al entregar') + '<div id="en-cuerpo">' + UI.esqueleto(3) + '</div>';
      UI.$('[data-actualizar]', cont).addEventListener('click', function (e) { UI.trabajando(e.currentTarget, cargarMias); });
      cargarMias();
    }
  };

  async function cargarMias() {
    try {
      mias = await DATOS.pedir('misEntregas', {});
      pintarMias();
    } catch (err) {
      if (UI.$('#en-cuerpo')) UI.$('#en-cuerpo').innerHTML = '<div class="banda error">⚠️ <span>' + UI.esc(err.message) + '</span></div>';
    }
  }

  function pintarMias() {
    var c = UI.$('#en-cuerpo');
    if (!c) return;
    var abiertos = mias.pedidos.filter(function (p) { return p.estado !== 'Entregado'; });
    var hechos = mias.pedidos.filter(function (p) { return p.estado === 'Entregado'; });
    c.innerHTML =
      '<div class="tarjeta debe" style="margin-bottom:14px"><div class="modulo-ico" aria-hidden="true">💵</div><div style="flex:1;min-width:0">' +
      '<div class="item-sub">Debes entregar en caja</div><div class="monto">' + UI.dinero(mias.debe.total) + '</div>' +
      '<div class="item-sub">Fondo recibido ' + UI.dinero(mias.debe.fondo) + ' + efectivo cobrado ' + UI.dinero(mias.debe.efectivo) + '</div></div></div>' +
      '<h3 style="margin:6px 0 10px">Por entregar (' + abiertos.length + ')</h3>' +
      (abiertos.length ? '<div class="lista">' + abiertos.map(tarjetaEntrega).join('') + '</div>' : UI.vacio('🛵', 'No tienes pedidos asignados ahora.')) +
      (hechos.length ? '<h3 style="margin:20px 0 10px">Entregados hoy (' + hechos.length + ')</h3><div class="lista">' + hechos.map(function (p) {
        return '<div class="item"><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(p.numero) + ' · ' + UI.esc(p.cliente_nombre) + '</div><div class="item-sub">' + UI.esc(UI.hora(p.entregado)) + ' · ' + (p.forma_pago === 'efectivo' ? 'cobraste ' + UI.dinero(p.total) : 'transferencia') + '</div></div>' + UI.chipEstado('Entregado') + '</div>';
      }).join('') + '</div>' : '');
    UI.$$('[data-e]', c).forEach(function (b) { b.addEventListener('click', function () { accionEntrega(b, b.getAttribute('data-e'), b.getAttribute('data-id')); }); });
  }

  function tarjetaEntrega(p) {
    var id = UI.esc(p.id);
    return '<article class="pedido"><div class="pedido-top"><span class="pedido-num">' + UI.esc(p.numero) + '</span>' + UI.chipEstado(p.estado) + '<span class="pedido-total">' + UI.dinero(p.total) + '</span></div>' +
      '<div class="pedido-linea"><b style="color:var(--texto)">' + UI.esc(p.cliente_nombre) + '</b> · ' + UI.esc(p.telefono) + '</div>' +
      '<div class="pedido-linea">📍 ' + UI.esc(p.direccion || 'Ver en el mapa') + (p.referencia ? ' · ' + UI.esc(p.referencia) : '') + '</div>' +
      '<ul class="pedido-items">' + (p.detalle || []).map(function (d) { return '<li><b>' + d.cantidad + '×</b> ' + UI.esc(d.nombre) + '</li>'; }).join('') + '</ul>' +
      '<div class="banda" style="margin:0">' + (p.forma_pago === 'efectivo' ? '💵 <span>Cobrar en efectivo: <b>' + UI.dinero(p.total) + '</b></span>' : '🏦 <span>Pagado por transferencia: no cobrar.</span>') + '</div>' +
      '<div class="entrega-botones">' +
      '<button class="btn secundario" type="button" data-e="mapa" data-id="' + id + '">🗺️ Mapa</button>' +
      '<button class="btn secundario" type="button" data-e="llamar" data-id="' + id + '">📞 Llamar</button>' +
      (p.estado === 'En camino' ? '<button class="btn bloque" type="button" data-e="entregado" data-id="' + id + '">✅ Entregado</button>' : '<button class="btn bloque" type="button" data-e="sali" data-id="' + id + '">🛵 Salí</button>') +
      '</div></article>';
  }

  async function accionEntrega(boton, que, id) {
    var p = mias.pedidos.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    if (que === 'mapa') { var u = UI.enlaceMapa(p); if (u) global.open(u, '_blank', 'noopener'); else UI.aviso('Este pedido no tiene dirección ni ubicación. Llame al cliente.', 'error'); return; }
    if (que === 'llamar') { global.location.href = 'tel:+' + UI.digitos(p.telefono); return; }
    if (que === 'sali') {
      return UI.trabajando(boton, async function () {
        var pos = await UI.ubicacion(8000);
        try {
          await DATOS.pedir('entregaSali', { id: id, lat: pos ? pos.lat : '', lng: pos ? pos.lng : '' }, { guardar: true });
          UI.aviso('¡Buen viaje! Hora de salida guardada.', 'ok');
          await cargarMias();
        } catch (err) { UI.error('No se guardó', err.message); if (err.codigo === 'CAMBIO') cargarMias(); }
      });
    }
    if (que === 'entregado') {
      var foto = '';
      var ok = await UI.ventana({
        icono: '✅', titulo: 'Entregar ' + p.numero, texto: p.forma_pago === 'efectivo' ? '¿Cobraste ' + UI.dinero(p.total) + ' en efectivo?' : 'Pagado por transferencia.',
        html: '<div class="campo"><label for="en-foto">Foto de entrega (opcional)</label><input class="entrada" id="en-foto" type="file" accept="image/*" capture="environment"></div><img class="foto-previa" id="en-previa" alt="" hidden>',
        alAbrir: function (v) {
          UI.$('#en-foto', v).addEventListener('change', async function (e) {
            try { foto = await UI.leerFoto(e.target.files[0], 1024); var pr = UI.$('#en-previa', v); pr.src = foto; pr.hidden = !foto; }
            catch (err) { UI.aviso(err.message, 'error'); }
          });
        },
        botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Sí, entregado', valor: true }]
      });
      if (!ok) return;
      return UI.trabajando(boton, async function () {
        var pos = await UI.ubicacion(8000);
        try {
          mias = await DATOS.pedir('entregaEntregado', { id: id, lat: pos ? pos.lat : '', lng: pos ? pos.lng : '', foto: foto }, { guardar: true });
          UI.aviso('Entrega registrada.', 'ok');
          pintarMias();
        } catch (err) { UI.error('No se guardó', err.message); if (err.codigo === 'CAMBIO') cargarMias(); }
      });
    }
  }
})(window);
