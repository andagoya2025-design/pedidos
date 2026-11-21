/**
 * ============================================================
 * SISTEMA DE PEDIDOS Y ENTREGAS — SCRIPT DEL SERVIDOR
 * Archivo: Codigo.gs (se pega completo en Extensiones > Apps Script
 * de la hoja del cliente y se publica como Aplicación web).
 * Fase 1: instalador, sesión, usuarios, locales, configuración,
 * licencia y bitácora.
 * Fases 2 a 7 (sección 11, al final): menú, pedido público, panel de
 * pedidos, motorizados y entregas, reportes, inventario y caja.
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

var APP_VERSION = '2.0.0';
var APP_VERSION_NUM = 20000; // 2.0.0 -> 20000 (la pantalla compara con su mínimo)
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
  pedidos: [['id', 't'], ['numero', 't'], ['op_id', 't'], ['local_id', 't'], ['dia_trabajo', 'f'], ['cliente_id', 't'], ['cliente_nombre', 't'], ['telefono', 't'], ['direccion', 't'], ['referencia', 't'], ['lat', 'n'], ['lng', 'n'], ['zona_id', 't'], ['forma_pago', 't'], ['subtotal', 'm'], ['envio', 'm'], ['descuento', 'm'], ['total', 'm'], ['cupon', 't'], ['estado', 't'], ['motorizado_id', 't'], ['creado', 'd'], ['preparando', 'd'], ['en_camino', 'd'], ['entregado', 'd'], ['anulado', 'd'], ['motivo_anulacion', 't'], ['usuario', 't'],
    /* fase 2-7 (agregadas al final) */ ['hora_estimada', 'd'], ['ubicacion_enlace', 't'], ['notas', 't'], ['sali_lat', 'n'], ['sali_lng', 'n'], ['entrega_lat', 'n'], ['entrega_lng', 'n'], ['foto_entrega', 't'], ['pago_verificado', 'b'], ['liquidacion_id', 't'], ['inventario_descontado', 'b']],
  pedido_detalle: [['id', 't'], ['pedido_id', 't'], ['plato_id', 't'], ['nombre', 't'], ['precio', 'm'], ['cantidad', 'n'], ['extras', 't'], ['total_linea', 'm']],
  clientes: [['id', 't'], ['telefono', 't'], ['nombre', 't'], ['direccion', 't'], ['referencia', 't'], ['lat', 'n'], ['lng', 'n'], ['pedidos', 'n'], ['total_gastado', 'm'], ['ultimo_pedido', 'd'], ['creado', 'd']],
  motorizados: [['id', 't'], ['nombre', 't'], ['cedula', 't'], ['celular', 't'], ['direccion', 't'], ['placa', 't'], ['foto_url', 't'], ['usuario_id', 't'], ['activo', 'b'], ['creado', 'd'],
    /* fase 4 */ ['local_id', 't']],
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
  mensaje_bienvenida: '¡Bienvenido! Haz tu pedido en pocos pasos.',
  /* fases 2-7 */
  minutos_preparacion: '20',
  minutos_atraso: '45',
  datos_transferencia: '',
  whatsapp_dueno: ''
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
  bitacoraListar:    { tipo: 'dueno',   fn: accionBitacoraListar_ },
  /* ---- Fases 2 a 7 (sección 11). roles = quién puede usarla ---- */
  menuPublico:        { tipo: 'publica', fn: accionMenuPublico_ },
  pedidoCrear:        { tipo: 'publica', fn: accionPedidoCrear_ },
  pedidoConsultar:    { tipo: 'publica', fn: accionPedidoConsultar_ },
  menuListar:         { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionMenuListar_ },
  categoriaGuardar:   { tipo: 'dueno',   fn: accionCategoriaGuardar_ },
  platoGuardar:       { tipo: 'dueno',   fn: accionPlatoGuardar_ },
  platoAgotado:       { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionPlatoAgotado_ },
  fotoSubir:          { tipo: 'dueno',   fn: accionFotoSubir_ },
  zonaGuardar:        { tipo: 'dueno',   fn: accionZonaGuardar_ },
  cuponesListar:      { tipo: 'dueno',   fn: accionCuponesListar_ },
  cuponGuardar:       { tipo: 'dueno',   fn: accionCuponGuardar_ },
  recetaListar:       { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionRecetaListar_ },
  recetaGuardar:      { tipo: 'dueno',   fn: accionRecetaGuardar_ },
  clientesListar:     { tipo: 'dueno',   fn: accionClientesListar_ },
  pedidosListar:      { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionPedidosListar_ },
  pedidoEstado:       { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionPedidoEstado_ },
  pedidoAsignar:      { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionPedidoAsignar_ },
  pedidoAnular:       { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionPedidoAnular_ },
  pedidoUbicacion:    { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionPedidoUbicacion_ },
  pedidoPagoVerificar:{ tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionPedidoPagoVerificar_ },
  motorizadosListar:  { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionMotorizadosListar_ },
  motorizadoGuardar:  { tipo: 'dueno',   fn: accionMotorizadoGuardar_ },
  misEntregas:        { tipo: 'sesion',  roles: ['motorizado'], fn: accionMisEntregas_ },
  entregaSali:        { tipo: 'sesion',  roles: ['motorizado'], fn: accionEntregaSali_ },
  entregaEntregado:   { tipo: 'sesion',  roles: ['motorizado'], fn: accionEntregaEntregado_ },
  reportes:           { tipo: 'dueno',   fn: accionReportes_ },
  insumosListar:      { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionInsumosListar_ },
  insumoGuardar:      { tipo: 'dueno',   fn: accionInsumoGuardar_ },
  inventarioMovimiento:{ tipo: 'sesion', roles: ['dueno', 'cajero'], fn: accionInventarioMovimiento_ },
  inventarioHistorial:{ tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionInventarioHistorial_ },
  cajaEstado:         { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionCajaEstado_ },
  cajaAbrir:          { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionCajaAbrir_ },
  cajaMovimiento:     { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionCajaMovimiento_ },
  cajaFondoMotorizado:{ tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionCajaFondoMotorizado_ },
  cajaLiquidar:       { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionCajaLiquidar_ },
  cajaCerrar:         { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionCajaCerrar_ }
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
    var ctx = { dispositivo: String(dispositivo || '').slice(0, 120), tokenPublico: def.tipo === 'publica' ? token : '' };
    if (accion !== 'estado' && accion !== 'instalar') asegurarHojas_();
    if (def.tipo !== 'publica') {
      if (!estaInstalado_()) return responder_({ ok: false, codigo: 'NO_INSTALADO', error: 'El sistema aún no está instalado.' }, inicio);
      var ses = leerSesion_(token);
      if (!ses) return responder_({ ok: false, codigo: 'SESION', error: 'Su sesión terminó. Ingrese de nuevo.' }, inicio);
      if ((def.tipo === 'dueno' && ses.rol !== 'dueno') || (def.roles && def.roles.indexOf(ses.rol) < 0)) {
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
  // "2026-11-21" se lee como ese día en la zona del negocio (no en hora de Londres).
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return Utilities.parseDate(String(v), zona_(estaInstalado_() ? leerConfig_() : null), 'yyyy-MM-dd');
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

/* ============================================================
 * 11. FASES 2 A 7 — menú, pedidos, motorizados, reportes,
 *     inventario y caja. Todo usa las ayudas de arriba
 *     (agregarFilas_, actualizarCampos_, leerTabla_, claveComparar_,
 *     normalizarTelefono_, cedulaEcuadorValida_, diaTrabajo_,
 *     bitacora_, LockService, fallo_). No cambia las acciones de la fase 1.
 * ============================================================ */

var ESTADOS = ['Recibido', 'Preparando', 'En camino', 'Entregado', 'Anulado'];
var FORMAS_PAGO = ['efectivo', 'transferencia'];

/* ---------- 11.1 Ayudas de esta sección ---------- */

/* Si una hoja ya instalada tiene menos columnas que las de esta versión,
 * agrega SOLO los encabezados que faltan, al final. Una vez por versión. */
function asegurarHojas_() {
  if (!estaInstalado_()) return;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('HOJAS_VERSION') === APP_VERSION) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return; // otro proceso lo está haciendo
  try {
    if (props.getProperty('HOJAS_VERSION') === APP_VERSION) return;
    var ss = SpreadsheetApp.getActive();
    Object.keys(HOJAS).forEach(function (n) {
      var sh = ss.getSheetByName(n);
      if (!sh) { prepararHoja_(ss, n); return; }
      var cols = HOJAS[n];
      var actuales = sh.getLastColumn();
      if (actuales >= cols.length) return;
      if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
      var faltan = cols.slice(actuales);
      sh.getRange(1, actuales + 1, 1, faltan.length).setValues([faltan.map(function (c) { return c[0]; })])
        .setFontWeight('bold').setBackground('#1F1B16').setFontColor('#FFFFFF');
      var maxFilas = Math.max(sh.getMaxRows() - 1, 1);
      faltan.forEach(function (c, i) { sh.getRange(2, actuales + 1 + i, maxFilas, 1).setNumberFormat(formatoDe_(c[1])); });
    });
    props.setProperty('HOJAS_VERSION', APP_VERSION);
  } finally {
    lock.releaseLock();
  }
}

function candado_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw fallo_('El sistema está ocupado. Intente en un momento.', 'OCUPADO');
  return lock;
}

/* Local que puede usar esta sesión. Dueño: el que pida (o TODOS). Otros: solo el suyo. */
function localDeSesion_(ctx, pedido) {
  var s = ctx.sesion;
  pedido = limpiarTexto_(pedido, 40);
  if (s.rol === 'dueno') return pedido || 'TODOS';
  if (pedido && pedido !== 'TODOS' && pedido !== s.local_id) throw fallo_('No tiene permiso para ese local.', 'PERMISO');
  return s.local_id;
}

function puedeVerLocal_(ctx, localId) {
  return ctx.sesion.rol === 'dueno' || String(localId) === ctx.sesion.local_id;
}

function iso_(d) { return d instanceof Date ? d.toISOString() : ''; }
function ymd_(d, cfg) { return d instanceof Date ? Utilities.formatDate(d, zona_(cfg || leerConfig_()), 'yyyy-MM-dd') : String(d || ''); }
function fechaDia_(ymd, cfg) { return Utilities.parseDate(String(ymd), zona_(cfg || leerConfig_()), 'yyyy-MM-dd'); }
function numero_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function siNo_(v) { return v === true || v === 'SI' || v === 'true'; }

