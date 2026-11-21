/**
 * ============================================================
 * SISTEMA DE PEDIDOS Y ENTREGAS — SCRIPT DEL SERVIDOR
 * Archivo: Codigo.gs (se pega completo en Extensiones > Apps Script
 * de la hoja del cliente y se publica como Aplicación web).
 * Fase 1: instalador, sesión, usuarios, locales, configuración,
 * licencia y bitácora.
 *
 * Reglas fijas (ver prompt maestro):
 * - Fecha y hora las pone el servidor, en la zona horaria configurada.
 * - Fechas como fecha real; dinero como número; teléfonos y cédulas
 *   como texto; lo que escribe la persona nunca se vuelve fórmula.
 * - Cero duplicados: claves únicas revisadas con candado.
 * - Nada se borra: se desactiva o se anula, con bitácora.
 * - Toda respuesta es real: {ok, data | error, codigo, ms, version}.
 * ============================================================
 */

var APP_VERSION = '1.0.0';
var APP_VERSION_NUM = 10000; // 1.0.0 -> 10000 (la pantalla compara con su mínimo)
var SESION_SEGUNDOS = 21600;  // 6 h; se renueva con cada uso
var ROLES = ['dueno', 'cajero', 'motorizado'];

/* ============================================================
 * 1. ESTRUCTURA DE LAS 18 HOJAS
 * Tipos de columna: t = texto, d = fecha y hora, f = solo fecha,
 * n = número, m = dinero (2 decimales), b = sí/no (casilla).
 * ============================================================ */
var HOJAS = {
  configuracion: [['clave', 't'], ['valor', 't'], ['actualizado', 'd'], ['actualizado_por', 't']],
  locales: [['id', 't'], ['nombre', 't'], ['direccion', 't'], ['telefono', 't'], ['activo', 'b'], ['creado', 'd'], ['creado_por', 't']],
  categorias: [['id', 't'], ['local_id', 't'], ['nombre', 't'], ['orden', 'n'], ['activo', 'b'], ['creado', 'd']],
  platos: [['id', 't'], ['local_id', 't'], ['categoria_id', 't'], ['nombre', 't'], ['descripcion', 't'], ['precio', 'm'], ['foto_url', 't'], ['extras_json', 't'], ['agotado', 'b'], ['activo', 'b'], ['creado', 'd']],
  pedidos: [['id', 't'], ['numero', 't'], ['op_id', 't'], ['local_id', 't'], ['dia_trabajo', 'f'], ['cliente_id', 't'], ['cliente_nombre', 't'], ['telefono', 't'], ['direccion', 't'], ['referencia', 't'], ['lat', 'n'], ['lng', 'n'], ['zona_id', 't'], ['forma_pago', 't'], ['subtotal', 'm'], ['envio', 'm'], ['descuento', 'm'], ['total', 'm'], ['cupon', 't'], ['estado', 't'], ['motorizado_id', 't'], ['creado', 'd'], ['preparando', 'd'], ['en_camino', 'd'], ['entregado', 'd'], ['anulado', 'd'], ['motivo_anulacion', 't'], ['usuario', 't']],
  pedido_detalle: [['id', 't'], ['pedido_id', 't'], ['plato_id', 't'], ['nombre', 't'], ['precio', 'm'], ['cantidad', 'n'], ['extras', 't'], ['total_linea', 'm']],
  clientes: [['id', 't'], ['telefono', 't'], ['nombre', 't'], ['direccion', 't'], ['referencia', 't'], ['lat', 'n'], ['lng', 'n'], ['pedidos', 'n'], ['total_gastado', 'm'], ['ultimo_pedido', 'd'], ['creado', 'd']],
  motorizados: [['id', 't'], ['nombre', 't'], ['cedula', 't'], ['celular', 't'], ['direccion', 't'], ['placa', 't'], ['foto_url', 't'], ['usuario_id', 't'], ['activo', 'b'], ['creado', 'd']],
  insumos: [['id', 't'], ['local_id', 't'], ['nombre', 't'], ['unidad', 't'], ['stock', 'n'], ['minimo', 'n'], ['activo', 'b'], ['creado', 'd']],
  movimientos_inventario: [['id', 't'], ['fecha', 'd'], ['local_id', 't'], ['insumo_id', 't'], ['tipo', 't'], ['cantidad', 'n'], ['motivo', 't'], ['local_destino', 't'], ['usuario', 't']],
  recetas_plato: [['id', 't'], ['plato_id', 't'], ['insumo_id', 't'], ['cantidad', 'n']],
  caja: [['id', 't'], ['local_id', 't'], ['dia_trabajo', 'f'], ['apertura', 'd'], ['fondo', 'm'], ['abierta_por', 't'], ['cierre', 'd'], ['esperado', 'm'], ['contado', 'm'], ['diferencia', 'm'], ['cerrada_por', 't'], ['estado', 't']],
  usuarios: [['id', 't'], ['usuario', 't'], ['nombre', 't'], ['rol', 't'], ['local_id', 't'], ['hash', 't'], ['sal', 't'], ['activo', 'b'], ['creado', 'd'], ['ultimo_acceso', 'd']],
  bitacora: [['fecha', 'd'], ['usuario', 't'], ['rol', 't'], ['local_id', 't'], ['modulo', 't'], ['accion', 't'], ['detalle', 't'], ['dispositivo', 't']],
  zonas_envio: [['id', 't'], ['local_id', 't'], ['nombre', 't'], ['costo', 'm'], ['minutos', 'n'], ['activo', 'b'], ['creado', 'd']],
  caja_movimientos: [['id', 't'], ['caja_id', 't'], ['fecha', 'd'], ['tipo', 't'], ['monto', 'm'], ['forma', 't'], ['motivo', 't'], ['pedido_id', 't'], ['motorizado_id', 't'], ['usuario', 't']],
  liquidaciones_motorizado: [['id', 't'], ['caja_id', 't'], ['motorizado_id', 't'], ['fecha', 'd'], ['fondo', 'm'], ['efectivo_cobrado', 'm'], ['entregado', 'm'], ['diferencia', 'm'], ['recibido_por', 't']],
  cupones: [['id', 't'], ['codigo', 't'], ['tipo', 't'], ['valor', 'n'], ['vence', 'f'], ['usos_max', 'n'], ['usos', 'n'], ['activo', 'b'], ['creado', 'd']]
};

