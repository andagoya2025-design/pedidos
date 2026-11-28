'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const gs=fs.readFileSync(path.join(__dirname,'../servidor/Codigo.gs'),'utf8');
function extraer(n){const i=gs.indexOf('function '+n+'('),j=gs.indexOf('\nfunction ',i+1);assert.ok(i>=0);return gs.slice(i,j<0?gs.length:j);}
const source=extraer('planDevolucionTotal_')+'\n'+extraer('aplicarDevolucionTotal_');
function fixture(rows,stock=5) {
 const p={id:'P1',numero:'PED-0002',local_id:'L1',inventario_descontado:true};
 const insumos=[{id:'I1',local_id:'L1',stock,_fila:2,activo:false},{id:'I2',local_id:'L1',stock:3,_fila:3},{id:'I3',local_id:'L2',stock:10,_fila:4}];
 let writes=0, cache=0, seq=0;
 const mov=(id,ins,tipo,cantidad,local='L1',numero='PED-0002')=>({id,insumo_id:ins,tipo,cantidad,local_id:local,motivo:(tipo==='venta'?'Venta ':'Anulación ')+numero});
 const historial=rows(mov);
 const deps={leerTabla_:n=>n==='insumos'?insumos:historial,fallo_:(m,c)=>Object.assign(Error(m),{codigo:c}),actualizarCampos_:(n,f,i,patch)=>{writes++;Object.assign(i,patch);},nuevoId_:()=> 'R'+(++seq),agregarFilas_:(n,rs)=>{writes++;rs.forEach(x=>historial.push({id:x[0],local_id:x[2],insumo_id:x[3],tipo:x[4],cantidad:x[5],motivo:x[6]}));},limpiarMenuCache_:()=>cache++};
 const fn=new Function(...Object.keys(deps),source+';return {planDevolucionTotal_,aplicarDevolucionTotal_}')(...Object.values(deps));
 return {p,insumos,historial,fn,writes:()=>writes,cache:()=>cache,plan:()=>fn.planDevolucionTotal_(p),aplicar:()=>fn.aplicarDevolucionTotal_(p,fn.planDevolucionTotal_(p),'demo')};
}
test("receta cambiada: devuelve cantidad original, no receta vigente",()=>{const e=fixture(m=>[m('V1','I1','venta',-.25)]);assert.equal(e.plan()[0].cantidad,.25);assert.equal(e.aplicar(),true);assert.equal(e.insumos[0].stock,5.25);assert.equal(e.historial.at(-1).cantidad,.25);assert.equal(e.cache(),1);});
test("considera devoluciones previas y adicionales",()=>{const e=fixture(m=>[m('V1','I1','venta',-2),m('D1','I1','devolucion',.75),m('V2','I2','venta',-.125)]);e.aplicar();assert.deepEqual(e.insumos.map(i=>i.stock),[6.25,3.125,10]);});
test("segundo intento no devuelve de nuevo",()=>{const e=fixture(m=>[m('V1','I1','venta',-2)]);e.aplicar();const n=e.writes();assert.equal(e.aplicar(),false);assert.equal(e.writes(),n);});
test("aislamiento por pedido y local",()=>{const e=fixture(m=>[m('V1','I1','venta',-1),m('V2','I2','venta',-10,'L1','PED-00020'),m('V3','I3','venta',-10,'L2')]);e.aplicar();assert.deepEqual(e.insumos.map(i=>i.stock),[6,3,10]);});
test("historial ausente bloquea sin escribir",()=>{const e=fixture(()=>[]);assert.throws(()=>e.plan(),/conciliación/);assert.equal(e.writes(),0);});
test("historial duplicado bloquea sin escribir",()=>{const e=fixture(m=>[m('V1','I1','venta',-1),m('V1','I1','venta',-1)]);assert.throws(()=>e.aplicar(),/conciliación/);assert.equal(e.writes(),0);});
test("devolución histórica excesiva no vuelve a inflar saldo",()=>{const e=fixture(m=>[m('V1','I1','venta',-1),m('D1','I1','devolucion',2)]);assert.throws(()=>e.aplicar(),/conciliación/);assert.equal(e.writes(),0);});
test("insumo ausente y saldo inválido bloquean todo",()=>{let e=fixture(m=>[m('V1','I1','venta',-1),m('V2','X','venta',-1)]);assert.throws(()=>e.aplicar(),/conciliación/);assert.equal(e.writes(),0);e=fixture(m=>[m('V1','I1','venta',-1)],'');assert.throws(()=>e.aplicar(),/conciliación/);assert.equal(e.writes(),0);});
test("déficit histórico conserva saldo real",()=>{const e=fixture(m=>[m('V1','I1','venta',-.375)],-2);e.aplicar();assert.equal(e.insumos[0].stock,-1.625);});
test("cantidad histórica inválida o signo incorrecto bloquean",()=>{for(const v of [NaN,Infinity,'',.01,-.0001]){const e=fixture(m=>[m('V1','I1','venta',v)]);assert.throws(()=>e.aplicar(),/conciliación/);assert.equal(e.writes(),0);}});
test("local del insumo no corresponde",()=>{const e=fixture(m=>[m('V1','I3','venta',-1)]);assert.throws(()=>e.aplicar(),/conciliación/);assert.equal(e.writes(),0);});
test("cantidad histórica cero no escribe devolución",()=>{const e=fixture(m=>[m('V1','I1','venta',0)]);assert.equal(e.aplicar(),false);assert.equal(e.writes(),0);});
test('ambas anulaciones preparan el plan antes de escribir estados',()=>{const a=extraer('accionPedidoAnular_'),b=extraer('aplicarIntegral_');assert.ok(a.indexOf('planDevolucionTotal_(p)')<a.indexOf("estado: 'Anulado'"));assert.ok(b.indexOf('planDevolucionTotal_(p)')<b.indexOf("estado:'Aplicando'"));assert.match(a,/aplicarDevolucionTotal_\(p, devolucionTotal/);assert.match(b,/aplicarDevolucionTotal_\(p,devolucionTotal/);});
