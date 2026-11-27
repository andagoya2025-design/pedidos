'use strict';
// Service worker REAL en Chromium, origen local y datos ficticios; ninguna publicación ni conexión a Apps Script.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),{execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const BASE='bf445362ecf1109b6c343acebcaf0f0fb50b7282',PUBLICADA='9cf4474154b6b8e312f6ecccefa0af696f0090e0';
const stable='app-3.1.59-actualizacion',publicada='app-3.1.63-monitoreo-final',candidate='app-3.1.66-ubicacion-inventario',rollback='app-3.1.65-reversion-prueba';
const html='<!doctype html><meta name="viewport" content="width=device-width"><title>Prueba PWA local</title><body>Prueba sin datos reales</body>';
const fromGit=(p,ref)=>execFileSync('git',['show',ref+':'+p],{maxBuffer:8*1024*1024});
const tipo=p=>p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html':p.endsWith('.json')?'application/json':p.endsWith('.svg')?'image/svg+xml':p.endsWith('.png')?'image/png':'text/plain';
let fase='estable',externas=0;const cache=new Map();
const server=http.createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname.slice(1);
 res.setHeader('Cache-Control','no-store');if(!path){res.setHeader('Content-Type','text/html');return res.end(html);}
 if(path.includes('..')||! /^(?:[a-zA-Z0-9_.\/-]+)$/.test(path)){res.statusCode=404;return res.end();}
 try{const key=fase+':'+path;let content=cache.get(key);if(!content){content=fase==='candidata'?fs.readFileSync(path):fromGit(path,fase==='estable'?BASE:PUBLICADA);if(fase==='reversion'&&path==='sw.js')content=Buffer.from(content.toString().replace(publicada,rollback));cache.set(key,content);}res.setHeader('Content-Type',tipo(path));res.end(content);}
 catch(e){res.statusCode=404;res.end('No existe');}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch();
 try{
  const ctx=await browser.newContext({serviceWorkers:'allow'});await ctx.route('**/*',r=>{if(r.request().url().startsWith(origin+'/'))return r.continue();externas++;return r.abort()});
  const page=await ctx.newPage();page.setDefaultTimeout(20000);
  await page.goto(origin+'/');await page.evaluate(()=>navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}));
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  const verificar=async(ver,version)=>page.waitForFunction(async({ver,version})=>{const keys=await caches.keys();if(!keys.includes(ver)||keys.some(x=>x.startsWith('app-')&&x!==ver))return false;const src=await fetch('/js/config.js').then(r=>r.text());return src.includes("versionPantalla: '"+version+"'")},{ver,version},{timeout:30000});
  await verificar(stable,'3.1.49');
  const actualizar=async(faseNueva,ver,version)=>{fase=faseNueva;await page.evaluate(async()=>{window.__swAnterior=navigator.serviceWorker.controller;await (await navigator.serviceWorker.getRegistration()).update();});await page.waitForFunction(()=>{const c=navigator.serviceWorker.controller;return c&&c!==window.__swAnterior&&c.state==='activated';},{},{timeout:30000});await verificar(ver,version);await page.reload();};
  const ficticio={app_memoria_v1:'{"token":"demo-admin","local":"L2","tema":"oscuro"}',mipedido_driver_v2:'{"token":"demo-driver","tema":"claro"}',mipedido_cliente_v2:'{"mis_pedidos":[{"id":"P1"}],"tema":"oscuro"}'};
  await page.evaluate(async d=>{for(const [k,v] of Object.entries(d))localStorage.setItem(k,v);sessionStorage.setItem('prueba','persistente');const c=await caches.open('fotos-1');await c.put('/foto-ficticia',new Response('foto'));await c.put('https://tile.openstreetmap.org/17/1/2.png',new Response('403 anterior'));},ficticio);
  const comprobarDatos=async()=>{assert.deepEqual(await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),Object.keys(ficticio)),ficticio);assert.equal(await page.evaluate(()=>sessionStorage.getItem('prueba')),'persistente');assert.equal(await page.evaluate(async()=>await (await (await caches.open('fotos-1')).match('/foto-ficticia')).text()),'foto');};
  await actualizar('publicada',publicada,'3.1.50');await comprobarDatos();
  assert.equal(await page.evaluate(async()=>!!await (await caches.open('fotos-1')).match('https://tile.openstreetmap.org/17/1/2.png')),true,'el mapa antiguo debe existir antes de la corrección');
  await actualizar('candidata',candidate,'3.1.51');await comprobarDatos();
  assert.equal(await page.evaluate(async()=>!!await (await caches.open('fotos-1')).match('https://tile.openstreetmap.org/17/1/2.png')),false,'al activar el nuevo SW debe desaparecer solo el mapa antiguo');
  // La reversión usa exactamente los archivos del MAIN actual con nombre NUEVO de caché.
  await actualizar('reversion',rollback,'3.1.50');await comprobarDatos();
  assert.equal(externas,0);console.log('PWA REAL: 3.1.49 → MAIN 3.1.50 → corrección 403 → MAIN 3.1.50, activación completa, mapa antiguo eliminado y datos de tres perfiles intactos');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
