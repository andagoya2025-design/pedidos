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
  var soloBajos = false, busca = '';

  APP.vistas.inventario = {
    titulo: 'Inventario', icono: '📦', orden: 50, roles: ['dueno', 'cajero'],
    pintar: function (cont) {
      cont.innerHTML = UI.encabezado('Inventario', APP.nombreLocal(APP.local)) +
        '<div class="acciones" style="margin:0 0 12px">' + (APP.sesion.rol === 'dueno' ? '<button class="btn" type="button" id="btn-nuevo-insumo">＋ Nuevo insumo</button>' : '') +
        '<label class="interruptor" style="flex:1 1 160px"><input type="checkbox" id="solo-bajos"' + (soloBajos ? ' checked' : '') + '> Solo bajo el mínimo</label></div>' +
        '<div class="campo" style="margin:0 0 12px"><label class="solo-lector" for="in-busca">Buscar insumo</label><input class="entrada" id="in-busca" type="search" placeholder="🔎 Buscar insumo…" value="' + UI.esc(busca) + '" autocomplete="off"></div>' +
        '<div id="in-cuerpo">' + UI.esqueleto(4) + '</div>';
      UI.$('[data-actualizar]', cont).addEventListener('click', function (e) { UI.trabajando(e.currentTarget, cargar); });
      var n = UI.$('#btn-nuevo-insumo', cont); if (n) n.addEventListener('click', function () { editar(null); });
      UI.$('#solo-bajos', cont).addEventListener('change', function (e) { soloBajos = e.target.checked; pintar(); });
      UI.$('#in-busca', cont).addEventListener('input', function (e) { busca = e.target.value; pintar(); });
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
    function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }
    var q = norm(busca);
    return lista.filter(function (i) { return (APP.local === 'TODOS' || i.local_id === APP.local) && (!soloBajos || i.bajo) && (!q || norm(i.nombre).indexOf(q) >= 0); });
  }

  function pintar() {
    var c = UI.$('#in-cuerpo');
    if (!c) return;
    var lista = filtrar(insumos);
    var bajos = insumos.filter(function (i) { return i.bajo && (APP.local === 'TODOS' || i.local_id === APP.local); }).length;
    c.innerHTML = (bajos ? '<div class="banda error banda-accion">📉 <span>' + bajos + ' insumo(s) en o bajo el mínimo.</span><button class="btn chico" type="button" id="btn-compras">🛒 Lista de compras</button></div>' : '') +
      (lista.length ? '<div class="lista">' + lista.map(function (i) {
        return '<div class="tarjeta insumo' + (i.bajo ? ' bajo' : '') + '"><div class="insumo-cabeza"><div class="item-cuerpo">' +
          '<div class="item-titulo">' + UI.esc(i.nombre) + (i.activo ? '' : ' <span class="etiqueta mal">Inactivo</span>') + '</div>' +
          '<div class="item-sub">' + [APP.local === 'TODOS' ? UI.esc(i.local) : '', i.costo !== '' ? UI.esc(UI.dinero(i.costo)) + ' c/' + UI.esc(i.unidad) : '', i.proveedor ? 'Prov.: ' + UI.esc(i.proveedor) : ''].filter(String).join(' · ') + '</div></div>' +
          '<div class="insumo-stock"><b>' + i.stock + '</b><span>' + UI.esc(i.unidad) + ' · mín. ' + i.minimo + '</span></div></div>' +
          '<div class="insumo-botones"><button class="btn chico" type="button" data-mov="compra" data-id="' + UI.esc(i.id) + '">＋ Compra</button>' +
          '<button class="btn secundario chico" type="button" data-mov="mas" data-id="' + UI.esc(i.id) + '">⋯ Más</button></div></div>';
      }).join('') + '</div>' : UI.vacio('📦', soloBajos ? 'Nada bajo el mínimo. 👍' : busca ? 'No hay insumos con ese nombre.' : (APP.sesion.rol === 'dueno' ? 'Aún no hay insumos. Toque «Nuevo insumo».' : 'Aún no hay insumos en su local.')));
    UI.$$('[data-mov]', c).forEach(function (b) { b.addEventListener('click', function () { movimiento(b, b.getAttribute('data-mov'), b.getAttribute('data-id')); }); });
    var bc = UI.$('#btn-compras', c); if (bc) bc.addEventListener('click', listaCompras);
  }

  /* 3.1.3: lista de compras de lo que está bajo el mínimo, por proveedor, lista para WhatsApp. */
  function listaCompras() {
    var bajos = insumos.filter(function (i) { return i.activo && i.bajo && (APP.local === 'TODOS' || i.local_id === APP.local); });
    var grupos = {};
    bajos.forEach(function (i) {
      var k = (i.proveedor || 'Sin proveedor') + '|' + (i.proveedor_tel || '') + '|' + i.local_id;
      var pedir = Math.max(Math.ceil(i.minimo * 2 - i.stock), 1);
      (grupos[k] = grupos[k] || { proveedor: i.proveedor || 'Sin proveedor', tel: i.proveedor_tel, local: i.local, items: [] }).items.push({ i: i, cant: pedir });
    });
    var ks = Object.keys(grupos), neg = (APP.publico && APP.publico.negocio_nombre) || '';
    function texto(g) {
      return 'Hola' + (g.proveedor !== 'Sin proveedor' ? ' ' + g.proveedor : '') + ', le escribo de ' + neg + (g.local ? ' (' + g.local + ')' : '') + '. Necesito:\n' +
        g.items.map(function (x) { return '- ' + x.i.nombre + ': ' + x.cant + ' ' + x.i.unidad; }).join('\n') + '\n¿Me confirma precio y hora de entrega? Gracias.';
    }
    UI.ventana({
      icono: '🛒', titulo: 'Lista de compras', texto: 'Lo que está en o bajo el mínimo. Se sugiere comprar hasta el doble del mínimo.',
      html: ks.map(function (k, n) {
        var g = grupos[k], total = g.items.reduce(function (s, x) { return s + (x.i.costo !== '' ? x.i.costo * x.cant : 0); }, 0);
        return '<div class="tarjeta compra-grupo"><h4>' + UI.esc(g.proveedor) + (APP.local === 'TODOS' && g.local ? ' <small>· ' + UI.esc(g.local) + '</small>' : '') + '</h4><div class="lista">' +
          g.items.map(function (x) { return '<div class="item"><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(x.i.nombre) + '</div><div class="item-sub">Hay ' + x.i.stock + ' · mín. ' + x.i.minimo + '</div></div><b>' + x.cant + ' ' + UI.esc(x.i.unidad) + '</b></div>'; }).join('') + '</div>' +
          (total ? '<p class="ayuda">Total aprox.: ' + UI.esc(UI.dinero(Math.round(total * 100) / 100)) + '</p>' : '') +
          (g.tel ? '<button class="btn bloque" type="button" data-wa="' + n + '">💬 Enviar por WhatsApp</button>' : '<button class="btn secundario bloque" type="button" data-copiar="' + n + '">📋 Copiar lista</button><p class="ayuda">Ponga el WhatsApp del proveedor en Editar insumo para enviarlo directo.</p>') + '</div>';
      }).join(''),
      alAbrir: function (v) {
        UI.$$('[data-wa]', v).forEach(function (b) { b.addEventListener('click', function () { var g = grupos[ks[Number(b.getAttribute('data-wa'))]]; UI.abrirWhatsApp(g.tel, texto(g)); }); });
        UI.$$('[data-copiar]', v).forEach(function (b) { b.addEventListener('click', function () { UI.copiar(texto(grupos[ks[Number(b.getAttribute('data-copiar'))]])); }); });
      },
      botones: [{ texto: 'Cerrar', valor: null, clase: 'secundario' }]
    });
  }

  async function editar(i) {
    var nuevo = !i;
    i = i || { id: '', nombre: '', unidad: '', minimo: '', local_id: APP.local === 'TODOS' ? ((APP.locales.filter(function (l) { return l.activo; })[0] || {}).id || '') : APP.local, activo: true };
    var enviar = null;
    var locales = APP.locales.filter(function (l) { return l.activo || l.id === i.local_id; });
    var ok = await UI.ventana({
      icono: '📦', titulo: nuevo ? 'Nuevo insumo' : 'Editar insumo',
      html: '<form id="form-insumo" autocomplete="off"><div class="campo"><label for="ins-nombre">Nombre</label><input class="entrada" id="ins-nombre" name="nombre" maxlength="60" placeholder="Ej. Pollo (presas)" value="' + UI.esc(i.nombre) + '"></div>' +
        '<div class="campo"><label for="ins-unidad">Unidad</label><input class="entrada" id="ins-unidad" name="unidad" maxlength="15" placeholder="presa, kg, litro, unidad" value="' + UI.esc(i.unidad) + '"></div>' +
        '<div class="fila-campos fila-dos"><div class="campo"><label for="ins-min">Mínimo (aviso)</label><input class="entrada" id="ins-min" name="minimo" inputmode="decimal" placeholder="Ej. 5" value="' + UI.esc(i.minimo) + '"><span class="ayuda">Le avisamos cuando quede esta cantidad o menos.</span></div>' +
        (nuevo ? '<div class="campo"><label for="ins-stock">Cantidad inicial</label><input class="entrada" id="ins-stock" name="stock" inputmode="decimal" placeholder="0"><span class="ayuda">Lo que hay hoy.</span></div>' : '') + '</div>' +
        (locales.length > 1 ? '<div class="campo"><label for="ins-local">Local</label><select class="entrada" id="ins-local" name="local_id"' + (nuevo ? '' : ' disabled') + '>' +
        locales.map(function (l) { return '<option value="' + UI.esc(l.id) + '"' + (l.id === i.local_id ? ' selected' : '') + '>' + UI.esc(l.nombre) + '</option>'; }).join('') + '</select></div>'
          : '<input type="hidden" id="ins-local" name="local_id" value="' + UI.esc(i.local_id || (locales[0] || {}).id || '') + '">') +
        '<div class="fila-campos"><div class="campo"><label for="ins-costo">Costo por unidad (USD)</label><input class="entrada" id="ins-costo" name="costo" inputmode="decimal" placeholder="Ej. 2,50" value="' + UI.esc(i.costo === undefined ? '' : i.costo) + '"><span class="ayuda">Para saber cuánto gana en cada plato.</span></div>' +
        '<div class="campo"><label for="ins-prov">Proveedor</label><input class="entrada" id="ins-prov" name="proveedor" maxlength="60" placeholder="Ej. Avícola Sur" value="' + UI.esc(i.proveedor || '') + '"></div>' +
        '<div class="campo"><label for="ins-provtel">WhatsApp del proveedor</label><input class="entrada" id="ins-provtel" name="proveedor_tel" inputmode="tel" placeholder="0991234567" value="' + UI.esc(i.proveedor_tel || '') + '"></div></div>' +
        (nuevo ? '' : '<p class="ayuda">La cantidad no se edita aquí: use Compra, Salida o Conteo (queda en el historial).</p>') +
        '<label class="interruptor"><input type="checkbox" name="activo"' + (i.activo ? ' checked' : '') + '> Activo</label></form>',
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Guardar', valor: true, antes: function (v) {
        enviar = UI.leerFormulario(UI.$('#form-insumo', v));
        enviar.local_id = UI.$('#ins-local', v).value;
        enviar.minimo = UI.numero(enviar.minimo || 0);
        enviar.costo = String(enviar.costo || '').trim() === '' ? '' : UI.numero(enviar.costo);
        if (enviar.costo !== '' && !(enviar.costo >= 0)) { UI.aviso('Costo no válido.', 'error'); return false; }
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
    if (tipo === 'mas') { // 3.1.3: menos botones a la vista
      var op = await UI.ventana({ icono: '📦', titulo: i.nombre, texto: 'Hay ' + i.stock + ' ' + i.unidad + '.',
        botones: [['salida', '− Salida (dañado, consumo…)'], ['conteo', '🔢 Conteo físico'], ['traspaso', '⇄ Traspaso a otro local'], ['historial', '🕘 Historial']].concat(APP.sesion.rol === 'dueno' ? [['editar', '✏️ Editar (costo, proveedor, mínimo)']] : [])
          .map(function (o) { return { texto: o[1], valor: o[0], clase: 'borde opcion-lista' }; }).concat([{ texto: 'Cerrar', valor: null, clase: 'secundario' }]) });
      if (!op) return;
      return movimiento(boton, op, id);
    }
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
