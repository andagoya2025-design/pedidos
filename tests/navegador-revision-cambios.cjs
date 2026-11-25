/* Navegador real, datos ficticios. Sin red ni escrituras en el sistema. */
const assert=require('node:assert/strict'),fs=require('node:fs');const {chromium,webkit,devices}=require('playwright');
const read=p=>fs.readFileSync(p,'utf8');
const menu={config:{iva_porcentaje:15,precios_incluyen_iva:'SI'},categorias:[{id:'c',nombre:'Almuerzos'}],platos:[{id:'p1',local_id:'L',categoria_id:'c',nombre:'Caldo',precio:3,extras:[]},{id:'p2',local_id:'L',categoria_id:'c',nombre:'Cola',precio:1.25,extras:[]},{id:'p3',local_id:'L',categoria_id:'c',nombre:'Seco',precio:4,extras:[{nombre:'Chifle',precio:.5,max_cantidad:10}]}]};
const original=[{id:'d1',plato_id:'p1',nombre:'Caldo',precio:3,cantidad:2,extras:'',total_linea:6},{id:'d2',plato_id:'p2',nombre:'Cola',precio:1.25,cantidad:1,extras:'',total_linea:1.25}];
const pedido={numero:'PED-0002',seguimiento:'b',estado:'Recibido',total:10.75,pago_verificado:false,importes:{subtotal:7.25,envio:3,propina:.5,descuento:0,iva:1.34,total:10.75}};
const politica={numero:pedido.numero,estado:'Recibido',local_id:'L',total:pedido.total,detalle:original};
async function run(engine,device,label){
const browser=await engine.launch({headless:true});try{const page=await browser.newPage(device),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><main id="pedir-cuerpo"><div data-exito-vigente>¡Pedido recibido! <button id="btn-wa">Pagar</button></div></main>');
await page.addStyleTag({content:read('css/app.css')});await page.addStyleTag({content:read('css/modulos.css')});await page.addScriptTag({content:read('js/ui.js')});await page.addScriptTag({content:read('js/comun.js')});
await page.evaluate(({menu,politica,pedido})=>{window.demo={menu,politica,pedido};window.APP_MEMORIA={leer:()=>null,guardar:()=>{}};window.DATOS={crearVigiaSync:()=>async()=>false,pedir:async a=>{if(a==='menuPublico')return demo.menu;throw Error('Escritura o consulta inesperada: '+a)}};}, {menu,politica,pedido});
let source=read('js/pedir.js');const start=source.indexOf("  document.addEventListener('DOMContentLoaded', function () {");assert.ok(start>0);
source=source.slice(0,start)+`  M=demo.menu;
global.prueba={editorCambio:editorCambio,recibo:function(ref,lista,res,sols){paso=4;exitoVigente=ref;actualizarExitoVigente(lista,res,sols);}};
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
for(const [tipo,campos,total] of [['agregar',[['n2','1']],14.75],['aumentar',[['o0','1']],13.75],['cambiar',[['o1','1'],['n2','1']],13.5],['quitar',[['o1','1']],9.5],['reducir',[['o0','1']],7.75],['cancelar',[],null]]){
console.log('CASO '+label+' · '+tipo);await page.evaluate(tipo=>{window.resultado=null;window.pruebaError=null;prueba.editorCambio(tipo,demo.politica,demo.pedido).then(x=>window.resultado=x).catch(e=>window.pruebaError=String(e.stack||e))},tipo);
await page.locator('#ux-nota').waitFor();await page.locator('#ux-nota').fill('Prueba de modificación');
for(const [key,n] of campos)await page.locator('[data-ux-cant="'+key+'"]').fill(n);
if(tipo==='agregar'){assert.equal(await page.locator('.ux-cambio-mini img').count(),3);}
await revisar(tipo,'primera revisión');
if(total!==null)assert.match(await page.locator('.ventana .ux-total-nuevo').innerText(),new RegExp(total.toFixed(2).replace('.','[,.]')));
else assert.match(await page.locator('.ventana').innerText(),/cancelar el pedido completo/);
await page.getByRole('button',{name:'Volver a editar',exact:true}).click();await page.locator('#ux-nota').waitFor();
assert.equal(await page.locator('#ux-nota').inputValue(),'Prueba de modificación');for(const [key,n] of campos)assert.equal(await page.locator('[data-ux-cant="'+key+'"]').inputValue(),n);
await revisar(tipo,'revisión restaurada');
await page.getByRole('button',{name:tipo==='cancelar'?'Enviar solicitud de cancelación':'Enviar solicitud',exact:true}).click();await page.waitForFunction(()=>resultado!==null);
assert.ok(await page.evaluate(()=>resultado.texto.length>=5));
}
await page.evaluate(()=>{const a={n:'PED-0001',s:'a'},b={n:'PED-0002',s:'b'};prueba.recibo({identidad:'s:b',numero:b.n,total:7.75},[a,b],{[a.n]:{numero:a.n,seguimiento:'a',estado:'Recibido',total:8},[b.n]:{numero:b.n,seguimiento:'b',estado:'Anulado',total:7.75,pago_verificado:false}},{});});
assert.match(await page.locator('#pedir-cuerpo').innerText(),/Pedido cancelado/);assert.match(await page.locator('#pedir-cuerpo').innerText(),/PED-0002/);assert.equal(await page.locator('#btn-wa').count(),0);assert.doesNotMatch(await page.locator('#pedir-cuerpo').innerText(),/PED-0001/);
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));assert.deepEqual(errors,[]);console.log('PASS '+label+': seis revisiones, restauración, cancelación e identidad de dos pedidos; red bloqueada');
}finally{await browser.close()}}
(async()=>{await run(webkit,devices['iPhone SE'],'iPhone SE');await run(chromium,{viewport:{width:360,height:740},isMobile:true,hasTouch:true},'Android compacto');await run(chromium,{viewport:{width:1366,height:768}},'Escritorio')})().catch(e=>{console.error(e);process.exitCode=1});
