const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const s=fs.readFileSync('js/pedir.js','utf8');
function cut(a,b){const i=s.indexOf(a),j=s.indexOf(b,i+1);assert.ok(i>=0&&j>i);return s.slice(i,j);}
function fixture(){
 const calls=[];const nodes={'#btn-carrito-preenvio':{},'#btn-vaciar-preenvio':{addEventListener(){}},'#barra-pedido':{},'#btn-ver-pedido':{click(){calls.push('continuar');}}};
 const ctx=vm.createContext({carrito:{x:{cantidad:2}},envioPendiente:null,recuperacionEnCurso:false,cotizacionEnCurso:false,paso:1,ubic:{lat:1},global:{confirm:()=>true},cantidadTotal(){return Object.values(ctx.carrito).reduce((a,b)=>a+b.cantidad,0);},subtotal(){return ctx.cantidadTotal()*1.5;},cambio(){calls.push('cambio');},limpiarCheckout(){calls.push('limpiar');},irA(n){calls.push('paso'+n);ctx.paso=n;},UI:{aviso(){},dinero:n=>n.toFixed(2),esc:String},$:k=>nodes[k]});
 vm.runInContext(cut('  function puedeVaciarPreenvio(','  /* Antes del paso 2'),ctx);
 return {ctx,calls,nodes};
}
test('vaciar elimina borrador completo, vuelve al menú y limpia datos de checkout',()=>{const f=fixture();f.ctx.paso=3;assert.equal(f.ctx.vaciarPreenvio(),true);assert.equal(f.ctx.cantidadTotal(),0);assert.equal(f.ctx.ubic,null);assert.deepEqual(f.calls,['cambio','limpiar','paso1']);});
test('vaciar cancelado conserva carrito',()=>{const f=fixture();f.ctx.global.confirm=()=>false;assert.equal(f.ctx.vaciarPreenvio(),false);assert.equal(f.ctx.cantidadTotal(),2);assert.deepEqual(f.calls,[]);});
test('vaciar no afecta envío incierto, recuperación o cotización en curso',()=>{for(const k of ['envioPendiente','recuperacionEnCurso','cotizacionEnCurso']){const f=fixture();f.ctx[k]=true;assert.equal(f.ctx.vaciarPreenvio(),false);assert.equal(f.ctx.cantidadTotal(),2);assert.deepEqual(f.calls,[]);}});
test('carrito visible junto a categorías y sincronizado con total, también vacío',()=>{const f=fixture();f.ctx.pintarBarra(false);assert.match(f.nodes['#btn-carrito-preenvio'].innerHTML,/Carrito \(2\).*3\.00/);assert.equal(f.nodes['#btn-vaciar-preenvio'].disabled,false);f.ctx.carrito={};f.ctx.pintarBarra(false);assert.match(f.nodes['#btn-carrito-preenvio'].innerHTML,/Carrito \(0\).*0\.00/);assert.equal(f.nodes['#btn-vaciar-preenvio'].disabled,true);});
test('vaciado está disponible en los tres pasos y no llama al servidor',()=>{assert.match(cut('  function pintarMenu()','  function repetir('),/id="btn-vaciar-preenvio"/);for(const h of [cut('  function pintarEntrega()','  function pintarConfirmar()'),cut('  function pintarConfirmar()','  function importesCheckout()')]){assert.match(h,/botonVaciarCheckoutPreenvio\(\)/);assert.match(h,/conectarVaciarPreenvio\(\)/);}assert.doesNotMatch(cut('  function vaciarPreenvio()','  function conectarVaciarPreenvio()'),/DATOS\.|sessionStorage|MEM\./);});
test('vista carrito lista todas las combinaciones y ofrece edición, quitar y continuar',()=>{const h=cut('  async function abrirCarritoPreenvio()','  function pintarBarra(');assert.match(h,/var lista=items\(\)/);assert.match(h,/data-carrito-editar/);assert.match(h,/data-carrito-quitar/);assert.match(h,/data-carrito-vaciar/);assert.match(h,/agregar\(it.plato.id,null,it\)/);assert.match(h,/btn-ver-pedido/);});
