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
    try { return new Intl.DateTimeFormat('es-EC', { timeZone: UI.zona, hour: '2-digit', minute: '2-digit', hour12: UI.hora12() }).format(d); } catch (e) { return d.toTimeString().slice(0, 5); }
  };
  /* 3.1.6: fechas comerciales según zona configurada (sin cambiar el día contable). */
  UI.fechaLocal = function (iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d.getTime())) return '';
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: UI.zona, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
      var obj = {}; parts.forEach(function (p) { obj[p.type] = p.value; });
      return obj.year + '-' + obj.month + '-' + obj.day;
    } catch (e) { return d.toISOString().slice(0, 10); }
  };
  UI.ventanaHora = function (inicio, fin, min) {
    if (!inicio) return '';
    var ini = new Date(inicio); if (isNaN(ini.getTime())) return '';
    var final = fin && !isNaN(new Date(fin).getTime()) ? new Date(fin) : new Date(ini.getTime() + (Number(min) || 30) * 60000);
    return 'Entre ' + UI.hora(ini.toISOString()) + ' y ' + UI.hora(final.toISOString());
  };
  UI.haversineKm = function (a, b) {
    if (!a || !b || a.lat === '' || a.lng === '' || b.lat === '' || b.lng === '' || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
    var c = [Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng)];
    if (c.some(function (x) { return !isFinite(x); })) return null;
    var rad = Math.PI / 180, p = (c[2] - c[0]) * rad, q = (c[3] - c[1]) * rad;
    var v = Math.pow(Math.sin(p / 2), 2) + Math.cos(c[0] * rad) * Math.cos(c[2] * rad) * Math.pow(Math.sin(q / 2), 2);
    return Math.round(6371 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(Math.max(0, 1 - v))) * 10) / 10;
  };

  /* 3.1: horas en 12 h (a. m./p. m.) si el dueño lo eligió en los ajustes. */
  UI.hora12 = function () { var p = (global.APP && global.APP.publico) || global.__cfgPublica || {}; return String(p.formato_hora) === '12'; };

  UI.minutosDesde = function (iso, ahoraIso) {
    var a = new Date(iso).getTime(), b = ahoraIso ? new Date(ahoraIso).getTime() : Date.now();
    return isNaN(a) ? 0 : Math.max(0, Math.round((b - a) / 60000));
  };

  /* Hoy (aaaa-mm-dd) en la zona del negocio. */
  UI.hoy = function () {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: UI.zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); }
  };


  /* 3.1.7: misma regla de telefonía del servidor para avisar antes de enviar. */
  UI.telefonoInternacional = function (valor, pais) {
    var original = String(valor == null ? '' : valor).trim();
    if (!original || !/^\+?[0-9\s().-]+$/.test(original)) throw new Error('Escribe un número de celular válido.');
    var digitos = original.replace(/\D/g, '');
    pais = String(pais == null ? '593' : pais).replace(/\D/g, '');
    if (original.charAt(0) === '+' || digitos.slice(0, 2) === '00') {
      if (original.charAt(0) !== '+') digitos = digitos.slice(2);
      if (!/^[1-9]\d{7,14}$/.test(digitos) || (digitos.charAt(0) === '1' && digitos.length !== 11)) throw new Error('Revisa el número internacional (EE. UU.: 10 dígitos después de +1).');
      return '+' + digitos;
    }
    if (!/^[1-9]\d{0,2}$/.test(pais)) throw new Error('Revisa el código de país.');
    if (digitos.indexOf(pais) === 0 && digitos.length > pais.length + 6) {
      if (digitos.length > 15 || (pais === '1' && digitos.length !== 11)) throw new Error('Revisa el número de teléfono.');
      return '+' + digitos;
    }
    if (digitos.charAt(0) === '0') digitos = digitos.slice(1);
    if (digitos.length < 7 || pais.length + digitos.length > 15 || (pais === '1' && digitos.length !== 10)) throw new Error('Revisa el número (EE. UU.: 10 dígitos).');
    return '+' + pais + digitos;
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
      UI.errorUbicacion = '';
      function bien(pos) { resolver({ lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6, precision: Math.round(pos.coords.accuracy) }); }
      global.navigator.geolocation.getCurrentPosition(bien, function (e) {
        if (e && e.code === 1) { UI.errorUbicacion = 'permiso'; return resolver(null); }
        /* 3.1.1: dentro de casa el GPS exacto a veces no responde: se intenta con la ubicación aproximada (wifi). */
        global.navigator.geolocation.getCurrentPosition(bien, function (e2) {
          UI.errorUbicacion = e2 && e2.code === 1 ? 'permiso' : 'senal'; resolver(null);
        }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 });
      }, { enableHighAccuracy: true, timeout: espera || 12000, maximumAge: 30000 });
    });
  };

  /* 3.1.1: qué hacer cuando el teléfono no da la ubicación, según el teléfono y la causa. */
  UI.ayudaUbicacion = function () {
    var ios = /iPhone|iPad|iPod/.test(global.navigator.userAgent);
    if (UI.errorUbicacion === 'senal') return 'Tu teléfono no encontró la señal del GPS. Acércate a una ventana e inténtalo otra vez, o usa «Pegar ubicación».';
    if (ios) return '<b>En iPhone:</b><br>1) Ajustes → Privacidad y seguridad → <b>Localización</b>: activada.<br>2) Ahí mismo, baja a <b>Sitios web de Safari</b> → «Al usar la app».<br>3) Vuelve aquí y toca otra vez «Usar mi ubicación» → <b>Permitir</b>.<br>Si antes tocaste «No permitir»: en Safari toca <b>aA</b> (junto a la dirección) → Configuración del sitio web → Ubicación → Permitir.';
    return '<b>En Android:</b><br>1) Baja la barra de arriba y enciende <b>Ubicación</b>.<br>2) En Chrome toca el <b>candado</b> junto a la dirección → Permisos → Ubicación → <b>Permitir</b>.<br>3) Vuelve a tocar «Usar mi ubicación».';
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
      (p.hora_llegada ? '<span class="chip-tipo tipo-hora">⏰ ' + UI.esc(UI.ventanaHora(p.hora_llegada, p.hora_ventana_fin, Number(global.APP && global.APP.publico && global.APP.publico.ventana_minutos) || 30)) + ' aprox.</span>' : '');
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
          function blanco() { var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); } // 3.1.5: PNG transparente → fondo blanco
          if (op.cuadrado) {
            var lado = Math.min(img.width, img.height), dest = Math.min(max, lado);
            c.width = dest; c.height = dest; blanco();
            c.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, dest, dest);
          } else {
            var esc = Math.min(1, max / Math.max(img.width, img.height));
            c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc); blanco();
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

  /* 3.1: archivo para Excel en español («;» y coma decimal). Textos que empiezan con = + - @ nunca se vuelven fórmula. */
  UI.descargarCSV = function (filas, nombre) {
    var csv = filas.map(function (f) {
      return f.map(function (v) {
        if (typeof v === 'number') return String(Math.round(v * 100) / 100).replace('.', ',');
        var t = String(v == null ? '' : v);
        if (/^[=+\-@]/.test(t)) t = "'" + t;
        return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
      }).join(';');
    }).join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    UI.aviso('Archivo listo.', 'ok');
  };

  /* 3.1.3: foto de entrega (privada): se pide al servidor solo al abrirla. */
  UI.verFotoEntrega = function (id, numero) {
    return UI.ventana({
      icono: '📷', titulo: 'Foto de entrega' + (numero ? ' · ' + numero : ''),
      html: '<div class="foto-entrega" id="fe-caja"><span class="ayuda">Cargando la foto…</span></div>',
      alAbrir: function (v) {
        global.DATOS.pedir('fotoEntregaVer', { id: id }).then(function (r) {
          var c = UI.$('#fe-caja', v);
          if (c) c.innerHTML = '<img src="' + r.imagen + '" alt="Foto de la entrega ' + UI.esc(r.numero) + '">' + (r.entregado ? '<small>Entregado el ' + UI.esc(UI.fechaHora(r.entregado)) + '</small>' : '');
        }).catch(function (e) { var c = UI.$('#fe-caja', v); if (c) c.innerHTML = '<span class="ayuda">⚠️ ' + UI.esc(e.message) + '</span>'; });
      },
      botones: [{ texto: 'Cerrar', valor: null, clase: 'secundario' }]
    });
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

  /* Misma presentación monetaria para restaurante y cliente. Sin alterar precios. */
  UI.compararTotalesCambio = function(q) {
    if(!q||[q.total_actual,q.total_estimado,q.adicional].some(function(v){return v==null||v===''||!Number.isFinite(Number(v));}))return '';
    var delta=Number(q.adicional),dif=delta>0?'+'+UI.dinero(delta):delta<0?'−'+UI.dinero(-delta):UI.dinero(0);
    return '<div class="ux-comparacion-totales"><div class="ux-total-anterior"><small>Total anterior</small><strong>'+UI.esc(UI.dinero(q.total_actual))+'</strong></div><div class="ux-total-nuevo"><small>Nuevo total</small><strong>'+UI.esc(UI.dinero(q.total_estimado))+'</strong></div><div class="ux-total-diferencia"><span>'+ (delta>0?'Aumento del pedido':delta<0?'Reducción del pedido':'Sin diferencia de precio')+'</span><b>'+UI.esc(dif)+'</b></div></div>';
  };
  UI.compararDetalleCambio = function(q) {
    function fila(t,v){return '<div class="ux-resumen-item"><span>'+UI.esc(t)+'</span><b>'+UI.esc(UI.dinero(v))+'</b></div>';}
    function importe(x,k){return x&&x[k]!=null&&x[k]!==''&&Number.isFinite(Number(x[k]))?Number(x[k]):null;}
    function grupo(t,ls,total,desglose){
      ls=Array.isArray(ls)?ls:[];var suma=ls.reduce(function(n,d){return n+Number(d.total_linea||0);},0);
      var html='<div class="ux-comparacion-grupo"><h4>'+UI.esc(t)+'</h4>'+ls.map(function(d){return '<div class="ux-resumen-item"><span>'+UI.esc(d.cantidad+' × '+d.nombre)+(d.extras&&d.extras.length?'<small>'+UI.esc(Array.isArray(d.extras)?d.extras.join(', '):d.extras)+'</small>':'')+'</span><b>'+UI.esc(UI.dinero(d.total_linea))+'</b></div>';}).join('');
      if(!ls.length)html+='<p class="ayuda">Sin productos</p>';
      html+=fila('Subtotal productos',importe(desglose,'subtotal')===null?suma:desglose.subtotal);
      if(desglose){var e=importe(desglose,'envio'),d=importe(desglose,'descuento'),p=importe(desglose,'premio'),pr=importe(desglose,'propina'),iva=importe(desglose,'iva');if(e!==null)html+=fila('Envío',e);if(d)html+=fila('Descuento',-d);if(p)html+=fila('Premio',-p);if(pr)html+=fila('Propina',pr);if(iva!==null&&iva!==0){var base=Number(desglose.subtotal||0)+Number(e||0)-Number(d||0)-Number(p||0)+Number(pr||0);html+=fila(Math.abs(Number(total)-base-iva)<.011?'IVA adicional':'IVA incluido (informativo)',iva);}}
      else {var resto=Math.round((Number(total)-suma)*100)/100;if(resto)html+=fila('Envío y otros conceptos',resto);}
      return html+'<div class="ux-comparacion-cierre">'+fila('Total',total)+'</div></div>';
    }
    if(!q.integral)return '<div class="ux-comparacion-grupo"><h4>Productos adicionales</h4>'+(q.lineas||[]).map(function(d){return fila(d.cantidad+' × '+d.nombre,d.total_linea);}).join('')+'</div>';
    var d=q.desglose||{};return '<div class="ux-comparacion-detalles">'+grupo('Pedido anterior',q.antes,q.total_actual,d.anterior)+grupo('Pedido propuesto',q.despues,q.total_estimado,d.propuesto)+'</div>';
  };
  UI.numero = function (v) { var n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : NaN; };
})(window);
