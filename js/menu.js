/**
 * ============================================================
 * MENÚ (fase 2): platos, categorías, zonas de envío, cupones,
 * clientes y enlace para que los clientes pidan.
 * Dueño: todo. Cajero: solo marcar platos agotados de su local.
 * ============================================================
 */
(function (global) {
  'use strict';
  var UI = global.UI, DATOS = global.DATOS, APP = global.APP;
  var pestana = 'platos';
  var datos = null; // { categorias, platos, zonas }

  var PESTANAS = [
    ['platos', '🍔 Platos', ['dueno', 'cajero']],
    ['categorias', '🗂️ Categorías', ['dueno']],
    ['zonas', '🛵 Zonas de envío', ['dueno']],
    ['cupones', '🎟️ Cupones', ['dueno']],
    ['clientes', '👥 Clientes', ['dueno']],
    ['enlace', '🔗 Enlace y ajustes', ['dueno']]
  ];

  APP.vistas.menu = {
    titulo: 'Menú', icono: '🍔', orden: 20, roles: ['dueno', 'cajero'],
    pintar: function (cont) {
      if ((APP.parametros || {}).p) pestana = APP.parametros.p; // 3.0: la guía abre la pestaña justa
      var mias = PESTANAS.filter(function (p) { return p[2].indexOf(APP.sesion.rol) >= 0; });
      if (!mias.some(function (p) { return p[0] === pestana; })) pestana = 'platos';
      datos = null;
      cont.innerHTML = UI.encabezado('Menú', APP.sesion.rol === 'dueno' ? 'Platos, precios, fotos, envío y cupones' : 'Marque lo que se agotó hoy') +
        (mias.length > 1 ? '<div class="pestanas" role="tablist">' + mias.map(function (p) {
          return '<button class="pestana" role="tab" type="button" data-p="' + p[0] + '" aria-selected="' + (p[0] === pestana) + '">' + p[1] + '</button>';
        }).join('') + '</div>' : '') + '<div id="mn-cuerpo"></div>';
      UI.$$('[data-p]', cont).forEach(function (b) {
        b.addEventListener('click', function () {
          pestana = b.getAttribute('data-p');
          UI.$$('[data-p]', cont).forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
          pintarPestana(false);
        });
      });
      UI.$('[data-actualizar]', cont).addEventListener('click', function (e) { UI.trabajando(e.currentTarget, function () { return pintarPestana(true); }); });
      pintarPestana(false);
    }
  };

  function cuerpo() { return UI.$('#mn-cuerpo'); }

  async function traer(forzar) {
    if (!datos || forzar) datos = await DATOS.pedir('menuListar', { local_id: APP.local });
    return datos;
  }

  async function pintarPestana(forzar) {
    var c = cuerpo();
    if (!c) return;
    c.innerHTML = UI.esqueleto(3);
    try {
      if (pestana === 'platos') await pintarPlatos(forzar);
      else if (pestana === 'categorias') await pintarCategorias(forzar);
      else if (pestana === 'zonas') await pintarZonas(forzar);
      else if (pestana === 'cupones') await pintarCupones();
      else if (pestana === 'clientes') await pintarClientes();
      else if (pestana === 'enlace') await pintarEnlace();
    } catch (err) {
      if (cuerpo()) cuerpo().innerHTML = '<div class="banda error">⚠️ <span>' + UI.esc(err.message) + '</span></div>';
    }
  }

  function nombreLocalCorto(id) { return id === 'TODOS' ? 'Todos los locales' : APP.nombreLocal(id); }
  function opcionesLocal(sel, conTodos) {
    return (conTodos ? '<option value="TODOS"' + (sel === 'TODOS' ? ' selected' : '') + '>Todos los locales</option>' : '') +
      APP.locales.filter(function (l) { return l.activo || l.id === sel; }).map(function (l) {
        return '<option value="' + UI.esc(l.id) + '"' + (l.id === sel ? ' selected' : '') + '>' + UI.esc(l.nombre) + '</option>';
      }).join('');
  }
  function miniatura(url) {
    return '<div class="miniatura" aria-hidden="true">' + (url ? '<img src="' + UI.esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.textContent=\'🍽️\'">' : '🍽️') + '</div>';
  }
  function etiquetaActivo(a) { return '<span class="etiqueta ' + (a ? 'ok' : 'mal') + '">' + (a ? 'Activo' : 'Inactivo') + '</span>'; }

  /* ---------------- Platos ---------------- */
  async function pintarPlatos(forzar) {
    var d = await traer(forzar);
    var dueno = APP.sesion.rol === 'dueno';
    var cats = d.categorias;
    var html = dueno ? '<div class="acciones" style="margin:0 0 12px"><button class="btn" type="button" id="btn-nuevo-plato">＋ Nuevo plato</button>' +
      '<button class="btn borde" type="button" id="btn-ejemplo">✨ Cargar menú de ejemplo</button></div>' : '';
    if (dueno && !cats.length) html += '<div class="banda">💡 <span>Primero cree una categoría (ej. «Pollos», «Combos», «Bebidas») en la pestaña Categorías.</span></div>';
    var sinCat = d.platos.filter(function (p) { return !cats.some(function (c) { return c.id === p.categoria_id; }); });
    var grupos = cats.map(function (c) { return [c.nombre, d.platos.filter(function (p) { return p.categoria_id === c.id; })]; });
    if (sinCat.length) grupos.push(['Sin categoría', sinCat]);
    grupos = grupos.filter(function (g) { return g[1].length; });
    html += grupos.length ? grupos.map(function (g) {
      return '<h3 style="margin:18px 0 10px">' + UI.esc(g[0]) + '</h3><div class="lista">' + g[1].map(function (p) {
        return '<div class="item plato-admin">' + miniatura(p.foto_url) + '<div class="item-cuerpo"><div class="item-titulo">' + UI.esc(p.nombre) + '</div>' +
          '<div class="item-sub">' + UI.dinero(p.precio) + ' · ' + UI.esc(nombreLocalCorto(p.local_id)) + (p.extras.length ? ' · ' + p.extras.length + ' extra(s)' : '') + (p.activo ? '' : ' · <b>oculto</b>') + (p.sugerido ? ' · 🥤 sugerido' : '') + '</div>' +
          (p.etiquetas ? '<div class="chips" style="margin-top:4px">' + UI.chipsEtiquetas(p.etiquetas) + '</div>' : '') + '</div>' +
          '<label class="interruptor" style="min-height:40px;font-size:13px"><input type="checkbox" data-agotado="' + UI.esc(p.id) + '"' + (p.agotado ? ' checked' : '') + '> Agotado</label>' +
          (dueno ? '<button class="btn secundario chico" type="button" data-editar="' + UI.esc(p.id) + '">Editar</button>' : '') + '</div>';
      }).join('') + '</div>';
    }).join('') : UI.vacio('🍔', dueno ? 'Aún no hay platos. Toque «Nuevo plato».' : 'Aún no hay platos en el menú.');
    cuerpo().innerHTML = html;
    var n = UI.$('#btn-nuevo-plato');
    if (n) n.addEventListener('click', function () { editarPlato(null); });
    var ej = UI.$('#btn-ejemplo');
    if (ej) ej.addEventListener('click', async function (e) {
      var ok = await UI.confirmar('¿Cargar el menú de ejemplo?', 'Se agregan 4 categorías y 8 platos ecuatorianos (almuerzos, pollos, platos fuertes y bebidas) para todos los locales. No borra ni repite nada de lo que ya tiene; después puede editarlos o esconderlos.', 'Sí, cargar');
      if (!ok) return;
      UI.trabajando(e.currentTarget, async function () {
        try {
          datos = await DATOS.pedir('menuEjemplo', {}, { guardar: true });
          if (APP.local !== 'TODOS') datos = await DATOS.pedir('menuListar', { local_id: APP.local });
          var ex = datos.ejemplo || {};
          UI.aviso(ex.creados ? 'Listo: ' + ex.creados + ' platos de ejemplo agregados.' : 'Los platos de ejemplo ya estaban.', 'ok');
          pintarPlatos(false);
        } catch (err) { UI.error('No se cargó el ejemplo', err.message); }
      });
    });
    UI.$$('[data-editar]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () { editarPlato(d.platos.filter(function (p) { return p.id === b.getAttribute('data-editar'); })[0]); });
    });
    UI.$$('[data-agotado]', cuerpo()).forEach(function (chk) {
      chk.addEventListener('change', async function () {
        chk.disabled = true;
        try {
          await DATOS.pedir('platoAgotado', { id: chk.getAttribute('data-agotado'), agotado: chk.checked }, { guardar: true });
          var p = d.platos.filter(function (x) { return x.id === chk.getAttribute('data-agotado'); })[0];
          if (p) p.agotado = chk.checked;
          UI.aviso(chk.checked ? 'Marcado como agotado.' : 'Disponible otra vez.', 'ok');
        } catch (err) {
          chk.checked = !chk.checked;
          UI.error('No se guardó', err.message);
        } finally { chk.disabled = false; }
      });
    });
  }

  function filaExtra(x) {
    return '<div class="extra-fila"><input class="entrada" data-ex-nombre maxlength="60" placeholder="Ej. Queso extra" value="' + UI.esc(x.nombre) + '">' +
      '<input class="entrada" data-ex-precio inputmode="decimal" placeholder="0.00" value="' + UI.esc(x.precio === '' ? '' : x.precio) + '">' +
      '<button class="btn secundario icono" type="button" data-ex-quitar aria-label="Quitar extra">✕</button></div>';
  }

  async function editarPlato(p) {
    var d = datos;
    if (!d.categorias.length) return UI.error('Falta una categoría', 'Cree primero una categoría en la pestaña Categorías.');
    var nuevo = !p;
    p = p || { id: '', nombre: '', categoria_id: d.categorias[0].id, local_id: APP.local, precio: '', descripcion: '', foto_url: '', extras: [], agotado: false, activo: true, etiquetas: '', sugerido: false };
    var mias = String(p.etiquetas || '').split(',');
    var enviar = null;
    var accion = await UI.ventana({
      icono: '🍔', titulo: nuevo ? 'Nuevo plato' : 'Editar plato',
      html: '<form id="form-plato" autocomplete="off">' +
        '<img class="foto-previa" id="pl-previa" alt=""' + (p.foto_url ? ' src="' + UI.esc(p.foto_url) + '"' : ' hidden') + ' referrerpolicy="no-referrer">' +
        '<div class="campo"><label for="pl-foto-archivo">Foto</label><input class="entrada" id="pl-foto-archivo" type="file" accept="image/*"><span class="ayuda">Desde el teléfono o la computadora. También puede pegar un enlace abajo.</span></div>' +
        '<div class="campo"><label for="pl-foto">Enlace de la foto (opcional)</label><input class="entrada" id="pl-foto" name="foto_url" value="' + UI.esc(p.foto_url) + '" placeholder="https://drive.google.com/…"></div>' +
        '<div class="campo"><label for="pl-nombre">Nombre</label><input class="entrada" id="pl-nombre" name="nombre" maxlength="80" value="' + UI.esc(p.nombre) + '"></div>' +
        '<div class="fila-campos"><div class="campo"><label for="pl-cat">Categoría</label><select class="entrada" id="pl-cat" name="categoria_id">' + d.categorias.map(function (c) {
          return '<option value="' + UI.esc(c.id) + '"' + (c.id === p.categoria_id ? ' selected' : '') + '>' + UI.esc(c.nombre) + '</option>';
        }).join('') + '</select></div>' +
        '<div class="campo"><label for="pl-precio">Precio (' + UI.esc(UI.moneda) + ')</label><input class="entrada" id="pl-precio" name="precio" inputmode="decimal" value="' + UI.esc(p.precio) + '" placeholder="0.00"></div></div>' +
        '<div class="campo"><label for="pl-local">Se vende en</label><select class="entrada" id="pl-local" name="local_id">' + opcionesLocal(p.local_id, true) + '</select></div>' +
        '<div class="campo"><label for="pl-desc">Descripción</label><textarea class="entrada" id="pl-desc" name="descripcion" maxlength="300">' + UI.esc(p.descripcion) + '</textarea></div>' +
        '<div class="campo"><label>Extras para personalizar</label><div id="pl-extras">' + p.extras.map(filaExtra).join('') + '</div>' +
        '<button class="btn borde chico" type="button" id="pl-mas-extra">＋ Agregar extra</button><span class="ayuda">Ej. «Queso extra» 0.50 · «Sin cebolla» 0.00</span></div>' +
        '<div class="campo"><label>Etiquetas (se ven en el menú)</label><div class="segmento" id="pl-etiquetas">' + Object.keys(UI.ETIQUETAS).map(function (k) {
          return '<button type="button" data-et="' + k + '" class="' + (mias.indexOf(k) >= 0 ? 'activo' : '') + '">' + UI.ETIQUETAS[k] + '</button>';
        }).join('') + '</div></div>' +
        '<label class="interruptor"><input type="checkbox" name="sugerido"' + (p.sugerido ? ' checked' : '') + '> Sugerirlo al final («¿Le agregas una bebida?»)</label>' +
        '<label class="interruptor"><input type="checkbox" name="agotado"' + (p.agotado ? ' checked' : '') + '> Agotado hoy</label>' +
        '<label class="interruptor"><input type="checkbox" name="activo"' + (p.activo ? ' checked' : '') + '> Visible en el menú</label></form>',
      alAbrir: function (v) {
        UI.$('#pl-mas-extra', v).addEventListener('click', function () { UI.$('#pl-extras', v).insertAdjacentHTML('beforeend', filaExtra({ nombre: '', precio: '' })); });
        UI.$('#pl-extras', v).addEventListener('click', function (e) { var q = e.target.closest('[data-ex-quitar]'); if (q) q.parentNode.remove(); });
        UI.$('#pl-etiquetas', v).addEventListener('click', function (e) { var b = e.target.closest('[data-et]'); if (b) b.classList.toggle('activo'); });
        UI.$('#pl-foto-archivo', v).addEventListener('change', async function (e) {
          var archivo = e.target.files[0];
          if (!archivo) return;
          var prev = UI.$('#pl-previa', v);
          try {
            var base = await UI.leerFoto(archivo, 1000, { cuadrado: true }); // recorte parejo y liviana
            prev.src = base; prev.hidden = false;
            UI.aviso('Subiendo foto…', '');
            var r = await DATOS.pedir('fotoSubir', { foto: base }, { guardar: true });
            UI.$('#pl-foto', v).value = r.url;
            UI.aviso('Foto lista.', 'ok');
          } catch (err) { UI.error('No se subió la foto', err.message); }
        });
        UI.$('#pl-foto', v).addEventListener('change', function (e) { var prev = UI.$('#pl-previa', v); prev.src = e.target.value; prev.hidden = !e.target.value; });
      },
      botones: [{ texto: 'Cancelar', valor: null, clase: 'secundario' }].concat(nuevo ? [] : [{ texto: '🧪 Receta', valor: 'receta', clase: 'borde' }]).concat([{ texto: 'Guardar', valor: 'guardar', antes: function (v) {
        var f = UI.$('#form-plato', v);
        enviar = UI.leerFormulario(f);
        enviar.precio = UI.numero(enviar.precio);
        enviar.etiquetas = UI.$$('#pl-etiquetas .activo', v).map(function (b) { return b.getAttribute('data-et'); }).join(',');
        enviar.extras = UI.$$('.extra-fila', v).map(function (fila) {
          return { nombre: UI.$('[data-ex-nombre]', fila).value.trim(), precio: UI.numero(UI.$('[data-ex-precio]', fila).value || 0) };
        }).filter(function (x) { return x.nombre; });
        var malo = !enviar.nombre ? 'Escriba el nombre.' : !(enviar.precio >= 0) ? 'Escriba un precio válido.' : enviar.extras.some(function (x) { return !(x.precio >= 0); }) ? 'Revise el precio de los extras.' : '';
        if (malo) { UI.aviso(malo, 'error'); return false; }
        return true;
      } }])
    });
    if (accion === 'receta') return editarReceta(p);
    if (accion !== 'guardar') return;
    enviar.id = p.id;
    try {
      datos = await DATOS.pedir('platoGuardar', enviar, { guardar: true });
      if (APP.local !== 'TODOS') datos = await DATOS.pedir('menuListar', { local_id: APP.local });
      UI.aviso(nuevo ? 'Plato creado.' : 'Plato guardado.', 'ok');
      pintarPlatos(false);
    } catch (err) { UI.error('No se guardó el plato', err.message); }
  }

  /* Receta: qué insumos descuenta cada plato vendido (inventario). */
  async function editarReceta(p) {
    var r;
    try {
      r = await Promise.all([DATOS.pedir('recetaListar', { plato_id: p.id }), DATOS.pedir('insumosListar', { local_id: 'TODOS' })]);
    } catch (err) { return UI.error('No se pudo abrir la receta', err.message); }
    var actuales = r[0].items, insumos = r[1].insumos.filter(function (i) { return i.activo; });
    if (!insumos.length) return UI.error('Aún no hay insumos', 'Cree los insumos en Inventario (ej. «Pollo (presas)», «Papas (kg)»).');
    var cant = {};
    actuales.forEach(function (x) { cant[x.insumo_id] = x.cantidad; });
    var items = null;
    var ok = await UI.ventana({
      icono: '🧪', titulo: 'Receta de ' + p.nombre, texto: 'Cuánto de cada insumo se usa en UNA unidad. Al vender, se descuenta solo. Deje vacío lo que no usa.',
      html: '<div class="lista">' + insumos.map(function (i) {
        return '<div class="item" style="min-height:56px"><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(i.nombre) + '</div><div class="item-sub">' + UI.esc(i.local) + ' · ' + UI.esc(i.unidad) + '</div></div>' +
          '<input class="entrada" style="max-width:110px" inputmode="decimal" data-ins="' + UI.esc(i.id) + '" value="' + (cant[i.id] || '') + '" placeholder="0"></div>';
      }).join('') + '</div>',
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Guardar receta', valor: true, antes: function (v) {
        items = UI.$$('[data-ins]', v).map(function (inp) { return { insumo_id: inp.getAttribute('data-ins'), cantidad: inp.value.trim() === '' ? 0 : UI.numero(inp.value) }; });
        if (items.some(function (x) { return !(x.cantidad >= 0); })) { UI.aviso('Revise las cantidades.', 'error'); return false; }
        return true;
      } }]
    });
    if (!ok) return;
    try {
      await DATOS.pedir('recetaGuardar', { plato_id: p.id, items: items }, { guardar: true });
      UI.aviso('Receta guardada.', 'ok');
    } catch (err) { UI.error('No se guardó la receta', err.message); }
  }

  /* ---------------- Categorías ---------------- */
  async function pintarCategorias(forzar) {
    var d = await traer(forzar);
    cuerpo().innerHTML = '<div class="acciones" style="margin:0 0 12px"><button class="btn" type="button" id="btn-nueva-cat">＋ Nueva categoría</button></div>' +
      (d.categorias.length ? '<div class="lista">' + d.categorias.map(function (c) {
        var n = d.platos.filter(function (p) { return p.categoria_id === c.id; }).length;
        return '<div class="item"><div class="avatar" aria-hidden="true">' + c.orden + '</div><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(c.nombre) + '</div>' +
          '<div class="item-sub">' + n + ' plato(s) · ' + UI.esc(nombreLocalCorto(c.local_id)) + '</div></div>' + etiquetaActivo(c.activo) +
          '<button class="btn secundario chico" type="button" data-editar="' + UI.esc(c.id) + '">Editar</button></div>';
      }).join('') + '</div>' : UI.vacio('🗂️', 'Cree categorías como «Pollos», «Combos», «Bebidas».'));
    UI.$('#btn-nueva-cat').addEventListener('click', function () { editarCategoria(null); });
    UI.$$('[data-editar]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () { editarCategoria(d.categorias.filter(function (c) { return c.id === b.getAttribute('data-editar'); })[0]); });
    });
  }

  async function editarCategoria(c) {
    var nuevo = !c;
    c = c || { id: '', nombre: '', local_id: 'TODOS', orden: (datos.categorias.length || 0) + 1, activo: true };
    var enviar = null;
    var ok = await UI.ventana({
      icono: '🗂️', titulo: nuevo ? 'Nueva categoría' : 'Editar categoría',
      html: '<form id="form-cat"><div class="campo"><label for="ca-nombre">Nombre</label><input class="entrada" id="ca-nombre" name="nombre" maxlength="60" value="' + UI.esc(c.nombre) + '"></div>' +
        '<div class="fila-campos"><div class="campo"><label for="ca-local">Local</label><select class="entrada" id="ca-local" name="local_id">' + opcionesLocal(c.local_id, true) + '</select></div>' +
        '<div class="campo"><label for="ca-orden">Orden en el menú</label><input class="entrada" id="ca-orden" name="orden" inputmode="numeric" value="' + UI.esc(c.orden) + '"></div></div>' +
        '<label class="interruptor"><input type="checkbox" name="activo"' + (c.activo ? ' checked' : '') + '> Visible</label></form>',
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Guardar', valor: true, antes: function (v) {
        enviar = UI.leerFormulario(UI.$('#form-cat', v));
        if (!enviar.nombre) { UI.aviso('Escriba el nombre.', 'error'); return false; }
        return true;
      } }]
    });
    if (!ok) return;
    enviar.id = c.id;
    try {
      await DATOS.pedir('categoriaGuardar', enviar, { guardar: true });
      UI.aviso('Categoría guardada.', 'ok');
      pintarCategorias(true);
    } catch (err) { UI.error('No se guardó', err.message); }
  }

  /* ---------------- Zonas de envío ---------------- */
  async function pintarZonas(forzar) {
    var d = await traer(forzar);
    cuerpo().innerHTML = '<p class="subtitulo">Cada zona tiene su costo y tiempo. «Retiro en el local» siempre está disponible (sin costo).</p>' +
      '<div class="acciones" style="margin:0 0 12px"><button class="btn" type="button" id="btn-nueva-zona">＋ Nueva zona</button></div>' +
      (d.zonas.length ? '<div class="lista">' + d.zonas.map(function (z) {
        return '<div class="item"><div class="avatar" aria-hidden="true">🛵</div><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(z.nombre) + '</div>' +
          '<div class="item-sub">' + UI.dinero(z.costo) + ' · ~' + z.minutos + ' min · ' + UI.esc(nombreLocalCorto(z.local_id)) + '</div></div>' + etiquetaActivo(z.activo) +
          '<button class="btn secundario chico" type="button" data-editar="' + UI.esc(z.id) + '">Editar</button></div>';
      }).join('') + '</div>' : UI.vacio('🛵', 'Sin zonas: los clientes solo podrán retirar en el local.'));
    UI.$('#btn-nueva-zona').addEventListener('click', function () { editarZona(null); });
    UI.$$('[data-editar]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () { editarZona(d.zonas.filter(function (z) { return z.id === b.getAttribute('data-editar'); })[0]); });
    });
  }

  async function editarZona(z) {
    var nuevo = !z;
    z = z || { id: '', nombre: '', local_id: APP.local === 'TODOS' ? (APP.locales[0] || {}).id || 'TODOS' : APP.local, costo: '', minutos: 20, activo: true };
    var enviar = null;
    var ok = await UI.ventana({
      icono: '🛵', titulo: nuevo ? 'Nueva zona de envío' : 'Editar zona',
      html: '<form id="form-zona"><div class="campo"><label for="zo-nombre">Nombre</label><input class="entrada" id="zo-nombre" name="nombre" maxlength="60" placeholder="Ej. Centro norte" value="' + UI.esc(z.nombre) + '"></div>' +
        '<div class="campo"><label for="zo-local">Local que despacha</label><select class="entrada" id="zo-local" name="local_id">' + opcionesLocal(z.local_id, true) + '</select></div>' +
        '<div class="fila-campos"><div class="campo"><label for="zo-costo">Costo de envío</label><input class="entrada" id="zo-costo" name="costo" inputmode="decimal" value="' + UI.esc(z.costo) + '" placeholder="0.00"></div>' +
        '<div class="campo"><label for="zo-min">Minutos de viaje</label><input class="entrada" id="zo-min" name="minutos" inputmode="numeric" value="' + UI.esc(z.minutos) + '"></div></div>' +
        '<label class="interruptor"><input type="checkbox" name="activo"' + (z.activo ? ' checked' : '') + '> Activa</label></form>',
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Guardar', valor: true, antes: function (v) {
        enviar = UI.leerFormulario(UI.$('#form-zona', v));
        enviar.costo = UI.numero(enviar.costo || 0); enviar.minutos = UI.numero(enviar.minutos || 0);
        var malo = !enviar.nombre ? 'Escriba el nombre.' : !(enviar.costo >= 0) ? 'Costo no válido.' : !(enviar.minutos >= 0) ? 'Minutos no válidos.' : '';
        if (malo) { UI.aviso(malo, 'error'); return false; }
        return true;
      } }]
    });
    if (!ok) return;
    enviar.id = z.id;
    try {
      await DATOS.pedir('zonaGuardar', enviar, { guardar: true });
      UI.aviso('Zona guardada.', 'ok');
      pintarZonas(true);
    } catch (err) { UI.error('No se guardó', err.message); }
  }

  /* ---------------- Cupones ---------------- */
  var cupones = [];
  async function pintarCupones() {
    cupones = (await DATOS.pedir('cuponesListar', {})).cupones || [];
    cuerpo().innerHTML = '<div class="acciones" style="margin:0 0 12px"><button class="btn" type="button" id="btn-nuevo-cupon">＋ Nuevo cupón</button></div>' +
      (cupones.length ? '<div class="lista">' + cupones.map(function (c) {
        return '<div class="item"><div class="avatar" aria-hidden="true">🎟️</div><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(c.codigo) + '</div>' +
          '<div class="item-sub">' + (c.tipo === 'porcentaje' ? c.valor + '%' : UI.dinero(c.valor)) + ' · usado ' + c.usos + (c.usos_max ? ' de ' + c.usos_max : '') + (c.vence ? ' · vence ' + UI.esc(c.vence.split('-').reverse().join('/')) : '') + '</div></div>' +
          etiquetaActivo(c.activo) + '<button class="btn secundario chico" type="button" data-editar="' + UI.esc(c.id) + '">Editar</button></div>';
      }).join('') + '</div>' : UI.vacio('🎟️', 'Sin cupones todavía.'));
    UI.$('#btn-nuevo-cupon').addEventListener('click', function () { editarCupon(null); });
    UI.$$('[data-editar]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () { editarCupon(cupones.filter(function (c) { return c.id === b.getAttribute('data-editar'); })[0]); });
    });
  }

  async function editarCupon(c) {
    var nuevo = !c;
    c = c || { id: '', codigo: '', tipo: 'porcentaje', valor: '', vence: '', usos_max: 0, activo: true };
    var enviar = null;
    var ok = await UI.ventana({
      icono: '🎟️', titulo: nuevo ? 'Nuevo cupón' : 'Editar cupón',
      html: '<form id="form-cupon"><div class="campo"><label for="cu-codigo">Código</label><input class="entrada" id="cu-codigo" name="codigo" maxlength="30" autocapitalize="characters" spellcheck="false" placeholder="Ej. PROMO10" value="' + UI.esc(c.codigo) + '"></div>' +
        '<div class="fila-campos"><div class="campo"><label for="cu-tipo">Tipo</label><select class="entrada" id="cu-tipo" name="tipo"><option value="porcentaje"' + (c.tipo === 'porcentaje' ? ' selected' : '') + '>Porcentaje (%)</option><option value="monto"' + (c.tipo === 'monto' ? ' selected' : '') + '>Monto fijo</option></select></div>' +
        '<div class="campo"><label for="cu-valor">Valor</label><input class="entrada" id="cu-valor" name="valor" inputmode="decimal" value="' + UI.esc(c.valor) + '"></div>' +
        '<div class="campo"><label for="cu-vence">Vence (opcional)</label><input class="entrada" id="cu-vence" name="vence" type="date" value="' + UI.esc(c.vence) + '"></div>' +
        '<div class="campo"><label for="cu-max">Usos máximos</label><input class="entrada" id="cu-max" name="usos_max" inputmode="numeric" value="' + UI.esc(c.usos_max) + '"><span class="ayuda">0 = sin límite</span></div></div>' +
        '<label class="interruptor"><input type="checkbox" name="activo"' + (c.activo ? ' checked' : '') + '> Activo</label></form>',
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Guardar', valor: true, antes: function (v) {
        enviar = UI.leerFormulario(UI.$('#form-cupon', v));
        enviar.valor = UI.numero(enviar.valor); enviar.usos_max = UI.numero(enviar.usos_max || 0);
        var malo = !/^[A-Za-z0-9_-]{3,30}$/.test(enviar.codigo) ? 'Código de 3 a 30 letras o números, sin espacios.' : !(enviar.valor > 0) ? 'Escriba el valor.' : (enviar.tipo === 'porcentaje' && enviar.valor > 100) ? 'Máximo 100%.' : '';
        if (malo) { UI.aviso(malo, 'error'); return false; }
        return true;
      } }]
    });
    if (!ok) return;
    enviar.id = c.id;
    try {
      await DATOS.pedir('cuponGuardar', enviar, { guardar: true });
      UI.aviso('Cupón guardado.', 'ok');
      pintarCupones();
    } catch (err) { UI.error('No se guardó', err.message); }
  }

  /* ---------------- Clientes ---------------- */
  async function pintarClientes() {
    var r = await DATOS.pedir('clientesListar', {});
    var lista = r.clientes || [];
    var filtro = 'todos';
    function pintar() {
      var f = lista.filter(function (c) { return !c.anonimizado && (filtro === 'todos' || (filtro === 'vip' && c.vip) || (filtro === 'inactivos' && c.inactivo) || (filtro === 'promos' && c.acepta_promos)); });
      UI.$('#cl-lista').innerHTML = f.length ? '<div class="lista">' + f.map(function (c) {
        return '<div class="item"><div class="avatar">' + UI.esc(UI.iniciales(c.nombre)) + '</div><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(c.nombre) +
          (c.vip ? ' <span class="etiqueta ok">VIP</span>' : '') + (c.inactivo ? ' <span class="etiqueta aviso">+30 días</span>' : '') + (c.acepta_promos ? ' <span class="etiqueta">📣 Acepta promos</span>' : '') + '</div>' +
          '<div class="item-sub">' + UI.esc(c.telefono) + ' · ' + c.pedidos + ' pedido(s) · ' + UI.dinero(c.total_gastado) + '</div>' +
          '<div class="item-sub">Último: ' + UI.esc(UI.fechaHora(c.ultimo_pedido)) + '</div></div>' +
          (c.anonimizado ? '' : '<button class="btn secundario chico" type="button" data-wa="' + UI.esc(c.telefono) + '" data-nombre="' + UI.esc(c.nombre) + '" aria-label="WhatsApp">💬</button>' +
            '<button class="btn borde chico" type="button" data-borrar="' + UI.esc(c.id) + '" data-nombre="' + UI.esc(c.nombre) + '" aria-label="Borrar datos" title="Borrar sus datos personales">🗑</button>') + '</div>';
      }).join('') + '</div>' : UI.vacio('👥', 'No hay clientes en este grupo.');
      UI.$$('[data-borrar]', UI.$('#cl-lista')).forEach(function (b) {
        b.addEventListener('click', async function () {
          var ok = await UI.confirmar('¿Borrar los datos de ' + b.getAttribute('data-nombre') + '?', 'Se borran su nombre, celular, dirección y ubicación de todos sus pedidos (lo pide la ley si el cliente lo solicita). Las ventas y totales se conservan para la contabilidad. No se puede deshacer.', 'Sí, borrar sus datos', true);
          if (!ok) return;
          try { await DATOS.pedir('clienteAnonimizar', { id: b.getAttribute('data-borrar') }, { guardar: true }); UI.aviso('Datos del cliente borrados.', 'ok'); pintarClientes(); }
          catch (err) { UI.error('No se pudo', err.message); }
        });
      });
      UI.$$('[data-wa]', UI.$('#cl-lista')).forEach(function (b) {
        b.addEventListener('click', function () { UI.abrirWhatsApp(b.getAttribute('data-wa'), 'Hola ' + b.getAttribute('data-nombre').split(' ')[0] + ', '); });
      });
    }
    cuerpo().innerHTML = '<p class="subtitulo">' + r.total + ' cliente(s), guardados por su celular (no se repiten).</p>' +
      '<div class="filtros"><button class="pestana" type="button" data-f="todos" aria-selected="true">Todos</button><button class="pestana" type="button" data-f="vip" aria-selected="false">⭐ VIP</button><button class="pestana" type="button" data-f="inactivos" aria-selected="false">💤 No vuelven hace 30 días</button><button class="pestana" type="button" data-f="promos" aria-selected="false">📣 Aceptan promos</button></div><div id="cl-lista"></div>' +
      '<p class="ayuda">Envíe promociones solo a quienes las aceptaron (ley de protección de datos). Si un cliente pide que borren sus datos, toque 🗑.</p>';
    UI.$$('[data-f]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () {
        filtro = b.getAttribute('data-f');
        UI.$$('[data-f]', cuerpo()).forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
        pintar();
      });
    });
    pintar();
  }

  /* ---------------- Enlace para clientes y ajustes de pedidos ---------------- */
  /* 3.0: enlace, compartir, códigos QR (local, mesa, origen) y ajustes de pedidos. */
  async function pintarEnlace() {
    var r = await DATOS.pedir('configObtener', {});
    var c = r.config;
    var app = UI.enlaceApp();
    var locales = APP.locales.filter(function (l) { return l.activo; });
    var enlaces = [['Todos los locales', '', UI.enlacePedir({})]].concat(locales.map(function (l) { return [l.nombre, l.id, UI.enlacePedir({ local: l.id })]; }));
    var mesas = Number(c.mesas) || 0;
    var ORIGENES = [['volante', '📄 Volantes'], ['funda', '🛍️ Fundas y cajas'], ['instagram', '📸 Instagram'], ['mesa_mostrador', '🏪 Mostrador'], ['google', '🗺️ Google Maps'], ['web', '🌐 Página web']];
    cuerpo().innerHTML =
      '<div class="tarjeta" style="margin-bottom:14px"><h3 style="margin-top:0">🔗 Enlace para que los clientes pidan</h3>' +
      '<p class="subtitulo">Un toque y lo compartes por WhatsApp, Instagram o como código QR. El mensaje ya va escrito.</p>' +
      '<div class="lista">' + enlaces.map(function (e, i) {
        return '<div class="item enlace-item"><div class="avatar" aria-hidden="true">' + (i ? '📍' : '🌎') + '</div><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(e[0]) + '</div><div class="item-sub" style="overflow-wrap:anywhere">' + UI.esc(e[2].replace(/^https:\/\//, '')) + '</div></div>' +
          '<button class="btn chico" type="button" data-compartir="' + i + '">📤 Compartir</button><button class="btn borde chico" type="button" data-qr="' + i + '">📱 QR</button></div>';
      }).join('') + '</div></div>' +
      '<div class="tarjeta" style="margin-bottom:14px"><h3 style="margin-top:0">📊 QR para saber qué funciona</h3>' +
      '<p class="subtitulo">Usa un QR distinto en cada lugar. En Reportes verás cuántos pedidos llegaron por cada uno.</p>' +
      '<div class="campo"><label for="qr-local">Local</label><select class="entrada" id="qr-local">' + locales.map(function (l) { return '<option value="' + UI.esc(l.id) + '">' + UI.esc(l.nombre) + '</option>'; }).join('') + '</select></div>' +
      '<div class="qr-lista">' + ORIGENES.map(function (o) { return '<button class="btn secundario" type="button" data-origen="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="tarjeta" style="margin-bottom:14px"><h3 style="margin-top:0">🍽️ QR de mesas</h3>' +
      (mesas ? '<p class="subtitulo">El cliente escanea en su mesa, pide desde su celular y el pedido llega al panel con el número de mesa.</p><div class="qr-lista">' +
        Array.apply(null, { length: Math.min(mesas, 60) }).map(function (_, i) { return '<button class="btn secundario" type="button" data-mesa="' + (i + 1) + '">Mesa ' + (i + 1) + '</button>'; }).join('') + '</div>'
        : '<p class="subtitulo">Para pedidos en mesa, escribe abajo cuántas mesas tienes y guarda.</p>') + '</div>' +
      '<div class="tarjeta" style="margin-bottom:14px"><h3 style="margin-top:0">👥 Enlace para tu personal</h3>' +
      '<p class="subtitulo">El MISMO enlace para todos: cada persona entra con su usuario y solo ve lo suyo.</p>' +
      '<div class="item"><div class="item-cuerpo"><div class="item-sub" style="overflow-wrap:anywhere">' + UI.esc(app) + '</div></div>' +
      '<button class="btn secundario chico" type="button" id="copiar-app">Copiar</button></div></div>' +
      '<form class="tarjeta" id="form-ajustes" autocomplete="off"><h3 style="margin-top:0">⚙️ Ajustes de pedidos</h3>' +
      '<h4>⏰ Horario de atención</h4>' +
      '<div class="fila-campos"><div class="campo"><label for="aj-ap">Abre</label><input class="entrada" id="aj-ap" name="horario_apertura" type="time" value="' + UI.esc(c.horario_apertura) + '"></div>' +
      '<div class="campo"><label for="aj-ci">Cierra</label><input class="entrada" id="aj-ci" name="horario_cierre" type="time" value="' + UI.esc(c.horario_cierre) + '"></div></div>' +
      '<div class="campo"><label>Días que NO atiende</label><div class="segmento" id="aj-dias">' + ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(function (n, i) {
        return '<button type="button" data-dia="' + (i + 1) + '" class="' + (String(c.dias_cerrado || '').split(',').indexOf(String(i + 1)) >= 0 ? 'activo' : '') + '">' + n + '</button>';
      }).join('') + '</div><span class="ayuda">Vacío = atiende siempre. Fuera de horario, el cliente puede programar su pedido.</span></div>' +
      '<h4>⏱️ Tiempos</h4>' +
      '<div class="fila-campos"><div class="campo"><label for="aj-prep">Minutos de preparación</label><input class="entrada" id="aj-prep" name="minutos_preparacion" inputmode="numeric" value="' + UI.esc(c.minutos_preparacion) + '"></div>' +
      '<div class="campo"><label for="aj-atraso">Atrasado después de (min)</label><input class="entrada" id="aj-atraso" name="minutos_atraso" inputmode="numeric" value="' + UI.esc(c.minutos_atraso) + '"></div>' +
      '<div class="campo"><label for="aj-mesas">Mesas con QR</label><input class="entrada" id="aj-mesas" name="mesas" inputmode="numeric" value="' + UI.esc(c.mesas || '0') + '"><span class="ayuda">0 = no se pide en mesa.</span></div></div>' +
      '<h4>💳 Pagos</h4>' +
      '<div class="campo"><label for="aj-transf">Datos para transferencia</label><textarea class="entrada" id="aj-transf" name="datos_transferencia" maxlength="300" placeholder="Banco, tipo y número de cuenta, nombre, cédula">' + UI.esc(c.datos_transferencia) + '</textarea></div>' +
      '<div class="campo"><label>QR de Deuna del negocio</label><div class="item" style="padding:8px"><div class="miniatura" id="aj-deuna-prev">' + (c.deuna_qr_url ? '<img src="' + UI.esc(c.deuna_qr_url) + '" alt="" referrerpolicy="no-referrer">' : '📲') + '</div>' +
      '<div class="item-cuerpo"><input class="entrada" id="aj-deuna-archivo" type="file" accept="image/*"><span class="ayuda">Foto o captura del QR de tu app Deuna Negocios. Sin QR, Deuna no aparece al cliente.</span></div></div>' +
      '<input type="hidden" name="deuna_qr_url" id="aj-deuna" value="' + UI.esc(c.deuna_qr_url || '') + '"></div>' +
      '<label class="interruptor"><input type="checkbox" id="aj-verificar"' + (c.verificar_antes_salir !== 'NO' ? ' checked' : '') + '> Transferencia y Deuna: no despachar hasta verificar el pago</label>' +
      '<label class="interruptor"><input type="checkbox" id="aj-propinas"' + (c.propinas !== 'NO' ? ' checked' : '') + '> El cliente puede dejar propina al motorizado</label>' +
      '<h4>🎁 Tarjeta de sellos</h4>' +
      '<div class="fila-campos"><div class="campo"><label for="aj-sellos">Pedidos para el premio</label><input class="entrada" id="aj-sellos" name="fidelidad_sellos" inputmode="numeric" value="' + UI.esc(c.fidelidad_sellos || '0') + '"><span class="ayuda">0 = apagado. Ej. 8.</span></div>' +
      '<div class="campo"><label for="aj-premio">Descuento del premio (%)</label><input class="entrada" id="aj-premio" name="fidelidad_descuento" inputmode="numeric" value="' + UI.esc(c.fidelidad_descuento || '50') + '"><span class="ayuda">Sobre el plato más caro del pedido.</span></div></div>' +
      '<h4>📲 Avisos</h4>' +
      '<div class="campo"><label for="aj-wa">WhatsApp del dueño (resumen del cierre de caja)</label><input class="entrada" id="aj-wa" name="whatsapp_dueno" inputmode="tel" value="' + UI.esc(c.whatsapp_dueno) + '" placeholder="0991234567"></div>' +
      /* 3.1 */
      '<h4>🛵 Motorizados y entrega</h4>' +
      '<label class="interruptor"><input type="checkbox" id="aj-codigo"' + (c.codigo_entrega !== 'NO' ? ' checked' : '') + '> Código de 4 números al entregar (el cliente lo ve en «Ver cómo va»)</label>' +
      '<label class="interruptor"><input type="checkbox" id="aj-turno"' + (c.exigir_turno === 'SI' ? ' checked' : '') + '> Solo asignar pedidos a motorizados con turno empezado</label>' +
      '<div class="fila-campos"><div class="campo"><label for="aj-det">Alerta «detenido» (min)</label><input class="entrada" id="aj-det" name="minutos_alerta_detenido" inputmode="numeric" value="' + UI.esc(c.minutos_alerta_detenido || '10') + '"></div>' +
      '<div class="campo"><label for="aj-sen">Alerta «sin señal» (min)</label><input class="entrada" id="aj-sen" name="minutos_alerta_senal" inputmode="numeric" value="' + UI.esc(c.minutos_alerta_senal || '5') + '"></div></div>' +
      '<div class="fila-campos"><div class="campo"><label for="aj-meta">Meta de entregas por día</label><input class="entrada" id="aj-meta" name="meta_entregas_dia" inputmode="numeric" value="' + UI.esc(c.meta_entregas_dia || '') + '" placeholder="Ej. 15"><span class="ayuda">Vacío = sin meta.</span></div>' +
      '<div class="campo"><label for="aj-bono">Bono por día cumplido (USD)</label><input class="entrada" id="aj-bono" name="bono_meta" inputmode="decimal" value="' + UI.esc(c.bono_meta || '') + '" placeholder="Ej. 3"></div></div>' +
      '<h4>🕒 Formato de hora</h4>' +
      '<div class="segmento" id="aj-hora"><button type="button" data-h="24" class="' + (c.formato_hora !== '12' ? 'activo' : '') + '">24 h (18:30)</button><button type="button" data-h="12" class="' + (c.formato_hora === '12' ? 'activo' : '') + '">12 h (6:30 p. m.)</button></div>' +
      '<h4>🔒 Privacidad (ley de protección de datos)</h4>' +
      '<div class="campo"><label for="aj-priv">Texto propio del aviso (opcional)</label><textarea class="entrada" id="aj-priv" name="privacidad_texto" maxlength="1500" placeholder="Ej. Responsable: Pollos Don Diego, RUC…, dirección…">' + UI.esc(c.privacidad_texto || '') + '</textarea>' +
      '<span class="ayuda">Se muestra arriba del aviso estándar. <a href="privacidad.html" target="_blank" rel="noopener">Ver aviso</a>. Recorridos GPS y fotos de entrega se borran solos a los ' + UI.esc(c.dias_guardar_rastreo || '30') + ' días.</span></div>' +
      '<button class="btn bloque" type="submit">Guardar ajustes</button></form>';
    var nombre = c.negocio_nombre;
    UI.$$('[data-h]', cuerpo()).forEach(function (b) { b.addEventListener('click', function () { UI.$$('[data-h]', cuerpo()).forEach(function (x) { x.classList.toggle('activo', x === b); }); }); });
    UI.$('#copiar-app').addEventListener('click', function () { UI.copiar(app); });
    UI.$$('[data-compartir]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () { var e = enlaces[Number(b.getAttribute('data-compartir'))]; UI.compartirEnlace({ nombre: nombre, subtitulo: e[1] ? e[0] : '', enlace: e[2], logo: c.logo_url }); });
    });
    UI.$$('[data-qr]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () { var e = enlaces[Number(b.getAttribute('data-qr'))]; UI.hojaQR({ titulo: 'QR · ' + e[0], nombre: nombre, subtitulo: e[1] ? e[0] : '', enlace: e[2], logo: c.logo_url }); });
    });
    UI.$$('[data-origen]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () {
        var l = UI.$('#qr-local').value, o = b.getAttribute('data-origen');
        UI.hojaQR({ titulo: 'QR · ' + b.textContent, nombre: nombre, subtitulo: APP.nombreLocal(l), enlace: UI.enlacePedir({ local: l, origen: o }), logo: c.logo_url });
      });
    });
    UI.$$('[data-mesa]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () {
        var l = UI.$('#qr-local').value, m = b.getAttribute('data-mesa');
        UI.hojaQR({ titulo: 'QR · Mesa ' + m, nombre: nombre, subtitulo: 'Mesa ' + m, llamado: 'Escanea y pide desde tu mesa', enlace: UI.enlacePedir({ local: l, mesa: m, origen: 'mesa' }), logo: c.logo_url });
      });
    });
    UI.$$('[data-dia]', cuerpo()).forEach(function (b) { b.addEventListener('click', function () { b.classList.toggle('activo'); }); });
    UI.$('#aj-deuna-archivo').addEventListener('change', async function (e) {
      var archivo = e.target.files[0]; if (!archivo) return;
      try {
        var base64 = await UI.leerFoto(archivo, 900);
        UI.aviso('Subiendo el QR…', '');
        var s = await DATOS.pedir('fotoSubir', { foto: base64 }, { guardar: true });
        UI.$('#aj-deuna').value = s.url;
        UI.$('#aj-deuna-prev').innerHTML = '<img src="' + UI.esc(base64) + '" alt="">';
        UI.aviso('QR listo. Toque «Guardar ajustes».', 'ok');
      } catch (err) { UI.error('No se subió el QR', err.message); }
    });
    UI.$('#form-ajustes').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, boton = f.querySelector('button[type=submit]'), d = UI.leerFormulario(f);
      delete d['']; ['aj-deuna-archivo'].forEach(function (k) { delete d[k]; });
      Object.keys(d).forEach(function (k) { if (typeof d[k] === 'boolean') delete d[k]; });
      if (!(UI.numero(d.minutos_preparacion) >= 0) || !(UI.numero(d.minutos_atraso) > 0)) return UI.aviso('Revise los minutos.', 'error');
      if ((d.horario_apertura && !d.horario_cierre) || (!d.horario_apertura && d.horario_cierre)) return UI.aviso('Escriba la hora en que abre Y la hora en que cierra (o deje las dos vacías).', 'error');
      if (d.whatsapp_dueno) d.whatsapp_dueno = d.whatsapp_dueno.replace(/[^\d+]/g, '');
      d.dias_cerrado = UI.$$('[data-dia].activo', f).map(function (x) { return x.getAttribute('data-dia'); }).join(',');
      d.verificar_antes_salir = UI.$('#aj-verificar').checked ? 'SI' : 'NO';
      d.propinas = UI.$('#aj-propinas').checked ? 'SI' : 'NO';
      d.codigo_entrega = UI.$('#aj-codigo').checked ? 'SI' : 'NO';
      d.exigir_turno = UI.$('#aj-turno').checked ? 'SI' : 'NO';
      d.formato_hora = (UI.$('[data-h].activo', f) || { getAttribute: function () { return '24'; } }).getAttribute('data-h');
      d.meta_entregas_dia = d.meta_entregas_dia ? String(Math.max(0, Math.floor(UI.numero(d.meta_entregas_dia) || 0))) : '';
      d.bono_meta = d.bono_meta ? String(Math.max(0, UI.numero(d.bono_meta) || 0)) : '';
      d.mesas = String(Math.max(0, Math.floor(UI.numero(d.mesas) || 0)));
      d.fidelidad_sellos = String(Math.max(0, Math.floor(UI.numero(d.fidelidad_sellos) || 0)));
      UI.trabajando(boton, async function () {
        try {
          var res = await DATOS.pedir('configGuardar', { config: d }, { guardar: true });
          UI.aviso(res.escritas ? 'Ajustes guardados.' : 'No había cambios.', 'ok');
          if (res.escritas) pintarEnlace();
        } catch (err) { UI.error('No se guardó', err.message); }
      });
    });
  }
})(window);

