'use strict';
// 3.1.51: js/inventario.js solo puede diferir del motor estable en el formulario «Nuevo insumo» (ejemplo del Mínimo,
// «Mínimo» y «Cantidad inicial» lado a lado y «Local» solo si hay varios). Revierte ese bloque y exige que TODO lo demás sea idéntico.
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const BASE='0caba7695269d82d58ab1eb86a2a13140f18483f';
module.exports=function sinCambiosInventario(actual){
 actual=require('./proteger-insumos-validaciones.cjs').inventario(actual);
 const viejo=execFileSync('git',['show',BASE+':js/inventario.js'],{encoding:'utf8',maxBuffer:8*1024*1024});
 const costo="        '<div class=\"fila-campos\"><div class=\"campo\"><label for=\"ins-costo\">";
 const iniNuevo="        '<div class=\"campo\"><label for=\"ins-unidad\">",iniViejo="        '<div class=\"fila-campos\"><div class=\"campo\"><label for=\"ins-unidad\">";
 const a=actual.indexOf(iniNuevo),b=actual.indexOf(costo),oa=viejo.indexOf(iniViejo),ob=viejo.indexOf(costo);
 assert.ok(a>=0&&b>a&&oa>=0&&ob>oa,'bloque del formulario de insumos no encontrado');
 const linea="    var locales = APP.locales.filter(function (l) { return l.activo || l.id === i.local_id; });\n";
 assert.equal(actual.split(linea).length,2,'la lista de locales debe aparecer una sola vez');
 return (actual.slice(0,a)+viejo.slice(oa,ob)+actual.slice(b)).replace(linea,'');
};
