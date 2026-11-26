'use strict';
const {chromium,webkit,devices}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const app=fs.readFileSync('css/app.css','utf8'),modules=fs.readFileSync('css/modulos.css','utf8');
const markup='<div id="app" class="app"><header class="cabecera"><div class="marca"><div class="marca-logo" data-marca-logo>AB</div><div style="min-width:0"><div class="marca-nombre">Negocio de prueba muy largo</div><div class="marca-sub">Propietario</div></div></div><select class="selector-local" id="selector-local"><option>Local Norte</option><option>Local Sur</option></select><button class="mip-avisos" id="mip-avisos" aria-label="Avisos">!</button></header><nav class="navegacion" id="navegacion">'+['Inicio','Pedidos','Menú','Motorizados','Configuración','Caja','Reportes','Inventario'].map((x,i)=>'<button class="nav-btn" data-vista="'+i+'" '+(i===0?'aria-current="page"':'')+'><span class="ico">•</span>'+x+'</button>').join('')+'</nav><main class="contenido" id="contenido"><div class="tarjeta bienvenida"><h2>Hola, Prueba</h2><p>Dueño · Todos</p></div><div class="rejilla r3">'+['Pedidos','Menú','Motorizados','Inventario'].map((x,i)=>'<div class="tarjeta modulo enlace" role="button" tabindex="0" data-ir="'+i+'"><div class="modulo-ico">•</div><div style="flex:1;min-width:0"><h3>'+x+'</h3><p>Acceso al módulo correspondiente</p></div><span aria-hidden="true" style="font-size:22px">›</span></div>').join('')+'</div><div id="mn-cuerpo"><div class="lista"><div class="item plato-admin"><div class="miniatura">P</div><div class="item-cuerpo"><div class="item-titulo">Plato de prueba con nombre largo</div><div class="item-sub">$4 · Todos los locales · 2 extra(s)</div></div><label class="interruptor" style="min-height:40px"><input type="checkbox" data-agotado="A"> Agotado</label><button class="btn secundario chico" data-editar="A">Editar</button></div></div></div></main></div>';
async function run(engine,opts,label){
 const browser=await engine.launch();try{
 const page=await browser.newPage(opts);await page.route('**/*',r=>r.abort());
 await page.setContent('<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+app+'\n'+modules+'</style></head><body class="mip-premium-admin">'+markup+'</body></html>');
 for(const theme of ['claro','oscuro']){
 await page.evaluate(t=>{document.documentElement.dataset.tema=t;document.documentElement.style.setProperty('--primario','#244466');document.documentElement.style.setProperty('--acento','#be3244');},theme);
 const result=await page.evaluate(()=>{const q=s=>document.querySelector(s),r=s=>q(s).getBoundingClientRect(),a=r('[data-agotado]'),b=r('[data-editar]');return {width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,photo:r('.miniatura').width,edit:b.height,overlap:a.right>b.left&&a.bottom>b.top&&a.top<b.bottom,nav:q('#navegacion').children.length,accent:getComputedStyle(document.documentElement).getPropertyValue('--acento').trim()};});
 assert.ok(result.scroll<=result.width+1,label+' horizontal overflow');assert.ok(result.photo>=76);assert.ok(result.edit>=44);assert.equal(result.overlap,false);assert.equal(result.nav,8);assert.equal(result.accent,'#be3244');
 await page.locator('[data-agotado]').check();assert.equal(await page.locator('[data-agotado]').isChecked(),true);await page.locator('[data-agotado]').uncheck();
 await page.locator('[data-editar]').click();await page.locator('[data-ir="0"]').click();await page.locator('#selector-local').selectOption({label:'Local Sur'});
 }
 console.log('Premium visual: '+label+' claro/oscuro OK');
 }finally{await browser.close()}
}
(async()=>{await run(webkit,devices['iPhone SE'],'iPhone SE');await run(webkit,devices['iPhone 13'],'iPhone 13');await run(chromium,{viewport:{width:360,height:740},isMobile:true,hasTouch:true},'Android compacto');await run(chromium,{viewport:{width:1366,height:768}},'Escritorio');})().catch(e=>{console.error(e);process.exitCode=1});