/* ============================================================
 * 3.0 — GUÍA DE PRIMEROS PASOS (Inicio del dueño). Se calcula con
 * los datos reales y se esconde sola al completar todo.
 * ============================================================ */
(function (global) {
  'use strict';
  var UI = global.UI, DATOS = global.DATOS, APP = global.APP, MEM = global.APP_MEMORIA;
  APP.guiaInicio = async function (cont) {
    if (!cont || MEM.leer('guia_oculta')) return;
    var r;
    try { r = await Promise.all([DATOS.pedir('configObtener', {}), DATOS.pedir('menuListar', { local_id: 'TODOS' }), DATOS.pedir('motorizadosListar', { local_id: 'TODOS' })]); }
    catch (e) { return; }
    if (!cont.isConnected) return;
    var c = r[0].config, m = r[1];
    var pasos = [
      ['🏷️', 'Nombre y logo del negocio', c.negocio_nombre && c.negocio_nombre !== 'Mi Restaurante' && !!c.logo_url, 'config'],
      ['🍔', 'Menú con platos y fotos', (m.platos || []).length > 0, 'menu?p=platos'],
      ['🛵', 'Zonas y costo de envío', (m.zonas || []).length > 0, 'menu?p=zonas'],
      ['💳', 'Datos de transferencia o QR de Deuna', !!(c.datos_transferencia || c.deuna_qr_url), 'menu?p=enlace'],
      ['⏰', 'Horario de atención', !!(c.horario_apertura && c.horario_cierre), 'menu?p=enlace'],
      ['🏍️', 'Tu primer motorizado', (r[2].motorizados || []).length > 0, 'motorizados'],
      ['📤', 'Compartir el enlace con tus clientes', !!MEM.leer('compartio_enlace'), 'compartir']
    ];
    var hechos = pasos.filter(function (p) { return p[2]; }).length;
    if (hechos === pasos.length) { cont.innerHTML = ''; return; }
    cont.innerHTML = '<div class="tarjeta" style="margin-top:14px"><div style="display:flex;align-items:center;gap:10px"><h3 style="margin:0;flex:1">🚀 Deja tu negocio listo</h3><button class="btn secundario chico" type="button" id="guia-ocultar">Ocultar</button></div>' +
      '<div class="progreso" aria-label="' + hechos + ' de ' + pasos.length + '"><span style="width:' + Math.round(hechos / pasos.length * 100) + '%"></span></div>' +
      '<div class="guia">' + pasos.map(function (p, i) {
        return '<button class="guia-paso' + (p[2] ? ' hecho' : '') + '" type="button" data-guia="' + i + '"><span class="check">' + (p[2] ? '✓' : i + 1) + '</span><span style="flex:1">' + p[0] + ' ' + UI.esc(p[1]) + '</span><span aria-hidden="true">›</span></button>';
      }).join('') + '</div></div>';
    UI.$('#guia-ocultar').addEventListener('click', function () { MEM.guardar('guia_oculta', true); cont.innerHTML = ''; });
    UI.$$('[data-guia]', cont).forEach(function (b) {
      b.addEventListener('click', function () {
        var destino = pasos[Number(b.getAttribute('data-guia'))][3];
        if (destino === 'compartir') {
          MEM.guardar('compartio_enlace', true);
          return UI.compartirEnlace({ nombre: c.negocio_nombre, enlace: UI.enlacePedir({}), logo: c.logo_url });
        }
        APP.ir(destino);
      });
    });
  };
})(window);