/* Enlace de Google Drive -> enlace directo de imagen que se puede mostrar. */
function enlaceImagen_(url) {
  url = limpiarTexto_(url, 500);
  if (!url) return '';
  var m = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([A-Za-z0-9_-]{20,})/.exec(url) || /[?&]id=([A-Za-z0-9_-]{20,})/.exec(url);
  if (m && /google/.test(url)) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w800';
  if (!/^https:\/\//.test(url)) throw fallo_('El enlace de la foto debe empezar con https://');
  return url;
}

function limpiarMenuCache_() { CacheService.getScriptCache().remove('MENU_PUBLICO'); }

/* Extras guardados como JSON: [{nombre, precio}] */
function leerExtras_(txt) {
  try {
    var a = JSON.parse(String(txt || '[]'));
    return Array.isArray(a) ? a.map(function (x) { return { nombre: limpiarTexto_(x.nombre, 60), precio: redondear_(x.precio) }; }).filter(function (x) { return x.nombre; }) : [];
  } catch (e) { return []; }
}

function platoPublico_(p) {
  return {
    id: String(p.id), local_id: String(p.local_id), categoria_id: String(p.categoria_id), nombre: String(p.nombre),
    descripcion: String(p.descripcion), precio: redondear_(p.precio), foto_url: String(p.foto_url),
    extras: leerExtras_(p.extras_json), agotado: p.agotado === true, activo: p.activo === true
  };
}

function pedidoSalida_(r, detalle) {
  var o = {};
  HOJAS.pedidos.forEach(function (c) {
    var v = r[c[0]];
    o[c[0]] = v instanceof Date ? (c[1] === 'f' ? Utilities.formatDate(v, zona_(leerConfig_()), 'yyyy-MM-dd') : v.toISOString()) : (c[1] === 'b' ? v === true : (c[1] === 'm' || c[1] === 'n') ? (v === '' ? '' : Number(v)) : String(v == null ? '' : v));
  });
  if (detalle) o.detalle = detalle;
  return o;
}

function detallePorPedido_(ids) {
  var mapa = {};
  var set = {};
  ids.forEach(function (i) { set[i] = true; });
  leerTabla_('pedido_detalle').forEach(function (d) {
    var pid = String(d.pedido_id);
    if (!set[pid]) return;
    (mapa[pid] = mapa[pid] || []).push({ plato_id: String(d.plato_id), nombre: String(d.nombre), precio: redondear_(d.precio), cantidad: numero_(d.cantidad), extras: String(d.extras), total_linea: redondear_(d.total_linea) });
  });
  return mapa;
}

/* ---------- 11.2 Menú público y pedido del cliente (sin sesión) ---------- */

function accionMenuPublico_() {
  if (!estaInstalado_()) throw fallo_('El sistema aún no está instalado.', 'NO_INSTALADO');
  var cache = CacheService.getScriptCache();
  var guardado = cache.get('MENU_PUBLICO');
  if (guardado) return { ok: true, data: JSON.parse(guardado) };
  var cfg = leerConfig_();
  var pub = datosPublicos_();
  pub.datos_transferencia = cfg.datos_transferencia || '';
  pub.minutos_preparacion = numero_(cfg.minutos_preparacion) || 20;
  var locales = leerTabla_('locales').filter(function (l) { return l.activo === true; }).map(function (l) {
    return { id: String(l.id), nombre: String(l.nombre), direccion: String(l.direccion), telefono: String(l.telefono) };
  });
  var data = {
    config: pub,
    locales: locales,
    categorias: leerTabla_('categorias').filter(function (c) { return c.activo === true; }).map(function (c) {
      return { id: String(c.id), local_id: String(c.local_id), nombre: String(c.nombre), orden: numero_(c.orden) };
    }).sort(function (a, b) { return a.orden - b.orden; }),
    platos: leerTabla_('platos').filter(function (p) { return p.activo === true; }).map(platoPublico_),
    zonas: leerTabla_('zonas_envio').filter(function (z) { return z.activo === true; }).map(function (z) {
      return { id: String(z.id), local_id: String(z.local_id), nombre: String(z.nombre), costo: redondear_(z.costo), minutos: numero_(z.minutos) };
    })
  };
  var texto = JSON.stringify(data);
  if (texto.length < 90000) cache.put('MENU_PUBLICO', texto, 120);
  return { ok: true, data: data };
}

/*
 * Crea un pedido. data: { op_id, local_id, items:[{plato_id, cantidad, extras:[nombre]}],
 *   cliente:{nombre, telefono, direccion, referencia, lat, lng}, zona_id ('' = retiro en el local),
 *   forma_pago, cupon, notas }
 * - Precios, envío y descuento los calcula el SERVIDOR (no se confía en la pantalla).
 * - op_id único: si llega dos veces (doble toque o mala señal) devuelve el MISMO pedido.
 * - Número PED-0001 correlativo con candado.
 */
function accionPedidoCrear_(data, ctx) {
  if (!estaInstalado_()) throw fallo_('El sistema aún no está instalado.', 'NO_INSTALADO');
  var cfg = leerConfig_();
  if (estadoLicencia_(cfg).estado !== 'activa') throw fallo_('Por ahora no estamos recibiendo pedidos en línea. Escríbenos por WhatsApp.', 'LICENCIA');
  var ses = ctx.tokenPublico ? leerSesion_(ctx.tokenPublico) : null; // cajero que toma el pedido por teléfono

  var opId = limpiarTexto_(data.op_id, 80);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(opId)) throw fallo_('Pedido sin código de envío. Recargue la página.');
  var localId = limpiarTexto_(data.local_id, 40);
  var cli = data.cliente || {};
  var nombre = limpiarTexto_(cli.nombre, 80);
  if (!nombre) throw fallo_('Escriba su nombre.');
  var telefono = normalizarTelefono_(cli.telefono, cfg.pais_codigo);
  if (!telefono) throw fallo_('Escriba su número de celular.');
  var zonaId = limpiarTexto_(data.zona_id, 40);
  var direccion = limpiarTexto_(cli.direccion, 200);
  var referencia = limpiarTexto_(cli.referencia, 200);
  var lat = cli.lat === '' || cli.lat == null ? '' : Number(cli.lat);
  var lng = cli.lng === '' || cli.lng == null ? '' : Number(cli.lng);
  if (lat !== '' && !(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) { lat = ''; lng = ''; }
  if (zonaId && !direccion && lat === '') throw fallo_('Escriba su dirección o use «Usar mi ubicación».');
  var forma = String(data.forma_pago || '');
  if (FORMAS_PAGO.indexOf(forma) < 0) throw fallo_('Elija la forma de pago.');
  var items = Array.isArray(data.items) ? data.items.slice(0, 60) : [];
  if (!items.length) throw fallo_('Su pedido está vacío.');

  // Freno contra pedidos en cadena desde un mismo teléfono (sin sesión).
  var cache = CacheService.getScriptCache();
  var claveFreno = 'FRENO_' + telefono;

  var lock = candado_();
  var pedido, detalleFilas = [], creado = false;
  try {
    var pedidos = leerTabla_('pedidos');
    var repetido = pedidos.filter(function (p) { return String(p.op_id) === opId; })[0];
    if (repetido) return { ok: true, data: { pedido: pedidoSalida_(repetido), repetido: true } };
    if (!ses && Number(cache.get(claveFreno) || 0) >= 6) throw fallo_('Recibimos varios pedidos seguidos de este número. Espere unos minutos o escríbanos por WhatsApp.', 'FRENO');

    var local = leerTabla_('locales').filter(function (l) { return String(l.id) === localId && l.activo === true; })[0];
    if (!local) throw fallo_('Elija un local disponible.');
    if (ses && ses.rol !== 'dueno' && ses.local_id !== localId) throw fallo_('Solo puede tomar pedidos de su local.', 'PERMISO');

    var platos = {};
    leerTabla_('platos').forEach(function (p) { platos[String(p.id)] = p; });
    var subtotal = 0;
    items.forEach(function (it) {
      var p = platos[String(it.plato_id)];
      var cant = Math.floor(numero_(it.cantidad));
      if (!p || p.activo !== true || (String(p.local_id) !== 'TODOS' && String(p.local_id) !== localId)) throw fallo_('Un plato de su pedido ya no está disponible. Revise su pedido.', 'PLATO');
      if (p.agotado === true) throw fallo_('«' + p.nombre + '» se agotó. Quítelo de su pedido.', 'AGOTADO');
      if (!(cant >= 1 && cant <= 50)) throw fallo_('Cantidad no válida en «' + p.nombre + '».');
      var extrasDisp = leerExtras_(p.extras_json);
      var elegidos = (Array.isArray(it.extras) ? it.extras : []).map(function (n) { return claveComparar_(n); });
      var extras = extrasDisp.filter(function (x) { return elegidos.indexOf(claveComparar_(x.nombre)) >= 0; });
      var unitario = redondear_(numero_(p.precio) + extras.reduce(function (s, x) { return s + x.precio; }, 0));
      var totalLinea = redondear_(unitario * cant);
      subtotal = redondear_(subtotal + totalLinea);
      detalleFilas.push({ plato_id: String(p.id), nombre: String(p.nombre), precio: unitario, cantidad: cant, extras: extras.map(function (x) { return x.nombre; }).join(', '), total_linea: totalLinea });
    });

    var envio = 0, minutos = 0;
    if (zonaId) {
      var zona = leerTabla_('zonas_envio').filter(function (z) { return String(z.id) === zonaId && z.activo === true; })[0];
      if (!zona || (String(zona.local_id) !== 'TODOS' && String(zona.local_id) !== localId)) throw fallo_('Elija una zona de envío disponible.');
      envio = redondear_(zona.costo);
      minutos = numero_(zona.minutos);
    }

    var descuento = 0, cuponFila = null, codigo = limpiarTexto_(data.cupon, 30).toUpperCase();
    var ahora = new Date();
    if (codigo) {
      cuponFila = leerTabla_('cupones').filter(function (c) { return claveComparar_(c.codigo) === claveComparar_(codigo); })[0];
      var hoy = Utilities.formatDate(ahora, zona_(cfg), 'yyyy-MM-dd');
      if (!cuponFila || cuponFila.activo !== true) throw fallo_('El cupón «' + codigo + '» no existe.', 'CUPON');
      if (cuponFila.vence instanceof Date && ymd_(cuponFila.vence, cfg) < hoy) throw fallo_('El cupón «' + codigo + '» ya venció.', 'CUPON');
      if (numero_(cuponFila.usos_max) > 0 && numero_(cuponFila.usos) >= numero_(cuponFila.usos_max)) throw fallo_('El cupón «' + codigo + '» ya se usó el máximo de veces.', 'CUPON');
      descuento = String(cuponFila.tipo) === 'porcentaje' ? redondear_(subtotal * numero_(cuponFila.valor) / 100) : redondear_(cuponFila.valor);
      descuento = Math.min(descuento, subtotal);
    }
    var total = redondear_(subtotal + envio - descuento);

    // Número correlativo: el mayor que exista + 1 (bajo candado: nunca se repite).
    var mayor = 0;
    pedidos.forEach(function (p) { var m = /^PED-(\d+)$/.exec(String(p.numero)); if (m) mayor = Math.max(mayor, Number(m[1])); });
    var numero = 'PED-' + ('000' + (mayor + 1)).slice(-Math.max(4, String(mayor + 1).length));
    var id = nuevoId_('PED');
    var horaEst = new Date(ahora.getTime() + (numero_(cfg.minutos_preparacion) + minutos) * 60000);

    // Cliente: uno por teléfono (no se repite).
    var clientes = leerTabla_('clientes');
    var cFila = clientes.filter(function (c) { return String(c.telefono) === telefono; })[0];
    var clienteId;
    if (cFila) {
      clienteId = String(cFila.id);
      var cambiosCli = { nombre: nombre, pedidos: numero_(cFila.pedidos) + 1, total_gastado: redondear_(numero_(cFila.total_gastado) + total), ultimo_pedido: ahora };
      if (direccion) { cambiosCli.direccion = direccion; cambiosCli.referencia = referencia; }
      if (lat !== '') { cambiosCli.lat = lat; cambiosCli.lng = lng; }
      actualizarCampos_('clientes', cFila._fila, cFila, cambiosCli);
    } else {
      clienteId = nuevoId_('CLI');
      agregarFilas_('clientes', [[clienteId, telefono, nombre, direccion, referencia, lat, lng, 1, total, ahora, ahora]]);
    }

    var fila = [id, numero, opId, localId, fechaDia_(diaTrabajo_(ahora, cfg), cfg), clienteId, nombre, telefono, direccion, referencia, lat, lng, zonaId, forma,
      subtotal, envio, descuento, total, codigo, 'Recibido', '', ahora, '', '', '', '', '', ses ? ses.usuario : 'cliente',
      horaEst, '', limpiarTexto_(data.notas, 300), '', '', '', '', '', false, '', false];
    agregarFilas_('pedidos', [fila]);
    agregarFilas_('pedido_detalle', detalleFilas.map(function (d) { return [nuevoId_('DET'), id, d.plato_id, d.nombre, d.precio, d.cantidad, d.extras, d.total_linea]; }));
    if (cuponFila) actualizarCampos_('cupones', cuponFila._fila, cuponFila, { usos: numero_(cuponFila.usos) + 1 });

    var descontado = descontarInventario_(id, numero, localId, detalleFilas, 1, ses ? ses.usuario : 'cliente');
    if (descontado) {
      var nuevo = leerTabla_('pedidos').filter(function (p) { return String(p.id) === id; })[0];
      actualizarCampos_('pedidos', nuevo._fila, nuevo, { inventario_descontado: true });
    }
    pedido = leerTabla_('pedidos').filter(function (p) { return String(p.id) === id; })[0];
    creado = true;
  } finally {
    lock.releaseLock();
  }
  if (creado && !ses) cache.put(claveFreno, String(Number(cache.get(claveFreno) || 0) + 1), 600);
  bitacora_(ses || { usuario: 'cliente', rol: '', local_id: localId }, 'PEDIDOS', 'CREAR', pedido.numero + ' · ' + UI_dinero_(pedido.total), ctx.dispositivo);
  return { ok: true, data: { pedido: pedidoSalida_(pedido, detalleFilas), repetido: false } };
}

function UI_dinero_(n) { return (leerConfig_().moneda || 'USD') + ' ' + redondear_(n).toFixed(2); }

/* Seguimiento del cliente: número + teléfono (sin listas, sin datos ajenos). */
function accionPedidoConsultar_(data) {
  if (!estaInstalado_()) throw fallo_('El sistema aún no está instalado.', 'NO_INSTALADO');
  var numero = limpiarTexto_(data.numero, 20).toUpperCase();
  var tel = normalizarTelefono_(data.telefono, leerConfig_().pais_codigo);
  var p = leerTabla_('pedidos').filter(function (x) { return String(x.numero) === numero && String(x.telefono) === tel; })[0];
  if (!p) throw fallo_('No encontramos ese pedido con ese número de celular.', 'NO_EXISTE');
  return { ok: true, data: { numero: String(p.numero), estado: String(p.estado), creado: iso_(p.creado), preparando: iso_(p.preparando), en_camino: iso_(p.en_camino), entregado: iso_(p.entregado), hora_estimada: iso_(p.hora_estimada), total: redondear_(p.total) } };
}

/* ---------- 11.3 Menú (administración) ---------- */

function accionMenuListar_(data, ctx) {
  var local = localDeSesion_(ctx, data.local_id);
  function sirve(l) { return local === 'TODOS' || String(l) === 'TODOS' || String(l) === local; }
  return { ok: true, data: {
    categorias: leerTabla_('categorias').filter(function (c) { return sirve(c.local_id); }).map(function (c) {
      return { id: String(c.id), local_id: String(c.local_id), nombre: String(c.nombre), orden: numero_(c.orden), activo: c.activo === true };
    }).sort(function (a, b) { return a.orden - b.orden; }),
    platos: leerTabla_('platos').filter(function (p) { return sirve(p.local_id); }).map(platoPublico_),
    zonas: leerTabla_('zonas_envio').filter(function (z) { return sirve(z.local_id); }).map(function (z) {
      return { id: String(z.id), local_id: String(z.local_id), nombre: String(z.nombre), costo: redondear_(z.costo), minutos: numero_(z.minutos), activo: z.activo === true };
    })
  } };
}

function validarLocalOTodos_(localId) {
  if (localId === 'TODOS') return;
  if (!leerTabla_('locales').some(function (l) { return String(l.id) === localId; })) throw fallo_('Ese local no existe.');
}

function accionCategoriaGuardar_(data, ctx) {
  var id = limpiarTexto_(data.id, 40), nombre = limpiarTexto_(data.nombre, 60), localId = limpiarTexto_(data.local_id, 40) || 'TODOS';
  if (!nombre) throw fallo_('Escriba el nombre de la categoría.');
  var cambios = { nombre: nombre, local_id: localId, orden: Math.round(numero_(data.orden)), activo: data.activo !== false };
  var lock = candado_();
  try {
    validarLocalOTodos_(localId);
    var filas = leerTabla_('categorias');
    var rep = filas.filter(function (r) { return String(r.id) !== id && String(r.local_id) === localId && claveComparar_(r.nombre) === claveComparar_(nombre); })[0];
    if (rep) throw fallo_('Ya existe la categoría «' + rep.nombre + '» en ese local.', 'DUPLICADO');
    if (id) {
      var actual = filas.filter(function (r) { return String(r.id) === id; })[0];
      if (!actual) throw fallo_('Esa categoría ya no existe. Toque Actualizar.', 'NO_EXISTE');
      if (actualizarCampos_('categorias', actual._fila, actual, cambios)) bitacora_(ctx.sesion, 'MENU', 'EDITAR_CATEGORIA', nombre, ctx.dispositivo);
    } else {
      agregarFilas_('categorias', [[nuevoId_('CAT'), localId, nombre, cambios.orden || filas.length + 1, cambios.activo, new Date()]]);
      bitacora_(ctx.sesion, 'MENU', 'CREAR_CATEGORIA', nombre, ctx.dispositivo);
    }
    limpiarMenuCache_();
  } finally { lock.releaseLock(); }
  return accionMenuListar_({ local_id: 'TODOS' }, ctx);
}

function accionPlatoGuardar_(data, ctx) {
  var id = limpiarTexto_(data.id, 40), nombre = limpiarTexto_(data.nombre, 80);
  var localId = limpiarTexto_(data.local_id, 40) || 'TODOS', catId = limpiarTexto_(data.categoria_id, 40);
  var precio = Number(data.precio);
  if (!nombre) throw fallo_('Escriba el nombre del plato.');
  if (!catId) throw fallo_('Elija la categoría.');
  if (!(precio >= 0 && precio <= 10000)) throw fallo_('Precio no válido.');
  var extras = (Array.isArray(data.extras) ? data.extras : []).slice(0, 20).map(function (x) {
    var n = limpiarTexto_(x.nombre, 60), pr = Number(x.precio || 0);
    if (n && !(pr >= 0 && pr <= 1000)) throw fallo_('Precio del extra «' + n + '» no válido.');
    return { nombre: n, precio: redondear_(pr) };
  }).filter(function (x) { return x.nombre; });
  var cambios = {
    nombre: nombre, local_id: localId, categoria_id: catId, descripcion: limpiarTexto_(data.descripcion, 300), precio: redondear_(precio),
    foto_url: enlaceImagen_(data.foto_url), extras_json: JSON.stringify(extras), agotado: data.agotado === true, activo: data.activo !== false
  };
  var lock = candado_();
  try {
    validarLocalOTodos_(localId);
    if (!leerTabla_('categorias').some(function (c) { return String(c.id) === catId; })) throw fallo_('Esa categoría no existe.');
    var filas = leerTabla_('platos');
    var rep = filas.filter(function (r) { return String(r.id) !== id && String(r.local_id) === localId && String(r.categoria_id) === catId && claveComparar_(r.nombre) === claveComparar_(nombre); })[0];
    if (rep) throw fallo_('Ya existe «' + rep.nombre + '» en esa categoría y local.', 'DUPLICADO');
    if (id) {
      var actual = filas.filter(function (r) { return String(r.id) === id; })[0];
      if (!actual) throw fallo_('Ese plato ya no existe. Toque Actualizar.', 'NO_EXISTE');
      if (actualizarCampos_('platos', actual._fila, actual, cambios)) bitacora_(ctx.sesion, 'MENU', 'EDITAR_PLATO', nombre, ctx.dispositivo);
    } else {
      agregarFilas_('platos', [[nuevoId_('PLA'), localId, catId, nombre, cambios.descripcion, cambios.precio, cambios.foto_url, cambios.extras_json, cambios.agotado, cambios.activo, new Date()]]);
      bitacora_(ctx.sesion, 'MENU', 'CREAR_PLATO', nombre, ctx.dispositivo);
    }
    limpiarMenuCache_();
  } finally { lock.releaseLock(); }
  return accionMenuListar_({ local_id: 'TODOS' }, ctx);
}

/* Cajero o dueño: marcar agotado / disponible (un solo campo). */
function accionPlatoAgotado_(data, ctx) {
  var id = limpiarTexto_(data.id, 40);
  var lock = candado_();
  var p;
  try {
    p = leerTabla_('platos').filter(function (r) { return String(r.id) === id; })[0];
    if (!p) throw fallo_('Ese plato ya no existe.', 'NO_EXISTE');
    if (ctx.sesion.rol !== 'dueno' && String(p.local_id) !== ctx.sesion.local_id && String(p.local_id) !== 'TODOS') throw fallo_('Ese plato no es de su local.', 'PERMISO');
    actualizarCampos_('platos', p._fila, p, { agotado: data.agotado === true });
    limpiarMenuCache_();
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'MENU', data.agotado === true ? 'AGOTADO' : 'DISPONIBLE', String(p.nombre), ctx.dispositivo);
  return { ok: true, data: { id: id, agotado: data.agotado === true } };
}

/* Carpeta de fotos en el Drive del dueño de la hoja. */
function carpetaFotos_(nombre) {
  var props = PropertiesService.getScriptProperties();
  var clave = 'CARPETA_' + nombre;
  var id = props.getProperty(clave);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* se borró: se crea otra */ } }
  var carpeta = DriveApp.createFolder(nombre);
  props.setProperty(clave, carpeta.getId());
  return carpeta;
}

