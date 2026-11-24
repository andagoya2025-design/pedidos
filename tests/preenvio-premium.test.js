// Aislado: no red, no pedidos reales, no cobros.
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const src=read('js/pedir.js'),css=read('css/modulos.css');
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i+1);assert.ok(i>=0&&j>i);return src.slice(i,j)};
function fixture(){
  const p={id:'p',nombre:'Pollo',precio:8.5,extras:[{nombre:'Chifle',precio:.5},{nombre:'Salsa',precio:.755},{nombre:'Gratis',precio:0}]};
  const a={plato:p,extras:['Chifle','Chifle','Salsa'],cantidad:2},b={plato:p,extras:[],cantidad:1};
  const dom={},c={p,carrito:{},paso:1,envioPendiente:null,plato:()=>p,UI:{esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'),dinero:n=>'$'+n.toFixed(2),vibrar(){},ventana:async()=>({quitar:true,i:0})},cambio(){c.changed=(c.changed||0)+1},pintarPlatos(){},pintarBarra(){},agregar:async(...args)=>{c.edited=args}};
  vm.createContext(c);
  vm.runInContext(cut('function claveItem(','function subtotal(')+cut('function editarSeleccionPlato(','/* Foto grande')+cut('function maxExtraUI(','function inputExtraUI('),c);
  c.carrito[c.claveItem(p,a.extras)]=a;c.carrito[c.claveItem(p,b.extras)]=b;
  function input(i,value,type='number',checked=false){dom['[data-extra-q="'+i+'"]']={value,type,checked};dom['[data-extra-importe="'+i+'"]']={};dom['[data-extra-acumulado="'+i+'"]']={};}
  const v={querySelector:s=>dom[s]};
  return {c,p,a,b,dom,v,input};
}
test('Chifle: 2 por plato = $1.00; dos platos = $2.00',()=>{const {c,p,v,dom,input}=fixture();input(0,'2');c.actualizarImportesExtrasPreenvio(p.extras,v,2);assert.equal(dom['[data-extra-importe="0"]'].textContent,'$1.00');assert.equal(dom['[data-extra-acumulado="0"]'].textContent,'$2.00 en 2 platos');});
test('Subtotales de extras usan mismos centavos que unitario',()=>{const {c,a}=fixture();assert.equal(c.unitario(a),10.26);const html=c.desgloseExtrasPreenvio(a);assert.match(html,/4 × Chifle/);assert.match(html,/\$2\.00/);assert.match(html,/2 × Salsa/);assert.match(html,/\$1\.52/);});
test('Cero y datos inválidos no muestran importes inventados',()=>{const {c,p,v,dom,input}=fixture();input(0,'0');c.actualizarImportesExtrasPreenvio(p.extras,v,1);assert.equal(dom['[data-extra-importe="0"]'].textContent,'$0.00');assert.equal(dom['[data-extra-acumulado="0"]'].hidden,true);for(const n of ['','-1','1.5','1001']){input(0,n);c.actualizarImportesExtrasPreenvio(p.extras,v,2);assert.equal(dom['[data-extra-importe="0"]'].textContent,'—');assert.equal(dom['[data-extra-acumulado="0"]'].hidden,true);}});
test('Extra gratuito conserva selección binaria y valor cero',()=>{const {c,p,v,dom,input}=fixture();input(2,'on','checkbox',true);c.actualizarImportesExtrasPreenvio(p.extras,v,1);assert.equal(dom['[data-extra-importe="2"]'].textContent,'$0.00');});
test('Eliminar una combinación no elimina otra del mismo plato',async()=>{const {c,p,a,b}=fixture();await c.editarSeleccionPlato(p.id);assert.equal(c.carrito[c.claveItem(p,a.extras)],undefined);assert.equal(c.carrito[c.claveItem(p,b.extras)],b);assert.equal(c.changed,1);});
test('Editar reutiliza la combinación existente y no altera otra',async()=>{const {c,p,a,b}=fixture();c.UI.ventana=async()=>({quitar:false,i:0});await c.editarSeleccionPlato(p.id);assert.equal(c.edited[2],a);assert.equal(c.carrito[c.claveItem(p,b.extras)],b);assert.equal(c.changed,undefined);});
test('Cancelar o envío pendiente no modifica carrito',async()=>{const {c,p,a}=fixture();c.UI.ventana=async()=>null;await c.editarSeleccionPlato(p.id);assert.equal(c.carrito[c.claveItem(p,a.extras)],a);c.envioPendiente={op_id:'original'};c.UI.ventana=async()=>{throw Error('no debe abrir')};await c.editarSeleccionPlato(p.id);assert.equal(c.changed,undefined);});
test('Fotos originales conservadas y ajuste contain en cliente',()=>{assert.match(src,/UI\.esc\(p\.foto_url\)/);assert.match(css,/\.pedir-app \.plato-foto \{ aspect-ratio: 1 \/ 1/);assert.match(css,/\.pedir-app \.plato-foto img[^\n]+object-fit: contain/);});
