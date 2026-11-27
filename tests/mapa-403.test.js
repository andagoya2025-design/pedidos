'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const src=fs.readFileSync('sw.js','utf8'),osm='https://tile.openstreetmap.org/17/1/2.png',foto='https://drive.google.com/foto';
function entorno(status){
 const handlers={},borrados=[],guardados=[],peticiones=[];
 const cache={keys:async()=>[{url:osm},{url:foto}],delete:async r=>{borrados.push(r.url)},put:async(...a)=>guardados.push(a)};
 const self={location:{origin:'https://demo.invalid'},registration:{scope:'https://demo.invalid/'},addEventListener:(n,f)=>handlers[n]=f};
 const ctx={self,URL,Response,caches:{open:async()=>cache},fetch:async r=>{peticiones.push(r);return new Response('tile',{status})}};
 vm.runInNewContext(src,ctx);
 return {ctx,handlers,borrados,guardados,peticiones};
}
test('OSM 403 no se presenta como mapa ni se conserva en fotos',async()=>{
 const e=entorno(403),req={url:osm,method:'GET',mode:'cors',destination:'image',referrerPolicy:'strict-origin-when-cross-origin'};
 let p;e.handlers.fetch({request:req,respondWith:v=>p=v});
 assert.equal((await p).type,'error');assert.equal(e.peticiones[0],req);assert.equal(e.guardados.length,0);
});
test('OSM 200 conserva cache HTTP normal y respuesta válida',async()=>{
 const e=entorno(200),req={url:osm,method:'GET',mode:'cors',destination:'image'};
 let p;e.handlers.fetch({request:req,respondWith:v=>p=v});
 assert.equal((await p).status,200);assert.equal(e.peticiones[0],req);assert.equal(e.guardados.length,0);
});
test('limpieza selectiva de mapas previos sin borrar fotos ni sesión',async()=>{
 const e=entorno(200);await e.ctx.limpiarMapasAntiguos();assert.deepEqual(e.borrados,[osm]);
});
test('ambos mapas identifican su origen, muestran atribución y avisan si falla el mapa',()=>{
 for(const p of ['js/mapa.js','js/monitoreo.js']){const s=fs.readFileSync(p,'utf8');assert.match(s,/strict-origin-when-cross-origin/);assert.match(s,/anonymous/);assert.match(s,/openstreetmap.org\/copyright/);assert.match(s,/mapa-error/);assert.doesNotMatch(s,/referrerpolicy="no-referrer"/);}
});
