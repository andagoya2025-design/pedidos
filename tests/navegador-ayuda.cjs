'use strict';
// 3.1.48 / 3.1.33 — Botón «Ayuda» del motorizado (desde 3.1.33: UN SOLO TOQUE que avisa a la plataforma) y menú de abajo sin palabras partidas. Solo datos ficticios.
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
  await page.addScriptTag({content:'window.__data='+JSON.stringify(data)+';window.__marca='+JSON.stringify(marca)+';window.APP_CONFIG={configurada:true};var mem={token:"ficticio"};window.APP_MEMORIA={leer:k=>mem[k],guardar:(k,v)=>mem[k]=v,limpiarSesion:()=>{mem={}}};window.DATOS={crearVigiaSync:()=>async()=>{},ocupado:()=>false,estado:async()=>({instalado:true,config:__marca,licencia:{}}),pedir:async (a,d)=>{if(a==="sesion")return {sesion:{nombre:"Motor Demo",rol:"motorizado",usuario_id:"M1",local_id:"L1"},publico:__marca};if(a==="localesListar")return {locales:[{id:"L1",nombre:"Local 1",activo:true}]};if(a==="misEntregas")return __data;if(a==="rastreoPunto")return {guardado:true};if(a==="ayudaAviso"){(window.__ayuda=window.__ayuda||[]).push(d);const m=window.__ayudaModo||"ok";if(m==="error")throw Error("sin red");if(m==="viejo"){const e=Error("accion");e.codigo="ACCION";throw e}if(m==="lento")await new Promise(r=>setTimeout(r,700));return d.accion==="falsa"?{cancelado:true,ayuda_id:d.ayuda_id}:{guardado:true,ayuda_id:d.ayuda_id,fecha:new Date().toISOString()}}throw Error("No simulado "+a)}};'});
  for(const p of ['js/app.js','js/comun.js','js/motorizados.js','js/rastreo.js'])await page.addScriptTag({content:read(p)});
  await page.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));
  await page.locator('#en-cuerpo .pedido').first().waitFor();await page.waitForTimeout(300);
  return {browser,page,errores};
}
async function ayuda(engine,device,label){
  const {browser,page,errores}=await abrir(engine,device,{whatsapp:'+593991234567',gps:true});
  try{
    const btn=page.locator('#btn-ayuda');await btn.waitFor();
    const g=await page.evaluate(()=>{const b=document.getElementById('btn-ayuda').getBoundingClientRect(),n=document.getElementById('navegacion').getBoundingClientRect();return{abajo:b.bottom,nav:n.top,izq:b.left,der:b.right,ancho:innerWidth}});
    assert.ok(g.izq>=0&&g.der<=g.ancho,label+': el botón cabe en la pantalla');
    if(g.ancho<900)assert.ok(g.abajo<=g.nav+1,label+': el botón queda encima del menú y no tapa sus palabras');
    assert.equal(await page.locator('.ayuda-hoja').count(),0,label+': sin tocar no hay ventana ni avisos');
    assert.equal(await page.evaluate(()=>(window.__ayuda||[]).length),0,label+': nada se envía solo');
    await btn.click();                                   // UN SOLO TOQUE
    await page.locator('.ayuda-titulo',{hasText:'Aviso enviado'}).waitFor();
    const llamadas=await page.evaluate(()=>window.__ayuda);
    assert.equal(llamadas.length,1,label+': un toque = un aviso');
    assert.match(llamadas[0].ayuda_id,/^AYU-[A-Z0-9]{8,}$/,label+': el aviso lleva un identificador único');
    assert.equal(llamadas[0].lat,-0.18);assert.equal(llamadas[0].lng,-78.48);assert.equal(llamadas[0].accion,undefined);
    assert.match(await page.locator('.ayuda-texto').innerText(),/quedó registrado y aparece en la app de la administración con tu ubicación/,label+': dice la verdad solo tras confirmar');
    await page.evaluate(()=>{document.getElementById('btn-ayuda').click();document.getElementById('btn-ayuda').click()});
    assert.equal(await page.evaluate(()=>window.__ayuda.length),1,label+': tocar de nuevo con la ventana abierta no duplica');
    await page.getByRole('button',{name:'Avisar también por WhatsApp'}).click();
    const url=decodeURIComponent(await page.evaluate(()=>window.__abiertos[0]||''));
    assert.match(url,/^https:\/\/wa\.me\/593991234567\?text=/,label+': WhatsApp es opcional y va al número configurado');
    assert.match(url,/Motor Demo/);assert.match(url,/PED-0001/);assert.match(url,/Hora: 07:05/);assert.match(url,/maps\?q=-0\.18,-78\.48/);
    assert.doesNotMatch(url,/cédula|cedula|Cliente ficticio/,label+': no sale ningún dato del cliente');
    assert.equal(await page.locator('.ayuda-hoja').count(),1,label+': tras WhatsApp la ventana sigue para poder marcar falsa alarma');
    await page.getByRole('button',{name:'Falsa alarma'}).click();
    await page.locator('.ayuda-titulo',{hasText:'Falsa alarma registrada'}).waitFor();
    const todas=await page.evaluate(()=>window.__ayuda);
    assert.equal(todas.length,2);assert.equal(todas[1].accion,'falsa');assert.equal(todas[1].ayuda_id,todas[0].ayuda_id,label+': la falsa alarma cancela ese mismo aviso');
    await page.getByRole('button',{name:'Cerrar'}).click();
    assert.equal(await page.locator('.ayuda-hoja').count(),0,label+': la ventana se cierra');
    await btn.click();await page.locator('.ayuda-titulo',{hasText:'Aviso enviado'}).waitFor();
    assert.notEqual((await page.evaluate(()=>window.__ayuda))[2].ayuda_id,todas[0].ayuda_id,label+': un aviso nuevo tiene otro identificador');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.ayuda-hoja').count(),0,label+': Escape cierra la ventana');
    assert.deepEqual(errores,[]);
  }finally{await browser.close()}
}
async function casos(engine,device){
  let r=await abrir(engine,device,{whatsapp:'',gps:true});
  try{await r.page.locator('#btn-ayuda').focus();await r.page.keyboard.press('Enter');
    await r.page.locator('.ayuda-titulo',{hasText:'Aviso enviado'}).waitFor();
    assert.equal(await r.page.getByRole('button',{name:'Avisar también por WhatsApp'}).count(),0,'sin número no hay botón de WhatsApp');
    assert.equal(await r.page.getByRole('button',{name:'Falsa alarma'}).count(),1);
    assert.equal(await r.page.evaluate(()=>window.__abiertos.length),0);}finally{await r.browser.close()}
  r=await abrir(engine,device,{whatsapp:'+593991234567',gps:false});
  try{await r.page.locator('#btn-ayuda').click();await r.page.locator('.ayuda-titulo',{hasText:'Aviso enviado'}).waitFor();
    const c=await r.page.evaluate(()=>window.__ayuda[0]);assert.equal(c.lat,undefined,'sin GPS el aviso sale igual, sin ubicación');
    assert.match(await r.page.locator('.ayuda-texto').innerText(),/sin ubicación/);
    await r.page.getByRole('button',{name:'Avisar también por WhatsApp'}).click();
    assert.match(decodeURIComponent(await r.page.evaluate(()=>window.__abiertos[0])),/Ubicación: no disponible/);}finally{await r.browser.close()}
  r=await abrir(engine,device,{whatsapp:'+593991234567',gps:true});
  try{await r.page.evaluate(()=>{window.__ayudaModo='error'});await r.page.locator('#btn-ayuda').click();
    await r.page.locator('.ayuda-titulo',{hasText:'No se pudo avisar'}).waitFor();
    assert.doesNotMatch(await r.page.locator('.ayuda-hoja').innerText(),/Aviso enviado/,'si falla, nunca dice «enviado»');
    assert.equal(await r.page.getByRole('button',{name:'Avisar por WhatsApp'}).count(),1,'queda WhatsApp como respaldo');
    await r.page.evaluate(()=>{window.__ayudaModo='ok'});await r.page.getByRole('button',{name:'Reintentar'}).click();
    await r.page.locator('.ayuda-titulo',{hasText:'Aviso enviado'}).waitFor();
    const l=await r.page.evaluate(()=>window.__ayuda);assert.equal(l.length,2);assert.equal(l[0].ayuda_id,l[1].ayuda_id,'reintentar usa el mismo identificador: no se duplica');}finally{await r.browser.close()}
  r=await abrir(engine,device,{whatsapp:'+593991234567',gps:true});
  try{await r.page.evaluate(()=>{window.__ayudaModo='viejo'});await r.page.locator('#btn-ayuda').click();
    await r.page.locator('.ayuda-titulo',{hasText:'No se pudo avisar'}).waitFor();
    assert.match(await r.page.locator('.ayuda-texto').innerText(),/todavía no recibe estos avisos/,'con el script anterior lo dice claro y deja WhatsApp');}finally{await r.browser.close()}
  r=await abrir(engine,device,{whatsapp:'+593991234567',gps:true});
  try{await r.page.evaluate(()=>{window.__ayudaModo='lento'});await r.page.locator('#btn-ayuda').click();
    await r.page.locator('.ayuda-titulo',{hasText:'Avisando'}).waitFor();
    assert.doesNotMatch(await r.page.locator('.ayuda-hoja').innerText(),/Aviso enviado/,'mientras espera no dice «enviado»');
    await r.page.keyboard.press('Escape');assert.equal(await r.page.locator('.ayuda-hoja').count(),1,'mientras envía no se cierra por accidente');
    await r.page.locator('.ayuda-titulo',{hasText:'Aviso enviado'}).waitFor();}finally{await r.browser.close()}
  r=await abrir(engine,device,{whatsapp:'+593991234567',gps:true});
  try{await r.page.locator('#btn-ayuda').click();await r.page.locator('.ayuda-titulo',{hasText:'Aviso enviado'}).waitFor();
    await r.page.evaluate(()=>{window.APP.sesion=null;window.dispatchEvent(new Event('app:sesion-terminada'))});await r.page.waitForTimeout(200);
    assert.equal(await r.page.locator('#btn-ayuda').count(),0,'al cerrar sesión desaparece el botón');
    assert.equal(await r.page.locator('.ayuda-hoja').count(),0,'y también la ventana');}finally{await r.browser.close()}
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
  await casos(chromium,devices['iPhone 13']);console.log('AYUDA casos (sin número, sin GPS, sin red, script anterior, envío lento, cerrar sesión) OK');
})().catch(e=>{console.error(e);process.exitCode=1});
