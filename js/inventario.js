/**
 * ============================================================
 * INVENTARIO por local — fase 6. Compras, salidas con motivo,
 * conteo físico con diferencia y traspasos entre locales.
 * El stock solo cambia con movimientos (todo queda en el historial).
 * La receta de cada plato se arma en Menú → Editar plato → Receta.
 * ============================================================
 */
(function (global) {
  'use strict';
  var UI = global.UI, DATOS = global.DATOS, APP = global.APP;
  var insumos = [];
  var soloBajos = false;

  APP.vistas.inventario = {
    titulo: 'Inventario', icono: '📦', orden: 50, roles: ['dueno', 'cajero'],
    pintar: function (cont) {
      cont.innerHTML = UI.encabezado('Inventario', APP.nombreLocal(APP.local)) +
        '<div class="acciones" style="margin:0 0 12px">' + (APP.sesion.rol === 'dueno' ? '<button class="btn" type="button" id="btn-nuevo-insumo">＋ Nuevo insumo</button>' : '') +
        '<label class="interruptor" style="flex:1 1 160px"><input type="checkbox" id="solo-bajos"' + (soloBajos ? ' checked' : '') + '> Solo bajo el mínimo</label></div>' +
        '<div id="in-cuerpo">' + UI.esqueleto(4) + '</div>';
      UI.$('[data-actualizar]', cont).addEventListener('click', function (e) { UI.trabajando(e.currentTarget, cargar); });
      var n = UI.$('#btn-nuevo-insumo', cont); if (n) n.addEventListener('click', function () { editar(null); });
      UI.$('#solo-bajos', cont).addEventListener('change', function (e) { soloBajos = e.target.checked; pintar(); });
      cargar();
    }
  };

  async function cargar() {
    try {
      insumos = (await DATOS.pedir('insumosListar', { local_id: APP.local })).insumos || [];
      pintar();
    } catch (err) {
      if (UI.$('#in-cuerpo')) UI.$('#in-cuerpo').innerHTML = '<div class="banda error">⚠️ <span>' + UI.esc(err.message) + '</span></div>';
    }
  }

  function filtrar(lista) {
    // Al traer TODOS y luego elegir un local arriba, se muestra solo ese local.
    return lista.filter(function (i) { return (APP.local === 'TODOS' || i.local_id === APP.local) && (!soloBajos || i.bajo); });
  }

  function pintar() {
    var c = UI.$('#in-cuerpo');
    if (!c) return;
    var lista = filtrar(insumos);
    var bajos = insumos.filter(function (i) { return i.bajo && (APP.local === 'TODOS' || i.local_id === APP.local); }).length;
    c.innerHTML = (bajos ? '<div class="banda error">📉 <span>' + bajos + ' insumo(s) en o bajo el mínimo. Toque «Compra» para reponer.</span></div>' : '') +
      (lista.length ? '<div class="lista">' + lista.map(function (i) {
        return '<div class="item" style="flex-wrap:wrap"><div class="avatar" aria-hidden="true">' + (i.bajo ? '📉' : '📦') + '</div><div class="item-cuerpo" style="min-width:150px">' +
          '<div class="item-titulo">' + UI.esc(i.nombre) + (i.activo ? '' : ' <span class="etiqueta mal">Inactivo</span>') + '</div>' +
          '<div class="item-sub">' + (APP.local === 'TODOS' ? UI.esc(i.local) + ' · ' : '') + 'mínimo ' + i.minimo + ' ' + UI.esc(i.unidad) + '</div></div>' +
          '<div style="text-align:right"><div style="font-weight:800;font-size:20px' + (i.bajo ? ';color:var(--error)' : '') + '">' + i.stock + '</div><div class="item-sub">' + UI.esc(i.unidad) + '</div></div>' +
          '<div class="mov-botones">' +
          '<button class="btn chico" type="button" data-mov="compra" data-id="' + UI.esc(i.id) + '">＋ Compra</button>' +
          '<button class="btn secundario chico" type="button" data-mov="salida" data-id="' + UI.esc(i.id) + '">− Salida</button>' +
          '<button class="btn secundario chico" type="button" data-mov="conteo" data-id="' + UI.esc(i.id) + '">🔢 Conteo</button>' +
          '<button class="btn secundario chico" type="button" data-mov="traspaso" data-id="' + UI.esc(i.id) + '">⇄ Traspaso</button>' +
          '<button class="btn borde chico" type="button" data-mov="historial" data-id="' + UI.esc(i.id) + '">🕘 Historial</button>' +
          (APP.sesion.rol === 'dueno' ? '<button class="btn borde chico" type="button" data-mov="editar" data-id="' + UI.esc(i.id) + '">Editar</button>' : '') +
          '</div></div>';
      }).join('') + '</div>' : UI.vacio('📦', soloBajos ? 'Nada bajo el mínimo. 👍' : (APP.sesion.rol === 'dueno' ? 'Aún no hay insumos. Toque «Nuevo insumo».' : 'Aún no hay insumos en su local.')));
    UI.$$('[data-mov]', c).forEach(function (b) { b.addEventListener('click', function () { movimiento(b, b.getAttribute('data-mov'), b.getAttribute('data-id')); }); });
  }

  async function editar(i) {
    var nuevo = !i;
    i = i || { id: '', nombre: '', unidad: '', minimo: '', local_id: APP.local === 'TODOS' ? ((APP.locales.filter(function (l) { return l.activo; })[0] || {}).id || '') : APP.local, activo: true };
    var enviar = null;
    var ok = await UI.ventana({
      icono: '📦', titulo: nuevo ? 'Nuevo insumo' : 'Editar insumo',
      html: '<form id="form-insumo" autocomplete="off"><div class="campo"><label for="ins-nombre">Nombre</label><input class="entrada" id="ins-nombre" name="nombre" maxlength="60" placeholder="Ej. Pollo (presas)" value="' + UI.esc(i.nombre) + '"></div>' +
        '<div class="fila-campos"><div class="campo"><label for="ins-unidad">Unidad</label><input class="entrada" id="ins-unidad" name="unidad" maxlength="15" placeholder="presa, kg, litro, unidad" value="' + UI.esc(i.unidad) + '"></div>' +
        '<div class="campo"><label for="ins-min">Mínimo (aviso)</label><input class="entrada" id="ins-min" name="minimo" inputmode="decimal" value="' + UI.esc(i.minimo) + '"></div>' +
        (nuevo ? '<div class="campo"><label for="ins-stock">Cantidad inicial</label><input class="entrada" id="ins-stock" name="stock" inputmode="decimal" placeholder="0"></div>' : '') +
        '<div class="campo"><label for="ins-local">Local</label><select class="entrada" id="ins-local" name="local_id"' + (nuevo ? '' : ' disabled') + '>' +
        APP.locales.filter(function (l) { return l.activo || l.id === i.local_id; }).map(function (l) { return '<option value="' + UI.esc(l.id) + '"' + (l.id === i.local_id ? ' selected' : '') + '>' + UI.esc(l.nombre) + '</option>'; }).join('') + '</select></div></div>' +
        (nuevo ? '' : '<p class="ayuda">La cantidad no se edita aquí: use Compra, Salida o Conteo (queda en el historial).</p>') +
        '<label class="interruptor"><input type="checkbox" name="activo"' + (i.activo ? ' checked' : '') + '> Activo</label></form>',
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Guardar', valor: true, antes: function (v) {
        enviar = UI.leerFormulario(UI.$('#form-insumo', v));
        enviar.local_id = UI.$('#ins-local', v).value;
        enviar.minimo = UI.numero(enviar.minimo || 0);
        if (nuevo) enviar.stock = UI.numero(enviar.stock || 0);
        var malo = !enviar.nombre ? 'Escriba el nombre.' : !(enviar.minimo >= 0) ? 'Mínimo no válido.' : (nuevo && !(enviar.stock >= 0)) ? 'Cantidad no válida.' : !enviar.local_id ? 'Elija el local.' : '';
        if (malo) { UI.aviso(malo, 'error'); return false; }
        return true;
      } }]
    });
    if (!ok) return;
    enviar.id = i.id;
    try {
      await DATOS.pedir('insumoGuardar', enviar, { guardar: true });
      UI.aviso('Insumo guardado.', 'ok');
      cargar();
    } catch (err) { UI.error('No se guardó', err.message); }
  }

  async function movimiento(boton, tipo, id) {
    var i = insumos.filter(function (x) { return x.id === id; })[0];
    if (!i) return;
    if (tipo === 'editar') return editar(i);
    if (tipo === 'historial') return historial(i);
    var titulos = { compra: '＋ Compra de ', salida: '− Salida de ', conteo: '🔢 Conteo de ', traspaso: '⇄ Traspaso de ' };
    var otros = APP.locales.filter(function (l) { return l.activo && l.id !== i.local_id; });
    if (tipo === 'traspaso' && !otros.length) return UI.error('No hay otro local', 'Necesita al menos dos locales activos.');
    var enviar = null;
    var ok = await UI.ventana({
      icono: '📦', titulo: titulos[tipo] + i.nombre, texto: 'Hay ' + i.stock + ' ' + i.unidad + '.',
      html: '<form id="form-mov" autocomplete="off"><div class="campo"><label for="mv-cant">' + (tipo === 'conteo' ? 'Cantidad contada' : 'Cantidad') + ' (' + UI.esc(i.unidad) + ')</label><input class="entrada" id="mv-cant" name="cantidad" inputmode="decimal"></div>' +
        (tipo === 'traspaso' ? '<div class="campo"><label for="mv-dest">Local que recibe</label><select class="entrada" id="mv-dest" name="local_destino">' + otros.map(function (l) { return '<option value="' + UI.esc(l.id) + '">' + UI.esc(l.nombre) + '</option>'; }).join('') + '</select></div>' : '') +
        '<div class="campo"><label for="mv-motivo">Motivo' + (tipo === 'salida' || tipo === 'traspaso' ? '' : ' (opcional)') + '</label><input class="entrada" id="mv-motivo" name="motivo" maxlength="200" placeholder="' + (tipo === 'compra' ? 'Ej. proveedor, factura' : tipo === 'salida' ? 'Ej. dañado, consumo del personal' : '') + '"></div></form>',
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Guardar', valor: true, antes: function (v) {
        enviar = UI.leerFormulario(UI.$('#form-mov', v));
        enviar.cantidad = UI.numero(enviar.cantidad);
        var malo = !(enviar.cantidad >= 0) || (tipo !== 'conteo' && !(enviar.cantidad > 0)) ? 'Escriba la cantidad.' :
          ((tipo === 'salida' || tipo === 'traspaso') && enviar.motivo.length < 3) ? 'Escriba el motivo.' :
          ((tipo === 'salida' || tipo === 'traspaso') && enviar.cantidad > i.stock) ? 'Solo hay ' + i.stock + ' ' + i.unidad + '.' : '';
        if (malo) { UI.aviso(malo, 'error'); return false; }
        return true;
      } }]
    });
    if (!ok) return;
    enviar.insumo_id = id; enviar.tipo = tipo;
    UI.trabajando(boton, async function () {
      try {
        var r = await DATOS.pedir('inventarioMovimiento', enviar, { guardar: true });
        insumos = r.insumos || insumos;
        var res = r.resultado || {};
        UI.aviso(tipo === 'conteo' ? 'Conteo guardado. Diferencia: ' + (res.diferencia > 0 ? '+' : '') + res.diferencia + ' ' + i.unidad : 'Guardado. Ahora hay ' + res.stock + ' ' + i.unidad + '.', 'ok');
        pintar();
      } catch (err) { UI.error('No se guardó', err.message); }
    });
  }

  async function historial(i) {
    try {
      var r = await DATOS.pedir('inventarioHistorial', { insumo_id: i.id });
      var nombres = { inicial: 'Inicial', compra: 'Compra', salida: 'Salida', conteo: 'Conteo', venta: 'Venta', devolucion: 'Devolución', traspaso_salida: 'Traspaso enviado', traspaso_entrada: 'Traspaso recibido' };
      UI.ventana({ icono: '🕘', titulo: 'Historial · ' + i.nombre,
        html: r.movimientos.length ? '<div class="lista">' + r.movimientos.map(function (m) {
          return '<div class="item" style="min-height:52px"><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(nombres[m.tipo] || m.tipo) + '</div><div class="item-sub">' + UI.esc(UI.fechaHora(m.fecha)) + ' · ' + UI.esc(m.usuario) + (m.motivo ? ' · ' + UI.esc(m.motivo) : '') + '</div></div>' +
            '<b style="color:' + (m.cantidad < 0 ? 'var(--error)' : 'var(--exito)') + '">' + (m.cantidad > 0 ? '+' : '') + m.cantidad + '</b></div>';
        }).join('') + '</div>' : UI.vacio('🕘', 'Sin movimientos.') });
    } catch (err) { UI.error('No se pudo abrir', err.message); }
  }
})(window);
