const assert=require('node:assert/strict'),fs=require('node:fs');const {chromium,webkit,devices}=require('playwright');const read=p=>fs.readFileSync(p,'utf8');
async function run(engine,device,label){
 const browser=await engine.launch();try{
 const page=await browser.newPage(device),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort());
 const header=read('index.html').match(/<header class="cabecera">[\s\S]*?<\/header>/)[0];
 await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1">'+header);
 await page.addStyleTag({content:read('css/app.css')});await page.addScriptTag({content:read('js/ui.js')});
 await page.addScriptTag({content:'window.APP={sesion:{usuario_id:"U1",rol:"dueno"},local:"L",ir:v=>window.dest=v};window.APP_CONFIG={url:"ficticio"};var mem={};window.APP_MEMORIA={leer:k=>mem[k],guardar:(k,v)=>mem[k]=v};window.beeps=0;window.spoken=[];UI.sonar=()=>beeps++;UI.desbloquearSonido=()=>{};UI.pedirNotificaciones=async()=>{};Object.defineProperty(window,"speechSynthesis",{configurable:true,value:{getVoices:()=>[{lang:"es-MX"}],speak:u=>{spoken.push(u.text);setTimeout(()=>u.onend(),1)},cancel:()=>{}}});window.SpeechSynthesisUtterance=function(t){this.text=t};'});
 await page.addScriptTag({content:read('js/voz.js')});await page.addScriptTag({content:read('js/notificaciones.js')});await page.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));
 await page.evaluate(()=>{document.querySelector('.marca-nombre').textContent='Restaurante de prueba con nombre largo';document.querySelector('.marca-sub').textContent='Propietario de prueba';document.querySelector('#selector-local').innerHTML='<option>Local de prueba</option>';MIP_AVISOS.configurar('voz',80);MIP_AVISOS.registrar('pedido',[{id:'1',numero:'PED-0001'}]);MIP_AVISOS.registrar('pedido',[{id:'1',numero:'PED-0001'}]);});
 await page.waitForFunction(()=>spoken.length===1);assert.equal(await page.locator('#mip-avisos-num').innerText(),'1');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
 await page.locator('#mip-avisos').click();await page.locator('[data-aviso]').click();assert.equal(await page.evaluate(()=>dest),'pedidos?ver=PED-0001');assert.equal(await page.locator('#mip-avisos-num').isHidden(),true);
 await page.locator('#mip-avisos').click();await page.getByRole('button',{name:'Configurar avisos'}).click();await page.locator('#mip-modo').selectOption('ambos');await page.locator('#mip-vol').fill('65');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 assert.equal(await page.evaluate(()=>MIP_AVISOS.modo()),'ambos');
 await page.evaluate(()=>{MIP_AVISOS.configurar('silencio',65);MIP_AVISOS.registrar('atraso',[{id:'2',numero:'PED-0002'}]);});
 assert.equal(await page.locator('#mip-avisos-num').innerText(),'1');
 await page.locator('#mip-avisos').click();await page.locator('#mip-avisos-leer').click();assert.equal(await page.locator('#mip-avisos-num').isHidden(),true);
 await page.evaluate(()=>{APP.sesion={usuario_id:'U2',rol:'motorizado'};MIP_AVISOS.sync();});
 await page.locator('.ventana').waitFor({state:'hidden'});
 await page.evaluate(()=>{MIP_AVISOS.configurar('voz',80);MIP_AVISOS.entregas([{id:'3',numero:'PED-0003',estado:'Preparando'}]);});
 await page.waitForFunction(()=>spoken.length===2);
 await page.locator('#mip-avisos').click();assert.match(await page.locator('[data-aviso]').innerText(),/Nueva entrega asignada/);assert.equal(await page.locator('[data-aviso]').count(),1);await page.locator('[data-aviso]').click();assert.equal(await page.evaluate(()=>dest),'entregas');assert.equal(await page.evaluate(()=>beeps),0);assert.deepEqual(errors,[]);
 console.log('PASS '+label+': campana, voz simulada, QR, permisos, silencio, lectura, aislamiento y diseño');
 }finally{await browser.close()}
}
(async()=>{await run(webkit,devices['iPhone SE'],'iPhone SE');await run(chromium,{viewport:{width:360,height:740},isMobile:true,hasTouch:true},'Android compacto');await run(chromium,{viewport:{width:1366,height:768}},'Escritorio')})().catch(e=>{console.error(e);process.exitCode=1});
