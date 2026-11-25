/**
 * ============================================================
 * PANEL DE PEDIDOS (dueño y cajero/cocina) — fase 3.
 * Tablero por estados: Recibido → Preparando → En camino → Entregado.
 * Sin refresco automático: botón «Actualizar». Atrasados en rojo.
 * ============================================================
 */
(function (global) {
  'use strict';
  var UI = global.UI, DATOS = global.DATOS, APP = global.APP;
  var est = { datos: null, motos: [], cargadoEn: 0, verAnulados: false, diaEntregado: '', alertados: {} }; // 3.1.6

  function iconoPedido(n) {
    var paths = {plus:'<path d="M12 5v14M5 12h14"/>',list:'<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6M9 13h6M9 17h4"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',refresh:'<path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',mute:'<path d="m3 3 18 18M6 8c0 7-3 7-3 9h14M18 12V8a6 6 0 0 0-9-5M10 21h4"/>'};
    return '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + paths[n] + '</svg>';
  }

  var COLUMNAS = ['Recibido', 'Preparando', 'En camino', 'Entregado'];

  APP.vistas.pedidos = {
    titulo: 'Pedidos', icono: '🧾', orden: 10, roles: ['dueno', 'cajero'],
    pintar: function (cont) {
      est = { datos: null, motos: [], cargadoEn: 0, verAnulados: false, diaEntregado: UI.hoy(), alertados: {} }; // 3.1.6
      var sonido = global.APP_MEMORIA.leer('sonido_pedidos') !== false;
      cont.innerHTML = '<section class="pd-premium"><div class="pd-premium-titulo"><div><h1>Pedidos</h1><p class="subtitulo">' + UI.esc(APP.nombreLocal(APP.local)) + '</p></div>' +
        (!global.MIP_AVISOS ? '<button class="btn secundario chico sonido-btn" type="button" id="btn-sonido" aria-pressed="' + sonido + '" aria-label="Sonido de pedido nuevo" title="Sonido de pedido nuevo">' + iconoPedido(sonido ? 'bell' : 'mute') + '</button>' : '') + '</div>' +
        '<div class="pd-premium-acciones"><button class="btn" type="button" id="btn-nuevo-pedido">' + iconoPedido('plus') + ' Crear pedido</button>' +
        '<button class="btn secundario" type="button" id="btn-cambios">' + iconoPedido('list') + ' Solicitudes <span id="pd-solic-count" aria-live="polite">—</span></button>' +
        '<button class="btn secundario" type="button" id="btn-buscar-pedido" aria-label="Buscar pedido" title="Buscar pedido">' + iconoPedido('search') + '</button>' +
        '<button class="btn secundario" type="button" data-actualizar aria-label="Actualizar pedidos" title="Actualizar pedidos">' + iconoPedido('refresh') + '</button></div>' +
        '<p id="pd-conexion" class="ayuda" role="status">Conectando con el servidor…</p><div id="pd-cuerpo">' + UI.esqueleto(4) + '</div></section>';
      UI.$('[data-actualizar]', cont).addEventListener('click', function (e) { UI.trabajando(e.currentTarget, cargar); });
      UI.$('#btn-nuevo-pedido', cont).addEventListener('click', nuevoPedido);
      UI.$('#btn-buscar-pedido', cont).addEventListener('click', buscarPedido);
      UI.$('#btn-cambios', cont).addEventListener('click', verSolicitudes);
      if (UI.$('#btn-sonido', cont)) UI.$('#btn-sonido', cont).addEventListener('click', function (e) {
        var b = e.currentTarget;
        avisosVentana().then(function () {
          var on = global.APP_MEMORIA.leer('sonido_pedidos') !== false;
          b.setAttribute('aria-pressed', String(on)); b.innerHTML = iconoPedido(on ? 'bell' : 'mute');
        });
      });
      cargar().then(function () { var ver = (APP.parametros || {}).ver; if (ver) { APP.parametros = {}; abrirPorNumero(ver); } });
      vigilar();
    }
  };


  /* El restaurante selecciona productos REALES del menú, sin cambiar aún el pedido.
   * Permite varios productos y extras; el servidor recalcula todos los precios. */
  function sugerirSolicitudHistorica(x, platos) {
    if (x.tipo !== 'agregar') return [];
    var normal = function(v){return String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');};
    var partes=String(x.detalle||'').split(';'), items=[], claves=Object.create(null);
    for(var i=0;i<partes.length;i++){
      var m=/^Agregar\s+([1-9]\d{0,3})\s*[×x]\s*(.+?)(?:\s+\(([^()]*)\))?\s*$/i.exec(partes[i].trim());
      if(!m||Number(m[1])>1000)return [];
      var ps=platos.filter(function(p){return normal(p.nombre)===normal(m[2]);});
      if(ps.length!==1)return [];
      var p=ps[0], extras=[], nombres=m[3]?m[3].split(','):[], disponibles=Array.isArray(p.extras)?p.extras:[];
      for(var j=0;j<nombres.length;j++){var es=disponibles.filter(function(e){return normal(e.nombre)===normal(nombres[j]);});if(es.length!==1)return [];var mx=Number(es[0].max_cantidad);if(!(Number(es[0].precio)>0&&Number.isInteger(mx)&&mx>=1&&mx<=1000))mx=Number(es[0].precio)>0?1000:1;if(extras.filter(function(n){return n===es[0].nombre;}).length>=mx)return [];extras.push(es[0].nombre);}
      var k=JSON.stringify([String(p.id),extras.slice().sort()]);if(claves[k])return [];claves[k]=true;
      items.push({plato_id:p.id,cantidad:Number(m[1]),extras:extras});
    }
    return items.length<=30?items:[];
  }
  function maxExtraAdmin(e){var n=Number(e.max_cantidad);return Number(e.precio)>0?(Number.isSafeInteger(n)&&n>=1&&n<=1000?n:1000):1;}
  function leerExtrasAdmin(p,v,i){var out=[];(p.extras||[]).forEach(function(e,k){var a=v.querySelector('[data-extra="'+i+'-'+k+'"]');if(!a)return;var n=a.type==='checkbox'?(a.checked?1:0):a.value===''?NaN:Number(a.value);if(!Number.isInteger(n)||n<0||n>maxExtraAdmin(e))throw Error('Cantidad de extra inválida.');for(var j=0;j<n;j++)out.push(e.nombre);});return out;}
  /* Presentación aislada: conserva todos los inputs y sus índices originales.
     Ocultar alternativas nunca elimina controles ni modifica la selección. */
  function presentarSustitucionPremium(v){
    var modal=v.querySelector('.ventana');modal.classList.add('ux-sustitucion-premium');
    var panel=v.querySelector('[data-premium-ajustes]'),boton=v.querySelector('[data-premium-alternativas]'),aviso=v.querySelector('[data-premium-contador]');
    function actualizar(){
      var n=0;
      v.querySelectorAll('.ux-cambio-fila').forEach(function(f){
        var el=f.querySelector('[data-cantidad]'),on=!!el&&Number(el.value)>0;
        f.classList.toggle('ux-premium-seleccion',on);
        f.classList.toggle('ux-premium-alternativa',!on);
        if(on)n++;
      });
      aviso.textContent=n+' líneas seleccionadas';
    }
    boton.addEventListener('click',function(){
      var abrir=boton.getAttribute('aria-expanded')!=='true';
      boton.setAttribute('aria-expanded',String(abrir));
      panel.classList.toggle('ux-premium-expandido',abrir);
      boton.textContent=abrir?'Mostrar solo selección':'Ajustar contrapropuesta · ver alternativas';
      if(!abrir){var buscar=v.querySelector('[data-buscar]');if(buscar){buscar.value='';buscar.dispatchEvent(new Event('input',{bubbles:true}));}}
    });
    v.addEventListener('input',actualizar);
    v.addEventListener('click',function(){actualizar();});
    actualizar();
    if(!v.querySelector('.ux-premium-seleccion [data-cantidad^="r"]')||!v.querySelector('.ux-premium-seleccion [data-cantidad^="a"]'))boton.click();
  }
  async function cotizarSolicitud(x,pedido) {
    if(!pedido||!Array.isArray(pedido.detalle))return UI.aviso('Actualiza el pedido antes de cotizar.','error');
    var originales=pedido.detalle,platos=[],t=x.tipo,sel=null;
    if(['agregar','aumentar','cambiar'].indexOf(t)>=0){
      try{var m=await DATOS.pedir('menuListar',{local_id:x.local_id});platos=(m.platos||[]).filter(function(p){return p.activo===true&&p.agotado!==true&&(String(p.local_id)==='TODOS'||String(p.local_id)===String(x.local_id));});}catch(e){return UI.aviso('No se pudo cargar el menú.','error');}
      if(t==='aumentar')platos=platos.filter(function(p){return originales.some(function(d){return String(d.plato_id)===String(p.id);});});
    }
    var pre=Array.isArray(x.items_solicitados)?x.items_solicitados:[],retiros=Array.isArray(x.retiros_solicitados)?x.retiros_solicitados:[],ret=Object.create(null),add=Object.create(null);
    function norm(v){return String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
    // Precargar solo coincidencias únicas; la descripción original siempre queda visible.
    if(!pre.length&&!retiros.length)String(x.detalle||'').split(';').forEach(function(v){var m=/^(Agregar|Aumentar|Sustituir|Retirar)\s+([1-9]\d{0,3})\s*[×x]\s*(.+?)(?:\s+\(([^()]*)\))?\s*$/i.exec(v.trim());if(!m)return;var baja=/sustituir|retirar/i.test(m[1]),arr=baja?originales:platos,ex=(m[4]||'').split(',').map(norm).filter(Boolean).sort();var f=arr.filter(function(p){return norm(p.nombre)===norm(m[3])&&(!baja||String(p.extras||'').split(',').map(norm).filter(Boolean).sort().join('|')===ex.join('|'));});if(f.length===1){if(baja)ret[String(f[0].id)]=Number(m[2]);else add[String(f[0].id)]={cantidad:Number(m[2]),extras:ex};}});
    retiros.forEach(function(r){if(originales.some(function(d){return String(d.id)===String(r.id);}))ret[String(r.id)]=Number(r.cantidad);});
    pre.forEach(function(p){var id=String(p.plato_id);if(pre.filter(function(z){return String(z.plato_id)===id;}).length===1)add[id]={cantidad:Number(p.cantidad),extras:(p.extras||[]).map(norm)};else delete add[id];});
    // Cada variante con extras tiene su propia fila y cantidad.
    platos=platos.reduce(function(out,p){var variantes=pre.filter(function(v){return String(v.plato_id)===String(p.id);});if(variantes.length>1)variantes.forEach(function(v){out.push(Object.assign({},p,{uxPre:{cantidad:Number(v.cantidad),extras:(v.extras||[]).map(norm)}}));});else out.push(p);return out;},[]);
    var bajas=['cambiar','reducir','quitar'].indexOf(t)>=0?originales:[],html='<p class="ayuda">'+UI.esc(x.detalle)+'</p>';
    // Construcción de filas sin interpolaciones ambiguas en atributos.
    function filaSegura(p,i,b){var max=b?Math.max(0,Number(p.cantidad)-(t==='reducir'?1:0)):1000,v=b?ret[String(p.id)]||0:(p.uxPre||add[String(p.id)]||{}).cantidad||0;if(b&&t==='quitar'&&v)v=max;var out='<div class="ux-cambio-fila" data-busqueda="'+UI.esc(norm(p.nombre))+'"><div class="ux-cambio-nombre"><b>'+UI.esc(p.nombre)+'</b><small>'+UI.esc(UI.dinero(p.precio))+(b?' · '+p.cantidad+' en pedido · '+UI.esc(p.extras||''):'')+'</small></div><div class="ux-cambio-controles">';
      out+=b&&t==='quitar'?'<input type="checkbox" data-retirar-todo="'+i+'" '+(v?'checked':'')+' aria-label="Retirar '+UI.esc(p.nombre)+'">':'<button type="button" class="btn secundario chico" data-paso="-1">−</button><input type="number" min="0" max="'+max+'" value="'+v+'" data-cantidad="'+(b?'r':'a')+i+'" aria-label="Cantidad de '+UI.esc(p.nombre)+'"><button type="button" class="btn secundario chico" data-paso="1">+</button>';
      out+='</div>';if(!b&&Array.isArray(p.extras)&&p.extras.length)out+='<div class="ux-cambio-extras" '+(v?'':'hidden')+'>'+p.extras.map(function(e,k){var n=((p.uxPre||add[String(p.id)]||{}).extras||[]).filter(function(z){return z===norm(e.nombre);}).length,max=maxExtraAdmin(e),attr='data-extra="'+i+'-'+k+'"';return '<label>'+(Number(e.precio)>0?'<span class="contador contador-extra"><button type="button" data-paso="-1" aria-label="Menos '+UI.esc(e.nombre)+'">−</button><input type="number" inputmode="numeric" min="0" max="'+max+'" value="'+n+'" '+attr+' aria-label="Porciones de '+UI.esc(e.nombre)+'"><button type="button" data-paso="1" aria-label="Más '+UI.esc(e.nombre)+'">+</button></span>':'<input type="checkbox" '+attr+(n?' checked':'')+'>')+' '+UI.esc(e.nombre)+' · '+UI.esc(UI.dinero(e.precio))+' c/u</label>';}).join('')+'</div>';if(!b&&t!=='aumentar'&&Array.isArray(p.extras)&&p.extras.length)out+='<button type="button" class="btn secundario chico" data-variante="'+i+'">Otra variante</button>';return out+'</div>';}
    if(bajas.length)html+='<h3>Productos a retirar</h3><div class="ux-cambio-lista">'+bajas.map(function(p,i){return filaSegura(p,i,true);}).join('')+'</div>';
    if(platos.length)html+='<h3>Productos a incorporar</h3><input type="search" data-buscar placeholder="Buscar producto"><div data-menu class="ux-cambio-lista">'+platos.map(function(p,i){return filaSegura(p,i,false);}).join('')+'</div>';
    if(t==='cambiar'){
      var encabezado='<div class="ux-premium-solicitud"><small>SOLICITUD DEL CLIENTE · SUSTITUCIÓN</small><p>'+UI.esc(x.detalle)+'</p><div class="ux-premium-vigente"><span>Importe vigente</span><b>'+UI.esc(UI.dinero(pedido.total))+'</b></div></div>';
      var inicio='<p class="ayuda">'+UI.esc(x.detalle)+'</p>';
      html=encabezado+'<div class="ux-premium-toolbar"><span data-premium-contador aria-live="polite"></span><button type="button" data-premium-alternativas aria-expanded="false" aria-controls="ux-premium-ajustes">Ajustar contrapropuesta · ver alternativas</button></div><div id="ux-premium-ajustes" data-premium-ajustes>'+html.slice(inicio.length)+'</div><p class="ux-premium-nota">El importe definitivo se calcula al revisar la propuesta.</p>';
    }
    if(t==='cancelar')html+='<p>Se propondrá cancelar el pedido completo y conciliar cualquier pago recibido.</p>';
    var ok=await UI.ventana({titulo:'Revisar '+x.numero,html:html,botones:[{texto:'Revisar propuesta',valor:true,antes:function(v){try{sel={retirar:[],agregar:[]};bajas.forEach(function(p,i){var el=v.querySelector('[data-cantidad="r'+i+'"]'),ch=v.querySelector('[data-retirar-todo="'+i+'"]'),n=ch?(ch.checked?Number(p.cantidad):0):Number(el.value);if(!Number.isInteger(n)||n<0||n>Number(p.cantidad))throw Error('Cantidad inválida');if(n)sel.retirar.push({id:String(p.id),cantidad:n});});platos.forEach(function(p,i){var el=v.querySelector('[data-cantidad="a'+i+'"]'),n=Number(el.value);if(!Number.isInteger(n)||n<0||n>1000)throw Error('Cantidad inválida');if(n)sel.agregar.push({plato_id:String(p.id),cantidad:n,extras:leerExtrasAdmin(p,v,i)});});if(t!=='cancelar'&&!sel.retirar.length&&!sel.agregar.length)throw Error('Selecciona productos.');if(t==='cambiar'&&(!sel.retirar.length||!sel.agregar.length))throw Error('Selecciona original y reemplazo.');return true;}catch(e){UI.aviso(e.message,'error');return false;}}},{texto:'Rechazar solicitud',valor:'rechazar',clase:'secundario'},{texto:'Volver',valor:null,clase:'secundario'}],alAbrir:function(v){v.querySelector('.ventana').classList.add('ux-gestion-modal');v.addEventListener('click',function(e){var variante=e.target.closest('[data-variante]');if(variante){if(platos.length>=400)return UI.aviso('Hay demasiadas variantes abiertas.','error');var p=platos[Number(variante.getAttribute('data-variante'))];if(!p)return;var clon=Object.assign({},p,{uxPre:{cantidad:0,extras:[]}});platos.push(clon);variante.closest('.ux-cambio-fila').insertAdjacentHTML('afterend',filaSegura(clon,platos.length-1,false));return;}var b=e.target.closest('[data-paso]');if(!b)return;var el=b.parentNode.querySelector('input');el.value=Math.max(0,Math.min(Number(el.max),Number(el.value)+Number(b.getAttribute('data-paso'))));el.dispatchEvent(new Event('input',{bubbles:true}));});v.addEventListener('input',function(e){if(e.target.hasAttribute('data-buscar'))UI.$$('[data-menu] [data-busqueda]',v).forEach(function(f){f.hidden=f.getAttribute('data-busqueda').indexOf(norm(e.target.value))<0;});if(e.target.hasAttribute('data-cantidad')){var row=e.target.closest('.ux-cambio-fila'),ex=row.querySelector('.ux-cambio-extras');if(ex){ex.hidden=Number(e.target.value)<=0;if(ex.hidden)UI.$$('input',ex).forEach(function(ch){if(ch.type==='checkbox')ch.checked=false;else ch.value='0';});}}});if(t==='cambiar')presentarSustitucionPremium(v);}});
    if(ok==='rechazar'){var resp=await responderSolicitud(x,'Rechazada');if(resp){try{await DATOS.pedir('pedidoCambioResolver',{id:x.id,decision:'Rechazada',respuesta:resp},{guardar:true});UI.aviso('Solicitud rechazada.','ok');await cargar();}catch(e){UI.aviso(e.message,'error');}}return;}
    if(!ok)return;
    try{
      var q=await DATOS.pedir('pedidoCambioCotizar',{id:x.id,integral:true,seleccion:sel});
      var mensaje='Hemos revisado tu solicitud y esta es nuestra propuesta. Confirma si estás de acuerdo con el nuevo pedido.';
      var plantillas=[mensaje,'Podemos realizar el cambio solicitado. Revisa los productos y el nuevo importe antes de aceptar.','Te ofrecemos esta alternativa según la disponibilidad actual. Revisa el nuevo pedido y confirma tu decisión.'];
      var compatible=!!q.desglose;
      var preview=UI.compararTotalesCambio(q)+UI.compararDetalleCambio(q)+(compatible?'<div class="campo ux-propuesta-mensaje"><label for="ux-prop-plantilla">Respuesta rápida</label><select id="ux-prop-plantilla" class="entrada">'+plantillas.map(function(m,i){return '<option value="'+i+'">'+['Propuesta revisada','Cambio disponible','Alternativa disponible'][i]+'</option>';}).join('')+'</select><label for="ux-prop-mensaje">Mensaje para el cliente</label><textarea class="entrada" id="ux-prop-mensaje" rows="3" maxlength="500">'+UI.esc(mensaje)+'</textarea></div>':'<p class="ayuda">La comparación está disponible. Para enviar un mensaje personalizado, actualiza el servidor a 3.1.16.</p>');
      var enviar=await UI.ventana({titulo:'Propuesta definitiva · '+x.numero,html:preview,botones:[{texto:'Confirmar y enviar al cliente',valor:true,antes:function(v){if(!compatible)return true;mensaje=v.querySelector('#ux-prop-mensaje').value.trim();if(mensaje.length<5||mensaje.length>500){UI.aviso('Escribe un mensaje de 5 a 500 caracteres.','error');return false;}return true;}},{texto:'Volver',valor:null,clase:'secundario'}],alAbrir:function(v){v.querySelector('.ventana').classList.add('ux-gestion-modal');if(compatible)v.querySelector('#ux-prop-plantilla').addEventListener('change',function(e){v.querySelector('#ux-prop-mensaje').value=plantillas[Number(e.target.value)];});}});
      if(!enviar)return;
      var emitida=await DATOS.pedir('pedidoCambioProponer',{id:x.id,integral:true,seleccion:sel,total_esperado:q.total_estimado,mensaje:compatible?mensaje:undefined},{guardar:true});UI.aviso('Propuesta enviada. El cliente puede aceptar o rechazar.','ok');await cargar();
      if(emitida&&emitida.estado==='Cotizada'&&emitida.cotizacion){var aviso=botonAvisoPropuesta(pedido,emitida.cotizacion);if(aviso)await UI.ventana({titulo:'Propuesta enviada · '+x.numero,html:UI.compararTotalesCambio(emitida.cotizacion)+'<p>Ya está disponible en la página del cliente.</p>'+aviso,botones:[{texto:'Listo',valor:true,clase:'secundario'}]});}
    }catch(e){UI.aviso('No se pudo emitir: '+e.message,'error');}
  }

  function enlaceAvisoPropuesta(p,q) {
    if(!p||!q||!p.clave_seguimiento||!UI.digitos(p.telefono)||[q.total_actual,q.total_estimado,q.adicional].some(function(v){return v==null||v===''||!Number.isFinite(Number(v));}))return '';
    var delta=Number(q.adicional),diferencia=delta>0?'+'+UI.dinero(delta):delta<0?'−'+UI.dinero(-delta):UI.dinero(0);
    var texto='Hola, tenemos una propuesta de modificación para tu pedido '+p.numero+'.\n\nTotal anterior: '+UI.dinero(q.total_actual)+'\nNuevo total: '+UI.dinero(q.total_estimado)+'\nDiferencia: '+diferencia+'\n\n'+(q.mensaje||'Revisa los productos y confirma tu decisión.')+'\n\nAcepta o mantén tu pedido original aquí: '+enlaceSeguimiento(p)+'\nLa propuesta no constituye una confirmación de pago.';
    return UI.enlaceWhatsApp(p.telefono,texto);
  }
  function botonAvisoPropuesta(p,q) {
    var url=enlaceAvisoPropuesta(p,q);
    return url?'<a class="btn secundario bloque" href="'+UI.esc(url)+'" target="_blank" rel="noopener noreferrer">Avisar al cliente por WhatsApp</a><small class="ayuda">Abre el mensaje preparado; pulsa Enviar en WhatsApp. La decisión se registra en MiPedido.</small>':'';
  }
  function vistaCotizacionDefinitiva(x){var q=x.cotizacion;return '<section class="ux-detalle-pedido">'+UI.compararTotalesCambio(q)+(q.mensaje?'<div class="ux-mensaje-propuesta"><b>Mensaje enviado al cliente</b>'+UI.esc(q.mensaje)+'</div>':'')+UI.compararDetalleCambio(q)+'</section>';}
  function vistaSolicitudAdmin(x,pedido,platos) {
    var actuales=Array.isArray(pedido&&pedido.detalle)?pedido.detalle:[], menu=Array.isArray(platos)?platos:[], partes=String(x.detalle||'').split(';'), filas=[], valido=!!pedido, delta=0;
    var norma=function(v){return String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');};
    var tipos={agregar:['Agregar'],aumentar:['Aumentar'],cambiar:['Sustituir','Agregar'],quitar:['Retirar'],reducir:['Retirar']};
    var usados=Object.create(null), retiros=0,entradas=0;
    if(x.tipo==='cancelar') return '<section class="ux-detalle-pedido"><h3>Cancelación solicitada</h3><p>'+UI.esc(x.detalle)+'</p>'+(pedido?'<div class="ux-resumen-item"><span>Total vigente</span><b>'+UI.esc(UI.dinero(pedido.total))+'</b></div>':'')+'<small>No implica anulación ni devolución automática.</small></section>';
    var pre=Array.isArray(x.items_solicitados)?x.items_solicitados:[],bajas=Array.isArray(x.retiros_solicitados)?x.retiros_solicitados:[];
    if(pre.length||bajas.length){
      function mostrarExtras(xs){var m=new Map();xs.forEach(function(n){m.set(n,(m.get(n)||0)+1);});return Array.from(m,function(v){return v[1]>1?v[1]+' × '+v[0]:v[0];}).join(', ');}
      function fila(a,n,ex,precio,negativo){var total=Math.round(precio*n*100)/100;delta+=negativo?-total:total;filas.push('<div class="ux-seleccion-grupo '+(negativo?'actual':'nuevo')+'"><div class="ux-resumen-item"><span><b>'+UI.esc(n+' × '+a.nombre)+'</b>'+(ex.length?'<small>'+UI.esc(mostrarExtras(ex))+'</small>':'')+'</span><b>'+UI.esc(UI.dinero(total))+'</b></div></div>');}
      bajas.forEach(function(r){var d=actuales.find(function(v){return String(v.id)===String(r.id);}),n=Number(r.cantidad);if(!d||!Number.isSafeInteger(n)||n<1||n>Number(d.cantidad)||usados[String(d.id)]||x.tipo==='quitar'&&n!==Number(d.cantidad)||x.tipo==='reducir'&&n>=Number(d.cantidad)){valido=false;return;}usados[String(d.id)]=true;retiros+=n;fila(d,n,String(d.extras||'').split(',').map(function(v){return v.trim();}).filter(Boolean),Number(d.precio),true);});
      pre.forEach(function(it){var n=Number(it.cantidad),ex=Array.isArray(it.extras)?it.extras:[],a,precio,k=JSON.stringify([it.plato_id,ex.slice().sort()]);if(!Number.isSafeInteger(n)||n<1||n>1000||usados[k]){valido=false;return;}usados[k]=true;
        if(x.tipo==='aumentar'){var iguales=actuales.filter(function(d){return String(d.plato_id)===String(it.plato_id)&&String(d.extras||'').split(',').map(norma).filter(Boolean).sort().join('|')===ex.map(norma).sort().join('|');});if(!iguales.length||iguales.some(function(d){return Number(d.precio)!==Number(iguales[0].precio);})){valido=false;return;}a=iguales[0];precio=Number(a.precio);}
        else {a=menu.find(function(d){return String(d.id)===String(it.plato_id);});if(!a||a.activo!==true||a.agotado===true){valido=false;return;}precio=Number(a.precio);var vistos=Object.create(null);ex.forEach(function(e){var matches=(a.extras||[]).filter(function(z){return norma(z.nombre)===norma(e);});if(matches.length!==1||!Number.isFinite(Number(matches[0].precio))){valido=false;return;}var mx=Number(matches[0].max_cantidad),key=norma(e);mx=Number(matches[0].precio)>0?(Number.isSafeInteger(mx)&&mx>=1&&mx<=1000?mx:1000):1;vistos[key]=(vistos[key]||0)+1;if(vistos[key]>mx)valido=false;precio+=Number(matches[0].precio);});}
        if(!Number.isFinite(precio)){valido=false;return;}entradas+=n;fila(a,n,ex,precio,false);});
    }else partes.forEach(function(t){
      var m=/^(Agregar|Aumentar|Sustituir|Retirar)\s+([1-9]\d{0,3})\s*[×x]\s*(.+?)(?:\s+\(([^()]*)\))?\s*$/i.exec(t.trim());
      if(!m||Number(m[2])>1000||!(tipos[x.tipo]||[]).some(function(a){return norma(a)===norma(m[1]);})){valido=false;return;}
      var nuevo=norma(m[1])==='agregar', negativo=norma(m[1])==='sustituir'||norma(m[1])==='retirar', n=Number(m[2]), ex=m[4]?m[4].split(',').map(norma).sort():[], posibles=(nuevo?menu:actuales).filter(function(a){return norma(a.nombre)===norma(m[3])&&(nuevo||String(a.extras||'').split(',').map(norma).filter(Boolean).sort().join('|')===ex.join('|'));});
      if(posibles.length!==1){valido=false;return;}
      var a=posibles[0], precio=Number(a.precio), k=JSON.stringify([nuevo,String(a.id||a.plato_id),ex]);
      if(!Number.isFinite(precio)||usados[k]||(!nuevo&&negativo&&n>Number(a.cantidad))||(!nuevo&&x.tipo==='quitar'&&n!==Number(a.cantidad))||(!nuevo&&x.tipo==='reducir'&&n>=Number(a.cantidad))){valido=false;return;}usados[k]=true;
      if(nuevo){var vistos=Object.create(null);ex.forEach(function(e){var match=(Array.isArray(a.extras)?a.extras:[]).filter(function(z){return norma(z.nombre)===e;});if(match.length!==1||!Number.isFinite(Number(match[0].precio))){valido=false;return;}var mx=Number(match[0].max_cantidad);if(!(Number(match[0].precio)>0&&Number.isInteger(mx)&&mx>=1&&mx<=1000))mx=Number(match[0].precio)>0?1000:1;vistos[e]=(vistos[e]||0)+1;if(vistos[e]>mx){valido=false;return;}precio+=Number(match[0].precio);});if(a.activo!==true||a.agotado===true)valido=false;entradas+=n;}
      if(negativo)retiros+=n;
      var total=Math.round(precio*n*100)/100;delta+=negativo?-total:total;
      filas.push('<div class="ux-seleccion-grupo '+(negativo?'actual':'nuevo')+'"><small>'+UI.esc(negativo?'Producto actual · retiro solicitado':nuevo?'Producto nuevo solicitado':'Unidades adicionales')+'</small><div class="ux-resumen-item"><span><b>'+UI.esc(n+' × '+a.nombre)+'</b>'+(m[4]?'<small>'+UI.esc(m[4])+'</small>':'')+'</span><b>'+UI.esc(UI.dinero(total))+'</b></div></div>');
    });
    if(x.tipo==='cambiar'&&(!retiros||!entradas))valido=false;
    function importe(t,v){return '<div class="ux-resumen-item"><span>'+UI.esc(t)+'</span><b>'+UI.esc(UI.dinero(v))+'</b></div>';}
    return '<section class="ux-detalle-pedido"><h3>Detalle de la solicitud</h3>'+filas.join('')+(pedido?importe('Total vigente',pedido.total):'')+(valido&&filas.length?importe('Diferencia orientativa',delta)+importe('Total estimado',Number(pedido.total)+delta)+'<small>Estimación no vinculante; impuestos, descuentos, disponibilidad y pago deben verificarse antes de aplicar.</small>':'<p class="ayuda">No se pudo reconstruir toda la selección con certeza. Revisa la descripción original. No se calcula un total incompleto.</p>')+'</section>';
  }
  function respuestasSolicitud(tipo,decision) {
    var nombre={agregar:'la incorporación de productos',aumentar:'el aumento de cantidades',cambiar:'la sustitución de productos',reducir:'la reducción de cantidades',quitar:'el retiro de productos',cancelar:'la cancelación del pedido'}[tipo]||'tu modificación';
    if(decision==='Rechazada')return [
      ['No disponible','Por el momento no podemos realizar '+nombre+'. Tu pedido vigente no cambia.'],
      ['Pedido en preparación','Tu pedido ya está en preparación. No podemos realizar '+nombre+' en esta etapa. Tu pedido vigente se mantiene.'],
      ['Consultar alternativa','No podemos realizar '+nombre+' tal como la solicitaste. Contáctanos para revisar una alternativa. Tu pedido vigente no cambia.']
    ];
    if(decision==='Cerrada sin aplicar')return [
      ['Cerrar sin cambios','Cerramos la solicitud de '+nombre+' sin modificar tu pedido ni registrar un cobro adicional.'],
      ['No se concretó','No se concretó '+nombre+'. Tu pedido vigente conserva sus productos e importe.']
    ];
    return [
      ['En revisión','Recibimos tu solicitud de '+nombre+'. Confirmaremos disponibilidad y el importe correspondiente antes de aplicar cualquier cambio.'],
      ['Revisar alternativa','Estamos revisando una alternativa para '+nombre+'. Te confirmaremos disponibilidad y precio antes de modificar el pedido.'],
      ['Verificar pago','Revisaremos '+nombre+' y el importe correspondiente, incluido cualquier ajuste de pago. Tu pedido vigente no cambia todavía.']
    ];
  }
  function respuestaSolicitudValida(v,decision) {
    v=String(v||'').trim();
    if(v.length<5||v.length>500)return 'Escribe una respuesta de 5 a 500 caracteres.';
    if(decision==='Aprobada para coordinar'&&!/precio|importe|valor|total|cotiz|confirm|disponib/i.test(v))return 'Indica que se confirmarán precio y disponibilidad.';
    return '';
  }
  async function responderSolicitud(x,decision) {
    var opciones=respuestasSolicitud(x.tipo,decision),respuesta='';
    var html='<div class="ux-respuesta-rapida"><label for="ux-plantilla">Respuesta rápida</label><select id="ux-plantilla">'+opciones.map(function(o,i){return '<option value="'+i+'">'+UI.esc(o[0])+'</option>';}).join('')+'<option value="personal">Escribir respuesta propia</option></select><label for="ux-respuesta">Mensaje editable</label><textarea id="ux-respuesta" rows="5" maxlength="500">'+UI.esc(opciones[0][1])+'</textarea><small data-ux-caracteres aria-live="polite"></small></div>';
    var ok=await UI.ventana({titulo:'Respuesta al cliente · '+x.numero,texto:'Selecciona una respuesta y ajústala antes de enviarla.',html:html,
      botones:[{texto:'Enviar respuesta',valor:true,antes:function(v){respuesta=v.querySelector('#ux-respuesta').value.trim();var error=respuestaSolicitudValida(respuesta,decision);if(error){UI.aviso(error,'error');return false;}return true;}},{texto:'Volver',valor:null,clase:'secundario'}],
      alAbrir:function(v){v.querySelector('.ventana').classList.add('ux-gestion-modal');var sel=v.querySelector('#ux-plantilla'),ta=v.querySelector('#ux-respuesta'),cuenta=v.querySelector('[data-ux-caracteres]');function contar(){cuenta.textContent=ta.value.length+' / 500 caracteres';}sel.addEventListener('change',function(){ta.value=sel.value==='personal'?'':opciones[Number(sel.value)][1];contar();});ta.addEventListener('input',contar);contar();}
    });
    return ok?respuesta:null;
  }
  function accionesPagoCambio(x) {
    var q=x.cotizacion;
    if(!q||[q.total_actual,q.total_estimado,q.adicional].some(function(v){return v==null||v===''||!Number.isFinite(Number(v));}))return [];
    if(!UI.esDigital(x.forma_pago))return [{texto:'Aplicar modificación',valor:'pago-efectivo'}];
    if(x.pago_verificado){
      var d=Number(q.adicional);
      if(d===0)return [{texto:'Aplicar · sin ajuste de pago',valor:'pago-sin_ajuste'}];
      return [{texto:d>0?'Confirmar cobro de '+UI.dinero(d)+' y aplicar':'Confirmar devolución de '+UI.dinero(-d)+' y aplicar',valor:'pago-ajuste_verificado'}];
    }
    var a=[{texto:Number(q.total_estimado)===0?'Sin depósito · cancelar pedido':'Sin depósito · actualizar a '+UI.dinero(q.total_estimado),valor:'pago-sin_deposito'}];
    if(Number(q.total_estimado)>0)a.push({texto:'Ya recibí '+UI.dinero(q.total_estimado)+' · aplicar',valor:'pago-total_recibido',clase:'secundario'});
    if(Number(q.total_actual)>0&&Number(q.total_actual)!==Number(q.total_estimado))a.push({texto:'Solo recibí '+UI.dinero(q.total_actual),valor:'verificar-original',clase:'secundario'});
    return a;
  }
  async function verSolicitudes(pedidoId) {
    var datos;
    try { datos = await DATOS.pedir('pedidoCambiosListar', { local_id: APP.local }); }
    catch (err) { return UI.aviso('No se pudieron cargar las solicitudes: ' + err.message, 'error'); }
    var abiertas = ['Pendiente', 'Aprobada para coordinar', 'Cotizada', 'Confirmada cliente', 'Aplicando'];
    var lista = (datos.solicitudes || []).filter(function (x) { return abiertas.indexOf(x.estado) >= 0; })
      .sort(function (a, b) { return String(a.creado).localeCompare(String(b.creado)); });
    if (typeof pedidoId === 'string') { var seleccionado = est.datos&&est.datos.pedidos.filter(function (p) { return String(p.id) === pedidoId; })[0]; if(!seleccionado)return UI.aviso('Actualiza el tablero para abrir esta solicitud.','error'); lista = lista.filter(function (x) { return String(x.numero) === String(seleccionado.numero); }); }
    if (!lista.length) return UI.aviso('No hay solicitudes de cambios abiertas.', 'ok');
    var opciones = [{ texto: 'Cerrar', valor: null, clase: 'secundario' }];
    lista.forEach(function (x, i) {
      opciones.push({ texto: 'Ver ' + x.numero + ' · ' + x.tipo + ' · ' + x.estado, valor: String(i) });
    });
    var elegido = lista.length===1?'0':await UI.ventana({
      icono: '📝', titulo: 'Solicitudes abiertas (' + lista.length + ')',
      texto: 'Selecciona una solicitud para revisar sus detalles. Ordenadas desde la más antigua.',
      botones: opciones
    });
    if (elegido === null || elegido === undefined) return;
    var x = lista[Number(elegido)];
    if (!x) return;
    var puedeCotizar = ['Pendiente','Aprobada para coordinar'].indexOf(x.estado)>=0;
    var decisiones = [{ texto: 'Volver', valor: null, clase: 'secundario' }];
    if (puedeCotizar) decisiones.push({ texto: 'Revisar y enviar propuesta', valor: 'cotizar' });
    // No ofrecer coordinación sin propuesta económica.
    if (x.estado === 'Confirmada cliente') { if(x.conciliacion_simple)decisiones=decisiones.concat(accionesPagoCambio(x));else {decisiones.push({texto:'Aplicar modificación aceptada',valor:'aplicar'});if(UI.esDigital(x.forma_pago)&&!x.pago_verificado)decisiones.push({texto:'Verificar pago original recibido',valor:'verificar-original',clase:'secundario'});} }
    if (['Aprobada para coordinar', 'Cotizada', 'Confirmada cliente'].indexOf(x.estado) >= 0)
      decisiones.push({ texto: 'Cerrar sin aplicar', valor: 'Cerrada sin aplicar',clase:'secundario' });
    if (x.estado !== 'Aplicando' && x.estado!=='Confirmada cliente') decisiones.push({ texto: 'Rechazar', valor: 'Rechazada',clase:'secundario' });
    var pedidoVisual = est.datos && est.datos.pedidos.filter(function(p){return String(p.numero)===String(x.numero);})[0];
    if(puedeCotizar)return cotizarSolicitud(x,pedidoVisual);
    var menuVisual = [];
    if (!x.cotizacion&&(x.tipo === 'agregar' || x.tipo === 'cambiar')) {
      try { var mv = await DATOS.pedir('menuListar',{local_id:x.local_id}); menuVisual=(mv.platos||[]).filter(function(p){return String(p.local_id)==='TODOS'||String(p.local_id)===String(x.local_id);}); } catch(e) { /* No inventar precios si falla el menú. */ }
    }
    var decision = await UI.ventana({
      html: x.cotizacion?vistaCotizacionDefinitiva(x)+(x.estado==='Cotizada'?botonAvisoPropuesta(pedidoVisual,x.cotizacion):''):vistaSolicitudAdmin(x,pedidoVisual,menuVisual),
      titulo: x.estado==='Cotizada'?'Propuesta enviada · '+x.numero:x.estado==='Confirmada cliente'?'Propuesta aceptada · '+x.numero:x.numero+' · '+x.tipo,
      texto: x.estado==='Confirmada cliente'&&x.conciliacion_simple?(UI.esDigital(x.forma_pago)?'Cliente aceptó. Revisa tu cuenta bancaria y elige el importe realmente recibido o devuelto. No se exige referencia.':'Cliente aceptó. Aplica la modificación al pedido.'):x.estado==='Aplicando'?'Operación interrumpida. No despachar hasta conciliar.':x.estado==='Cotizada'?'Esperando la decisión del cliente.':x.detalle,
      botones: decisiones.slice(1).concat(decisiones[0]),
      alAbrir:function(v){v.querySelector('.ventana').classList.add('ux-gestion-modal');}
    });
    if (!decision) return;
    if (decision === 'cotizar') return cotizarSolicitud(x,pedidoVisual);
    if(decision==='verificar-original'&&pedidoVisual)return verificar(null,pedidoVisual);
    if(String(decision).indexOf('pago-')===0&&x.conciliacion_simple){
      var modo=String(decision).slice(5),q=x.cotizacion;
      if(!accionesPagoCambio(x).some(function(b){return b.valor===decision;}))return UI.aviso('Actualiza la solicitud.','error');
      try{var a=await DATOS.pedir('pedidoCambioAplicar',{id:x.id,cotizacion_id:x.cotizacion_id,conciliacion_pago:modo,pago_previo_verificado:x.pago_verificado===true,total_confirmado:Number(q.total_estimado),confirmacion_bancaria:modo!=='efectivo'&&modo!=='sin_ajuste'},{guardar:true});UI.aviso(a.repetida?'Ya estaba aplicada.':'Modificación aplicada. '+(a.pago_verificado?'Pago conciliado.':'Total actualizado: '+UI.dinero(a.total_nuevo)),'ok');await cargar();}catch(e){UI.aviso('No se aplicó: '+e.message,'error');}return;
    }
    if(decision==='aplicar'){
      var digital=UI.esDigital(x.forma_pago),ref='',sinPago=false,delta=Number(x.adicional)||0;
      if(digital&&!x.pago_verificado){sinPago=await UI.confirmar('Actualizar total pendiente','Confirma en el banco que no existe ningún depósito anterior de '+x.numero+'. Si ya existe un pago, verifica primero el importe recibido.','Confirmo: aún no ha pagado');if(!sinPago)return;}
      else if(digital&&delta!==0){ref=await UI.pedirDato({titulo:delta>0?'Verificar pago adicional':'Registrar devolución realizada',etiqueta:'Referencia bancaria real',modo:'text',boton:'Verificar y aplicar',texto:'Comprueba '+(delta>0?'el pago recibido de ':'la devolución efectuada de ')+UI.dinero(Math.abs(delta))+'.',validar:function(v){return String(v).trim().length>=4?'':'Ingresa la referencia real.';}});if(!ref)return;}
      try{var a=await DATOS.pedir('pedidoCambioAplicar',{id:x.id,cotizacion_id:x.cotizacion_id,pago_adicional_verificado:digital&&!!ref,referencia_pago_extra:ref,sin_pago_previo:sinPago},{guardar:true});UI.aviso(a.repetida?'Ya estaba aplicada.':'Modificación aplicada. Nuevo total: '+UI.dinero(a.total_nuevo),'ok');await cargar();}catch(e){UI.aviso('No se aplicó: '+e.message,'error');}return;
    }
    var respuesta = await responderSolicitud(x,decision);
    if (!respuesta) return;
    var conciliado=false;if(x.estado==='Confirmada cliente'&&UI.esDigital(x.forma_pago)){conciliado=await UI.confirmar('Cerrar propuesta aceptada','Comprueba que no existe un ajuste bancario pendiente de devolver o registrar.','Confirmo conciliación');if(!conciliado)return;}
    try {
      await DATOS.pedir('pedidoCambioResolver', { id: x.id, decision: decision, respuesta: respuesta, conciliado:conciliado }, { guardar: true });
      UI.aviso('Solicitud actualizada. El pedido no se modificó ni cobró.', 'ok'); await cargar();
    } catch (err) { UI.aviso('No se pudo resolver: ' + err.message, 'error'); }
  }

  function cuerpo() { return UI.$('#pd-cuerpo'); }

  async function cargar(automatico) {
    var sesionCarga=APP.sesion, localCarga=APP.local, diaCarga=est.diaEntregado;
    var r = await Promise.allSettled([
      DATOS.pedir('pedidosListar', { local_id: APP.local, dia: est.diaEntregado || UI.hoy() }),
      DATOS.pedir('motorizadosListar', { local_id: APP.local })
    ]);
    if (!cuerpo() || APP.sesion!==sesionCarga || APP.local!==localCarga || est.diaEntregado!==diaCarga || (automatico===true && (document.visibilityState!=='visible' || document.querySelector('.velo') || DATOS.ocupado()))) return false; // se cambió de pantalla o de contexto
    if (r[0].status !== 'fulfilled') {
      // No borrar el tablero válido por una interrupción temporal de red.
      if (!est.datos) cuerpo().innerHTML = '<div class="banda error">⚠️ <span>' + UI.esc(r[0].reason.message) + '</span></div>';
      return;
    }
    est.datos = r[0].value;
    est.motos = r[1].status === 'fulfilled' ? r[1].value.motorizados || [] : [];
    est.cargadoEn = Date.now();
    alertarRecibidos();
    pintar();
    return r[1].status === 'fulfilled';
  }

  function ahoraServidor() {
    return new Date(new Date(est.datos.ahora).getTime() + (Date.now() - est.cargadoEn)).toISOString();
  }

  function atrasado(p) {
    if (['Entregado', 'Anulado'].indexOf(p.estado) >= 0) return false;
    return UI.minutosDesde(p.creado, ahoraServidor()) > est.datos.minutos_atraso;
  }

  function fechaAnterior(ymd) { var d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
  function esRecibidoAtrasado(p) { return p.estado === 'Recibido' && UI.minutosDesde(p.creado, ahoraServidor()) >= (Number(est.datos.minutos_alerta_pedido) || 15); }
  function alertarRecibidos() {
    if (!est.datos) return;
    est.datos.pedidos.filter(esRecibidoAtrasado).forEach(function (p) {
      if (est.alertados[p.id]) return;
      est.alertados[p.id] = true;
      if (global.MIP_AVISOS) { if (!global.MIP_AVISOS.registrar('atraso',[p])) return; }
      else if (global.APP_MEMORIA.leer('sonido_pedidos') !== false) UI.sonar();
      UI.notificar('🔴 Pedido sin atender', p.numero + ' sigue en Recibido.');
    });
  }
  function pintar() {
    var lista = est.datos.pedidos;
    var anulados = lista.filter(function (p) { return p.estado === 'Anulado'; });
    var activos = lista.filter(function (p) { return p.estado !== 'Anulado'; });
    var tarde = activos.filter(atrasado).length;
    var pendientes = activos.filter(esRecibidoAtrasado).length;
    var html = (pendientes ? '<div class="banda error">🔴 <span>' + pendientes + ' pedido(s) en Recibido sin atender. Revise la primera columna.</span></div>' : '') +
      (tarde ? '<div class="banda error">⏰ <span>' + tarde + ' pedido(s) atrasado(s) (más de ' + est.datos.minutos_atraso + ' min).</span></div>' : '') +
      '<div class="tablero">' + COLUMNAS.map(function (c) {
        var col = activos.filter(function (p) { return p.estado === c; });
        if (c === 'Entregado') col = col.filter(function (p) { return (p.entregado ? UI.fechaLocal(p.entregado) : p.dia_trabajo) === (est.diaEntregado || est.datos.dia); });
        col.sort(function (a, b) { return a.creado < b.creado ? 1 : -1; }); // 3.1.5: el más nuevo arriba (elegido por el dueño)
        return '<section class="columna" aria-label="' + UI.esc(c) + '"><div class="columna-cabeza">' + UI.chipEstado(c) + '<span class="cuenta">' + col.length + '</span></div>' +
          (c === 'Entregado' ? '<div class="fecha-entregados"><button class="btn secundario chico" type="button" data-dia-ent="hoy">Hoy</button><button class="btn secundario chico" type="button" data-dia-ent="ayer">Ayer</button><input aria-label="Otra fecha de entrega" class="entrada" id="pd-fecha-ent" type="date" value="' + UI.esc(est.diaEntregado || UI.hoy()) + '"></div>' : '') +
          '<div class="lista">' + (col.length ? col.map(tarjeta).join('') : UI.vacio((UI.ESTADOS[c] || {}).icono || '•', c === 'Recibido' ? 'Aún no hay pedidos nuevos.' : 'Nada aquí por ahora.')) + '</div></section>';
      }).join('') + '</div>' +
      (anulados.length ? '<button class="btn borde bloque" type="button" id="ver-anulados" style="margin-top:16px">' + (est.verAnulados ? 'Ocultar' : 'Ver') + ' anulados (' + anulados.length + ')</button>' +
        (est.verAnulados ? '<div class="lista" style="margin-top:10px">' + anulados.map(tarjeta).join('') + '</div>' : '') : '');
    cuerpo().innerHTML = html;
    UI.$$('[data-dia-ent]', cuerpo()).forEach(function (b) { b.addEventListener('click', function () { est.diaEntregado = b.getAttribute('data-dia-ent') === 'hoy' ? UI.hoy() : fechaAnterior(UI.hoy()); cargar(); }); });
    var fe = UI.$('#pd-fecha-ent'); if (fe) fe.addEventListener('change', function () { if (/^\d{4}-\d{2}-\d{2}$/.test(fe.value)) { est.diaEntregado = fe.value; cargar(); } });
    var va = UI.$('#ver-anulados');
    if (va) va.addEventListener('click', function () { est.verAnulados = !est.verAnulados; pintar(); });
    UI.$$('[data-accion]', cuerpo()).forEach(function (b) {
      b.addEventListener('click', function () { accion(b, b.getAttribute('data-accion'), b.getAttribute('data-id')); });
    });
  }

  function tarjeta(p) {
    var min = UI.minutosDesde(p.creado, ahoraServidor());
    var tarde = atrasado(p) || esRecibidoAtrasado(p);
    var principal = '';
    if (p.estado === 'Recibido') principal = '<button class="btn chico" type="button" data-accion="preparar" data-id="' + UI.esc(p.id) + '">👨‍🍳 Preparar</button>';
    var dom = UI.tipoEntrega(p) === 'domicilio';
    if (p.estado === 'Preparando') principal = dom
      ? (p.motorizado_id ? '<button class="btn chico" type="button" data-accion="despachar" data-id="' + UI.esc(p.id) + '">🛵 Despachar</button>' : '<button class="btn chico" type="button" data-accion="asignar" data-id="' + UI.esc(p.id) + '">🛵 Asignar motorizado</button>')
      : '<button class="btn chico" type="button" data-accion="entregar" data-id="' + UI.esc(p.id) + '">' + (UI.tipoEntrega(p) === 'mesa' ? '🍽️ Marcar servido' : '📦 Marcar entregado') + '</button>';
    // 3.0: pago digital sin verificar → primero verificar (el servidor tampoco deja despachar).
    var sinPago = UI.esDigital(p.forma_pago) && !p.pago_verificado && (p.estado === 'Preparando' || p.estado === 'Recibido');
    if (sinPago && (verificarActivo() || preparaTrasVerificar())) {
      // 3.1.5: con «no preparar hasta verificar», en Recibido solo se puede verificar
      principal = (p.estado === 'Recibido' && !preparaTrasVerificar() ? principal : '') + '<button class="btn chico" type="button" data-accion="verificar" data-id="' + UI.esc(p.id) + '">🏦 Verificar pago</button>';
    }
    var espera = sinPago ? UI.minutosDesde(p.creado, ahoraServidor()) : 0, limitePago = Number(APP.publico && APP.publico.minutos_alerta_pago) || 30;
    if (p.estado === 'En camino') principal = '<button class="btn chico" type="button" data-accion="entregar" data-id="' + UI.esc(p.id) + '">📦 Marcar entregado</button>';
    // 3.1.1: ya entregado → sin botones de trabajo, solo la constancia (y «Más» para consultar).
    if (p.estado === 'Entregado') principal = '<span class="hecho-final">✔ Entregado' + (p.entregado ? ' a las ' + UI.esc(UI.hora(p.entregado)) : '') + '</span>';
    if (p.cambio_estado && ['Recibido', 'Preparando', 'En camino'].indexOf(p.estado) >= 0) {
      var avisoCambio = p.cambio_estado === 'Aplicando' ? 'Aplicación incompleta: conciliar antes de avanzar.' : p.cambio_estado==='Confirmada cliente'?'Cliente aceptó la modificación.':p.cambio_estado==='Cotizada'?'Propuesta enviada · esperando al cliente.':'Modificación pendiente de revisar.';
      principal = ''; // La modificación tiene prioridad sobre preparación y cobro.
      principal += '<div class="banda"><span>' + UI.esc(avisoCambio) + '</span></div><button class="btn bloque" type="button" data-accion="solicitudes" data-id="' + UI.esc(p.id) + '">' + (p.cambio_estado==='Confirmada cliente'?'Resolver cambio':'Revisar modificación') + '</button>';
    }
    return '<article class="pedido' + (tarde ? ' atrasado' : '') + '">' +
      '<div class="pedido-top"><span class="pedido-num">' + UI.esc(p.numero) + '</span>' + (p.estado === 'Anulado' ? UI.chipEstado('Anulado') : '') +
      '<span class="reloj' + (tarde ? ' tarde' : '') + '">' + UI.esc(UI.hora(p.creado)) + (['Entregado', 'Anulado'].indexOf(p.estado) < 0 ? ' · ' + min + ' min' : '') + '</span>' +
      '<span class="pedido-total">' + UI.dinero(p.total) + '</span></div>' +
      (p.cambio_estado&&p.cambio_resumen?UI.compararTotalesCambio({total_actual:p.total,total_estimado:p.cambio_resumen.total,adicional:p.cambio_resumen.delta}):'') +
      '<div class="pedido-chips">' + (p.distancia_km !== '' && Number(p.distancia_km) > Number(APP.publico && APP.publico.cobertura_km || 0) && Number(APP.publico && APP.publico.cobertura_km) > 0 ? '<span class="etiqueta aviso">⚠️ Lejos: ' + UI.esc(p.distancia_km) + ' km</span>' : '') + UI.etiquetaTipo(p) + (p.cliente_nuevo ? '<span class="chip-nuevo">✨ Cliente nuevo</span>' : '') + (p.origen ? '<span class="chip-tipo">📊 ' + UI.esc(p.origen) + '</span>' : '') + '</div>' +
      '<div class="pedido-linea"><b style="color:var(--texto)">' + UI.esc(p.cliente_nombre) + '</b> · ' + UI.esc(p.telefono) + '</div>' +
      (APP.local === 'TODOS' ? '<div class="pedido-linea">📍 ' + UI.esc(APP.nombreLocal(p.local_id)) + '</div>' : '') +
      '<ul class="pedido-items">' + (p.detalle || []).map(function (d) { return '<li><b>' + d.cantidad + '×</b> ' + UI.esc(d.nombre) + (d.extras ? ' <span class="pedido-linea">(' + UI.esc(d.extras) + ')</span>' : '') + '</li>'; }).join('') + '</ul>' +
      (p.notas ? '<div class="banda" style="margin:0;padding:8px 10px">📝 <span>' + UI.esc(p.notas) + '</span></div>' : '') +
      (dom ? '<div class="pedido-linea">🛵 ' + UI.esc(p.direccion || 'Ubicación por mapa') + (p.referencia ? ' · ' + UI.esc(p.referencia) : '') + '<br><small>' + UI.fuenteUbicacion(p) + '</small></div>' : '') +
      '<div class="pedido-linea">' + (UI.esDigital(p.forma_pago) ? UI.NOMBRE_PAGO[p.forma_pago] + ' ' + (p.pago_verificado ? '<span class="etiqueta ok">verificado</span>' : '<span class="etiqueta aviso">por verificar</span>') : '💵 Efectivo') +
      (p.propina ? ' · 🙌 propina ' + UI.dinero(p.propina) : '') + (p.calificacion ? ' · ' + '★'.repeat(p.calificacion) : '') +
      (p.motorizado ? ' · 🛵 ' + UI.esc(p.motorizado.nombre) : '') + '</div>' +
      (p.cuenta_pago ? '<div class="pedido-linea">🏦 Dijo que pagó a: <b>' + UI.esc(p.cuenta_pago) + '</b></div>' : '') +
      (sinPago && preparaTrasVerificar() ? '<div class="pago-bloqueo' + (espera >= limitePago ? ' tarde' : '') + '">⛔ <span><b>No preparar ni despachar: pago sin verificar.</b> Esperando ' + espera + ' min' + (espera >= limitePago ? ' · escríbale o llame al cliente' : '') + '.</span></div>' : '') +
      (p.estado === 'Anulado' ? '<div class="pedido-linea">Motivo: ' + UI.esc(p.motivo_anulacion) + '</div>' : '') +
      (p.estado !== 'Anulado' ? '<div class="pedido-acciones">' + principal + '<button class="btn secundario chico" type="button" data-accion="mas" data-id="' + UI.esc(p.id) + '">⋯ Más</button></div>' : '') +
      '</article>';
  }

  function buscar(id) { return est.datos.pedidos.filter(function (p) { return p.id === id; })[0]; }

  function reemplazar(nuevo) {
    var lista = est.datos.pedidos;
    for (var i = 0; i < lista.length; i++) if (lista[i].id === nuevo.id) { nuevo.detalle = lista[i].detalle; nuevo.motorizado = est.motos.filter(function (m) { return m.id === nuevo.motorizado_id; })[0] || lista[i].motorizado; lista[i] = nuevo; }
    pintar();
  }

  async function guardar(boton, accion, datos, okTexto) {
    return UI.trabajando(boton, async function () {
      try {
        var r = await DATOS.pedir(accion, datos, { guardar: true });
        if (r.pedido) reemplazar(r.pedido);
        if (okTexto) UI.aviso(okTexto, 'ok');
        return true;
      } catch (err) {
        await UI.error('No se guardó', err.message);
        if (err.codigo === 'CAMBIO' || err.codigo === 'NO_EXISTE') cargar();
        return false;
      }
    });
  }

  /* 3.1.3: enlace propio de cada pedido: abre su seguimiento en cualquier teléfono, sin escribir nada. */
  function enlaceSeguimiento(p) {
    return UI.enlaceApp() + 'pedir.html' + (p.clave_seguimiento ? '?s=' + encodeURIComponent(p.numero + '-' + p.clave_seguimiento) : '');
  }

  function mensajeCliente(p) {
    var neg = (APP.publico && APP.publico.negocio_nombre) || '';
    var tipo = UI.tipoEntrega(p);
    var link = enlaceSeguimiento(p);
    var ver = '\n👉 Mira cómo va tu pedido: ' + link;
    var misPed = p.cliente_clave ? '\n📋 Todos tus pedidos: ' + UI.enlaceApp() + 'pedir.html?c=' + p.cliente_clave : ''; // 3.1.5: enlace personal «Mis pedidos»
    var pagar = UI.esDigital(p.forma_pago) ? (p.pago_verificado ? 'pagado ✅' : 'por ' + (p.forma_pago === 'deuna' ? 'Deuna' : 'transferencia')) : 'en efectivo';
    if (p.estado === 'Preparando' && tipo !== 'domicilio') return 'Hola ' + p.cliente_nombre + ', tu pedido ' + p.numero + ' ya se está preparando 👨‍🍳.' + (p.hora_estimada ? ' Estará listo a las ' + UI.hora(p.hora_estimada) + '.' : '') + ver;
    if (p.estado === 'Entregado' && tipo !== 'domicilio') return '¡Gracias por tu compra, ' + p.cliente_nombre + '! ' + neg + '\n⭐ Califícanos aquí: ' + link;
    var t = {
      'Recibido': 'Hola ' + p.cliente_nombre + ', recibimos tu pedido ' + p.numero + ' en ' + neg + '. Total: ' + UI.dinero(p.total) + '. ¡Gracias!' + (UI.esDigital(p.forma_pago) && !p.pago_verificado ? '\n🔒 Lo preparamos apenas confirmemos tu pago en nuestra cuenta (si pagaste desde otro banco puede tardar un poco).' : '') + ver + misPed,
      'Preparando': 'Hola ' + p.cliente_nombre + ', tu pedido ' + p.numero + ' ya se está preparando 👨‍🍳.' + (p.hora_estimada ? ' Hora estimada: ' + UI.hora(p.hora_estimada) + '.' : '') + ver,
      'En camino': 'Hola ' + p.cliente_nombre + ', tu pedido ' + p.numero + ' va en camino 🛵' +
        (p.motorizado ? '\nTe lo lleva: ' + String(p.motorizado.nombre).split(/\s+/).slice(0, 2).join(' ') + (p.motorizado.placa ? ' · Placa ' + p.motorizado.placa : '') : '') +
        '\nTotal: ' + UI.dinero(p.total) + ' ' + pagar + '.' +
        (APP.publico && APP.publico.codigo_entrega !== 'NO' && p.pide_codigo !== false ? '\n🔢 Al recibir, dale al motorizado tu código de 4 números (está en el enlace).' : '') +
        '\n👉 Mira a tu motorizado y tu código aquí: ' + link,
      'Entregado': '¡Gracias por tu compra, ' + p.cliente_nombre + '! Esperamos que disfrutes tu pedido ' + p.numero + '. ' + neg + '\n⭐ Califícanos aquí: ' + link + misPed
    };
    var ventana = p.hora_llegada ? ' Ventana solicitada: ' + UI.ventanaHora(p.hora_llegada, p.hora_ventana_fin, Number(APP.publico && APP.publico.ventana_minutos) || 30) + ' aprox. Sujeta a confirmación por WhatsApp.' : '';
    return (t[p.estado] || '') + ventana;
  }

  async function accion(boton, que, id) {
    if (arguments[1] === 'solicitudes') return verSolicitudes(arguments[2]);
    var p = buscar(id);
    if (!p) return;
    if (que === 'preparar') return guardar(boton, 'pedidoEstado', { id: id, desde: p.estado, a: 'Preparando' }, p.numero + ' en preparación.');
    if (que === 'despachar') return guardar(boton, 'pedidoEstado', { id: id, desde: p.estado, a: 'En camino' }, p.numero + ' en camino.');
    if (que === 'entregar') {
      var ok = await UI.confirmar('¿Marcar ' + p.numero + ' como entregado?', p.forma_pago === 'efectivo' ? 'Cobro en efectivo: ' + UI.dinero(p.total) + '.' : 'Pago por transferencia.', 'Sí, entregado');
      if (ok) return guardar(boton, 'pedidoEstado', { id: id, desde: p.estado, a: 'Entregado' }, p.numero + ' entregado.');
      return;
    }
    if (que === 'asignar') return asignar(boton, p);
    if (que === 'verificar') return verificar(boton, p);
    if (que === 'mas') return mas(boton, p);
  }

  function preparaTrasVerificar() { return !APP.publico || APP.publico.verificar_antes_preparar !== 'NO'; } // 3.1.5
  function verificarActivo() { return !APP.publico || APP.publico.verificar_antes_salir !== 'NO'; }

  async function verificar(boton, p) {
    var ok = await UI.ventana({
      icono: p.forma_pago === 'deuna' ? '📲' : '🏦', titulo: 'Verificar pago de ' + p.numero,
      texto: 'Abra la app de su banco' + (p.forma_pago === 'deuna' ? ' o Deuna Negocios' : '') + ' y confirme que llegaron ' + UI.dinero(p.total) + ' de ' + p.cliente_nombre + '. Verifica el ingreso real en tu cuenta.',
      botones: [{ texto: 'Todavía no', valor: false, clase: 'secundario' }, { texto: '✅ Sí, el dinero llegó', valor: true }]
    });
    if (!ok) return;
    var listo = await guardar(boton, 'pedidoPagoVerificar', { id: p.id, verificado: true,total_esperado:Number(p.total) }, p.cambio_estado?'Pago original verificado. Resuelve la modificación antes de preparar.':'Pago verificado. Ya puede prepararlo.');
    if (listo && !p.cambio_estado && UI.digitos(p.telefono)) { // 3.1.5: avisar al cliente que su pago se confirmó en la cuenta
      var av = await UI.confirmar('¿Avisar a ' + p.cliente_nombre + '?', 'Le mandamos por WhatsApp que su pago de ' + UI.dinero(p.total) + ' ya se confirmó en la cuenta, con su enlace de seguimiento.', '💬 Avisar al cliente');
      if (av) UI.abrirWhatsApp(p.telefono, '✅ Hola ' + p.cliente_nombre + ', confirmamos tu pago de ' + UI.dinero(p.total) + ' en nuestra cuenta. Tu pedido ' + p.numero + ' está listo para pasar a preparación.\n👉 Míralo aquí: ' + enlaceSeguimiento(p));
    }
    return listo;
  }

  /* ----- 3.1: AVISO DE PEDIDO NUEVO (sonido + notificación del sistema) -----
   * Vigila en TODA la app (no solo en el panel) para dueño y cajero, también con
   * la pestaña en segundo plano. Consulta liviana: solo una marca de tiempo. */
  var vigia = null, vigilando = false, ultimaMarca = 0, identidadAvisos = '', vistosAvisos = Object.create(null);
  var vigiaAdmin = DATOS.crearVigiaSync(), despertarVigia = null;
  function reanudarVigia() { if (despertarVigia) despertarVigia(); else vigilar(); }
  document.addEventListener('visibilitychange', reanudarVigia);
  global.addEventListener('online', reanudarVigia);
  function actualizarEstadoSolicitudes(r, error) {
    var contador = UI.$('#pd-solic-count'), estado = UI.$('#pd-conexion');
    if (contador && !error) contador.textContent = Array.isArray(r.solicitudes) ? String(r.solicitudes.length) : '—';
    if (estado) estado.textContent = error ? 'Conexión interrumpida. Reintentando automáticamente.' : 'Conexión actualizada · ' + UI.fechaHora(new Date().toISOString());
  }
  function vigilar() {
    if (vigia || vigilando) return;
    async function revisar() {
      vigia = null;
      if (vigilando) return;
      var s = APP.sesion;
      if (!s || (s.rol !== 'dueno' && s.rol !== 'cajero')) { identidadAvisos = ''; vistosAvisos = Object.create(null); ultimaMarca = 0; return; }
      vigilando = true;
      var local = APP.local || s.local_id || 'TODOS';
      var identidad = String(s.usuario_id || s.usuario) + '|' + local;
      if (identidad !== identidadAvisos) { identidadAvisos = identidad; vistosAvisos = Object.create(null); ultimaMarca = 0; }
      try {
        if (navigator.onLine === false) return;
        await vigiaAdmin(identidad+'|'+APP.vistaActual+'|'+(est.diaEntregado||'')+'|'+document.visibilityState, async function () {
        if (APP.sesion!==s || (APP.local||s.local_id||'TODOS')!==local) return false;
        var r;
        try { r = await DATOS.pedir('pedidosNuevos', { local_id: local }); }
        catch (e) { if (APP.sesion===s && (APP.local||s.local_id||'TODOS')===local) actualizarEstadoSolicitudes(null,true); return false; }
        if (APP.sesion !== s || (APP.local || s.local_id || 'TODOS') !== local) return;
        actualizarEstadoSolicitudes(r, false);
        if (Array.isArray(r.pedidos) && Array.isArray(r.solicitudes)) {
          var pedidos = [], solicitudes = [];
          r.pedidos.forEach(function(p) { var k = 'p:' + p.id; if (!vistosAvisos[k]) { vistosAvisos[k] = true; pedidos.push(p); } });
          r.solicitudes.forEach(function(p) { var k = 's:' + p.id + ':' + (p.estado||'Pendiente'); if (!vistosAvisos[k]) { vistosAvisos[k] = true; solicitudes.push(p); } });
          if (pedidos.length) avisarNuevo(false, pedidos.length, 0, pedidos);
          if (solicitudes.length) avisarNuevo(true, solicitudes.length, global.MIP_AVISOS ? 0 : (pedidos.length ? 2200 : 0), solicitudes);
        } else if (r.ultimo > ultimaMarca && (ultimaMarca || Date.now() - r.ultimo < 120000)) avisarNuevo(false, 1);
        ultimaMarca = r.ultimo || ultimaMarca;
        if (APP.vistaActual === 'pedidos' && est.datos && document.visibilityState === 'visible') {
          if (document.querySelector('.velo') || DATOS.ocupado()) return false;
          return await cargar(true);
        }
        return true;
        }, 15000);
      } catch(e) { if (APP.sesion === s && (APP.local || s.local_id || 'TODOS') === local) actualizarEstadoSolicitudes(null, true); }
      finally { vigilando = false; vigia = setTimeout(revisar, document.visibilityState === 'visible' ? 3000 : 15000); }
    }
    despertarVigia = function () {
      if (document.visibilityState !== 'visible' || navigator.onLine === false || vigilando) return;
      if (vigia) clearTimeout(vigia);
      vigia = null;
      revisar().catch(function(){});
    };
    vigia = setTimeout(revisar, 1500);
  }
  function avisarNuevo(solicitud, cantidad, espera, items) {
    var titulo = solicitud ? '📝 Actualización de modificación' : '🛎️ ¡Pedido nuevo!';
    var mensaje = cantidad > 1 ? cantidad + (solicitud ? ' solicitudes pendientes.' : ' pedidos sin atender.') : (solicitud ? 'Revisa Solicitudes en Pedidos.' : 'Revisa el panel de pedidos.');
    var usuario = APP.sesion;
    if (global.MIP_AVISOS) { if (!global.MIP_AVISOS.registrar(solicitud?'solicitud':'pedido',items||[{id:'marca-'+Date.now(),numero:''}],{espera:espera})) return; }
    else [0, solicitud ? 250 : 850, solicitud ? 500 : 1700].forEach(function(ms) {
      setTimeout(function() { if (APP.sesion === usuario && global.APP_MEMORIA.leer('sonido_pedidos') !== false) UI.sonar(); }, ms + (espera || 0));
    });
    UI.vibrar(solicitud ? [80,60,80] : [150,80,150,80,150]);
    UI.notificar(titulo, mensaje);
    avisoTitulo(true);
    UI.aviso(titulo + ' · ' + mensaje, 'ok');
  }
  function avisoTitulo(on) {
    var t = document.title.replace(/^🛎️ /, '');
    document.title = on ? '🛎️ ' + t : t;
    if (on) document.addEventListener('visibilitychange', function q() { if (!document.hidden) { avisoTitulo(false); document.removeEventListener('visibilitychange', q); } });
  }
  /* Ventana de avisos: probar sonido, activar notificaciones, silenciar. */
  async function avisosVentana() {
    if (global.MIP_AVISOS) return global.MIP_AVISOS.ajustes();
    UI.desbloquearSonido();
    var on = global.APP_MEMORIA.leer('sonido_pedidos') !== false;
    var permiso = UI.permisoNotificaciones();
    var v = await UI.ventana({
      icono: '🔔', titulo: 'Avisos de pedidos y solicitudes',
      texto: 'El panel consulta cambios automáticamente con objetivo de 3 segundos mientras está visible. Mantenga la app abierta y el volumen arriba. Los navegadores pueden suspender los avisos en segundo plano. Pruebe el sonido al iniciar el turno.',
      html: '<p class="ayuda">Sonido: <b>' + (on ? 'activado' : 'silenciado') + '</b> · Notificación en pantalla: <b>' +
        (permiso === 'granted' ? 'activada' : permiso === 'denied' ? 'bloqueada (actívela en el candado 🔒 de la barra de dirección)' : permiso === 'no' ? 'este teléfono no la permite' : 'sin activar') + '</b></p>',
      botones: [
        { texto: '🔊 Probar sonido', valor: 'probar', clase: 'borde opcion-lista' },
        { texto: '🖥️ Activar notificación en pantalla', valor: 'notif', clase: 'borde opcion-lista' },
        { texto: on ? '🔕 Silenciar' : '🔔 Activar sonido', valor: 'cambiar', clase: 'borde opcion-lista' },
        { texto: 'Listo', valor: null, clase: 'secundario' }
      ]
    });
    if (v === 'probar') { global.APP_MEMORIA.guardar('sonido_pedidos', true); UI.sonar(); UI.notificar('🛎️ Prueba', 'Así se verá un pedido nuevo.'); return avisosVentana(); }
    if (v === 'notif') { await UI.pedirNotificaciones(); return avisosVentana(); }
    if (v === 'cambiar') { global.APP_MEMORIA.guardar('sonido_pedidos', !on); if (!on) UI.sonar(); }
  }
  /* Arranca al entrar a la app y en cada cambio de vista (si ya corre, no se duplica). */
  document.addEventListener('DOMContentLoaded', function () {
    var ir = APP.ir;
    APP.ir = function () { var r = ir.apply(this, arguments); vigilar(); return r; };
    setTimeout(vigilar, 3000); // si la sesión ya estaba abierta
  });

  /* ----- Buscar / escanear el QR del pedido ----- */
  /* 3.1: busca por número, nombre del cliente o celular (últimos 30 días). */
  async function buscarPedido() {
    var n = await UI.pedirDato({ icono: '🔎', titulo: 'Buscar pedido', etiqueta: 'Número, nombre del cliente o celular', ph: 'PED-0005, Ana o 0987…', modo: 'text', boton: 'Buscar',
      texto: 'Si el cliente muestra el QR de su pedido, escanéelo con la cámara del teléfono: se abre aquí solo.',
      validar: function (v) { return v.replace(/\s/g, '').length >= 1 ? '' : 'Escriba algo para buscar.'; } });
    if (n === null) return;
    var limpio = n.replace(/\s/g, '');
    if (/^(ped-?)?\d{1,6}$/i.test(limpio)) {
      var num = limpio.toUpperCase().replace(/^PED-?/, '');
      return abrirPorNumero('PED-' + ('000' + num).slice(-Math.max(4, num.length)));
    }
    try {
      var r = await DATOS.pedir('pedidoBuscar', { texto: n });
      var lista = r.pedidos || [];
      if (!lista.length) return UI.error('Sin resultados', 'No hay pedidos de los últimos 30 días con «' + n + '».');
      if (lista.length === 1) return abrirPorNumero(lista[0].numero);
      var elegido = await UI.ventana({
        icono: '🔎', titulo: lista.length + ' pedido(s) con «' + n + '»',
        html: '<div class="lista">' + lista.map(function (p) {
          return '<button class="item item-boton" type="button" data-num="' + UI.esc(p.numero) + '"><div class="item-cuerpo"><div class="item-titulo">' + UI.esc(p.numero) + ' · ' + UI.esc(p.cliente) + '</div>' +
            '<div class="item-sub">' + UI.esc(UI.fechaHora(p.creado)) + ' · ' + UI.dinero(p.total) + '</div></div>' + UI.chipEstado(p.estado) + '</button>';
        }).join('') + '</div>',
        alAbrir: function (v, cerrar) { UI.$$('[data-num]', v).forEach(function (b) { b.addEventListener('click', function () { cerrar(b.getAttribute('data-num')); }); }); },
        botones: [{ texto: 'Cerrar', valor: null, clase: 'secundario' }]
      });
      if (elegido) abrirPorNumero(elegido);
    } catch (err) { UI.error('No se pudo buscar', err.message); }
  }
  async function abrirPorNumero(numero) {
    try {
      var r = await DATOS.pedir('pedidoBuscar', { numero: numero });
      var p = r.pedido;
      var enLista = est.datos && buscar(p.id);
      if (enLista) {
        var art = UI.$('[data-id="' + p.id + '"]');
        if (art) { art = art.closest('.pedido'); art.classList.add('resaltado'); art.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { art.classList.remove('resaltado'); }, 2600); }
        return mas(null, enLista);
      }
      UI.ventana({ icono: '🧾', titulo: p.numero + ' · ' + p.cliente_nombre, html: '<div class="lista">' + tarjeta(p) + '</div>', botones: [{ texto: 'Cerrar', valor: true, clase: 'secundario' }] });
    } catch (err) { UI.error('No se encontró', err.message); }
  }

  async function asignar(boton, p) {
    var motos = est.motos.filter(function (m) { return m.activo !== false && (m.local_id === 'TODOS' || m.local_id === p.local_id); });
    if (!motos.length) return UI.error('No hay motorizados', 'Registre motorizados activos para este local (dueño → Motorizados).');
    var elegido = null;
    var ok = await UI.ventana({
      icono: '🛵', titulo: 'Asignar ' + p.numero,
      html: '<div class="opciones">' + motos.map(function (m) {
        return '<label class="opcion"><input type="radio" name="moto" value="' + UI.esc(m.id) + '"' + (m.id === p.motorizado_id ? ' checked' : '') + '><span>' + UI.esc(m.nombre) + (m.placa ? ' <small style="color:var(--texto-2)">' + UI.esc(m.placa) + '</small>' : '') + '</span></label>';
      }).join('') + '</div>',
      botones: [{ texto: 'Cancelar', valor: false, clase: 'secundario' }, { texto: 'Asignar', valor: true, antes: function (v) {
        var r = UI.$('input[name=moto]:checked', v);
        if (!r) { UI.aviso('Elija un motorizado.', 'error'); return false; }
        elegido = r.value; return true;
      } }]
    });
    if (!ok) return;
    var motivo = '';
    if (p.estado === 'En camino' && elegido !== p.motorizado_id) {
      motivo = await UI.pedirDato({ icono: '🛵', titulo: 'Motivo del cambio', etiqueta: '¿Por qué cambia el motorizado?', ph: 'Moto dañada, accidente u otro', max: 200, validar: function (v) { return v.trim().length < 3 ? 'Escriba el motivo.' : ''; } });
      if (motivo === null) return;
    }
    if (elegido === p.motorizado_id) return UI.aviso('Ese motorizado ya está asignado.', '');
    var listo = await guardar(boton, 'pedidoAsignar', { id: p.id, motorizado_id: elegido, motivo: motivo }, 'Motorizado asignado.');
    if (listo && p.estado === 'En camino' && UI.digitos(p.telefono)) UI.abrirWhatsApp(p.telefono, 'Hola ' + p.cliente_nombre + ', cambiamos a quien te lleva tu pedido ' + p.numero + '. Puedes ver a tu nuevo motorizado en el seguimiento: ' + enlaceSeguimiento(p));
  }

  function imprimirComanda(p) {
    var items = (p.detalle || []).map(function (d) { return '<li><strong>' + Number(d.cantidad) + ' × ' + UI.esc(d.nombre) + '</strong>' + (d.extras ? '<small>Extras: ' + UI.esc(d.extras) + '</small>' : '') + '</li>'; }).join('');
    var html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comanda ' + UI.esc(p.numero) + '</title><style>@page{margin:3mm}body{font:14px Arial,sans-serif;max-width:78mm;margin:auto;color:#111}h2{text-align:center;font-size:18px}ul{list-style:none;padding:0}li{padding:5px 0;border-bottom:1px dashed #777;break-inside:avoid}small{display:block}p{overflow-wrap:anywhere}@media print{button{display:none}}@media (min-width:600px){body{max-width:190mm}}</style></head><body>' +
      '<h2>COMANDA ' + UI.esc(p.numero) + '</h2><p>Local: ' + UI.esc(APP.nombreLocal(p.local_id)) + '<br>Hora: ' + UI.esc(UI.fechaHora(p.creado)) + '<br>' + UI.esc(UI.tipoEntrega(p) === 'mesa' ? 'Mesa ' + p.mesa : UI.tipoEntrega(p) === 'domicilio' ? 'Domicilio · ' + p.direccion : 'Retiro') + '</p><ul>' + items + '</ul>' + (p.notas ? '<p>NOTAS: ' + UI.esc(p.notas) + '</p>' : '') + '</body></html>';
    var w = global.open('', '_blank');
    if (!w) return UI.aviso('Permita abrir la pestaña de impresión.', 'error');
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    var imprimir = w.document.createElement('button'); imprimir.textContent = '🖨️ Imprimir'; imprimir.style.cssText = 'display:block;margin:14px auto;padding:14px 25px;font-size:17px';
    imprimir.addEventListener('click', function () { w.print(); }); w.document.body.insertBefore(imprimir, w.document.body.firstChild);
    setTimeout(function () { if (!w.closed) w.print(); }, 250); // botón de respaldo por si el navegador bloquea impresión automática
  }

  async function mas(boton, p) {
    var dom = UI.tipoEntrega(p) === 'domicilio';
    var opciones = [['avisar', '💬 Avisar al cliente por WhatsApp'], ['llamar', '📞 Llamar al cliente']];
    var cerrado = p.estado === 'Entregado'; // 3.1.1: entregado = solo consultar
    if (p.tiene_foto) opciones.unshift(['foto', '📷 Ver foto de entrega']); // 3.1.3
    if (p.clave_seguimiento && p.estado !== 'Anulado') opciones.push(['copiar', '🔗 Copiar enlace de seguimiento']);
    if (dom && !cerrado) opciones.push(['mapa', '🗺️ Ver en el mapa · ' + UI.fuenteUbicacion(p).replace(/^\S+\s/, '')], ['pedir_ubic', '📍 Pedir ubicación por WhatsApp'], ['ubicacion', '📋 Pegar ubicación que mandó']);
    if (dom && (p.estado === 'Recibido' || p.estado === 'Preparando' || p.estado === 'En camino')) opciones.push(['asignar', '🛵 ' + (p.motorizado_id ? 'Cambiar' : 'Asignar') + ' motorizado']);
    if (p.estado === 'En camino') opciones.push(['regresar', '↩️ Regresó al local']);
    opciones.push(['imprimir', '🖨️ Imprimir comanda']);
    if (p.motorizado && !cerrado) opciones.push(['wa_moto', '💬 WhatsApp al motorizado']);
    if (UI.esDigital(p.forma_pago) && !cerrado) opciones.push(['verificar', p.pago_verificado ? '↩️ Marcar pago sin verificar' : '🏦 Marcar pago verificado']);
    if (UI.esDigital(p.forma_pago) && !p.pago_verificado && p.estado === 'Recibido') opciones.push(['anular_pago', '⛔ Anular: el pago no se acreditó']); // 3.1.5
    if (p.estado !== 'Entregado' || APP.sesion.rol === 'dueno') opciones.push(['anular', '⛔ Anular pedido']);
    var op = await UI.ventana({
      icono: '🧾', titulo: p.numero + ' · ' + p.cliente_nombre, texto: 'Creado ' + UI.hora(p.creado) + (p.preparando ? ' · preparando ' + UI.hora(p.preparando) : '') + (p.en_camino ? ' · salió ' + UI.hora(p.en_camino) : '') + (p.entregado ? ' · entregado ' + UI.hora(p.entregado) : ''),
      botones: opciones.map(function (o) { return { texto: o[1], valor: o[0], clase: 'borde opcion-lista' + (o[0] === 'anular' ? ' texto-peligro' : '') }; }).concat([{ texto: 'Cerrar', valor: null, clase: 'secundario' }])
    });
    if (!op) return;
    if (op === 'imprimir') return imprimirComanda(p);
    if (op === 'regresar') {
      var motivo = await UI.pedirDato({ icono: '↩️', titulo: 'Regreso de ' + p.numero, etiqueta: 'Motivo del regreso', ph: 'Faltó algo, se derramó, moto dañada…', max: 200, validar: function (v) { return v.trim().length < 3 ? 'Indique el motivo.' : ''; } });
      if (motivo === null) return;
      var listo = await guardar(boton, 'pedidoRegresar', { id: p.id, motivo: motivo }, 'Pedido regresó a Preparando.');
      if (listo && UI.digitos(p.telefono)) UI.abrirWhatsApp(p.telefono, 'Hola ' + p.cliente_nombre + ', tu pedido ' + p.numero + ' tuvo un inconveniente y lo estamos alistando de nuevo. Disculpa la demora. ' + enlaceSeguimiento(p));
      return;
    }
    if (op === 'avisar') return UI.abrirWhatsApp(p.telefono, mensajeCliente(p));
    if (op === 'foto') return UI.verFotoEntrega(p.id, p.numero);
    if (op === 'copiar') return UI.copiar(enlaceSeguimiento(p), 'Enlace copiado. Pégalo en el chat del cliente.');
    if (op === 'llamar') { global.location.href = 'tel:+' + UI.digitos(p.telefono); return; }
    if (op === 'pedir_ubic') return UI.abrirWhatsApp(p.telefono, 'Hola ' + p.cliente_nombre + ', somos ' + ((APP.publico && APP.publico.negocio_nombre) || 'el local') + '. Para llevarte tu pedido ' + p.numero + ', ¿nos envías tu ubicación por aquí? 📍 (toca 📎 → Ubicación → Enviar tu ubicación actual). ¡Gracias!');
    if (op === 'verificar' && !p.pago_verificado) return verificar(boton, p);
    if (op === 'mapa') { var u = UI.enlaceMapa(p); if (u) global.open(u, '_blank', 'noopener'); else UI.aviso('Este pedido no tiene dirección ni ubicación.', 'error'); return; }
    if (op === 'wa_moto') return UI.abrirWhatsApp(p.motorizado.celular, 'Pedido ' + p.numero + ' · ' + p.cliente_nombre + ' · ' + p.telefono + '\n' + (p.direccion || '') + (p.referencia ? ' (' + p.referencia + ')' : '') + '\nMapa: ' + UI.enlaceMapa(p) + '\nCobrar: ' + (p.forma_pago === 'efectivo' ? UI.dinero(p.total) : 'ya pagado, no cobrar') +
      (APP.publico && APP.publico.codigo_entrega !== 'NO' && p.pide_codigo !== false ? '\n🔢 Al entregar, pide al cliente su código de 4 números.' : ''));
    if (op === 'asignar') return asignar(boton, p);
    if (op === 'verificar') return guardar(boton, 'pedidoPagoVerificar', { id: p.id, verificado: !p.pago_verificado,total_esperado:Number(p.total) }, 'Listo.');
    if (op === 'ubicacion') {
      var enlace = await UI.pedirDato({ icono: '📍', titulo: 'Ubicación de ' + p.numero, etiqueta: 'Enlace de ubicación', valor: p.ubicacion_enlace, ph: 'https://maps.app.goo.gl/…', ayuda: 'En WhatsApp: abra la ubicación que mandó el cliente → Compartir → Copiar enlace, y péguelo aquí. Reemplaza a la ubicación anterior.', max: 400, validar: function (v) { return v && !/^https:\/\//.test(v) ? 'Pegue el enlace completo (empieza con https://).' : ''; } });
      if (enlace !== null) guardar(boton, 'pedidoUbicacion', { id: p.id, enlace: enlace }, 'Ubicación guardada: el motorizado usará esta.');
      return;
    }
    if (op === 'anular_pago') {
      var okA = await UI.confirmar('¿Anular ' + p.numero + '?', 'El pago de ' + UI.dinero(p.total) + ' no se acreditó en la cuenta. El pedido queda anulado con ese motivo.', 'Sí, anular', true);
      if (okA && await guardar(boton, 'pedidoAnular', { id: p.id, motivo: 'El pago no se acreditó en la cuenta del local.' }, p.numero + ' anulado.') && UI.digitos(p.telefono)) {
        UI.abrirWhatsApp(p.telefono, 'Hola ' + p.cliente_nombre + ', no recibimos el pago de tu pedido ' + p.numero + ' (' + UI.dinero(p.total) + ') en nuestra cuenta, por eso lo anulamos. Si ya pagaste, respóndenos con el comprobante y lo revisamos. 🙏');
      }
      return;
    }
    if (op === 'anular') {
      var motivo = await UI.pedirDato({ icono: '⛔', titulo: 'Anular ' + p.numero, texto: 'El pedido no se borra: queda anulado con el motivo.', etiqueta: 'Motivo', area: true, boton: 'Anular pedido', peligro: true, validar: function (v) { return v.length < 3 ? 'Escriba el motivo.' : ''; } });
      if(motivo===null)return;
      var datosAnular={id:p.id,motivo:motivo,total_esperado:Number(p.total)};
      if(UI.esDigital(p.forma_pago)&&p.pago_verificado===true){if(!await UI.confirmar('Confirmar devolución bancaria','Confirma únicamente si ya devolviste '+UI.dinero(p.total)+' al cliente y comprobaste el banco. El sistema no realiza la transferencia.','Confirmar devolución realizada',true))return;datosAnular.devolucion_confirmada=true;}
      guardar(boton,'pedidoAnular',datosAnular,p.numero+' anulado.');
    }
  }

  function nuevoPedido() {
    var url = 'pedir.html' + (APP.local !== 'TODOS' ? '?local=' + encodeURIComponent(APP.local) : '');
    global.open(url, '_blank', 'noopener');
  }
})(window);
