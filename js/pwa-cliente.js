(function(){if(!/\/pedir\.html$/.test(window.location.pathname)){(function(){var prompt;var b=document.getElementById('instalar-pwa');if(!b)return;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();prompt=e;b.hidden=false;});b.addEventListener('click',async function(){if(prompt){await prompt.prompt();await prompt.userChoice;prompt=null;b.hidden=true;}else{alert('En Safari: Compartir > Añadir a pantalla de inicio. En Chrome: menú > Instalar aplicación.');}});if(!window.matchMedia('(display-mode: standalone)').matches&&!navigator.standalone)b.hidden=false;window.addEventListener('appinstalled',function(){b.hidden=true;});})();;return;}var b=document.getElementById('instalar-pwa');if(!b)return;var pending=null,installed=false,mode=window.matchMedia('(display-mode: standalone)'),ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(/Mac/.test(navigator.platform||'')&&navigator.maxTouchPoints>1);function standalone(){return installed||mode.matches||navigator.standalone===true;}function refresh(){b.hidden=standalone()||(!pending&&!ios);b.style.display=b.hidden?'none':'';}window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();if(!standalone())pending=e;refresh();});window.addEventListener('appinstalled',function(){installed=true;pending=null;refresh();});if(mode.addEventListener)mode.addEventListener('change',refresh);b.addEventListener('click',async function(){if(standalone())return refresh();if(pending){var p=pending;pending=null;try{await p.prompt();var choice=await p.userChoice;if(choice.outcome==='accepted')installed=true;}catch(e){console.warn('Instalación',e);}refresh();}else if(ios){await window.UI.ventana({titulo:'Instalar MiPedido en iPhone',texto:'Abre esta página en Safari. Pulsa Compartir, selecciona Añadir a pantalla de inicio y confirma Añadir. Abre MiPedido desde su nuevo icono.',botones:[{texto:'Entendido',valor:true}]});}});refresh();})();
(function(){
  'use strict';
  var revision='auto2', v=document.getElementById('pwa-version'), b=document.getElementById('pwa-actualizar'), s=document.getElementById('pwa-estado');
  if(!b){var panel=document.createElement('div');panel.id='pwa-panel';panel.style.cssText='padding:12px;text-align:center;font-size:12px';panel.innerHTML='<small id="pwa-version"></small> · <button type="button" class="enlace" id="pwa-actualizar">Buscar actualización</button><p id="pwa-estado" role="status"></p>';document.body.appendChild(panel);v=panel.querySelector('#pwa-version');b=panel.querySelector('#pwa-actualizar');s=panel.querySelector('#pwa-estado');}
  v.textContent='Versión '+(window.APP_CONFIG||{}).versionPantalla+' · '+revision;
  if(!('serviceWorker' in navigator)){b.hidden=true;return;}
  /* 3.1.49: el texto de versión no queda tapado por el menú fijo y, si hay una versión nueva, se avisa arriba. */
  var barra=null;
  function ubicar(){
    var panel=document.getElementById('pwa-panel'), nav=document.getElementById('navegacion'), cab=document.querySelector('.cabecera');
    if(panel)panel.style.paddingBottom=((nav && window.innerWidth<900)?nav.offsetHeight+16:12)+'px';
  }
  function mostrarAviso(){
    var cab=document.querySelector('.cabecera');
    if(barra || !cab)return;
    /* Va dentro del encabezado fijo: se ve siempre, sin calcular posiciones. */
    barra=document.createElement('div');barra.id='pwa-nueva';barra.setAttribute('role','status');
    barra.style.cssText='flex:0 0 100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 6px 6px 14px;border-radius:14px;background:#992b00;color:#fff;font-size:14px;font-weight:700;line-height:1.2';
    var t=document.createElement('span');t.textContent='Hay una versión nueva.';
    var bt=document.createElement('button');bt.type='button';bt.textContent='Actualizar';
    bt.style.cssText='min-height:36px;border:0;border-radius:999px;padding:0 14px;background:#fff;color:#992b00;font-weight:700;cursor:pointer';
    bt.addEventListener('click',function(){b.click();});
    barra.appendChild(t);barra.appendChild(bt);cab.style.flexWrap='wrap';cab.appendChild(barra);
  }
  ubicar();window.addEventListener('resize',ubicar);
  var pendiente=false, recargando=false, comprobando=false, registro=null, ultimoUso=Date.now(), sucioEl=null, controlador=navigator.serviceWorker.controller;
  /* 3.1.49: «tiene cambios sin guardar» solo mientras ese formulario siga en pantalla; el formulario de ingreso nunca cuenta. */
  function sucio(){if(sucioEl && !sucioEl.isConnected)sucioEl=null;return !!sucioEl;}
  function segura(){if(document.hidden || document.querySelector('.velo,[aria-busy="true"],form :focus,input:focus,textarea:focus,select:focus') || sucio() || (window.DATOS && window.DATOS.ocupado && window.DATOS.ocupado()))return false;return !window.MIPEDIDO_ACTUALIZACION_SEGURA || window.MIPEDIDO_ACTUALIZACION_SEGURA();}
  document.addEventListener('input',function(e){ultimoUso=Date.now();var f=e.target.closest('form');if(f && !f.closest('#form-ingreso') && f.id!=='form-ingreso' && !window.MIPEDIDO_ACTUALIZACION_SEGURA)sucioEl=f;});
  document.addEventListener('click',function(){ultimoUso=Date.now();});
  function aplicar(manual){if(!pendiente||recargando)return;if(!segura() || (!manual && Date.now()-ultimoUso<3000)){s.textContent='Actualización preparada. Se aplicará cuando termines tu operación.';return;}recargando=true;location.reload();}
  navigator.serviceWorker.addEventListener('controllerchange',function(){var nuevo=navigator.serviceWorker.controller;if(controlador && nuevo!==controlador){pendiente=true;b.textContent='Aplicar actualización';s.textContent='Nueva versión preparada.';mostrarAviso();}controlador=nuevo;aplicar(false);});
  async function comprobar(manual){if(comprobando||!registro)return;comprobando=true;try{await registro.update();if(manual&&!pendiente)s.textContent=registro.installing?'Descargando actualización…':'Sin actualización detectada.';}catch(e){if(manual)s.textContent='No se pudo comprobar. Intenta de nuevo con conexión.';}finally{comprobando=false;}}
  b.addEventListener('click',async function(){if(pendiente){if(sucio() && !document.querySelector('.velo,[aria-busy="true"]') && !(window.DATOS&&window.DATOS.ocupado&&window.DATOS.ocupado())){if(await window.UI.confirmar('Actualizar','Confirma que ya guardaste tus cambios.','Ya guardé'))sucioEl=null;}aplicar(true);}else await comprobar(true);});
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(function(r){registro=r;comprobar(false);}).catch(function(){s.textContent='Actualización automática no disponible en este navegador.';});
  document.addEventListener('visibilitychange',function(){if(!document.hidden){comprobar(false);aplicar(false);}});
  window.addEventListener('pageshow',function(){comprobar(false);aplicar(false);});
  window.addEventListener('online',function(){comprobar(false);aplicar(false);});
  /* 3.1.49: la app instalada (sobre todo en iPhone) queda dormida y no siempre dispara visibilitychange: también al recuperar el foco. */
  window.addEventListener('focus',function(){comprobar(false);aplicar(false);});
  setInterval(function(){aplicar(false);},3000);
  setInterval(function(){if(!document.hidden)comprobar(false);},60000);
})();
