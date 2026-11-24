const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const s=fs.readFileSync('js/pedir.js','utf8');
function cut(a,b){const i=s.indexOf(a),j=s.indexOf(b,i+1);assert.ok(i>=0&&j>i);return s.slice(i,j);}
function fixture(){
 const jugo={id:'j',precio:1.5,extras:[]},plato={id:'p',precio:5.25,extras:[{nombre:'Chifle',precio:.5}]};
 const ctx=vm.createContext({carrito:{},UI:{dinero:n=>'$'+n.toFixed(2),esc:String},global:{},paso:1,envioPendiente:null,recuperacionEnCurso:false});
 vm.runInContext(cut('  function claveItem(','  function zonaElegida(')+cut('  function subtotalTarjetaPreenvio(','  function pintarPlatos('),ctx);
 return {ctx,jugo,plato,put(p,extras,cantidad){ctx.carrito[ctx.claveItem(p,extras)]={plato:p,extras,cantidad};}};
}
test('tarjeta: dos jugos de 1.50 muestran subtotal 3.00',()=>{const f=fixture();f.put(f.jugo,[],2);assert.equal(f.ctx.subtotalTarjetaPreenvio('j'),3);assert.match(f.ctx.importeTarjetaPreenvio(f.jugo,2),/2 unidades.*3\.00/);});
test('tarjeta: aumentar, reducir y quitar producto',()=>{const f=fixture();for(const n of [1,3,2,0]){f.put(f.jugo,[],n);assert.equal(f.ctx.subtotalTarjetaPreenvio('j'),1.5*n);if(!n)assert.equal(f.ctx.importeTarjetaPreenvio(f.jugo,n),'');}});
test('tarjeta: variantes del mismo plato incluyen extras y excluyen otros productos',()=>{const f=fixture();f.put(f.plato,['Chifle','Chifle'],2);f.put(f.plato,[],1);f.put(f.jugo,[],2);assert.equal(f.ctx.subtotalTarjetaPreenvio('p'),17.75);assert.equal(f.ctx.subtotalTarjetaPreenvio('j'),3);assert.equal(f.ctx.subtotal(),20.75);});
test('tarjeta: integra subtotal junto al precio unitario y mantiene edición',()=>{const h=cut('  function pintarPlatos()','  /* Solo carrito previo');assert.match(h,/UI\.dinero\(p\.precio\)/);assert.match(h,/importeTarjetaPreenvio\(p,cant\)/);assert.match(h,/data-editar-plato/);assert.match(h,/data-cant-plato/);});
test('tarjeta: cálculos en centavos sin error binario',()=>{const f=fixture();f.jugo.precio=.1;f.put(f.jugo,[],3);assert.equal(f.ctx.subtotalTarjetaPreenvio('j'),.3);});