function guardarFoto_(base64, nombreArchivo, carpeta, publica) {
  var m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(base64 || ''));
  if (!m) throw fallo_('La foto no es válida (use JPG o PNG).');
  if (m[3].length > 2800000) throw fallo_('La foto es muy grande. Use una más liviana.');
  var blob = Utilities.newBlob(Utilities.base64Decode(m[3]), m[1], nombreArchivo + '.' + (m[2] === 'jpeg' ? 'jpg' : m[2]));
  var f = carpetaFotos_(carpeta).createFile(blob);
  if (publica) {
    try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { console.error('compartir foto: ' + e); }
    return 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w800';
  }
  return f.getUrl();
}

function accionFotoSubir_(data, ctx) {
  var url = guardarFoto_(data.foto, 'plato-' + Utilities.formatDate(new Date(), zona_(leerConfig_()), 'yyyyMMdd-HHmmss'), 'Fotos del menú', true);
  bitacora_(ctx.sesion, 'MENU', 'SUBIR_FOTO', '', ctx.dispositivo);
  return { ok: true, data: { url: url } };
}

function accionZonaGuardar_(data, ctx) {
  var id = limpiarTexto_(data.id, 40), nombre = limpiarTexto_(data.nombre, 60), localId = limpiarTexto_(data.local_id, 40) || 'TODOS';
  var costo = Number(data.costo), minutos = Math.round(Number(data.minutos || 0));
  if (!nombre) throw fallo_('Escriba el nombre de la zona.');
  if (!(costo >= 0 && costo <= 500)) throw fallo_('Costo de envío no válido.');
  if (!(minutos >= 0 && minutos <= 300)) throw fallo_('Minutos no válidos.');
  var cambios = { nombre: nombre, local_id: localId, costo: redondear_(costo), minutos: minutos, activo: data.activo !== false };
  var lock = candado_();
  try {
    validarLocalOTodos_(localId);
    var filas = leerTabla_('zonas_envio');
    var rep = filas.filter(function (r) { return String(r.id) !== id && String(r.local_id) === localId && claveComparar_(r.nombre) === claveComparar_(nombre); })[0];
    if (rep) throw fallo_('Ya existe la zona «' + rep.nombre + '» en ese local.', 'DUPLICADO');
    if (id) {
      var actual = filas.filter(function (r) { return String(r.id) === id; })[0];
      if (!actual) throw fallo_('Esa zona ya no existe. Toque Actualizar.', 'NO_EXISTE');
      if (actualizarCampos_('zonas_envio', actual._fila, actual, cambios)) bitacora_(ctx.sesion, 'MENU', 'EDITAR_ZONA', nombre, ctx.dispositivo);
    } else {
      agregarFilas_('zonas_envio', [[nuevoId_('ZON'), localId, nombre, cambios.costo, minutos, cambios.activo, new Date()]]);
      bitacora_(ctx.sesion, 'MENU', 'CREAR_ZONA', nombre, ctx.dispositivo);
    }
    limpiarMenuCache_();
  } finally { lock.releaseLock(); }
  return accionMenuListar_({ local_id: 'TODOS' }, ctx);
}

