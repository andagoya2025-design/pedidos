// Ejecutar: node --test tests/flujo-adicionales.test.js
// Simulaciones aisladas: sin datos reales, sin cobros ni Google Sheets.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'servidor', 'Codigo.gs'), 'utf8');
const from = source.indexOf('function validarStockAdicional_(');
const to = source.indexOf('function accionPedidoCambioResolver_(', from);
assert.ok(from >= 0 && to > from, 'No se encontró la aplicación de adicionales');
const code = source.slice(from, to);

function escenario(opts = {}) {
  const lineas = [{ plato_id: 'A', nombre: 'Pizza', cantidad: 2, extras: [], precio: 5, total_linea: 10 }];
  const impuesto = !!opts.ivaExcluido;
  const quote = {
    id: 'token-1', total_actual: 20, subtotal_adicional: 10,
    iva_adicional: impuesto ? 1.5 : 0, adicional: impuesto ? 11.5 : 10,
    total_estimado: impuesto ? 31.5 : 30, lineas
  };
  const cambio = {
    id: 'SOL1', pedido_id: 'P1', numero: 'PED-1', local_id: 'L1', tipo: 'agregar',
    estado: opts.estado || 'Confirmada cliente',
    cliente_confirmo_fecha: opts.sinConfirmacion ? '' : new Date(),
    cotizacion_id: 'token-1', cotizacion_json: JSON.stringify(quote), _fila: 2
  };
  const pedido = {
    id: 'P1', numero: 'PED-1', estado: opts.pedidoEstado || 'Preparando', local_id: 'L1',
    total: opts.totalOriginal == null ? 20 : opts.totalOriginal,
    subtotal: 20, base_iva: 17.39, iva: 2.61,
    forma_pago: opts.pago || 'efectivo',
    pago_verificado: opts.pagoOriginal !== false,
    liquidacion_id: opts.liquidado ? 'LIQ1' : '',
    inventario_descontado: false, _fila: 3
  };
  const db = {
    pedidos: [pedido],
    pedido_detalle: opts.detalleDuplicado ? [{id:'ADIC-token1-0'}] : [],
    recetas_plato: opts.stock == null ? [] : [{plato_id:'A',insumo_id:'I',cantidad:2}],
    insumos: [{id:'I',nombre:'Queso',local_id:'L1',stock:opts.stock == null ? 100 : opts.stock}]
  };
  const writes = [];
  const helpers = {
    candado_: () => ({releaseLock(){}}),
    limpiarTexto_: (v,n) => String(v || '').slice(0,n),
    cambiosPedido_: () => [cambio],
    puedeVerLocal_: () => opts.sinPermiso !== true,
    leerTabla_: table => db[table] || [],
    politicaCambiosPedido_: () => ({permitido:opts.noPermitido !== true}),
    redondear_: v => Math.round(Number(v)*100)/100,
    numero_: v => Number(v || 0),
    claveComparar_: v => String(v).toLowerCase(),
    fallo_: msg => new Error(msg),
    accionPedidoCambioCotizar_: () => ({data: {
      adicional: opts.cambioPrecio ? quote.adicional+1 : quote.adicional,
      total_estimado: quote.total_estimado,
      lineas
    }}),
    esDigital_: forma => forma === 'transferencia' || forma === 'deuna',
    actualizarCampos_: (table, fila, current, patch) => {
      writes.push({table,patch});
      Object.assign(current,patch);
    },
    agregarFilas_: (table, rows) => {
      if (opts.interrupcion && table === 'pedido_detalle') throw new Error('Fallo simulado en Google Sheets');
      writes.push({table,rows});
    },
    descontarInventario_: () => true,
    leerConfig_: () => ({precios_incluyen_iva: impuesto ? 'NO' : 'SI', iva_porcentaje:'15'}),
    siNo_: value => value === 'SI',
    CacheService: {getScriptCache:()=>({remove(){}})},
    limpiarMenuCache_: () => {},
    bitacora_: () => {},
    UI_dinero_: v => String(v)
  };
  const fn = new Function(...Object.keys(helpers),code+';return accionPedidoCambioAplicar_')(...Object.values(helpers));
  const apply = (data={}) => fn({
    id:'SOL1',cotizacion_id:'token-1',
    pago_adicional_verificado:data.pagoAdicional === true,
    referencia_pago_extra:data.referencia || ''
  },{sesion:{usuario:'cajero'},dispositivo:'test'});
  return {apply,cambio,pedido,writes,quote};
}

