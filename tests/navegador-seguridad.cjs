/* Componentes reales de autenticación y configuración; ningún acceso a producción. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,webkit,devices}=require('playwright');
const read=p=>fs.readFileSync(p,'utf8');
const html='<meta name="viewport" content="width=device-width,initial-scale=1"><main id="ingreso" hidden><div id="ingreso-mensaje"></div><form id="form-ingreso"><input id="ing-usuario" name="usuario"><input id="ing-clave" name="clave" type="password"><button type="button" id="ver-clave">Ver</button><button type="submit">Ingresar</button></form></main><div id="app" hidden><div id="usuario-chip"></div><select id="selector-local"></select><nav id="navegacion"></nav><main id="contenido"></main></div>';
async function run(engine,device,label){
 const browser=await engine.launch();try{
 for(const rol of ['dueno','cajero','motorizado']){
  const context=await browser.newContext({...device,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith('https://mipedido.test/')?r.fulfill({contentType:'text/html',body:html}):r.abort());
  await page.goto('https://mipedido.test/'+(rol==='motorizado'?'driver.html':'index.html')+'#cuenta');
  for(const p of ['css/app.css','css/modulos.css'])await page.addStyleTag({content:read(p)});
  await page.addScriptTag({content:read('js/ui.js')});
  await page.addScriptTag({content:'window.__rol='+JSON.stringify(rol)+';'+
    'window.__cfg={permitir_clave_motorizado:"NO",permitir_clave_cajero:"NO"};window.__writes=[];window.__error="";var mem={};window.APP_MEMORIA={leer:k=>mem[k],guardar:(k,v)=>mem[k]=v,limpiarSesion:()=>{mem={}}};window.APP_CONFIG={configurada:true};'+
    'var ses={nombre:"Demo",rol:__rol,usuario_id:"U1",local_id:"L1"};var allowed=()=>__rol==="dueno"||__cfg["permitir_clave_"+__rol]==="SI";'+
    'window.DATOS={estado:async()=>({instalado:true,config:{},licencia:{}}),pedir:async(a,d)=>{if(a==="login")return {token:"ficticio",sesion:ses,publico:{}};if(a==="sesion")return {sesion:ses,publico:{},puede_cambiar_clave:allowed()};if(a==="localesListar")return {locales:[{id:"L1",nombre:"Demo",activo:true}]};if(a==="configObtener")return {config:{...__cfg},licencia:{}};if(a==="configGuardar"){if(__rol!=="dueno")throw Error("permiso");Object.assign(__cfg,d.config);__writes.push(a);return {config:{...__cfg}}}if(a==="miClave"){if(!allowed())throw Object.assign(Error("Sin permiso"),{codigo:"PERMISO"});__writes.push(a);return {}}if(a==="cerrarSesion")return {};throw Error("Acción no simulada "+a)}};UI.error=(t,m)=>{__error=m};UI.confirmar=async()=>true;'});
  await page.addScriptTag({content:read('js/app.js')});
  await page.addScriptTag({content:read('js/configuracion.js')});
  await page.addScriptTag({content:'APP.vistas.pedidos={titulo:"Pedidos",roles:["dueno","cajero"],orden:10,pintar:c=>{c.textContent="Panel pedidos"}};APP.vistas.entregas={titulo:"Entregas",roles:["motorizado"],orden:10,pintar:c=>{c.textContent="Panel entregas"}};document.dispatchEvent(new Event("DOMContentLoaded"));'});
  await page.locator('#ingreso').waitFor({state:'visible'});
  await page.locator('#ing-usuario').fill('demo');await page.locator('#ing-clave').fill('ficticia');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
  await page.locator('#app').waitFor({state:'visible'});
  const home=rol==='dueno'?'inicio':rol==='cajero'?'pedidos':'entregas';
  await page.waitForFunction(h=>APP.vistaActual===h,home);
  assert.equal(await page.locator('#form-mi-clave').count(),0);
  await page.locator('[data-vista="cuenta"]').click();
  await page.waitForFunction(()=>APP.vistaActual==='cuenta');
  if(rol==='dueno'){
   await page.locator('#abrir-mi-clave').waitFor({state:'visible'});
   assert.equal(await page.locator('#form-mi-clave').isHidden(),true);
   await page.locator('[data-vista="config"]').click();await page.locator('[data-p="seguridad"]').click();
   await page.locator('#seg-moto').check();await page.locator('#seg-caja').check();
   await page.locator('#form-seguridad button').click();
   await page.waitForFunction(()=>__cfg.permitir_clave_motorizado==='SI'&&__cfg.permitir_clave_cajero==='SI');
   assert.deepEqual(await page.evaluate(()=>__writes),['configGuardar']);
  }else{
   assert.equal(await page.locator('#panel-mi-clave').isHidden(),true);
   assert.equal(await page.locator('[data-vista="config"]').count(),0);
   await page.evaluate(()=>{__cfg['permitir_clave_'+__rol]='SI';APP.ir('cuenta')});
   await page.locator('#abrir-mi-clave').waitFor({state:'visible'});
  }
  await page.evaluate(()=>APP.ir('cuenta'));
  await page.locator('#abrir-mi-clave').click();
  await page.locator('#mc-actual').fill('ficticia');await page.locator('#mc-nueva').fill('nueva123');
  await page.locator('#cancelar-mi-clave').click();
  assert.equal(await page.locator('#form-mi-clave').isHidden(),true);
  assert.equal(await page.locator('#mc-nueva').inputValue(),'');
  await page.locator('#abrir-mi-clave').click();
  await page.locator('#mc-actual').fill('ficticia');await page.locator('#mc-nueva').fill('nueva123');
  if(rol!=='dueno'){
   await page.evaluate(()=>{__cfg['permitir_clave_'+__rol]='NO'});
   await page.locator('#form-mi-clave button[type=submit]').click();
   await page.waitForFunction(()=>__error==='Sin permiso');
   assert.equal(await page.locator('#panel-mi-clave').isHidden(),true);
   assert.deepEqual(await page.evaluate(()=>__writes),[]);
  }else{
   await page.locator('#form-mi-clave button[type=submit]').click();
   await page.waitForFunction(()=>__writes.includes('miClave'));
   assert.equal(await page.locator('#form-mi-clave').isHidden(),true);
  }
  await page.locator('#btn-salir').click();await page.locator('#ingreso').waitFor({state:'visible'});
  assert.equal(new URL(page.url()).hash,'');
  await page.locator('#ing-usuario').fill('demo');await page.locator('#ing-clave').fill('ficticia');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
  await page.waitForFunction(h=>APP.vistaActual===h&&!!APP.sesion,home);
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('PASS '+label+' '+rol+' inicio, permisos, cancelación, revocación, cierre y reingreso');
 }
 }finally{await browser.close()}
}
(async()=>{await run(webkit,devices['iPhone SE'],'iPhone SE');await run(chromium,{viewport:{width:360,height:740},isMobile:true,hasTouch:true},'Android compacto');await run(chromium,{viewport:{width:1366,height:768}},'Escritorio')})().catch(e=>{console.error(e);process.exitCode=1});