/* Configuración por defecto (todo se cambia desde la pantalla). */
var CONFIG_DEFECTO = {
  negocio_nombre: 'Mi Restaurante',
  logo_url: '',
  color_primario: '#1F1B16',
  color_acento: '#E4572E',
  whatsapp: '',
  pais_codigo: '593',
  ciudad: 'Quito',
  moneda: 'USD',
  zona_horaria: 'America/Guayaquil',
  iva_porcentaje: '15',
  precios_incluyen_iva: 'SI',
  hora_cierre_dia: '03:00',
  licencia_estado: 'activa',
  licencia_vence: '',
  mensaje_bienvenida: '¡Bienvenido! Haz tu pedido en pocos pasos.'
};

/* Campos de configuración que puede ver cualquiera (sin sesión). */
var CONFIG_PUBLICA = ['negocio_nombre', 'logo_url', 'color_primario', 'color_acento', 'whatsapp', 'pais_codigo', 'ciudad', 'moneda', 'zona_horaria', 'mensaje_bienvenida'];

/* Acciones: quién puede usarlas. 'publica' = sin sesión. */
var ACCIONES = {
  estado:            { tipo: 'publica', fn: accionEstado_ },
  instalar:          { tipo: 'publica', fn: accionInstalar_ },
  login:             { tipo: 'publica', fn: accionLogin_ },
  sesion:            { tipo: 'sesion',  fn: accionSesion_ },
  cerrarSesion:      { tipo: 'sesion',  fn: accionCerrarSesion_ },
  configObtener:     { tipo: 'dueno',   fn: accionConfigObtener_ },
  configGuardar:     { tipo: 'dueno',   fn: accionConfigGuardar_ },
  localesListar:     { tipo: 'sesion',  fn: accionLocalesListar_ },
  localGuardar:      { tipo: 'dueno',   fn: accionLocalGuardar_ },
  usuariosListar:    { tipo: 'dueno',   fn: accionUsuariosListar_ },
  usuarioGuardar:    { tipo: 'dueno',   fn: accionUsuarioGuardar_ },
  usuarioClave:      { tipo: 'dueno',   fn: accionUsuarioClave_ },
  miClave:           { tipo: 'sesion',  fn: accionMiClave_ },
  bitacoraListar:    { tipo: 'dueno',   fn: accionBitacoraListar_ }
};

/* ============================================================
 * 2. ENTRADA (doGet / doPost) — una sola puerta
 * ============================================================ */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var accion = p.accion || 'estado';
  if (accion !== 'estado') {
    return responder_({ ok: false, codigo: 'SOLO_POST', error: 'Esta acción se usa por POST.' }, Date.now());
  }
  return ejecutar_(accion, {}, '', Date.now());
}

function doPost(e) {
  var inicio = Date.now();
  var cuerpo = {};
  try {
    cuerpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return responder_({ ok: false, codigo: 'JSON', error: 'Pedido mal formado.' }, inicio);
  }
  return ejecutar_(String(cuerpo.accion || ''), cuerpo.data || {}, String(cuerpo.token || ''), inicio, String(cuerpo.dispositivo || ''));
}

