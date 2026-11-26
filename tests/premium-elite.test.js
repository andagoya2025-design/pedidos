'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('élite: CSS sólo se carga en administración, con caché versionada',()=>{assert.match(read('index.html'),/css\/admin-elite\.css/);for(const p of ['pedir.html','driver.html'])assert.doesNotMatch(read(p),/css\/admin-elite\.css/);assert.match(read('sw.js'),/'css\/admin-elite\.css'/);assert.match(read('js/config.js'),/versionScriptMinima: 30129/);});
test('élite: métricas de catálogo usan datos cargados, no cifras fijas',()=>{const s=read('js/menu.js');assert.match(s,/elite-catalogo-resumen/);assert.match(s,/d\.platos\.length/);assert.match(s,/return p\.activo/);assert.match(s,/return p\.extras\.length/);assert.match(s,/data-agotado/);assert.match(s,/data-editar/);});
test('élite: estilos sin ocultar controles ni sustituir acciones',()=>{const s=read('css/admin-elite.css');assert.doesNotMatch(s,/display\s*:\s*none|visibility\s*:\s*hidden/);assert.match(s,/var\(--primario\)/);assert.match(s,/var\(--acento\)/);assert.match(s,/\.pedido\.atrasado/);assert.match(s,/data-agotado/);});
