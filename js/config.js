/**
 * ============================================================
 * CONFIGURACIÓN DE ESTA INSTALACIÓN — una sola línea por cliente
 * (idea tomada de iasyn-config.js de IASYN 2).
 *
 * En cada copia nueva: pegar aquí la dirección /exec del script
 * publicado de ESE cliente. Nada más se toca.
 * Si queda vacía o no es válida, la app se bloquea y avisa:
 * nunca se conecta por accidente a los datos de otro cliente.
 * ============================================================
 */
(function (global) {
  'use strict';

  /* ===== ÚNICA LÍNEA A CONFIGURAR EN CADA CLIENTE ===== */
  var URL_SCRIPT = ''; // LABORATORIO: use SOLO el Apps Script y Google Sheet de PRUEBAS.
  /* ===================================================== */

  function valida(url) {
    try {
      var u = new URL(String(url || '').trim());
      return u.protocol === 'https:' && u.hostname === 'script.google.com' && /\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(u.pathname);
    } catch (e) {
      return false;
    }
  }

  global.APP_CONFIG = Object.freeze({
    url: valida(URL_SCRIPT) ? String(URL_SCRIPT).trim() : '',
    configurada: valida(URL_SCRIPT),
    versionPantalla: '3.1.7',
    versionScriptMinima: 30107, // 3.1.7 — requiere soporte de teléfonos internacionales
    tiempoEsperaMs: 25000
  });
})(window);
