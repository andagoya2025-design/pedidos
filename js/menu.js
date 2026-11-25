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
      '<button class="btn secundario icono" type="button" data-ex-quitar aria-label="Quitar extra">✕</button><label style="grid-column:1/-1">Límite opcional de porciones por plato <input class="entrada" type="number" min="1" max="1000" inputmode="numeric" placeholder="Sin límite comercial" data-ex-max value="'+UI.esc(Number(x.precio)>0&&x.limite_comercial!==false&&x.max_cantidad!=null?x.max_cantidad:"")+'"></label></div>';
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
          return { nombre: UI.$('[data-ex-nombre]', fila).value.trim(), precio: UI.numero(UI.$('[data-ex-precio]', fila).value || 0), max_cantidad:UI.$('[data-ex-max]',fila).value.trim()===''?null:Number(UI.$('[data-ex-max]',fila).value) };
        }).filter(function (x) { return x.nombre; });
        var malo = !enviar.nombre ? 'Escriba el nombre.' : !(enviar.precio >= 0&&enviar.precio<=10000) ? 'Escriba un precio válido.' : '';
        enviar.extras.some(function(x){if(malo)return true;if(!(x.precio>=0&&x.precio<=1000)){malo='Precio inválido en «'+x.nombre+'».';return true;}if(x.precio>0&&x.max_cantidad!==null&&(!Number.isSafeInteger(x.max_cantidad)||x.max_cantidad<1||x.max_cantidad>1000)){malo='Límite inválido en «'+x.nombre+'»: use 1 a 1000 o deje vacío.';return true;}if(x.precio===0)x.max_cantidad=1;return false;});
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
        return '<div class="item" style="min-height:56px"><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(i.nombre) + '</div><div class="item-sub">' + UI.esc(i.local) + ' · ' + UI.esc(i.unidad) + (i.costo !== '' ? ' · ' + UI.esc(UI.dinero(i.costo)) + ' c/u' : ' · sin costo') + '</div></div>' +
          '<input class="entrada" style="max-width:110px" inputmode="decimal" data-ins="' + UI.esc(i.id) + '" data-costo="' + (i.costo === '' ? '' : i.costo) + '" value="' + (cant[i.id] || '') + '" placeholder="0"></div>';
      }).join('') + '</div><div class="ganancia" id="rc-ganancia" aria-live="polite"></div>',
      alAbrir: function (v) { // 3.1.3: costo y ganancia por plato, al instante
        function calc() {
          var costo = 0, falta = false;
          UI.$$('[data-ins]', v).forEach(function (inp) {
            var c = UI.numero(inp.value) || 0;
            if (!c) return;
            if (inp.getAttribute('data-costo') === '') falta = true; else costo += c * Number(inp.getAttribute('data-costo'));
          });
          costo = Math.round(costo * 100) / 100;
          var gan = Math.round((p.precio - costo) * 100) / 100, pct = p.precio > 0 ? Math.round(gan / p.precio * 100) : 0;
          UI.$('#rc-ganancia', v).innerHTML = '<div><span>Precio</span><b>' + UI.esc(UI.dinero(p.precio)) + '</b></div><div><span>Costo insumos</span><b>' + UI.esc(UI.dinero(costo)) + '</b></div>' +
            '<div class="' + (gan < 0 ? 'mal' : 'bien') + '"><span>Ganancia por plato</span><b>' + UI.esc(UI.dinero(gan)) + ' (' + pct + ' %)</b></div>' +
            (falta ? '<p class="ayuda">Algún insumo no tiene costo: póngalo en Inventario → Editar para que el cálculo sea exacto.</p>' : '');
        }
        UI.$$('[data-ins]', v).forEach(function (inp) { inp.addEventListener('input', calc); });
        calc();
      },
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
    z = z || { id: '', nombre: '', local_id: APP.local === 'TODOS' ? (APP.locales[0] || {}).id || 'TODOS' : APP.local, costo: '', minutos: 20, activo: true, lat: '', lng: '', radio_km: '', minimo_domicilio: '' };
    var enviar = null;
    var ok = await UI.ventana({
      icono: '🛵', titulo: nuevo ? 'Nueva zona de envío' : 'Editar zona',
      html: '<form id="form-zona"><div class="campo"><label for="zo-nombre">Nombre</label><input class="entrada" id="zo-nombre" name="nombre" maxlength="60" placeholder="Ej. Centro norte" value="' + UI.esc(z.nombre) + '"></div>' +
        '<div class="campo"><label for="zo-local">Local que despacha</label><select class="entrada" id="zo-local" name="local_id">' + opcionesLocal(z.local_id, true) + '</select></div>' +
        '<div class="fila-campos"><div class="campo"><label for="zo-costo">Costo de envío</label><input class="entrada" id="zo-costo" name="costo" inputmode="decimal" value="' + UI.esc(z.costo) + '" placeholder="0.00"></div>' +
        '<div class="campo"><label for="zo-min">Minutos de viaje</label><input class="entrada" id="zo-min" name="minutos" inputmode="numeric" value="' + UI.esc(z.minutos) + '"></div></div>' +
        '<div class="fila-campos"><div class="campo"><label for="zo-radio">Radio desde el centro (km)</label><input class="entrada" id="zo-radio" name="radio_km" inputmode="decimal" value="' + UI.esc(z.radio_km || '') + '" placeholder="Opcional"></div>' +
        '<div class="campo"><label for="zo-minimo">Pedido mínimo a domicilio</label><input class="entrada" id="zo-minimo" name="minimo_domicilio" inputmode="decimal" value="' + UI.esc(z.minimo_domicilio || '') + '" placeholder="Hereda el local"></div></div>' +
        '<div class="campo"><label>Centro de la zona (opcional)</label><button class="btn secundario chico" id="zo-gps" type="button">📍 Marcar con mi ubicación</button>' +
        '<input type="hidden" id="zo-lat" name="lat" value="' + UI.esc(z.lat === '' ? '' : z.lat) + '"><input type="hidden" id="zo-lng" name="lng" value="' + UI.esc(z.lng === '' ? '' : z.lng) + '">' +
        '<input class="entrada" id="zo-enlace" name="enlace" placeholder="O pega el enlace de Google Maps" style="margin-top:8px"><span class="ayuda" id="zo-pos">' + (z.lat !== '' && z.lat != null ? 'Marcado: ' + UI.esc(z.lat) + ', ' + UI.esc(z.lng) : 'Sin centro: la zona seguirá funcionando manualmente') + '</span></div>' +
        '<label class="interruptor"><input type="checkbox" name="activo"' + (z.activo ? ' checked' : '') + '> Activa</label></form>',
      alAbrir: function (v) {
        UI.$('#zo-gps', v).addEventListener('click', function (e) { UI.trabajando(e.currentTarget, async function () {
          var pt = await UI.ubicacion(); if (!pt) return UI.aviso('No pudimos leer el GPS. Pega un enlace de Maps.', 'error');
          UI.$('#zo-lat', v).value = pt.lat; UI.$('#zo-lng', v).value = pt.lng; UI.$('#zo-enlace', v).value = '';
          UI.$('#zo-pos', v).textContent = 'Marcado: ' + pt.lat + ', ' + pt.lng;
        }); });
        UI.$('#zo-enlace', v).addEventListener('input', function () { UI.$('#zo-lat', v).value = ''; UI.$('#zo-lng', v).value = ''; });
      },
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Guardar', valor: true, antes: function (v) {
        enviar = UI.leerFormulario(UI.$('#form-zona', v));
        enviar.costo = UI.numero(enviar.costo || 0); enviar.minutos = UI.numero(enviar.minutos || 0);
        enviar.radio_km = enviar.radio_km === '' ? '' : Number(enviar.radio_km);
        enviar.minimo_domicilio = enviar.minimo_domicilio === '' ? '' : Number(enviar.minimo_domicilio);
        var malo = !enviar.nombre ? 'Escriba el nombre.' : !(enviar.costo >= 0) ? 'Costo no válido.' : !(enviar.minutos >= 0) ? 'Minutos no válidos.' : (enviar.radio_km !== '' && !(enviar.radio_km > 0)) ? 'El radio debe ser mayor que cero.' : (enviar.minimo_domicilio !== '' && !(enviar.minimo_domicilio >= 0)) ? 'Pedido mínimo no válido.' : '';
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
    c = c || { id: '', codigo: '', tipo: 'porcentaje', valor: '', vence: '', usos_max: 0, activo: true, local_id: 'TODOS', un_uso_cliente: false, compra_minima: 0 };
    var enviar = null;
    var ok = await UI.ventana({
      icono: '🎟️', titulo: nuevo ? 'Nuevo cupón' : 'Editar cupón',
      html: '<form id="form-cupon"><div class="campo"><label for="cu-codigo">Código</label><input class="entrada" id="cu-codigo" name="codigo" maxlength="30" autocapitalize="characters" spellcheck="false" placeholder="Ej. PROMO10" value="' + UI.esc(c.codigo) + '"></div>' +
        '<div class="fila-campos"><div class="campo"><label for="cu-tipo">Tipo</label><select class="entrada" id="cu-tipo" name="tipo"><option value="porcentaje"' + (c.tipo === 'porcentaje' ? ' selected' : '') + '>Porcentaje (%)</option><option value="monto"' + (c.tipo === 'monto' ? ' selected' : '') + '>Monto fijo</option></select></div>' +
        '<div class="campo"><label for="cu-valor">Valor</label><input class="entrada" id="cu-valor" name="valor" inputmode="decimal" value="' + UI.esc(c.valor) + '"></div>' +
        '<div class="campo"><label for="cu-vence">Vence (opcional)</label><input class="entrada" id="cu-vence" name="vence" type="date" value="' + UI.esc(c.vence) + '"></div>' +
        '<div class="campo"><label for="cu-max">Usos máximos</label><input class="entrada" id="cu-max" name="usos_max" inputmode="numeric" value="' + UI.esc(c.usos_max) + '"><span class="ayuda">0 = sin límite</span></div></div>' +
        '<div class="campo"><label for="cu-local">Válido en</label><select class="entrada" id="cu-local" name="local_id">' + opcionesLocal(c.local_id || 'TODOS', true) + '</select></div>' +
        '<div class="campo"><label for="cu-min">Compra mínima (sin envío)</label><input class="entrada" id="cu-min" name="compra_minima" inputmode="decimal" value="' + UI.esc(c.compra_minima || 0) + '"></div>' +
        '<label class="interruptor"><input type="checkbox" name="un_uso_cliente"' + (c.un_uso_cliente ? ' checked' : '') + '> Un uso por teléfono</label>' +
        '<label class="interruptor"><input type="checkbox" name="activo"' + (c.activo ? ' checked' : '') + '> Activo</label></form>',
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Guardar', valor: true, antes: function (v) {
        enviar = UI.leerFormulario(UI.$('#form-cupon', v));
        enviar.valor = UI.numero(enviar.valor); enviar.usos_max = UI.numero(enviar.usos_max || 0); enviar.compra_minima = UI.numero(enviar.compra_minima || 0);
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
          (c.vip ? ' <span class="etiqueta ok">VIP</span>' : '') + (c.efectivo_ok ? ' <span class="etiqueta ok">💵 Efectivo</span>' : '') + (c.inactivo ? ' <span class="etiqueta aviso">+30 días</span>' : '') + (c.acepta_promos ? ' <span class="etiqueta">📣 Acepta promos</span>' : '') + '</div>' +
          '<div class="item-sub">' + UI.esc(c.telefono) + ' · ' + c.pedidos + ' pedido(s) · ' + UI.dinero(c.total_gastado) + '</div>' +
          '<div class="item-sub">Último: ' + UI.esc(UI.fechaHora(c.ultimo_pedido)) + '</div></div>' +
          (c.anonimizado ? '' : '<button class="btn ' + (c.efectivo_ok ? '' : 'borde ') + 'chico" type="button" data-efectivo="' + UI.esc(c.id) + '" aria-pressed="' + !!c.efectivo_ok + '" title="Puede pagar en efectivo aunque el efectivo esté apagado o pase del límite">💵</button>' +
            '<button class="btn secundario chico" type="button" data-wa="' + UI.esc(c.telefono) + '" data-nombre="' + UI.esc(c.nombre) + '" aria-label="WhatsApp">💬</button>' +
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
      UI.$$('[data-efectivo]', UI.$('#cl-lista')).forEach(function (b) { // 3.1.5: efectivo por cliente (lo decide el dueño)
        b.addEventListener('click', function () {
          var c = lista.filter(function (x) { return x.id === b.getAttribute('data-efectivo'); })[0]; if (!c) return;
          UI.trabajando(b, async function () {
            try { await DATOS.pedir('clienteEfectivo', { id: c.id, permitir: !c.efectivo_ok }, { guardar: true }); c.efectivo_ok = !c.efectivo_ok; UI.aviso(c.efectivo_ok ? '💵 ' + c.nombre + ' ya puede pagar en efectivo.' : c.nombre + ' vuelve a las reglas generales de pago.', 'ok'); pintar(); }
            catch (err) { UI.error('No se pudo', err.message); }
          });
        });
      });
      UI.$$('[data-wa]', UI.$('#cl-lista')).forEach(function (b) {
        b.addEventListener('click', function () { UI.abrirWhatsApp(b.getAttribute('data-wa'), 'Hola ' + b.getAttribute('data-nombre').split(' ')[0] + ', '); });
      });
    }
    cuerpo().innerHTML = '<p class="subtitulo">' + r.total + ' cliente(s), guardados por su celular (no se repiten).</p>' +
      '<div class="filtros"><button class="pestana" type="button" data-f="todos" aria-selected="true">Todos</button><button class="pestana" type="button" data-f="vip" aria-selected="false">⭐ VIP</button><button class="pestana" type="button" data-f="inactivos" aria-selected="false">💤 No vuelven hace 30 días</button><button class="pestana" type="button" data-f="promos" aria-selected="false">📣 Aceptan promos</button></div><div id="cl-lista"></div>' +
      '<p class="ayuda">💵 = ese cliente puede pagar en efectivo aunque el efectivo esté apagado. Envíe promociones solo a quienes las aceptaron (ley de protección de datos). Si un cliente pide que borren sus datos, toque 🗑. Los clientes que no piden hace ' + UI.esc((APP.publico && APP.publico.anos_limpieza_clientes) || '2') + ' años se borran solos.</p>';
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
    var ORIGENES = [['volante', '📄 Volantes', 'Imprímelo en tus hojas volantes'], ['funda', '🛍️ Fundas y cajas', 'Pégalo en las fundas y cajas para llevar'], ['instagram', '📸 Instagram', 'Pon el enlace en tu perfil'], ['mesa_mostrador', '🏪 Mostrador', 'Cartel junto a la caja'], ['google', '🗺️ Google Maps', 'Pon el enlace en tu ficha de Google'], ['web', '🌐 Página web', 'Dale el enlace a quien maneja tu página']];
    cuerpo().innerHTML =
      '<div class="tarjeta" style="margin-bottom:14px"><h3 style="margin-top:0">🔗 Tu enlace para pedir</h3>' +
      '<p class="subtitulo">Es el mismo para todos tus clientes y abre tu menú. Compártelo por WhatsApp o Instagram, o imprime su QR para fundas, volantes y el mostrador.</p>' +
      '<div class="lista">' + enlaces.map(function (e, i) {
        return '<div class="item enlace-item"><div class="avatar" aria-hidden="true">' + (i ? '📍' : '🌎') + '</div><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(e[0]) + '</div><div class="item-sub">' + (i ? 'Abre directo el menú de este local' : 'El cliente elige el local') + '</div></div>' +
          '<div class="enlace-botones"><button class="btn chico" type="button" data-compartir="' + i + '">📤 Compartir</button><button class="btn borde chico" type="button" data-copiar="' + i + '">📋 Copiar</button><button class="btn borde chico" type="button" data-qr="' + i + '">📱 QR</button></div></div>';
      }).join('') + '</div></div>' +
      '<details class="tarjeta plegable" style="margin-bottom:14px"><summary><h3>📊 Medir de dónde llegan <small>(opcional)</small></h3></summary>' +
      '<p class="subtitulo">Todos abren el mismo menú. La diferencia es que cada uno lleva una etiqueta escondida: así, en <b>Reportes → «De dónde llegan»</b> ves si te piden más por las fundas, por Instagram o por Google. Úsalo solo si te interesa medirlo.</p>' +
      '<div class="campo"><label for="qr-local">Local</label><select class="entrada" id="qr-local">' + locales.map(function (l) { return '<option value="' + UI.esc(l.id) + '">' + UI.esc(l.nombre) + '</option>'; }).join('') + '</select></div>' +
      '<div class="lista">' + ORIGENES.map(function (o) { return '<div class="item"><div class="item-cuerpo"><div class="item-titulo">' + o[1] + '</div><div class="item-sub">' + o[2] + '</div></div>' +
        (['instagram', 'google', 'web'].indexOf(o[0]) >= 0 ? '<button class="btn borde chico" type="button" data-copiar-origen="' + o[0] + '">📋 Copiar enlace</button>' : '<button class="btn borde chico" type="button" data-origen="' + o[0] + '">📱 QR</button>') + '</div>'; }).join('') + '</div></details>' +
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
      '<h4>🌍 Cobertura y programación</h4>' +
      '<div class="fila-campos"><div class="campo"><label for="aj-cob">Cobertura en línea recta (km)</label><input class="entrada" id="aj-cob" name="cobertura_km" inputmode="decimal" placeholder="0 = apagado" value="' + UI.esc(c.cobertura_km || '') + '"><span class="ayuda">Por calles suele ser 30–50 % más: para unos 10 km por calle, marca aproximadamente 7 km.</span></div>' +
      '<div class="campo"><label for="aj-cobmodo">Al salir de cobertura</label><select class="entrada" id="aj-cobmodo" name="cobertura_modo"><option value="avisar"' + (c.cobertura_modo !== 'bloquear' ? ' selected' : '') + '>Avisar y permitir seguir</option><option value="bloquear"' + (c.cobertura_modo === 'bloquear' ? ' selected' : '') + '>Bloquear domicilio</option></select></div></div>' +
      '<label class="interruptor"><input type="checkbox" id="aj-programar"' + (c.permitir_programar === 'SI' ? ' checked' : '') + '> Permitir solicitar una ventana de entrega programada (el negocio confirma por WhatsApp)</label>' +
      '<label class="interruptor"><input type="checkbox" id="aj-cerrado"' + (c.recibir_cerrado !== 'NO' ? ' checked' : '') + '> Recibir pedidos cuando el local esté cerrado y prepararlos en la próxima apertura</label>' +
      '<div class="fila-campos"><div class="campo"><label>Duración de ventana (min)</label><input class="entrada" name="ventana_minutos" inputmode="numeric" value="' + UI.esc(c.ventana_minutos || 30) + '"></div>' +
      '<div class="campo"><label>Velocidad promedio moto (km/h)</label><input class="entrada" name="velocidad_moto_kmh" inputmode="numeric" value="' + UI.esc(c.velocidad_moto_kmh || 20) + '"></div></div>' +
      '<div class="campo"><label>Avisar pedido Recibido sin atender (min)</label><input class="entrada" name="minutos_alerta_pedido" inputmode="numeric" value="' + UI.esc(c.minutos_alerta_pedido || 15) + '"></div>' +
      '<h4>⏱️ Tiempos</h4>' +
      '<div class="fila-campos"><div class="campo"><label for="aj-prep">Minutos de preparación</label><input class="entrada" id="aj-prep" name="minutos_preparacion" inputmode="numeric" value="' + UI.esc(c.minutos_preparacion) + '"></div>' +
      '<div class="campo"><label for="aj-atraso">Atrasado después de (min)</label><input class="entrada" id="aj-atraso" name="minutos_atraso" inputmode="numeric" value="' + UI.esc(c.minutos_atraso) + '"></div>' +
      '<div class="campo"><label for="aj-mesas">Mesas con QR</label><input class="entrada" id="aj-mesas" name="mesas" inputmode="numeric" value="' + UI.esc(c.mesas || '0') + '"><span class="ayuda">0 = no se pide en mesa.</span></div></div>' +
      '<h4>💳 Pagos</h4>' +
      '<div class="campo"><label>🏦 Cuentas bancarias (hasta 6)</label><div id="aj-cuentas" class="lista"></div>' +
      '<button class="btn borde chico" type="button" id="aj-cuenta-mas" style="margin-top:8px">＋ Agregar cuenta</button>' +
      '<span class="ayuda">El cliente las ve como tarjetas, con botones para copiar el número y el monto. Si hay varias, elige a cuál pagó.</span></div>' +
      '<div class="campo"><label for="aj-transf">Nota extra para transferencias (opcional)</label><textarea class="entrada" id="aj-transf" name="datos_transferencia" maxlength="600" placeholder="Ej. Envía el comprobante por WhatsApp con tu número de pedido.">' + UI.esc(c.datos_transferencia) + '</textarea></div>' +
      '<div class="campo"><label>QR de Deuna del negocio</label><div class="item" style="padding:8px"><div class="miniatura" id="aj-deuna-prev">' + (c.deuna_qr_url ? '<img src="' + UI.esc(c.deuna_qr_url) + '" alt="" referrerpolicy="no-referrer">' : '📲') + '</div>' +
      '<div class="item-cuerpo"><input class="entrada" id="aj-deuna-archivo" type="file" accept="image/*"><span class="ayuda">Foto o captura del QR de tu app Deuna Negocios. Sin QR, Deuna no aparece al cliente.</span></div></div>' +
      '<input type="hidden" name="deuna_qr_url" id="aj-deuna" value="' + UI.esc(c.deuna_qr_url || '') + '"></div>' +
      '<label class="interruptor"><input type="checkbox" id="aj-verificar"' + (c.verificar_antes_salir !== 'NO' ? ' checked' : '') + '> Transferencia y Deuna: no despachar hasta verificar el pago en el banco</label>' +
      '<label class="interruptor"><input type="checkbox" id="aj-verprep"' + (c.verificar_antes_preparar !== 'NO' ? ' checked' : '') + '> Ni siquiera preparar hasta verificar el pago (recomendado)</label>' +
      '<div class="campo"><label for="aj-alpago">Avisar si el pago no se verifica en (min)</label><input class="entrada" id="aj-alpago" name="minutos_alerta_pago" inputmode="numeric" value="' + UI.esc(c.minutos_alerta_pago || '30') + '"><span class="ayuda">El pedido se marca en rojo en el panel para que llame o escriba al cliente.</span></div>' +
      /* 3.1.3 */
      '<label class="interruptor"><input type="checkbox" id="aj-efectivo"' + (c.efectivo_permitido !== 'NO' ? ' checked' : '') + '> El cliente puede pagar en efectivo</label>' +
      '<div class="campo"><label for="aj-efmax">Efectivo solo hasta (USD)</label><input class="entrada" id="aj-efmax" name="efectivo_maximo" inputmode="decimal" value="' + UI.esc(c.efectivo_maximo || '') + '" placeholder="Ej. 20"><span class="ayuda">Vacío = sin límite. Si apaga el efectivo o el pedido pasa de este monto, el cliente solo ve transferencia o Deuna, y el pedido no pasa a cocina hasta que usted verifique el pago en su banco. Llene los datos de transferencia de arriba.</span></div>' +
      '<label class="interruptor"><input type="checkbox" id="aj-propinas"' + (c.propinas !== 'NO' ? ' checked' : '') + '> El cliente puede dejar propina al motorizado</label>' +
      '<h4>🎁 Tarjeta de sellos</h4>' +
      '<div class="fila-campos"><div class="campo"><label for="aj-sellos">Pedidos para el premio</label><input class="entrada" id="aj-sellos" name="fidelidad_sellos" inputmode="numeric" value="' + UI.esc(c.fidelidad_sellos || '0') + '"><span class="ayuda">0 = apagado. Ej. 8.</span></div>' +
      '<div class="campo"><label for="aj-premio">Descuento del premio (%)</label><input class="entrada" id="aj-premio" name="fidelidad_descuento" inputmode="numeric" value="' + UI.esc(c.fidelidad_descuento || '50') + '"><span class="ayuda">Sobre el plato más caro del pedido.</span></div></div>' +
      '<h4>🌐 Redes y página web</h4>' +
      '<p class="ayuda" style="margin:-4px 0 8px">Salen como botones en la página donde piden tus clientes. Deja vacío lo que no tengas: no aparece.</p>' +
      '<div class="fila-campos"><div class="campo"><label for="aj-ig">Instagram</label><input class="entrada" id="aj-ig" name="red_instagram" value="' + UI.esc(c.red_instagram || '') + '" placeholder="@tunegocio" autocapitalize="off"></div>' +
      '<div class="campo"><label for="aj-fb">Facebook</label><input class="entrada" id="aj-fb" name="red_facebook" value="' + UI.esc(c.red_facebook || '') + '" placeholder="facebook.com/tunegocio" autocapitalize="off"></div></div>' +
      '<div class="fila-campos"><div class="campo"><label for="aj-tt">TikTok</label><input class="entrada" id="aj-tt" name="red_tiktok" value="' + UI.esc(c.red_tiktok || '') + '" placeholder="@tunegocio" autocapitalize="off"></div>' +
      '<div class="campo"><label for="aj-web">Página web</label><input class="entrada" id="aj-web" name="pagina_web" value="' + UI.esc(c.pagina_web || '') + '" placeholder="www.tunegocio.com" autocapitalize="off" inputmode="url"></div></div>' +
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
      '<h4>📋 Políticas para el cliente</h4>' +
      '<div class="campo"><label for="aj-pol">Texto de «Cómo funciona tu pedido» (opcional)</label><textarea class="entrada" id="aj-pol" name="politicas_texto" maxlength="2000" rows="5" placeholder="Una regla por línea. Vacío = se usan las reglas estándar (pago, cambios, anulación, entrega).">' + UI.esc(c.politicas_texto || '') + '</textarea>' +
      '<span class="ayuda">El cliente las acepta antes de enviar su pedido. <a href="politicas.html" target="_blank" rel="noopener">Ver políticas</a>.</span></div>' +
      '<h4>🕒 Formato de hora</h4>' +
      '<div class="segmento" id="aj-hora"><button type="button" data-h="24" class="' + (c.formato_hora !== '12' ? 'activo' : '') + '">24 h (18:30)</button><button type="button" data-h="12" class="' + (c.formato_hora === '12' ? 'activo' : '') + '">12 h (6:30 p. m.)</button></div>' +
      '<h4>🔒 Privacidad (ley de protección de datos)</h4>' +
      '<div class="campo"><label for="aj-priv">Texto propio del aviso (opcional)</label><textarea class="entrada" id="aj-priv" name="privacidad_texto" maxlength="1500" placeholder="Ej. Responsable: Pollos Don Diego, RUC…, dirección…">' + UI.esc(c.privacidad_texto || '') + '</textarea>' +
      '<span class="ayuda">Se muestra arriba del aviso estándar. <a href="privacidad.html" target="_blank" rel="noopener">Ver aviso</a>. Recorridos GPS y fotos de entrega se borran solos a los ' + UI.esc(c.dias_guardar_rastreo || '30') + ' días.</span></div>' +
      '<div class="fila-campos"><div class="campo"><label for="aj-dhist">Historial del cliente en su teléfono (días)</label><input class="entrada" id="aj-dhist" name="dias_historial_cliente" inputmode="numeric" value="' + UI.esc(c.dias_historial_cliente || '30') + '"><span class="ayuda">«Mis pedidos» se borra solo pasado este tiempo. El cliente también puede borrarlo.</span></div>' +
      '<div class="campo"><label for="aj-alimp">Borrar clientes que no piden en (años)</label><input class="entrada" id="aj-alimp" name="anos_limpieza_clientes" inputmode="numeric" value="' + UI.esc(c.anos_limpieza_clientes || '2') + '"><span class="ayuda">Se borran sus datos personales; las ventas quedan para la contabilidad.</span></div></div>' +
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
        var nom = (ORIGENES.filter(function (x) { return x[0] === o; })[0] || ['', ''])[1];
        UI.hojaQR({ titulo: 'QR · ' + nom, nombre: nombre, subtitulo: APP.nombreLocal(l), enlace: UI.enlacePedir({ local: l, origen: o }), logo: c.logo_url });
      });
    });
    /* 3.1.3: copiar enlaces */
    UI.$$('[data-copiar]', cuerpo()).forEach(function (b) { b.addEventListener('click', function () { UI.copiar(enlaces[Number(b.getAttribute('data-copiar'))][2]); }); });
    UI.$$('[data-copiar-origen]', cuerpo()).forEach(function (b) { b.addEventListener('click', function () { UI.copiar(UI.enlacePedir({ local: UI.$('#qr-local').value, origen: b.getAttribute('data-copiar-origen') })); }); });
    UI.$$('[data-mesa]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () {
        var l = UI.$('#qr-local').value, m = b.getAttribute('data-mesa');
        UI.hojaQR({ titulo: 'QR · Mesa ' + m, nombre: nombre, subtitulo: 'Mesa ' + m, llamado: 'Escanea y pide desde tu mesa', enlace: UI.enlacePedir({ local: l, mesa: m, origen: 'mesa' }), logo: c.logo_url });
      });
    });
    UI.$$('[data-dia]', cuerpo()).forEach(function (b) { b.addEventListener('click', function () { b.classList.toggle('activo'); }); });
    /* 3.1.5: editor de cuentas bancarias (se guardan con «Guardar ajustes») */
    var cuentas = [];
    try { cuentas = JSON.parse(c.cuentas_bancarias || '[]'); } catch (e) { cuentas = []; }
    if (!Array.isArray(cuentas)) cuentas = [];
    function pintarCuentas() {
      UI.$('#aj-cuentas').innerHTML = cuentas.length ? cuentas.map(function (x, i) {
        var editar = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16 4l4 4M4 16l12-12a2.8 2.8 0 0 1 4 4L8 20H4z"/></svg>';
        var quitar = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
        return '<div class="item banco-admin">'+UI.logoBanco(x.banco,x.logo_url)+'<div class="banco-admin-datos"><div class="banco-admin-nombre">'+UI.esc(x.banco)+(x.activa===false?' <small class="banco-admin-oculta">Oculta</small>':'')+'</div>'+
          '<div class="banco-admin-sub">'+UI.esc(x.tipo==='corriente'?'Corriente':'Ahorros')+' · '+UI.esc(x.numero)+'</div><div class="banco-admin-sub">'+UI.esc(x.titular)+'</div></div>'+
          '<div class="banco-admin-acciones"><button class="btn secundario chico" type="button" data-cta-ed="'+i+'" aria-label="Editar">'+editar+'</button><button class="btn borde chico" type="button" data-cta-del="'+i+'" aria-label="Quitar">'+quitar+'</button></div></div>';
      }).join('') : '<p class="ayuda" style="margin:0">Aún no hay cuentas. Sin cuentas, la transferencia no aparece al cliente.</p>';
      UI.$('#aj-cuenta-mas').hidden = cuentas.length >= 6;
      UI.$$('[data-cta-ed]', cuerpo()).forEach(function (b) { b.addEventListener('click', function () { editarCuenta(Number(b.getAttribute('data-cta-ed'))); }); });
      UI.$$('[data-cta-del]', cuerpo()).forEach(function (b) {
        b.addEventListener('click', async function () {
          var x = cuentas[Number(b.getAttribute('data-cta-del'))];
          if (await UI.confirmar('¿Quitar la cuenta de ' + x.banco + '?', 'Deja de mostrarse al cliente cuando toque «Guardar ajustes».', 'Sí, quitar', true)) { cuentas.splice(Number(b.getAttribute('data-cta-del')), 1); pintarCuentas(); }
        });
      });
    }
    function editarCuenta(i) {
      var x = i >= 0 ? cuentas[i] : { banco: '', tipo: 'ahorros', numero: '', titular: '', documento: '', correo: '', activa: true };
      var logo=x.logo_url||'', subiendo=false;
      function validarCuenta(v) {
          if(subiendo) return 'Espere a que termine la subida del logotipo.';
          var n = { banco: UI.$('#cta-b', v).value.trim(), tipo: UI.$('[data-t].activo', v).getAttribute('data-t'), numero: UI.$('#cta-n', v).value.trim().replace(/\s+/g,' '), titular: UI.$('#cta-ti', v).value.trim(), documento: UI.$('#cta-d', v).value.trim().replace(/\s+/g,' '), logo_url:logo, correo: UI.$('#cta-c', v).value.trim(), activa: UI.$('#cta-a', v).checked };
          if (!n.banco) return 'Escriba el banco.';
          if (!/^[A-Za-z0-9][A-Za-z0-9 -]{3,33}$/.test(n.numero) || n.numero.replace(/[ -]/g,'').length < 5) return 'Revise el número de cuenta.';
          if (!n.titular) return 'Escriba a nombre de quién está.';
          if (n.documento && !/^[A-Za-z0-9][A-Za-z0-9 .-]{0,31}$/.test(n.documento)) return 'Revise el documento.';
          if (n.correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(n.correo)) return 'Revise el correo.';
          if (i >= 0) cuentas[i] = n; else cuentas.push(n);
          return true;
      }
      UI.ventana({
        icono: '🏦', titulo: i >= 0 ? 'Editar cuenta' : 'Nueva cuenta bancaria',
        html: '<form id="cta-f" class="formulario" novalidate>' +
          '<div class="campo"><label for="cta-b">Banco</label><input class="entrada" id="cta-b" maxlength="40" list="cta-bancos" value="' + UI.esc(x.banco) + '" placeholder="Ej. Banco Pichincha"><datalist id="cta-bancos">' + ['Banco Pichincha', 'Banco Guayaquil', 'Produbanco', 'Banco del Pacífico', 'Banco Internacional', 'Banco Bolivariano', 'Cooperativa JEP', 'Banco del Austro'].map(function (n) { return '<option value="' + n + '">'; }).join('') + '</datalist></div>' +
          '<div class="campo"><label>Logotipo del banco (opcional)</label><div id="cta-logo-prev">'+UI.logoBanco(x.banco,logo)+'</div><input type="file" id="cta-logo-file" accept="image/png,image/jpeg,image/webp"><button type="button" class="btn borde chico" id="cta-logo-quitar">Quitar logotipo personalizado</button><input type="hidden" id="cta-logo-cambio"></div>' +
          '<div class="campo"><label>Tipo</label><div class="segmento" id="cta-t"><button type="button" data-t="ahorros" class="' + (x.tipo !== 'corriente' ? 'activo' : '') + '">Ahorros</button><button type="button" data-t="corriente" class="' + (x.tipo === 'corriente' ? 'activo' : '') + '">Corriente</button></div></div>' +
          '<div class="campo"><label for="cta-n">Número de cuenta</label><input class="entrada" id="cta-n" maxlength="34" autocapitalize="characters" value="' + UI.esc(x.numero) + '"></div>' +
          '<div class="campo"><label for="cta-ti">A nombre de</label><input class="entrada" id="cta-ti" maxlength="60" value="' + UI.esc(x.titular) + '"></div>' +
          '<div class="campo"><label for="cta-d">Documento del titular (opcional)</label><input class="entrada" id="cta-d" maxlength="32" value="' + UI.esc(x.documento || '') + '"><span class="ayuda">Algunos bancos lo piden para transferir desde otro banco.</span></div>' +
          '<div class="campo"><label for="cta-c">Correo para el comprobante (opcional)</label><input class="entrada" id="cta-c" type="email" maxlength="80" value="' + UI.esc(x.correo || '') + '" autocapitalize="off"></div>' +
          '<label class="interruptor"><input type="checkbox" id="cta-a"' + (x.activa !== false ? ' checked' : '') + '> Mostrar esta cuenta al cliente</label></form>',
        alAbrir: function (v) { UI.$$('[data-t]', v).forEach(function (b) { b.addEventListener('click', function () { UI.$$('[data-t]', v).forEach(function (y) { y.classList.toggle('activo', y === b); }); }); });
          function pintarLogo(){UI.$('#cta-logo-prev',v).innerHTML=UI.logoBanco(UI.$('#cta-b',v).value,logo);}
          function marcarLogo(){UI.$('#cta-logo-cambio',v).dispatchEvent(new Event('input',{bubbles:true}));}
          UI.$('#cta-b',v).addEventListener('input',pintarLogo);
          UI.$('#cta-logo-quitar',v).addEventListener('click',function(){if(subiendo)return;logo='';marcarLogo();pintarLogo();});
          UI.$('#cta-logo-file',v).addEventListener('change',async function(e){var f=e.target.files[0];if(!f||subiendo)return;subiendo=true;e.target.disabled=true;try{if(!/^image\/(png|jpeg|webp)$/.test(f.type)||f.size>8000000)throw Error('Use PNG, JPG o WebP de hasta 8 MB.');var base=await UI.leerFoto(f,480);var r=await DATOS.pedir('fotoSubir',{foto:base,tipo:'banco'},{guardar:true});if(!v.isConnected)return;logo=r.url;marcarLogo();pintarLogo();UI.aviso('Logotipo listo. Guarde los ajustes.','ok');}catch(err){if(v.isConnected)UI.aviso(err.message,'error');}finally{subiendo=false;e.target.disabled=false;e.target.value='';}});
        },
        botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Listo', valor: true, antes: function (v) { var m = validarCuenta(v); if (m !== true) { UI.aviso(m, 'error'); return false; } return true; } }]
      }).then(function (ok) { if (ok) { pintarCuentas(); UI.aviso('Toque «Guardar ajustes» para publicar la cuenta.', ''); } });
    }
    UI.$('#aj-cuenta-mas').addEventListener('click', function () { editarCuenta(-1); });
    pintarCuentas();
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
      d.verificar_antes_preparar = UI.$('#aj-verprep').checked ? 'SI' : 'NO'; // 3.1.5
      d.permitir_programar = UI.$('#aj-programar').checked ? 'SI' : 'NO'; // 3.1.6
      d.recibir_cerrado = UI.$('#aj-cerrado').checked ? 'SI' : 'NO';
      d.cuentas_bancarias = JSON.stringify(cuentas);
      d.minutos_alerta_pago = String(Math.max(5, Math.floor(UI.numero(d.minutos_alerta_pago) || 30)));
      d.dias_historial_cliente = String(Math.min(365, Math.max(1, Math.floor(UI.numero(d.dias_historial_cliente) || 30))));
      d.anos_limpieza_clientes = String(Math.min(10, Math.max(1, Math.floor(UI.numero(d.anos_limpieza_clientes) || 2))));
      d.propinas = UI.$('#aj-propinas').checked ? 'SI' : 'NO';
      d.codigo_entrega = UI.$('#aj-codigo').checked ? 'SI' : 'NO';
      d.efectivo_permitido = UI.$('#aj-efectivo').checked ? 'SI' : 'NO'; // 3.1.3
      d.efectivo_maximo = d.efectivo_maximo ? String(UI.numero(d.efectivo_maximo) || '') : '';
      if (d.efectivo_permitido === 'NO' && !UI.$('#aj-verificar').checked) return UI.aviso('Sin efectivo, deje activado «no despachar hasta verificar el pago».', 'error');
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
  function cuentasCon(c) { try { return JSON.parse(c.cuentas_bancarias || '[]').some(function (x) { return x.activa !== false; }); } catch (e) { return !!String(c.datos_transferencia || '').trim(); } }
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
      ['💳', 'Cuentas bancarias o QR de Deuna', !!(cuentasCon(c) || c.deuna_qr_url), 'menu?p=enlace'],
      ['💬', 'WhatsApp del negocio (para recibir comprobantes)', !!String(c.whatsapp || '').trim(), 'config'],
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
