const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync('js/pedidos.js','utf8'),css=fs.readFileSync('css/modulos.css','utf8');
const a=s.indexOf('  function presentarSustitucionPremium('),b=s.indexOf('  async function cotizarSolicitud(',a);assert.ok(a>=0&&b>a);
function fixture(values=[1,0,2]){
 const events={},classes=()=>({s:new Set(),add(k){this.s.add(k)},toggle(k,on){if(on)this.s.add(k);else this.s.delete(k)},contains(k){return this.s.has(k)}});
 const rows=values.map((value,i)=>({el:{value:String(value),tipo:i===0?'r':'a'},classList:classes(),querySelector(){return this.el}}));
 const panel={classList:classes()},modal={classList:classes()},aviso={},buscar={value:'',dispatchEvent(){}},boton={attrs:{'aria-expanded':'false'},getAttribute(k){return this.attrs[k]},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,f){this.handler=f},click(){this.handler()}};
 const v={querySelector(k){if(k.includes('^='))return rows.find(f=>f.classList.contains('ux-premium-seleccion')&&f.el.tipo===(k.includes('"r"')?'r':'a'));return {'.ventana':modal,'[data-premium-ajustes]':panel,'[data-premium-alternativas]':boton,'[data-premium-contador]':aviso,'[data-buscar]':buscar}[k]},addEventListener(k,f){events[k]=f}};
 const ctx={UI:{$$:()=>rows},Event:class{}};
 vm.createContext(ctx);vm.runInContext(s.slice(a,b),ctx);ctx.presentarSustitucionPremium(v);return {rows,panel,modal,aviso,boton,events,buscar};
}
test('sustitución: precarga visible, alternativas plegadas y cantidades intactas',()=>{const f=fixture();assert.equal(f.aviso.textContent,'2 líneas seleccionadas');assert.equal(f.rows[1].classList.contains('ux-premium-alternativa'),true);assert.equal(f.boton.attrs['aria-expanded'],'false');assert.deepEqual(f.rows.map(r=>r.el.value),['1','0','2']);});
test('sustitución: desplegar y plegar no modifica cantidades',()=>{const f=fixture();f.boton.click();assert.equal(f.panel.classList.contains('ux-premium-expandido'),true);f.boton.click();assert.equal(f.panel.classList.contains('ux-premium-expandido'),false);assert.deepEqual(f.rows.map(r=>r.el.value),['1','0','2']);});
test('sustitución: selección cambia visualmente sin alterar controles',()=>{const f=fixture();f.rows[1].el.value='3';f.events.input();assert.equal(f.aviso.textContent,'3 líneas seleccionadas');assert.equal(f.rows[1].classList.contains('ux-premium-seleccion'),true);});
test('sustitución incompleta abre alternativas automáticamente',()=>{for(const values of [[0,0,2],[1,0,0],[0,0,0]])assert.equal(fixture(values).boton.attrs['aria-expanded'],'true');});
test('piloto visual sólo para cambiar, mantiene solicitud y cotización original',()=>{assert.match(s,/if\(t==='cambiar'\)presentarSustitucionPremium\(v\)/);assert.match(s,/pedidoCambioCotizar',\{id:x.id,integral:true,seleccion:sel\}/);assert.match(s,/pedidoCambioProponer',\{id:x.id,integral:true,seleccion:sel,total_esperado:q.total_estimado/);assert.match(css,/\.ux-sustitucion-premium \.ux-cambio-lista\{max-height:none;overflow:visible/);});
