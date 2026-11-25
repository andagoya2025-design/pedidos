/* Navegador real, datos ficticios. Sin red ni escrituras en el sistema. */
const assert=require('node:assert/strict'),fs=require('node:fs');const {chromium,webkit,devices}=require('playwright');
const read=p=>fs.readFileSync(p,'utf8');
const menu={config:{iva_porcentaje:15,precios_incluyen_iva:'SI'},categorias:[{id:'c',nombre:'Almuerzos'}],platos:[{id:'p1',local_id:'L',categoria_id:'c',nombre:'Caldo',precio:3,extras:[]},{id:'p2',local_id:'L',categoria_id:'c',nombre:'Cola',precio:1.25,extras:[]},{id:'p3',local_id:'L',categoria_id:'c',nombre:'Seco',precio:4,extras:[{nombre:'Chifle',precio:.5,max_cantidad:10}]}]};
const original=[{id:'d1',plato_id:'p1',nombre:'Caldo',precio:3,cantidad:2,extras:'',total_linea:6},{id:'d2',plato_id:'p2',nombre:'Cola',precio:1.25,cantidad:1,extras:'',total_linea:1.25}];
const pedido={numero:'PED-0002',seguimiento:'b',estado:'Recibido',total:10.75,pago_verificado:false,importes:{subtotal:7.25,envio:3,propina:.5,descuento:0,iva:1.34,total:10.75}};
const politica={numero:pedido.numero,estado:'Recibido',local_id:'L',total:pedido.total,detalle:original};
async function run(engine,device,label){
const browser=await engine.launch({headless:true});try{const page=await browser.newPage(device),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><main id="pedir-cuerpo"><div data-exito-vigente>¡Pedido recibido! <button id="btn-wa">Pagar</button></div></main><section id="seguimiento"></section><button id="btn-mi-pedido"></button>');
await page.addStyleTag({content:read('css/app.css')});await page.addStyleTag({content:read('css/modulos.css')});await page.addScriptTag({content:read('js/ui.js')});await page.addScriptTag({content:read('js/comun.js')});
await page.evaluate(({menu,politica,pedido})=>{window.demo={menu,politica,pedido};window.memoriaPrueba={};window.APP_MEMORIA={leer:k=>JSON.parse(JSON.stringify(memoriaPrueba[k]??null)),guardar:(k,v)=>{memoriaPrueba[k]=JSON.parse(JSON.stringify(v));}};window.DATOS={ocupado:()=>false,crearVigiaSync:()=>async()=>false,pedir:async a=>{if(a==='menuPublico')return demo.menu;throw Error('Escritura o consulta inesperada: '+a)}};}, {menu,politica,pedido});
let source=read('js/pedir.js');const start=source.indexOf("  document.addEventListener('DOMContentLoaded', function () {");assert.ok(start>0);
source=source.slice(0,start)+`  M=demo.menu;
global.prueba={editorCambio:editorCambio,recibo:function(ref,lista,res,sols){paso=4;exitoVigente=ref;actualizarExitoVigente(lista,res,sols);},preparar:function(ref){paso=4;exitoVigente=ref;},consultar:consultarSeguimiento,refrescar:refrescarSeguimiento};
})(window);`;
await page.addScriptTag({content:source});
await page.evaluate(()=>{window.pruebaAvisos=[];window.pruebaError=null;const aviso=UI.aviso;UI.aviso=function(texto,tipo){if(tipo==='error')pruebaAvisos.push(String(texto));return aviso.apply(this,arguments);};});
async function revisar(tipo,fase){
 const titulo=tipo==='cancelar'?/Revisar cancelación/:/Revisar modificación/;
 const anterior=await page.evaluate(()=>pruebaAvisos.length);
 await page.getByRole('button',{name:'Revisar solicitud',exact:true}).click();
 try{await page.waitForFunction(({titulo,anterior})=>Array.from(document.querySelectorAll('.ventana h2')).some(h=>h.textContent.includes(titulo))||pruebaAvisos.length>anterior||pruebaError!==null,{titulo:tipo==='cancelar'?'Revisar cancelación':'Revisar modificación',anterior},{timeout:10000});
 const diag=await page.evaluate(()=>({error:pruebaError,avisos:pruebaAvisos,titulos:Array.from(document.querySelectorAll('.ventana h2'),h=>h.textContent),campos:Array.from(document.querySelectorAll('[data-ux-cant],[data-ux-extra],#ux-nota'),el=>({id:el.getAttribute('data-ux-cant')||el.getAttribute('data-ux-extra')||el.id,valor:el.value,max:el.max}))}));
 assert.equal(diag.error,null,JSON.stringify(diag));assert.equal(diag.avisos.length,anterior,JSON.stringify(diag));await page.getByRole('heading',{name:titulo}).waitFor({timeout:3000});
 }catch(e){throw Error(label+' · '+tipo+' · '+fase+' · '+e.message+' · '+JSON.stringify(await page.evaluate(()=>({error:pruebaError,avisos:pruebaAvisos,titulos:Array.from(document.querySelectorAll('.ventana h2'),h=>h.textContent),campos:Array.from(document.querySelectorAll('[data-ux-cant],[data-ux-extra],#ux-nota'),el=>({id:el.getAttribute('data-ux-cant')||el.getAttribute('data-ux-extra')||el.id,valor:el.value,max:el.max}))})))+' · errores JS: '+JSON.stringify(errors));}
}
// UI.ventana establece el foco inicial con un temporizador. Esperar el foco real
// evita que el llenado sintético del textarea termine escribiendo en el buscador.
async function editorListo(){await page.locator('#ux-nota').waitFor({state:'visible'});await page.waitForFunction(()=>{const v=document.querySelector('.ventana');return v&&document.activeElement===v.querySelector('input, select, textarea');});}
for(const [tipo,campos,total] of [['agregar',[['n2','1']],15.75],['aumentar',[['o0','1']],13.75],['cambiar',[['o1','1'],['n2','1']],14.5],['quitar',[['o1','1']],9.5],['reducir',[['o0','1']],7.75],['cancelar',[],null]]){
console.log('CASO '+label+' · '+tipo);await page.evaluate(tipo=>{window.resultado=null;window.pruebaError=null;prueba.editorCambio(tipo,demo.politica,demo.pedido).then(x=>window.resultado=x).catch(e=>window.pruebaError=String(e.stack||e))},tipo);
await editorListo();await page.locator('#ux-nota').fill('Prueba de modificación');assert.equal(await page.locator('#ux-nota').inputValue(),'Prueba de modificación');
const buscar=page.locator('[data-ux-buscar]');if(await buscar.count())assert.equal(await buscar.inputValue(),'');
for(const [key,n] of campos){const campo=page.locator('[data-ux-cant="'+key+'"]');try{await campo.fill(n,{timeout:5000});assert.equal(await campo.inputValue(),n);}catch(e){throw Error(label+' · '+tipo+' · '+key+' · '+e.message+' · '+JSON.stringify(await page.evaluate(()=>({busqueda:document.querySelector('[data-ux-buscar]')?.value,nota:document.querySelector('#ux-nota')?.value,filas:Array.from(document.querySelectorAll('.ux-cambio-fila'),f=>({nombre:f.getAttribute('data-busqueda'),oculta:f.hidden})),activo:document.activeElement?.outerHTML.slice(0,220)}))));}}
const tieneExtra=tipo==='agregar'||tipo==='cambiar';if(tieneExtra){const extra=page.locator('[data-ux-extra="2-0"]');await extra.fill('2');assert.equal(await extra.inputValue(),'2');}
if(tipo==='agregar'){assert.equal(await page.locator('.ux-cambio-mini img').count(),3);}
await revisar(tipo,'primera revisión');
if(total!==null)assert.match(await page.locator('.ventana .ux-total-nuevo').innerText(),new RegExp(total.toFixed(2).replace('.','[,.]')));
else assert.match(await page.locator('.ventana').innerText(),/cancelar el pedido completo/);
await page.getByRole('button',{name:'Volver a editar',exact:true}).click();await editorListo();
assert.equal(await page.locator('#ux-nota').inputValue(),'Prueba de modificación');for(const [key,n] of campos)assert.equal(await page.locator('[data-ux-cant="'+key+'"]').inputValue(),n);if(tieneExtra)assert.equal(await page.locator('[data-ux-extra="2-0"]').inputValue(),'2');
await revisar(tipo,'revisión restaurada');
await page.getByRole('button',{name:tipo==='cancelar'?'Enviar solicitud de cancelación':'Enviar solicitud',exact:true}).click();await page.waitForFunction(()=>resultado!==null);
assert.ok(await page.evaluate(()=>resultado.texto.length>=5));if(tieneExtra)assert.equal(await page.evaluate(tipo=>{const xs=tipo==='agregar'?resultado.items:resultado.seleccion.agregar;return xs[0].extras.filter(e=>e==='Chifle').length},tipo),2);
}
await page.evaluate(()=>{const a={n:'PED-0001',s:'a'},b={n:'PED-0002',s:'b'};prueba.recibo({identidad:'s:b',numero:b.n,total:7.75},[a,b],{[a.n]:{numero:a.n,seguimiento:'a',estado:'Recibido',total:8},[b.n]:{numero:b.n,seguimiento:'b',estado:'Anulado',total:7.75,pago_verificado:false}},{});});
assert.match(await page.locator('#pedir-cuerpo').innerText(),/Pedido cancelado/);assert.match(await page.locator('#pedir-cuerpo').innerText(),/PED-0002/);assert.equal(await page.locator('#btn-wa').count(),0);assert.doesNotMatch(await page.locator('#pedir-cuerpo').innerText(),/PED-0001/);
// Reproducir el flujo real: la respuesta de seguimiento llega cuando un modal
// se abre, el historial se guarda y el render general debe detenerse.
await page.evaluate(async()=>{
 const a={n:'PED-0001',s:'a',e:'Recibido',t:8,f:Date.now()},b={n:'PED-0003',s:'c',e:'Recibido',t:8,f:Date.now()};
 memoriaPrueba.mis_pedidos=[a,b];
 const preparar=()=>{document.querySelector('#pedir-cuerpo').innerHTML='<div data-exito-vigente>¡Pedido recibido! <div class="pago-qr">Banco de prueba</div><button id="btn-wa">Pagar</button></div>';prueba.preparar({identidad:'s:c',numero:b.n,total:8});};
 preparar();
 DATOS.pedir=async(accion,args)=>{
   if(accion==='pedidosSeguir'){const modal=document.createElement('div');modal.className='velo';modal.id='interrupcion-prueba';document.body.appendChild(modal);return {pedidos:[{numero:a.n,seguimiento:'a',estado:'Recibido',total:8},{numero:b.n,seguimiento:'c',estado:'Anulado',total:8,pago_verificado:false}]};}
   if(accion==='pedidoCambiosConsultar'){if(!document.querySelector('#pedir-cuerpo').textContent.includes('Pedido cancelado'))throw Error('El recibo no se cerró antes de consultar solicitudes');return {numero:a.n,solicitudes:[]};}
   throw Error('Consulta o escritura inesperada: '+accion);
 };
 window.resultadoInterrupcion=await prueba.consultar(false,true);
 document.querySelector('#interrupcion-prueba').remove();
});
assert.equal(await page.evaluate(()=>resultadoInterrupcion),false);
assert.match(await page.locator('#pedir-cuerpo').innerText(),/Pedido cancelado/);assert.match(await page.locator('#pedir-cuerpo').innerText(),/PED-0003/);assert.equal(await page.locator('#btn-wa,.pago-qr').count(),0);
assert.equal(await page.evaluate(()=>memoriaPrueba.mis_pedidos.find(x=>x.n==='PED-0001').e),'Recibido');assert.equal(await page.evaluate(()=>memoriaPrueba.mis_pedidos.find(x=>x.n==='PED-0003').e),'Anulado');
// También reparar un recibo antiguo si todos los pedidos ya son históricos.
await page.evaluate(()=>{memoriaPrueba.mis_pedidos=memoriaPrueba.mis_pedidos.filter(x=>x.n==='PED-0003');document.querySelector('#pedir-cuerpo').innerHTML='<div data-exito-vigente>¡Pedido recibido! <button id="btn-wa">Pagar</button></div>';prueba.preparar({identidad:'s:c',numero:'PED-0003',total:8});prueba.refrescar();});
assert.match(await page.locator('#pedir-cuerpo').innerText(),/Pedido cancelado/);assert.equal(await page.locator('#btn-wa').count(),0);
// Pago verificado, desconexión y reconexión con tres pedidos aislados.
await page.evaluate(async()=>{
 const a={n:'PED-0001',s:'a',e:'Recibido',t:8,f:Date.now()},b={n:'PED-0004',s:'d',e:'Recibido',t:11,f:Date.now()},c={n:'PED-0005',s:'e',e:'Recibido',t:6,f:Date.now()};
 memoriaPrueba.mis_pedidos=[a,b,c];
 document.querySelector('#pedir-cuerpo').innerHTML='<div data-exito-vigente>¡Pedido recibido! <div class="pago-qr">Banco</div><button id="btn-wa">Pagar</button></div>';prueba.preparar({identidad:'s:d',numero:b.n,total:11});
 DATOS.pedir=async()=>{throw Error('sin red');};await prueba.consultar(false,true);
 window.sinFalsaAnulacion=document.querySelector('#pedir-cuerpo').textContent.includes('Pedido recibido');
 DATOS.pedir=async(accion,args)=>{if(accion==='pedidosSeguir')return {pedidos:[{numero:a.n,seguimiento:a.s,estado:'Recibido',total:8},{numero:b.n,seguimiento:b.s,estado:'Anulado',total:11,pago_verificado:true},{numero:c.n,seguimiento:c.s,estado:'Recibido',total:6}]};if(accion==='pedidoCambiosConsultar')return {numero:args.s==='a'?a.n:c.n,solicitudes:[]};throw Error('Consulta inesperada '+accion);};
 await prueba.consultar(false,true);
});
assert.equal(await page.evaluate(()=>sinFalsaAnulacion),true);assert.match(await page.locator('#pedir-cuerpo').innerText(),/Pedido cancelado/);assert.match(await page.locator('#pedir-cuerpo').innerText(),/devolución/);assert.equal(await page.locator('#btn-wa,.pago-qr').count(),0);
assert.deepEqual(await page.evaluate(()=>memoriaPrueba.mis_pedidos.map(x=>[x.n,x.e,x.t]).sort()),[['PED-0001','Recibido',8],['PED-0004','Anulado',11],['PED-0005','Recibido',6]]);
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));assert.deepEqual(errors,[]);console.log('PASS '+label+': seis revisiones, restauración, cancelación, modal, desconexión, pago verificado y tres pedidos; red bloqueada');
}finally{await browser.close()}}
(async()=>{await run(webkit,devices['iPhone SE'],'iPhone SE');await run(chromium,{viewport:{width:360,height:740},isMobile:true,hasTouch:true},'Android compacto');await run(chromium,{viewport:{width:1366,height:768}},'Escritorio')})().catch(e=>{console.error(e);process.exitCode=1});
