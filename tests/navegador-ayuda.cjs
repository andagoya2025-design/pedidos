'use strict';
// 3.1.48 — Botón «Ayuda» del motorizado y menú de abajo sin palabras partidas. Solo datos ficticios.
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium,webkit,devices}=require('playwright');
const read=p=>fs.readFileSync(p,'utf8');
const AHORA=new Date(2026,10,27,7,5,0).getTime();
const TITULOS=['Inicio','Pedidos','Menú','Motorizados','Caja','Monitoreo','Inventario','Reportes','Informe motos','Configuración','Mi cuenta'];
const pedido={id:'01',numero:'PED-0001',estado:'En camino',forma_pago:'transferencia',pago_verificado:true,total:7.5,cliente_nombre:'Cliente ficticio',direccion:'',lat:-0.18,lng:-78.48,ubicacion_fuente:'gps',detalle:[{cantidad:1,nombre:'Almuerzo'}]};
async function abrir(engine,device,{whatsapp,gps,admin}){
  const browser=await engine.launch();
  const page=await browser.newPage({...device,serviceWorkers:'block'});page.setDefaultTimeout(8000);const errores=[];page.on('pageerror',e=>errores.push(e.message));
  await page.addInitScript(({ahora,gps})=>{const R=Date;window.Date=class extends R{constructor(...a){a.length?super(...a):super(ahora)}static now(){return ahora}};
    window.__abiertos=[];window.open=u=>{window.__abiertos.push(u);return null};
    const ok=cb=>cb({coords:{latitude:-0.18,longitude:-78.48,accuracy:10},timestamp:ahora});
    Object.defineProperty(navigator,'geolocation',{value:{watchPosition(cb){setTimeout(()=>gps&&ok(cb),30);return 1},clearWatch(){},getCurrentPosition(cb,er){gps?ok(cb):er({code:2})}},configurable:true});},{ahora:AHORA,gps});
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
async function ayuda(engine,device,label){
  const {browser,page,errores}=await abrir(engine,device,{whatsapp:'+593991234567',gps:true});
  try{
    const btn=page.locator('#btn-ayuda');await btn.waitFor();
    const g=await page.evaluate(()=>{const b=document.getElementById('btn-ayuda').getBoundingClientRect(),n=document.getElementById('navegacion').getBoundingClientRect();return{abajo:b.bottom,nav:n.top,izq:b.left,der:b.right,ancho:innerWidth,pie:document.querySelector('#contenido').style.paddingBottom}});
    assert.ok(g.izq>=0&&g.der<=g.ancho,label+': el botón cabe en la pantalla');
    if(g.ancho<900)assert.ok(g.abajo<=g.nav+1,label+': el botón queda encima del menú y no tapa sus palabras');
    const caja=await btn.boundingBox(),cx=caja.x+caja.width/2,cy=caja.y+caja.height/2;
    await page.mouse.move(cx,cy);await page.mouse.down();await page.waitForTimeout(300);await page.mouse.up();
    assert.equal(await page.locator('.ayuda-hoja').count(),0,label+': un toque corto no abre la hoja');
    assert.match(await btn.innerText(),/Mantén 2 s/,label+': el toque corto explica cómo usarlo');
    await page.mouse.down();await page.waitForTimeout(1000);await page.mouse.up();
    assert.equal(await page.locator('.ayuda-hoja').count(),0,label+': soltar antes de 2 s cancela');
    await page.mouse.down();await page.waitForTimeout(2300);await page.mouse.up();
    await page.locator('.ayuda-hoja').waitFor();
    assert.match(await page.locator('.ayuda-estado').innerText(),/Ubicación lista/,label+': ubicación preparada');
    await page.locator('.ayuda-avisar').click();
    const url=decodeURIComponent(await page.evaluate(()=>window.__abiertos[0]||''));
    assert.match(url,/^https:\/\/wa\.me\/593991234567\?text=/,label+': va al WhatsApp configurado');
    assert.match(url,/Motor Demo/);assert.match(url,/PED-0001/);assert.match(url,/Hora: 07:05/);assert.match(url,/maps\?q=-0\.18,-78\.48/);
    assert.doesNotMatch(url,/cédula|cedula|Cliente ficticio/,label+': no sale ningún dato del cliente');
    assert.equal(await page.locator('.ayuda-hoja').count(),0,label+': la hoja se cierra');
    await page.mouse.down();await page.waitForTimeout(2300);await page.mouse.up();await page.keyboard.press('Escape');
    assert.equal(await page.locator('.ayuda-hoja').count(),0,label+': Escape cierra la hoja');
    assert.deepEqual(errores,[]);
  }finally{await browser.close()}
}
async function casos(engine,device){
  let r=await abrir(engine,device,{whatsapp:'',gps:true});
  try{await r.page.locator('#btn-ayuda').focus();await r.page.keyboard.press('Enter');
    assert.match(await r.page.locator('.ayuda-texto').innerText(),/todavía no tiene un WhatsApp configurado/);
    assert.equal(await r.page.locator('.ayuda-avisar').count(),0,'sin número no hay botón de enviar');
    assert.equal(await r.page.evaluate(()=>window.__abiertos.length),0);}finally{await r.browser.close()}
  r=await abrir(engine,device,{whatsapp:'+593991234567',gps:false});
  try{await r.page.locator('#btn-ayuda').focus();await r.page.keyboard.press('Enter');
    assert.match(await r.page.locator('.ayuda-estado').innerText(),/No se pudo leer tu ubicación/);
    await r.page.locator('.ayuda-avisar').click();
    assert.match(decodeURIComponent(await r.page.evaluate(()=>window.__abiertos[0])),/Ubicación: no disponible/);}finally{await r.browser.close()}
  r=await abrir(engine,device,{whatsapp:'+593991234567',gps:true});
  try{await r.page.evaluate(()=>{window.APP.sesion=null;window.dispatchEvent(new Event('app:sesion-terminada'))});await r.page.waitForTimeout(200);
    assert.equal(await r.page.locator('#btn-ayuda').count(),0,'al cerrar sesión desaparece el botón');}finally{await r.browser.close()}
}
async function menu(engine,device,label){
  const {browser,page}=await abrir(engine,device,{whatsapp:'',gps:true,admin:true});
  try{
    await page.evaluate(t=>{document.querySelectorAll('[hidden]').forEach(e=>e.removeAttribute('hidden'));document.documentElement.className+=' mip-premium-admin';const n=document.getElementById('navegacion');n.innerHTML=t.map((x,i)=>'<button class="nav-btn" type="button"'+(i?'':' aria-current="page"')+'><span class="ico">•</span>'+x+'</button>').join('')},TITULOS);
    const partidas=await page.evaluate(()=>[...document.querySelectorAll('#navegacion .nav-btn')].filter(b=>{const t=[...b.childNodes].find(n=>n.nodeType===3),r=document.createRange();r.selectNodeContents(t);const l=new Set([...r.getClientRects()].map(x=>Math.round(x.top))).size;return l>t.textContent.split(' ').length}).map(b=>b.textContent));
    assert.deepEqual(partidas,[],label+': ninguna palabra del menú se parte a la mitad');
  }finally{await browser.close()}
}
(async()=>{
  const lista=[[webkit,devices['iPhone SE'],'iphone-se'],[webkit,devices['iPhone 13'],'iphone-13'],[chromium,{viewport:{width:360,height:740},isMobile:true,hasTouch:true},'android'],[chromium,{viewport:{width:1366,height:768}},'escritorio']];
  for(const [e,d,l] of lista){await ayuda(e,d,l);await menu(e,d,l);console.log('AYUDA '+l+' OK');}
  await casos(chromium,devices['iPhone 13']);console.log('AYUDA casos (sin número, sin GPS, cerrar sesión) OK');
})().catch(e=>{console.error(e);process.exitCode=1});
