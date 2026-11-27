'use strict';
// 3.1.51 — «Activar mi ubicación» del motorizado e inventario (formulario de insumos). Solo datos ficticios.
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium,webkit,devices}=require('playwright');
const read=p=>fs.readFileSync(p,'utf8');
const AHORA=new Date(2026,10,27,7,5,0).getTime();
const TITULOS=['Inicio','Pedidos','Menú','Motorizados','Caja','Monitoreo','Inventario','Reportes','Informe motos','Configuración','Mi cuenta'];
const pedido={id:'01',numero:'PED-0001',estado:'En camino',forma_pago:'transferencia',pago_verificado:true,total:7.5,cliente_nombre:'Cliente ficticio',direccion:'',lat:-0.18,lng:-78.48,ubicacion_fuente:'gps',detalle:[{cantidad:1,nombre:'Almuerzo'}]};
async function abrir(engine,device,{whatsapp,admin,modo}){
  const browser=await engine.launch();
  const page=await browser.newPage({...device,serviceWorkers:'block'});page.setDefaultTimeout(8000);const errores=[];page.on('pageerror',e=>errores.push(e.message));
  await page.addInitScript(({ahora,modo})=>{const R=Date;window.Date=class extends R{constructor(...a){a.length?super(...a):super(ahora)}static now(){return ahora}};
    window.__abiertos=[];window.open=u=>{window.__abiertos.push(u);return null};
    const ok=cb=>cb({coords:{latitude:-0.18,longitude:-78.48,accuracy:10},timestamp:ahora});
    window.__pos=0;window.__modo=modo;if(modo==='soporte'){Object.defineProperty(navigator,'geolocation',{value:undefined,configurable:true});}else Object.defineProperty(navigator,'geolocation',{value:{watchPosition(cb){setTimeout(()=>modo==='ok'&&ok(cb),30);return 1},clearWatch(){},getCurrentPosition(cb,er){window.__pos++;if(modo==='ok')ok(cb);else er({code:modo==='permiso'?1:2})}},configurable:true});},{ahora:AHORA,modo});
  let html=read('driver.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
  if(admin)html=html.replace('mip-premium-driver','mip-premium-admin');
  await page.route('**/*',r=>r.request().url()==='https://demo.invalid/driver.html'?r.fulfill({contentType:'text/html',body:html}):r.abort());
  await page.goto('https://demo.invalid/driver.html');
  for(const p of ['css/app.css','css/modulos.css','css/premium-integral.css'])await page.addStyleTag({content:read(p)});
  await page.addScriptTag({content:read('js/ui.js')});
  const marca={negocio_nombre:'Restaurante Demo',color_primario:'#1f1b16',color_acento:'#992b00',moneda:'USD',whatsapp};
  const data={turno:{inicio:new Date(2026,10,27,6,40).toISOString()},pedidos:[pedido],debe:{total:0,fondo:0,efectivo:0}};
  await page.addScriptTag({content:'window.__data='+JSON.stringify(data)+';window.__marca='+JSON.stringify(marca)+';window.APP_CONFIG={configurada:true};var mem={token:"ficticio"};window.APP_MEMORIA={leer:k=>mem[k],guardar:(k,v)=>mem[k]=v,limpiarSesion:()=>{mem={}}};window.DATOS={crearVigiaSync:()=>async()=>{},ocupado:()=>false,estado:async()=>({instalado:true,config:__marca,licencia:{}}),pedir:async a=>{if(a==="sesion")return {sesion:{nombre:"Motor Demo",rol:"motorizado",usuario_id:"M1",local_id:"L1"},publico:__marca};if(a==="localesListar")return {locales:[{id:"L1",nombre:"Local 1",activo:true}]};if(a==="misEntregas")return __data;if(a==="rastreoPunto")return {guardado:true};throw Error("No simulado "+a)}};'});
  for(const p of ['js/app.js','js/comun.js','js/motorizados.js','js/rastreo.js'])await page.addScriptTag({content:read(p)});
  await page.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));
  await page.locator('#en-cuerpo .pedido').first().waitFor();await page.waitForTimeout(300);
  return {browser,page,errores};
}

