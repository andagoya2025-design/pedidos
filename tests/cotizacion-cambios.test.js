// node --test tests/cotizacion-cambios.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'servidor', 'Codigo.gs'), 'utf8');
const start = source.indexOf('function accionPedidoCambioCotizar_(');
const end = source.indexOf('function accionPedidoCambioResolver_(', start);
assert.ok(start >= 0 && end > start, 'La cotización debe existir en el backend');
const fnSource = source.slice(start, end);
function cotizar(data, overrides = {}) {
  const base = {
    limpiarTexto_: (v,n) => String(v || '').slice(0,n),
    cambiosPedido_: () => [{id:'SOL1',local_id:'LOC1',pedido_id:'P1',estado:'Pendiente',tipo:'agregar'}],
    puedeVerLocal_: () => true,
    leerTabla_: t => ({
      pedidos:[{id:'P1',numero:'PED-0001',estado:'Preparando',local_id:'LOC1',total:20}],
      platos:[{id:'PL1',activo:true,agotado:false,local_id:'LOC1',precio:5,nombre:'Pizza',extras_json:''}]
    })[t] || [],
    politicaCambiosPedido_: (e,t) => ({permitido:e==='Preparando' && t==='agregar'}),
    agotadosPorLocal_: () => ({}),
    leerExtras_: () => [],
    numero_: Number,
    redondear_: v => Math.round(v*100)/100,
    claveComparar_: v => String(v).toLowerCase(),
    fallo_: msg => new Error(msg),
    leerConfig_: () => ({ precios_incluyen_iva: 'SI', iva_porcentaje: '15' }),
    siNo_: v => String(v) === 'SI',
    detallePorPedido_: () => ({})
  };
  const env = {...base,...overrides};
  const fn = new Function(...Object.keys(env),fnSource+';return accionPedidoCambioCotizar_')(...Object.values(env));
  return fn(data, {}).data;
}
test('cotiza dos unidades sin modificar el pedido', () => {
  const r = cotizar({id:'SOL1',items:[{plato_id:'PL1',cantidad:2}]});
  assert.equal(r.adicional,10);
  assert.equal(r.total_estimado,30);
  assert.equal(r.aplicado,false);
  assert.equal(r.inventario_reservado,false);
  assert.equal(r.requiere_confirmacion_cliente,true);
});
test('rechaza cantidades inválidas', () => assert.throws(() => cotizar({id:'SOL1',items:[{plato_id:'PL1',cantidad:0}]}),/Cantidad/));
test('rechaza productos no disponibles', () => assert.throws(() => cotizar({id:'SOL1',items:[{plato_id:'NO',cantidad:1}]}),/disponible/));
test('rechaza cotización vacía', () => assert.throws(() => cotizar({id:'SOL1',items:[]}),/Elige/));
test('rechaza extras inexistentes', () => assert.throws(() => cotizar({id:'SOL1',items:[{plato_id:'PL1',cantidad:1,extras:['inexistente']}]}),/extra/));
test('impide cotizar solicitudes ajenas al local', () => assert.throws(() => cotizar({id:'SOL1',items:[{plato_id:'PL1',cantidad:1}]},{puedeVerLocal_:()=>false}),/permiso/));
test('impide cotizar una solicitud ya resuelta', () => assert.throws(() => cotizar({id:'SOL1',items:[{plato_id:'PL1',cantidad:1}]},{cambiosPedido_:()=>[{id:'SOL1',local_id:'LOC1',pedido_id:'P1',estado:'Rechazada',tipo:'agregar'}]}),/resuelta/));
test('impide cotizar si el pedido ya salió', () => assert.throws(() => cotizar({id:'SOL1',items:[{plato_id:'PL1',cantidad:1}]},{politicaCambiosPedido_:()=>({permitido:false})}),/no admite/));
