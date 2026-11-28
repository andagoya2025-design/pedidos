'use strict';
// 3.1.33 — Ayuda del motorizado en el servidor. Datos ficticios; sin llamadas reales a Google.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const gs=fs.readFileSync('servidor/Codigo.gs','utf8');
const inicio=gs.indexOf("var AYUDA_CACHE"),fin=gs.indexOf('function accionRutaPedido_(');
function entorno(){
 let now=Date.UTC(2026,10,27,18,0,0),held=false,fallaEscritura=false,cache={},actor={id:'M1',nombre:'Motor Demo',local_id:'TODOS'};
 const filas=[],pedidos=[{id:'P1',numero:'PED-0001',motorizado_id:'M1',estado:'En camino',local_id:'L1'},{id:'P2',numero:'PED-0002',motorizado_id:'M1',estado:'Entregado',local_id:'L2'},{id:'P3',numero:'PED-0003',motorizado_id:'M2',estado:'En camino',local_id:'L2'}];
 class Fecha extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}static [Symbol.hasInstance](x){return x instanceof Date;}}
 const hoja=()=>({getLastRow:()=>filas.length+1,getRange:(f,c,n,k)=>({getValues:()=>Array.from({length:n},(_,i)=>filas[f-2+i].slice(c-1,c-1+k)),createTextFinder:v=>{const fi={matchCase:()=>fi,matchEntireCell:()=>fi,findAll:()=>filas.map((r,i)=>r[c-1]===v?{getRow:()=>i+2}:null).filter(Boolean)};return fi;}})});
 const cfg={ayuda_vigencia_horas:'12'};
 const dep={Date:Fecha,hoja_:hoja,console:{error(){}},
  CacheService:{getScriptCache:()=>({get:k=>cache[k]||null,put:(k,v)=>{cache[k]=v},remove:k=>{delete cache[k]}})},SpreadsheetApp:{flush(){}},
  candado_:()=>{assert.equal(held,false,'candado ya tomado');held=true;return{releaseLock:()=>{held=false}}},
  miMotorizado_:()=>actor,coord_:(v,min,max)=>v===''||v==null||!(Number(v)>=min&&Number(v)<=max)?'':Number(v),fallo_:(m,c)=>Object.assign(Error(m),{codigo:c}),
  limpiarTexto_:(v,n)=>String(v==null?'':v).trim().slice(0,n),numero_:v=>Number(v)||0,leerConfig_:()=>cfg,iso_:d=>d instanceof Date?d.toISOString():'',
  leerTabla_:n=>{assert.equal(n,'pedidos');return pedidos},
  localDeSesion_:(ctx,l)=>ctx.sesion.rol==='dueno'?(l||'TODOS'):ctx.sesion.local_id,
  agregarFilas_:(n,f)=>{assert.equal(n,'bitacora');if(fallaEscritura)throw Error('fallo de escritura');f.forEach(x=>filas.push(x))}};
 const f=new Function(...Object.keys(dep),gs.slice(inicio,fin)+';return {aviso:accionAyudaAviso_,atender:accionAyudaAtender_,admin:ayudasParaAdmin_}')(...Object.values(dep));
 const ctxM={sesion:{usuario:'motor',rol:'motorizado',local_id:'TODOS'}};
 const ctxL1={sesion:{usuario:'caja1',rol:'cajero',local_id:'L1'}},ctxL2={sesion:{usuario:'caja2',rol:'cajero',local_id:'L2'}},ctxD={sesion:{usuario:'jefe',rol:'dueno',local_id:''}};
 return{filas,pedidos,cache,actor:a=>{actor=a},avanzar:ms=>{now+=ms},fallar:v=>{fallaEscritura=v},held:()=>held,cfg,
  enviar:(id='AYU-00000001',extra={})=>f.aviso({ayuda_id:id,lat:-2.1,lng:-79.9,precision:10,...extra},ctxM).data,
  falsa:(id)=>f.aviso({ayuda_id:id,accion:'falsa'},ctxM).data,
  atender:(id,ctx=ctxD,local)=>f.atender({ayuda_id:id,local_id:local},ctx).data,
  admin:(local)=>f.admin(local),ctxL1,ctxL2,ctxD};
}
test('ayuda: un toque guarda el aviso con pedidos en camino, hora y ubicación; el administrador lo ve',()=>{
 const e=entorno(),r=e.enviar();assert.equal(r.guardado,true);assert.equal(e.filas.length,1);
 assert.deepEqual(e.filas[0].slice(4,6),['AYUDA','AVISO']);
 const a=e.admin('TODOS');assert.equal(a.length,1);assert.equal(a[0].nombre,'Motor Demo');assert.deepEqual(a[0].pedidos,['PED-0001']);assert.equal(a[0].lat,-2.1);assert.ok(a[0].hora);
});
test('ayuda: solo viaja lo mínimo (sin cédula, teléfono ni datos del cliente)',()=>{
 const e=entorno();e.enviar();const crudo=JSON.stringify(e.filas)+JSON.stringify(e.admin('TODOS'));
 assert.doesNotMatch(crudo,/cedula|cédula|telefono|celular|cliente/i);
});
test('ayuda: cada local ve solo lo suyo; el dueño ve todo',()=>{
 const e=entorno();e.enviar();
 assert.equal(e.admin('L1').length,1);assert.equal(e.admin('L2').length,0);assert.equal(e.admin('TODOS').length,1);
});
test('ayuda: repetir el mismo aviso (reintento por mala señal) no duplica',()=>{
 const e=entorno();e.enviar();const r=e.enviar();assert.equal(r.guardado,true);assert.equal(r.repetido,true);assert.equal(e.filas.length,1);
});
test('ayuda: un segundo toque con alerta sin atender no duplica y devuelve la misma',()=>{
 const e=entorno();e.enviar('AYU-00000001');const r=e.enviar('AYU-00000002');
 assert.equal(r.guardado,true);assert.equal(r.ya_activo,true);assert.equal(r.ayuda_id,'AYU-00000001');assert.equal(e.filas.length,1);
});
test('ayuda: falsa alarma la retira y permite un aviso nuevo de inmediato',()=>{
 const e=entorno();e.enviar('AYU-00000001');assert.equal(e.falsa('AYU-00000001').cancelado,true);
 assert.equal(e.admin('TODOS').length,0);
 const r=e.enviar('AYU-00000002');assert.equal(r.guardado,true);assert.notEqual(r.ya_activo,true);assert.equal(e.admin('TODOS').length,1);
 e.falsa('AYU-00000001');assert.equal(e.filas.filter(f=>f[5]==='FALSA').length,1,'cancelar dos veces no duplica');
});
test('ayuda: un motorizado no puede cancelar el aviso de otro',()=>{
 const e=entorno();e.enviar();e.actor({id:'M2',nombre:'Otro',local_id:'L2'});
 assert.throws(()=>e.falsa('AYU-00000001'),/No encontramos/);assert.equal(e.admin('TODOS').length,1);
});
test('ayuda: atender la retira, queda quién la atendió y repetir no duplica; otro local no puede',()=>{
 const e=entorno();e.enviar();
 assert.throws(()=>e.atender('AYU-00000001',e.ctxL2),/no es de su local/);assert.equal(e.admin('L1').length,1);
 assert.equal(e.atender('AYU-00000001',e.ctxL1).atendida,true);
 assert.equal(e.admin('TODOS').length,0);assert.equal(e.atender('AYU-00000001',e.ctxD).atendida,true);
 const cierres=e.filas.filter(f=>f[5]==='ATENDIDA');assert.equal(cierres.length,1);assert.equal(cierres[0][1],'caja1');
 assert.throws(()=>e.atender('NO-EXISTE-01'),/ya no existe/);
});
test('ayuda: tras atender, el motorizado puede volver a avisar de inmediato',()=>{
 const e=entorno();e.enviar('AYU-00000001');e.atender('AYU-00000001');
 const r=e.enviar('AYU-00000002');assert.equal(r.guardado,true);assert.notEqual(r.ya_activo,true);assert.equal(e.admin('TODOS').length,1);
});
test('ayuda: sin pedidos en camino usa el local del motorizado; si atiende todos los locales lo ven todos',()=>{
 const e=entorno();e.pedidos.forEach(p=>p.estado='Entregado');e.actor({id:'M1',nombre:'Motor Demo',local_id:'L2'});e.enviar();
 assert.equal(e.admin('L2').length,1);assert.equal(e.admin('L1').length,0);
 const e2=entorno();e2.pedidos.forEach(p=>p.estado='Entregado');e2.enviar();assert.equal(e2.admin('L1').length,1);assert.equal(e2.admin('L2').length,1);
});
test('ayuda: vence a las horas configuradas (ajuste ayuda_vigencia_horas)',()=>{
 const e=entorno();e.enviar();e.avanzar(11*3600000);assert.equal(e.admin('TODOS').length,1);
 e.avanzar(2*3600000);assert.equal(e.admin('TODOS').length,0);
 const e2=entorno();e2.cfg.ayuda_vigencia_horas='1';e2.enviar();e2.avanzar(2*3600000);assert.equal(e2.admin('TODOS').length,0);
});
test('ayuda: datos no válidos no se guardan; ubicación inválida se deja vacía y el aviso igual sale',()=>{
 const e=entorno();assert.throws(()=>e.enviar('x'),/no válido/);assert.equal(e.filas.length,0);
 e.enviar('AYU-00000001',{lat:999,lng:'abc'});const a=e.admin('TODOS');assert.equal(a.length,1);assert.equal(a[0].lat,'');assert.equal(a[0].lng,'');
});
test('ayuda: si la caché se pierde se reconstruye desde la hoja',()=>{
 const e=entorno();e.enviar();Object.keys(e.cache).forEach(k=>delete e.cache[k]);assert.equal(e.admin('TODOS').length,1);
});
test('ayuda: si falla la escritura no queda candado tomado y se puede reintentar',()=>{
 const e=entorno();e.fallar(true);assert.throws(()=>e.enviar(),/fallo de escritura/);assert.equal(e.held(),false);
 e.fallar(false);assert.equal(e.enviar().guardado,true);assert.equal(e.filas.length,1);
});
test('ayuda: acciones registradas con los roles correctos y avisos del administrador incluidos',()=>{
 assert.match(gs,/ayudaAviso:\s+\{ tipo: 'sesion',\s+roles: \['motorizado'\]/);
 assert.match(gs,/ayudaAtender:\s+\{ tipo: 'sesion',\s+roles: \['dueno', 'cajero'\]/);
 assert.match(gs,/ayudas: ayudasParaAdmin_\(local\)/);
 assert.match(gs,/APP_VERSION_NUM = 30137/);assert.match(gs,/ayuda_vigencia_horas: '12'/);
});
