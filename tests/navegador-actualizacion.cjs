'use strict';
// 3.1.49 — La actualización automática no se bloquea por el formulario de ingreso ni por formularios ya guardados;
// con cambios sin guardar espera y avisa arriba; el aviso queda bajo el encabezado. Solo datos ficticios.
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium,webkit,devices}=require('playwright');
const read=p=>fs.readFileSync(p,'utf8');
async function abrir(engine,dev){
  const b=await engine.launch();
  const page=await b.newPage({...dev,serviceWorkers:'block'});page.setDefaultTimeout(8000);
  await page.addInitScript(()=>{sessionStorage.__cargas=String(Number(sessionStorage.__cargas||0)+1);
    const sw=new EventTarget();sw.controller={id:'A'};sw.register=()=>Promise.resolve({update:()=>Promise.resolve(),installing:null});
    Object.defineProperty(navigator,'serviceWorker',{value:sw,configurable:true});});
  const html=read('driver.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
  await page.route('**/*',r=>{const u=r.request().url();if(u==='https://demo.invalid/driver.html')return r.fulfill({contentType:'text/html',body:html});if(u==='https://demo.invalid/js/pwa-cliente.js')return r.fulfill({contentType:'text/javascript',body:read('js/pwa-cliente.js')});return r.abort()});
  await page.goto('https://demo.invalid/driver.html');
  for(const p of ['css/app.css','css/modulos.css','css/premium-integral.css'])await page.addStyleTag({content:read(p)});
  await page.evaluate(()=>{document.querySelectorAll('[hidden]').forEach(e=>e.removeAttribute('hidden'));
    const ing=document.getElementById('form-ingreso').closest('main');ing.style.cssText='position:fixed;left:-9999px;top:0';
    document.getElementById('navegacion').innerHTML=['Inicio','Mis entregas','Mi cuenta'].map(x=>'<button class="nav-btn" type="button">'+x+'</button>').join('');
    document.getElementById('contenido').innerHTML='<div style="height:900px">contenido</div>';});
  await page.addScriptTag({url:'https://demo.invalid/js/pwa-cliente.js'});await page.waitForTimeout(200);
  return {b,page};
}
const cargas=p=>p.evaluate(()=>Number(sessionStorage.__cargas));
const nueva=p=>p.evaluate(()=>{navigator.serviceWorker.controller={id:'B'};navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))});
const quitarFoco=p=>p.evaluate(()=>document.activeElement&&document.activeElement.blur());
async function caso(engine,dev,label){
  let {b,page}=await abrir(engine,dev);
  try{ // 1) escribió en el ingreso y entró: se actualiza sola
    await page.fill('#form-ingreso input','usuario');await quitarFoco(page);await page.evaluate(()=>document.getElementById('form-ingreso').remove());
    await nueva(page);await page.waitForTimeout(8000);
    assert.ok(await cargas(page)>1,label+': tras iniciar sesión la actualización se aplica sola');
  }finally{await b.close()}
  ({b,page}=await abrir(engine,dev));
  try{ // 2) formulario ya guardado (ya no está en pantalla): se actualiza sola
    await page.evaluate(()=>{document.getElementById('contenido').innerHTML='<form id="f"><input id="x"></form>'});await page.fill('#x','dato');await quitarFoco(page);
    await page.evaluate(()=>document.getElementById('f').remove());await nueva(page);await page.waitForTimeout(8000);
    assert.ok(await cargas(page)>1,label+': un formulario ya guardado no bloquea la actualización');
  }finally{await b.close()}
  ({b,page}=await abrir(engine,dev));
  try{ // 3) cambios sin guardar: espera, no recarga y avisa arriba, debajo del encabezado
    await page.evaluate(()=>{document.getElementById('contenido').innerHTML='<form id="f"><input id="x"></form>'});await page.fill('#x','dato');await quitarFoco(page);
    await nueva(page);await page.waitForTimeout(8000);
    assert.equal(await cargas(page),1,label+': con cambios sin guardar no se recarga');
    assert.match(await page.locator('#pwa-estado').innerText(),/Actualización preparada/);
    await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(200);
    const g=await page.evaluate(()=>{const bar=document.getElementById('pwa-nueva'),cab=document.querySelector('.cabecera'),br=bar&&bar.getBoundingClientRect(),cr=cab.getBoundingClientRect();return{hay:!!bar,texto:bar&&bar.textContent,dentro:!!bar&&cab.contains(bar)&&br.bottom<=cr.bottom+1,visible:!!bar&&br.top>=0&&br.bottom<=innerHeight}});
    assert.ok(g.hay&&g.dentro&&g.visible,label+': el aviso «Hay una versión nueva» se ve dentro del encabezado');assert.match(g.texto,/Actualizar/);
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(200);
    assert.equal((await page.evaluate(()=>{const v=document.getElementById('pwa-actualizar').getBoundingClientRect(),n=document.getElementById('navegacion').getBoundingClientRect();return v.bottom>n.top})),false,label+': el texto de versión no queda tapado por el menú');
  }finally{await b.close()}
}
(async()=>{for(const [e,d,l] of [[webkit,devices['iPhone 13'],'iphone-13'],[chromium,{viewport:{width:360,height:740},isMobile:true,hasTouch:true},'android']]){await caso(e,d,l);console.log('ACTUALIZACIÓN '+l+' OK')}})().catch(e=>{console.error(e);process.exitCode=1});