function accionCuponesListar_() {
  var cfg = leerConfig_();
  return { ok: true, data: { cupones: leerTabla_('cupones').map(function (c) {
    return { id: String(c.id), codigo: String(c.codigo), tipo: String(c.tipo), valor: numero_(c.valor), vence: c.vence instanceof Date ? ymd_(c.vence, cfg) : '', usos_max: numero_(c.usos_max), usos: numero_(c.usos), activo: c.activo === true };
  }) } };
}

function accionCuponGuardar_(data, ctx) {
  var id = limpiarTexto_(data.id, 40);
  var codigo = limpiarTexto_(data.codigo, 30).toUpperCase().replace(/\s+/g, '');
  var tipo = String(data.tipo || ''), valor = Number(data.valor), vence = limpiarTexto_(data.vence, 10), usosMax = Math.round(Number(data.usos_max || 0));
  if (!/^[A-Z0-9_-]{3,30}$/.test(codigo)) throw fallo_('Código de 3 a 30 letras o números, sin espacios.');
  if (['porcentaje', 'monto'].indexOf(tipo) < 0) throw fallo_('Elija el tipo de descuento.');
  if (!(valor > 0) || (tipo === 'porcentaje' && valor > 100) || valor > 1000) throw fallo_('Valor del descuento no válido.');
  if (vence && !/^\d{4}-\d{2}-\d{2}$/.test(vence)) throw fallo_('Fecha de vencimiento no válida.');
  if (!(usosMax >= 0)) throw fallo_('Usos máximos no válidos.');
  var cambios = { codigo: codigo, tipo: tipo, valor: valor, vence: vence ? fechaDia_(vence) : '', usos_max: usosMax, activo: data.activo !== false };
  var lock = candado_();
  try {
    var filas = leerTabla_('cupones');
    var rep = filas.filter(function (r) { return String(r.id) !== id && claveComparar_(r.codigo) === claveComparar_(codigo); })[0];
    if (rep) throw fallo_('El cupón «' + codigo + '» ya existe.', 'DUPLICADO');
    if (id) {
      var actual = filas.filter(function (r) { return String(r.id) === id; })[0];
      if (!actual) throw fallo_('Ese cupón ya no existe.', 'NO_EXISTE');
      if (actualizarCampos_('cupones', actual._fila, actual, cambios)) bitacora_(ctx.sesion, 'MENU', 'EDITAR_CUPON', codigo, ctx.dispositivo);
    } else {
      agregarFilas_('cupones', [[nuevoId_('CUP'), codigo, tipo, valor, cambios.vence, usosMax, 0, cambios.activo, new Date()]]);
      bitacora_(ctx.sesion, 'MENU', 'CREAR_CUPON', codigo, ctx.dispositivo);
    }
  } finally { lock.releaseLock(); }
  return accionCuponesListar_();
}

/* Receta de un plato: qué insumos descuenta cada unidad vendida. */
function accionRecetaListar_(data, ctx) {
  var platoId = limpiarTexto_(data.plato_id, 40);
  var insumos = {};
  leerTabla_('insumos').forEach(function (i) { insumos[String(i.id)] = i; });
  var items = leerTabla_('recetas_plato').filter(function (r) { return String(r.plato_id) === platoId && numero_(r.cantidad) > 0; }).map(function (r) {
    var i = insumos[String(r.insumo_id)] || {};
    return { insumo_id: String(r.insumo_id), nombre: String(i.nombre || '¿?'), unidad: String(i.unidad || ''), cantidad: numero_(r.cantidad) };
  });
  return { ok: true, data: { items: items } };
}

function accionRecetaGuardar_(data, ctx) {
  var platoId = limpiarTexto_(data.plato_id, 40);
  var nuevos = {};
  (Array.isArray(data.items) ? data.items : []).slice(0, 40).forEach(function (x) {
    var iid = limpiarTexto_(x.insumo_id, 40), c = Number(x.cantidad);
    if (!iid) return;
    if (!(c >= 0 && c <= 100000)) throw fallo_('Cantidad no válida en la receta.');
    nuevos[iid] = c;
  });
  var lock = candado_();
  try {
    if (!leerTabla_('platos').some(function (p) { return String(p.id) === platoId; })) throw fallo_('Ese plato no existe.', 'NO_EXISTE');
    var insumos = {};
    leerTabla_('insumos').forEach(function (i) { insumos[String(i.id)] = true; });
    Object.keys(nuevos).forEach(function (k) { if (!insumos[k]) throw fallo_('Un insumo de la receta ya no existe.'); });
    var actuales = leerTabla_('recetas_plato').filter(function (r) { return String(r.plato_id) === platoId; });
    var vistos = {};
    actuales.forEach(function (r) {
      var k = String(r.insumo_id);
      var c = vistos[k] ? 0 : (k in nuevos ? nuevos[k] : 0); // lo que se quita queda en 0 (no se borra la fila)
      vistos[k] = true;
      actualizarCampos_('recetas_plato', r._fila, r, { cantidad: c });
    });
    var filas = Object.keys(nuevos).filter(function (k) { return !vistos[k] && nuevos[k] > 0; }).map(function (k) { return [nuevoId_('REC'), platoId, k, nuevos[k]]; });
    agregarFilas_('recetas_plato', filas);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'INVENTARIO', 'RECETA', platoId, ctx.dispositivo);
  return accionRecetaListar_({ plato_id: platoId }, ctx);
}

/*
 * Descuenta (signo 1) o devuelve (signo -1) los insumos de un pedido.
 * Si el insumo de la receta es de otro local, se usa el del local del pedido
 * con el mismo nombre. Devuelve true si movió algo.
 */
function descontarInventario_(pedidoId, numero, localId, detalle, signo, usuario) {
  var recetas = leerTabla_('recetas_plato').filter(function (r) { return numero_(r.cantidad) > 0; });
  if (!recetas.length) return false;
  var insumos = leerTabla_('insumos');
  var porId = {}, porNombre = {};
  insumos.forEach(function (i) {
    porId[String(i.id)] = i;
    if (String(i.local_id) === localId) porNombre[claveComparar_(i.nombre)] = i;
  });
  var total = {};
  detalle.forEach(function (d) {
    recetas.filter(function (r) { return String(r.plato_id) === String(d.plato_id); }).forEach(function (r) {
      var ins = porId[String(r.insumo_id)];
      if (ins && String(ins.local_id) !== localId) ins = porNombre[claveComparar_(ins.nombre)];
      if (!ins) return;
      total[String(ins.id)] = (total[String(ins.id)] || 0) + numero_(r.cantidad) * numero_(d.cantidad);
    });
  });
  var ids = Object.keys(total);
  if (!ids.length) return false;
  var ahora = new Date(), movs = [];
  ids.forEach(function (iid) {
    var ins = porId[iid];
    var cant = Math.round(total[iid] * 1000) / 1000;
    actualizarCampos_('insumos', ins._fila, ins, { stock: Math.round((numero_(ins.stock) - signo * cant) * 1000) / 1000 });
    movs.push([nuevoId_('MOV'), ahora, localId, iid, signo > 0 ? 'venta' : 'devolucion', signo > 0 ? -cant : cant, (signo > 0 ? 'Venta ' : 'Anulación ') + numero, '', usuario]);
  });
  agregarFilas_('movimientos_inventario', movs);
  return true;
}

/* ---------- 11.4 Clientes (dueño) ---------- */

function accionClientesListar_() {
  var cfg = leerConfig_();
  var hace30 = Date.now() - 30 * 24 * 3600 * 1000;
  var lista = leerTabla_('clientes').map(function (c) {
    var ult = c.ultimo_pedido instanceof Date ? c.ultimo_pedido : null;
    return { id: String(c.id), telefono: String(c.telefono), nombre: String(c.nombre), direccion: String(c.direccion), pedidos: numero_(c.pedidos), total_gastado: redondear_(c.total_gastado), ultimo_pedido: iso_(ult), inactivo: !!ult && ult.getTime() < hace30 };
  }).sort(function (a, b) { return b.total_gastado - a.total_gastado; });
  var corte = lista.length ? lista[Math.max(0, Math.ceil(lista.length * 0.1) - 1)].total_gastado : 0;
  lista.forEach(function (c) { c.vip = c.pedidos >= 5 || (c.total_gastado > 0 && c.total_gastado >= corte && lista.length >= 10); });
  return { ok: true, data: { clientes: lista.slice(0, 500), total: lista.length } };
}

/* ---------- 11.5 Panel de pedidos ---------- */

function accionPedidosListar_(data, ctx) {
  var cfg = leerConfig_();
  var local = localDeSesion_(ctx, data.local_id);
  var hoy = diaTrabajo_(new Date(), cfg);
  var dia = /^\d{4}-\d{2}-\d{2}$/.test(String(data.dia || '')) ? String(data.dia) : hoy;
  var lista = leerTabla_('pedidos').filter(function (p) {
    if (local !== 'TODOS' && String(p.local_id) !== local) return false;
    var d = ymd_(p.dia_trabajo, cfg);
    var abierto = ['Entregado', 'Anulado'].indexOf(String(p.estado)) < 0;
    return d === dia || (dia === hoy && abierto); // hoy + los que quedaron abiertos de antes
  });
  var det = detallePorPedido_(lista.map(function (p) { return String(p.id); }));
  var motos = {};
  leerTabla_('motorizados').forEach(function (m) { motos[String(m.id)] = { nombre: String(m.nombre), celular: String(m.celular) }; });
  return { ok: true, data: {
    dia: dia, hoy: hoy, ahora: new Date().toISOString(), minutos_atraso: numero_(cfg.minutos_atraso) || 45,
    pedidos: lista.map(function (p) {
      var o = pedidoSalida_(p, det[String(p.id)] || []);
      o.motorizado = motos[o.motorizado_id] || null;
      return o;
    }).sort(function (a, b) { return a.creado < b.creado ? 1 : -1; })
  } };
}

