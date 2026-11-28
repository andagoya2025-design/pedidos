'use strict';
// 3.1.33: js/notificaciones.js y js/pedidos.js solo pueden diferir del motor estable en el aviso de ayuda del motorizado.
// Cada función revierte esos cambios exactos (cada uno debe aparecer UNA sola vez) y el resultado debe ser idéntico a la base.
const assert=require('node:assert/strict');
function quitar(src,lista){
 let r=src;
 for(const [nuevo,viejo] of lista){assert.equal(r.split(nuevo).length,2,'cambio esperado una sola vez: '+nuevo.slice(0,60));r=r.replace(nuevo,()=>viejo);}
 return r;
}
module.exports.notificaciones=function sinAyudaNotificaciones(src){
 const a=src.indexOf(' /* 3.1.33 AYUDA INICIO'),finTxt=' /* 3.1.33 AYUDA FIN */\n',b=src.indexOf(finTxt);
 assert.ok(a>=0&&b>a,'bloque de ayuda no encontrado');
 const r=src.slice(0,a)+src.slice(b+finTxt.length);
 return quitar(r,[
  [",ayuda:{titulo:'Ayuda del motorizado',voz:'Atención, un motorizado pide ayuda.',roles:['dueno','cajero'],vista:'monitoreo'}};",'};'],
  ['function reset(conservarPreparacion){limpiarAyudas();','function reset(conservarPreparacion){'],
  ["  if(tipo==='ayuda')return cantidad===1?(n?'Atención, '+n+' pide ayuda.':tipos[tipo].voz):'Atención, '+cantidad+' motorizados piden ayuda.';\n",''],
  ["ayuda:['alerta de ayuda','alertas de ayuda'],",''],
  ['g.MIP_AVISOS={ayudas:ayudas,','g.MIP_AVISOS={']
 ]);
};
module.exports.pedidos=function sinAyudaPedidos(src){
 return quitar(src,[["        if(global.MIP_AVISOS&&global.MIP_AVISOS.ayudas)global.MIP_AVISOS.ayudas(r.ayudas); // 3.1.33: alerta de ayuda del motorizado\n",'']]);
};
