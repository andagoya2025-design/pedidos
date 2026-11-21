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
  /* 3.0: manda la ÚLTIMA ubicación guardada. Si se pegó un enlace (cliente o WhatsApp)
   * y el servidor no pudo sacar el punto, se usa el enlace tal cual. */
  UI.enlaceMapa = function (p) {
    var hayPunto = p.lat !== '' && p.lat != null && p.lng !== '' && p.lng != null;
    var fuente = String(p.ubicacion_fuente || '');
    if (p.ubicacion_enlace && (fuente === 'whatsapp' || fuente === 'enlace') && !hayPunto) return p.ubicacion_enlace;
    if (hayPunto) return 'https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lng;
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

  /* De dónde salió la ubicación del pedido (se muestra en el panel). */
  UI.fuenteUbicacion = function (p) {
    var f = String(p.ubicacion_fuente || '');
    if (f === 'whatsapp') return '📍 Enlace de WhatsApp';
    if (f === 'enlace') return '📍 Enlace pegado por el cliente';
    if (f === 'gps' || (p.lat !== '' && p.lat != null)) return '📍 GPS del cliente';
    return p.direccion ? '📍 Solo dirección escrita' : '⚠️ Sin ubicación';
  };

  /* Tipo de entrega (pedidos viejos: con zona = domicilio). */
  UI.tipoEntrega = function (p) { return p.tipo_entrega || (p.zona_id ? 'domicilio' : 'retiro'); };
  UI.TIPOS = { domicilio: { icono: '🛵', nombre: 'Domicilio' }, retiro: { icono: '🏪', nombre: 'Retiro' }, mesa: { icono: '🍽️', nombre: 'Mesa' } };
  UI.etiquetaTipo = function (p) {
    var t = UI.tipoEntrega(p), d = UI.TIPOS[t] || UI.TIPOS.retiro;
    return '<span class="chip-tipo tipo-' + t + '">' + d.icono + ' ' + (t === 'mesa' && p.mesa ? 'Mesa ' + UI.esc(p.mesa) : d.nombre) + '</span>' +
      (p.hora_llegada ? '<span class="chip-tipo tipo-hora">⏰ ' + UI.esc(UI.hora(p.hora_llegada)) + '</span>' : '');
  };
  UI.NOMBRE_PAGO = { efectivo: '💵 Efectivo', transferencia: '🏦 Transferencia', deuna: '📲 Deuna' };
  UI.esDigital = function (f) { return f === 'transferencia' || f === 'deuna'; };

  /* Etiquetas de los platos. */
  UI.ETIQUETAS = {
    mas_vendido: '⭐ Más vendido', nuevo: '✨ Nuevo', picante: '🌶️ Picante', vegetariano: '🌱 Vegetariano', para_compartir: '👨‍👩‍👧 Para compartir', promo: '🏷️ Promo'
  };
  UI.chipsEtiquetas = function (txt) {
    return String(txt || '').split(',').filter(function (k) { return UI.ETIQUETAS[k]; }).map(function (k) {
      return '<span class="chip-etiqueta et-' + k + '">' + UI.ETIQUETAS[k] + '</span>';
    }).join('');
  };

  /* Identificador anónimo de este teléfono (frenos contra abusos; no es dato personal). */
  UI.dispId = function () {
    var M = global.APP_MEMORIA, id = M && M.leer('disp_id');
    if (!id) {
      var a = new Uint8Array(10); (global.crypto || global.msCrypto).getRandomValues(a);
      id = 'd' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      if (M) M.guardar('disp_id', id);
    }
    return id;
  };

  /* Foto del teléfono -> JPG liviano (máx. 1280 px) en base64.
   * 3.0: { cuadrado: true } recorta al centro (fotos de platos parejas). */
  UI.leerFoto = function (archivo, max, op) {
    op = op || {};
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
          var c = document.createElement('canvas');
          if (op.cuadrado) {
            var lado = Math.min(img.width, img.height), dest = Math.min(max, lado);
            c.width = dest; c.height = dest;
            c.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, dest, dest);
          } else {
            var esc = Math.min(1, max / Math.max(img.width, img.height));
            c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          }
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

  /* Enlace de la app para el personal (misma carpeta donde está index.html). */
  UI.enlaceApp = function () {
    return global.location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '');
  };
  /* Mensaje con el enlace y el usuario (la clave solo si se acaba de crear o cambiar). */
  UI.textoAcceso = function (nombre, usuario, clave, rol) {
    return 'Hola ' + String(nombre || '').split(' ')[0] + ', este es tu acceso al sistema' + (rol ? ' (' + rol + ')' : '') + ':\n\n' +
      '1) Abre: ' + UI.enlaceApp() + '\n' +
      '2) Instálalo en tu teléfono: iPhone (Safari) → Compartir → «Agregar a pantalla de inicio». Android (Chrome) → ⋮ → «Instalar app».\n' +
      '3) Entra con:\n   Usuario: ' + usuario + '\n   Clave: ' + (clave || '(te la doy aparte)') + '\n\n' +
      'Puedes cambiar tu clave en «Mi cuenta».';
  };
  /* WhatsApp al número dado o, si no hay número, para elegir el contacto. */
  UI.compartirWhatsApp = function (texto, tel) {
    var d = UI.digitos(tel);
    global.open(d ? UI.enlaceWhatsApp(d, texto) : 'https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener');
  };

  UI.numero = function (v) { var n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : NaN; };
})(window);
