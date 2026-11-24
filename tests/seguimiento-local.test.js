'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/pedir.js'),'utf8');
const code=source.slice(source.indexOf('  function identidadSeguimiento('),source.indexOf('  var historialRevisado'));
function entorno(lista,ultimo,lookup){
 const m={mis_pedidos:lista.slice(),ultimo_pedido:ultimo},MEM={leer:k=>m[k],guardar:(k,v)=>m[k]=v};
 const fn=new Function('MEM','misPedidos','guardarMisPedidos','DATOS','checkoutMem',code+';return {identidadSeguimiento,eliminarReferenciasInexistentes,consultarReferenciaSeguimiento};')(MEM,()=>m.mis_pedidos,l=>m.mis_pedidos=l,{pedir:lookup},{});return {m,...fn};
}
const a={n:'PED-0002',s:'PED-0002-aaaaaa',f:1},b={n:'PED-0003',s:'PED-0003-bbbbbb',f:2},nuevo={n:'PED-0002',s:'PED-0002-cccccc',f:3};
const error=c=>{throw Object.assign(Error(c),{codigo:c});};
test('NO_EXISTE explícito limpia referencia y legado',async()=>{const e=entorno([a,b],{numero:a.n,s:a.s},async()=>error('NO_EXISTE'));const r=await e.consultarReferenciaSeguimiento(a);assert.equal(r.no_existe,true);assert.deepEqual(e.eliminarReferenciasInexistentes([a,b],{[a.n]:r}),[b]);assert.deepEqual(e.m.mis_pedidos,[b]);assert.equal(e.m.ultimo_pedido,null);});
test('error de red, HTTP, tiempo o servidor nunca elimina',async()=>{for(const c of ['RED','HTTP','TIEMPO','NO_INSTALADO','ERROR']){const e=entorno([a],null,async()=>error(c));const r=await e.consultarReferenciaSeguimiento(a);assert.equal(r.consulta_error,true);assert.deepEqual(e.eliminarReferenciasInexistentes([a],{[a.n]:r}),[a]);}});
test('pedido nuevo que reutiliza número permanece si se creó durante consulta',()=>{const e=entorno([nuevo,b],{numero:nuevo.n,s:nuevo.s});e.eliminarReferenciasInexistentes([a,b],{[a.n]:{no_existe:true}});assert.deepEqual(e.m.mis_pedidos,[nuevo,b]);assert.equal(e.m.ultimo_pedido.s,nuevo.s);});
test('respuesta con clave distinta no reemplaza ni elimina referencia',async()=>{const e=entorno([a],null,async()=>({numero:a.n,seguimiento:nuevo.s}));assert.deepEqual(await e.consultarReferenciaSeguimiento(a),{consulta_error:true});});
test('respuesta correcta conserva pedido válido',async()=>{const p={numero:a.n,seguimiento:a.s,estado:'Recibido'},e=entorno([a],null,async()=>p);assert.equal(await e.consultarReferenciaSeguimiento(a),p);assert.deepEqual(e.eliminarReferenciasInexistentes([a],{[a.n]:p}),[a]);});
test('referencia sin datos suficientes no desaparece automáticamente',async()=>{const x={n:a.n},e=entorno([x],null,async()=>error('NO_EXISTE'));assert.deepEqual(await e.consultarReferenciaSeguimiento(x),{consulta_error:true});});
test('reinicio completo elimina los pedidos locales confirmados inexistentes',()=>{const e=entorno([a,b],{numero:a.n,s:a.s});assert.deepEqual(e.eliminarReferenciasInexistentes([a,b],{[a.n]:{no_existe:true},[b.n]:{no_existe:true}}),[]);assert.deepEqual(e.m.mis_pedidos,[]);assert.equal(e.m.ultimo_pedido,null);});
