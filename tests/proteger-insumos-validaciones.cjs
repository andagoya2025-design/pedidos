'use strict';
// 3.1.53: solo las validaciones de cantidades y unidades y el aviso de respuesta incierta.
// Mantiene en vigor toda la cadena de comparaciones históricas, sin omitir ningún byte.
const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const BASE='3151d235f23d4446327aad24a4d7f468732c0fe1';
function restaurar(src,old,a,b,hash){
 const i=src.indexOf(a),j=src.indexOf(b,i+1),k=old.indexOf(a),l=old.indexOf(b,k+1);
 assert.ok(i>=0&&j>i&&k>=0&&l>k,'bloque de inventario autorizado');
 assert.equal(createHash('sha256').update(src.slice(i,j)).digest('hex'),hash,'bloque autorizado exacto');
 return src.slice(0,i)+old.slice(k,l)+src.slice(j);
}
exports.servidor=function(src){
 assert.equal(src,fs.readFileSync('servidor/Codigo_MiPedido_3.1.34.txt','utf8'),'TXT 3.1.34 idéntico');
 const old=fs.readFileSync('servidor/Codigo_MiPedido_3.1.33.txt','utf8');
 assert.equal(createHash('sha1').update('blob '+Buffer.byteLength(old)+'\0').update(old).digest('hex'),'8e267353e0d35b482a1424256e0d8b0e5528f739','TXT 3.1.33 protegido');
 const r=restaurar(src,old,'function accionInsumoGuardar_(','function accionInventarioHistorial_(','260545b1335b6e54335b324edcdf327593ceb244fdeffd3f6756eb41fefa3bbf').replace("var APP_VERSION = '3.1.34';","var APP_VERSION = '3.1.33';").replace('var APP_VERSION_NUM = 30134;','var APP_VERSION_NUM = 30133;');
 assert.equal(r,old,'servidor fuera de las validaciones de insumos intacto');return r;
};
exports.inventario=function(src){
 const old=execFileSync('git',['show',BASE+':js/inventario.js'],{encoding:'utf8',maxBuffer:8*1024*1024});
 const r=restaurar(src,old,'  async function editar(i) {','  async function historial(i) {','03aa4a68ed78ea70db438c997cada22d81363ff1be600dd75a90476a5ce96dda');
 assert.equal(r,old,'interfaz fuera de las validaciones de insumos intacta');return r;
};
