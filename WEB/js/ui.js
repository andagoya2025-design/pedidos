/**
 * ============================================================
 * UI — ventanas premium, avisos, formatos y protección doble clic.
 * Regla: NUNCA alert() ni confirm() (congelan la pantalla).
 * ============================================================
 */
(function (global) {
  'use strict';

  var UI = {};

  /* ---------- Texto seguro (todo lo que se pinta pasa por aquí) ---------- */
  UI.esc = function (v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  UI.$ = function (sel, raiz) { return (raiz || document).querySelector(sel); };
  UI.$$ = function (sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); };

  /* ---------- Formatos (zona horaria del negocio) ---------- */
  UI.zona = 'America/Guayaquil';
  UI.moneda = 'USD';

  UI.dinero = function (n) {
    var v = Math.round((Number(n) || 0) * 100) / 100;
    try {
      return new Intl.NumberFormat('es-EC', { style: 'currency', currency: UI.moneda, minimumFractionDigits: 2 }).format(v);
    } catch (e) {
      return UI.moneda + ' ' + v.toFixed(2);
    }
  };

  UI.fechaHora = function (iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    try {
      return new Intl.DateTimeFormat('es-EC', { timeZone: UI.zona, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: UI.hora12 ? UI.hora12() : false }).format(d);
    } catch (e) {
      return d.toLocaleString();
    }
  };

  UI.iniciales = function (nombre) {
    var p = String(nombre || '?').trim().split(/\s+/).filter(function (w) { return !/^(el|la|los|las|de|del|y)$/i.test(w); });
    if (!p.length) p = ['?'];
    return ((p[0] || '?').charAt(0) + (p[1] ? p[1].charAt(0) : '')).toUpperCase();
  };

  /* ---------- Colores del negocio ---------- */
  function hexARgb(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
  }

  UI.aplicarMarca = function (pub) {
    pub = pub || {};
    var raiz = document.documentElement;
    var acento = hexARgb(pub.color_acento);
    if (acento) {
      raiz.style.setProperty('--acento', pub.color_acento);
      raiz.style.setProperty('--acento-suave', 'rgba(' + acento.join(',') + ',.14)');
    }
    if (hexARgb(pub.color_primario)) raiz.style.setProperty('--primario', pub.color_primario);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && pub.color_primario) meta.setAttribute('content', pub.color_primario);
    if (pub.negocio_nombre) document.title = pub.negocio_nombre;
    if (pub.moneda) UI.moneda = pub.moneda;
    UI.$$('[data-marca-nombre]').forEach(function (el) { el.textContent = pub.negocio_nombre || ''; });
    UI.$$('[data-marca-logo]').forEach(function (el) {
      el.innerHTML = '';
      if (pub.logo_url) {
        var img = new Image();
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.onerror = function () { el.textContent = UI.iniciales(pub.negocio_nombre); };
        img.src = pub.logo_url;
        el.appendChild(img);
      } else {
        el.textContent = UI.iniciales(pub.negocio_nombre);
      }
    });
  };

  /* ---------- Tema claro / oscuro (recordado en este equipo) ---------- */
  UI.tema = function (valor) {
    var t = valor || (global.APP_MEMORIA && global.APP_MEMORIA.leer('tema')) ||
      (global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro');
    document.documentElement.setAttribute('data-tema', t);
    if (valor && global.APP_MEMORIA) global.APP_MEMORIA.guardar('tema', valor);
    return t;
  };

  /* ---------- Avisos flotantes ---------- */
  UI.aviso = function (texto, tipo) {
    var cont = UI.$('.avisos');
    if (!cont) {
      cont = document.createElement('div');
      cont.className = 'avisos';
      cont.setAttribute('role', 'status');
      cont.setAttribute('aria-live', 'polite');
      document.body.appendChild(cont);
    }
    var el = document.createElement('div');
    tipo = tipo === 'exito' ? 'ok' : tipo;
    el.className = 'aviso-flotante aviso-premium ' + (tipo || '');
    var error = tipo === 'error', exito = tipo === 'ok';
    var ruta = error ? '<path d="M12 8v4m0 4h.01"/><circle cx="12" cy="12" r="9"/>' : exito ? '<path d="m8 12 3 3 5-6"/><circle cx="12" cy="12" r="9"/>' : '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>';
    el.innerHTML = '<span class="aviso-premium-icono" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+ruta+'</svg></span><span class="aviso-premium-texto"><strong>'+(error?'Atención':exito?'Operación confirmada':'Información')+'</strong><span>'+UI.esc(texto)+'</span></span>';
    cont.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, tipo === 'error' ? 5200 : 3000);
    setTimeout(function () { el.remove(); }, tipo === 'error' ? 5600 : 3400);
  };

  /* ---------- Ventana premium ----------
   * UI.ventana({ icono, titulo, texto, html, botones:[{texto, valor, clase}], cerrable })
   * Devuelve una promesa con el valor del botón (o null si se cierra).
   */
  UI.ventana = function (op) {
    op = op || {};
    return new Promise(function (resolver) {
      var velo = document.createElement('div');
      velo.className = 'velo';
      var botones = op.botones || [{ texto: 'Entendido', valor: true }];
      velo.innerHTML =
        '<div class="ventana" role="dialog" aria-modal="true" aria-labelledby="vt-titulo">' +
        (op.sinCerrar || (op.cerrable === false && !op.antesCerrar) ? '' : '<button type="button" class="ventana-x" data-x aria-label="Cerrar">✕</button>') + // 3.1.5: siempre hay cómo salir
        (op.icono ? '<div class="ventana-ico" aria-hidden="true">' + UI.esc(op.icono) + '</div>' : '') +
        '<h2 id="vt-titulo">' + UI.esc(op.titulo || '') + '</h2>' +
        (op.texto ? '<p>' + UI.esc(op.texto) + '</p>' : '') +
        (op.html || '') +
        '<div class="acciones">' + botones.map(function (b, i) {
          return '<button type="button" class="btn ' + UI.esc(b.clase || '') + '" data-i="' + i + '">' + UI.esc(b.texto) + '</button>';
        }).join('') + '</div></div>';

      var anterior = document.activeElement;
      /* 3.1.5: en ventanas de edición (con formulario y botón de guardar), salir sin guardar pide un segundo toque */
      var editable = !op.antesCerrar && botones.some(function (b) { return b.antes; });
      var sucio = false, avisado = false;
      function puedeSalir() {
        if (op.antesCerrar) return op.antesCerrar(velo) !== false;
        if (editable && sucio && !avisado) { avisado = true; UI.aviso('Tiene cambios sin guardar. Toque «Guardar», o vuelva a tocar ✕ / «Cancelar» para salir sin guardar.', 'error'); return false; }
        return true;
      }
      function cerrar(valor) {
        document.removeEventListener('keydown', teclado);
        velo.remove();
        if (anterior && anterior.focus) anterior.focus();
        resolver(valor);
      }
      function teclado(ev) { if (ev.key === 'Escape' && op.cerrable !== false && puedeSalir()) cerrar(null); }

      velo.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-x]')) { // 3.1.5: la ✕ avisa antes si hay cambios sin guardar
          if (!puedeSalir()) return;
          return cerrar(null);
        }
        var b = ev.target.closest('[data-i]');
        if (b) {
          var def = botones[Number(b.getAttribute('data-i'))];
          if (!def.antes && (def.valor === false || def.valor === null) && editable && !puedeSalir()) return; // «Cancelar»
          if (def.antes) {
            var r = def.antes(velo);
            if (r === false) return; // validación del formulario falló: la ventana sigue abierta
          }
          cerrar(def.valor);
        } else if (ev.target === velo && op.cerrable !== false && !editable) {
          cerrar(null); // 3.1.5: las ventanas de edición no se cierran por un toque accidental afuera
        }
      });
      document.addEventListener('keydown', teclado);
      velo.addEventListener('input', function (ev) { if (ev.target.closest('input, select, textarea')) { sucio = true; avisado = false; } });
      velo.addEventListener('change', function (ev) { if (ev.target.closest('input, select, textarea') && ev.target.type !== 'file') { sucio = true; avisado = false; } });
      document.body.appendChild(velo);
      var foco = velo.querySelector('input, select, textarea') || velo.querySelector('.btn');
      if (foco) setTimeout(function () { foco.focus(); }, 30);
      if (op.alAbrir) op.alAbrir(velo, cerrar); // 3.1: alAbrir puede cerrar con un valor
    });
  };

  UI.confirmar = function (titulo, texto, siTexto, peligro) {
    return UI.ventana({
      icono: peligro ? '⚠️' : '❓', titulo: titulo, texto: texto,
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: siTexto || 'Sí, continuar', valor: true, clase: peligro ? 'peligro' : '' }]
    });
  };

  UI.error = function (titulo, texto) {
    return UI.ventana({ icono: '⚠️', titulo: titulo || 'No se pudo completar', texto: texto || '', botones: [{ texto: 'Entendido', valor: true }] });
  };

  /* ---------- Protección doble clic ----------
   * UI.trabajando(boton, async fn): bloquea el botón mientras trabaja.
   */
  UI.trabajando = async function (boton, fn) {
    if (boton && boton.getAttribute('aria-busy') === 'true') return undefined;
    if (boton) boton.setAttribute('aria-busy', 'true');
    try {
      return await fn();
    } finally {
      if (boton) boton.removeAttribute('aria-busy');
    }
  };

  UI.esqueleto = function (n) {
    var h = '';
    for (var i = 0; i < (n || 3); i++) h += '<div class="esqueleto" aria-hidden="true"></div>';
    return '<div class="lista" aria-busy="true">' + h + '</div>';
  };

  UI.vacio = function (icono, texto) {
    return '<div class="vacio"><div class="ico" aria-hidden="true">' + UI.esc(icono) + '</div><div>' + UI.esc(texto) + '</div></div>';
  };

  /* Lee un formulario como objeto { name: valor } */
  UI.leerFormulario = function (raiz) {
    var o = {};
    UI.$$('[name]', raiz).forEach(function (el) {
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else o[el.name] = String(el.value || '').trim();
    });
    return o;
  };

  global.UI = UI;
})(window);
