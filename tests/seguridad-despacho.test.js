// node --test tests/seguridad-despacho.test.js
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../servidor/Codigo.gs'),'utf8');
function extraer(nombre) {
  const i=source.indexOf('function '+nombre+'(');
  assert.ok(i>=0,'Falta '+nombre);
  const e=source.indexOf('\nfunction ',i+15);
  return source.slice(i,e>=0?e:source.length);
}
function ejecutar(nombre,desde,hacia,solicitudEstado) {
  const p={id:'PED1',numero:'PED-0001',estado:desde,motorizado_id:'M1',zona_id:'Z1',
    liquidacion_id:'',cliente_id:'C1',pago_verificado:true};
  let escrituras=0;
  const ctx={sesion:{usuario:'cajero',rol:'dueno'},dispositivo:'test'};
  const deps={
    candado_:()=>({releaseLock(){}}),
    buscarPedido_:()=>p,
    pedidoDeMotorizado_:()=>p,
    cambiosPedido_:()=>[{pedido_id:'PED1',estado:solicitudEstado}],
    SpreadsheetApp:{getActive:()=>({getSheetByName:()=>({})})},
    fallo_:msg=>new Error(msg),
    actualizarCampos_:()=>{escrituras++},
    exigirPagoVerificado_:()=>{},
    exigirCodigoEntrega_:()=>{},
    nuevoCodigoEntrega_:()=> '123456',
    siNo_:()=>false,
    leerConfig_:()=>({}),
    cerrarCambiosIncompatibles_:()=>{},
    sumarEntregaCliente_:()=>{},
    bitacora_:()=>{},
    pedidoSalida_:()=>({}),
    coord_:()=>0,
    limpiarTexto_:v=>String(v||'')
  };
  const fn=new Function(...Object.keys(deps),extraer(nombre)+';return '+nombre)(...Object.values(deps));
  let error='';
  try {
    if (nombre==='accionPedidoEstado_') fn({id:'PED1',a:hacia},ctx);
    else if (nombre==='accionEntregaSali_') fn({id:'PED1'},ctx);
    else fn({id:'PED1',motivo:'Prueba de anulacion'},ctx);
  }catch(e){error=e.message;}
  return {error,escrituras};
}
test('restaurante no despacha con cotización por aceptar',()=>{
  const r=ejecutar('accionPedidoEstado_','Preparando','En camino','Cotizada');
  assert.match(r.error,/solicitud\(es\)/);
  assert.equal(r.escrituras,0);
});
test('motorizado no puede saltarse el bloqueo con Salí',()=>{
  const r=ejecutar('accionEntregaSali_','Preparando',null,'Confirmada cliente');
  assert.match(r.error,/resolver los cambios pendientes/);
  assert.equal(r.escrituras,0);
});
test('pedido no avanza si un adicional quedó parcialmente aplicado',()=>{
  const r=ejecutar('accionPedidoEstado_','Recibido','Preparando','Aplicando');
  assert.match(r.error,/aplicación incompleta/);
  assert.equal(r.escrituras,0);
});
test('pedido no se anula mientras un adicional está Aplicando',()=>{
  const r=ejecutar('accionPedidoAnular_','Preparando',null,'Aplicando');
  assert.match(r.error,/Conciliar antes de anular/);
  assert.equal(r.escrituras,0);
});