function ejecutar_(accion, data, token, inicio, dispositivo) {
  var def = ACCIONES[accion];
  if (!def) return responder_({ ok: false, codigo: 'ACCION', error: 'Acción no reconocida.' }, inicio);
  try {
    var ctx = { dispositivo: String(dispositivo || '').slice(0, 120) };
    if (def.tipo !== 'publica') {
      if (!estaInstalado_()) return responder_({ ok: false, codigo: 'NO_INSTALADO', error: 'El sistema aún no está instalado.' }, inicio);
      var ses = leerSesion_(token);
      if (!ses) return responder_({ ok: false, codigo: 'SESION', error: 'Su sesión terminó. Ingrese de nuevo.' }, inicio);
      if (def.tipo === 'dueno' && ses.rol !== 'dueno') {
        bitacora_(ses, 'SEGURIDAD', 'SIN_PERMISO', accion);
        return responder_({ ok: false, codigo: 'PERMISO', error: 'No tiene permiso para esta acción.' }, inicio);
      }
      ctx.sesion = ses;
      ctx.token = token;
    }
    var res = def.fn(data || {}, ctx);
    return responder_(res, inicio);
  } catch (err) {
    var msg = (err && err.publico) ? err.message : 'No se pudo completar. Intente de nuevo.';
    if (!(err && err.publico)) console.error(accion + ': ' + (err && err.stack || err));
    return responder_({ ok: false, codigo: (err && err.codigo) || 'ERROR', error: msg }, inicio);
  }
}

