'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
module.exports=function(src){
 const base=fs.readFileSync('servidor/Codigo_MiPedido_3.1.30.txt','utf8');
 const blob=createHash('sha1').update('blob '+Buffer.byteLength(base)+String.fromCharCode(0)).update(base).digest('hex');
 assert.equal(blob,'51691839a7df89d042086a5b8128bf85b72befd1','TXT estable no se ha modificado');
 const a='function accionRastreoPunto_(',b='/* ---------- 13.5 Informe';
 const i=src.indexOf(a),j=src.indexOf(b,i),k=base.indexOf(a),l=base.indexOf(b,k);
 assert.ok(i>=0&&j>i&&k>=0&&l>k);
 assert.equal(src,fs.readFileSync('servidor/Codigo_MiPedido_3.1.31.txt','utf8'));
 const restored=(src.slice(0,i)+base.slice(k,l)+src.slice(j)).replace("  monitoreoSeguro:    { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionMonitoreo_ },\n",'').replace("var APP_VERSION = '3.1.31';","var APP_VERSION = '3.1.30';").replace('var APP_VERSION_NUM = 30131;','var APP_VERSION_NUM = 30130;').replace("rutaPedido:         { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionRutaPedido_ },","rutaPedido:         { tipo: 'dueno',   fn: accionRutaPedido_ },");
 assert.equal(restored,base,'Servidor fuera del alcance monitoreo intacto');
 return restored;
};