function buscarPedido_(id, ctx) {
  var p = leerTabla_('pedidos').filter(function (x) { return String(x.id) === String(id); })[0];
  if (!p) throw fallo_('Ese pedido ya no existe. Toque Actualizar.', 'NO_EXISTE');
  if (ctx && !puedeVerLocal_(ctx, p.local_id)) throw fallo_('Ese pedido no es de su local.', 'PERMISO');
  return p;
}

/* Cambia el estado. data: { id, desde, a }. «desde» evita pisar un cambio de otra persona. */
function accionPedidoEstado_(data, ctx) {
  var a = String(data.a || ''), desde = String(data.desde || '');
  var permitidos = { 'Recibido': ['Preparando'], 'Preparando': ['En camino', 'Entregado'], 'En camino': ['Entregado'] };
  var lock = candado_();
  var p;
  try {
    p = buscarPedido_(data.id, ctx);
    if (desde && String(p.estado) !== desde) throw fallo_('Este pedido cambió a «' + p.estado + '». Toque Actualizar.', 'CAMBIO');
    if (!(permitidos[String(p.estado)] || []).some(function (x) { return x === a; })) throw fallo_('No se puede pasar de «' + p.estado + '» a «' + a + '».');
    if (a === 'En camino' && !p.motorizado_id) throw fallo_('Asigne un motorizado antes de despachar.');
    if (a === 'Entregado' && String(p.estado) === 'Preparando' && (p.zona_id || p.motorizado_id)) throw fallo_('Este pedido es a domicilio: primero debe salir «En camino».');
    var cambios = { estado: a };
    cambios[{ 'Preparando': 'preparando', 'En camino': 'en_camino', 'Entregado': 'entregado' }[a]] = new Date();
    actualizarCampos_('pedidos', p._fila, p, cambios);
    p = buscarPedido_(data.id, ctx);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'PEDIDOS', 'ESTADO', p.numero + ' → ' + a, ctx.dispositivo);
  return { ok: true, data: { pedido: pedidoSalida_(p) } };
}

function accionPedidoAsignar_(data, ctx) {
  var motoId = limpiarTexto_(data.motorizado_id, 40);
  var lock = candado_();
  var p, m;
  try {
    p = buscarPedido_(data.id, ctx);
    if (['Recibido', 'Preparando'].indexOf(String(p.estado)) < 0) throw fallo_('Solo se asigna motorizado antes de que el pedido salga.');
    if (!p.zona_id) throw fallo_('Este pedido es para retirar en el local.');
    m = leerTabla_('motorizados').filter(function (x) { return String(x.id) === motoId; })[0];
    if (!m || m.activo !== true) throw fallo_('Ese motorizado no está activo.');
    if (m.local_id && String(m.local_id) !== 'TODOS' && String(m.local_id) !== String(p.local_id)) throw fallo_('Ese motorizado es de otro local.');
    actualizarCampos_('pedidos', p._fila, p, { motorizado_id: motoId });
    p = buscarPedido_(data.id, ctx);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'PEDIDOS', 'ASIGNAR', p.numero + ' → ' + m.nombre, ctx.dispositivo);
  return { ok: true, data: { pedido: pedidoSalida_(p) } };
}

/* Anular: nunca se borra. Devuelve cupón, cliente e inventario. */
function accionPedidoAnular_(data, ctx) {
  var motivo = limpiarTexto_(data.motivo, 200);
  if (motivo.length < 3) throw fallo_('Escriba el motivo de la anulación.');
  var lock = candado_();
  var p;
  try {
    p = buscarPedido_(data.id, ctx);
    if (String(p.estado) === 'Anulado') throw fallo_('Este pedido ya estaba anulado.');
    if (String(p.estado) === 'Entregado' && ctx.sesion.rol !== 'dueno') throw fallo_('Un pedido entregado solo lo anula el dueño.', 'PERMISO');
    if (p.liquidacion_id) throw fallo_('El efectivo de este pedido ya se liquidó en caja: no se puede anular.');
    actualizarCampos_('pedidos', p._fila, p, { estado: 'Anulado', anulado: new Date(), motivo_anulacion: motivo });
    var c = leerTabla_('clientes').filter(function (x) { return String(x.id) === String(p.cliente_id); })[0];
    if (c) actualizarCampos_('clientes', c._fila, c, { pedidos: Math.max(0, numero_(c.pedidos) - 1), total_gastado: Math.max(0, redondear_(numero_(c.total_gastado) - numero_(p.total))) });
    if (p.cupon) {
      var cu = leerTabla_('cupones').filter(function (x) { return claveComparar_(x.codigo) === claveComparar_(p.cupon); })[0];
      if (cu) actualizarCampos_('cupones', cu._fila, cu, { usos: Math.max(0, numero_(cu.usos) - 1) });
    }
    if (p.inventario_descontado === true) {
      var det = detallePorPedido_([String(p.id)])[String(p.id)] || [];
      descontarInventario_(String(p.id), String(p.numero), String(p.local_id), det, -1, ctx.sesion.usuario);
    }
    p = buscarPedido_(data.id, ctx);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'PEDIDOS', 'ANULAR', p.numero + ' · ' + motivo, ctx.dispositivo);
  return { ok: true, data: { pedido: pedidoSalida_(p) } };
}

