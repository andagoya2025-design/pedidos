// 3.1.59 — Configuración > Locales en el teléfono: el nombre y la dirección nunca se aprietan en una columna angosta,
// no hay desplazamiento lateral y los botones se pueden tocar. Usa las hojas de estilo reales y datos ficticios.
const assert=require('node:assert/strict'),fs=require('node:fs');const {chromium,webkit}=require('playwright');const read=p=>fs.readFileSync(p,'utf8');
// La fila debe seguir teniendo la misma estructura que usa el programa (si cambia, esta prueba lo avisa).
const fuente=read('js/configuracion.js');
assert.match(fuente,/<div class="item"><div class="avatar" aria-hidden="true">📍<\/div><div class="item-cuerpo">/,'estructura de la fila de local cambió');
assert.match(fuente,/data-editar="' \+ UI\.esc\(l\.id\)/);assert.match(fuente,/data-pausar="' \+ UI\.esc\(l\.id\)/);
const fila=(n,d,t,act,p)=>'<div class="item"><div class="avatar" aria-hidden="true">📍</div><div class="item-cuerpo"><div class="item-titulo">'+n+'</div><div class="item-sub">'+d+(t?' · '+t:'')+'</div></div><span class="etiqueta '+(act?'ok':'mal')+'">'+(act?'Activo':'Inactivo')+'</span><button class="btn secundario chico" type="button" data-editar="L1">Editar</button><button class="btn secundario chico" type="button" data-pausar="L1">'+(p?'▶ Reanudar pedidos':'⏸ Pausar pedidos')+'</button></div>';
const html='<meta name="viewport" content="width=device-width,initial-scale=1"><body class="mip-premium-admin"><main id="app"><div id="cfg-cuerpo"><div class="acciones" style="margin:0 0 12px"><button class="btn" type="button">＋ Agregar local</button></div><div class="lista">'+
 fila('Local 1','Sin dirección','',true,false)+fila('Local 2 Centro Histórico de Quito','Av. Amazonas N24-123 y Colón, edificio Torre Norte, piso 3, oficina 301','0991234567',false,true)+fila('Local 3','Sin dirección','',true,true)+fila('Sucursal Norte Carolina','Calle sin espacios: AvenidaNaciones UnidasYRepublicaDelSalvadorEdificioMetropolitano','',true,false)+'</div></div></main></body>';
async function run(engine,label,w){
 const browser=await engine.launch();try{
  const page=await browser.newPage({viewport:{width:w,height:900}}),errores=[];page.on('pageerror',e=>errores.push(e.message));
  await page.setContent(html);for(const c of ['css/app.css','css/modulos.css','css/admin-elite.css','css/premium-integral.css'])await page.addStyleTag({content:read(c)});await page.waitForTimeout(200);
  const m=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth-innerWidth,filas:[...document.querySelectorAll('.item')].map(i=>{const r=i.getBoundingClientRect(),t=i.querySelector('.item-titulo'),tr=t.getBoundingClientRect(),lh=parseFloat(getComputedStyle(t).lineHeight)||23;return{ancho:Math.round(tr.width),lineas:Math.round(tr.height/lh),alto:Math.round(r.height),fuera:[...i.children].some(x=>{const b=x.getBoundingClientRect();return b.right>r.right+1||b.left<r.left-1}),botones:[...i.querySelectorAll('button')].map(b=>{const q=b.getBoundingClientRect();return{h:Math.round(q.height),w:Math.round(q.width)}})}})}));
  assert.ok(m.scroll<=1,label+' '+w+': sin desplazamiento lateral ('+m.scroll+'px de sobra)');
  m.filas.forEach((f,n)=>{
   assert.ok(f.ancho>=Math.min(200,w-120),label+' '+w+' fila '+(n+1)+': el nombre tiene espacio ('+f.ancho+'px), no queda letra por letra');
   assert.ok(f.lineas<=3,label+' '+w+' fila '+(n+1)+': el nombre ocupa pocas líneas ('+f.lineas+')');
   assert.ok(f.alto<=280,label+' '+w+' fila '+(n+1)+': la tarjeta no se estira de más ('+f.alto+'px)');
   assert.equal(f.fuera,false,label+' '+w+' fila '+(n+1)+': nada se sale de la tarjeta');
   f.botones.forEach(b=>{assert.ok(b.h>=40&&b.w>=60,label+' '+w+' fila '+(n+1)+': botones tocables ('+b.w+'×'+b.h+')')});
  });
  assert.deepEqual(errores,[]);
 }finally{await browser.close()}
}
(async()=>{for(const [engine,label] of [[webkit,'iPhone/WebKit'],[chromium,'Android/Chromium']])for(const w of [320,360,375,390,430,600,768,1366])await run(engine,label,w);console.log('PASS Locales en el teléfono: nombre legible, sin desplazamiento lateral y botones tocables (320 a 1366 px)')})().catch(e=>{console.error(e);process.exit(1)});
