'use strict';
// 3.1.33: servidor/Codigo.gs solo puede diferir de 3.1.32 en la ayuda del motorizado. Revierte esos cambios exactos y exige
// que el resultado sea IDÉNTICO al TXT 3.1.32 publicado (que luego pasa por proteger-monitoreo.cjs hacia la base estable).
const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=function sinAyuda(src){
 src=require('./proteger-insumos-validaciones.cjs').servidor(src);
 assert.equal(src,fs.readFileSync('servidor/Codigo_MiPedido_3.1.33.txt','utf8'),'TXT 3.1.33 idéntico a Codigo.gs');
 const a=src.indexOf('/* ---------- 13.3b Ayuda del motorizado'),b=src.indexOf('function accionRutaPedido_(',a);
 assert.ok(a>=0&&b>a,'bloque de ayuda no encontrado');
 let r=src.slice(0,a)+src.slice(b);
 const quitar=[
  ["var APP_VERSION = '3.1.33';","var APP_VERSION = '3.1.32';"],
  ['var APP_VERSION_NUM = 30133;','var APP_VERSION_NUM = 30132;'],
  ["  ayudaAviso:         { tipo: 'sesion',  roles: ['motorizado'], fn: accionAyudaAviso_ },\n  ayudaAtender:       { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionAyudaAtender_ },\n",''],
  ["  ayuda_vigencia_horas: '12', // 3.1.33: horas que una alerta de ayuda sin atender sigue visible\n",''],
  ["    if (k === 'ayuda_vigencia_horas' && !(Number(v) >= 1 && Number(v) <= 72)) throw fallo_('Horas de vigencia no válidas (1 a 72).');\n",''],
  ["}; }),\n    ayudas: ayudasParaAdmin_(local) // 3.1.33: alertas de ayuda del motorizado sin atender\n  } };","}; })\n  } };"]
 ];
 for(const [nuevo,viejo] of quitar){assert.equal(r.split(nuevo).length,2,'cambio esperado una sola vez: '+nuevo.slice(0,50));r=r.replace(nuevo,viejo);}
 assert.equal(r,fs.readFileSync('servidor/Codigo_MiPedido_3.1.32.txt','utf8'),'fuera de la ayuda el servidor 3.1.32 queda intacto');
 return r;
};
