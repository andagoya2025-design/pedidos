/**
 * ============================================================
 * DATOS — la ÚNICA puerta entre la pantalla y la base de datos.
 * Hoy habla con Google Apps Script + Sheets. Si un cliente crece,
 * se cambia SOLO este archivo (Firebase/Supabase) y el resto queda igual.
 *
 * Reglas (lecciones de AUROSANAX):
 * - Nunca no-cors: siempre se lee la respuesta real del servidor.
 * - Lecturas: máx. 2 reintentos con espera. Guardados: sin reintento
 *   automático (evita duplicados); si falla, se avisa con el motivo.
 * - Si el script es más viejo que la pantalla: no se guarda nada.
 * - Memoria local en UN solo lugar, se limpia al cerrar sesión.
 * ============================================================
 */
(function (global) {
  'use strict';

  /* ---------- Memoria local: una sola clave ---------- */
  var CLAVE_MEMORIA = 'app_memoria_v1';
  var MEMORIA = {
    _todo: function () {
      try { return JSON.parse(global.localStorage.getItem(CLAVE_MEMORIA) || '{}') || {}; } catch (e) { return {}; }
    },
    leer: function (k) { return this._todo()[k]; },
    guardar: function (k, v) {
      var t = this._todo(); t[k] = v;
      try { global.localStorage.setItem(CLAVE_MEMORIA, JSON.stringify(t)); } catch (e) { /* modo privado: se sigue sin memoria */ }
    },
    /* Al cerrar sesión: se borra todo menos el tema (claro/oscuro) del equipo. */
    limpiarSesion: function () {
      var tema = this.leer('tema');
      try { global.localStorage.removeItem(CLAVE_MEMORIA); } catch (e) {}
      if (tema) this.guardar('tema', tema);
    }
  };
  global.APP_MEMORIA = MEMORIA;

  function dispositivo() {
    var ua = global.navigator.userAgent || '';
    var tipo = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android' : 'Tableta Android') : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Otro';
    var instalada = (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) || global.navigator.standalone === true;
    return tipo + (instalada ? ' · app' : ' · navegador');
  }

  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* Error con mensaje claro para la persona. */
  function ErrorApp(mensaje, codigo) {
    var e = new Error(mensaje);
    e.codigo = codigo || 'ERROR';
    return e;
  }

  var scriptViejo = false;

  async function llamar(cuerpo) {
    var cfg = global.APP_CONFIG;
    if (!cfg || !cfg.configurada) throw ErrorApp('Esta instalación aún no tiene configurada la dirección del servidor.', 'SIN_CONFIG');
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, cfg.tiempoEsperaMs);
    var resp;
    try {
      resp = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // sin preflight; respuesta legible
        body: JSON.stringify(cuerpo),
        signal: ctl.signal,
        redirect: 'follow',
        cache: 'no-store'
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw ErrorApp('La conexión tardó demasiado.', 'TIEMPO');
      throw ErrorApp('Sin conexión con el servidor. Revise su internet.', 'RED');
    } finally {
      clearTimeout(t);
    }
    if (!resp.ok) throw ErrorApp('El servidor respondió con un error (' + resp.status + ').', 'HTTP');
    var json;
    try { json = await resp.json(); } catch (e) { throw ErrorApp('Respuesta no válida del servidor.', 'RESPUESTA'); }
    if (typeof json.version_num === 'number' && json.version_num < cfg.versionScriptMinima) scriptViejo = true;
    return json;
  }

  /**
   * DATOS.pedir(accion, data, { guardar: true|false })
   * Devuelve data si ok; si no, lanza Error con mensaje claro y .codigo.
   */
  async function pedir(accion, data, opciones) {
    opciones = opciones || {};
    var guardar = !!opciones.guardar;
    if (guardar && scriptViejo) {
      throw ErrorApp('El sistema se está actualizando. No se guardó nada; intente en unos minutos.', 'ACTUALIZANDO');
    }
    var cuerpo = { accion: accion, data: data || {}, token: MEMORIA.leer('token') || '', dispositivo: dispositivo() };
    var intentos = guardar ? 1 : 3;
    var ultimo;
    for (var i = 0; i < intentos; i++) {
      try {
        var r = await llamar(cuerpo);
        if (guardar && scriptViejo) throw ErrorApp('El sistema se está actualizando. Avise al dueño.', 'ACTUALIZANDO');
        if (r.ok) {
          if (global.APP_DEBUG) console.info('[datos]', accion, r.ms + ' ms (servidor)');
          return r.data || {};
        }
        var err = ErrorApp(r.error || 'No se pudo completar.', r.codigo || 'ERROR');
        if (err.codigo === 'SESION') {
          MEMORIA.limpiarSesion();
          global.dispatchEvent(new CustomEvent('app:sesion-terminada'));
        }
        throw err; // un error del servidor no se reintenta
      } catch (e) {
        ultimo = e;
        var deRed = e.codigo === 'RED' || e.codigo === 'TIEMPO' || e.codigo === 'HTTP';
        if (!deRed || i === intentos - 1) break;
        await esperar(900 * (i + 1));
      }
    }
    throw ultimo;
  }

  /* Estado público (sin sesión): instalado, nombre, colores. */
  async function estado() {
    return pedir('estado', {}, { guardar: false });
  }

  global.DATOS = {
    pedir: pedir,
    estado: estado,
    scriptViejo: function () { return scriptViejo; }
  };
})(window);
