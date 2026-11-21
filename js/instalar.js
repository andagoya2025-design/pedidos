/**
 * ============================================================
 * INSTALADOR — diagnóstico paso a paso (idea de instalacion.js de
 * IASYN 2) y creación de las 18 hojas en la hoja de ESTE negocio.
 * ============================================================
 */
(function (global) {
  'use strict';
  var UI = global.UI, DATOS = global.DATOS, CFG = global.APP_CONFIG;

  function fila(texto, estado, detalle) {
    var clase = estado === 'ok' ? 'ok' : estado === 'mal' ? 'mal' : estado === 'aviso' ? 'aviso' : '';
    var nombre = estado === 'ok' ? 'Correcto' : estado === 'mal' ? 'Falta' : estado === 'aviso' ? 'Revisar' : 'Pendiente';
    return '<div class="estado-fila"><span>' + UI.esc(texto) + (detalle ? '<br><small style="color:var(--texto-2)">' + UI.esc(detalle) + '</small>' : '') + '</span>' +
      '<span class="etiqueta ' + clase + '">' + nombre + '</span></div>';
  }

  async function verificar() {
    var d = UI.$('#diagnostico');
    var form = UI.$('#form-instalar');
    form.hidden = true;
    var pasos = [];
    function pintar() { d.innerHTML = pasos.join(''); }

    if (!CFG.configurada) {
      pasos.push(fila('Dirección del servidor en js/config.js', 'mal', 'Pegue la dirección /exec del script publicado de este negocio.'));
      pasos.push(fila('Servidor responde', ''), fila('Versión del servidor', ''), fila('Hojas del sistema', ''));
      return pintar();
    }
    pasos.push(fila('Dirección del servidor en js/config.js', 'ok'));
    pasos.push(fila('Servidor responde', ''));
    pintar();

    var estado;
    try {
      estado = await DATOS.estado();
      pasos[1] = fila('Servidor responde', 'ok');
    } catch (err) {
      pasos[1] = fila('Servidor responde', 'mal', err.message + ' Revise que el script esté publicado como Aplicación web con acceso «Cualquier persona».');
      return pintar();
    }
    pasos.push(DATOS.scriptViejo()
      ? fila('Versión del servidor', 'mal', 'El script es más viejo que la pantalla. Pegue el Codigo.gs nuevo y publique una «Nueva versión».')
      : fila('Versión del servidor', 'ok'));

    var faltan = (estado.hojas || []).filter(function (h) { return !h.existe; }).length;
    if (estado.instalado) {
      pasos.push(fila('Sistema instalado', 'ok', (estado.config && estado.config.negocio_nombre) || ''));
      pasos.push(fila('Hojas del sistema (18)', faltan ? 'aviso' : 'ok', faltan ? 'Faltan ' + faltan + ' hoja(s). No borre hojas del sistema.' : ''));
      pintar();
      d.insertAdjacentHTML('beforeend', '<div class="acciones"><a class="btn bloque" href="./">Ir a la aplicación</a></div>');
      return;
    }
    pasos.push(fila('Sistema instalado', 'aviso', 'Todavía no. Complete los datos de abajo.'));
    pintar();
    if (!DATOS.scriptViejo()) form.hidden = false;
  }

  async function instalar(ev) {
    ev.preventDefault();
    var f = ev.target, boton = f.querySelector('button[type=submit]');
    var datos = UI.leerFormulario(f);
    datos.usuario = datos.usuario.toLowerCase();
    var malo = !datos.negocio_nombre ? 'Escriba el nombre del negocio.' :
      !datos.nombre ? 'Escriba el nombre del dueño.' :
      !/^[a-z0-9._-]{3,30}$/.test(datos.usuario) ? 'Usuario no válido: 3 a 30 letras o números, sin espacios.' :
      datos.clave.length < 6 ? 'La clave debe tener al menos 6 caracteres.' :
      datos.clave !== datos.clave2 ? 'Las dos claves no son iguales.' : '';
    if (malo) return UI.aviso(malo, 'error');
    var ok = await UI.confirmar('¿Instalar ahora?', 'Se crearán las hojas en la hoja de Google de «' + datos.negocio_nombre + '». Solo se hace una vez.', 'Sí, instalar');
    if (!ok) return;
    delete datos.clave2;
    await UI.trabajando(boton, async function () {
      try {
        await DATOS.pedir('instalar', datos, { guardar: true });
        await UI.ventana({ icono: '🎉', titulo: 'Instalación completa', texto: 'Ya puede ingresar con el usuario «' + datos.usuario + '».', botones: [{ texto: 'Ir a la aplicación', valor: true }], cerrable: false });
        global.location.href = './';
      } catch (err) {
        UI.error('No se instaló', err.message);
        verificar();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    UI.tema();
    UI.$('#btn-verificar').addEventListener('click', function (e) { UI.trabajando(e.currentTarget, verificar); });
    UI.$('#form-instalar').addEventListener('submit', instalar);
    verificar();
  });
})(window);