/* Respaldo: el cliente mandó su ubicación por WhatsApp y el cajero pega el enlace. */
function accionPedidoUbicacion_(data, ctx) {
  var enlace = limpiarTexto_(data.enlace, 400);
  if (enlace && !/^https:\/\//.test(enlace)) throw fallo_('Pegue el enlace completo (empieza con https://).');
  var lock = candado_();
  var p;
  try {
    p = buscarPedido_(data.id, ctx);
    actualizarCampos_('pedidos', p._fila, p, { ubicacion_enlace: enlace });
    p = buscarPedido_(data.id, ctx);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'PEDIDOS', 'UBICACION', p.numero, ctx.dispositivo);
  return { ok: true, data: { pedido: pedidoSalida_(p) } };
}

function accionPedidoPagoVerificar_(data, ctx) {
  var lock = candado_();
  var p;
  try {
    p = buscarPedido_(data.id, ctx);
    if (String(p.forma_pago) !== 'transferencia') throw fallo_('Este pedido no es por transferencia.');
    actualizarCampos_('pedidos', p._fila, p, { pago_verificado: data.verificado !== false });
    p = buscarPedido_(data.id, ctx);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'CAJA', data.verificado !== false ? 'TRANSFERENCIA_VERIFICADA' : 'TRANSFERENCIA_PENDIENTE', p.numero, ctx.dispositivo);
  return { ok: true, data: { pedido: pedidoSalida_(p) } };
}

/* ---------- 11.6 Motorizados y «Mis entregas» ---------- */

function motorizadoSalida_(m) {
  return { id: String(m.id), nombre: String(m.nombre), cedula: String(m.cedula), celular: String(m.celular), direccion: String(m.direccion), placa: String(m.placa), foto_url: String(m.foto_url), usuario_id: String(m.usuario_id), local_id: String(m.local_id || 'TODOS'), activo: m.activo === true };
}

function accionMotorizadosListar_(data, ctx) {
  var local = localDeSesion_(ctx, data.local_id);
  var lista = leerTabla_('motorizados').map(motorizadoSalida_).filter(function (m) {
    return local === 'TODOS' || m.local_id === 'TODOS' || m.local_id === local;
  });
  if (ctx.sesion.rol !== 'dueno') lista = lista.filter(function (m) { return m.activo; }).map(function (m) { return { id: m.id, nombre: m.nombre, celular: m.celular, placa: m.placa, local_id: m.local_id, activo: true }; });
  // Último punto conocido (de «Salí» / «Entregado») para el mapa del dueño.
  if (ctx.sesion.rol === 'dueno') {
    var ultimo = {};
    leerTabla_('pedidos').forEach(function (p) {
      var id = String(p.motorizado_id);
      if (!id) return;
      [['entregado', 'entrega_lat', 'entrega_lng'], ['en_camino', 'sali_lat', 'sali_lng']].forEach(function (k) {
        if (p[k[0]] instanceof Date && p[k[1]] !== '' && (!ultimo[id] || p[k[0]].getTime() > ultimo[id].t)) ultimo[id] = { t: p[k[0]].getTime(), lat: Number(p[k[1]]), lng: Number(p[k[2]]) };
      });
    });
    lista.forEach(function (m) { var u = ultimo[m.id]; m.ultimo_punto = u ? { fecha: new Date(u.t).toISOString(), lat: u.lat, lng: u.lng } : null; });
  }
  return { ok: true, data: { motorizados: lista } };
}

function accionMotorizadoGuardar_(data, ctx) {
  var cfg = leerConfig_();
  var id = limpiarTexto_(data.id, 40), nombre = limpiarTexto_(data.nombre, 80);
  var cedula = limpiarTexto_(data.cedula, 20).replace(/\s/g, '');
  var placa = limpiarTexto_(data.placa, 12).toUpperCase().replace(/\s/g, '');
  var localId = limpiarTexto_(data.local_id, 40) || 'TODOS';
  var usuarioId = limpiarTexto_(data.usuario_id, 40);
  if (!nombre) throw fallo_('Escriba el nombre del motorizado.');
  if (String(cfg.pais_codigo) === '593') { if (!cedulaEcuadorValida_(cedula)) throw fallo_('La cédula no es válida (revise los 10 dígitos).', 'CEDULA'); }
  else if (!/^[A-Za-z0-9-]{5,20}$/.test(cedula)) throw fallo_('Documento de identidad no válido.');
  var celular = normalizarTelefono_(data.celular, cfg.pais_codigo);
  if (!celular) throw fallo_('Escriba el celular.');
  if (placa && !/^[A-Z0-9-]{4,10}$/.test(placa)) throw fallo_('Placa no válida.');
  var cambios = { nombre: nombre, cedula: cedula, celular: celular, direccion: limpiarTexto_(data.direccion, 200), placa: placa, foto_url: enlaceImagen_(data.foto_url), usuario_id: usuarioId, activo: data.activo !== false, local_id: localId };
  var lock = candado_();
  try {
    validarLocalOTodos_(localId);
    if (usuarioId) {
      var u = leerTabla_('usuarios').filter(function (x) { return String(x.id) === usuarioId; })[0];
      if (!u || String(u.rol) !== 'motorizado') throw fallo_('El usuario elegido no es de rol motorizado.');
    }
    var filas = leerTabla_('motorizados');
    filas.forEach(function (r) {
      if (String(r.id) === id) return;
      if (String(r.cedula) === cedula) throw fallo_('Ya existe un motorizado con esa cédula (' + r.nombre + ').', 'DUPLICADO');
      if (String(r.celular) === celular) throw fallo_('Ya existe un motorizado con ese celular (' + r.nombre + ').', 'DUPLICADO');
      if (usuarioId && String(r.usuario_id) === usuarioId) throw fallo_('Ese usuario ya está unido a ' + r.nombre + '.', 'DUPLICADO');
    });
    if (id) {
      var actual = filas.filter(function (r) { return String(r.id) === id; })[0];
      if (!actual) throw fallo_('Ese motorizado ya no existe. Toque Actualizar.', 'NO_EXISTE');
      if (actualizarCampos_('motorizados', actual._fila, actual, cambios)) bitacora_(ctx.sesion, 'MOTORIZADOS', cambios.activo ? 'EDITAR' : 'DESACTIVAR', nombre, ctx.dispositivo);
    } else {
      agregarFilas_('motorizados', [[nuevoId_('MOT'), nombre, cedula, celular, cambios.direccion, placa, cambios.foto_url, usuarioId, cambios.activo, new Date(), localId]]);
      bitacora_(ctx.sesion, 'MOTORIZADOS', 'CREAR', nombre, ctx.dispositivo);
    }
  } finally { lock.releaseLock(); }
  return accionMotorizadosListar_({ local_id: 'TODOS' }, ctx);
}

function miMotorizado_(ctx) {
  var m = leerTabla_('motorizados').filter(function (x) { return String(x.usuario_id) === ctx.sesion.usuario_id; })[0];
  if (!m || m.activo !== true) throw fallo_('Su usuario aún no está unido a una ficha de motorizado activa. Avise al dueño.', 'SIN_FICHA');
  return m;
}

/* Lo que el motorizado debe entregar: fondos recibidos no liquidados + efectivo cobrado no liquidado. */
function deudaMotorizado_(motoId, cajasAbiertas, pedidos) {
  var fondo = 0;
  var abiertas = {};
  cajasAbiertas.forEach(function (c) { abiertas[String(c.id)] = true; });
  leerTabla_('caja_movimientos').forEach(function (mv) {
    if (String(mv.motorizado_id) === motoId && String(mv.tipo) === 'fondo_motorizado' && abiertas[String(mv.caja_id)]) fondo += numero_(mv.monto);
  });
  leerTabla_('liquidaciones_motorizado').forEach(function (l) {
    if (String(l.motorizado_id) === motoId && abiertas[String(l.caja_id)]) fondo -= numero_(l.fondo);
  });
  var efectivo = 0, lista = [];
  pedidos.forEach(function (p) {
    if (String(p.motorizado_id) === motoId && String(p.estado) === 'Entregado' && String(p.forma_pago) === 'efectivo' && !p.liquidacion_id) {
      efectivo += numero_(p.total);
      lista.push(p);
    }
  });
  return { fondo: redondear_(Math.max(0, fondo)), efectivo: redondear_(efectivo), total: redondear_(Math.max(0, fondo) + efectivo), pedidos: lista };
}

function accionMisEntregas_(data, ctx) {
  var m = miMotorizado_(ctx);
  var cfg = leerConfig_();
  var hoy = diaTrabajo_(new Date(), cfg);
  var pedidos = leerTabla_('pedidos');
  var mios = pedidos.filter(function (p) {
    if (String(p.motorizado_id) !== String(m.id)) return false;
    var abierto = ['Recibido', 'Preparando', 'En camino'].indexOf(String(p.estado)) >= 0;
    return abierto || (String(p.estado) === 'Entregado' && ymd_(p.dia_trabajo, cfg) === hoy);
  });
  var det = detallePorPedido_(mios.map(function (p) { return String(p.id); }));
  var cajas = leerTabla_('caja').filter(function (c) { return String(c.estado) === 'abierta'; });
  var deuda = deudaMotorizado_(String(m.id), cajas, pedidos);
  return { ok: true, data: {
    motorizado: { id: String(m.id), nombre: String(m.nombre) },
    pedidos: mios.map(function (p) { return pedidoSalida_(p, det[String(p.id)] || []); }).sort(function (a, b) { return a.creado < b.creado ? -1 : 1; }),
    debe: { fondo: deuda.fondo, efectivo: deuda.efectivo, total: deuda.total }
  } };
}

function pedidoDeMotorizado_(data, ctx) {
  var m = miMotorizado_(ctx);
  var p = buscarPedido_(data.id, null);
  if (String(p.motorizado_id) !== String(m.id)) throw fallo_('Este pedido no está asignado a usted.', 'PERMISO');
  return p;
}

function coord_(v, min, max) { var n = Number(v); return (v === '' || v == null || !(n >= min && n <= max)) ? '' : n; }

function accionEntregaSali_(data, ctx) {
  var lock = candado_();
  var p;
  try {
    p = pedidoDeMotorizado_(data, ctx);
    if (String(p.estado) !== 'Preparando' && String(p.estado) !== 'Recibido') throw fallo_('Este pedido está «' + p.estado + '». Toque Actualizar.', 'CAMBIO');
    actualizarCampos_('pedidos', p._fila, p, { estado: 'En camino', en_camino: new Date(), sali_lat: coord_(data.lat, -90, 90), sali_lng: coord_(data.lng, -180, 180), preparando: p.preparando instanceof Date ? p.preparando : new Date() });
    p = buscarPedido_(data.id, null);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'ENTREGAS', 'SALI', String(p.numero), ctx.dispositivo);
  return { ok: true, data: { pedido: pedidoSalida_(p) } };
}

function accionEntregaEntregado_(data, ctx) {
  var foto = '';
  if (data.foto) foto = guardarFoto_(data.foto, 'entrega-' + limpiarTexto_(data.id, 40), 'Fotos de entregas', false);
  var lock = candado_();
  var p;
  try {
    p = pedidoDeMotorizado_(data, ctx);
    if (String(p.estado) !== 'En camino') throw fallo_('Primero toque «Salí». Este pedido está «' + p.estado + '».', 'CAMBIO');
    var cambios = { estado: 'Entregado', entregado: new Date(), entrega_lat: coord_(data.lat, -90, 90), entrega_lng: coord_(data.lng, -180, 180) };
    if (foto) cambios.foto_entrega = foto;
    actualizarCampos_('pedidos', p._fila, p, cambios);
    p = buscarPedido_(data.id, null);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'ENTREGAS', 'ENTREGADO', String(p.numero), ctx.dispositivo);
  return accionMisEntregas_({}, ctx);
}

/* ---------- 11.7 Reportes (dueño) — todo se calcula de los detalles ---------- */

function accionReportes_(data, ctx) {
  var cfg = leerConfig_();
  var zona = zona_(cfg);
  var hasta = /^\d{4}-\d{2}-\d{2}$/.test(String(data.hasta || '')) ? String(data.hasta) : diaTrabajo_(new Date(), cfg);
  var desde = /^\d{4}-\d{2}-\d{2}$/.test(String(data.desde || '')) ? String(data.desde) : hasta;
  if (desde > hasta) throw fallo_('La fecha «desde» es posterior a «hasta».');
  if ((fechaDia_(hasta, cfg) - fechaDia_(desde, cfg)) / 86400000 > 370) throw fallo_('Elija un rango de hasta un año.');
  var local = localDeSesion_(ctx, data.local_id);
  var nombresLocal = {};
  leerTabla_('locales').forEach(function (l) { nombresLocal[String(l.id)] = String(l.nombre); });
  var motos = {};
  leerTabla_('motorizados').forEach(function (m) { motos[String(m.id)] = String(m.nombre); });

  var todos = leerTabla_('pedidos').filter(function (p) {
    var d = ymd_(p.dia_trabajo, cfg);
    return d >= desde && d <= hasta && (local === 'TODOS' || String(p.local_id) === local);
  });
  var validos = todos.filter(function (p) { return String(p.estado) !== 'Anulado'; });
  var ids = {};
  validos.forEach(function (p) { ids[String(p.id)] = true; });

  var porLocal = {}, horas = [], dias = [], porMoto = {}, tiempos = [];
  for (var h = 0; h < 24; h++) horas.push({ hora: h, pedidos: 0, total: 0 });
  ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].forEach(function (n) { dias.push({ dia: n, pedidos: 0, total: 0 }); });
  var totales = { pedidos: 0, ventas: 0, envio: 0, descuento: 0, efectivo: 0, transferencia: 0, anulados: todos.length - validos.length };
  validos.forEach(function (p) {
    var t = numero_(p.total);
    totales.pedidos++; totales.ventas += t; totales.envio += numero_(p.envio); totales.descuento += numero_(p.descuento);
    totales[String(p.forma_pago) === 'transferencia' ? 'transferencia' : 'efectivo'] += t;
    var l = String(p.local_id);
    porLocal[l] = porLocal[l] || { local_id: l, nombre: nombresLocal[l] || l, pedidos: 0, total: 0 };
    porLocal[l].pedidos++; porLocal[l].total += t;
    if (p.creado instanceof Date) {
      var hh = Number(Utilities.formatDate(p.creado, zona, 'H'));
      horas[hh].pedidos++; horas[hh].total += t;
      var dd = Number(Utilities.formatDate(p.creado, zona, 'u')) - 1;
      dias[dd].pedidos++; dias[dd].total += t;
    }
    var min = (p.entregado instanceof Date && p.creado instanceof Date) ? (p.entregado - p.creado) / 60000 : null;
    if (min !== null && min >= 0 && p.zona_id) tiempos.push(min); // solo pedidos a domicilio
    var mid = String(p.motorizado_id);
    if (mid && String(p.estado) === 'Entregado') {
      porMoto[mid] = porMoto[mid] || { motorizado_id: mid, nombre: motos[mid] || mid, entregas: 0, efectivo: 0, minutos: [] };
      porMoto[mid].entregas++;
      if (String(p.forma_pago) === 'efectivo') porMoto[mid].efectivo += t;
      if (p.en_camino instanceof Date && p.entregado instanceof Date) porMoto[mid].minutos.push((p.entregado - p.en_camino) / 60000);
    }
  });
  var platos = {};
  leerTabla_('pedido_detalle').forEach(function (d) {
    if (!ids[String(d.pedido_id)]) return;
    var k = claveComparar_(d.nombre);
    platos[k] = platos[k] || { nombre: String(d.nombre), cantidad: 0, total: 0 };
    platos[k].cantidad += numero_(d.cantidad); platos[k].total += numero_(d.total_linea);
  });
  function prom(a) { return a.length ? Math.round(a.reduce(function (s, x) { return s + x; }, 0) / a.length) : null; }

  // Diferencias de caja por cajero (cierres) y por motorizado (liquidaciones) en el rango.
  var usuarios = {};
  leerTabla_('usuarios').forEach(function (u) { usuarios[String(u.usuario)] = String(u.nombre); });
  var cajas = {}, porCajero = {};
  leerTabla_('caja').forEach(function (c) {
    var d = ymd_(c.dia_trabajo, cfg);
    if (d < desde || d > hasta || (local !== 'TODOS' && String(c.local_id) !== local)) return;
    cajas[String(c.id)] = true;
    if (String(c.estado) !== 'cerrada') return;
    var k = String(c.cerrada_por);
    porCajero[k] = porCajero[k] || { usuario: k, nombre: usuarios[k] || k, cierres: 0, diferencia: 0 };
    porCajero[k].cierres++; porCajero[k].diferencia += numero_(c.diferencia);
  });
  var difMoto = {};
  leerTabla_('liquidaciones_motorizado').forEach(function (l) {
    if (!cajas[String(l.caja_id)]) return;
    var k = String(l.motorizado_id);
    difMoto[k] = (difMoto[k] || 0) + numero_(l.diferencia);
  });

  function red(o) { Object.keys(o).forEach(function (k) { if (typeof o[k] === 'number') o[k] = redondear_(o[k]); }); return o; }
  return { ok: true, data: {
    desde: desde, hasta: hasta, local: local, hoy: diaTrabajo_(new Date(), cfg),
    totales: red(Object.assign(totales, { ticket_promedio: totales.pedidos ? totales.ventas / totales.pedidos : 0, minutos_entrega: prom(tiempos) })),
    por_local: Object.keys(porLocal).map(function (k) { return red(porLocal[k]); }).sort(function (a, b) { return b.total - a.total; }),
    platos: Object.keys(platos).map(function (k) { return red(platos[k]); }).sort(function (a, b) { return b.cantidad - a.cantidad; }).slice(0, 15),
    horas: horas.map(red), dias: dias.map(red),
    motorizados: Object.keys(porMoto).map(function (k) { var m = porMoto[k]; return red({ nombre: m.nombre, entregas: m.entregas, efectivo: m.efectivo, minutos: prom(m.minutos), diferencia: difMoto[k] || 0 }); }).sort(function (a, b) { return b.entregas - a.entregas; }),
    cajeros: Object.keys(porCajero).map(function (k) { return red(porCajero[k]); })
  } };
}

