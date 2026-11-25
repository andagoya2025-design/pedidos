const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const src=read('js/comun.js'), start=src.indexOf('  UI.logoBanco ='),end=src.indexOf('  UI.NOMBRE_PAGO =',start);
const UI={esc:v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};vm.runInNewContext(src.slice(start,end),{UI});
test('cinco bancos reconocidos, acentos y alias',()=>{for(const n of ['Banco Pichincha','Banco Guayaquil','Banco del Pacífico','Banco Bolivariano','Produbanco','BANCO DE PICHINCHA'])assert.match(UI.logoBanco(n),/<img src="https:\/\//);});
test('banco desconocido mantiene alternativa sin recurso externo',()=>{assert.doesNotMatch(UI.logoBanco('Banco Nuevo'),/<img/);assert.doesNotMatch(UI.logoBanco('constructor'),/<img/);assert.doesNotMatch(UI.logoBanco('<script>'),/<script>/);});
test('logo compartido y controles existentes conservados',()=>{const m=read('js/menu.js'),p=read('js/pedir.js');assert.match(m,/UI\.logoBanco\(x\.banco\)/);assert.match(p,/UI\.logoBanco\(x\.banco\)/);for(const x of ['data-cta-ed','data-cta-del','d.cuentas_bancarias = JSON.stringify(cuentas)'])assert.ok(m.includes(x));for(const x of ['x.activa !== false','data-cuenta','data-copiar','etiquetaCuenta(x)'])assert.ok(p.includes(x));});
