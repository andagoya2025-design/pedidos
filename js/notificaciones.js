/* Centro de avisos local: consume eventos ya consultados por la aplicación. */
(function(g){
 'use strict';
 var APP=g.APP,UI=g.UI,MEM=g.APP_MEMORIA,contexto='',lista=[],vistos=Object.create(null),asignados=null,asignacionSeq=0,atrasados=Object.create(null),generacion=0,timers=[],cerrarDialogo=null,loteAudio=null,salidasUltimas=Object.create(null),salidaSeq=0;
 var tipos={salidaAdmin:{titulo:'Confirmación enviada',roles:['dueno','cajero'],vista:'pedidos'},salidaMoto:{titulo:'Confirmación enviada',roles:['motorizado'],vista:'entregas'},pedido:{titulo:'Nuevo pedido',voz:'Atención, nuevo pedido recibido.',roles:['dueno','cajero'],vista:'pedidos'},solicitud:{titulo:'Solicitud de modificación',voz:'Atención, tiene una actualización de modificación de pedido.',roles:['dueno','cajero'],vista:'pedidos'},atraso:{titulo:'Pedido sin atender',voz:'Atención, tiene un pedido pendiente de atender.',roles:['dueno','cajero'],vista:'pedidos'},entrega:{titulo:'Nueva entrega asignada',voz:'Atención, tiene una nueva entrega asignada.',roles:['motorizado'],vista:'entregas'},retiro:{titulo:'Asignación actualizada',voz:'Atención, una entrega ya no está en tus asignaciones.',roles:['motorizado'],vista:'entregas'},cambioEntrega:{titulo:'Modificación de entrega',voz:'Atención, revisa una modificación en tu entrega.',roles:['motorizado'],vista:'entregas'},cambioResuelto:{titulo:'Actualización de entrega',voz:'Atención, una modificación de entrega fue actualizada.',roles:['motorizado'],vista:'entregas'}};
 function scope(){var s=APP.sesion;return s?String(s.usuario_id||s.usuario)+'|'+s.rol+'|'+String(APP.local||s.local_id||'')+'|'+String(g.APP_CONFIG.url||''):'';}
 function reset(){if(cerrarDialogo){var cerrar=cerrarDialogo;cerrarDialogo=null;cerrar(null);}generacion++;timers.forEach(function(t){g.clearTimeout(t);});timers=[];loteAudio=null;if(g.MIP_VOZ)g.MIP_VOZ.limpiar();lista=[];vistos=Object.create(null);asignados=null;asignacionSeq=0;atrasados=Object.create(null);salidasUltimas=Object.create(null);salidaSeq=0;contexto='';pintar();}
 function sync(){var k=scope();if(k!==contexto){reset();contexto=k;}return k;}
 function modo(){if(MEM.leer('sonido_pedidos')===false)return 'silencio';var v=MEM.leer('modo_avisos');return ['sonido','voz','ambos'].indexOf(v)>=0?v:'sonido';}
 function volumen(){var v=MEM.leer('volumen_voz');return typeof v==='number'?Math.max(0,Math.min(100,v)):80;}
 function configurar(m,v){if(['sonido','voz','ambos','silencio'].indexOf(m)<0)return;v=Math.max(0,Math.min(100,Number(v)||0));if(m===modo()&&v===volumen())return;MEM.guardar('sonido_pedidos',m!=='silencio');MEM.guardar('modo_avisos',m==='silencio'?'sonido':m);MEM.guardar('volumen_voz',Math.max(0,Math.min(100,Number(v)||0)));generacion++;timers.forEach(function(t){g.clearTimeout(t);});timers=[];loteAudio=null;if(g.MIP_VOZ)g.MIP_VOZ.limpiar();}
 function primerNombre(v){var x=String(v||'').trim().split(/\s+/)[0]||'';return /^[\p{L}\p{M}][\p{L}\p{M}'’-]{0,23}$/u.test(x)?x:'';}
 function fraseAvisos(tipo,items){var cantidad=items.length,nombres=items.map(function(x){return x.nombre;}).filter(Boolean),n=nombres[0],conNombres=cantidad<=3&&nombres.length===cantidad,listaNombres=nombres.length===2?nombres.join(' y '):nombres.slice(0,-1).join(', ')+' y '+nombres[nombres.length-1];
  if(tipo==='pedido')return cantidad===1?(n?'Nuevo pedido de '+n+'.':tipos[tipo].voz):'Atención, '+cantidad+' nuevos pedidos'+(conNombres?' de '+listaNombres:' recibidos')+'.';
  if(tipo==='solicitud'||tipo==='aceptacion'){var aceptada=tipo==='aceptacion';return cantidad===1?(n?n+(aceptada?' aceptó la modificación.':' solicita modificar su pedido.'):(aceptada?'Una modificación fue aceptada.':tipos.solicitud.voz)):'Atención, '+cantidad+(aceptada?' modificaciones aceptadas':' solicitudes de modificación')+(conNombres?' de '+listaNombres:'')+'.';}
  if(tipo==='entrega')return cantidad===1?(n?'Nueva entrega para '+n+'.':tipos[tipo].voz):'Atención, '+cantidad+' nuevas entregas asignadas'+(conNombres?' para '+listaNombres:'')+'.';
  if(cantidad===1)return tipos[tipo].voz;var etiquetas={atraso:'pedidos pendientes de atender',retiro:'asignaciones actualizadas',cambioEntrega:'modificaciones de entrega',cambioResuelto:'actualizaciones de entrega'};return 'Atención, '+cantidad+' '+etiquetas[tipo]+'.';
 }
 function clasificar(tipo,x){return tipo==='solicitud'&&x.estado==='Confirmada cliente'?'aceptacion':tipo;}
 function fraseLote(grupos){var claves=Object.keys(grupos);if(claves.length===1)return fraseAvisos(claves[0],grupos[claves[0]]);var etiquetas={pedido:['nuevo pedido','nuevos pedidos'],solicitud:['solicitud de modificación','solicitudes de modificación'],aceptacion:['modificación aceptada','modificaciones aceptadas'],atraso:['pedido pendiente','pedidos pendientes'],entrega:['nueva entrega','nuevas entregas'],retiro:['asignación actualizada','asignaciones actualizadas'],cambioEntrega:['modificación de entrega','modificaciones de entrega'],cambioResuelto:['actualización de entrega','actualizaciones de entrega']};var partes=claves.map(function(k){var l=grupos[k].length;return l+' '+etiquetas[k][l===1?0:1];});return 'Atención, '+partes.join(', ')+'.';}
 function sonar(tipo,espera,prueba,items){
  var s=APP.sesion,k=scope(),gen=generacion,m=modo();if(!s||m==='silencio')return;
  function valido(){return APP.sesion===s&&scope()===k&&gen===generacion&&modo()!=='silencio';}
  function despues(ms,fn){var t=g.setTimeout(function(){timers=timers.filter(function(x){return x!==t;});if(valido())fn();},ms);timers.push(t);}
  function pitido(){if(valido())UI.sonar();}
  if(prueba){if(m==='sonido'||!g.MIP_VOZ){pitido();return;}g.MIP_VOZ.hablar('Prueba de voz de MiPedido.',{volumen:volumen()/100,valido:valido,fallo:pitido,fin:function(){if(m==='ambos')pitido();}});return;}
  items=items||[];var grupos=Object.create(null);items.forEach(function(x){var t=clasificar(tipo,x);(grupos[t]||(grupos[t]=[])).push(x);});
  // Ventana natural del timbre: agrupar todos los eventos detectados sin añadir latencia a la voz.
  if(m==='ambos'&&!espera){if(loteAudio&&loteAudio.gen===gen){Object.keys(grupos).forEach(function(t){loteAudio.grupos[t]=(loteAudio.grupos[t]||[]).concat(grupos[t]);});return;}
   var lote={gen:gen,grupos:grupos};loteAudio=lote;despues(0,pitido);despues(650,function(){if(loteAudio===lote)loteAudio=null;if(g.MIP_VOZ)g.MIP_VOZ.hablar(fraseLote(lote.grupos),{volumen:volumen()/100,valido:valido,fallo:function(){}});});return;}
  var intervalos=m==='ambos'?[0]:tipo==='atraso'||tipos[tipo].vista==='entregas'||prueba?[0]:tipo==='solicitud'?[0,250,500]:[0,850,1700];
  if(m==='sonido'||m==='ambos')intervalos.forEach(function(ms){despues(ms+(espera||0),pitido);});
  if(m==='voz'||m==='ambos'){
   var hablar=function(){if(!g.MIP_VOZ){if(m==='voz')pitido();return;}g.MIP_VOZ.hablar(fraseLote(grupos),{volumen:volumen()/100,valido:valido,fallo:function(){if(m==='voz')pitido();}});};
   if(prueba&&m==='voz')hablar();else despues((espera||0)+(m==='ambos'?Math.max.apply(null,intervalos)+650:0),hablar);
  }
 }
 function pintar(){var b=document.getElementById('mip-avisos'),n=document.getElementById('mip-avisos-num');if(!b||!n)return;var c=lista.filter(function(x){return !x.leido;}).length;n.textContent=String(Math.min(c,99))+(c>99?'+':'');n.hidden=!c;b.setAttribute('aria-label','Notificaciones'+(c?', '+c+' sin leer':''));}
 function registrar(tipo,items,op){
  sync();op=op||{};var t=tipos[tipo],s=APP.sesion;if(!contexto||!t||!s||t.roles.indexOf(s.rol)<0)return false;
  var nuevos=[];(items||[]).forEach(function(p){var id=String(p.id||'');if(!id)return;var key=tipo+':'+id+(tipo==='solicitud'?':'+String(p.estado||''):'');if(vistos[key])return;vistos[key]=true;nuevos.push({key:key,tipo:tipo,numero:String(p.numero||'').slice(0,30),nombre:primerNombre(p.nombre_aviso||p.cliente_nombre),estado:String(p.estado||''),mensaje:tipo==='salidaAdmin'||tipo==='salidaMoto'?String(p.mensaje||'').slice(0,120):'',fecha:Date.now(),leido:false});});
  if(!nuevos.length)return false;lista=nuevos.reverse().concat(lista).slice(0,100);pintar();if(op.audio!==false)sonar(tipo,op.espera||0,false,nuevos.slice().reverse());return true;
 }
 function entregas(pedidos){sync();if(!APP.sesion||APP.sesion.rol!=='motorizado'||!Array.isArray(pedidos))return;var ahora=Object.create(null),finales=Object.create(null),nuevos=[],retirados=[],cambios=[],resueltos=[];pedidos.forEach(function(p){if(!p||!p.id)return;var id=String(p.id);if(p.estado==='Entregado'||p.estado==='Anulado'){finales[id]=p.estado;return;}if(['Recibido','Preparando','En camino'].indexOf(p.estado)<0)return;ahora[id]={numero:p.numero,bloqueo:p.cambios_pendientes===true};var anterior=asignados&&asignados[id];function item(){return {id:id+':evento:'+ ++asignacionSeq,numero:p.numero,cliente_nombre:p.cliente_nombre};}if(!anterior)nuevos.push(item());else if(anterior.bloqueo!==ahora[id].bloqueo){(ahora[id].bloqueo?cambios:resueltos).push(item());}});if(asignados)Object.keys(asignados).forEach(function(id){if(!ahora[id]&&finales[id]!=='Entregado')retirados.push({id:id+':retiro:'+ ++asignacionSeq,numero:asignados[id].numero});});asignados=ahora;if(nuevos.length)registrar('entrega',nuevos);if(retirados.length)registrar('retiro',retirados,{espera:0});if(cambios.length)registrar('cambioEntrega',cambios,{espera:0});if(resueltos.length)registrar('cambioResuelto',resueltos,{espera:0});}
 // Confirmación local posterior a escritura exitosa. Sin nuevas consultas.
 function audioSalida(texto){
  var s=APP.sesion,k=scope(),gen=generacion,m=modo();if(!s||m==='silencio')return;
  function valido(){return APP.sesion===s&&scope()===k&&gen===generacion&&modo()!=='silencio';}
  function beep(){if(valido())UI.sonar();}
  function voz(){if(!valido())return;if(!g.MIP_VOZ){if(m==='voz')beep();return;}g.MIP_VOZ.hablar(texto,{volumen:volumen()/100,valido:valido,fallo:function(){if(m==='voz')beep();}});}
  if(m==='sonido'||m==='ambos')beep();if(m==='voz')voz();if(m==='ambos'){var t=g.setTimeout(function(){timers=timers.filter(function(x){return x!==t;});voz();},650);timers.push(t);}
 }
 function capturarSalida(accion,datos,previo){
  sync();var s=APP.sesion,k=contexto,rol=s&&s.rol,admin=rol==='dueno'||rol==='cajero',moto=rol==='motorizado';
  datos=Object.assign({},datos);previo=Object.assign({},previo);var id=String(datos.id||'');
  return function(r){try{
   if(!s||APP.sesion!==s||scope()!==k||!r||r.repetido===true||r.repetida===true)return false;
   var p=r.pedido,numero=String(previo.numero||''),mensaje='',firma='',familia=accion;
   if(admin&&['pedidoEstado','pedidoAsignar','pedidoPagoVerificar','pedidoRegresar','pedidoAnular','pedidoUbicacion'].indexOf(accion)>=0){
    if(!p||!id||String(p.id)!==id)return false;numero=String(p.numero||numero);
    if(accion==='pedidoEstado'){
     if(p.estado!==datos.a||datos.desde===datos.a)return false;
     mensaje={'Preparando':'Pedido en preparación.','En camino':'Pedido en camino.','Entregado':'Pedido entregado correctamente.'}[p.estado];firma=String(p[{Preparando:'preparando','En camino':'en_camino',Entregado:'entregado'}[p.estado]]||p.estado);familia+=':'+p.estado;
    }else if(accion==='pedidoAsignar'){if(String(p.motorizado_id)!==String(datos.motorizado_id)||String(previo.motorizado_id||'')===String(p.motorizado_id))return false;mensaje='Entrega asignada correctamente.';firma=String(p.motorizado_id);}
    else if(accion==='pedidoPagoVerificar'){if(p.pago_verificado!==datos.verificado)return false;mensaje=datos.verificado?'Pago verificado correctamente.':'Verificación de pago retirada.';firma=String(p.pago_verificado)+':'+String(p.pago_verificado_fecha||'');}
    else if(accion==='pedidoRegresar'){if(p.estado!=='Preparando')return false;mensaje='Regreso del pedido registrado.';firma=String(previo.en_camino||previo.estado||'');}
    else if(accion==='pedidoAnular'){if(p.estado!=='Anulado')return false;mensaje='Pedido anulado correctamente.';firma=String(p.anulado||'Anulado');}
    else if(accion==='pedidoUbicacion'){mensaje='Ubicación guardada correctamente.';firma=String(p.ubicacion_enlace||'')+':'+String(p.lat||'')+':'+String(p.lng||'');}
   }else if(admin&&['pedidoCambioProponer','pedidoCambioResolver','pedidoCambioAplicar'].indexOf(accion)>=0){
    if(!id||String(r.id)!==id)return false;
    if(accion==='pedidoCambioProponer'){if(r.estado!=='Cotizada'||!r.cotizacion||!r.cotizacion.id)return false;mensaje='Propuesta enviada al cliente.';firma=String(r.cotizacion.id);}
    else if(accion==='pedidoCambioAplicar'){if(r.estado!=='Aplicada'||r.aplicado!==true)return false;mensaje='Modificación aplicada correctamente.';firma=String(datos.cotizacion_id||id);}
    else {if(r.estado!==datos.decision||r.aplicado!==false)return false;mensaje=r.estado==='Rechazada'?'Solicitud rechazada.':'Respuesta enviada al cliente.';firma=String(r.estado);}
   }else if(moto&&['entregaSali','entregaEntregado'].indexOf(accion)>=0){
    if(accion==='entregaEntregado'&&Array.isArray(r.pedidos))p=r.pedidos.find(function(x){return String(x.id)===id;});
    var esperado=accion==='entregaSali'?'En camino':'Entregado';if(!p||!id||String(p.id)!==id||p.estado!==esperado)return false;
    numero=String(p.numero||numero);mensaje=accion==='entregaSali'?'Salida registrada. Buen viaje.':'Entrega registrada correctamente.';firma=String(p[accion==='entregaSali'?'en_camino':'entregado']||esperado);
   }else if(moto&&['turnoIniciar','turnoTerminar'].indexOf(accion)>=0){
    if(!r.motorizado||!r.motorizado.id||!Object.prototype.hasOwnProperty.call(r,'turno'))return false;
    id=String(r.motorizado.id);familia='turno';if(accion==='turnoIniciar'){if(!r.turno||previo.id||previo.inicio)return false;mensaje='Turno iniciado correctamente.';firma='inicio:'+String(r.turno.id||r.turno.inicio||'');}else{if(r.turno||!previo.id&&!previo.inicio)return false;mensaje='Turno terminado correctamente.';firma='fin:'+String(previo.id||previo.inicio);}
   }else return false;
   if(!mensaje||!id)return false;
   var clave=familia+':'+id;if(salidasUltimas[clave]===firma)return false;
   salidasUltimas[clave]=firma;var tipo=admin?'salidaAdmin':'salidaMoto';
   if(!registrar(tipo,[{id:'salida-'+ ++salidaSeq,numero:numero,mensaje:mensaje}],{audio:false}))return false;
   audioSalida(mensaje);return true;
  }catch(e){return false;}};
 }
 function pendientesAtrasados(pedidos){sync();var nuevos=[];(pedidos||[]).forEach(function(p){if(!atrasados[p.id]){atrasados[p.id]=true;nuevos.push(p);}});return nuevos;}
 function eliminar(ids){sync();if(!APP.sesion)return;if(!Array.isArray(ids))return;var claves=new Set(ids);lista=lista.filter(function(x){return !claves.has(x.key);});pintar();}
 async function abrir(){
  sync();if(!APP.sesion)return;var s=APP.sesion,k=contexto;
  var rows=lista.map(function(x){return '<div class="mip-aviso-grupo"><button class="mip-aviso-fila" type="button" data-aviso="'+UI.esc(x.key)+'"><span><b>'+UI.esc(x.mensaje||tipos[x.tipo].titulo)+'</b><small>'+UI.esc(x.numero||'')+' · '+UI.esc(UI.fechaHora(new Date(x.fecha).toISOString()))+'</small></span><span>'+(!x.leido?'●':'›')+'</span></button><button type="button" class="mip-aviso-borrar" data-borrar-aviso="'+UI.esc(x.key)+'" aria-label="Eliminar aviso de '+UI.esc(x.numero||'pedido')+'"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/></svg></button></div>';}).join('');
  await UI.ventana({titulo:'Centro de notificaciones',icono:'🔔',texto:'Avisos de este turno y local. Toca un aviso para abrir su módulo.',html:'<div class="mip-aviso-lista">'+(rows||'<p class="ayuda">No hay avisos registrados en este turno.</p>')+'</div><button type="button" class="btn borde bloque" id="mip-avisos-leer">Marcar todos como leídos</button><button type="button" class="btn borde bloque mip-aviso-vaciar" id="mip-avisos-vaciar">Eliminar todas las notificaciones</button>',alAbrir:function(v,cerrar){cerrarDialogo=cerrar;var vaciar=UI.$('#mip-avisos-vaciar',v);function botones(){vaciar.disabled=!lista.length;}botones();UI.$$('[data-borrar-aviso]',v).forEach(function(b){b.onclick=function(){if(APP.sesion!==s||scope()!==k)return;eliminar([b.getAttribute('data-borrar-aviso')]);b.closest('.mip-aviso-grupo').remove();if(!UI.$('[data-aviso]',v))UI.$('.mip-aviso-lista',v).textContent='No hay avisos en esta vista.';botones();};});vaciar.onclick=function(){if(APP.sesion!==s||scope()!==k)return;cerrar('vaciar');};UI.$('#mip-avisos-leer',v).onclick=function(){if(APP.sesion!==s||scope()!==k)return;lista.forEach(function(x){x.leido=true;});pintar();UI.$$('[data-aviso]',v).forEach(function(b){b.lastElementChild.textContent='›';});};UI.$$('[data-aviso]',v).forEach(function(b){b.onclick=function(){if(APP.sesion!==s||scope()!==k)return;var x=lista.find(function(x){return x.key===b.getAttribute('data-aviso');});if(!x)return;x.leido=true;pintar();b.lastElementChild.textContent='›';var dest=tipos[x.tipo].vista;if(x.tipo!=='solicitud'&&dest==='pedidos'&&/^PED-\d+$/i.test(x.numero))dest+='?ver='+encodeURIComponent(x.numero);cerrar('cerrar');APP.ir(dest);};});},botones:[{texto:'Configurar avisos',valor:'config',clase:'borde'},{texto:'Cerrar',valor:'cerrar',clase:'secundario',antes:function(){return true;}}]}).then(function(r){cerrarDialogo=null;if(APP.sesion!==s||scope()!==k)return;if(r==='config')return ajustes();if(r==='vaciar'){var ids=lista.map(function(x){return x.key;});return UI.confirmar('¿Eliminar todas las notificaciones?','Solo se borrarán los avisos escritos de este equipo. Los pedidos y el sonido no cambian.','Sí, eliminar',true).then(function(ok){if(APP.sesion!==s||scope()!==k)return;if(ok)eliminar(ids);return abrir();});}});
 }
 function activarVoz(){if(['voz','ambos'].indexOf(modo())>=0&&g.MIP_VOZ&&g.MIP_VOZ.activar)g.MIP_VOZ.activar();}
 function estadoVoz(){var e=g.MIP_VOZ&&g.MIP_VOZ.estado?g.MIP_VOZ.estado():'no disponible';return e==='reproducida'?'Voz reproducida en esta apertura.':e==='preparada'?'Motor de voz preparado; comprueba que se escucha.':e==='pendiente'?'Voz pendiente de comprobar en esta apertura.':'Voz no disponible: se usará el timbre de respaldo.';}
 async function ajustes(){
  sync();var s=APP.sesion,k=contexto;if(!s)return;UI.desbloquearSonido();var m=modo(),v=volumen(),valores={sonido:'Solo timbre',voz:'Solo voz',ambos:'Timbre + voz',silencio:'Silencio'};
  var r=await UI.ventana({titulo:'Sonido y voz',icono:'🔊',texto:'Preferencias de este equipo y sesión. Mantén la app abierta. La voz depende de las opciones en español del dispositivo.',html:'<div class="campo"><label for="mip-modo">Modo de alerta</label><select class="entrada" id="mip-modo">'+Object.keys(valores).map(function(x){return '<option value="'+x+'"'+(x===m?' selected':'')+'>'+valores[x]+'</option>';}).join('')+'</select></div><div class="campo"><label for="mip-vol">Volumen de voz</label><input id="mip-vol" type="range" min="0" max="100" value="'+v+'"><span class="ayuda">El timbre conserva su volumen original.</span></div><p class="ayuda">'+estadoVoz()+'</p>',botones:[{texto:'Probar',valor:'prueba',clase:'borde',antes:probar},{texto:'Guardar y activar audio',valor:'guardar',antes:guardarActivar},{texto:'Permitir avisos visuales (opcional)',valor:'notif',clase:'borde'},{texto:'Cancelar',valor:null,clase:'secundario'}]});
  function guardar(v){if(APP.sesion!==s||scope()!==k)return false;configurar(UI.$('#mip-modo',v).value,UI.$('#mip-vol',v).value);return true;}
  function guardarActivar(v){if(!guardar(v))return false;UI.desbloquearSonido();activarVoz();return true;}
  function probar(v){if(!guardar(v))return false;UI.desbloquearSonido();sonar('pedido',0,true);return true;}
  if(APP.sesion!==s||scope()!==k)return;if(r==='prueba'){return ajustes();}if(r==='notif'){await UI.pedirNotificaciones();return ajustes();}
 }
 function init(){var b=document.getElementById('mip-avisos');if(b)b.addEventListener('click',function(){UI.desbloquearSonido();return abrir();});}
 document.addEventListener('click',function(e){if(e.isTrusted&&APP.sesion&&!e.target.closest('.velo')){activarVoz();}},true);
 document.addEventListener('DOMContentLoaded',init);g.addEventListener('app:sesion-terminada',reset);
 g.MIP_AVISOS={capturarSalida:capturarSalida,eliminar:eliminar,registrar:registrar,entregas:entregas,pendientesAtrasados:pendientesAtrasados,sync:sync,reset:reset,ajustes:ajustes,modo:modo,configurar:configurar,estado:function(){sync();return lista.map(function(x){return Object.assign({},x);});}};
})(window);
