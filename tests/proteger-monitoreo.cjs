'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
module.exports=function(src){
 const base=fs.readFileSync('servidor/Codigo_MiPedido_3.1.30.txt','utf8');
 const blob=createHash('sha1').update('blob '+Buffer.byteLength(base)+String.fromCharCode(0)).update(base).digest('hex');
 assert.equal(blob,'51691839a7df89d042086a5b8128bf85b72befd1','TXT estable no se ha modificado');
 const a='function registrarCorteGps_(',b='/* ---------- 13.5 Informe';
 const i=src.indexOf(a),j=src.indexOf(b,i),k=base.indexOf('function accionRastreoPunto_('),l=base.indexOf(b,k);
 assert.ok(i>=0&&j>i&&k>=0&&l>k);
 assert.equal(src,fs.readFileSync('servidor/Codigo_MiPedido_3.1.32.txt','utf8'));
 let restored=(src.slice(0,i)+base.slice(k,l)+src.slice(j)).replace("  monitoreoSeguro:    { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionMonitoreo_ },\n",'').replace("var APP_VERSION = '3.1.32';","var APP_VERSION = '3.1.30';").replace('var APP_VERSION_NUM = 30132;','var APP_VERSION_NUM = 30130;').replace("rutaPedido:         { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionRutaPedido_ },","rutaPedido:         { tipo: 'dueno',   fn: accionRutaPedido_ },");
 // Las únicas dos excepciones adicionales: corte GPS bajo el candado de reasignación y ETA GPS del cliente.
 restored=restored.replace("  rastreoLote:        { tipo: 'sesion',  roles: ['motorizado'], fn: accionRastreoLote_ },\n",'');
 // No se permite sustituir funciones completas: verificar todos los demás caracteres del bloque de asignación y ETA.
 const baseAsign=base.match(/    if \(String\(p\.motorizado_id\) !== motoId\) actualizarCampos_\('pedidos'[^\n]+/)[0];
 const cambioAsign="    if (String(p.motorizado_id) !== motoId) {\n      if (String(p.estado) === 'En camino') registrarCorteGps_(p, ctx);\n      "+baseAsign.trim().replace("if (String(p.motorizado_id) !== motoId) ","")+"\n    }";
 assert.ok(restored.includes(cambioAsign),'Corte GPS exacto');restored=restored.replace(cambioAsign,baseAsign);
 const viejoEta=base.slice(base.indexOf("  var puntos = leerTabla_('rastreo')",base.indexOf('function etaMoto316_(')),base.indexOf("  if (!ultimo) return null;",base.indexOf('function etaMoto316_(')));
 const nuevoEta="  var corte = corteGps_(p), ahora = new Date();\n  var confirmado = p.ultima_senal instanceof Date && (!corte || p.ultima_senal > corte);\n  var puntos = confirmado ? leerTabla_('rastreo').filter(function (r) { return puntoGpsVigente_(r, p, corte, ahora) && r.fecha <= p.ultima_senal; }) : [];\n  var ultimo = puntos.reduce(function (u, r) { return !u || r.fecha > u.fecha ? r : u; }, null);\n  if (!ultimo && (!corte || p.en_camino instanceof Date && p.en_camino > corte) && coord_(p.sali_lat, -90, 90) !== '' && coord_(p.sali_lng, -180, 180) !== '') ultimo = { lat: p.sali_lat, lng: p.sali_lng };\n";
 assert.ok(restored.includes(nuevoEta),'ETA GPS exacta');restored=restored.replace(nuevoEta,viejoEta);
 assert.equal(restored,base,'Servidor fuera del alcance monitoreo intacto');
 return restored;
};