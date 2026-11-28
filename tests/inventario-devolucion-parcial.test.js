'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const gs=fs.readFileSync('servidor/Codigo.gs','utf8');
function ex(n){const i=gs.indexOf('function '+n+'('),j=gs.indexOf('\nfunction ',i+1);assert.ok(i>=0);return gs.slice(i,j);}
function fixture(){
 const p={id:'P1',numero:'PED-1',local_id:'L1'},ins=[{id:'I1',local_id:'L1',nombre:'Harina',activo:true,stock:10,_fila:2},{id:'I2',local_id:'L1',nombre:'Aceite',activo:true,stock:10,_fila:3}];
 const recetas=[{plato_id:'A',insumo_id:'I1',cantidad:.3334},{plato_id:'B',insumo_id:'I1',cantidad:.3334},{plato_id:'B',insumo_id:'I2',cantidad:.5}];
 const lines=[{id:'D1',plato_id:'A',cantidad:2},{id:'D2',plato_id:'B',cantidad:1},{id:'D3',plato_id:'C',cantidad:1}];const logs=[];let seq=0,writes=0;
 const deps={leerTabla_:n=>({insumos:ins,recetas_plato:recetas,movimientos_inventario:logs}[n]),numero_:Number,claveComparar_:v=>String(v).toLowerCase(),nuevoId_:n=>n+'-'+(++seq),fallo_:(m,c)=>Object.assign(Error(m),{codigo:c}),actualizarCampos_:(n,f,i,x)=>{writes++;Object.assign(i,x)},agregarFilas_:(n,rows)=>{writes++;rows.forEach(a=>logs.push({id:a[0],local_id:a[2],insumo_id:a[3],tipo:a[4],cantidad:a[5],motivo:a[6]}))},limpiarMenuCache_:()=>{}};
 const fn=new Function(...Object.keys(deps),['descontarInventario_','planDevolucionTotal_','aplicarDevolucionTotal_','planDevolucionParcial_'].map(ex).join('\n')+'\n;return {descontarInventario_,planDevolucionParcial_,aplicarDevolucionTotal_,planDevolucionTotal_}')(...Object.values(deps));
 fn.descontarInventario_(p.id,p.numero,p.local_id,lines,1,'demo');
 return {p,ins,recetas,lines,logs,fn,writes:()=>writes,plan:(b)=>fn.planDevolucionParcial_(p,lines,b),apply:b=>fn.aplicarDevolucionTotal_(p,fn.planDevolucionParcial_(p,lines,b),'demo')};
}
test('redondeo agregado y traza conservan saldo original',()=>{const e=fixture();assert.equal(e.ins[0].stock,9);assert.equal(e.ins[1].stock,9.5);assert.equal(e.logs.filter(x=>x.tipo==='traza_linea').length,1);assert.equal(e.logs.reduce((n,x)=>n+x.cantidad,0),-1.5)});
test('retiro parcial con receta modificada devuelve proporción original',()=>{const e=fixture();e.recetas[0].cantidad=7;assert.equal(e.plan([{id:'D1',cantidad:1}])[0].cantidad,.334);e.apply([{id:'D1',cantidad:1}]);assert.equal(e.ins[0].stock,9.334)});
test('retirar línea sin consumo no mueve stock',()=>{const e=fixture();const n=e.writes();assert.equal(e.apply([{id:'D3',cantidad:1}]),false);assert.equal(e.writes(),n)});
test('retiro completo de línea y posterior anulación conservan neto',()=>{const e=fixture();e.apply([{id:'D2',cantidad:1}]);assert.deepEqual(e.ins.map(x=>x.stock),[9.333,10]);e.fn.aplicarDevolucionTotal_(e.p,e.fn.planDevolucionTotal_(e.p),'demo');assert.deepEqual(e.ins.map(x=>x.stock),[10,10])});
test('sin traza, traza duplicada o venta no vinculada bloquean',()=>{for(const tipo of ['ausente','duplicada','extra']){const e=fixture();const i=e.logs.findIndex(x=>x.tipo==='traza_linea');if(tipo==='ausente')e.logs.splice(i,1);if(tipo==='duplicada')e.logs.push({...e.logs[i]});if(tipo==='extra')e.logs.push({...e.logs[0],id:'EXTRA'});const n=e.writes();assert.throws(()=>e.apply([{id:'D1',cantidad:1}]),/trazabilidad original/);assert.equal(e.writes(),n)}});
test('retiro repetido, ajeno o excesivo no escribe',()=>{const e=fixture();for(const b of [[{id:'D1',cantidad:3}],[{id:'D1',cantidad:1},{id:'D1',cantidad:1}],[{id:'AJENO',cantidad:1}]]){const n=e.writes();assert.throws(()=>e.apply(b),/trazabilidad original/);assert.equal(e.writes(),n)}e.apply([{id:'D1',cantidad:1}]);assert.throws(()=>e.apply([{id:'D1',cantidad:1}]),/trazabilidad original/)});