/* ---------- 11.8 Inventario ---------- */

function insumoSalida_(i, nombresLocal) {
  var s = numero_(i.stock), mn = numero_(i.minimo);
  return { id: String(i.id), local_id: String(i.local_id), local: nombresLocal[String(i.local_id)] || '', nombre: String(i.nombre), unidad: String(i.unidad), stock: s, minimo: mn, bajo: i.activo === true && s <= mn, activo: i.activo === true };
}

function accionInsumosListar_(data, ctx) {
  var local = localDeSesion_(ctx, data.local_id);
  var nombres = {};
  leerTabla_('locales').forEach(function (l) { nombres[String(l.id)] = String(l.nombre); });
  var lista = leerTabla_('insumos').filter(function (i) { return local === 'TODOS' || String(i.local_id) === local; }).map(function (i) { return insumoSalida_(i, nombres); })
    .sort(function (a, b) { return (b.bajo - a.bajo) || a.nombre.localeCompare(b.nombre); });
  return { ok: true, data: { insumos: lista } };
}

function accionInsumoGuardar_(data, ctx) {
  var id = limpiarTexto_(data.id, 40), nombre = limpiarTexto_(data.nombre, 60), unidad = limpiarTexto_(data.unidad, 15) || 'unidad';
  var localId = limpiarTexto_(data.local_id, 40), minimo = Number(data.minimo || 0);
  if (!nombre) throw fallo_('Escriba el nombre del insumo.');
  if (!(minimo >= 0)) throw fallo_('Mínimo no válido.');
  var lock = candado_();
  try {
    if (!leerTabla_('locales').some(function (l) { return String(l.id) === localId; })) throw fallo_('Elija el local del insumo.');
    var filas = leerTabla_('insumos');
    var rep = filas.filter(function (r) { return String(r.id) !== id && String(r.local_id) === localId && claveComparar_(r.nombre) === claveComparar_(nombre); })[0];
    if (rep) throw fallo_('Ya existe «' + rep.nombre + '» en ese local.', 'DUPLICADO');
    if (id) {
      var actual = filas.filter(function (r) { return String(r.id) === id; })[0];
      if (!actual) throw fallo_('Ese insumo ya no existe.', 'NO_EXISTE');
      if (String(actual.local_id) !== localId) throw fallo_('Un insumo no cambia de local: use «Traspaso».');
      // El stock NO se edita aquí: solo con movimientos (quedan en el historial).
      if (actualizarCampos_('insumos', actual._fila, actual, { nombre: nombre, unidad: unidad, minimo: minimo, activo: data.activo !== false })) bitacora_(ctx.sesion, 'INVENTARIO', 'EDITAR_INSUMO', nombre, ctx.dispositivo);
    } else {
      var inicial = Number(data.stock || 0);
      if (!(inicial >= 0)) throw fallo_('Cantidad inicial no válida.');
      var nid = nuevoId_('INS'), ahora = new Date();
      agregarFilas_('insumos', [[nid, localId, nombre, unidad, inicial, minimo, data.activo !== false, ahora]]);
      if (inicial > 0) agregarFilas_('movimientos_inventario', [[nuevoId_('MOV'), ahora, localId, nid, 'inicial', inicial, 'Cantidad inicial', '', ctx.sesion.usuario]]);
      bitacora_(ctx.sesion, 'INVENTARIO', 'CREAR_INSUMO', nombre, ctx.dispositivo);
    }
  } finally { lock.releaseLock(); }
  return accionInsumosListar_({ local_id: 'TODOS' }, ctx);
}

/* tipo: compra (+), salida (−), conteo (queda la cantidad contada), traspaso (− aquí, + en el otro local). */
function accionInventarioMovimiento_(data, ctx) {
  var tipo = String(data.tipo || ''), cant = Number(data.cantidad), motivo = limpiarTexto_(data.motivo, 200), destino = limpiarTexto_(data.local_destino, 40);
  if (['compra', 'salida', 'conteo', 'traspaso'].indexOf(tipo) < 0) throw fallo_('Tipo de movimiento no válido.');
  if (!(cant >= 0 && cant <= 1000000) || (tipo !== 'conteo' && !(cant > 0))) throw fallo_('Cantidad no válida.');
  if ((tipo === 'salida' || tipo === 'traspaso') && motivo.length < 3) throw fallo_('Escriba el motivo.');
  var lock = candado_();
  var res = {};
  try {
    var filas = leerTabla_('insumos');
    var ins = filas.filter(function (r) { return String(r.id) === String(data.insumo_id); })[0];
    if (!ins) throw fallo_('Ese insumo ya no existe.', 'NO_EXISTE');
    if (!puedeVerLocal_(ctx, ins.local_id)) throw fallo_('Ese insumo no es de su local.', 'PERMISO');
    var stock = numero_(ins.stock), ahora = new Date(), u = ctx.sesion.usuario, movs = [];
    var r3 = function (n) { return Math.round(n * 1000) / 1000; };
    if (tipo === 'compra') { stock = r3(stock + cant); movs.push([nuevoId_('MOV'), ahora, ins.local_id, ins.id, 'compra', cant, motivo || 'Compra', '', u]); }
    if (tipo === 'salida' || tipo === 'traspaso') {
      if (cant > stock) throw fallo_('Solo hay ' + stock + ' ' + ins.unidad + ' de «' + ins.nombre + '».');
      stock = r3(stock - cant);
    }
    if (tipo === 'salida') movs.push([nuevoId_('MOV'), ahora, ins.local_id, ins.id, 'salida', -cant, motivo, '', u]);
    if (tipo === 'conteo') {
      var dif = r3(cant - stock);
      res.diferencia = dif;
      stock = r3(cant);
      movs.push([nuevoId_('MOV'), ahora, ins.local_id, ins.id, 'conteo', dif, (motivo || 'Conteo físico') + ' (había ' + numero_(ins.stock) + ', se contó ' + cant + ')', '', u]);
    }
    if (tipo === 'traspaso') {
      if (!destino || destino === String(ins.local_id)) throw fallo_('Elija el local que recibe.');
      if (!leerTabla_('locales').some(function (l) { return String(l.id) === destino && l.activo === true; })) throw fallo_('El local que recibe no existe.');
      var otro = filas.filter(function (r) { return String(r.local_id) === destino && claveComparar_(r.nombre) === claveComparar_(ins.nombre); })[0];
      var otroId;
      if (otro) { otroId = String(otro.id); actualizarCampos_('insumos', otro._fila, otro, { stock: r3(numero_(otro.stock) + cant) }); }
      else { otroId = nuevoId_('INS'); agregarFilas_('insumos', [[otroId, destino, ins.nombre, ins.unidad, cant, 0, true, ahora]]); }
      movs.push([nuevoId_('MOV'), ahora, ins.local_id, ins.id, 'traspaso_salida', -cant, motivo, destino, u]);
      movs.push([nuevoId_('MOV'), ahora, destino, otroId, 'traspaso_entrada', cant, motivo, String(ins.local_id), u]);
    }
    actualizarCampos_('insumos', ins._fila, ins, { stock: stock });
    agregarFilas_('movimientos_inventario', movs);
    res.stock = stock;
    res.nombre = String(ins.nombre);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'INVENTARIO', tipo.toUpperCase(), res.nombre + ' · ' + cant, ctx.dispositivo);
  var lista = accionInsumosListar_({ local_id: ctx.sesion.rol === 'dueno' ? 'TODOS' : '' }, ctx).data;
  lista.resultado = res;
  return { ok: true, data: lista };
}

function accionInventarioHistorial_(data, ctx) {
  var ins = leerTabla_('insumos').filter(function (r) { return String(r.id) === String(data.insumo_id); })[0];
  if (!ins) throw fallo_('Ese insumo ya no existe.', 'NO_EXISTE');
  if (!puedeVerLocal_(ctx, ins.local_id)) throw fallo_('Ese insumo no es de su local.', 'PERMISO');
  var movs = leerTabla_('movimientos_inventario').filter(function (m) { return String(m.insumo_id) === String(ins.id); }).slice(-60).reverse().map(function (m) {
    return { fecha: iso_(m.fecha), tipo: String(m.tipo), cantidad: numero_(m.cantidad), motivo: String(m.motivo), usuario: String(m.usuario) };
  });
  return { ok: true, data: { movimientos: movs } };
}

/* ---------- 11.9 Caja por local y día de trabajo ---------- */

function localCaja_(data, ctx) {
  var l = localDeSesion_(ctx, data.local_id);
  if (l === 'TODOS') throw fallo_('Elija un local arriba para ver su caja.', 'ELIJA_LOCAL');
  return l;
}

function cajaAbierta_(local) {
  return leerTabla_('caja').filter(function (c) { return String(c.local_id) === local && String(c.estado) === 'abierta'; })[0] || null;
}