test('efectivo aplica una sola vez el adicional y actualiza el total', () => {
  const e=escenario(), r=e.apply().data;
  assert.equal(r.aplicado,true);
  assert.equal(e.cambio.estado,'Aplicada');
  assert.equal(e.pedido.total,30);
  assert.ok(e.writes.some(w=>w.table==='pedido_detalle'));
});
test('digital sin pago adicional verificado no escribe', () => {
  const e=escenario({pago:'transferencia'});
  assert.throws(()=>e.apply(),/Confirma en el banco/);
  assert.equal(e.writes.length,0);
});
test('digital sin referencia bancaria no escribe', () => {
  const e=escenario({pago:'deuna'});
  assert.throws(()=>e.apply({pagoAdicional:true}),/referencia/);
  assert.equal(e.writes.length,0);
});
test('digital verificado con referencia aplica', () => {
  const e=escenario({pago:'deuna'});
  e.apply({pagoAdicional:true,referencia:'TRX-4567'});
  assert.equal(e.cambio.referencia_pago_extra,'TRX-4567');
  assert.equal(e.pedido.total,30);
});
test('pago original sin verificar impide cobro adicional', () => {
  const e=escenario({pago:'transferencia',pagoOriginal:false});
  assert.throws(()=>e.apply({pagoAdicional:true,referencia:'TRX-4567'}),/pago original/);
});
test('solicitud aplicada es idempotente y no duplica detalles', () => {
  const e=escenario({estado:'Aplicada'});
  assert.equal(e.apply().data.repetida,true);
  assert.equal(e.writes.length,0);
});
test('stock agregado insuficiente bloquea sin escrituras', () => {
  const e=escenario({stock:3});
  assert.throws(()=>e.apply(),/Inventario insuficiente/);
  assert.equal(e.writes.length,0);
});
test('precios cambiados bloquean la aplicación', () => {
  const e=escenario({cambioPrecio:true});
  assert.throws(()=>e.apply(),/Cambió el precio/);
  assert.equal(e.writes.length,0);
});
test('total del pedido cambiado bloquea la aplicación', () => {
  const e=escenario({totalOriginal:25});
  assert.throws(()=>e.apply(),/total original cambió/);
  assert.equal(e.writes.length,0);
});
test('no aplica sin confirmación del cliente', () => {
  const e=escenario({sinConfirmacion:true});
  assert.throws(()=>e.apply(),/Primero debe aceptar/);
  assert.equal(e.writes.length,0);
});
test('no aplica pedidos ya liquidados', () => {
  const e=escenario({liquidado:true});
  assert.throws(()=>e.apply(),/liquidado/);
});
test('no aplica desde otro local', () => {
  const e=escenario({sinPermiso:true});
  assert.throws(()=>e.apply(),/sin permiso/);
});
test('filas de adicionales repetidas exigen revisión manual', () => {
  const e=escenario({detalleDuplicado:true});
  assert.throws(()=>e.apply(),/conciliación/);
  assert.equal(e.writes.length,0);
});
test('interrupción deja Aplicando para evitar doble cobro y despacho', () => {
  const e=escenario({interrupcion:true});
  assert.throws(()=>e.apply(),/Fallo simulado/);
  assert.equal(e.cambio.estado,'Aplicando');
  assert.throws(()=>e.apply(),/aplicación quedó incompleta/);
  assert.equal(e.writes.filter(w=>w.table==='pedido_detalle').length,0);
});
test('impuestos excluidos se suman en el total adicional', () => {
  const e=escenario({ivaExcluido:true});
  e.apply();
  assert.equal(e.pedido.total,31.5);
  assert.equal(e.pedido.base_iva,27.39);
  assert.equal(e.pedido.iva,4.11);
});