async function ubicacion(engine,device,label,modo,esperado,extra){
  const {browser,page,errores}=await abrir(engine,device,{whatsapp:'+593991234567',modo});
  try{
    const b=page.locator('#btn-ubic-activar');
    assert.equal(await b.count(),1,label+': hay un solo botón «Activar mi ubicación»');
    assert.match(await b.innerText(),/Activar mi ubicación/);
    const medidas=await page.evaluate(()=>{const r=document.getElementById('btn-ubic-activar').getBoundingClientRect();return{alto:r.height,izq:r.left,der:r.right,ancho:innerWidth}});
    assert.ok(medidas.alto>=36,label+': el botón se puede tocar con el dedo');assert.ok(medidas.izq>=0&&medidas.der<=medidas.ancho,label+': el botón cabe en la pantalla');
    let pedidas=0;page.on('request',r=>{if(!r.url().startsWith('data:'))pedidas++});await page.waitForTimeout(100);const antes=pedidas;
    await b.click();
    await page.locator('.ventana').waitFor();
    const texto=await page.locator('.ventana').innerText();
    assert.match(texto,esperado,label+': mensaje correcto ('+modo+')');
    if(extra)assert.match(texto,extra,label+': detalle ('+modo+')');
    assert.equal(await page.locator('.ventana').count(),1,label+': una sola ventana');
    assert.equal(await page.evaluate(()=>document.getElementById('btn-ubic-activar').disabled),false,label+': el botón vuelve a estar disponible');
    assert.equal(pedidas-antes,0,label+': no se envía nada al servidor');
    await page.locator('.ventana .btn').click();await page.waitForTimeout(100);
    assert.equal(await page.locator('.ventana').count(),0,label+': «Entendido» cierra');
    assert.equal(await page.locator('#btn-ayuda').count(),1,label+': el botón 🆘 sigue intacto');
    assert.deepEqual(errores,[]);
  }finally{await browser.close()}
}
async function inventario(engine,device,label,locales){
  const browser=await engine.launch();const page=await browser.newPage({...device,serviceWorkers:'block'});page.setDefaultTimeout(8000);const errores=[];page.on('pageerror',e=>errores.push(e.message));
  await page.route('**/*',r=>r.request().url()==='https://demo.invalid/x.html'?r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body class="mip-premium-admin"><main id="m"></main></body>'}):r.abort());
  await page.goto('https://demo.invalid/x.html');
  for(const p of ['css/app.css','css/modulos.css','css/premium-integral.css'])await page.addStyleTag({content:read(p)});
  await page.addScriptTag({content:read('js/ui.js')});
  await page.addScriptTag({content:'window.APP={vistas:{},sesion:{rol:"dueno"},local:"L1",locales:'+JSON.stringify(locales)+',nombreLocal:function(){return "Local"}};window.DATOS={pedir:async function(a,d){(window.__envios=window.__envios||[]).push({a:a,d:d});return {insumos:[]}}};'});
  await page.addScriptTag({content:read('js/comun.js')});
  await page.addScriptTag({content:read('js/inventario.js')});
  try{
    await page.evaluate(()=>{const c=document.getElementById('m');window.APP.vistas.inventario.pintar(c)});
    await page.locator('#btn-nuevo-insumo').click();
    await page.locator('#form-insumo').waitFor();await page.waitForTimeout(600);
    const ayudaMin=await page.locator('#ins-min').evaluate(e=>({ph:e.placeholder,ayuda:e.parentElement.innerText}));
    assert.equal(ayudaMin.ph,'Ej. 5',label+': ejemplo en Mínimo');
    assert.match(ayudaMin.ayuda,/Le avisamos cuando quede esta cantidad o menos/,label+': explicación del Mínimo');
    const lado=await page.evaluate(()=>{const a=document.getElementById('ins-min').getBoundingClientRect(),b=document.getElementById('ins-stock').getBoundingClientRect();return{mismaFila:Math.abs(a.top-b.top)<4,ancho:innerWidth,der:b.right}});
    assert.ok(lado.mismaFila,label+': «Mínimo» y «Cantidad inicial» van lado a lado');assert.ok(lado.der<=lado.ancho,label+': nada se sale de la pantalla');
    const hayLocal=await page.locator('select#ins-local').count();
    if(locales.length>1)assert.equal(hayLocal,1,label+': con varios locales se elige el local');
    else{assert.equal(hayLocal,0,label+': con un solo local no se pregunta el local');assert.equal(await page.locator('#ins-local').getAttribute('type'),'hidden');}
    const botones=await page.evaluate(()=>{const v=document.querySelector('.ventana'),a=v.querySelector('.acciones').getBoundingClientRect(),w=v.getBoundingClientRect();return{abajo:a.bottom,ventanaAbajo:w.bottom,alto:innerHeight,pos:getComputedStyle(v.querySelector('.acciones')).position}});
    assert.ok(botones.abajo<=botones.alto+1,label+': «Cancelar» y «Guardar» se ven sin bajar');
    await page.locator('#ins-nombre').fill('Pollo');await page.locator('#ins-unidad').fill('presa');await page.locator('#ins-min').fill('5');await page.locator('#ins-stock').fill('10');
    await page.locator('.ventana .acciones .btn', {hasText:'Guardar'}).click();await page.waitForTimeout(200);
    const envio=await page.evaluate(()=>window.__envios.filter(x=>x.a==='insumoGuardar')[0]||{});
    assert.equal(envio.a,'insumoGuardar',label+': guarda el insumo');assert.equal(envio.d.local_id,locales[0].id,label+': el local correcto viaja al servidor');assert.equal(envio.d.minimo,5);assert.equal(envio.d.stock,10);
    assert.deepEqual(errores,[]);
  }finally{await browser.close()}
}
(async()=>{
  const lista=[[webkit,devices['iPhone SE'],'iphone-se'],[webkit,devices['iPhone 13'],'iphone-13'],[chromium,{viewport:{width:360,height:740},isMobile:true,hasTouch:true},'android'],[chromium,{viewport:{width:1366,height:768}},'escritorio']];
  for(const [e,d,l] of lista){
    await ubicacion(e,d,l,'ok',/Tu ubicación funciona/,/Precisión aproximada: 10 m[\s\S]*solo mientras MiPedido está abierta/);
    await ubicacion(e,d,l,'permiso',/La ubicación está bloqueada/,/Ajustes[\s\S]*(Safari|Chrome)/);
    await ubicacion(e,d,l,'senal',/No encontramos señal GPS/);
    await ubicacion(e,d,l,'soporte',/no permite la ubicación/);
    console.log('UBICACIÓN '+l+' OK (permitida, bloqueada, sin señal, sin soporte)');
    await inventario(e,d,l,[{id:'L1',nombre:'Local 1',activo:true},{id:'L2',nombre:'Local 2',activo:true}]);
    await inventario(e,d,l,[{id:'L1',nombre:'Local 1',activo:true}]);
    console.log('INVENTARIO '+l+' OK (formulario, varios locales y un solo local)');
  }
})().catch(e=>{console.error(e);process.exitCode=1});
