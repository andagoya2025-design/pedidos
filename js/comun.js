/**
 * ============================================================
 * COMÚN de las fases 2 a 7: estados del pedido, WhatsApp, mapas,
 * ubicación, fotos y formatos cortos. Se suma a UI (no cambia
 * nada de lo que ya hacía UI).
 * ============================================================
 */
(function (global) {
  'use strict';
  var UI = global.UI;

  /* Estados del pedido: color e ícono fijos. */
  UI.ESTADOS = {
    'Recibido':   { clase: 'est-recibido',   icono: '🧾', siguiente: 'Preparando' },
    'Preparando': { clase: 'est-preparando', icono: '👨‍🍳', siguiente: 'En camino' },
    'En camino':  { clase: 'est-camino',     icono: '🛵', siguiente: 'Entregado' },
    'Entregado':  { clase: 'est-entregado',  icono: '✅', siguiente: '' },
    'Anulado':    { clase: 'est-anulado',    icono: '⛔', siguiente: '' }
  };
  UI.chipEstado = function (estado) {
    var e = UI.ESTADOS[estado] || { clase: '', icono: '•' };
    return '<span class="chip-estado ' + e.clase + '">' + e.icono + ' ' + UI.esc(estado) + '</span>';
  };

  UI.hora = function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try { return new Intl.DateTimeFormat('es-EC', { timeZone: UI.zona, hour: '2-digit', minute: '2-digit', hour12: false }).format(d); } catch (e) { return d.toTimeString().slice(0, 5); }
  };

  UI.minutosDesde = function (iso, ahoraIso) {
    var a = new Date(iso).getTime(), b = ahoraIso ? new Date(ahoraIso).getTime() : Date.now();
    return isNaN(a) ? 0 : Math.max(0, Math.round((b - a) / 60000));
  };

  /* Hoy (aaaa-mm-dd) en la zona del negocio. */
  UI.hoy = function () {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: UI.zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); }
  };

  /* Solo dígitos para wa.me / tel: ("+593 99..." -> "59399...") */
  UI.digitos = function (tel) { return String(tel || '').replace(/\D/g, ''); };

  /* Abre WhatsApp con el mensaje ya escrito (gratis: la persona presiona Enviar). */
  UI.enlaceWhatsApp = function (tel, texto) {
    var d = UI.digitos(tel);
    return 'https://wa.me/' + d + (texto ? '?text=' + encodeURIComponent(texto) : '');
  };
  UI.abrirWhatsApp = function (tel, texto) {
    if (!UI.digitos(tel)) { UI.aviso('No hay número de WhatsApp registrado.', 'error'); return; }
    global.open(UI.enlaceWhatsApp(tel, texto), '_blank', 'noopener');
  };

  /* Google Maps: ruta al punto exacto o búsqueda por dirección. */
  UI.enlaceMapa = function (p) {
    if (p.lat !== '' && p.lat != null && p.lng !== '' && p.lng != null) return 'https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lng;
    if (p.ubicacion_enlace) return p.ubicacion_enlace;
    if (p.direccion) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.direccion);
    return '';
  };

  /* Ubicación del teléfono (pide permiso). Nunca lanza: devuelve null si no se pudo. */
  UI.ubicacion = function (espera) {
    return new Promise(function (resolver) {
      if (!global.navigator.geolocation) return resolver(null);
      global.navigator.geolocation.getCurrentPosition(function (pos) {
        resolver({ lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6, precision: Math.round(pos.coords.accuracy) });
      }, function () { resolver(null); }, { enableHighAccuracy: true, timeout: espera || 12000, maximumAge: 30000 });
    });
  };

  /* Foto del teléfono -> JPG liviano (máx. 1280 px) en base64. */
  UI.leerFoto = function (archivo, max) {
    max = max || 1280;
    return new Promise(function (resolver, rechazar) {
      if (!archivo) return resolver('');
      if (!/^image\//.test(archivo.type)) return rechazar(new Error('Elija una foto.'));
      var lector = new FileReader();
      lector.onerror = function () { rechazar(new Error('No se pudo leer la foto.')); };
      lector.onload = function () {
        var img = new Image();
        img.onerror = function () { rechazar(new Error('No se pudo abrir la foto.')); };
        img.onload = function () {
          var esc = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolver(c.toDataURL('image/jpeg', 0.72));
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  };

  /* Código único de envío: si el pedido se manda dos veces, el servidor no lo duplica. */
  UI.codigoEnvio = function () {
    var a = new Uint8Array(12);
    (global.crypto || global.msCrypto).getRandomValues(a);
    return 'op-' + Date.now().toString(36) + '-' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  };

  /* Encabezado de una vista con botón Actualizar. */
  UI.encabezado = function (titulo, subtitulo, extra) {
    return '<div class="vista-cabeza"><div style="flex:1;min-width:0"><h1 class="titulo">' + UI.esc(titulo) + '</h1>' +
      (subtitulo ? '<p class="subtitulo">' + UI.esc(subtitulo) + '</p>' : '') + '</div>' +
      (extra || '') + '<button class="btn secundario chico" type="button" data-actualizar>↻ Actualizar</button></div>';
  };

  /* Pide un texto en ventana premium (motivo, monto…). Devuelve el texto o null. */
  UI.pedirDato = function (op) {
    var valor = null;
    return UI.ventana({
      icono: op.icono || '✏️', titulo: op.titulo, texto: op.texto || '',
      html: '<div class="campo"><label for="pd-dato">' + UI.esc(op.etiqueta || '') + '</label>' +
        (op.area ? '<textarea class="entrada" id="pd-dato" maxlength="' + (op.max || 200) + '">' + UI.esc(op.valor || '') + '</textarea>'
          : '<input class="entrada" id="pd-dato" ' + (op.tipo ? 'type="' + op.tipo + '" ' : '') + (op.modo ? 'inputmode="' + op.modo + '" ' : '') + (op.tipo === 'number' ? 'step="0.01" min="0" ' : '') + 'maxlength="' + (op.max || 200) + '" value="' + UI.esc(op.valor || '') + '" placeholder="' + UI.esc(op.ph || '') + '">') +
        (op.ayuda ? '<span class="ayuda">' + UI.esc(op.ayuda) + '</span>' : '') + '</div>',
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: op.boton || 'Guardar', valor: true, clase: op.peligro ? 'peligro' : '', antes: function (v) {
        valor = UI.$('#pd-dato', v).value.trim();
        var malo = op.validar ? op.validar(valor) : '';
        if (malo) { UI.aviso(malo, 'error'); UI.$('#pd-dato', v).setAttribute('aria-invalid', 'true'); return false; }
        return true;
      } }]
    }).then(function (ok) { return ok ? valor : null; });
  };

  UI.numero = function (v) { var n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : NaN; };
})(window);
