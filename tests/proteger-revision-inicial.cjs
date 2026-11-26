'use strict';
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const BASE='2f67aec5503a66d95d8f8352d3d06b5c2c0fc45d';
const anterior=()=>execFileSync('git',['show',BASE+':js/pedir.js'],{encoding:'utf8',maxBuffer:8*1024*1024});
module.exports=function sinRevision(s){
 const old=anterior();
 const inicio=old.indexOf('        if(cambioDetalle||Math.round(q.total*100)!==Math.round(importeMostrado*100)){'),fin=old.indexOf('        datos.total_esperado=q.total;',inicio);
 assert.ok(inicio>=0&&fin>inicio);
 const nuevo=s.replace(/  \/\* INICIO REVISION FINAL 3\.1\.47[\s\S]*?  \/\* FIN REVISION FINAL 3\.1\.47 \*\/\n\n/,'')
 .replace(/        \/\* INICIO PUERTA REVISION 3\.1\.47 \*\/[\s\S]*?        \/\* FIN PUERTA REVISION 3\.1\.47 \*\/\n/,old.slice(inicio,fin))
 .replace(` data-revision-foto="'+UI.esc(it.plato.id)+'"`,'').replace('Revisar pedido · <span id="total-boton">','Enviar pedido · <span id="total-boton">');
 assert.equal(nuevo,old,'Cambio fuera del perímetro de revisión inicial');
 return nuevo;
};
