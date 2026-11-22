/**
 * ============================================================
 * CAJA por local y día de trabajo — fase 7.
 * Apertura con fondo → salidas/entradas con motivo → fondo y
 * liquidación de cada motorizado → transferencias verificadas →
 * cierre: debía haber vs. contado = diferencia → resumen al dueño
 * por WhatsApp. No se cierra si un motorizado no entregó.
 * ============================================================
 */
(function (global) {
  'use strict';
  var UI = global.UI, DATOS = global.DATOS, APP = global.APP;
  var est = null, motos = [];

  APP.vistas.caja = {
    titulo: 'Caja', icono: '💵', orden: 40, roles: ['dueno', 'cajero'],
    pintar: function (cont) {
      cont.innerHTML = UI.encabezado('Caja', APP.nombreLocal(APP.local)) + '<div id="cj-cuerpo">' + UI.esqueleto(3) + '</div>';
      UI.$('[data-actualizar]', cont).addEventListener('click', function (e) { UI.trabajando(e.currentTarget, cargar); });
      if (APP.local === 'TODOS') {
        // 3.0: botones grandes por local (antes: «elija arriba»).
        var activos = APP.locales.filter(function (l) { return l.activo; });
        UI.$('#cj-cuerpo').innerHTML = '<div class="tarjeta"><h3 style="margin-top:0">💵 ¿De qué local es la caja?</h3><p class="subtitulo">La caja se lleva por local. Toque uno:</p>' +
          '<div class="tipos-entrega">' + activos.map(function (l) { return '<button class="tipo-op" type="button" data-cj-local="' + UI.esc(l.id) + '"><span class="tipo-ico">🏪</span><b>' + UI.esc(l.nombre) + '</b><small>' + UI.esc(l.direccion || 'Abrir caja') + '</small></button>'; }).join('') + '</div></div>';
        UI.$$('[data-cj-local]').forEach(function (b) {
          b.addEventListener('click', function () {
            var sel = UI.$('#selector-local');
            sel.value = b.getAttribute('data-cj-local');
            sel.dispatchEvent(new Event('change'));
          });
        });
        return;
      }
      cargar();
    }
  };

  function cuerpo() { return UI.$('#cj-cuerpo'); }

  async function cargar() {
    if (APP.local === 'TODOS') return;
    var r = await Promise.allSettled([DATOS.pedir('cajaEstado', { local_id: APP.local }), DATOS.pedir('motorizadosListar', { local_id: APP.local })]);
    if (!cuerpo()) return;
    if (r[0].status !== 'fulfilled') { cuerpo().innerHTML = '<div class="banda error">⚠️ <span>' + UI.esc(r[0].reason.message) + '</span></div>'; return; }
    est = r[0].value;
    motos = r[1].status === 'fulfilled' ? (r[1].value.motorizados || []).filter(function (m) { return m.activo !== false; }) : [];
    pintar();
  }

  function cifra(rotulo, valor, clase) { return '<div class="cifra' + (clase ? ' ' + clase : '') + '"><div class="rotulo">' + UI.esc(rotulo) + '</div><div class="valor">' + valor + '</div></div>'; }
  function d(n) { return UI.esc(UI.dinero(n)); }

  function pintar() {
    var c = cuerpo();
    if (!c) return;
    if (!est.caja) {
      var u = est.ultima_cerrada;
      c.innerHTML = '<form class="tarjeta" id="form-abrir" style="max-width:560px"><h3 style="margin-top:0">Abrir caja de hoy</h3>' +
        '<p class="subtitulo">Cuente el dinero de cambio con el que empieza el turno.</p>' +
        '<div class="campo"><label for="cj-fondo">Fondo de cambio</label><input class="entrada" id="cj-fondo" inputmode="decimal" placeholder="0.00"></div>' +
        '<button class="btn bloque" type="submit">Abrir caja</button></form>' +
        (u ? '<div class="tarjeta" style="margin-top:14px;max-width:560px"><h3 style="margin-top:0">Último cierre</h3><p class="subtitulo" style="margin:0">' + UI.esc(u.dia_trabajo.split('-').reverse().join('/')) + ' · contado ' + d(u.contado) + ' · diferencia <b style="color:' + (u.diferencia < 0 ? 'var(--error)' : 'var(--exito)') + '">' + d(u.diferencia) + '</b> · cerró @' + UI.esc(u.cerrada_por) + '</p></div>' : '');
      UI.$('#form-abrir').addEventListener('submit', function (e) {
        e.preventDefault();
        var monto = UI.numero(UI.$('#cj-fondo').value || 0);
        if (!(monto >= 0)) return UI.aviso('Escriba el fondo.', 'error');
        guardar(e.target.querySelector('button'), 'cajaAbrir', { fondo: monto }, 'Caja abierta.');
      });
      return;
    }
    var r = est.resumen;
    c.innerHTML =
      '<p class="subtitulo">Día de trabajo ' + UI.esc(est.caja.dia_trabajo.split('-').reverse().join('/')) + ' · abrió @' + UI.esc(est.caja.abierta_por) + ' a las ' + UI.esc(UI.hora(est.caja.apertura)) + '</p>' +
      '<div class="cifras">' +
      cifra('Debe haber en caja', d(r.esperado), 'destacada') + cifra('Fondo inicial', d(r.fondo)) + cifra('Efectivo de motorizados', d(r.liquidado)) + cifra('Efectivo en el local', d(r.efectivo_local)) +
      cifra('Entradas', d(r.entradas)) + cifra('Salidas', d(r.salidas)) + cifra('Fondos a motorizados', d(r.fondos_motorizado)) + cifra('Ventas del día', d(r.ventas) + ' <small style="font-size:13px">(' + r.pedidos + ')</small>') +
      '</div>' +
      '<div class="acciones" style="margin:14px 0">' +
      '<button class="btn secundario" type="button" data-c="salida">− Salida</button>' +
      '<button class="btn secundario" type="button" data-c="entrada">＋ Entrada</button>' +
      '<button class="btn secundario" type="button" data-c="fondo">🛵 Fondo a motorizado</button>' +
      '<button class="btn" type="button" data-c="cerrar">🔒 Cerrar caja</button></div>' +
      '<div class="rejilla">' +
      '<div class="tarjeta"><h3 style="margin-top:0">🛵 Motorizados por liquidar</h3>' + (est.pendientes.length ? '<div class="lista">' + est.pendientes.map(function (p) {
        return '<div class="item" style="flex-wrap:wrap"><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(p.nombre) + '</div><div class="item-sub">Fondo ' + d(p.fondo) + ' + cobrado ' + d(p.efectivo) + (p.pedidos.length ? ' · ' + UI.esc(p.pedidos.join(', ')) : '') + '</div></div>' +
          '<b style="font-size:18px">' + d(p.total) + '</b><button class="btn chico" type="button" data-liquidar="' + UI.esc(p.id) + '" style="flex-basis:100%">Recibir dinero</button></div>';
      }).join('') + '</div>' : '<p class="subtitulo" style="margin:0">Nadie tiene dinero pendiente. ✅</p>') + '</div>' +
      '<div class="tarjeta"><h3 style="margin-top:0">' + (APP.publico && APP.publico.deuna_qr_url ? '🏦 Pagos al banco hoy <small style="font-weight:600;color:var(--texto-2)">(transferencia o app Deuna)</small>' : '🏦 Transferencias del día') + '</h3>' +
        '<p class="ayuda" style="margin:-4px 0 10px">Dinero que el cliente pagó directo a la cuenta del negocio. Revise en su banco que llegó y toque «Verificar».</p>' + (est.transferencias.length ? '<div class="lista">' + est.transferencias.map(function (t) {
        return '<div class="item"><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(t.numero) + ' · ' + d(t.total) + '</div><div class="item-sub">' + (t.forma === 'deuna' ? '📲 Deuna · ' : '🏦 ') + UI.esc(t.cliente) + ' · ' + UI.esc(t.estado) + '</div></div>' +
          (t.verificado ? '<span class="etiqueta ok">Verificada</span>' : '<button class="btn chico" type="button" data-verificar="' + UI.esc(t.id) + '">Verificar</button>') + '</div>';
      }).join('') + '</div>' + (r.transferencias_pendientes ? '<p class="ayuda" style="margin:8px 0 0">Sin verificar: ' + d(r.transferencias_pendientes) + '</p>' : '') : '<p class="subtitulo" style="margin:0">Sin pagos digitales hoy.</p>') + '</div>' +
      '</div>' +
      '<div class="tarjeta" style="margin-top:14px"><h3 style="margin-top:0">Movimientos</h3>' + (est.movimientos.length || est.liquidaciones.length ? '<div class="lista">' +
        est.liquidaciones.map(function (l) {
          var m = motos.filter(function (x) { return x.id === l.motorizado_id; })[0];
          return '<div class="item"><div class="item-cuerpo"><div class="item-titulo">Liquidación · ' + UI.esc(m ? m.nombre : '') + '</div><div class="item-sub">' + UI.esc(UI.hora(l.fecha)) + ' · debía ' + d(l.fondo + l.efectivo_cobrado) + ' · recibió @' + UI.esc(l.recibido_por) + '</div></div><div style="text-align:right"><b>' + d(l.entregado) + '</b>' + (l.diferencia ? '<div class="item-sub" style="color:' + (l.diferencia < 0 ? 'var(--error)' : 'var(--exito)') + '">dif. ' + d(l.diferencia) + '</div>' : '') + '</div></div>';
        }).join('') +
        est.movimientos.map(function (m) {
          var signo = m.tipo === 'entrada' ? '+' : '−';
          return '<div class="item"><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(m.tipo === 'fondo_motorizado' ? 'Fondo a motorizado' : m.tipo === 'entrada' ? 'Entrada' : 'Salida') + '</div><div class="item-sub">' + UI.esc(UI.hora(m.fecha)) + ' · ' + UI.esc(m.motivo) + ' · @' + UI.esc(m.usuario) + '</div></div><b style="color:' + (m.tipo === 'entrada' ? 'var(--exito)' : 'var(--error)') + '">' + signo + ' ' + d(m.monto) + '</b></div>';
        }).join('') + '</div>' : '<p class="subtitulo" style="margin:0">Sin movimientos todavía.</p>') + '</div>';
    UI.$$('[data-c]', c).forEach(function (b) { b.addEventListener('click', function () { accion(b, b.getAttribute('data-c')); }); });
    UI.$$('[data-liquidar]', c).forEach(function (b) { b.addEventListener('click', function () { liquidar(b, b.getAttribute('data-liquidar')); }); });
    UI.$$('[data-verificar]', c).forEach(function (b) {
      b.addEventListener('click', function () {
        UI.trabajando(b, async function () {
          try { await DATOS.pedir('pedidoPagoVerificar', { id: b.getAttribute('data-verificar'), verificado: true }, { guardar: true }); UI.aviso('Transferencia verificada.', 'ok'); await cargar(); }
          catch (err) { UI.error('No se guardó', err.message); }
        });
      });
    });
  }

  async function guardar(boton, accionServidor, datos, okTexto) {
    datos.local_id = APP.local;
    return UI.trabajando(boton, async function () {
      try {
        var r = await DATOS.pedir(accionServidor, datos, { guardar: true });
        est = r;
        if (okTexto) UI.aviso(okTexto, 'ok');
        pintar();
        return r;
      } catch (err) {
        // 3.0: el cierre avisa antes (pedidos en camino, pagos sin verificar) y pide confirmar.
        if (err.codigo === 'CONFIRMAR' && accionServidor === 'cajaCerrar') {
          var seguir = await UI.confirmar('Antes de cerrar, revise', err.message, 'Cerrar de todos modos', true);
          if (!seguir) return null;
          datos.confirmar = true;
          try {
            var r2 = await DATOS.pedir(accionServidor, datos, { guardar: true });
            est = r2; if (okTexto) UI.aviso(okTexto, 'ok'); pintar(); return r2;
          } catch (err2) { UI.error('No se guardó', err2.message); return null; }
        }
        UI.error('No se guardó', err.message);
        return null;
      }
    });
  }

  async function accion(boton, que) {
    if (que === 'salida' || que === 'entrada') {
      var datos = null;
      var ok = await UI.ventana({
        icono: que === 'salida' ? '➖' : '➕', titulo: que === 'salida' ? 'Salida de efectivo' : 'Entrada de efectivo',
        html: '<form id="form-cmov"><div class="campo"><label for="cm-monto">Monto</label><input class="entrada" id="cm-monto" inputmode="decimal" placeholder="0.00"></div>' +
          '<div class="campo"><label for="cm-motivo">Motivo</label><input class="entrada" id="cm-motivo" maxlength="200" placeholder="' + (que === 'salida' ? 'Ej. compra de gas, pago a proveedor' : 'Ej. cambio adicional') + '"></div></form>',
        botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Guardar', valor: true, antes: function (v) {
          datos = { tipo: que, monto: UI.numero(UI.$('#cm-monto', v).value), motivo: UI.$('#cm-motivo', v).value.trim() };
          var malo = !(datos.monto > 0) ? 'Escriba el monto.' : datos.motivo.length < 3 ? 'Escriba el motivo.' : '';
          if (malo) { UI.aviso(malo, 'error'); return false; }
          return true;
        } }]
      });
      if (ok) guardar(boton, 'cajaMovimiento', datos, 'Movimiento guardado.');
      return;
    }
    if (que === 'fondo') {
      if (!motos.length) return UI.error('No hay motorizados', 'Registre motorizados activos para este local.');
      var f = null;
      var ok2 = await UI.ventana({
        icono: '🛵', titulo: 'Fondo de cambio a motorizado', texto: 'Sale de la caja y queda anotado a su nombre hasta que liquide.',
        html: '<form id="form-fondo"><div class="campo"><label for="fo-moto">Motorizado</label><select class="entrada" id="fo-moto">' + motos.map(function (m) { return '<option value="' + UI.esc(m.id) + '">' + UI.esc(m.nombre) + '</option>'; }).join('') + '</select></div>' +
          '<div class="campo"><label for="fo-monto">Monto</label><input class="entrada" id="fo-monto" inputmode="decimal" placeholder="0.00"></div></form>',
        botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Entregar fondo', valor: true, antes: function (v) {
          f = { motorizado_id: UI.$('#fo-moto', v).value, monto: UI.numero(UI.$('#fo-monto', v).value) };
          if (!(f.monto > 0)) { UI.aviso('Escriba el monto.', 'error'); return false; }
          return true;
        } }]
      });
      if (ok2) guardar(boton, 'cajaFondoMotorizado', f, 'Fondo anotado.');
      return;
    }
    if (que === 'cerrar') return cerrar(boton);
  }

  async function liquidar(boton, motoId) {
    var p = est.pendientes.filter(function (x) { return x.id === motoId; })[0];
    if (!p) return;
    var monto = await UI.pedirDato({
      icono: '💵', titulo: 'Recibir dinero de ' + p.nombre, texto: 'Debe entregar ' + UI.dinero(p.total) + ' (fondo ' + UI.dinero(p.fondo) + ' + cobrado ' + UI.dinero(p.efectivo) + '). Cuente y escriba lo que entregó.',
      etiqueta: 'Dinero contado', modo: 'decimal', valor: p.total.toFixed(2), boton: 'Registrar',
      validar: function (v) { return !(UI.numero(v) >= 0) ? 'Escriba el monto.' : ''; }
    });
    if (monto === null) return;
    var r = await guardar(boton, 'cajaLiquidar', { motorizado_id: motoId, entregado: UI.numero(monto) }, '');
    if (r && r.liquidacion) {
      var dif = r.liquidacion.diferencia;
      UI.ventana({ icono: dif === 0 ? '✅' : '⚠️', titulo: dif === 0 ? 'Cuadró exacto' : (dif < 0 ? 'Faltan ' + UI.dinero(-dif) : 'Sobran ' + UI.dinero(dif)), texto: p.nombre + ' entregó ' + UI.dinero(r.liquidacion.entregado) + '. Queda registrado.' });
    }
  }

  async function cerrar(boton) {
    if (est.pendientes.length) return UI.error('Aún no se puede cerrar', 'Falta recibir el dinero de: ' + est.pendientes.map(function (p) { return p.nombre + ' (' + UI.dinero(p.total) + ')'; }).join(', ') + '.');
    var contado = await UI.pedirDato({
      icono: '🔒', titulo: 'Cerrar caja', texto: 'Cuente todo el efectivo de la caja. Debe haber ' + UI.dinero(est.resumen.esperado) + '.' + (est.resumen.transferencias_pendientes ? ' Ojo: hay transferencias sin verificar.' : ''),
      etiqueta: 'Efectivo contado', modo: 'decimal', boton: 'Cerrar caja',
      validar: function (v) { return v === '' || !(UI.numero(v) >= 0) ? 'Escriba cuánto contó.' : ''; }
    });
    if (contado === null) return;
    var r = await guardar(boton, 'cajaCerrar', { contado: UI.numero(contado) }, 'Caja cerrada.');
    if (r && r.cierre) {
      var dif = r.cierre.resumen.diferencia;
      var enviar = await UI.ventana({
        icono: dif === 0 ? '✅' : '⚠️', titulo: 'Caja cerrada · diferencia ' + UI.dinero(dif),
        html: '<pre style="white-space:pre-wrap;font:inherit;background:var(--superficie-2);border-radius:14px;padding:12px;margin:0 0 12px">' + UI.esc(r.cierre.texto.replace(/\*/g, '')) + '</pre>',
        botones: [{ texto: 'Cerrar', valor: false, clase: 'secundario' }, { texto: '💬 Enviar al dueño', valor: true }]
      });
      if (enviar) UI.abrirWhatsApp(r.cierre.whatsapp_dueno, r.cierre.texto);
    }
  }
})(window);
