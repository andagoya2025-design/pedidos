const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,webkit,devices}=require('playwright');
const source=fs.readFileSync('js/pedidos.js','utf8');
const a=source.indexOf('  function maxExtraAdmin('),b=source.indexOf('  function enlaceAvisoPropuesta(',a);
assert.ok(a>=0&&b>a);
const code=source.slice(a,b);
const menu={platos:[{id:'a',nombre:'Almuerzo del día',local_id:'L',activo:true,precio:3.5,extras:[{nombre:'Chifle',precio:.5,max_cantidad:10}]},{id:'b',nombre:'Jugo natural',local_id:'L',activo:true,precio:1.5,extras:[]},...Array.from({length:12},(_,i)=>({id:'p'+i,nombre:'Alternativa '+i,local_id:'L',activo:true,precio:4,extras:[]}))]};
const pedido={total:20.5,detalle:[{id:'r1',plato_id:'c',nombre:'Caldo de bola',precio:3,cantidad:2,extras:''},{id:'r2',plato_id:'b',nombre:'Jugo natural',precio:1.5,cantidad:1,extras:''}]};
const solicitud={id:'S',numero:'PED-0001',local_id:'L',tipo:'cambiar',detalle:'Sustituir 1 × Caldo de bola por 1 × Almuerzo del día',retiros_solicitados:[{id:'r1',cantidad:1}],items_solicitados:[{plato_id:'a',cantidad:1,extras:['Chifle']}]};
async function run(engine,device,label){
 const browser=await engine.launch();try{
 const page=await browser.newPage(device),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort());
 await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><body></body>');
 for(const f of ['css/app.css','css/modulos.css'])await page.addStyleTag({content:fs.readFileSync(f,'utf8')});
 await page.addScriptTag({content:fs.readFileSync('js/ui.js','utf8')});
 await page.addScriptTag({content:'window.calls=[];window.DATOS={pedir:async(a,d,o)=>{calls.push({a,d,o});if(a==="menuListar")return '+JSON.stringify(menu)+';if(a==="pedidoCambioCotizar")return {total_estimado:21.5};throw Error("Escritura prohibida");}};UI.compararTotalesCambio=()=>"<p>Importe de prueba</p>";UI.compararDetalleCambio=()=>"";'+code+';window.iniciar=(x,p)=>cotizarSolicitud(x,p);'});
 await page.evaluate(({x,p})=>{window.proceso=iniciar(x,p)},{x:solicitud,p:pedido});
 const modal=page.locator('.ux-sustitucion-premium');await modal.waitFor();
 assert.equal(await modal.locator('[data-cantidad="r0"]').inputValue(),'1');
 assert.equal(await modal.locator('[data-cantidad="a0"]').inputValue(),'1');
 assert.equal(await modal.locator('[data-extra="0-0"]').inputValue(),'1');
 assert.equal(await modal.locator('[data-cantidad="a1"]').isVisible(),false);
 assert.equal(await modal.locator('[data-premium-alternativas]').getAttribute('aria-expanded'),'false');
 const size=await modal.evaluate(e=>({w:e.getBoundingClientRect().width,v:innerWidth,scroll:[...e.querySelectorAll('.ux-cambio-lista')].map(x=>getComputedStyle(x).overflowY),button:e.querySelector('[data-paso]').getBoundingClientRect().height}));assert.ok(size.w<=size.v+1);assert.ok(size.button>=44);assert.ok(size.scroll.every(x=>x==='visible'));
 await modal.locator('[data-premium-alternativas]').click();
 assert.equal(await modal.locator('[data-cantidad="a1"]').isVisible(),true);
 await modal.locator('[data-buscar]').fill('Alternativa 11');
 assert.equal(await modal.locator('[data-cantidad="a13"]').isVisible(),true);
 await modal.locator('[data-premium-alternativas]').click();
 assert.equal(await modal.locator('[data-cantidad="a0"]').isVisible(),true);
 const plus=modal.locator('.ux-cambio-fila').filter({has:modal.locator('[data-cantidad="a0"]')}).locator('.ux-cambio-controles [data-paso="1"]');
 await plus.click();assert.equal(await modal.locator('[data-cantidad="a0"]').inputValue(),'2');
 await modal.getByRole('button',{name:'Revisar propuesta',exact:true}).click();
 await page.getByRole('heading',{name:'Propuesta definitiva · PED-0001'}).waitFor();
 const calls=await page.evaluate(()=>window.calls);
 assert.deepEqual(calls.map(c=>c.a),['menuListar','pedidoCambioCotizar']);
 assert.deepEqual(calls[1].d.seleccion,{retirar:[{id:'r1',cantidad:1}],agregar:[{plato_id:'a',cantidad:2,extras:['Chifle']}]});
 await page.getByRole('button',{name:'Volver',exact:true}).click();
 await page.evaluate(()=>window.proceso);
 assert.deepEqual(errors,[]);
 console.log('PASS '+label+': sustitución precargada, alternativas, búsqueda, cantidad, extras, cotización exacta y cero escrituras');
 }finally{await browser.close();}
}
(async()=>{await run(webkit,devices['iPhone 13 Mini'],'iPhone 13 mini WebKit');await run(webkit,devices['iPhone SE'],'iPhone SE WebKit');await run(chromium,{viewport:{width:360,height:640},isMobile:true,hasTouch:true},'Android compacto Chromium');})().catch(e=>{console.error(e);process.exitCode=1;});
