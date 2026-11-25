/* DOM real de los componentes bancarios, datos sintéticos y red bloqueada. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,webkit,devices}=require('playwright');
const read=p=>fs.readFileSync(p,'utf8');
const extract=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert.ok(i>=0&&j>i);return s.slice(i,j)};
const admin=extract(read('js/menu.js'),'    var cuentas = [];','    UI.$(\'#aj-deuna-archivo\')');
const payment=extract(read('js/pedir.js'),'  function cuentasBanco()','  var POLITICAS_DEFECTO');
const list=['Banco Pichincha','Banco Guayaquil','Banco del Pacífico','Banco Bolivariano','Produbanco','Banco Internacional de Prueba'].map((b,i)=>({banco:b,tipo:'ahorros',numero:i===4?'DE8937040044053201300012345678901234':'000000000'+i,titular:'Titular de demostración con nombre completo',documento:'',correo:'',activa:i!==5}));
const logo='https://drive.google.com/thumbnail?id=ABCDEF123456789&sz=w800';
list[0].logo_url=logo;
async function run(engine,device,label){
 const browser=await engine.launch();try{
 const page=await browser.newPage(device),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort());
 await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><main style="max-width:600px;margin:auto;padding:12px"><div id="aj-cuentas" class="lista"></div><button id="aj-cuenta-mas">Agregar cuenta</button><section id="pago"></section></main>');
 for(const p of ['css/app.css','css/modulos.css'])await page.addStyleTag({content:read(p)});
 for(const p of ['js/ui.js','js/comun.js'])await page.addScriptTag({content:read(p)});
 await page.addScriptTag({content:'var c={cuentas_bancarias:'+JSON.stringify(JSON.stringify(list))+'};var cuerpo=()=>document.body;var cfg=()=>({cuentas_bancarias:JSON.stringify(cuentas)});var pago={cuenta:""};window.DATOS={pedir:async()=>{throw Error("Red bloqueada")}};'+admin+payment+';window.renderPago=()=>{document.querySelector("#pago").innerHTML=tarjetasCuentas(12,"PED-0001",true);UI.$$("[data-cuenta]").forEach(b=>b.onclick=()=>{pago.cuenta=b.dataset.cuenta;renderPago()})};renderPago();'});
 assert.equal(await page.locator('.banco-admin').count(),6);
 assert.equal(await page.locator('.cuenta-banco').count(),5);
 assert.equal(await page.locator('#aj-cuenta-mas').isHidden(),true);
 // Los logos existentes no se deben volver a subir para recuperar el color de marca.
 assert.equal(await page.locator('.cuenta-banco').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(245, 211, 37)');
 assert.equal(await page.locator('.cuenta-banco .banco-marca').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
 // Extracción real desde imágenes locales, sin red ni datos de producción.
 const palette=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,64,64);ctx.fillStyle='#07569b';ctx.fillRect(8,8,48,48);
   const results={};
   for(const mime of ['image/png','image/jpeg','image/webp']){
     const data=canvas.toDataURL(mime,1);
     if(data.startsWith('data:'+mime+';'))results[mime]=await UI.colorLogoBanco(data);
   }
   results.invalid=await UI.colorLogoBanco('data:image/png;base64,invalid');
   return results;
 });
 assert.equal(palette['image/png'],'#07569b');
 for(const mime of ['image/jpeg','image/webp'])if(palette[mime]){const c=palette[mime];assert.ok(/^#[0-9a-f]{6}$/i.test(c));assert.ok([1,3,5].every((i,j)=>Math.abs(parseInt(c.slice(i,i+2),16)-[7,86,155][j])<=12),mime+': '+c);}
 assert.equal(palette.invalid,'');

 await page.locator('[data-cta-ed="0"]').click();
 await page.locator('#cta-logo-quitar').click();
 await page.locator('#cta-color').fill('#f5d325');
 await page.locator('#cta-n').fill('GB82WEST12345698765432');
 await page.getByRole('button',{name:'Listo',exact:true}).click();
 await page.locator('.ventana').waitFor({state:'hidden'});
 await page.evaluate(()=>renderPago());
 assert.equal(await page.locator('.cuenta-banco').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(245, 211, 37)');
 assert.equal(await page.locator('.cuenta-banco').first().evaluate(e=>getComputedStyle(e).color),'rgb(0, 0, 0)');
 assert.equal(await page.locator('.cuenta-banco .banco-marca').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
 assert.match(await page.locator('.banco-admin').first().innerText(),/GB82WEST12345698765432/);
 await page.locator('[data-cuenta]').nth(1).click();
 assert.equal(await page.locator('.cuenta-banco.elegida').count(),1);
 await page.locator('[data-cuenta]').nth(4).click();
 assert.match(await page.locator('.cuenta-banco.elegida').innerText(),/Produbanco/);
 assert.equal(await page.locator('.cuenta-banco.elegida .cb-numero button').getAttribute('data-copiar'),list[4].numero);
 const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('.banco-admin-acciones button,.cb-elegir')].map(e=>e.getBoundingClientRect().height),overflow:[...document.querySelectorAll('.banco-admin,.cuenta-banco')].filter(e=>e.scrollWidth>e.clientWidth+2).length}));
 assert.ok(metrics.scroll<=metrics.width+2,JSON.stringify(metrics));assert.equal(metrics.overflow,0);assert.ok(metrics.buttons.every(h=>h>=43),JSON.stringify(metrics));
 assert.deepEqual(errors,[]);console.log('PASS '+label+': 6 cuentas admin, 5 públicas, edición IBAN, cambio de banco, valor de copia, tamaños táctiles, sin desbordamiento, red bloqueada');
 }finally{await browser.close()}
}
(async()=>{await run(webkit,devices['iPhone SE'],'iPhone SE');await run(webkit,devices['iPhone 13'],'iPhone 13');await run(chromium,{viewport:{width:360,height:740},isMobile:true,hasTouch:true},'Android compacto');await run(chromium,{viewport:{width:1366,height:768}},'Escritorio');})().catch(e=>{console.error(e);process.exitCode=1});
