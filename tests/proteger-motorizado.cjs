'use strict';
// 3.1.48: js/motorizados.js solo puede diferir del motor estable en el bloque del turno (alerta de turno largo)
// y en el texto de ubicación sin dirección. Revierte esos dos cambios y exige que TODO lo demás sea idéntico.
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const BASE='2af2f16d229ed3d8e9c1eae4a2694a8c231438bd';
module.exports=function sinCambiosMotorizado(actual){
 const viejo=execFileSync('git',['show',BASE+':js/motorizados.js'],{encoding:'utf8',maxBuffer:8*1024*1024});
 const fin='  async function guardarConAviso';
 const a=actual.indexOf('  /* 3.1.48:'),b=actual.indexOf(fin),oa=viejo.indexOf('  function turnoHtml() {'),ob=viejo.indexOf(fin);
 assert.ok(a>=0&&b>a&&oa>=0&&ob>oa,'bloque de turno no encontrado');
 const sinTurno=actual.slice(0,a)+viejo.slice(oa,ob)+actual.slice(b);
 assert.equal(sinTurno.split('Ubicación marcada por el cliente').length,2,'el texto de ubicación debe aparecer una sola vez');
 const gps="global.RASTREO.actualizar(enCamino.map(function (p) { return p.id; }), enCamino.reduce(function (r, p) { if (p.gps_tramo) r[p.id] = p.gps_tramo; return r; }, Object.create(null)));";
 assert.equal(sinTurno.split(gps).length,3,'exactamente dos conexiones de tramos GPS autorizadas');
 return sinTurno.replaceAll(gps,"global.RASTREO.actualizar(enCamino.map(function (p) { return p.id; }));").replace('Ubicación marcada por el cliente','Ver en el mapa');
};