function responder_(obj, inicio) {
  obj = obj || {};
  obj.version = APP_VERSION;
  obj.version_num = APP_VERSION_NUM;
  obj.ms = Date.now() - (inicio || Date.now());
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* Error que sí se muestra a la persona. */
function fallo_(mensaje, codigo) {
  var e = new Error(mensaje);
  e.publico = true;
  e.codigo = codigo || 'VALIDACION';
  return e;
}

/* ============================================================
 * 3. INSTALADOR — crea las 18 hojas con su formato, una sola vez
 * ============================================================ */
function estaInstalado_() {
  return PropertiesService.getScriptProperties().getProperty('INSTALADO') === 'SI';
}

function accionEstado_() {
  var instalado = estaInstalado_();
  var out = { instalado: instalado, hojas: [], config: {} };
  var ss = SpreadsheetApp.getActive();
  Object.keys(HOJAS).forEach(function (n) {
    out.hojas.push({ nombre: n, existe: !!ss.getSheetByName(n) });
  });
  if (instalado) {
    var cfg = leerConfig_();
    CONFIG_PUBLICA.forEach(function (k) { out.config[k] = cfg[k] == null ? '' : cfg[k]; });
    out.licencia = estadoLicencia_(cfg);
  }
  return { ok: true, data: out };
}

function accionInstalar_(data, ctx) {
  var nombre = limpiarTexto_(data.negocio_nombre, 80);
  var usuario = normalizarUsuario_(data.usuario);
  var nombrePersona = limpiarTexto_(data.nombre, 80);
  var clave = String(data.clave || '');
  if (!nombre) throw fallo_('Escriba el nombre del negocio.');
  if (!nombrePersona) throw fallo_('Escriba el nombre del dueño.');
  validarUsuario_(usuario);
  validarClave_(clave);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw fallo_('El sistema está ocupado. Intente en un momento.', 'OCUPADO');
  try {
    if (estaInstalado_()) throw fallo_('Este sistema ya fue instalado. Ingrese con su usuario.', 'YA_INSTALADO');
    var ss = SpreadsheetApp.getActive();
    var zona = CONFIG_DEFECTO.zona_horaria;
    ss.setSpreadsheetTimeZone(zona);

    Object.keys(HOJAS).forEach(function (n) { prepararHoja_(ss, n); });

    // Quitar la "Hoja 1" vacía que trae una hoja nueva.
    ss.getSheets().forEach(function (sh) {
      if (!HOJAS[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
    });

    var ahora = new Date();
    var cfg = JSON.parse(JSON.stringify(CONFIG_DEFECTO));
    cfg.negocio_nombre = nombre;
    var vence = new Date(ahora.getTime()); vence.setFullYear(vence.getFullYear() + 1);
    cfg.licencia_vence = Utilities.formatDate(vence, zona, 'yyyy-MM-dd');
    var filasCfg = Object.keys(cfg).map(function (k) { return [k, String(cfg[k]), ahora, usuario]; });
    agregarFilas_('configuracion', filasCfg);

    var filasLocales = [];
    for (var i = 1; i <= 5; i++) filasLocales.push([nuevoId_('LOC'), 'Local ' + i, '', '', true, ahora, usuario]);
    agregarFilas_('locales', filasLocales);

    var sal = Utilities.getUuid();
    agregarFilas_('usuarios', [[nuevoId_('USR'), usuario, nombrePersona, 'dueno', 'TODOS', hashClave_(clave, sal), sal, true, ahora, '']]);

    PropertiesService.getScriptProperties().setProperty('INSTALADO', 'SI');
    SpreadsheetApp.flush();
    bitacora_({ usuario: usuario, rol: 'dueno', local_id: 'TODOS' }, 'INSTALACION', 'INSTALAR', 'Versión ' + APP_VERSION, ctx && ctx.dispositivo);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, data: { instalado: true } };
}

/* Crea la hoja (si falta), pone encabezados fijos y el formato de cada columna. */
function prepararHoja_(ss, nombre) {
  var cols = HOJAS[nombre];
  var sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  var encabezados = cols.map(function (c) { return c[0]; });
  sh.getRange(1, 1, 1, cols.length).setValues([encabezados]).setFontWeight('bold').setBackground('#1F1B16').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  var maxFilas = Math.max(sh.getMaxRows() - 1, 1);
  cols.forEach(function (c, i) {
    var r = sh.getRange(2, i + 1, maxFilas, 1);
    if (c[1] === 't') r.setNumberFormat('@');
    else if (c[1] === 'd') r.setNumberFormat('dd/mm/yyyy HH:mm');
    else if (c[1] === 'f') r.setNumberFormat('dd/mm/yyyy');
    else if (c[1] === 'm') r.setNumberFormat('0.00');
    else if (c[1] === 'n') r.setNumberFormat('0.######');
  });
  // Protección: solo el dueño de la hoja la edita a mano (el script sí escribe).
  return sh;
}

/* ============================================================
 * 4. LECTURA Y ESCRITURA SEGURA
 * ============================================================ */
function hoja_(nombre) {
  var sh = SpreadsheetApp.getActive().getSheetByName(nombre);
  if (!sh) throw fallo_('Falta la hoja "' + nombre + '". Vuelva a ejecutar el instalador.', 'HOJA');
  return sh;
}

/* Devuelve [{campo: valor, _fila: n}] usando los nombres de columna. */
function leerTabla_(nombre) {
  var sh = hoja_(nombre);
  var ultima = sh.getLastRow();
  var cols = HOJAS[nombre];
  if (ultima < 2) return [];
  var valores = sh.getRange(2, 1, ultima - 1, cols.length).getValues();
  return valores.map(function (fila, i) {
    var o = { _fila: i + 2 };
    cols.forEach(function (c, j) { o[c[0]] = fila[j]; });
    return o;
  });
}

/* Convierte cada valor a su tipo correcto antes de escribir. */
function convertirFila_(nombre, fila) {
  var cols = HOJAS[nombre];
  return cols.map(function (c, i) {
    var v = fila[i];
    if (v === null || v === undefined) return '';
    switch (c[1]) {
      case 't': return textoSeguro_(v);        // texto plano: nunca fórmula
      case 'd':
      case 'f': return (v instanceof Date) ? v : (v === '' ? '' : fechaDesdeTexto_(v));
      case 'm': return v === '' ? '' : redondear_(Number(v));
      case 'n': return v === '' ? '' : Number(v);
      case 'b': return v === true || v === 'SI' || v === 'true';
      default: return v;
    }
  });
}

function agregarFilas_(nombre, filas) {
  if (!filas.length) return;
  var sh = hoja_(nombre);
  var cols = HOJAS[nombre];
  var datos = filas.map(function (f) { return convertirFila_(nombre, f); });
  var formatos = datos.map(function () { return cols.map(function (c) { return formatoDe_(c[1]); }); });
  var r = sh.getRange(sh.getLastRow() + 1, 1, datos.length, cols.length);
  r.setNumberFormats(formatos);  // formato correcto antes de escribir (aunque la fila sea nueva)
  r.setValues(datos);
}

function formatoDe_(tipo) {
  return { t: '@', d: 'dd/mm/yyyy HH:mm', f: 'dd/mm/yyyy', m: '0.00', n: '0.######', b: 'General' }[tipo] || 'General';
}

/* Texto que empieza con = + - @ se guardaría como fórmula: se fuerza a texto. */
function textoSeguro_(v) {
  var t = String(v);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

/* Escribe SOLO los campos que cambiaron en una fila. Devuelve cuántos. */
function actualizarCampos_(nombre, filaNum, actual, cambios) {
  var sh = hoja_(nombre);
  var cols = HOJAS[nombre];
  var n = 0;
  cols.forEach(function (c, i) {
    if (!(c[0] in cambios)) return;
    var nuevo = convertirFila_(nombre, cols.map(function (x, j) { return j === i ? cambios[c[0]] : ''; }))[i];
    if (iguales_(actual[c[0]], nuevo)) return;
    sh.getRange(filaNum, i + 1).setNumberFormat(formatoDe_(c[1])).setValue(nuevo);
    n++;
  });
  return n;
}

function iguales_(a, b) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  var tb = String(b);
  if (tb.charAt(0) === "'" && /^'[=+\-@]/.test(tb)) tb = tb.slice(1);
  return String(a) === tb;
}

/* ============================================================
 * 5. CONFIGURACIÓN Y LICENCIA
 * ============================================================ */
function leerConfig_() {
  var cache = CacheService.getScriptCache();
  var guardada = cache.get('CONFIG');
  if (guardada) return JSON.parse(guardada);
  var cfg = JSON.parse(JSON.stringify(CONFIG_DEFECTO));
  leerTabla_('configuracion').forEach(function (r) { if (r.clave) cfg[String(r.clave)] = String(r.valor); });
  cache.put('CONFIG', JSON.stringify(cfg), 300);
  return cfg;
}

function estadoLicencia_(cfg) {
  var estado = String(cfg.licencia_estado || 'activa');
  var vence = String(cfg.licencia_vence || '');
  var hoy = Utilities.formatDate(new Date(), zona_(cfg), 'yyyy-MM-dd');
  var vencida = !!vence && vence < hoy;
  return { estado: (estado === 'suspendida' || vencida) ? 'suspendida' : 'activa', vence: vence, vencida: vencida };
}

function accionConfigObtener_() {
  return { ok: true, data: { config: leerConfig_(), licencia: estadoLicencia_(leerConfig_()) } };
}

function accionConfigGuardar_(data, ctx) {
  var cambios = data.config || {};
  var permitidas = Object.keys(CONFIG_DEFECTO);
  var limpio = {};
  Object.keys(cambios).forEach(function (k) {
    if (permitidas.indexOf(k) < 0) return;
    var v = limpiarTexto_(cambios[k], 300);
    if ((k === 'color_primario' || k === 'color_acento') && !/^#[0-9A-Fa-f]{6}$/.test(v)) throw fallo_('Color no válido: use el selector de color.');
    if (k === 'whatsapp' && v) v = normalizarTelefono_(v, cambios.pais_codigo || leerConfig_().pais_codigo);
    if (k === 'pais_codigo' && !/^\d{1,3}$/.test(v)) throw fallo_('Código de país no válido (ej. 593).');
    if (k === 'iva_porcentaje' && !(Number(v) >= 0 && Number(v) <= 50)) throw fallo_('IVA no válido.');
    if (k === 'hora_cierre_dia' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw fallo_('Hora de cierre no válida (ej. 03:00).');
    if (k === 'licencia_vence' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw fallo_('Fecha de licencia no válida.');
    if (k === 'licencia_estado' && ['activa', 'suspendida'].indexOf(v) < 0) throw fallo_('Estado de licencia no válido.');
    if (k === 'precios_incluyen_iva' && ['SI', 'NO'].indexOf(v) < 0) throw fallo_('Valor no válido.');
    if (k === 'zona_horaria') { try { Utilities.formatDate(new Date(), v, 'HH:mm'); } catch (ez) { throw fallo_('Zona horaria no válida (ej. America/Guayaquil).'); } }
    if (k === 'negocio_nombre' && !v) throw fallo_('El nombre del negocio no puede quedar vacío.');
    limpio[k] = v;
  });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw fallo_('El sistema está ocupado. Intente en un momento.', 'OCUPADO');
  var escritas = 0;
  try {
    var filas = leerTabla_('configuracion');
    var porClave = {};
    filas.forEach(function (r) { porClave[String(r.clave)] = r; });
    var ahora = new Date();
    var nuevas = [];
    Object.keys(limpio).forEach(function (k) {
      var r = porClave[k];
      if (r) {
        if (String(r.valor) !== limpio[k]) {
          actualizarCampos_('configuracion', r._fila, r, { valor: limpio[k], actualizado: ahora, actualizado_por: ctx.sesion.usuario });
          escritas++; // cuenta datos cambiados (no celdas)
        }
      } else {
        nuevas.push([k, limpio[k], ahora, ctx.sesion.usuario]);
      }
    });
    agregarFilas_('configuracion', nuevas);
    escritas += nuevas.length;
    if (limpio.zona_horaria) SpreadsheetApp.getActive().setSpreadsheetTimeZone(limpio.zona_horaria);
    CacheService.getScriptCache().remove('CONFIG');
  } finally {
    lock.releaseLock();
  }
  if (escritas) bitacora_(ctx.sesion, 'CONFIGURACION', 'GUARDAR', Object.keys(limpio).join(', '), ctx.dispositivo);
  return { ok: true, data: { escritas: escritas, config: leerConfig_() } };
}

/* ============================================================
 * 6. SESIÓN
 * ============================================================ */
function accionLogin_(data, ctx) {
  if (!estaInstalado_()) throw fallo_('El sistema aún no está instalado.', 'NO_INSTALADO');
  var usuario = normalizarUsuario_(data.usuario);
  var clave = String(data.clave || '');
  if (!usuario || !clave) throw fallo_('Escriba su usuario y su clave.');

  var cache = CacheService.getScriptCache();
  var claveIntentos = 'INTENTOS_' + usuario;
  var intentos = Number(cache.get(claveIntentos) || 0);
  if (intentos >= 5) throw fallo_('Demasiados intentos. Espere 10 minutos.', 'BLOQUEADO');

  var u = null;
  leerTabla_('usuarios').some(function (r) { if (normalizarUsuario_(r.usuario) === usuario) { u = r; return true; } return false; });
  if (!u || hashClave_(clave, String(u.sal)) !== String(u.hash)) {
    cache.put(claveIntentos, String(intentos + 1), 600);
    bitacora_({ usuario: usuario, rol: '', local_id: '' }, 'SEGURIDAD', 'LOGIN_FALLIDO', '', ctx.dispositivo);
    throw fallo_('Usuario o clave incorrectos.', 'CREDENCIALES');
  }
  if (u.activo !== true) throw fallo_('Este usuario está desactivado. Consulte con el dueño.', 'DESACTIVADO');
  cache.remove(claveIntentos);

  var ses = { usuario_id: String(u.id), usuario: String(u.usuario), nombre: String(u.nombre), rol: String(u.rol), local_id: String(u.local_id || ''), creada: Date.now() };
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  cache.put('SES_' + token, JSON.stringify(ses), SESION_SEGUNDOS);
  actualizarCampos_('usuarios', u._fila, u, { ultimo_acceso: new Date() });
  bitacora_(ses, 'SEGURIDAD', 'LOGIN', '', ctx.dispositivo);
  return { ok: true, data: { token: token, sesion: ses, publico: datosPublicos_() } };
}

function leerSesion_(token) {
  if (!token || token.length < 40) return null;
  var cache = CacheService.getScriptCache();
  var raw = cache.get('SES_' + token);
  if (!raw) return null;
  var ses = JSON.parse(raw);
  var bloqueo = Number(PropertiesService.getScriptProperties().getProperty('REVOCADO_' + ses.usuario_id) || 0);
  if (bloqueo && ses.creada <= bloqueo) { cache.remove('SES_' + token); return null; }
  cache.put('SES_' + token, raw, SESION_SEGUNDOS); // se renueva con cada uso: dura el turno
  return ses;
}

/* Cierra todas las sesiones abiertas de un usuario (al desactivarlo, cambiar rol/local o clave). */
function revocarSesiones_(usuarioId) {
  PropertiesService.getScriptProperties().setProperty('REVOCADO_' + usuarioId, String(Date.now()));
}

function accionSesion_(data, ctx) {
  return { ok: true, data: { sesion: ctx.sesion, publico: datosPublicos_() } };
}

function accionCerrarSesion_(data, ctx) {
  CacheService.getScriptCache().remove('SES_' + ctx.token);
  bitacora_(ctx.sesion, 'SEGURIDAD', 'SALIR', '', ctx.dispositivo);
  return { ok: true, data: {} };
}

function datosPublicos_() {
  var cfg = leerConfig_();
  var pub = {};
  CONFIG_PUBLICA.forEach(function (k) { pub[k] = cfg[k] == null ? '' : cfg[k]; });
  pub.licencia = estadoLicencia_(cfg);
  return pub;
}

/* ============================================================
 * 7. LOCALES
 * ============================================================ */
function accionLocalesListar_(data, ctx) {
  var lista = leerTabla_('locales').map(function (r) {
    return { id: String(r.id), nombre: String(r.nombre), direccion: String(r.direccion), telefono: String(r.telefono), activo: r.activo === true };
  });
  if (ctx.sesion.rol !== 'dueno') lista = lista.filter(function (l) { return l.id === ctx.sesion.local_id; });
  return { ok: true, data: { locales: lista } };
}

function accionLocalGuardar_(data, ctx) {
  var id = limpiarTexto_(data.id, 40);
  var nombre = limpiarTexto_(data.nombre, 60);
  if (!nombre) throw fallo_('Escriba el nombre del local.');
  var cambios = {
    nombre: nombre,
    direccion: limpiarTexto_(data.direccion, 150),
    telefono: data.telefono ? normalizarTelefono_(data.telefono, leerConfig_().pais_codigo) : '',
    activo: data.activo !== false
  };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw fallo_('El sistema está ocupado. Intente en un momento.', 'OCUPADO');
  try {
    var filas = leerTabla_('locales');
    var clave = claveComparar_(nombre);
    var repetido = filas.filter(function (r) { return claveComparar_(r.nombre) === clave && String(r.id) !== id; })[0];
    if (repetido) throw fallo_('Ya existe un local llamado "' + repetido.nombre + '".', 'DUPLICADO');
    if (id) {
      var actual = filas.filter(function (r) { return String(r.id) === id; })[0];
      if (!actual) throw fallo_('Ese local ya no existe. Toque Actualizar.', 'NO_EXISTE');
      var n = actualizarCampos_('locales', actual._fila, actual, cambios);
      if (n) bitacora_(ctx.sesion, 'LOCALES', 'EDITAR', nombre, ctx.dispositivo);
    } else {
      id = nuevoId_('LOC');
      agregarFilas_('locales', [[id, cambios.nombre, cambios.direccion, cambios.telefono, cambios.activo, new Date(), ctx.sesion.usuario]]);
      bitacora_(ctx.sesion, 'LOCALES', 'CREAR', nombre, ctx.dispositivo);
    }
  } finally {
    lock.releaseLock();
  }
  return accionLocalesListar_({}, ctx);
}

/* ============================================================
 * 8. USUARIOS
 * ============================================================ */
function accionUsuariosListar_() {
  var lista = leerTabla_('usuarios').map(function (r) {
    return {
      id: String(r.id), usuario: String(r.usuario), nombre: String(r.nombre), rol: String(r.rol),
      local_id: String(r.local_id), activo: r.activo === true,
      ultimo_acceso: r.ultimo_acceso instanceof Date ? r.ultimo_acceso.toISOString() : ''
    };
  });
  return { ok: true, data: { usuarios: lista } };
}

function accionUsuarioGuardar_(data, ctx) {
  var id = limpiarTexto_(data.id, 40);
  var usuario = normalizarUsuario_(data.usuario);
  var nombre = limpiarTexto_(data.nombre, 80);
  var rol = String(data.rol || '');
  var localId = limpiarTexto_(data.local_id, 40);
  var activo = data.activo !== false;
  validarUsuario_(usuario);
  if (!nombre) throw fallo_('Escriba el nombre de la persona.');
  if (ROLES.indexOf(rol) < 0) throw fallo_('Elija un rol.');
  if (rol === 'dueno') localId = 'TODOS';
  else if (!localId || localId === 'TODOS') throw fallo_('Elija el local de este usuario.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw fallo_('El sistema está ocupado. Intente en un momento.', 'OCUPADO');
  try {
    if (rol !== 'dueno') {
      var existeLocal = leerTabla_('locales').some(function (l) { return String(l.id) === localId; });
      if (!existeLocal) throw fallo_('Ese local no existe.');
    }
    var filas = leerTabla_('usuarios');
    var repetido = filas.filter(function (r) { return normalizarUsuario_(r.usuario) === usuario && String(r.id) !== id; })[0];
    if (repetido) throw fallo_('El usuario "' + usuario + '" ya existe.', 'DUPLICADO');
    if (id) {
      var actual = filas.filter(function (r) { return String(r.id) === id; })[0];
      if (!actual) throw fallo_('Ese usuario ya no existe. Toque Actualizar.', 'NO_EXISTE');
      if (String(actual.id) === ctx.sesion.usuario_id && (!activo || rol !== 'dueno')) throw fallo_('No puede quitarse a sí mismo el rol de dueño ni desactivarse.');
      var duenosActivos = filas.filter(function (r) { return r.rol === 'dueno' && r.activo === true; }).length;
      if (actual.rol === 'dueno' && actual.activo === true && (rol !== 'dueno' || !activo) && duenosActivos <= 1) throw fallo_('Debe quedar al menos un dueño activo.');
      var n = actualizarCampos_('usuarios', actual._fila, actual, { usuario: usuario, nombre: nombre, rol: rol, local_id: localId, activo: activo });
      if (n && (!activo || rol !== String(actual.rol) || localId !== String(actual.local_id))) revocarSesiones_(String(actual.id));
      if (n) bitacora_(ctx.sesion, 'USUARIOS', activo ? 'EDITAR' : 'DESACTIVAR', usuario, ctx.dispositivo);
    } else {
      var clave = String(data.clave || '');
      validarClave_(clave);
      var sal = Utilities.getUuid();
      agregarFilas_('usuarios', [[nuevoId_('USR'), usuario, nombre, rol, localId, hashClave_(clave, sal), sal, activo, new Date(), '']]);
      bitacora_(ctx.sesion, 'USUARIOS', 'CREAR', usuario + ' (' + rol + ')', ctx.dispositivo);
    }
  } finally {
    lock.releaseLock();
  }
  return accionUsuariosListar_();
}

function accionUsuarioClave_(data, ctx) {
  var id = limpiarTexto_(data.id, 40);
  var clave = String(data.clave || '');
  validarClave_(clave);
  return cambiarClave_(id, clave, ctx, 'RESTABLECER_CLAVE');
}

function accionMiClave_(data, ctx) {
  var actual = String(data.actual || '');
  var nueva = String(data.nueva || '');
  validarClave_(nueva);
  var u = leerTabla_('usuarios').filter(function (r) { return String(r.id) === ctx.sesion.usuario_id; })[0];
  if (!u || hashClave_(actual, String(u.sal)) !== String(u.hash)) throw fallo_('La clave actual no es correcta.');
  return cambiarClave_(ctx.sesion.usuario_id, nueva, ctx, 'CAMBIAR_MI_CLAVE');
}

function cambiarClave_(id, clave, ctx, accion) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw fallo_('El sistema está ocupado. Intente en un momento.', 'OCUPADO');
  try {
    var u = leerTabla_('usuarios').filter(function (r) { return String(r.id) === id; })[0];
    if (!u) throw fallo_('Ese usuario ya no existe.', 'NO_EXISTE');
    var sal = Utilities.getUuid();
    actualizarCampos_('usuarios', u._fila, u, { hash: hashClave_(clave, sal), sal: sal });
    if (accion === 'RESTABLECER_CLAVE') revocarSesiones_(id);
    bitacora_(ctx.sesion, 'USUARIOS', accion, String(u.usuario), ctx.dispositivo);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, data: {} };
}

/* ============================================================
 * 9. BITÁCORA
 * ============================================================ */
function bitacora_(ses, modulo, accion, detalle, dispositivo) {
  try {
    agregarFilas_('bitacora', [[new Date(), ses.usuario || '', ses.rol || '', ses.local_id || '', modulo, accion, limpiarTexto_(detalle, 300), limpiarTexto_(dispositivo, 120)]]);
  } catch (e) {
    console.error('bitacora: ' + e);
  }
}

function accionBitacoraListar_(data) {
  var limite = Math.min(Math.max(Number(data.limite) || 200, 1), 500);
  var sh = hoja_('bitacora');
  var ultima = sh.getLastRow();
  if (ultima < 2) return { ok: true, data: { registros: [] } };
  var desde = Math.max(2, ultima - limite + 1);
  var cols = HOJAS.bitacora;
  var filas = sh.getRange(desde, 1, ultima - desde + 1, cols.length).getValues();
  var lista = filas.reverse().map(function (f) {
    return { fecha: f[0] instanceof Date ? f[0].toISOString() : '', usuario: String(f[1]), rol: String(f[2]), local_id: String(f[3]), modulo: String(f[4]), accion: String(f[5]), detalle: String(f[6]) };
  });
  return { ok: true, data: { registros: lista } };
}

/* ============================================================
 * 10. AYUDAS: formatos, claves, validaciones
 * ============================================================ */
function zona_(cfg) { return (cfg && cfg.zona_horaria) || CONFIG_DEFECTO.zona_horaria; }

function nuevoId_(prefijo) {
  var cfg = estaInstalado_() ? leerConfig_() : CONFIG_DEFECTO;
  return prefijo + '-' + Utilities.formatDate(new Date(), zona_(cfg), 'yyyyMMddHHmmss') + '-' + Utilities.getUuid().slice(0, 6).toUpperCase();
}

function redondear_(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function fechaDesdeTexto_(v) {
  var d = new Date(v);
  if (isNaN(d.getTime())) throw fallo_('Fecha no válida.');
  return d;
}

/* Texto limpio: sin espacios de más, sin caracteres de control, largo máximo. */
function limpiarTexto_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 200);
}

/* Para comparar sin trampas: sin mayúsculas, tildes ni espacios de más. */
function claveComparar_(v) {
  return limpiarTexto_(v, 300).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

function normalizarUsuario_(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

function validarUsuario_(u) {
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) throw fallo_('El usuario debe tener de 3 a 30 letras o números, sin espacios.');
}

function validarClave_(c) {
  if (c.length < 6) throw fallo_('La clave debe tener al menos 6 caracteres.');
  if (c.length > 80) throw fallo_('La clave es demasiado larga.');
}

function hashClave_(clave, sal) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + '|' + clave, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

/* Teléfono con código de país: "0991234567" -> "+593991234567". */
function normalizarTelefono_(v, pais) {
  var d = String(v == null ? '' : v).replace(/\D/g, '');
  pais = String(pais || '593').replace(/\D/g, '');
  if (!d) return '';
  if (d.indexOf(pais) === 0 && d.length > pais.length + 6) return '+' + d;
  if (d.charAt(0) === '0') d = d.slice(1);
  if (d.length < 7 || d.length > 12) throw fallo_('Número de teléfono no válido.');
  return '+' + pais + d;
}

/* Cédula ecuatoriana: 10 dígitos, provincia 01–24 o 30, tercer dígito < 6, módulo 10. */
function cedulaEcuadorValida_(c) {
  c = String(c || '');
  if (!/^\d{10}$/.test(c)) return false;
  var prov = Number(c.slice(0, 2));
  if (!((prov >= 1 && prov <= 24) || prov === 30)) return false;
  if (Number(c.charAt(2)) >= 6) return false;
  var suma = 0;
  for (var i = 0; i < 9; i++) {
    var x = Number(c.charAt(i)) * (i % 2 === 0 ? 2 : 1);
    suma += x > 9 ? x - 9 : x;
  }
  return (10 - (suma % 10)) % 10 === Number(c.charAt(9));
}

/* Día de trabajo: antes de la hora de cierre cuenta como el día anterior. */
function diaTrabajo_(fecha, cfg) {
  cfg = cfg || leerConfig_();
  var zona = zona_(cfg);
  var hm = Utilities.formatDate(fecha, zona, 'HH:mm');
  var base = new Date(fecha.getTime());
  if (hm < String(cfg.hora_cierre_dia || '03:00')) base = new Date(base.getTime() - 24 * 3600 * 1000);
  var ymd = Utilities.formatDate(base, zona, 'yyyy-MM-dd');
  return ymd;
}
