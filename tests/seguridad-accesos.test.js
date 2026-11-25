const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const gs=fs.readFileSync('servidor/Codigo.gs','utf8'),app=fs.readFileSync('js/app.js','utf8');
const extract=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+1);assert.ok(i>=0&&j>i);return s.slice(i,j)};
const code=extract(gs,'function accionUsuarioClave_(', '/* ============================================================');
function sim(rol,cfg,actual='correcta',accion='self',activo=true){
 let writes=0,revokes=0,logs=0,releases=0;
 const d={validarClave_:v=>{if(v.length<6)throw Error('longitud')},limpiarTexto_:String,leerTabla_:()=>[{id:'U1',rol,activo,usuario:'demo'}],claveCorrecta_:v=>v==='correcta',fallo_:(m,c)=>Object.assign(Error(m),{codigo:c}),leerConfig_:()=>cfg,LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>releases++})},Utilities:{getUuid:()=> 'sal'},hashClave2_:()=> 'hash',actualizarCampos_:()=>writes++,revocarSesiones_:()=>revokes++,bitacora_:()=>logs++};
 const f=new Function(...Object.keys(d),code+';return {self:accionMiClave_,reset:accionUsuarioClave_}')(...Object.values(d));let error;
 try{f[accion]({id:'U1',actual,nueva:'nueva123',clave:'nueva123'},{sesion:{rol:accion==='reset'?'dueno':rol,usuario_id:'U1'}})}catch(e){error=e}
 return {writes,revokes,logs,releases,error};
}
for(const rol of ['dueno','cajero','motorizado','desconocido'])for(const v of ['SI','NO',undefined]){
 test('permiso '+rol+' '+v,()=>{const r=sim(rol,{permitir_clave_cajero:v,permitir_clave_motorizado:v});const ok=rol==='dueno'||v==='SI'&&['cajero','motorizado'].includes(rol);assert.equal(r.writes,ok?1:0);assert.equal(r.revokes,0);assert.equal(r.logs,ok?1:0);assert.equal(r.releases,1);if(!ok)assert.equal(r.error.codigo,'PERMISO')});
}
test('permisos independientes',()=>{const cfg={permitir_clave_cajero:'SI',permitir_clave_motorizado:'NO'};assert.equal(sim('cajero',cfg).writes,1);assert.equal(sim('motorizado',cfg).writes,0)});
test('clave incorrecta e inactivo no escriben',()=>{assert.equal(sim('dueno',{},'incorrecta').writes,0);assert.equal(sim('dueno',{},'correcta','self',false).writes,0)});
test('restablecimiento propietario no depende del permiso y revoca sesiones',()=>{const r=sim('motorizado',{},'','reset');assert.equal(r.writes,1);assert.equal(r.revokes,1);assert.equal(r.logs,1)});
test('navegación por perfil, cuenta antigua y QR',()=>{const f=new Function(extract(app,'  function inicioPorRol(', '  APP.parametros =')+';return destinoIngreso')();for(const [rol,home] of [['dueno','inicio'],['cajero','pedidos'],['motorizado','entregas']]){assert.equal(f(rol,'#cuenta',false),home);assert.equal(f(rol,'#menu',true),home);assert.equal(f(rol,'',true),home)}assert.equal(f('dueno','#pedidos?ver=PED-0005',true),'pedidos?ver=PED-0005');assert.equal(f('motorizado','#pedidos?ver=PED-0005',true),'entregas');assert.equal(f('dueno','#menu',false),'menu')});
test('configuración privada, formulario voluntario y autorización de servidor',()=>{assert.match(gs,/miClave:\s*\{ tipo: 'sesion'/);assert.match(gs,/usuarioClave:\s*\{ tipo: 'dueno'/);assert.doesNotMatch(extract(gs,'var CONFIG_PUBLICA =','/* Acciones:'),/permitir_clave/);assert.match(app,/id="form-mi-clave" autocomplete="off" hidden/);assert.match(app,/r\.puede_cambiar_clave === true/);assert.match(gs,/permisoMiClave_\(ctx.sesion.rol, leerConfig_\(\)\)/)});
