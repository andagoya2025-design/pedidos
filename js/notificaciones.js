/* Centro de avisos local: consume eventos ya consultados por la aplicación. */
(function(g){
 'use strict';
 var APP=g.APP,UI=g.UI,MEM=g.APP_MEMORIA,contexto='',lista=[],vistos=Object.create(null),asignados=null,asignacionSeq=0,atrasados=Object.create(null),generacion=0,timers=[],cerrarDialogo=null;
 var tipos={pedido:{titulo:'Nuevo pedido',voz:'Atención, nuevo pedido recibido.',roles:['dueno','cajero'],vista:'pedidos'},solicitud:{titulo:'Solicitud de modificación',voz:'Atención, tiene una actualización de modificación de pedido.',roles:['dueno','cajero'],vista:'pedidos'},atraso:{titulo:'Pedido sin atender',voz:'Atención, tiene un pedido pendiente de atender.',roles:['dueno','cajero'],vista:'pedidos'},entrega:{titulo:'Nueva entrega asignada',voz:'Atención, tiene una nueva entrega asignada.',roles:['motorizado'],vista:'entregas'}};
 function scope(){var s=APP.sesion;return s?String(s.usuario_id||s.usuario)+'|'+s.rol+'|'+String(APP.local||s.local_id||'')+'|'+String(g.APP_CONFIG.url||''):'';}
 function reset(){if(cerrarDialogo){var cerrar=cerrarDialogo;cerrarDialogo=null;cerrar(null);}generacion++;timers.forEach(function(t){g.clearTimeout(t);});timers=[];if(g.MIP_VOZ)g.MIP_VOZ.limpiar();lista=[];vistos=Object.create(null);asignados=null;asignacionSeq=0;atrasados=Object.create(null);contexto='';pintar();}
 function sync(){var k=scope();if(k!==contexto){reset();contexto=k;}return k;}
 function modo(){if(MEM.leer('sonido_pedidos')===false)return 'silencio';var v=MEM.leer('modo_avisos');return ['sonido','voz','ambos'].indexOf(v)>=0?v:'sonido';}
 function volumen(){var v=MEM.leer('volumen_voz');return typeof v==='number'?Math.max(0,Math.min(100,v)):80;}
 function configurar(m,v){if(['sonido','voz','ambos','silencio'].indexOf(m)<0)return;MEM.guardar('sonido_pedidos',m!=='silencio');MEM.guardar('modo_avisos',m==='silencio'?'sonido':m);MEM.guardar('volumen_voz',Math.max(0,Math.min(100,Number(v)||0)));generacion++;timers.forEach(function(t){g.clearTimeout(t);});timers=[];if(g.MIP_VOZ)g.MIP_VOZ.limpiar();}
 function sonar(tipo,espera,prueba){
  var s=APP.sesion,k=scope(),gen=generacion,m=modo();if(!s||m==='silencio')return;
  function valido(){return APP.sesion===s&&scope()===k&&gen===generacion&&modo()!=='silencio';}
  function despues(ms,fn){var t=g.setTimeout(function(){timers=timers.filter(function(x){return x!==t;});if(valido())fn();},ms);timers.push(t);}
  function pitido(){if(valido())UI.sonar();}
  var intervalos=tipo==='atraso'||tipo==='entrega'||prueba?[0]:tipo==='solicitud'?[0,250,500]:[0,850,1700];
  if(m==='sonido'||m==='ambos')intervalos.forEach(function(ms){despues(ms+(espera||0),pitido);});
  if(m==='voz'||m==='ambos'){
   var hablar=function(){if(!g.MIP_VOZ){if(m==='voz')pitido();return;}g.MIP_VOZ.hablar(prueba?'Prueba de voz de MiPedido.':tipos[tipo].voz,{volumen:volumen()/100,valido:valido,fallo:function(){if(m==='voz')pitido();}});};
   if(prueba&&m==='voz')hablar();else despues((espera||0)+(m==='ambos'?Math.max.apply(null,intervalos)+650:0),hablar);
  }
 }
 function pintar(){var b=document.getElementById('mip-avisos'),n=document.getElementById('mip-avisos-num');if(!b||!n)return;var c=lista.filter(function(x){return !x.leido;}).length;n.textContent=String(Math.min(c,99))+(c>99?'+':'');n.hidden=!c;b.setAttribute('aria-label','Notificaciones'+(c?', '+c+' sin leer':''));}
 function registrar(tipo,items,op){
  sync();op=op||{};var t=tipos[tipo],s=APP.sesion;if(!contexto||!t||!s||t.roles.indexOf(s.rol)<0)return false;
  var nuevos=[];(items||[]).forEach(function(p){var id=String(p.id||'');if(!id)return;var key=tipo+':'+id+(tipo==='solicitud'?':'+String(p.estado||''):'');if(vistos[key])return;vistos[key]=true;nuevos.push({key:key,tipo:tipo,numero:String(p.numero||'').slice(0,30),fecha:Date.now(),leido:false});});
  if(!nuevos.length)return false;lista=nuevos.reverse().concat(lista).slice(0,100);pintar();if(op.audio!==false)sonar(tipo,op.espera||0);return true;
 }
 function entregas(pedidos){sync();if(!APP.sesion||APP.sesion.rol!=='motorizado'||!Array.isArray(pedidos))return;var ahora=Object.create(null),nuevos=[];pedidos.filter(function(p){return p.estado!=='Entregado'&&p.estado!=='Anulado';}).forEach(function(p){var id=String(p.id||'');if(!id)return;ahora[id]=true;if(!asignados||!asignados[id])nuevos.push({id:id+':asignacion:'+ ++asignacionSeq,numero:p.numero});});asignados=ahora;if(nuevos.length)registrar('entrega',nuevos);}
 function pendientesAtrasados(pedidos){sync();var nuevos=[];(pedidos||[]).forEach(function(p){if(!atrasados[p.id]){atrasados[p.id]=true;nuevos.push(p);}});return nuevos;}
 async function abrir(){
  sync();if(!APP.sesion)return;var s=APP.sesion,k=contexto;
  var rows=lista.map(function(x){return '<button class="mip-aviso-fila" type="button" data-aviso="'+UI.esc(x.key)+'"><span><b>'+UI.esc(tipos[x.tipo].titulo)+'</b><small>'+UI.esc(x.numero||'')+' · '+UI.esc(UI.fechaHora(new Date(x.fecha).toISOString()))+'</small></span><span>'+(!x.leido?'●':'›')+'</span></button>';}).join('');
  await UI.ventana({titulo:'Centro de notificaciones',icono:'🔔',texto:'Avisos de este turno y local. Toca un aviso para abrir su módulo.',html:'<div class="mip-aviso-lista">'+(rows||'<p class="ayuda">No hay avisos registrados en este turno.</p>')+'</div><button type="button" class="btn borde bloque" id="mip-avisos-leer">Marcar todos como leídos</button>',alAbrir:function(v,cerrar){cerrarDialogo=cerrar;UI.$('#mip-avisos-leer',v).onclick=function(){if(APP.sesion!==s||scope()!==k)return;lista.forEach(function(x){x.leido=true;});pintar();UI.$$('[data-aviso]',v).forEach(function(b){b.lastElementChild.textContent='›';});};UI.$$('[data-aviso]',v).forEach(function(b){b.onclick=function(){if(APP.sesion!==s||scope()!==k)return;var x=lista.find(function(x){return x.key===b.getAttribute('data-aviso');});if(!x)return;x.leido=true;pintar();b.lastElementChild.textContent='›';var dest=tipos[x.tipo].vista;if(x.tipo!=='solicitud'&&dest==='pedidos'&&/^PED-\d+$/i.test(x.numero))dest+='?ver='+encodeURIComponent(x.numero);cerrar('cerrar');APP.ir(dest);};});},botones:[{texto:'Configurar avisos',valor:'config',clase:'borde'},{texto:'Cerrar',valor:'cerrar',clase:'secundario',antes:function(){return true;}}]}).then(function(r){cerrarDialogo=null;if(r==='config'&&APP.sesion===s&&scope()===k)return ajustes();});
 }
 async function ajustes(){
  sync();var s=APP.sesion,k=contexto;if(!s)return;UI.desbloquearSonido();var m=modo(),v=volumen(),valores={sonido:'Solo timbre',voz:'Solo voz',ambos:'Timbre + voz',silencio:'Silencio'};
  var r=await UI.ventana({titulo:'Sonido y voz',icono:'🔊',texto:'Preferencias de este equipo y sesión. Mantén la app abierta. La voz depende de las opciones en español del dispositivo.',html:'<div class="campo"><label for="mip-modo">Modo de alerta</label><select class="entrada" id="mip-modo">'+Object.keys(valores).map(function(x){return '<option value="'+x+'"'+(x===m?' selected':'')+'>'+valores[x]+'</option>';}).join('')+'</select></div><div class="campo"><label for="mip-vol">Volumen de voz</label><input id="mip-vol" type="range" min="0" max="100" value="'+v+'"><span class="ayuda">El timbre conserva su volumen original.</span></div><p class="ayuda">'+(g.MIP_VOZ&&g.MIP_VOZ.disponible()?'Voz disponible en este navegador.':'Voz no disponible: se usará el timbre de respaldo.')+'</p>',botones:[{texto:'Probar',valor:'prueba',clase:'borde',antes:guardar},{texto:'Guardar',valor:'guardar',antes:guardar},{texto:'Activar notificación en pantalla',valor:'notif',clase:'borde'},{texto:'Cancelar',valor:null,clase:'secundario'}]});
  function guardar(v){if(APP.sesion!==s||scope()!==k)return false;configurar(UI.$('#mip-modo',v).value,UI.$('#mip-vol',v).value);return true;}
  if(APP.sesion!==s||scope()!==k)return;if(r==='prueba'){sonar('pedido',0,true);return ajustes();}if(r==='notif'){await UI.pedirNotificaciones();return ajustes();}
 }
 function init(){var b=document.getElementById('mip-avisos');if(b)b.addEventListener('click',abrir);}
 document.addEventListener('DOMContentLoaded',init);g.addEventListener('app:sesion-terminada',reset);
 g.MIP_AVISOS={registrar:registrar,entregas:entregas,pendientesAtrasados:pendientesAtrasados,sync:sync,reset:reset,ajustes:ajustes,modo:modo,configurar:configurar,estado:function(){sync();return lista.map(function(x){return Object.assign({},x);});}};
})(window);
