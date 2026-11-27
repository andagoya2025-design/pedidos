'use strict';
// Monitoreo real con datos ficticios. Red externa bloqueada.
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium,webkit,devices}=require('playwright');
const read=p=>fs.readFileSync(p,'utf8');
const ahora='2026-11-27T18:00:00.000Z',fecha='2026-11-27T17:59:30.000Z';
const pedido=(id,estado,gps_estado)=>({id,numero:'PED-'+id,cliente:'Cliente '+id,estado,gps_estado,gps_fecha:gps_estado==='confirmado'?fecha:'',en_camino:estado==='En camino'?fecha:'',hora_estimada:''});
const moto=(id,pedidos,estado='en_camino')=>({id,nombre:'Motorizado '+id,placa:'DEMO',celular:'0990000000',estado,pedidos,turno_inicio:fecha,hoy:{entregas:0,minutos:null,estrellas:null},debe:0,alertas:[],ultimo_punto:estado==='en_camino'?{lat:-2.1,lng:-79.9,fecha}:null});
const L1={ahora,alertas:0,motorizados:[moto('A',[pedido('01','En camino','confirmado'),pedido('02','En camino','sin_senal')]),moto('B',[pedido('03','Preparando','pendiente')],'asignado'),moto('C',[pedido('04','En camino','esperando')])]},L2={ahora,alertas:0,motorizados:[moto('SUR',[pedido('99','En camino','confirmado')])]};
async function run(engine,device,label){
 const browser=await engine.launch();try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url()==='https://demo.invalid/monitoreo'?r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="contenido"></main></body></html>'}):r.abort());
  await page.goto('https://demo.invalid/monitoreo');
  for(const p of ['css/app.css','css/modulos.css','css/admin-elite.css','css/premium-integral.css'])await page.addStyleTag({content:read(p)});
  await page.addScriptTag({content:read('js/ui.js')});await page.addScriptTag({content:read('js/comun.js')});
  await page.evaluate(({L1,L2})=>{
   window.APP={local:'L1',sesion:{rol:'dueno'},vistas:{}};window.__calls=[];window.__defer=false;window.__error=false;
   window.DATOS={pedir:async(a,d)=>{__calls.push([a,d]);if(a==='monitoreoSeguro'){if(__error)throw Object.assign(Error('Acción no reconocida'),{codigo:'ACCION'});if(__defer&&d.local_id==='L1')return new Promise(r=>window.__resolver=()=>r(L1));return d.local_id==='L1'?L1:L2;}if(a==='rutaPedido')return {puntos:[{lat:-2.1,lng:-79.9,fecha:'2026-11-27T17:59:00Z'},{lat:-2.11,lng:-79.91,fecha:'2026-11-27T18:00:00Z'}]};throw Error('No simulado') }};
   UI.ventana=o=>{window.__ventana=o;};UI.abrirWhatsApp=(n,m)=>{window.__wa=[n,m]};UI.error=(t,m)=>{throw Error(t+': '+m)};
  },{L1,L2});
  await page.addScriptTag({content:read('js/monitoreo.js')});
  const pintar=()=>page.evaluate(()=>APP.vistas.monitoreo.pintar(document.getElementById('contenido')));
  await pintar();await page.getByText('GPS confirmado',{exact:true}).waitFor();
  for(const t of ['Señal interrumpida','Esperando salida','Esperando señal GPS'])assert.equal(await page.getByText(t,{exact:true}).count(),1);
  assert.equal(await page.locator('#mn-cuerpo .monitor').count(),3);assert.equal(await page.locator('.monitor-resumen>div').count(),4);
  for(const tema of ['claro','oscuro']){await page.evaluate(t=>UI.tema(t),tema);assert.ok(await page.locator('#mn-cuerpo .btn').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().height>=44)));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));fs.mkdirSync('capturas-monitoreo',{recursive:true});await page.screenshot({path:'capturas-monitoreo/'+label+'-'+tema+'.png',fullPage:true});}
  await page.locator('[data-ruta="01"]').click();await page.waitForFunction(()=>window.__ventana);assert.match(await page.evaluate(()=>__ventana.html),/polyline/);
  await page.locator('[data-wa]').first().click();assert.equal(await page.evaluate(()=>__wa[0]),'0990000000');
  await page.evaluate(()=>{__defer=true});await page.locator('[data-actualizar]').click();await page.waitForFunction(()=>window.__resolver);
  await page.evaluate(()=>{APP.local='L2'});await pintar();await page.getByText('PED-99',{exact:true}).waitFor();
  await page.evaluate(()=>{__resolver()});await page.waitForTimeout(150);assert.equal(await page.getByText('PED-01',{exact:true}).count(),0);
  await page.evaluate(()=>{__error=true});await pintar();await page.getByText(/necesita el servidor 3.1.31/).waitFor();assert.ok(await page.evaluate(()=>__calls.every(c=>c[0]!=='monitoreo')));assert.deepEqual(errors,[]);
  console.log('MONITOREO '+label+' OK');
 }finally{await browser.close()}
}
(async()=>{for(const [e,d,l] of [[webkit,devices['iPhone SE'],'iphone-se'],[webkit,devices['iPhone 13'],'iphone-13'],[chromium,{viewport:{width:360,height:740},isMobile:true,hasTouch:true},'android'],[chromium,{viewport:{width:1366,height:768}},'escritorio']])await run(e,d,l)})().catch(e=>{console.error(e);process.exitCode=1});
