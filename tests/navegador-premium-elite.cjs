'use strict';
/* Render real de index/app/menu/configuración. Red externa bloqueada y datos ficticios. */
const assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),{chromium,webkit,devices}=require('playwright');
const BASE='e8d6ea2f4b7b3344814f611177992be1f8ad54ce';
const read=(p,old)=>old?execFileSync('git',['show',BASE+':'+p],{encoding:'utf8',maxBuffer:8*1024*1024}):fs.readFileSync(p,'utf8');
fs.mkdirSync('capturas-elite',{recursive:true});
const protectedFiles=['js/datos.js','js/ui.js','js/comun.js','js/pedir.js','js/pedidos.js','js/motorizados.js','js/notificaciones.js','js/voz.js','js/avisos-cliente.js','js/caja.js','js/inventario.js','js/reportes.js','servidor/Codigo.gs','servidor/Codigo_MiPedido_3.1.30.txt','pedir.html','driver.html','css/app.css','css/modulos.css'];
for(const p of protectedFiles)assert.equal(read(p,false),read(p,true),'Archivo protegido modificado: '+p);
const cfg={negocio_nombre:'Restaurante Demo',logo_url:'',color_primario:'#251c17',color_acento:'#992b00',moneda:'USD',ciudad:'Quito',pais_codigo:'593',zona_horaria:'America/Guayaquil',iva_porcentaje:15,precios_incluyen_iva:'SI',whatsapp:'',cuentas_bancarias:'[]',permitir_clave_cajero:'NO',permitir_clave_motorizado:'NO'};
const catalog={categorias:[{id:'C',nombre:'Platos principales',activo:true,local_id:'TODOS'}],platos:[{id:'A',nombre:'Seco de pollo',categoria_id:'C',local_id:'TODOS',precio:4,descripcion:'Prueba',foto_url:'',extras:[{nombre:'Aguacate extra',precio:.75,max_cantidad:5}],agotado:false,activo:true,etiquetas:'',sugerido:true},{id:'B',nombre:'Caldo de bola con arroz y pollo',categoria_id:'C',local_id:'TODOS',precio:3,descripcion:'',foto_url:'',extras:[],agotado:false,activo:true,etiquetas:'',sugerido:false},{id:'C',nombre:'Plato oculto',categoria_id:'C',local_id:'TODOS',precio:5,descripcion:'',foto_url:'',extras:[],agotado:false,activo:false,etiquetas:'',sugerido:false}],zonas:[]};
async function run(engine,device,label,old){
 const browser=await engine.launch();try{
 const context=await browser.newContext({...device,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 let html=read('index.html',old).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 await page.route('**/*',r=>r.request().url()==='https://mipedido.test/index.html'?r.fulfill({contentType:'text/html',body:html}):r.abort());
 await page.goto('https://mipedido.test/index.html');
 for(const p of ['css/app.css','css/modulos.css',...(!old?['css/admin-elite.css']:[])])await page.addStyleTag({content:read(p,old)});
 await page.addScriptTag({content:read('js/ui.js',old)});
 await page.addScriptTag({content:'window.__cfg='+JSON.stringify(cfg)+';window.__catalog='+JSON.stringify(catalog)+';window.__calls=[];window.__fail=false;var mem={token:"ficticio",guia_oculta:true};window.APP_MEMORIA={leer:k=>mem[k],guardar:(k,v)=>mem[k]=v,limpiarSesion:()=>{mem={}}};window.APP_CONFIG={configurada:true};var ses={nombre:"Operador Demo",rol:"dueno",usuario_id:"U1",local_id:"L1"};window.DATOS={estado:async()=>({instalado:true,config:__cfg,licencia:{}}),pedir:async(a,d,o)=>{__calls.push({a,d,guardar:!!(o&&o.guardar)});if(a==="sesion")return {sesion:ses,publico:__cfg,puede_cambiar_clave:true};if(a==="localesListar")return {locales:[{id:"L1",nombre:"Local Norte",activo:true},{id:"L2",nombre:"Local Sur",activo:true}]};if(a==="menuListar")return __catalog;if(a==="configObtener")return {config:__cfg,licencia:{}};if(a==="platoAgotado"){if(__fail)throw Error("Fallo simulado");return {}};if(a==="cerrarSesion")return {};throw Error("Acción no simulada "+a)}};UI.error=(t,m)=>{window.__err=m};UI.aviso=()=>{};'});
 for(const p of ['js/app.js','js/configuracion.js','js/comun.js','js/menu.js'])await page.addScriptTag({content:read(p,old)});
 await page.addScriptTag({content:'APP.vistas.pedidos={titulo:"Pedidos",icono:"🧾",roles:["dueno","cajero"],orden:10,pintar:c=>{c.textContent="Panel pedidos"}};APP.vistas.motorizados={titulo:"Motorizados",icono:"🛵",roles:["dueno"],orden:30,pintar:c=>{c.textContent="Motorizados"}};APP.vistas.caja={titulo:"Caja",icono:"💵",roles:["dueno"],orden:40,pintar:c=>{c.textContent="Caja"}};document.dispatchEvent(new Event("DOMContentLoaded"));'});
 await page.locator('#app').waitFor({state:'visible'});await page.waitForFunction(()=>APP.vistaActual==='inicio');
 const prefix='capturas-elite/'+label+'-'+(old?'antes':'despues');
 async function shot(name){await page.screenshot({path:prefix+'-'+name+'.png',fullPage:true,animations:'disabled'});}
 async function noOverflow(){const v=await page.evaluate(()=>[document.documentElement.clientWidth,document.documentElement.scrollWidth]);assert.ok(v[1]<=v[0]+1,label+' overflow '+v);}
 await noOverflow();await shot('inicio');
 if(!old){assert.equal(await page.locator('.elite-contexto strong').textContent(),'Todos los locales');assert.equal(await page.locator('.elite-modulos').count(),1);const hero=await page.locator('.bienvenida').evaluate(e=>getComputedStyle(e).backgroundColor);assert.notEqual(hero,'rgba(0, 0, 0, 0)');}
 await page.locator('[data-vista="menu"]').click();await page.locator('[data-agotado="A"]').waitFor();
 await noOverflow();await shot('catalogo');
 if(!old){assert.deepEqual(await page.locator('.elite-catalogo-resumen strong').allTextContents(),['3','2','1']);assert.equal(await page.locator('.elite-precio').count(),3);}
 const before=await page.evaluate(()=>__calls.filter(x=>x.guardar).length);
 await page.locator('[data-agotado="A"]').check();
 await page.waitForFunction(()=>!document.querySelector('[data-agotado="A"]').disabled);
 const writes=await page.evaluate(()=>__calls.filter(x=>x.guardar));assert.equal(writes.length,before+1);assert.deepEqual(writes.at(-1),{a:'platoAgotado',d:{id:'A',agotado:true},guardar:true});
 await page.evaluate(()=>{__fail=true});await page.locator('[data-agotado="A"]').click();await page.waitForFunction(()=>!document.querySelector('[data-agotado="A"]').disabled&&window.__err==='Fallo simulado');assert.equal(await page.locator('[data-agotado="A"]').isChecked(),true);const attempts=await page.evaluate(()=>__calls.filter(x=>x.guardar));assert.equal(attempts.length,before+2);assert.deepEqual(attempts.at(-1),{a:'platoAgotado',d:{id:'A',agotado:false},guardar:true});
 await page.locator('[data-editar="A"]').click();await page.locator('#form-plato').waitFor();assert.equal(await page.locator('#pl-precio').inputValue(),'4');assert.equal(await page.locator('[data-ex-precio]').inputValue(),'0.75');await page.locator('.ventana-x').click();
 await page.locator('[data-vista="config"]').click();await page.locator('#form-negocio').waitFor();
 assert.equal(await page.locator('#cf-negocio_nombre').inputValue(),'Restaurante Demo');await noOverflow();await shot('configuracion');
 await page.locator('[data-p="seguridad"]').click();await page.locator('#form-seguridad').waitFor();
 assert.equal(await page.locator('#seg-moto').isChecked(),false);
 assert.deepEqual(errors,[]);
 if(!old){await page.evaluate(()=>{UI.tema('oscuro');UI.aplicarMarca({...__cfg,color_primario:'#244466',color_acento:'#be3244'})});await page.locator('[data-vista="inicio"]').click();await noOverflow();await shot('inicio-oscuro');assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--acento').trim()),'#be3244');await page.evaluate(()=>{UI.tema('claro');UI.aplicarMarca({...__cfg,color_primario:'#ffffff',color_acento:'#ffffff'})});const contrasts=await page.evaluate(()=>['.bienvenida','.navegacion','.nav-btn[aria-current=page]'].map(s=>{const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.fillStyle=getComputedStyle(document.querySelector(s)).backgroundColor;x.fillRect(0,0,1,1);const [r,g,b]=x.getImageData(0,0,1,1).data;const lin=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4};return 1.05/(.2126*lin(r)+.7152*lin(g)+.0722*lin(b)+.05)}));assert.ok(contrasts.every(v=>v>=4.5),JSON.stringify(contrasts));}
 console.log('ELITE '+label+' '+(old?'ANTES':'DESPUÉS')+' — pantallas reales, catálogo, guardado único, error revertido, editor de extras, seguridad, marca OK');
 await context.close();
 }finally{await browser.close()}
}
(async()=>{for(const [engine,device,label] of [[webkit,devices['iPhone SE'],'iphone-se'],[webkit,devices['iPhone 13'],'iphone-13'],[chromium,{viewport:{width:360,height:740},isMobile:true,hasTouch:true},'android'],[chromium,{viewport:{width:1366,height:768}},'escritorio']])for(const old of [true,false])await run(engine,device,label,old)})().catch(e=>{console.error(e);process.exitCode=1});
