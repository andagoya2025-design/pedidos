'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const gs=fs.readFileSync('servidor/Codigo.gs','utf8');
function ex(n){const i=gs.indexOf('function '+n+'('),j=gs.indexOf('\nfunction ',i+1);assert.ok(i>=0);return gs.slice(i,j);}
function fixture(){
 const db={locales:[{id:'L1',activo:true},{id:'L2',activo:true},{id:'L3',activo:true}],insumos:[{id:'I1',local_id:'L1',nombre:'Harina',activo:true,stock:5,_fila:2},{id:'I2',local_id:'L2',nombre:'Harina',activo:false,stock:8,_fila:3}],recetas_plato:[{plato_id:'P',insumo_id:'I1',cantidad:1}],movimientos_inventario:[]};let writes=0,id=0;
 const deps={leerTabla_:n=>db[n],numero_:Number,claveComparar_:v=>String(v).toLowerCase(),fallo_:(m,c)=>Object.assign(Error(m),{codigo:c}),nuevoId_:n=>n+'-'+(++id),actualizarCampos_:(n,f,i,x)=>{writes++;Object.assign(i,x)},agregarFilas_:(n,rows)=>{writes++;rows.forEach(a=>db[n].push({id:a[0],local_id:a[2],insumo_id:a[3],tipo:a[4],cantidad:a[5],motivo:a[6]}))},limpiarMenuCache_:()=>{}};
 const fn=new Function(...Object.keys(deps),['agotadosPorLocal_','validarStockAdicional_','descontarInventario_','planDevolucionTotal_','aplicarDevolucionTotal_'].map(ex).join('\n')+'\n;return {agotadosPorLocal_,validarStockAdicional_,descontarInventario_,planDevolucionTotal_,aplicarDevolucionTotal_}')(...Object.values(deps));
 const d=[{id:'D1',plato_id:'P',cantidad:1}];return {db,fn,d,writes:()=>writes,venta:l=>fn.descontarInventario_('PED','PED-1',l,d,1,'demo')};
}
test('inactivo bloquea plato exclusivamente en su local',()=>{const e=fixture();assert.deepEqual(e.fn.agotadosPorLocal_(),{L2:{P:true}});assert.throws(()=>e.fn.validarStockAdicional_('L2',e.d),/Insumo inactivo/);assert.equal(e.writes(),0);assert.throws(()=>e.venta('L2'),/Insumo inactivo/);assert.equal(e.writes(),0);e.fn.validarStockAdicional_('L1',e.d);e.venta('L1');assert.equal(e.db.insumos[0].stock,4)});
test('reactivar restaura disponibilidad',()=>{const e=fixture();e.db.insumos[1].activo=true;assert.deepEqual(e.fn.agotadosPorLocal_(),{});e.fn.validarStockAdicional_('L2',e.d);e.venta('L2');assert.equal(e.db.insumos[1].stock,7)});
test('local sin configuración conserva venta sin descuento',()=>{const e=fixture();e.fn.validarStockAdicional_('L3',e.d);assert.equal(e.venta('L3'),false);assert.deepEqual(e.db.insumos.map(i=>i.stock),[5,8])});
test('anulación histórica devuelve a insumo ahora inactivo',()=>{const e=fixture();e.venta('L1');e.db.insumos[0].activo=false;const p={id:'PED',numero:'PED-1',local_id:'L1'};e.fn.aplicarDevolucionTotal_(p,e.fn.planDevolucionTotal_(p),'demo');assert.equal(e.db.insumos[0].stock,5)});
