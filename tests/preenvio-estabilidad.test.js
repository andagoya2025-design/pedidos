// Pruebas aisladas de estabilidad antes de enviar. No red ni datos reales.
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','js/pedir.js'),'utf8');
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i+1);assert.ok(i>=0&&j>i);return src.slice(i,j)};
function extraFixture(){
  const ctx={};vm.createContext(ctx);
  vm.runInContext(cut('function maxExtraUI(','function resumenExtrasCantidad(')+cut('function leerExtrasUI(','async function agregar('),ctx);
  const extras=[{nombre:'A',precio:.5},{nombre:'B',precio:.7},{nombre:'C',precio:0}];
  const ui=values=>({querySelector:s=>{const i=Number(s.slice(1,-1));return {type:i===2?'checkbox':'number',value:String(values[i]),checked:!!values[i]}}});
  return {ctx,extras,ui};
}
test('1000 extras acumulados válidos; 1001 rechazados antes de guardar',()=>{
  const {ctx,extras,ui}=extraFixture();
  assert.equal(ctx.leerExtrasPreenvio(extras,ui([600,399,true]),i=>i).length,1000);
  assert.throws(()=>ctx.leerExtrasPreenvio(extras,ui([600,400,true]),i=>i),/Máximo 1000 extras/);
});
test('Límites individuales y extra gratuito siguen iguales',()=>{
  const {ctx,extras,ui}=extraFixture();extras[0].max_cantidad=2;
  assert.throws(()=>ctx.leerExtrasPreenvio(extras,ui([3,0,false]),i=>i),/Cantidad de extra inválida/);
  assert.equal(ctx.leerExtrasPreenvio(extras,ui([2,0,true]),i=>i).length,3);
});
test('Lector compartido con flujo posterior sigue separado',()=>{
  const {ctx,extras,ui}=extraFixture();assert.equal(ctx.leerExtrasUI(extras,ui([600,400,true]),i=>i).length,1001);
  assert.match(src,/var elegidos=leerExtrasUI\(p\.extras,velo/);
});
function checkoutFixture(){
  const calls=[],dom={'#pe-cupon':{value:'PROMO'},'#pe-notas':{value:'Sin cebolla'},'#pe-cupon-estado':{textContent:''},'#pe-privacidad':{checked:true},'#pe-politicas':{checked:true}};
  const ctx={paso:3,envioPendiente:null,checkoutMem:{},notasTmp:{},cuponAplicado:null,allowed:false,shown:true,list:[{}],$:s=>dom[s],UI:{$:s=>s==='[data-forma=efectivo]'?ctx.shown:undefined,dinero:n=>'$'+n.toFixed(2)},guardarCheckout(k,v){ctx.checkoutMem[k]=v},items:()=>ctx.list,efectivoPermitido:()=>ctx.allowed,pintarConfirmar(){calls.push('confirmar');ctx.shown=ctx.allowed;dom['#pe-notas'].value='';dom['#pe-cupon'].value='';ctx.restaurarNotas()},pintarItemsResumen(){calls.push('items')},totales(){calls.push('totales')},irA(n){calls.push('paso'+n)}};
  vm.createContext(ctx);vm.runInContext(cut('function guardarNotas(','function totales(')+cut('function refrescarResumenPreenvio(','function pintarItemsResumen('),ctx);
  return {ctx,dom,calls};
}
test('Superar límite de efectivo reconstruye opciones y conserva notas y cupón',()=>{
  const {ctx,dom,calls}=checkoutFixture();ctx.refrescarResumenPreenvio();
  assert.deepEqual(calls,['confirmar']);assert.equal(ctx.shown,false);assert.equal(dom['#pe-notas'].value,'Sin cebolla');assert.equal(dom['#pe-cupon'].value,'PROMO');assert.match(dom['#pe-cupon-estado'].textContent,/vuelve a aplicar/);
});
test('Bajar importe vuelve a ofrecer efectivo sin perder información',()=>{
  const {ctx,dom,calls}=checkoutFixture();ctx.allowed=true;ctx.shown=false;ctx.refrescarResumenPreenvio();
  assert.deepEqual(calls,['confirmar']);assert.equal(ctx.shown,true);assert.equal(dom['#pe-notas'].value,'Sin cebolla');
});
test('Sin cambio de elegibilidad no se reconstruye la pantalla',()=>{
  const {ctx,calls}=checkoutFixture();ctx.allowed=true;ctx.refrescarResumenPreenvio();assert.deepEqual(calls,['items','totales']);
});
test('Carrito vacío vuelve al menú conservando notas',()=>{
  const {ctx,calls}=checkoutFixture();ctx.list=[];ctx.refrescarResumenPreenvio();assert.deepEqual(calls,['paso1']);assert.equal(ctx.notasTmp.notas,'Sin cebolla');
});
test('Con envío pendiente no se modifica pantalla ni notas',()=>{
  const {ctx,calls}=checkoutFixture();ctx.envioPendiente={op_id:'original'};ctx.refrescarResumenPreenvio();assert.deepEqual(calls,[]);assert.equal(ctx.notasTmp.notas,undefined);
});
test('Regreso al resumen restaura datos aun sin cupón aplicado',()=>{
  const {ctx,dom}=checkoutFixture();ctx.guardarNotas();dom['#pe-notas'].value='';dom['#pe-cupon'].value='';ctx.restaurarNotas();
  assert.equal(dom['#pe-notas'].value,'Sin cebolla');assert.equal(dom['#pe-cupon'].value,'PROMO');
  assert.match(src,/restaurarNotas\(\);\s*pintarItemsResumen\(\);\s*totales\(\);\s*revisarEfectivoCliente\(\)/);
});
test('Sugeridos muestran cantidad y subtotal acumulado; no anuncian éxito al fallar suma',()=>{
  const ctx={UI:{dinero:n=>'$'+n.toFixed(2)}};vm.createContext(ctx);vm.runInContext(cut('function textoSugeridoPreenvio(','function codigoSesion('),ctx);
  assert.equal(ctx.textoSugeridoPreenvio({precio:.5},2),'2 × $0.50 = $1.00');
  assert.match(src,/if\(sumar\(pid,1\)!==true\)return;.*textoSugeridoPreenvio\(plato\(pid\),cantidadPlato\(pid\)\)/);
});