/* Resumen calculado (nunca copiado a mano). */
function resumenCaja_(caja, cfg) {
  var cid = String(caja.id), local = String(caja.local_id), dia = ymd_(caja.dia_trabajo, cfg);
  var movs = leerTabla_('caja_movimientos').filter(function (m) { return String(m.caja_id) === cid; });
  var liqs = leerTabla_('liquidaciones_motorizado').filter(function (l) { return String(l.caja_id) === cid; });
  var pedidos = leerTabla_('pedidos').filter(function (p) { return String(p.local_id) === local; });
  var r = { fondo: numero_(caja.fondo), entradas: 0, salidas: 0, fondos_motorizado: 0, liquidado: 0, efectivo_local: 0, transferencias: 0, transferencias_pendientes: 0, pedidos: 0, ventas: 0 };
  movs.forEach(function (m) {
    var t = String(m.tipo);
    if (t === 'entrada') r.entradas += numero_(m.monto);
    if (t === 'salida') r.salidas += numero_(m.monto);
    if (t === 'fondo_motorizado') r.fondos_motorizado += numero_(m.monto);
  });
  liqs.forEach(function (l) { r.liquidado += numero_(l.entregado); });
  var transf = [];
  pedidos.forEach(function (p) {
    if (ymd_(p.dia_trabajo, cfg) !== dia || String(p.estado) === 'Anulado') return;
    r.pedidos++; r.ventas += numero_(p.total);
    if (String(p.forma_pago) === 'transferencia') {
      if (p.pago_verificado === true) r.transferencias += numero_(p.total); else r.transferencias_pendientes += numero_(p.total);
      transf.push({ id: String(p.id), numero: String(p.numero), cliente: String(p.cliente_nombre), total: redondear_(p.total), verificado: p.pago_verificado === true, estado: String(p.estado) });
    } else if (String(p.estado) === 'Entregado' && !p.motorizado_id) {
      r.efectivo_local += numero_(p.total); // retiro en el local, pagado en caja
    }
  });
  r.esperado = r.fondo + r.entradas - r.salidas - r.fondos_motorizado + r.liquidado + r.efectivo_local;
  Object.keys(r).forEach(function (k) { r[k] = redondear_(r[k]); });
  // Motorizados con algo por entregar en este local.
  var cajasAb = [caja];
  var motos = leerTabla_('motorizados').filter(function (m) { return !m.local_id || String(m.local_id) === 'TODOS' || String(m.local_id) === local; });
  var pendientes = [];
  motos.forEach(function (m) {
    var d = deudaMotorizado_(String(m.id), cajasAb, pedidos);
    if (d.total > 0) pendientes.push({ id: String(m.id), nombre: String(m.nombre), celular: String(m.celular), fondo: d.fondo, efectivo: d.efectivo, total: d.total, pedidos: d.pedidos.map(function (p) { return String(p.numero); }) });
  });
  return {
    resumen: r, pendientes: pendientes, transferencias: transf,
    movimientos: movs.map(function (m) { return { fecha: iso_(m.fecha), tipo: String(m.tipo), monto: redondear_(m.monto), motivo: String(m.motivo), usuario: String(m.usuario) }; }).reverse(),
    liquidaciones: liqs.map(function (l) { return { fecha: iso_(l.fecha), motorizado_id: String(l.motorizado_id), fondo: redondear_(l.fondo), efectivo_cobrado: redondear_(l.efectivo_cobrado), entregado: redondear_(l.entregado), diferencia: redondear_(l.diferencia), recibido_por: String(l.recibido_por) }; })
  };
}

function cajaSalida_(c, cfg) {
  return { id: String(c.id), local_id: String(c.local_id), dia_trabajo: ymd_(c.dia_trabajo, cfg), apertura: iso_(c.apertura), fondo: redondear_(c.fondo), abierta_por: String(c.abierta_por), cierre: iso_(c.cierre), esperado: c.esperado === '' ? '' : redondear_(c.esperado), contado: c.contado === '' ? '' : redondear_(c.contado), diferencia: c.diferencia === '' ? '' : redondear_(c.diferencia), cerrada_por: String(c.cerrada_por), estado: String(c.estado) };
}

function accionCajaEstado_(data, ctx) {
  var local = localCaja_(data, ctx);
  var cfg = leerConfig_();
  var c = cajaAbierta_(local);
  var out = { local_id: local, dia_hoy: diaTrabajo_(new Date(), cfg), caja: null };
  if (c) { out.caja = cajaSalida_(c, cfg); Object.assign(out, resumenCaja_(c, cfg)); }
  var cerradas = leerTabla_('caja').filter(function (x) { return String(x.local_id) === local && String(x.estado) === 'cerrada'; });
  out.ultima_cerrada = cerradas.length ? cajaSalida_(cerradas[cerradas.length - 1], cfg) : null;
  return { ok: true, data: out };
}

function accionCajaAbrir_(data, ctx) {
  var local = localCaja_(data, ctx);
  var fondo = Number(data.fondo);
  if (!(fondo >= 0 && fondo <= 100000)) throw fallo_('Fondo de cambio no válido.');
  var cfg = leerConfig_();
  var dia = diaTrabajo_(new Date(), cfg);
  var lock = candado_();
  try {
    var cajas = leerTabla_('caja').filter(function (c) { return String(c.local_id) === local; });
    var abierta = cajas.filter(function (c) { return String(c.estado) === 'abierta'; })[0];
    if (abierta) throw fallo_('Ya hay una caja abierta del ' + ymd_(abierta.dia_trabajo, cfg) + '. Ciérrela primero.', 'DUPLICADO');
    if (cajas.some(function (c) { return ymd_(c.dia_trabajo, cfg) === dia; })) throw fallo_('La caja de hoy ya se abrió y se cerró. Una sola apertura por día.', 'DUPLICADO');
    agregarFilas_('caja', [[nuevoId_('CAJ'), local, fechaDia_(dia, cfg), new Date(), fondo, ctx.sesion.usuario, '', '', '', '', '', 'abierta']]);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'CAJA', 'ABRIR', local + ' · fondo ' + redondear_(fondo).toFixed(2), ctx.dispositivo);
  return accionCajaEstado_({ local_id: local }, ctx);
}

function accionCajaMovimiento_(data, ctx) {
  var local = localCaja_(data, ctx);
  var tipo = String(data.tipo || ''), monto = Number(data.monto), motivo = limpiarTexto_(data.motivo, 200);
  if (['entrada', 'salida'].indexOf(tipo) < 0) throw fallo_('Tipo no válido.');
  if (!(monto > 0 && monto <= 100000)) throw fallo_('Monto no válido.');
  if (motivo.length < 3) throw fallo_('Escriba el motivo.');
  var lock = candado_();
  try {
    var c = cajaAbierta_(local);
    if (!c) throw fallo_('No hay caja abierta en este local.', 'SIN_CAJA');
    agregarFilas_('caja_movimientos', [[nuevoId_('CMV'), c.id, new Date(), tipo, monto, 'efectivo', motivo, '', '', ctx.sesion.usuario]]);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'CAJA', tipo.toUpperCase(), redondear_(monto).toFixed(2) + ' · ' + motivo, ctx.dispositivo);
  return accionCajaEstado_({ local_id: local }, ctx);
}

function accionCajaFondoMotorizado_(data, ctx) {
  var local = localCaja_(data, ctx);
  var monto = Number(data.monto), motoId = limpiarTexto_(data.motorizado_id, 40);
  if (!(monto > 0 && monto <= 10000)) throw fallo_('Monto no válido.');
  var lock = candado_(), m;
  try {
    var c = cajaAbierta_(local);
    if (!c) throw fallo_('No hay caja abierta en este local.', 'SIN_CAJA');
    m = leerTabla_('motorizados').filter(function (x) { return String(x.id) === motoId && x.activo === true; })[0];
    if (!m) throw fallo_('Elija un motorizado activo.');
    agregarFilas_('caja_movimientos', [[nuevoId_('CMV'), c.id, new Date(), 'fondo_motorizado', monto, 'efectivo', 'Fondo de cambio para ' + m.nombre, '', motoId, ctx.sesion.usuario]]);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'CAJA', 'FONDO_MOTORIZADO', m.nombre + ' · ' + redondear_(monto).toFixed(2), ctx.dispositivo);
  return accionCajaEstado_({ local_id: local }, ctx);
}

/* El motorizado entrega el dinero: se cuenta y queda la diferencia. */
function accionCajaLiquidar_(data, ctx) {
  var local = localCaja_(data, ctx);
  var entregado = Number(data.entregado), motoId = limpiarTexto_(data.motorizado_id, 40);
  if (!(entregado >= 0 && entregado <= 100000)) throw fallo_('Monto entregado no válido.');
  var cfg = leerConfig_();
  var lock = candado_(), m, liq;
  try {
    var c = cajaAbierta_(local);
    if (!c) throw fallo_('No hay caja abierta en este local.', 'SIN_CAJA');
    m = leerTabla_('motorizados').filter(function (x) { return String(x.id) === motoId; })[0];
    if (!m) throw fallo_('Ese motorizado no existe.');
    var pedidos = leerTabla_('pedidos').filter(function (p) { return String(p.local_id) === local; });
    var d = deudaMotorizado_(motoId, [c], pedidos);
    if (!(d.total > 0)) throw fallo_(m.nombre + ' no tiene nada pendiente por entregar.');
    var id = nuevoId_('LIQ');
    liq = { fondo: d.fondo, efectivo: d.efectivo, entregado: redondear_(entregado), diferencia: redondear_(entregado - d.total) };
    agregarFilas_('liquidaciones_motorizado', [[id, c.id, motoId, new Date(), d.fondo, d.efectivo, entregado, liq.diferencia, ctx.sesion.usuario]]);
    d.pedidos.forEach(function (p) { actualizarCampos_('pedidos', p._fila, p, { liquidacion_id: id }); });
    liq.pedidos = d.pedidos.length;
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'CAJA', 'LIQUIDAR', m.nombre + ' · entregó ' + liq.entregado.toFixed(2) + ' · dif ' + liq.diferencia.toFixed(2), ctx.dispositivo);
  var r = accionCajaEstado_({ local_id: local }, ctx);
  r.data.liquidacion = liq;
  return r;
}

/* Cierre: esperado vs. contado = diferencia. No se cierra si un motorizado no entregó. */
function accionCajaCerrar_(data, ctx) {
  var local = localCaja_(data, ctx);
  var contado = Number(data.contado);
  if (!(contado >= 0 && contado <= 1000000)) throw fallo_('Escriba cuánto dinero contó.');
  var cfg = leerConfig_();
  var lock = candado_(), c, res;
  try {
    c = cajaAbierta_(local);
    if (!c) throw fallo_('No hay caja abierta en este local.', 'SIN_CAJA');
    res = resumenCaja_(c, cfg);
    if (res.pendientes.length) throw fallo_('Falta liquidar: ' + res.pendientes.map(function (p) { return p.nombre + ' (' + p.total.toFixed(2) + ')'; }).join(', ') + '.', 'PENDIENTE');
    var dif = redondear_(contado - res.resumen.esperado);
    actualizarCampos_('caja', c._fila, c, { cierre: new Date(), esperado: res.resumen.esperado, contado: contado, diferencia: dif, cerrada_por: ctx.sesion.usuario, estado: 'cerrada' });
    res.resumen.contado = redondear_(contado);
    res.resumen.diferencia = dif;
  } finally { lock.releaseLock(); }
  var nombreLocal = (leerTabla_('locales').filter(function (l) { return String(l.id) === local; })[0] || {}).nombre || local;
  var r = res.resumen, mon = cfg.moneda || 'USD';
  function f(n) { return mon + ' ' + redondear_(n).toFixed(2); }
  var texto = '*Cierre de caja — ' + nombreLocal + '*\nDía: ' + ymd_(c.dia_trabajo, cfg) + '\nCerró: ' + ctx.sesion.nombre +
    '\n\nPedidos: ' + r.pedidos + ' · Ventas: ' + f(r.ventas) +
    '\nFondo inicial: ' + f(r.fondo) + '\nEfectivo de motorizados: ' + f(r.liquidado) + '\nEfectivo en el local: ' + f(r.efectivo_local) +
    '\nEntradas: ' + f(r.entradas) + '\nSalidas: ' + f(r.salidas) + '\nFondos a motorizados: ' + f(r.fondos_motorizado) +
    '\nTransferencias verificadas: ' + f(r.transferencias) + (r.transferencias_pendientes ? '\n⚠️ Transferencias sin verificar: ' + f(r.transferencias_pendientes) : '') +
    '\n\nDebía haber: ' + f(r.esperado) + '\nContado: ' + f(r.contado) + '\n*Diferencia: ' + f(r.diferencia) + '*';
  bitacora_(ctx.sesion, 'CAJA', 'CERRAR', nombreLocal + ' · dif ' + r.diferencia.toFixed(2), ctx.dispositivo);
  var out = accionCajaEstado_({ local_id: local }, ctx);
  out.data.cierre = { resumen: r, texto: texto, whatsapp_dueno: cfg.whatsapp_dueno || cfg.whatsapp || '' };
  return out;
}
