/* Motor portátil de voz. No consulta ni escribe datos del negocio. */
(function(g){
 'use strict';
 var cola=[],activo=null,limite=8,preparado=false,comprobado=false,pendientes=[],observadores=[];
 function avisarEstado(){observadores.forEach(function(fn){try{fn(estado());}catch(e){}});}
 function observarEstado(fn){if(typeof fn==='function')observadores.push(fn);}
 function disponible(){return !!(g.speechSynthesis&&g.SpeechSynthesisUtterance);}
 function limpiar(conservarPreparacion){cola=[];pendientes=[];if(activo&&!(conservarPreparacion===true&&activo.primera)){g.clearTimeout(activo.timer);activo=null;try{g.speechSynthesis.cancel();}catch(e){}}avisarEstado();}
 function siguiente(){
  if(activo||!cola.length)return;
  var x=cola.shift();if(!x.valido())return siguiente();
  if(!disponible()){x.fallo();return siguiente();}
  var u,ref={timer:null,primera:x.primera,iniciado:false};activo=ref;
  function fin(error){if(activo!==ref)return;g.clearTimeout(ref.timer);activo=null;if(error){try{g.speechSynthesis.cancel();}catch(e){}if(error==='not-allowed'||error==='NotAllowedError'){preparado=false;comprobado=false;if(!x.primera&&!x.reintento&&x.valido()){x.reintento=true;if(pendientes.length<limite)pendientes.push(x);}}if(x.primera)preparado=false;if(x.valido())x.fallo();}else{preparado=true;if(!x.primera&&x.volumen>0)comprobado=true;if(x.valido())x.fin();}avisarEstado();siguiente();}
  try{
   u=new g.SpeechSynthesisUtterance(x.textoActual?String(x.textoActual()).slice(0,160):x.texto);u.lang='es-EC';u.rate=0.96;u.volume=x.volumen;
   var voces=g.speechSynthesis.getVoices()||[];var v=voces.find(function(v){return /^es[-_]EC$/i.test(v.lang);})||voces.find(function(v){return /^es[-_](MX|US|CO|AR|PE|CL)/i.test(v.lang);})||voces.find(function(v){return /^es/i.test(v.lang);});if(v){u.voice=v;u.lang=v.lang;}
   u.onstart=function(){ref.iniciado=true;};u.onend=function(){fin(false);};u.onerror=function(e){fin(e&&e.error||true);};
   ref.timer=g.setTimeout(function(){fin(!x.primera&&!ref.iniciado?'not-allowed':true);},x.primera?800:12000);g.speechSynthesis.speak(u);
  }catch(e){fin(e&&e.name||true);}
 }
 function hablar(texto,op){op=op||{};var x={texto:String(texto).slice(0,160),textoActual:typeof op.textoActual==='function'?op.textoActual:null,volumen:Math.max(0,Math.min(1,Number(op.volumen==null?1:op.volumen)||0)),valido:op.valido||function(){return true;},fallo:op.fallo||function(){},fin:op.fin||function(){},primera:op.primera===true,reintento:false};if(cola.length>=limite){if(x.valido())x.fallo();return false;}cola.push(x);siguiente();return true;}
 function activar(){if(!disponible()||activo)return false;if(pendientes.length){var xs=pendientes.splice(0).filter(function(x){return x.valido();});if(xs.length){cola=xs.concat(cola);siguiente();return true;}}if(preparado||cola.length)return preparado;return hablar('a',{volumen:0,primera:true});}
 function estado(){return !disponible()?'no disponible':comprobado?'reproducida':preparado?'preparada':'pendiente';}
 g.MIP_VOZ={observarEstado:observarEstado,hablar:hablar,limpiar:limpiar,disponible:disponible,activar:activar,estado:estado};
})(window);
