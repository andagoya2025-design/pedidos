// 3.1.33 — Alerta de ayuda del motorizado en la app del dueño/cajero: sonido/voz, banda roja fija y «Atendido». Solo datos ficticios.
const assert=require('node:assert/strict'),fs=require('node:fs');const {chromium,webkit,devices}=require('playwright');const read=p=>fs.readFileSync(p,'utf8');
async function run(engine,device,label){
 const browser=await engine.launch();try{
 const page=await browser.newPage(device),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort());
 const header=read('index.html').match(/<header class="cabecera">[\s\S]*?<\/header>/)[0];
 await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1">'+header+'<main id="contenido"><button id="pedido-cerca">Aceptar pedido</button></main>');
 await page.addStyleTag({content:read('css/app.css')});await page.addStyleTag({content:read('css/premium-integral.css')});await page.addScriptTag({content:read('js/ui.js')});
 await page.addScriptTag({content:'window.APP={sesion:{usuario_id:"U1",rol:"dueno"},local:"L1",ir:v=>window.dest=v};window.APP_CONFIG={url:"ficticio"};var mem={modo_avisos:"voz",sonido_pedidos:true};window.APP_MEMORIA={leer:k=>mem[k],guardar:(k,v)=>mem[k]=v};window.beeps=0;window.spoken=[];window.llamadas=[];window.modoAtender="ok";window.vibraciones=[];navigator.vibrate=p=>{vibraciones.push(p);return true};UI.sonar=()=>beeps++;UI.desbloquearSonido=()=>{};UI.pedirNotificaciones=async()=>{};window.DATOS={pedir:async(a,d,o)=>{llamadas.push({a,d,o});if(a!=="ayudaAtender")throw Error("No simulado "+a);if(modoAtender==="error")throw Error("sin red");return {atendida:true,ayuda_id:d.ayuda_id}}};Object.defineProperty(window,"speechSynthesis",{configurable:true,value:{getVoices:()=>[{lang:"es-MX"}],speak:u=>{if(u.volume>0)spoken.push(u.text);setTimeout(()=>u.onend(),1)},cancel:()=>{}}});window.SpeechSynthesisUtterance=function(t){this.text=t};'});
 await page.addScriptTag({content:read('js/voz.js')});await page.addScriptTag({content:read('js/notificaciones.js')});await page.evaluate(()=>{document.dispatchEvent(new Event('DOMContentLoaded'));MIP_AVISOS.configurar('voz',80);});
 const A={id:'AYU-1',nombre:'Carlos Pérez',pedidos:['PED-0007'],hora:'2026-11-27T12:05:00Z',lat:-0.18,lng:-78.48};
 // 1) sin alertas no hay banda y una respuesta sin «ayudas» (script anterior) no toca nada
 await page.evaluate(()=>{MIP_AVISOS.ayudas(undefined);MIP_AVISOS.ayudas([]);});assert.equal(await page.locator('#mip-ayuda-banda').count(),0,label+': sin alertas no hay banda');
 // 2) llega una alerta: banda roja + voz con el nombre + vibración + campana
 await page.evaluate(a=>MIP_AVISOS.ayudas([a]),A);
 await page.locator('#mip-ayuda-banda').waitFor();
 await page.waitForFunction(()=>spoken.length===1);assert.equal(await page.evaluate(()=>spoken[0]),'Atención, Carlos pide ayuda.',label+': la voz dice quién pide ayuda');
 assert.equal((await page.evaluate(()=>vibraciones)).length,1,label+': vibra una vez');
 const txt=await page.locator('#mip-ayuda-banda').innerText();assert.match(txt,/Carlos Pérez pide ayuda/);assert.match(txt,/PED-0007/);
 assert.equal(await page.locator('.mip-ayuda-mapa').getAttribute('href'),'https://www.google.com/maps?q=-0.18,-78.48',label+': enlace al mapa');
 assert.equal(await page.locator('#mip-avisos-num').innerText(),'1',label+': también queda en la campana');
 const g=await page.evaluate(()=>{const b=document.getElementById('mip-ayuda-banda').getBoundingClientRect(),o=document.querySelector('.mip-ayuda-ok').getBoundingClientRect();return{top:b.top,izq:b.left,der:b.right,w:innerWidth,alto:o.height,ancho:o.width,fondo:getComputedStyle(document.getElementById('mip-ayuda-banda')).backgroundColor}});
 assert.ok(g.top<=1&&g.izq>=0&&g.der<=g.w+1,label+': la banda está arriba y cabe en la pantalla');assert.ok(g.alto>=44&&g.ancho>=44,label+': «Atendido» se toca fácil');assert.equal(g.fondo,'rgb(179, 38, 30)');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),label+': sin desborde horizontal');
 // 3) la misma alerta en la siguiente consulta no repite sonido ni voz
 await page.evaluate(a=>{MIP_AVISOS.ayudas([a]);MIP_AVISOS.ayudas([a]);},A);await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>spoken.length),1,label+': no se repite cada 2 segundos');assert.equal(await page.evaluate(()=>beeps),0);assert.equal(await page.locator('.mip-ayuda-fila').count(),1);
 // 4) una respuesta sin «ayudas» no borra la banda
 await page.evaluate(()=>MIP_AVISOS.ayudas(undefined));assert.equal(await page.locator('#mip-ayuda-banda').count(),1,label+': una consulta incompleta no oculta la alerta');
 // 5) «Atendido» con error: la alerta sigue y avisa
 await page.evaluate(()=>{window.modoAtender='error'});await page.locator('.mip-ayuda-ok').click();
 await page.getByRole('button',{name:'Entendido'}).waitFor();await page.getByRole('button',{name:'Entendido'}).click();
 assert.equal(await page.locator('#mip-ayuda-banda').count(),1,label+': si falla, la alerta NO desaparece');assert.equal(await page.locator('.mip-ayuda-ok').isEnabled(),true,label+': se puede reintentar');
 // 6) «Atendido» ok: llama al servidor una vez, con el id y el local, y quita la banda
 await page.evaluate(()=>{window.modoAtender='ok';llamadas.length=0});await page.locator('.mip-ayuda-ok').dblclick();
 await page.locator('#mip-ayuda-banda').waitFor({state:'detached'});
 const ll=await page.evaluate(()=>llamadas);assert.equal(ll.length,1,label+': doble toque = una sola llamada');assert.equal(ll[0].a,'ayudaAtender');assert.equal(ll[0].d.ayuda_id,'AYU-1');assert.equal(ll[0].d.local_id,'L1');assert.equal(ll[0].o.guardar,true);
 // 7) si el servidor aún la lista (consulta en vuelo), no reaparece mientras se atiende; una alerta nueva sí
 await page.evaluate(()=>MIP_AVISOS.ayudas([{id:'AYU-2',nombre:'Ana',pedidos:[],hora:'2026-11-27T12:30:00Z',lat:'',lng:''},{id:'AYU-3',nombre:'Luis Mora',pedidos:['PED-0009','PED-0010'],hora:'2026-11-27T12:31:00Z',lat:-0.2,lng:-78.5}]));
 await page.locator('.mip-ayuda-fila').nth(1).waitFor();assert.equal(await page.locator('.mip-ayuda-fila').count(),2,label+': varias alertas a la vez');
 assert.equal(await page.locator('.mip-ayuda-sin').count(),1,label+': sin ubicación se dice claro');assert.equal(await page.locator('.mip-ayuda-mapa').count(),1);
 await page.waitForFunction(()=>spoken.length===2);assert.equal(await page.evaluate(()=>spoken.at(-1)),'Atención, 2 motorizados piden ayuda.');
 // 8) texto del motorizado no inyecta HTML
 await page.evaluate(()=>MIP_AVISOS.ayudas([{id:'AYU-X',nombre:'<img src=x onerror=window.xss=1>',pedidos:['<b>1</b>'],hora:'',lat:'',lng:''}]));await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>window.xss),undefined,label+': nada se ejecuta desde el nombre');assert.equal(await page.locator('#mip-ayuda-banda img').count(),0);
 // 9) el cajero la ve; el motorizado y la sesión cerrada no; cambiar de sesión limpia
 await page.evaluate(()=>{APP.sesion={usuario_id:'U9',rol:'motorizado'};MIP_AVISOS.sync();MIP_AVISOS.ayudas([{id:'AYU-9',nombre:'Zoe',pedidos:[],hora:'',lat:'',lng:''}]);});
 assert.equal(await page.locator('#mip-ayuda-banda').count(),0,label+': el motorizado no ve alertas de otros');
 await page.evaluate(()=>{APP.sesion={usuario_id:'U2',rol:'cajero'};MIP_AVISOS.sync();MIP_AVISOS.ayudas([{id:'AYU-9',nombre:'Zoe',pedidos:[],hora:'',lat:'',lng:''}]);});
 await page.locator('#mip-ayuda-banda').waitFor();await page.evaluate(()=>{APP.sesion=null;MIP_AVISOS.sync();});await page.waitForTimeout(100);
 assert.equal(await page.locator('#mip-ayuda-banda').count(),0,label+': al cerrar sesión desaparece');
 assert.deepEqual(errors,[]);
 console.log('PASS '+label+': alerta de ayuda en la administración (voz, banda roja, Atendido, errores y aislamiento)');
 }finally{await browser.close()}
}
(async()=>{for(const [engine,device,label] of [[webkit,devices['iPhone SE'],'iPhone SE'],[chromium,{viewport:{width:360,height:740},isMobile:true,hasTouch:true},'Android compacto'],[chromium,{viewport:{width:1366,height:768}},'Escritorio']])await run(engine,device,label);})().catch(e=>{console.error(e);process.exit(1)});
