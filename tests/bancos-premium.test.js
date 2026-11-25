const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const src=read('js/comun.js'), start=src.indexOf('  UI.logoBanco ='),end=src.indexOf('  UI.NOMBRE_PAGO =',start);
const UI={esc:v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};vm.runInNewContext(src.slice(start,end),{UI});
test('cinco bancos reconocidos, acentos y alias',()=>{for(const n of ['Banco Pichincha','Banco Guayaquil','Banco del Pacífico','Banco Bolivariano','Produbanco','BANCO DE PICHINCHA'])assert.match(UI.logoBanco(n),/<img src="https:\/\//);});
test('banco desconocido mantiene alternativa sin recurso externo',()=>{assert.doesNotMatch(UI.logoBanco('Banco Nuevo'),/<img/);assert.doesNotMatch(UI.logoBanco('constructor'),/<img/);assert.doesNotMatch(UI.logoBanco('<script>'),/<script>/);});
test('logo compartido y controles existentes conservados',()=>{const m=read('js/menu.js'),p=read('js/pedir.js');assert.match(m,/UI\.logoBanco\(x\.banco,x\.logo_url\)/);assert.match(p,/UI\.logoBanco\(x\.banco,x\.logo_url\)/);for(const x of ['data-cta-ed','data-cta-del','d.cuentas_bancarias = JSON.stringify(cuentas)'])assert.ok(m.includes(x));for(const x of ['x.activa !== false','data-cuenta','data-copiar','etiquetaCuenta(x)'])assert.ok(p.includes(x));});

const gs=read('servidor/Codigo.gs');
const a=gs.indexOf('function cuentasLimpias_('),b=gs.indexOf('/* Datos públicos',a);
const clean=new Function('limpiarTexto_','fallo_',gs.slice(a,b)+';return cuentasLimpias_')((v,m)=>String(v??'').trim().slice(0,m),x=>Error(x));
const base={banco:'Banco Ejemplo',tipo:'ahorros',numero:'0000000001',titular:'Demo',documento:'',correo:'',activa:true};
const logo='https://drive.google.com/thumbnail?id=ABCDEF123456789&sz=w800';
test('cuenta anterior, ceros iniciales y cuenta internacional',()=>{const x=JSON.parse(clean([base,{...base,numero:'DE89370400440532013000',documento:'AB-1234567',logo_url:logo,activa:false}]));assert.equal(x[0].numero,base.numero);assert.equal(x[1].numero,'DE89370400440532013000');assert.equal(x[1].documento,'AB-1234567');assert.equal(x[1].logo_url,logo);assert.equal(x[1].activa,false);});
test('logo personalizado prioritario y rechazo de URL arbitraria',()=>{assert.ok(UI.logoBanco('Banco Pichincha',logo).includes('ABCDEF123456789'));assert.throws(()=>clean([{...base,logo_url:'https://example.com/a.png'}]));assert.doesNotMatch(UI.logoBanco('Otro','javascript:alert(1)'),/<img/);});
test('límite seis cuentas y rechazo identificador inválido',()=>{assert.throws(()=>clean(Array(7).fill(base)));assert.throws(()=>clean([{...base,numero:'<script>'}]));});
test('copia conserva caracteres de IBAN y editor permite subida',()=>{assert.ok(read('js/pedir.js').includes("x.numero.replace(/[ -]/g, '')"));assert.ok(read('js/menu.js').includes("tipo:'banco'"));assert.ok(gs.includes("banco ? 'Logotipos bancarios'"));});

test('paleta guardada y validada por servidor',()=>{assert.equal(JSON.parse(clean([{...base,color:'#f5d325'}]))[0].color,'#f5d325');assert.throws(()=>clean([{...base,color:'red'}]));assert.equal(JSON.parse(clean([base]))[0].color,'');});
