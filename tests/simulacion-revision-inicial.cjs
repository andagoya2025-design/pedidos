'use strict';
// Prototipo descartable: no cambia js/pedir.js en disco, servidor ni datos reales.
const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{chromium,webkit,devices}=require('playwright');
const read=p=>fs.readFileSync(p,'utf8'),base='2f67aec5503a66d95d8f8352d3d06b5c2c0fc45d';
for(const p of ['js/pedir.js','js/ui.js','js/app.js','js/datos.js','js/motorizados.js','js/pedidos.js','js/voz.js','js/notificaciones.js','js/avisos-cliente.js','servidor/Codigo.gs','css/premium-integral.css','sw.js','js/config.js'])assert.equal(read(p),execFileSync('git',['show',base+':'+p],{encoding:'utf8'}),p);
const source=read('js/pedir.js');
const gs=read('servidor/Codigo.gs');
function extract(s,n){let i=s.indexOf('function '+n+'('),j=s.indexOf('\nfunction ',i+1);assert.ok(i>=0&&j>i,n);return s.slice(i,j)}
const fn=new Function('limpiarTexto_','claveComparar_','fallo_', ['numero_','siNo_','redondear_','maxExtra_','validarExtrasPedido_','leerExtras_','cotizarLineasCreacion_','importesCreacion_'].map(n=>extract(gs,n)).join('\n')+';return {cotizarLineasCreacion_,importesCreacion_}')((v,n)=>String(v||'').slice(0,n),v=>String(v).trim().toLowerCase(),(m,c)=>Object.assign(Error(m),{codigo:c}));
function fixture(n,mode='SI'){
 const platos=Array.from({length:n},(_,i)=>({id:'p'+i,nombre:'Plato ficticio '+i,categoria_id:'C',local_id:'L',precio:3+(i%7)*.5,activo:true,agotado:false,extras:i%2?[{nombre:'Aguacate',precio:.75,max_cantidad:10},{nombre:'Chifle',precio:.5,max_cantidad:10}]:[],foto_url:''}));
 const items=platos.map((p,i)=>({plato_id:p.id,cantidad:i%3+1,extras:p.extras.length?['Aguacate','Aguacate','Chifle']:[]}));
 const menu={config:{iva_porcentaje:15,precios_incluyen_iva:mode},locales:[{id:'L',nombre:'Local de prueba'}],categorias:[{id:'C',nombre:'Almuerzos'}],zonas:[{id:'Z',local_id:'L',costo:3}],platos};
 const cot=fn.cotizarLineasCreacion_(items,Object.fromEntries(platos.map(p=>[p.id,{...p,extras_json:JSON.stringify(p.extras)}])),'L',{});
 const q={...fn.importesCreacion_(cot.subtotal,3,0,0,.5,menu.config),subtotal:cot.subtotal,envio:3,descuento:0,premio:0,propina:.5,detalle:cot.detalleFilas};q.firma=JSON.stringify([q.detalle,q.subtotal,q.envio,q.descuento,q.premio,q.propina,q.iva,q.total]);
 return {menu,items,q};
}
const prototype=String.raw`
  async function revisarPrototipo(q,datos,localItems,cambioDetalle,importeMostrado){
    var inicio=performance.now(),cent=n=>Math.round(Number(n)*100),mon=n=>UI.esc(UI.dinero(n)),esc=UI.esc;
    var map=new Map(localItems.map(it=>[claveItem(it.plato,it.extras),it]));
    var fotos=new Set(),lineas=q.detalle.map(function(d){
      var ex=String(d.extras||'').split(',').map(x=>x.trim()).filter(Boolean),it=map.get(JSON.stringify([String(d.plato_id),ex.slice().sort()]));
      var exacto=it&&it.cantidad===Number(d.cantidad)&&cent(unitario(it))===cent(d.precio);
      var foto='';if(fotos.size<6&&!fotos.has(d.plato_id)){fotos.add(d.plato_id);foto='<canvas width="48" height="48" data-foto-id="'+esc(d.plato_id)+'" hidden aria-hidden="true"></canvas>';}
      var det=exacto?'<div class="ux-resumen-item"><span>'+esc(d.cantidad+' × '+UI.dinero(it.plato.precio))+'</span><b>'+mon(cent(it.plato.precio)*d.cantidad/100)+'</b></div>'+desgloseExtrasPreenvio(it):'<small>'+esc(d.cantidad+' × '+UI.dinero(d.precio))+(ex.length?' · '+esc(resumenExtrasCantidad(ex)):'')+'</small>';
      return '<section class="ux-comparacion-grupo" data-sim-linea><div class="ux-resumen-item"><span>'+foto+'<b>'+esc(d.nombre)+'</b></span><b>'+mon(d.total_linea)+'</b></div>'+det+'</section>';
    }).join('');
    var importe=(t,n)=>'<div class="ux-resumen-item"><span>'+esc(t)+'</span><b>'+mon(n)+'</b></div>';
    var html='<div class="ux-total-nuevo" data-sim-total><small>Total a pagar</small><strong>'+mon(q.total)+'</strong></div>'+
      (cambioDetalle||cent(q.total)!==cent(importeMostrado)?'<p>El restaurante actualizó el importe. Revisa el total antes de enviar.</p>':'')+
      '<h3>Tu selección</h3>'+lineas+'<h3>Detalle económico</h3>'+importe('Subtotal productos',q.subtotal)+importe('Envío',q.envio)+importe('Propina',q.propina)+importe('Descuento',q.descuento)+importe('Premio',q.premio)+importe(cfg().precios_incluyen_iva==='NO'?'IVA':'IVA incluido (informativo)',q.iva)+importe('Total',q.total)+
      '<div class="ux-mensaje-propuesta">'+esc(datos.tipo_entrega)+' · '+esc(datos.forma_pago)+' · '+esc(datos.cuenta_pago)+'<br>'+esc(datos.cliente.direccion)+'<br>Condiciones aceptadas</div>';
    return UI.ventana({titulo:'Revisa tu pedido',html:html,botones:[{texto:'Volver a editar',valor:false,clase:'secundario'},{texto:'Confirmar y enviar',valor:true}],alAbrir:function(v){
      v.querySelector('.ventana').classList.add('ux-gestion-modal','ux-revision-cliente','sim-revision');
      // Solo miniaturas ya descargadas y decodificadas; no se asigna src ni se llama a red.
      var existentes=new Map(Array.from(document.querySelectorAll('[data-sim-origen] img'),img=>[img.parentElement.dataset.simOrigen,img]));
      v.querySelectorAll('canvas[data-foto-id]').forEach(function(c){var img=existentes.get(c.dataset.fotoId);if(img&&img.complete&&img.naturalWidth){try{c.getContext('2d').drawImage(img,0,0,48,48);c.hidden=false;}catch(e){}}});
      window.__renderSync=performance.now()-inicio;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{window.__renderFrame=performance.now()-inicio;}));
    }});
  }
`;
let start=source.indexOf('        if(cambioDetalle||Math.round(q.total*100)!==Math.round(importeMostrado*100)){'),end=source.indexOf('        datos.total_esperado=q.total;',start);assert.ok(start>0&&end>start);
let patched=source.slice(0,start)+'        if(!(await revisarPrototipo(q,datos,localItems,cambioDetalle,importeMostrado)))return;\n'+source.slice(end);
let boot=patched.indexOf("  document.addEventListener('DOMContentLoaded', function () {");assert.ok(boot>0);
patched=patched.slice(0,boot)+prototype+String.raw`
  window.preparar=function(fix){
    M=fix.menu;localId='L';paso=3;carrito={};codigoEnvio='';envioPendiente=null;cotizacionEnCurso=false;checkoutMem={cliente:{nombre:'Cliente de prueba',telefono:'0990000000',direccion:'Dirección ficticia'}};
    entrega={tipo:'domicilio',zona:'Z',cuando:'ya'};pago={forma:'efectivo',propina:.5};ubic=null;cuponAplicado=null;
    fix.items.forEach(x=>{var p=plato(x.plato_id);carrito[claveItem(p,x.extras)]={plato:p,cantidad:x.cantidad,extras:x.extras};});
    document.querySelector('#pedir-cuerpo').innerHTML='<form id="form-pedido"><label><input id="pe-privacidad" type="checkbox" checked>Privacidad</label><label><input id="pe-politicas" type="checkbox" checked>Condiciones</label><input name="cupon" value=""><input name="notas" value="Nota ficticia"><button type="submit">Revisar</button></form>';
    document.querySelector('#form-pedido').addEventListener('submit',enviar);
    window.__renderFrame=0;window.__renderSync=0;
  };
  // El límite de esta simulación es la entrada al envío protegido; nada se escribe.
  procesarEnvio=async function(datos){window.__envios.push(JSON.parse(JSON.stringify(datos)));};
  window.cambiarDuranteRevision=function(){pago.propina=1;};
})(window);
`;
fs.mkdirSync('capturas-simulacion-revision',{recursive:true});
async function run(engine,device,label){
 const browser=await engine.launch();try{
 const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[],network=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>network.push(r.url()));
 await page.route('**/*',r=>r.abort());
 await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><body class="mip-premium-cliente"><main id="pedir-cuerpo"></main><div id="fotos"></div></body>');
 for(const p of ['css/app.css','css/modulos.css','css/premium-integral.css'])await page.addStyleTag({content:read(p)});
 await page.addStyleTag({content:'.sim-revision canvas{width:48px;height:48px;border-radius:8px;vertical-align:middle;margin-right:8px}.sim-revision .acciones{position:sticky;bottom:0;background:var(--superficie);padding:8px 0}.sim-revision .ux-total-nuevo strong{display:block;font-size:28px}'});
 await page.addScriptTag({content:read('js/ui.js')});await page.addScriptTag({content:read('js/comun.js')});
 await page.evaluate(()=>{window.__envios=[];window.__calls=[];window.__avisos=[];window.APP_MEMORIA={leer:()=>null,guardar:()=>{}};window.__quote=null;window.__delay=0;window.__fail=false;window.DATOS={crearVigiaSync:()=>async()=>false,pedir:async(a,d)=>{__calls.push({a,d});if(a!=='pedidoCotizar')throw Error('Consulta no autorizada '+a);if(__delay)await new Promise(r=>setTimeout(r,__delay));if(__fail)throw Error('Sin conexión');return __quote;}};UI.aviso=t=>__avisos.push(t);});
 await page.addScriptTag({content:patched});
 const stats=[];
 assert.throws(()=>fixture(61),/60 líneas/);
 for(const n of [1,5,10,35,60]){
  const fix=fixture(n,n===10?'NO':'SI');
  await page.evaluate(async fix=>{__quote=fix.q;__calls=[];__envios=[];__avisos=[];__delay=0;__fail=false;document.querySelector('#fotos').innerHTML=fix.items.slice(0,5).map(x=>'<span data-sim-origen="'+x.plato_id+'"><img width="48" height="48" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22%3E%3Crect width=%2248%22 height=%2248%22 fill=%22tan%22/%3E%3C/svg%3E"></span>').join('');await Promise.all(Array.from(document.querySelectorAll('#fotos img'),i=>i.decode()));document.querySelector('#fotos').hidden=true;preparar(fix);},fix);
  const before=network.length;
  await page.getByRole('button',{name:'Revisar',exact:true}).click();
  await page.getByRole('heading',{name:'Revisa tu pedido',exact:true}).waitFor();
  await page.waitForFunction(()=>__renderFrame>0);
  assert.equal(await page.locator('[data-sim-linea]').count(),n);
  assert.match(await page.locator('[data-sim-total]').innerText(),new RegExp(fix.q.total.toFixed(2).replace('.','[,.]')));
  assert.ok(await page.locator('.sim-revision canvas:visible').count()<=6);
  assert.equal(await page.locator('.sim-revision img').count(),0);
  assert.equal(network.length,before,'Solicitudes de red adicionales en el resumen');
  assert.deepEqual(await page.evaluate(()=>__calls.map(x=>x.a)),['pedidoCotizar']);
  assert.equal(await page.evaluate(()=>__envios.length),0);
  const v=await page.locator('.sim-revision').evaluate(e=>({sync:__renderSync,frame:__renderFrame,scroll:e.scrollWidth,width:e.clientWidth,dom:e.querySelectorAll('*').length,photos:e.querySelectorAll('canvas:not([hidden])').length}));
  assert.ok(v.scroll<=v.width+1,JSON.stringify(v));
  stats.push({n,...v,newRequests:network.length-before});
  if(n===5)await page.screenshot({path:'capturas-simulacion-revision/'+label+'.png'});
  await page.getByRole('button',{name:'Volver a editar',exact:true}).click();
  assert.equal(await page.evaluate(()=>__envios.length),0);
  assert.equal(await page.locator('#form-pedido [name=notas]').inputValue(),'Nota ficticia');
 }
 const fix=fixture(5);
 async function prep(opts={}){await page.evaluate(({fix,opts})=>{__quote=opts.q||fix.q;__calls=[];__envios=[];__avisos=[];__delay=opts.delay||0;__fail=!!opts.fail;preparar(fix);},{fix,opts});}
 async function open(){await page.getByRole('button',{name:'Revisar',exact:true}).click();await page.getByRole('heading',{name:'Revisa tu pedido',exact:true}).waitFor();}
 await prep({delay:200});await open();await page.evaluate(()=>document.querySelector('#form-pedido').dispatchEvent(new Event('submit',{cancelable:true})));assert.equal(await page.evaluate(()=>__calls.length),1);await page.getByRole('button',{name:'Confirmar y enviar',exact:true}).click();await page.waitForFunction(()=>__envios.length===1);assert.equal(await page.evaluate(()=>__envios[0].total_esperado),fix.q.total);assert.equal(await page.evaluate(()=>__envios[0].cotizacion_firma),fix.q.firma);
 await prep();await open();await page.evaluate(()=>cambiarDuranteRevision());await page.getByRole('button',{name:'Confirmar y enviar',exact:true}).click();await page.waitForFunction(()=>__avisos.length>0);assert.equal(await page.evaluate(()=>__envios.length),0);
 await prep({fail:true});await page.getByRole('button',{name:'Revisar',exact:true}).click();await page.waitForFunction(()=>__avisos.length>0);assert.equal(await page.evaluate(()=>__envios.length),0);assert.equal(await page.locator('.sim-revision').count(),0);
 await prep();await page.locator('#pe-politicas').uncheck();await page.getByRole('button',{name:'Revisar',exact:true}).click();assert.equal(await page.evaluate(()=>__calls.length),0);
 await prep({q:{...fix.q,total:fix.q.total+1,firma:'cotizacion-actualizada'}});await open();assert.match(await page.locator('.sim-revision').innerText(),/actualizó el importe/);await page.getByRole('button',{name:'Volver a editar',exact:true}).click();assert.equal(await page.evaluate(()=>__envios.length),0);
 assert.deepEqual(errors,[]);console.log('SIMULACION '+label+' '+JSON.stringify(stats)+'; regreso, confirmación, doble submit, cambio concurrente, error de red, condiciones y precio cambiado OK');
 }finally{await browser.close()}
}
(async()=>{for(const [e,d,l] of [[webkit,devices['iPhone SE'],'iphone-se'],[webkit,devices['iPhone 13'],'iphone-13'],[chromium,devices['Pixel 7'],'android'],[chromium,{viewport:{width:1366,height:768}},'escritorio']])await run(e,d,l)})().catch(e=>{console.error(e);process.exitCode=1});
