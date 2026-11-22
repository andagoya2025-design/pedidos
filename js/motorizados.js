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

  /* 3.1: aviso de licencia o matrícula vencida o por vencer (30 días). */
  function avisoVence(m) {
    var hoy = UI.hoy(), en30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), out = '';
    [['licencia_vence', 'Licencia'], ['matricula_vence', 'Matrícula']].forEach(function (k) {
      var v = m[k[0]];
      if (!v) return;
      if (v < hoy) out += '<div class="item-sub" style="color:var(--error)">⛔ ' + k[1] + ' vencida (' + UI.esc(v) + ')</div>';
      else if (v <= en30) out += '<div class="item-sub" style="color:var(--aviso)">⚠️ ' + k[1] + ' vence el ' + UI.esc(v) + '</div>';
    });
    return out;
  }
  var PAGO_MOTO = { entrega: 'por entrega', dia: 'por día', sueldo: 'sueldo mensual' };
  function camposExtra(m) {
    return '<h4 style="margin:6px 0">🏍️ Moto (lo ve el cliente: modelo, color y placa)</h4>' +
      '<div class="fila-campos"><div class="campo"><label for="mx-modelo">Marca / modelo</label><input class="entrada" id="mx-modelo" name="modelo_moto" maxlength="40" placeholder="Honda Wave" value="' + UI.esc(m.modelo_moto || '') + '"></div>' +
      '<div class="campo"><label for="mx-color">Color</label><input class="entrada" id="mx-color" name="color_moto" maxlength="30" placeholder="Roja" value="' + UI.esc(m.color_moto || '') + '"></div></div>' +
      '<h4 style="margin:6px 0">📄 Documentos (solo los ve el dueño)</h4>' +
      '<div class="fila-campos"><div class="campo"><label for="mx-lic">Licencia vence</label><input class="entrada" id="mx-lic" name="licencia_vence" type="date" value="' + UI.esc(m.licencia_vence || '') + '"></div>' +
      '<div class="campo"><label for="mx-mat">Matrícula vence</label><input class="entrada" id="mx-mat" name="matricula_vence" type="date" value="' + UI.esc(m.matricula_vence || '') + '"></div></div>' +
      '<h4 style="margin:6px 0">💵 Pago</h4>' +
      '<div class="fila-campos"><div class="campo"><label for="mx-pago">Se le paga</label><select class="entrada" id="mx-pago" name="forma_pago"><option value="">Sin definir</option>' +
      Object.keys(PAGO_MOTO).map(function (k) { return '<option value="' + k + '"' + (m.forma_pago === k ? ' selected' : '') + '>' + PAGO_MOTO[k] + '</option>'; }).join('') + '</select></div>' +
      '<div class="campo"><label for="mx-tarifa">Valor (USD)</label><input class="entrada" id="mx-tarifa" name="tarifa" inputmode="decimal" value="' + UI.esc(m.tarifa === '' || m.tarifa == null ? '' : m.tarifa) + '"></div></div>' +
      '<div class="campo"><label for="mx-foto-archivo">📷 Foto del motorizado (la ve el cliente al recibir)</label><input class="entrada" id="mx-foto-archivo" type="file" accept="image/*" capture="user"><input type="hidden" name="foto_url" id="mx-foto" value="' + UI.esc(m.foto_url || '') + '"><span class="ayuda" id="mx-foto-estado">' + (m.foto_url ? '✅ Tiene foto.' : 'Opcional. De frente, con casco o sin él.') + '</span></div>';
  }
  /* 3.1.3: motorizado que ya existe → la foto queda guardada en su ficha al instante.
     Motorizado nuevo → la foto se sube y se guarda al tocar «Guardar» (se avisa). */
  var fotoCambio = false;
  function conectarFoto(motoId, alCambiar) {
    return function (v) {
      UI.$('#mx-foto-archivo', v).addEventListener('change', async function (e) {
        var archivo = e.target.files[0]; if (!archivo) return;
        var est = UI.$('#mx-foto-estado', v);
        try {
          est.textContent = 'Subiendo foto…';
          var base64 = await UI.leerFoto(archivo, 600, { cuadrado: true });
          var r = motoId ? await DATOS.pedir('motorizadoFoto', { id: motoId, foto: base64 }, { guardar: true })
            : await DATOS.pedir('fotoSubir', { foto: base64, tipo: 'motorizado' }, { guardar: true });
          UI.$('#mx-foto', v).value = r.url;
          if (motoId) { fotoCambio = true; est.innerHTML = '✅ <b>Foto guardada en la ficha.</b> Ya la ven los clientes.'; UI.aviso('Foto guardada.', 'ok'); }
          else { est.innerHTML = '✅ Foto lista. <b>Toque «Guardar» para terminar.</b>'; if (alCambiar) alCambiar(); }
        } catch (err) { est.innerHTML = '⚠️ <b>No se guardó la foto.</b> ' + UI.esc(err.message); UI.aviso('No se guardó la foto. Intente de nuevo.', 'error'); }
      });
      /* cualquier otro cambio en la ficha cuenta como «sin guardar» */
      UI.$$('input, select, textarea', v).forEach(function (el) {
        if (el.id === 'mx-foto-archivo') return;
        el.addEventListener('input', function () { if (alCambiar) alCambiar(); });
        el.addEventListener('change', function () { if (alCambiar) alCambiar(); });
      });
    };
  }
  /* Botón Cancelar que avisa si hay cambios sin guardar (el segundo toque sí cierra). */
  function cancelarConAviso(estado) {
    return { texto: 'Cancelar', valor: false, clase: 'secundario', antes: function () {
      if (estado.cambios && !estado.avisado) { estado.avisado = true; UI.aviso('Tiene cambios sin guardar. Toque «Guardar», o «Cancelar» otra vez para salir sin guardar.', 'error'); return false; }
      return true;
    } };
  }
  function limpiarExtra(d) {
    d.tarifa = d.tarifa === '' ? '' : UI.numero(d.tarifa);
    delete d['']; return d;
  }

  function pintar() {
    var c = UI.$('#mo-cuerpo');
    if (!c) return;
    c.innerHTML = motos.length ? '<div class="rejilla">' + motos.map(function (m) {
      var u = usuarios.filter(function (x) { return x.id === m.usuario_id; })[0];
      return '<div class="tarjeta"><div class="plato-admin"><div class="miniatura" aria-hidden="true">' + (m.foto_url ? '<img src="' + UI.esc(m.foto_url) + '" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.textContent=\'🛵\'">' : '🛵') + '</div>' +
        '<div class="item-cuerpo"><div class="item-titulo">' + UI.esc(m.nombre) + ' ' + '<span class="etiqueta ' + (m.activo ? 'ok' : 'mal') + '">' + (m.activo ? 'Activo' : 'Inactivo') + '</span></div>' +
        '<div class="item-sub">CI ' + UI.esc(m.cedula) + (m.placa ? ' · ' + UI.esc(m.placa) : '') + (m.modelo_moto || m.color_moto ? ' · ' + UI.esc([m.modelo_moto, m.color_moto].filter(Boolean).join(' ')) : '') + '</div>' +
        avisoVence(m) +
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
    var enviar = null, estado = { cambios: false, avisado: false };
    fotoCambio = false;
    var ok = await UI.ventana({
      icono: '🛵', titulo: nuevo ? 'Nuevo motorizado' : 'Editar motorizado', cerrable: false,
      html: '<form id="form-moto" autocomplete="off">' +
        '<div class="campo"><label for="mo-nombre">Nombre completo</label><input class="entrada" id="mo-nombre" name="nombre" maxlength="80" value="' + UI.esc(m.nombre) + '"></div>' +
        '<div class="fila-campos"><div class="campo"><label for="mo-cedula">Cédula</label><input class="entrada" id="mo-cedula" name="cedula" inputmode="numeric" maxlength="13" value="' + UI.esc(m.cedula) + '"></div>' +
        '<div class="campo"><label for="mo-cel">Celular</label><input class="entrada" id="mo-cel" name="celular" inputmode="tel" maxlength="20" value="' + UI.esc(m.celular) + '"></div>' +
        '<div class="campo"><label for="mo-placa">Placa</label><input class="entrada" id="mo-placa" name="placa" maxlength="10" autocapitalize="characters" value="' + UI.esc(m.placa) + '"></div>' +
        '<div class="campo"><label for="mo-local">Local</label><select class="entrada" id="mo-local" name="local_id"><option value="TODOS"' + (m.local_id === 'TODOS' ? ' selected' : '') + '>Todos los locales</option>' +
        APP.locales.filter(function (l) { return l.activo || l.id === m.local_id; }).map(function (l) { return '<option value="' + UI.esc(l.id) + '"' + (l.id === m.local_id ? ' selected' : '') + '>' + UI.esc(l.nombre) + '</option>'; }).join('') + '</select></div></div>' +
        camposExtra(m) +
        '<div class="campo"><label for="mo-dir">Dirección (opcional, solo la ve el dueño)</label><input class="entrada" id="mo-dir" name="direccion" maxlength="200" value="' + UI.esc(m.direccion) + '"><span class="ayuda">Pida solo lo necesario (ley de protección de datos).</span></div>' +
        '<div class="campo"><label for="mo-usuario">Usuario para «Mis entregas»</label><select class="entrada" id="mo-usuario" name="usuario_id"><option value="">Sin usuario</option>' +
        libres.map(function (u) { return '<option value="' + UI.esc(u.id) + '"' + (u.id === m.usuario_id ? ' selected' : '') + '>@' + UI.esc(u.usuario) + ' · ' + UI.esc(u.nombre) + '</option>'; }).join('') +
        '</select><span class="ayuda">' + (libres.length ? 'Sin esto, el motorizado ve «Su usuario aún no está unido a una ficha».' : '⚠️ No hay usuarios de rol «Motorizado» libres: créelo primero en Configuración → Usuarios.') + '</span></div>' +
        '<label class="interruptor"><input type="checkbox" name="activo"' + (m.activo ? ' checked' : '') + '> Activo</label></form>',
      alAbrir: conectarFoto(m.id, function () { estado.cambios = true; estado.avisado = false; }),
      botones: [cancelarConAviso(estado), { texto: 'Guardar', valor: true, antes: function (v) {
        enviar = limpiarExtra(UI.leerFormulario(UI.$('#form-moto', v)));
        var malo = !enviar.nombre ? 'Escriba el nombre.' : !enviar.cedula ? 'Escriba la cédula.' : UI.digitos(enviar.celular).length < 7 ? 'Escriba el celular.' : '';
        if (malo) { UI.aviso(malo, 'error'); return false; }
        return true;
      } }]
    });
    if (!ok) { if (fotoCambio) cargar(); return; }
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
    var enviar = null, estado = { cambios: false, avisado: false };
    var ok = await UI.ventana({
      icono: '🛵', titulo: 'Nuevo motorizado', texto: 'Ficha y acceso a la app en un solo paso.', cerrable: false,
      html: '<form id="form-moto-nuevo" autocomplete="off">' +
        '<div class="campo"><label for="mn-nombre">Nombre completo</label><input class="entrada" id="mn-nombre" name="nombre" maxlength="80"></div>' +
        '<div class="fila-campos"><div class="campo"><label for="mn-cedula">Cédula</label><input class="entrada" id="mn-cedula" name="cedula" inputmode="numeric" maxlength="13"></div>' +
        '<div class="campo"><label for="mn-cel">Celular</label><input class="entrada" id="mn-cel" name="celular" inputmode="tel" maxlength="20"></div>' +
        '<div class="campo"><label for="mn-placa">Placa</label><input class="entrada" id="mn-placa" name="placa" maxlength="10" autocapitalize="characters"></div>' +
        '<div class="campo"><label for="mn-local">Local</label><select class="entrada" id="mn-local" name="local_id">' +
        APP.locales.filter(function (l) { return l.activo; }).map(function (l) { return '<option value="' + UI.esc(l.id) + '"' + (l.id === APP.local ? ' selected' : '') + '>' + UI.esc(l.nombre) + '</option>'; }).join('') + '<option value="TODOS">Todos los locales</option></select></div></div>' +
        camposExtra({}) +
        '<h4 style="margin:6px 0">🔑 Acceso a «Mis entregas»</h4>' +
        '<div class="fila-campos"><div class="campo"><label for="mn-usuario">Usuario</label><input class="entrada" id="mn-usuario" name="usuario" maxlength="30" autocapitalize="none" spellcheck="false"></div>' +
        '<div class="campo"><label for="mn-clave">Clave (mín. 6)</label><input class="entrada" id="mn-clave" name="clave" maxlength="40"></div></div>' +
        '<span class="ayuda">Al guardar te ofrecemos enviarle su acceso por WhatsApp.</span></form>',
      alAbrir: function (v) {
        var n = UI.$('#mn-nombre', v), u = UI.$('#mn-usuario', v), k = UI.$('#mn-clave', v), tocado = false;
        u.addEventListener('input', function () { tocado = true; });
        n.addEventListener('input', function () { if (!tocado) u.value = sugerirUsuario(n.value); });
        k.value = String(Math.floor(100000 + Math.random() * 900000));
        conectarFoto('', function () { estado.cambios = true; estado.avisado = false; })(v);
      },
      botones: [cancelarConAviso(estado), { texto: 'Crear motorizado', valor: true, antes: function (v) {
        enviar = limpiarExtra(UI.leerFormulario(UI.$('#form-moto-nuevo', v)));
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
    var enCamino = abiertos.filter(function (p) { return p.estado === 'En camino'; });
    if (global.RASTREO) global.RASTREO.actualizar(enCamino.map(function (p) { return p.id; }));
    c.innerHTML =
      turnoHtml() +
      '<div class="banda" id="banda-rastreo" hidden></div>' +
      '<h3 style="margin:6px 0 10px">Por entregar (' + abiertos.length + ')</h3>' +
      (abiertos.length ? '<div class="lista">' + abiertos.map(tarjetaEntrega).join('') + '</div>' : UI.vacio('🛵', 'No tienes pedidos asignados ahora.')) +
      (hechos.length ? '<h3 style="margin:20px 0 10px">Entregados hoy (' + hechos.length + ')</h3><div class="lista">' + hechos.map(function (p) {
        return '<div class="item"><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(p.numero) + ' · ' + UI.esc(p.cliente_nombre) + '</div><div class="item-sub">' + UI.esc(UI.hora(p.entregado)) + ' · ' + (p.forma_pago === 'efectivo' ? 'cobraste ' + UI.dinero(p.total) : (p.forma_pago === 'deuna' ? 'Deuna' : 'transferencia')) + '</div></div>' + (p.tiene_foto ? '<button class="btn borde chico" type="button" data-foto="' + UI.esc(p.id) + '" data-num="' + UI.esc(p.numero) + '" aria-label="Ver foto de entrega">📷 Foto</button>' : UI.chipEstado('Entregado')) + '</div>';
      }).join('') + '</div>' : '') +
      '<div class="tarjeta debe" style="margin-top:18px"><div class="modulo-ico" aria-hidden="true">💵</div><div style="flex:1;min-width:0">' +
      '<div class="item-sub">Al terminar, entregas en caja</div><div class="monto">' + UI.dinero(mias.debe.total) + '</div>' +
      '<div class="item-sub">Fondo recibido ' + UI.dinero(mias.debe.fondo) + ' + efectivo cobrado ' + UI.dinero(mias.debe.efectivo) + ' (tus propinas son tuyas)</div></div></div>';
    UI.$$('[data-e]', c).forEach(function (b) { b.addEventListener('click', function () { accionEntrega(b, b.getAttribute('data-e'), b.getAttribute('data-id')); }); });
    var tb = UI.$('#btn-turno', c); if (tb) tb.addEventListener('click', function () { cambiarTurno(tb); });
    var gm = UI.$('#btn-ubic-vivo', c); if (gm) gm.addEventListener('click', guiaUbicacionVivo);
    UI.$$('[data-foto]', c).forEach(function (b) { b.addEventListener('click', function () { UI.verFotoEntrega(b.getAttribute('data-foto'), b.getAttribute('data-num')); }); }); // 3.1.3
    if (global.RASTREO) global.RASTREO.actualizar(enCamino.map(function (p) { return p.id; }));
  }

  /* 3.1: turno del motorizado (hora y lugar de inicio y fin). */
  function turnoHtml() {
    var t = mias.turno;
    return '<div class="tarjeta turno ' + (t ? 'abierto' : '') + '"><div style="flex:1;min-width:0"><b>' + (t ? '🟢 Turno desde las ' + UI.esc(UI.hora(t.inicio)) : '⚪ Turno sin empezar') + '</b>' +
      '<div class="item-sub">' + (t ? 'Al terminar tu jornada, toca «Terminar turno».' : (mias.exigir_turno ? 'Empieza tu turno para recibir pedidos.' : 'Empieza tu turno al llegar al local.')) + '</div></div>' +
      '<button class="btn ' + (t ? 'secundario' : '') + ' chico" type="button" id="btn-turno">' + (t ? 'Terminar turno' : '▶ Empezar turno') + '</button></div>' +
      '<button class="btn secundario chico" type="button" id="btn-ubic-vivo" style="margin:-4px 0 12px">📍 Compartir ubicación en vivo (Google Maps)</button>';
  }
  async function cambiarTurno(boton) {
    var terminar = !!mias.turno;
    if (terminar && !(await UI.confirmar('¿Terminar tu turno?', 'Se guarda la hora de salida. Entrega antes el efectivo en caja.', 'Sí, terminar'))) return;
    UI.trabajando(boton, async function () {
      var pos = await UI.ubicacion(8000);
      try {
        mias = await DATOS.pedir(terminar ? 'turnoTerminar' : 'turnoIniciar', { lat: pos ? pos.lat : '', lng: pos ? pos.lng : '' }, { guardar: true });
        UI.aviso(terminar ? 'Turno terminado. ¡Buen descanso!' : '¡Turno iniciado! Buen trabajo 🛵', 'ok');
        pintarMias();
      } catch (err) { UI.error('No se guardó', err.message); }
    });
  }
  function guiaUbicacionVivo() {
    UI.ventana({
      icono: '📍', titulo: 'Ubicación en vivo con Google Maps',
      html: '<p>Así el local ve dónde estás aunque bloquees el teléfono. <b>Solo durante tu turno.</b></p><ol class="pasos-lista">' +
        '<li>Abre <b>Google Maps</b>.</li><li>Toca tu foto (arriba a la derecha) → <b>Compartir ubicación</b>.</li>' +
        '<li>Elige <b>«Hasta que desactives esta opción»</b> o el tiempo de tu turno.</li><li>Elige la cuenta del dueño del local → <b>Compartir</b>.</li>' +
        '<li>Al terminar el turno: mismo lugar → <b>Dejar de compartir</b>.</li></ol>' +
        '<p class="ayuda">Además, mientras llevas un pedido, esta app avisa tu ubicación cada minuto si la dejas abierta.</p>',
      botones: [{ texto: 'Abrir Google Maps', valor: 'maps' }, { texto: 'Cerrar', valor: null, clase: 'secundario' }]
    }).then(function (v) { if (v === 'maps') global.open('https://www.google.com/maps', '_blank', 'noopener'); });
  }

  function tarjetaEntrega(p) {
    var id = UI.esc(p.id);
    var digital = UI.esDigital(p.forma_pago);
    var bloqueadoPago = digital && !p.pago_verificado && (!global.APP.publico || global.APP.publico.verificar_antes_salir !== 'NO');
    var principal;
    if (p.estado === 'En camino') principal = '<p class="ayuda" style="margin:10px 0 6px;text-align:center">Tócalo cuando el cliente ya tenga su pedido en la mano.</p><button class="btn entrega-principal" type="button" data-e="entregado" data-id="' + id + '">📦 Marcar como entregado</button>';
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
      var codigo = '';
      var pedidoE = (mias.pedidos || []).filter(function (x) { return x.id === id; })[0] || {};
      if (mias.codigo_entrega && pedidoE.pide_codigo !== false) {
        codigo = await UI.pedirDato({ icono: '🔢', titulo: 'Código de entrega', etiqueta: 'Los 4 números que el cliente ve en su pantalla', modo: 'numeric', max: 4, ph: '0000', boton: 'Confirmar entrega',
          texto: 'Pídele al cliente su código (lo ve en «Ver cómo va»). Si no lo tiene, llama al local: desde el panel lo pueden marcar entregado.', validar: function (v) { return /^\d{4}$/.test(v) ? '' : 'Son 4 números.'; } });
        if (codigo === null) return;
      }
      return UI.trabajando(boton, async function () {
        var pos = await UI.ubicacion(8000);
        try {
          mias = await DATOS.pedir('entregaEntregado', { id: id, lat: pos ? pos.lat : '', lng: pos ? pos.lng : '', foto: foto, codigo: codigo }, { guardar: true });
          UI.vibrar([30, 40, 30]); UI.aviso('¡Entrega registrada! 🎉', 'ok');
          pintarMias();
        } catch (err) { UI.error('No se guardó', err.message); if (err.codigo === 'CAMBIO') cargarMias(); }
      });
    }
  }
})(window);
