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
      UI.$('#btn-nuevo-moto', cont).addEventListener('click', function () { nuevoTodo(); });
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
    }).join('') + '</div>' : UI.vacio('🛵', 'Aún no hay motorizados. Toque «Nuevo motorizado»: en un solo paso se crea su ficha y su usuario.');
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

  /* 3.0: motorizado NUEVO en un solo paso (ficha + usuario + clave). */
  function sugerirUsuario(nombre) {
    var p = String(nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, '').trim().split(/\s+/);
    return ((p[0] || 'moto') + (p[1] ? '.' + p[1] : '')).slice(0, 20);
  }
  async function nuevoTodo() {
    var enviar = null;
    var ok = await UI.ventana({
      icono: '🛵', titulo: 'Nuevo motorizado', texto: 'Ficha y acceso a la app en un solo paso.',
      html: '<form id="form-moto-nuevo" autocomplete="off">' +
        '<div class="campo"><label for="mn-nombre">Nombre completo</label><input class="entrada" id="mn-nombre" name="nombre" maxlength="80"></div>' +
        '<div class="fila-campos"><div class="campo"><label for="mn-cedula">Cédula</label><input class="entrada" id="mn-cedula" name="cedula" inputmode="numeric" maxlength="13"></div>' +
        '<div class="campo"><label for="mn-cel">Celular</label><input class="entrada" id="mn-cel" name="celular" inputmode="tel" maxlength="20"></div>' +
        '<div class="campo"><label for="mn-placa">Placa</label><input class="entrada" id="mn-placa" name="placa" maxlength="10" autocapitalize="characters"></div>' +
        '<div class="campo"><label for="mn-local">Local</label><select class="entrada" id="mn-local" name="local_id">' +
        APP.locales.filter(function (l) { return l.activo; }).map(function (l) { return '<option value="' + UI.esc(l.id) + '"' + (l.id === APP.local ? ' selected' : '') + '>' + UI.esc(l.nombre) + '</option>'; }).join('') + '<option value="TODOS">Todos los locales</option></select></div></div>' +
        '<h4 style="margin:6px 0">🔑 Acceso a «Mis entregas»</h4>' +
        '<div class="fila-campos"><div class="campo"><label for="mn-usuario">Usuario</label><input class="entrada" id="mn-usuario" name="usuario" maxlength="30" autocapitalize="none" spellcheck="false"></div>' +
        '<div class="campo"><label for="mn-clave">Clave (mín. 6)</label><input class="entrada" id="mn-clave" name="clave" maxlength="40"></div></div>' +
        '<span class="ayuda">Al guardar te ofrecemos enviarle su acceso por WhatsApp.</span></form>',
      alAbrir: function (v) {
        var n = UI.$('#mn-nombre', v), u = UI.$('#mn-usuario', v), k = UI.$('#mn-clave', v), tocado = false;
        u.addEventListener('input', function () { tocado = true; });
        n.addEventListener('input', function () { if (!tocado) u.value = sugerirUsuario(n.value); });
        k.value = String(Math.floor(100000 + Math.random() * 900000));
      },
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Crear motorizado', valor: true, antes: function (v) {
        enviar = UI.leerFormulario(UI.$('#form-moto-nuevo', v));
        var malo = !enviar.nombre ? 'Escriba el nombre.' : !/^\d{10}$/.test(enviar.cedula.replace(/\s/g, '')) ? 'La cédula debe tener 10 dígitos.' : UI.digitos(enviar.celular).length < 7 ? 'Escriba el celular.' : !enviar.usuario ? 'Escriba el usuario.' : enviar.clave.length < 6 ? 'La clave debe tener al menos 6 caracteres.' : '';
        if (malo) { UI.aviso(malo, 'error'); return false; }
        return true;
      } }]
    });
    if (!ok) return;
    try {
      var r = await DATOS.pedir('motorizadoCrearTodo', enviar, { guardar: true });
      UI.aviso('Motorizado creado con su usuario.', 'ok');
      cargar();
      var m = (r.motorizados || []).filter(function (x) { return x.cedula === enviar.cedula.replace(/\s/g, ''); })[0];
      var mandar = await UI.confirmar('¿Enviarle su acceso por WhatsApp?', 'Se abre WhatsApp a su celular con el enlace, su usuario y su clave.', '📲 Enviar acceso');
      if (mandar) UI.compartirWhatsApp(UI.textoAcceso(enviar.nombre, enviar.usuario.toLowerCase(), enviar.clave, 'motorizado'), m ? m.celular : enviar.celular);
    } catch (err) { UI.error('No se creó', err.message); }
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
      '<h3 style="margin:6px 0 10px">Por entregar (' + abiertos.length + ')</h3>' +
      (abiertos.length ? '<div class="lista">' + abiertos.map(tarjetaEntrega).join('') + '</div>' : UI.vacio('🛵', 'No tienes pedidos asignados ahora.')) +
      (hechos.length ? '<h3 style="margin:20px 0 10px">Entregados hoy (' + hechos.length + ')</h3><div class="lista">' + hechos.map(function (p) {
        return '<div class="item"><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(p.numero) + ' · ' + UI.esc(p.cliente_nombre) + '</div><div class="item-sub">' + UI.esc(UI.hora(p.entregado)) + ' · ' + (p.forma_pago === 'efectivo' ? 'cobraste ' + UI.dinero(p.total) : (p.forma_pago === 'deuna' ? 'Deuna' : 'transferencia')) + '</div></div>' + UI.chipEstado('Entregado') + '</div>';
      }).join('') + '</div>' : '') +
      '<div class="tarjeta debe" style="margin-top:18px"><div class="modulo-ico" aria-hidden="true">💵</div><div style="flex:1;min-width:0">' +
      '<div class="item-sub">Al terminar, entregas en caja</div><div class="monto">' + UI.dinero(mias.debe.total) + '</div>' +
      '<div class="item-sub">Fondo recibido ' + UI.dinero(mias.debe.fondo) + ' + efectivo cobrado ' + UI.dinero(mias.debe.efectivo) + ' (tus propinas son tuyas)</div></div></div>';
    UI.$$('[data-e]', c).forEach(function (b) { b.addEventListener('click', function () { accionEntrega(b, b.getAttribute('data-e'), b.getAttribute('data-id')); }); });
  }

  function tarjetaEntrega(p) {
    var id = UI.esc(p.id);
    var digital = UI.esDigital(p.forma_pago);
    var bloqueadoPago = digital && !p.pago_verificado && (!global.APP.publico || global.APP.publico.verificar_antes_salir !== 'NO');
    var principal;
    if (p.estado === 'En camino') principal = '<button class="btn entrega-principal" type="button" data-e="entregado" data-id="' + id + '">✅ Entregado</button>';
    else if (bloqueadoPago) principal = '<div class="esperando">⏳ Esperando que el local verifique el pago</div>';
    else if (p.estado === 'Recibido') principal = '<div class="esperando">🧾 La cocina aún no empieza</div><button class="btn borde bloque" type="button" data-e="sali" data-id="' + id + '" style="margin-top:8px">🛵 Ya lo tengo, salí</button>';
    else principal = '<div class="esperando">👨‍🍳 Cocina preparando…</div><button class="btn entrega-principal" type="button" data-e="sali" data-id="' + id + '">🛵 Ya lo tengo, salí</button>';
    return '<article class="pedido"><div class="pedido-top"><span class="pedido-num">' + UI.esc(p.numero) + '</span>' + UI.chipEstado(p.estado) + (p.hora_llegada ? '<span class="chip-tipo tipo-hora">⏰ ' + UI.esc(UI.hora(p.hora_llegada)) + '</span>' : '') + '</div>' +
      (p.forma_pago === 'efectivo' ? '<div class="cobrar-grande efectivo"><span>💵 COBRAR</span><span class="monto">' + UI.dinero(p.total) + '</span></div>'
        : '<div class="cobrar-grande pagado"><span>' + UI.NOMBRE_PAGO[p.forma_pago] + '</span><span>' + (p.pago_verificado ? '✅ Pagado · no cobrar' : '⏳ Por verificar') + '</span></div>') +
      (p.propina ? '<div class="pedido-linea">🙌 Incluye tu propina: <b>' + UI.dinero(p.propina) + '</b></div>' : '') +
      '<div class="pedido-linea" style="font-size:16px"><b style="color:var(--texto)">' + UI.esc(p.cliente_nombre) + '</b></div>' +
      '<div class="pedido-linea">📍 ' + UI.esc(p.direccion || 'Ver en el mapa') + (p.referencia ? ' · ' + UI.esc(p.referencia) : '') + '<br><small>' + UI.fuenteUbicacion(p) + '</small></div>' +
      '<ul class="pedido-items">' + (p.detalle || []).map(function (d) { return '<li><b>' + d.cantidad + '×</b> ' + UI.esc(d.nombre) + (d.extras ? ' <span class="pedido-linea">(' + UI.esc(d.extras) + ')</span>' : '') + '</li>'; }).join('') + '</ul>' +
      (p.notas ? '<div class="banda" style="margin:0;padding:8px 10px">📝 <span>' + UI.esc(p.notas) + '</span></div>' : '') +
      '<div class="entrega-grid">' +
      '<button class="btn secundario" type="button" data-e="mapa" data-id="' + id + '"><span>🗺️</span>Mapa</button>' +
      '<button class="btn secundario" type="button" data-e="llamar" data-id="' + id + '"><span>📞</span>Llamar</button>' +
      '<button class="btn secundario" type="button" data-e="wa" data-id="' + id + '"><span>💬</span>WhatsApp</button>' +
      '</div>' + principal + '</article>';
  }

  async function accionEntrega(boton, que, id) {
    var p = mias.pedidos.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    if (que === 'mapa') { var u = UI.enlaceMapa(p); if (u) global.open(u, '_blank', 'noopener'); else UI.aviso('Este pedido no tiene dirección ni ubicación. Llame al cliente.', 'error'); return; }
    if (que === 'llamar') { global.location.href = 'tel:+' + UI.digitos(p.telefono); return; }
    if (que === 'wa') {
      var nombre = String(p.cliente_nombre || '').split(' ')[0];
      var cobro = p.forma_pago === 'efectivo' ? ' Total a pagar: ' + UI.dinero(p.total) + ' en efectivo.' : '';
      var op = await UI.ventana({
        icono: '💬', titulo: 'Mensaje a ' + p.cliente_nombre, texto: 'Elige el mensaje: se abre WhatsApp ya escrito.',
        botones: [
          { texto: '🛵 Ya salí con tu pedido', valor: 'sali', clase: 'borde opcion-lista' },
          { texto: '📍 Ya llegué, estoy afuera', valor: 'llegue', clase: 'borde opcion-lista' },
          { texto: '❓ No encuentro la dirección', valor: 'donde', clase: 'borde opcion-lista' },
          { texto: '✍️ Escribir otro', valor: 'otro', clase: 'borde opcion-lista' },
          { texto: 'Cerrar', valor: null, clase: 'secundario' }
        ]
      });
      var textos = {
        sali: 'Hola ' + nombre + ', soy ' + mias.motorizado.nombre.split(' ')[0] + ' y ya salí con tu pedido ' + p.numero + ' 🛵.' + cobro,
        llegue: 'Hola ' + nombre + ', ya llegué con tu pedido ' + p.numero + ' 📍. Estoy afuera.' + cobro,
        donde: 'Hola ' + nombre + ', estoy cerca con tu pedido ' + p.numero + ' pero no encuentro la dirección. ¿Me envías tu ubicación por aquí? 📍',
        otro: 'Hola ' + nombre + ', '
      };
      if (op) UI.abrirWhatsApp(p.telefono, textos[op]);
      return;
    }
    if (que === 'sali') {
      if (p.estado === 'Recibido') {
        var seguro = await UI.confirmar('¿Ya tienes el pedido en tus manos?', 'La cocina todavía no lo marcó como en preparación. Toca «Sí» solo si ya te lo entregaron.', 'Sí, ya lo tengo');
        if (!seguro) return;
      }
      return UI.trabajando(boton, async function () {
        var pos = await UI.ubicacion(8000);
        try {
          await DATOS.pedir('entregaSali', { id: id, lat: pos ? pos.lat : '', lng: pos ? pos.lng : '' }, { guardar: true });
          UI.vibrar(); UI.aviso('¡Buen viaje! Hora de salida guardada.', 'ok');
          await cargarMias();
          var ofrecer = await UI.confirmar('¿Avisar al cliente que ya saliste?', 'Se abre WhatsApp con el mensaje listo.', '💬 Sí, avisar');
          if (ofrecer) accionEntrega(null, 'wa_sali', id);
        } catch (err) { UI.error('No se guardó', err.message); if (err.codigo === 'CAMBIO') cargarMias(); }
      });
    }
    if (que === 'wa_sali') {
      UI.abrirWhatsApp(p.telefono, 'Hola ' + String(p.cliente_nombre || '').split(' ')[0] + ', ya salí con tu pedido ' + p.numero + ' 🛵.' + (p.forma_pago === 'efectivo' ? ' Total a pagar: ' + UI.dinero(p.total) + ' en efectivo.' : ''));
      return;
    }
    if (que === 'entregado') {
      var foto = '';
      var ok = await UI.ventana({
        icono: '✅', titulo: 'Entregar ' + p.numero, texto: p.forma_pago === 'efectivo' ? '¿Cobraste ' + UI.dinero(p.total) + ' en efectivo?' : 'Pagado por ' + (p.forma_pago === 'deuna' ? 'Deuna' : 'transferencia') + ': no cobrar.',
        html: '<div class="campo"><label for="en-foto">📷 Foto de entrega (opcional)</label><input class="entrada" id="en-foto" type="file" accept="image/*" capture="environment"></div><img class="foto-previa" id="en-previa" alt="" hidden>',
        alAbrir: function (v) {
          UI.$('#en-foto', v).addEventListener('change', async function (e) {
            try { foto = await UI.leerFoto(e.target.files[0], 1024); var pr = UI.$('#en-previa', v); pr.src = foto; pr.hidden = !foto; }
            catch (err) { UI.aviso(err.message, 'error'); }
          });
        },
        botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: p.forma_pago === 'efectivo' ? 'Sí, cobré y entregué' : 'Sí, entregado', valor: true }]
      });
      if (!ok) return;
      return UI.trabajando(boton, async function () {
        var pos = await UI.ubicacion(8000);
        try {
          mias = await DATOS.pedir('entregaEntregado', { id: id, lat: pos ? pos.lat : '', lng: pos ? pos.lng : '', foto: foto }, { guardar: true });
          UI.vibrar([30, 40, 30]); UI.aviso('¡Entrega registrada! 🎉', 'ok');
          pintarMias();
        } catch (err) { UI.error('No se guardó', err.message); if (err.codigo === 'CAMBIO') cargarMias(); }
      });
    }
  }
})(window);
