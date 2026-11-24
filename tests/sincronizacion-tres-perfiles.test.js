'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const ex=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+1);assert.ok(i>=0&&j>i,a);return s.slice(i,j)};
test('tres perfiles: revisión ligera, cambios, ventanas, segundo plano y reconexión',async()=>{
 let now=100000,revision='revision-001',counts={signals:0,client:0,admin:0,moto:0},data={estado:'Recibido',total:10.5};
 let hidden=false,modal=false,online=true,busy=false;
 let ids=0,timers=new Map(),events={},intervals=[];
 function setTimeoutFake(fn,n){const id=++ids;timers.set(id,{fn,due:now+n,n});return id}
 function clearTimeoutFake(id){timers.delete(id)}
 const listen=(name,fn)=>{(events[name]||(events[name]=[])).push(fn)};
 const emit=name=>{for(const fn of events[name]||[])fn()};
 const doc={get hidden(){return hidden},get visibilityState(){return hidden?'hidden':'visible'},querySelector:()=>modal,addEventListener:listen};
 const nav={get onLine(){return online}},global={addEventListener:listen};
 const fakeDate={now:()=>now};
 const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()};
 const maker=new Function('pedir','Date',ex(read('js/datos.js'),'  function crearVigiaSync()','  global.DATOS =')+';return crearVigiaSync')(async()=>{counts.signals++;return {revision}},fakeDate);
 const base={ocupado:()=>busy,crearVigiaSync:maker};
 let cs,as;
 const client=new Function('DATOS','document','navigator','global','misPedidos','activo','identidadSeguimiento','setInterval','consultarSeguimiento',ex(read('js/pedir.js'),'  var segEnCurso =','  async function consultarSeguimiento(')+';return {iniciarSeguimientoAutomatico,refrescarSeguimiento}')({...base},doc,nav,global,()=>[{s:'P1'}],()=>true,x=>x.s,(fn,n)=>{intervals.push({fn,n});return 1},async()=>{counts.client++;cs={...data};return true});
 const APP={sesion:{rol:'dueno',usuario:'a'},local:'L1',vistaActual:'pedidos'},state={textContent:''},count={textContent:''};
 const admin=new Function('APP','DATOS','document','navigator','global','UI','est','setTimeout','clearTimeout','avisarNuevo','cargar',ex(read('js/pedidos.js'),'  var vigia =','  function avisarNuevo(')+';return {vigilar}') (APP,{...base,pedir:async()=>({pedidos:[{id:'P1'}],solicitudes:[]})},doc,nav,global,{$:q=>q==='#pd-conexion'?state:count,fechaHora:()=>''},{datos:true},setTimeoutFake,clearTimeoutFake,()=>{},async()=>{counts.admin++;as={...data};return true});
 const MAPP={sesion:{rol:'motorizado',usuario:'m'},vistaActual:'entregas'},ms=read('js/motorizados.js');
 const moto=new Function('APP','DATOS','document','navigator','global','UI','setTimeout','clearTimeout','pintarMias',ex(ms,'  var mias = null;','  APP.vistas.entregas')+ex(ms,'  async function cargarMias(','  function pintarMias(')+';return {programarActualizacionEntregas,get:()=>mias}') (MAPP,{...base,pedir:async()=>{counts.moto++;return {pedidos:[{id:'P1',...data}],debe:{total:0}}}},doc,nav,global,{$:()=>null},setTimeoutFake,clearTimeoutFake,()=>{});
 async function drain(){for(let k=0;k<10;k++){const due=[...timers.entries()].filter(x=>x[1].due<=now);if(!due.length)break;for(const [id,t] of due){if(timers.has(id)){timers.delete(id);await t.fn();await flush()}}}}
 async function tick(){now+=3000;for(const x of intervals)x.fn();await drain();await flush()}
 const same=(status,total)=>{assert.equal(cs.estado,status);assert.equal(as.estado,status);assert.equal(moto.get().pedidos[0].estado,status);assert.equal(cs.total,total);assert.equal(as.total,total);assert.equal(moto.get().pedidos[0].total,total)};
 client.iniciarSeguimientoAutomatico();admin.vigilar();moto.programarActualizacionEntregas();await tick();same('Recibido',10.5);
 assert.equal(intervals[0].n,3000);assert.ok([...timers.values()].every(t=>t.n===3000));
 let before={...counts};await tick();assert.equal(counts.client,before.client);assert.equal(counts.admin,before.admin);assert.equal(counts.moto,before.moto);
 revision='revision-002';data={estado:'Preparando',total:8.5};await tick();same('Preparando',8.5);
 modal=true;revision='revision-003';data={estado:'En camino',total:8.5};before={...counts};await tick();assert.equal(counts.client,before.client);assert.equal(counts.admin,before.admin);assert.equal(counts.moto,before.moto);
 modal=false;await tick();await tick();same('En camino',8.5);
 hidden=true;revision='revision-004';data={estado:'Entregado',total:8.5};before={...counts};await tick();assert.equal(counts.client,before.client);assert.equal(counts.moto,before.moto);assert.ok([...timers.values()].some(t=>t.n===15000));assert.ok([...timers.values()].some(t=>t.n===30000));
 online=false;hidden=false;emit('visibilitychange');before={...counts};await tick();assert.equal(counts.client,before.client);assert.equal(counts.admin,before.admin);assert.equal(counts.moto,before.moto);
 online=true;emit('online');await drain();await flush();await tick();same('Entregado',8.5);
});
