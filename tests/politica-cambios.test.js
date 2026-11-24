/* Pruebas unitarias puras de política de cambios. Ejecutar: node tests/politica-cambios.test.js
 * No accede a Google Sheets ni modifica pedidos reales.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync(require('node:path').join(__dirname, '../servidor/Codigo.gs'), 'utf8');
const from = src.indexOf('function politicaCambiosPedido_(');
const to = src.indexOf('function accionPedidoPoliticaCambios_(', from);
assert.ok(from >= 0 && to > from, 'No se encontró la función central');
const ctx = vm.createContext({});
vm.runInContext(src.slice(from, to), ctx);
const policy = ctx.politicaCambiosPedido_;
const casos = [
  ['Recibido', 'agregar', true, 'solicitud_aprobacion'],
  ['Recibido', 'aumentar', true, 'solicitud_aprobacion'],
  ['Recibido', 'quitar', true, 'solicitud_aprobacion'],
  ['Recibido', 'reducir', true, 'solicitud_aprobacion'],
  ['Recibido', 'cambiar', true, 'solicitud_aprobacion'],
  ['Recibido', 'cancelar', true, 'solicitud_aprobacion'],
  ['Preparando', 'agregar', true, 'solicitud_aprobacion'],
  ['Preparando', 'aumentar', true, 'solicitud_aprobacion'],
  ['Preparando', 'quitar', false, 'sin_reduccion'],
  ['Preparando', 'reducir', false, 'sin_reduccion'],
  ['Preparando', 'cambiar', false, 'sin_reduccion'],
  ['En camino', 'agregar', false, 'nuevo_envio'],
  ['En camino', 'aumentar', false, 'nuevo_envio'],
  ['En camino', 'quitar', false, 'nuevo_envio'],
  ['Entregado', 'agregar', false, 'nuevo_pedido'],
  ['Anulado', 'cancelar', false, 'nuevo_pedido'],
  ['Desconocido', 'agregar', false, 'no_disponible'],
  ['Preparando', 'cancelar', false, 'no_disponible'],
];
for (const [estado, tipo, permitido, modalidad] of casos) {
  const r = policy(estado, tipo);
  assert.equal(r.permitido, permitido, estado + ' / ' + tipo);
  assert.equal(r.modalidad, modalidad, estado + ' / ' + tipo);
  assert.ok(r.mensaje && r.mensaje.length > 12, 'Mensaje requerido');
}
console.log('OK: ' + casos.length + ' escenarios de política de cambios');
