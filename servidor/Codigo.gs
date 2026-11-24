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

var APP_VERSION = '3.1.7';
var APP_VERSION_NUM = 30107; // 3.1.0 -> 30100 (la pantalla compara con su mínimo)
var SESION_SEGUNDOS = 21600;  // 6 h; se renueva con cada uso
var ROLES = ['dueno', 'cajero', 'motorizado'];

/* ============================================================
 * 1. ESTRUCTURA DE LAS 18 HOJAS
 * Tipos de columna: t = texto, d = fecha y hora, f = solo fecha,
 * n = número, m = dinero (2 decimales), b = sí/no (casilla).
 * ============================================================ */
var HOJAS = {
  configuracion: [['clave', 't'], ['valor', 't'], ['actualizado', 'd'], ['actualizado_por', 't']],
  locales: [['id', 't'], ['nombre', 't'], ['direccion', 't'], ['telefono', 't'], ['activo', 'b'], ['creado', 'd'], ['creado_por', 't'], /* 3.1.6 */ ['lat', 'n'], ['lng', 'n'], ['pausado', 'b'], ['mensaje_pausa', 't'], ['minimo_domicilio', 'm']],
  categorias: [['id', 't'], ['local_id', 't'], ['nombre', 't'], ['orden', 'n'], ['activo', 'b'], ['creado', 'd']],
  platos: [['id', 't'], ['local_id', 't'], ['categoria_id', 't'], ['nombre', 't'], ['descripcion', 't'], ['precio', 'm'], ['foto_url', 't'], ['extras_json', 't'], ['agotado', 'b'], ['activo', 'b'], ['creado', 'd'],
    /* 3.0 */ ['etiquetas', 't'], ['sugerido', 'b']],
  pedidos: [['id', 't'], ['numero', 't'], ['op_id', 't'], ['local_id', 't'], ['dia_trabajo', 'f'], ['cliente_id', 't'], ['cliente_nombre', 't'], ['telefono', 't'], ['direccion', 't'], ['referencia', 't'], ['lat', 'n'], ['lng', 'n'], ['zona_id', 't'], ['forma_pago', 't'], ['subtotal', 'm'], ['envio', 'm'], ['descuento', 'm'], ['total', 'm'], ['cupon', 't'], ['estado', 't'], ['motorizado_id', 't'], ['creado', 'd'], ['preparando', 'd'], ['en_camino', 'd'], ['entregado', 'd'], ['anulado', 'd'], ['motivo_anulacion', 't'], ['usuario', 't'],
    /* fase 2-7 (agregadas al final) */ ['hora_estimada', 'd'], ['ubicacion_enlace', 't'], ['notas', 't'], ['sali_lat', 'n'], ['sali_lng', 'n'], ['entrega_lat', 'n'], ['entrega_lng', 'n'], ['foto_entrega', 't'], ['pago_verificado', 'b'], ['liquidacion_id', 't'], ['inventario_descontado', 'b'],
    /* 3.0 (agregadas al final) */ ['tipo_entrega', 't'], ['mesa', 't'], ['hora_llegada', 'd'], ['origen', 't'], ['propina', 'm'], ['base_iva', 'm'], ['iva', 'm'], ['ubicacion_fuente', 't'], ['cliente_nuevo', 'b'], ['calificacion', 'n'], ['comentario', 't'], ['premio', 'm'], ['disp_id', 't'],
    /* 3.1 */ ['codigo_entrega', 't'], ['ultima_senal', 'd'],
    /* 3.1.3 */ ['clave_seguimiento', 't'],
    /* 3.1.5 */ ['cuenta_pago', 't'], ['pago_verificado_fecha', 'd'],
    /* 3.1.6 */ ['distancia_km', 'n'], ['hora_ventana_fin', 'd'], ['incidencia_motivo', 't'], ['anulado_por', 't']],
  pedido_detalle: [['id', 't'], ['pedido_id', 't'], ['plato_id', 't'], ['nombre', 't'], ['precio', 'm'], ['cantidad', 'n'], ['extras', 't'], ['total_linea', 'm']],
  clientes: [['id', 't'], ['telefono', 't'], ['nombre', 't'], ['direccion', 't'], ['referencia', 't'], ['lat', 'n'], ['lng', 'n'], ['pedidos', 'n'], ['total_gastado', 'm'], ['ultimo_pedido', 'd'], ['creado', 'd'],
    /* 3.0 */ ['entregados', 'n'], ['sellos', 'n'],
    /* 3.1 */ ['acepta_promos', 'b'], ['anonimizado', 'b'],
    /* 3.1.5 */ ['efectivo_ok', 'b'], ['clave_cliente', 't']],
  motorizados: [['id', 't'], ['nombre', 't'], ['cedula', 't'], ['celular', 't'], ['direccion', 't'], ['placa', 't'], ['foto_url', 't'], ['usuario_id', 't'], ['activo', 'b'], ['creado', 'd'],
    /* fase 4 */ ['local_id', 't'],
    /* 3.1 */ ['color_moto', 't'], ['modelo_moto', 't'], ['licencia_vence', 'f'], ['matricula_vence', 'f'], ['forma_pago', 't'], ['tarifa', 'm']],
  insumos: [['id', 't'], ['local_id', 't'], ['nombre', 't'], ['unidad', 't'], ['stock', 'n'], ['minimo', 'n'], ['activo', 'b'], ['creado', 'd'],
    /* 3.1.3 */ ['costo', 'm'], ['proveedor', 't'], ['proveedor_tel', 't']],
  movimientos_inventario: [['id', 't'], ['fecha', 'd'], ['local_id', 't'], ['insumo_id', 't'], ['tipo', 't'], ['cantidad', 'n'], ['motivo', 't'], ['local_destino', 't'], ['usuario', 't']],
  recetas_plato: [['id', 't'], ['plato_id', 't'], ['insumo_id', 't'], ['cantidad', 'n']],
  caja: [['id', 't'], ['local_id', 't'], ['dia_trabajo', 'f'], ['apertura', 'd'], ['fondo', 'm'], ['abierta_por', 't'], ['cierre', 'd'], ['esperado', 'm'], ['contado', 'm'], ['diferencia', 'm'], ['cerrada_por', 't'], ['estado', 't']],
  usuarios: [['id', 't'], ['usuario', 't'], ['nombre', 't'], ['rol', 't'], ['local_id', 't'], ['hash', 't'], ['sal', 't'], ['activo', 'b'], ['creado', 'd'], ['ultimo_acceso', 'd']],
  bitacora: [['fecha', 'd'], ['usuario', 't'], ['rol', 't'], ['local_id', 't'], ['modulo', 't'], ['accion', 't'], ['detalle', 't'], ['dispositivo', 't']],
  zonas_envio: [['id', 't'], ['local_id', 't'], ['nombre', 't'], ['costo', 'm'], ['minutos', 'n'], ['activo', 'b'], ['creado', 'd'], /* 3.1.6 */ ['lat', 'n'], ['lng', 'n'], ['radio_km', 'n'], ['minimo_domicilio', 'm']],
  caja_movimientos: [['id', 't'], ['caja_id', 't'], ['fecha', 'd'], ['tipo', 't'], ['monto', 'm'], ['forma', 't'], ['motivo', 't'], ['pedido_id', 't'], ['motorizado_id', 't'], ['usuario', 't']],
  liquidaciones_motorizado: [['id', 't'], ['caja_id', 't'], ['motorizado_id', 't'], ['fecha', 'd'], ['fondo', 'm'], ['efectivo_cobrado', 'm'], ['entregado', 'm'], ['diferencia', 'm'], ['recibido_por', 't']],
  cupones: [['id', 't'], ['codigo', 't'], ['tipo', 't'], ['valor', 'n'], ['vence', 'f'], ['usos_max', 'n'], ['usos', 'n'], ['activo', 'b'], ['creado', 'd'], /* 3.1.6 */ ['local_id', 't'], ['un_uso_cliente', 'b'], ['compra_minima', 'm']],
  /* 3.1: hojas nuevas (el instalador y asegurarHojas_ las crean solas) */
  turnos: [['id', 't'], ['motorizado_id', 't'], ['dia_trabajo', 'f'], ['inicio', 'd'], ['fin', 'd'], ['inicio_lat', 'n'], ['inicio_lng', 'n'], ['fin_lat', 'n'], ['fin_lng', 'n']],
  rastreo: [['id', 't'], ['pedido_id', 't'], ['motorizado_id', 't'], ['fecha', 'd'], ['lat', 'n'], ['lng', 'n'], ['precision', 'n']]
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
  whatsapp_dueno: '',
  /* 3.0 */
  horario_apertura: '',      // ej. 11:00 (vacío = siempre abierto)
  horario_cierre: '',        // ej. 22:30
  dias_cerrado: '',          // ej. 1 (lunes); varios separados por coma; 7 = domingo
  deuna_qr_url: '',          // imagen del QR de Deuna del negocio
  fidelidad_sellos: '0',     // 0 = apagado; ej. 8 = cada 8 pedidos entregados
  fidelidad_descuento: '50', // % de descuento del premio sobre el plato más caro
  propinas: 'SI',
  envio_para: 'local',       // local | motorizado (a quién le queda el envío)
  verificar_antes_salir: 'SI',
  mesas: '0',                // cuántas mesas con QR (0 = no se come en el local)
  /* 3.1 */
  codigo_entrega: 'SI',      // el cliente dice 4 números al motorizado para marcar «Entregado»
  exigir_turno: 'NO',        // SI = no se asigna pedido a un motorizado sin turno abierto
  minutos_alerta_detenido: '10',
  minutos_alerta_senal: '5',
  dias_guardar_rastreo: '30',
  privacidad_texto: '',      // vacío = texto por defecto (privacidad.html)
  formato_hora: '24',        // 24 | 12
  meta_entregas_dia: '',     // 3.1: meta diaria de entregas por motorizado (vacío = sin meta)
  bono_meta: '',             // 3.1: bono en USD por cada día que cumple la meta
  /* 3.1.3 */
  efectivo_permitido: 'SI',  // SI | NO — si el cliente puede pagar en efectivo
  efectivo_maximo: '',       // monto máximo en efectivo (vacío = sin límite)
  red_instagram: '',         // redes y página web del negocio (vacío = no se muestra)
  red_facebook: '',
  red_tiktok: '',
  pagina_web: '',
  /* 3.1.5 */
  cuentas_bancarias: '',       // JSON: [{banco, tipo, numero, titular, documento, correo, activa}] (hasta 6)
  verificar_antes_preparar: 'SI', // SI = un pago digital sin verificar tampoco pasa a «Preparando»
  minutos_alerta_pago: '30',   // aviso en el panel si el pago lleva más de N minutos sin verificar
  dias_historial_cliente: '30', // días que el teléfono del cliente guarda su historial de pedidos
  anos_limpieza_clientes: '2', // años sin pedir → se borran solos los datos personales del cliente (0 = nunca)
  politicas_texto: '',         // «Cómo funciona tu pedido»
  /* 3.1.6 */
  cobertura_km: '', cobertura_modo: 'avisar', permitir_programar: 'NO', ventana_minutos: '30',
  velocidad_moto_kmh: '20', minutos_alerta_pedido: '15', recibir_cerrado: 'SI'
};

/* Campos de configuración que puede ver cualquiera (sin sesión). */
var CONFIG_PUBLICA = ['minutos_alerta_pago', 'anos_limpieza_clientes', 'negocio_nombre', 'logo_url', 'color_primario', 'color_acento', 'whatsapp', 'pais_codigo', 'ciudad', 'moneda', 'zona_horaria', 'mensaje_bienvenida',
  /* 3.0 */ 'horario_apertura', 'horario_cierre', 'dias_cerrado', 'deuna_qr_url', 'fidelidad_sellos', 'fidelidad_descuento', 'propinas', 'mesas', 'verificar_antes_salir', 'precios_incluyen_iva', 'codigo_entrega', 'privacidad_texto', 'formato_hora',
  /* 3.1.3 */ 'efectivo_permitido', 'efectivo_maximo', 'red_instagram', 'red_facebook', 'red_tiktok', 'pagina_web',
  /* 3.1.5 */ 'iva_porcentaje', 'cuentas_bancarias', 'verificar_antes_preparar', 'dias_historial_cliente', 'politicas_texto',
  /* 3.1.6 */ 'cobertura_km', 'cobertura_modo', 'permitir_programar', 'ventana_minutos', 'velocidad_moto_kmh', 'minutos_alerta_pedido', 'minutos_preparacion', 'recibir_cerrado'];

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
  pedidoRecuperar:     { tipo: 'publica', fn: accionPedidoRecuperar_ },
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
  cajaCerrar:         { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionCajaCerrar_ },
  /* ---- 3.0 (sección 12) ---- */
  pedidoCalificar:    { tipo: 'publica', fn: accionPedidoCalificar_ },
  ubicacionResolver:  { tipo: 'publica', fn: accionUbicacionResolver_ },
  pedidosNuevos:      { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionPedidosNuevos_ },
  pedidoBuscar:       { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionPedidoBuscar_ },
  menuEjemplo:        { tipo: 'dueno',   fn: accionMenuEjemplo_ },
  motorizadoCrearTodo:{ tipo: 'dueno',   fn: accionMotorizadoCrearTodo_ },
  exportar:           { tipo: 'dueno',   fn: accionExportar_ },
  /* ---- 3.1 (sección 13) ---- */
  turnoIniciar:       { tipo: 'sesion',  roles: ['motorizado'], fn: accionTurnoIniciar_ },
  turnoTerminar:      { tipo: 'sesion',  roles: ['motorizado'], fn: accionTurnoTerminar_ },
  rastreoPunto:       { tipo: 'sesion',  roles: ['motorizado'], fn: accionRastreoPunto_ },
  monitoreo:          { tipo: 'sesion',  roles: ['dueno', 'cajero'], fn: accionMonitoreo_ },
  informeMotorizados: { tipo: 'dueno',   fn: accionInformeMotorizados_ },
  rutaPedido:         { tipo: 'dueno',   fn: accionRutaPedido_ },
  clienteAnonimizar:  { tipo: 'dueno',   fn: accionClienteAnonimizar_ },
  privacidadPublica:  { tipo: 'publica', fn: accionPrivacidadPublica_ },
  /* ---- 3.1.3 ---- */
  fotoEntregaVer:     { tipo: 'sesion',  roles: ['dueno', 'cajero', 'motorizado'], fn: accionFotoEntregaVer_ },
  motorizadoFoto:     { tipo: 'dueno',   fn: accionMotorizadoFoto_ },
  /* ---- 3.1.5 ---- */
  pedidosSeguir:      { tipo: 'publica', fn: accionPedidosSeguir_ },
  misPedidos:         { tipo: 'publica', fn: accionMisPedidos_ },
  pagoOpciones:       { tipo: 'publica', fn: accionPagoOpciones_ },
  clienteEfectivo:    { tipo: 'dueno',   fn: accionClienteEfectivo_ },
  /* 3.1.6 */
  cuponValidar:       { tipo: 'publica', fn: accionCuponValidar_ },
  localPausar:        { tipo: 'dueno', fn: accionLocalPausar_ },
  pedidoRegresar:     { tipo: 'sesion', roles: ['dueno', 'cajero'], fn: accionPedidoRegresar_ }
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
    agregarFilas_('usuarios', [[nuevoId_('USR'), usuario, nombrePersona, 'dueno', 'TODOS', hashClave2_(clave, sal), sal, true, ahora, '']]);

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
    var v = LARGOS_[k] ? textoLargo_(cambios[k], LARGOS_[k]) : limpiarTexto_(cambios[k], 300); // 3.1.5: textos largos conservan los saltos de línea
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
    /* 3.0 */
    if ((k === 'horario_apertura' || k === 'horario_cierre') && v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw fallo_('Hora no válida (ej. 11:00).');
    if (k === 'dias_cerrado' && v && !/^[1-7](,[1-7])*$/.test(v.replace(/\s/g, ''))) throw fallo_('Días cerrados no válidos.');
    if (k === 'dias_cerrado') v = v.replace(/\s/g, '');
    if (k === 'fidelidad_sellos' && !(/^\d{1,2}$/.test(v))) throw fallo_('Sellos no válidos (0 a 99).');
    if (k === 'fidelidad_descuento' && !(Number(v) >= 1 && Number(v) <= 100)) throw fallo_('Descuento del premio no válido (1 a 100).');
    if (k === 'mesas' && !(/^\d{1,3}$/.test(v))) throw fallo_('Número de mesas no válido.');
    if ((k === 'propinas' || k === 'verificar_antes_salir') && ['SI', 'NO'].indexOf(v) < 0) throw fallo_('Valor no válido.');
    if (k === 'envio_para' && ['local', 'motorizado'].indexOf(v) < 0) throw fallo_('Valor no válido.');
    if (k === 'deuna_qr_url' || k === 'logo_url') v = enlaceImagen_(v);
    /* 3.1 */
    if ((k === 'codigo_entrega' || k === 'exigir_turno') && ['SI', 'NO'].indexOf(v) < 0) throw fallo_('Valor no válido.');
    if ((k === 'minutos_alerta_detenido' || k === 'minutos_alerta_senal') && !(Number(v) >= 1 && Number(v) <= 120)) throw fallo_('Minutos de alerta no válidos (1 a 120).');
    if (k === 'dias_guardar_rastreo' && !(Number(v) >= 1 && Number(v) <= 365)) throw fallo_('Días no válidos (1 a 365).');
    if (k === 'formato_hora' && ['12', '24'].indexOf(v) < 0) throw fallo_('Formato de hora no válido.');
    if ((k === 'meta_entregas_dia' || k === 'bono_meta') && v !== '' && !(Number(v) >= 0 && Number(v) <= 1000)) throw fallo_('Meta o bono no válidos.');
    /* 3.1.3 */
    if (k === 'efectivo_permitido' && ['SI', 'NO'].indexOf(v) < 0) throw fallo_('Valor no válido.');
    if (k === 'efectivo_maximo' && v !== '' && !(Number(v) > 0 && Number(v) <= 10000)) throw fallo_('Monto máximo de efectivo no válido.');
    if (['red_instagram', 'red_facebook', 'red_tiktok', 'pagina_web'].indexOf(k) >= 0) v = enlaceRed_(k, v);
    /* 3.1.5 */
    if (k === 'cuentas_bancarias') v = cuentasLimpias_(cambios[k]);
    if (k === 'verificar_antes_preparar' && ['SI', 'NO'].indexOf(v) < 0) throw fallo_('Valor no válido.');
    if (k === 'minutos_alerta_pago' && !(Number(v) >= 5 && Number(v) <= 1440)) throw fallo_('Minutos de aviso de pago no válidos (5 a 1440).');
    if (k === 'dias_historial_cliente' && !(Number(v) >= 1 && Number(v) <= 365)) throw fallo_('Días de historial no válidos (1 a 365).');
    if (k === 'anos_limpieza_clientes' && !(/^\d$/.test(v) && Number(v) <= 7)) throw fallo_('Años no válidos (0 a 7).');
    /* 3.1.6: valores nuevos siempre validados por el servidor. */
    if (k === 'cobertura_modo' && ['avisar', 'bloquear'].indexOf(v) < 0) throw fallo_('Modo de cobertura no válido.');
    if ((k === 'permitir_programar' || k === 'recibir_cerrado') && ['SI', 'NO'].indexOf(v) < 0) throw fallo_('Elija si permite programar.');
    if (k === 'cobertura_km' && v !== '' && !(Number(v) >= 0 && Number(v) <= 1000)) throw fallo_('Cobertura no válida (0 a 1000 km).');
    if (k === 'ventana_minutos' && !(/^\d+$/.test(v) && Number(v) >= 10 && Number(v) <= 180)) throw fallo_('Ventana entre 10 y 180 minutos.');
    if (k === 'velocidad_moto_kmh' && !(/^\d+$/.test(v) && Number(v) >= 5 && Number(v) <= 100)) throw fallo_('Velocidad entre 5 y 100 km/h.');
    if (k === 'minutos_alerta_pedido' && !(/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 240)) throw fallo_('Alerta entre 1 y 240 minutos.');
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
    limpiarMenuCache_(); // 3.1.3: el cliente ve al instante los ajustes nuevos (efectivo, redes, horario)
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
  // 3.0: el bloqueo es por usuario Y por teléfono: un extraño no puede dejar fuera al dueño.
  var disp = limpiarTexto_(data.disp_id, 60).replace(/[^A-Za-z0-9_-]/g, '') || 'sin-id';
  var claveIntentos = 'INTENTOS_' + usuario + '_' + disp;
  var claveGlobal = 'INTENTOSG_' + usuario;
  var intentos = Number(cache.get(claveIntentos) || 0);
  if (intentos >= 5) throw fallo_('Demasiados intentos desde este teléfono. Espere 10 minutos.', 'BLOQUEADO');
  if (Number(cache.get(claveGlobal) || 0) >= 30) throw fallo_('Demasiados intentos con este usuario. Espere 10 minutos.', 'BLOQUEADO');

  var u = null;
  leerTabla_('usuarios').some(function (r) { if (normalizarUsuario_(r.usuario) === usuario) { u = r; return true; } return false; });
  if (!u || !claveCorrecta_(clave, u)) {
    cache.put(claveIntentos, String(intentos + 1), 600);
    cache.put(claveGlobal, String(Number(cache.get(claveGlobal) || 0) + 1), 600);
    bitacora_({ usuario: usuario, rol: '', local_id: '' }, 'SEGURIDAD', 'LOGIN_FALLIDO', '', ctx.dispositivo);
    throw fallo_('Usuario o clave incorrectos.', 'CREDENCIALES');
  }
  if (u.activo !== true) throw fallo_('Este usuario está desactivado. Consulte con el dueño.', 'DESACTIVADO');
  cache.remove(claveIntentos);
  if (String(u.hash).indexOf('v2$') !== 0) {
    // Se refuerza la clave guardada sin pedirle una nueva a la persona.
    try { actualizarCampos_('usuarios', u._fila, u, { hash: hashClave2_(clave, String(u.sal)) }); } catch (eh) { console.error('reforzar clave: ' + eh); }
  }

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

/* 3.1.6: ubicación opcional de locales y zonas; enlaces de Maps solo cuando son resolubles. */
function puntoConfig_(data) {
  var lat = coord_(data.lat, -90, 90), lng = coord_(data.lng, -180, 180);
  if (data.enlace && (lat === '' || lng === '')) {
    var enlace = limpiarTexto_(data.enlace, 400);
    if (!/^https:\/\/(?:maps\.app\.goo\.gl\/|goo\.gl\/maps\/|(?:www\.)?google\.[a-z.]+\/maps(?:[\/?#]|$)|maps\.google\.[a-z.]+\/)/i.test(enlace)) throw fallo_('Pegue un enlace de Google Maps.');
    var p = coordenadasDeEnlace_(enlace);
    if (!p) throw fallo_('No se pudieron leer las coordenadas de ese enlace. Use el botón GPS o pegue un enlace con un punto exacto.');
    lat = coord_(p.lat, -90, 90); lng = coord_(p.lng, -180, 180);
  }
  if ((lat === '') !== (lng === '')) throw fallo_('La ubicación necesita latitud y longitud válidas.');
  return { lat: lat, lng: lng };
}
function tienePunto_(r) { return r && r.lat !== '' && r.lng !== '' && r.lat != null && r.lng != null && isFinite(Number(r.lat)) && isFinite(Number(r.lng)); }
function distanciaKm_(a, b) { return Math.round(distanciaM_({ lat: Number(a.lat), lng: Number(a.lng) }, { lat: Number(b.lat), lng: Number(b.lng) }) / 100) / 10; }
function fechaCalendario_(d, cfg) { return d instanceof Date ? Utilities.formatDate(d, zona_(cfg), 'yyyy-MM-dd') : ''; }

/* ============================================================
 * 7. LOCALES
 * ============================================================ */
function accionLocalesListar_(data, ctx) {
  var lista = leerTabla_('locales').map(function (r) {
    return { id: String(r.id), nombre: String(r.nombre), direccion: String(r.direccion), telefono: String(r.telefono), activo: r.activo === true, lat: r.lat === '' ? '' : numero_(r.lat), lng: r.lng === '' ? '' : numero_(r.lng), pausado: r.pausado === true, mensaje_pausa: String(r.mensaje_pausa || ''), minimo_domicilio: r.minimo_domicilio === '' ? '' : redondear_(r.minimo_domicilio) };
  });
  if (ctx.sesion.rol !== 'dueno') lista = lista.filter(function (l) { return l.id === ctx.sesion.local_id; });
  return { ok: true, data: { locales: lista } };
}

function accionLocalGuardar_(data, ctx) {
  var id = limpiarTexto_(data.id, 40);
  var nombre = limpiarTexto_(data.nombre, 60);
  if (!nombre) throw fallo_('Escriba el nombre del local.');
  var punto = puntoConfig_(data);
  var minimo = data.minimo_domicilio === '' || data.minimo_domicilio == null ? '' : Number(data.minimo_domicilio);
  if (minimo !== '' && !(minimo >= 0 && minimo <= 10000)) throw fallo_('Pedido mínimo no válido.');
  var cambios = {
    nombre: nombre,
    lat: punto.lat, lng: punto.lng, minimo_domicilio: minimo,
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
      agregarFilas_('locales', [[id, cambios.nombre, cambios.direccion, cambios.telefono, cambios.activo, new Date(), ctx.sesion.usuario, punto.lat, punto.lng, false, '', minimo]]);
      bitacora_(ctx.sesion, 'LOCALES', 'CREAR', nombre, ctx.dispositivo);
    }
  } finally {
    lock.releaseLock();
  }
  limpiarMenuCache_();
  return accionLocalesListar_({}, ctx);
}

function accionLocalPausar_(data, ctx) {
  var id = limpiarTexto_(data.id, 40), mensaje = limpiarTexto_(data.mensaje, 160);
  var lock = candado_(), nuevo;
  try {
    var l = leerTabla_('locales').filter(function (x) { return String(x.id) === id; })[0];
    if (!l) throw fallo_('Local no encontrado.');
    nuevo = l.pausado !== true;
    actualizarCampos_('locales', l._fila, l, { pausado: nuevo, mensaje_pausa: nuevo ? (mensaje || 'Hoy cerramos temprano. Escríbenos para consultar.') : '' });
    limpiarMenuCache_();
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'LOCALES', nuevo ? 'PAUSAR' : 'REANUDAR', id, ctx.dispositivo);
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
      agregarFilas_('usuarios', [[nuevoId_('USR'), usuario, nombre, rol, localId, hashClave2_(clave, sal), sal, activo, new Date(), '']]);
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
  if (!u || !claveCorrecta_(actual, u)) throw fallo_('La clave actual no es correcta.');
  return cambiarClave_(ctx.sesion.usuario_id, nueva, ctx, 'CAMBIAR_MI_CLAVE');
}

function cambiarClave_(id, clave, ctx, accion) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw fallo_('El sistema está ocupado. Intente en un momento.', 'OCUPADO');
  try {
    var u = leerTabla_('usuarios').filter(function (r) { return String(r.id) === id; })[0];
    if (!u) throw fallo_('Ese usuario ya no existe.', 'NO_EXISTE');
    var sal = Utilities.getUuid();
    actualizarCampos_('usuarios', u._fila, u, { hash: hashClave2_(clave, sal), sal: sal });
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

/* 3.1.7: teléfonos internacionales E.164, sin modificar los números guardados.
 * +1... conserva EE. UU.; 099... conserva Ecuador según el prefijo del negocio.
 * Acepta espacios y guiones; nunca convierte un + explícito al país del local. */
function normalizarTelefono_(v, pais) {
  var original = String(v == null ? '' : v).trim();
  if (!original) return '';
  if (!/^\+?[0-9\s().-]+$/.test(original)) throw fallo_('Número de teléfono no válido. Use solo números y, si desea, el signo + al principio.');
  var d = original.replace(/\D/g, '');
  pais = String(pais || '593').replace(/\D/g, '');
  if (!/^[1-9]\d{0,2}$/.test(pais)) throw fallo_('Código de país no válido.');
  if (original.charAt(0) === '+') {
    // En EE. UU. y Canadá se requieren 10 dígitos después del +1.
    if (!/^[1-9]\d{7,14}$/.test(d) || (d.charAt(0) === '1' && d.length !== 11)) throw fallo_('Número internacional no válido. Revise el código de país y el celular.');
    return '+' + d;
  }
  if (d.slice(0, 2) === '00') {
    d = d.slice(2);
    if (!/^[1-9]\d{7,14}$/.test(d) || (d.charAt(0) === '1' && d.length !== 11)) throw fallo_('Número internacional no válido.');
    return '+' + d;
  }
  // Números ya escritos con prefijo pero sin + (compatibilidad con Ecuador).
  if (d.indexOf(pais) === 0 && d.length > pais.length + 6) {
    if (d.length > 15 || (pais === '1' && d.length !== 11)) throw fallo_('Número de teléfono no válido.');
    return '+' + d;
  }
  if (d.charAt(0) === '0') d = d.slice(1);
  if (d.length < 7 || pais.length + d.length > 15 || (pais === '1' && d.length !== 10)) throw fallo_('Número de teléfono no válido. Revise el código de país.');
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
var FORMAS_PAGO = ['efectivo', 'transferencia', 'deuna'];
var TIPOS_ENTREGA = ['domicilio', 'retiro', 'mesa'];
function esDigital_(forma) { return String(forma) === 'transferencia' || String(forma) === 'deuna'; }

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
    extras: leerExtras_(p.extras_json), agotado: p.agotado === true, activo: p.activo === true,
    etiquetas: String(p.etiquetas || ''), sugerido: p.sugerido === true
  };
}

function pedidoSalida_(r, detalle) {
  var o = {};
  HOJAS.pedidos.forEach(function (c) {
    var v = r[c[0]];
    o[c[0]] = v instanceof Date ? (c[1] === 'f' ? Utilities.formatDate(v, zona_(leerConfig_()), 'yyyy-MM-dd') : v.toISOString()) : (c[1] === 'b' ? v === true : (c[1] === 'm' || c[1] === 'n') ? (v === '' ? '' : Number(v)) : String(v == null ? '' : v));
  });
  if (detalle) o.detalle = detalle;
  o.pide_codigo = String(r.codigo_entrega || '') !== 'NO'; // 3.1
  o.codigo_entrega = ''; // 3.1: solo lo ve el cliente (pedidoConsultar), nunca el personal
  o.tiene_foto = !!String(r.foto_entrega || ''); // 3.1.3: la foto se ve con fotoEntregaVer (privada)
  delete o.foto_entrega;
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
  if (guardado) { var g = JSON.parse(guardado); g.abierto = estaAbierto_(leerConfig_(), new Date()); return { ok: true, data: g }; }
  var cfg = leerConfig_();
  var pub = datosPublicos_();
  pub.datos_transferencia = cfg.datos_transferencia || '';
  pub.minutos_preparacion = numero_(cfg.minutos_preparacion) || 20;
  var locales = leerTabla_('locales').filter(function (l) { return l.activo === true; }).map(function (l) {
    return { id: String(l.id), nombre: String(l.nombre), direccion: String(l.direccion), telefono: String(l.telefono), lat: l.lat === '' ? '' : numero_(l.lat), lng: l.lng === '' ? '' : numero_(l.lng), pausado: l.pausado === true, mensaje_pausa: String(l.mensaje_pausa || ''), minimo_domicilio: l.minimo_domicilio === '' ? '' : redondear_(l.minimo_domicilio) };
  });
  var data = {
    config: pub,
    locales: locales,
    categorias: leerTabla_('categorias').filter(function (c) { return c.activo === true; }).map(function (c) {
      return { id: String(c.id), local_id: String(c.local_id), nombre: String(c.nombre), orden: numero_(c.orden) };
    }).sort(function (a, b) { return a.orden - b.orden; }),
    platos: leerTabla_('platos').filter(function (p) { return p.activo === true; }).map(platoPublico_),
    populares: masPedidos30_(),
    zonas: leerTabla_('zonas_envio').filter(function (z) { return z.activo === true; }).map(function (z) {
      return { id: String(z.id), local_id: String(z.local_id), nombre: String(z.nombre), costo: redondear_(z.costo), minutos: numero_(z.minutos), lat: z.lat === '' ? '' : numero_(z.lat), lng: z.lng === '' ? '' : numero_(z.lng), radio_km: numero_(z.radio_km), minimo_domicilio: z.minimo_domicilio === '' ? '' : redondear_(z.minimo_domicilio) };
    })
  };
  /* 3.1.3: platos sin insumos suficientes en cada local (agotado automático) */
  var ag = agotadosPorLocal_();
  data.platos.forEach(function (p) {
    var en = Object.keys(ag).filter(function (l) { return ag[l][p.id]; });
    if (en.length) p.agotado_locales = en;
  });
  var texto = JSON.stringify(data);
  if (texto.length < 90000) cache.put('MENU_PUBLICO', texto, 120);
  data.abierto = estaAbierto_(cfg, new Date());
  return { ok: true, data: data };
}

/* Platos más pedidos en los últimos 30 días, agregado por ID y cacheado 300 s. */
function masPedidos30_() {
  var cache = CacheService.getScriptCache(), k = 'POPULAR_30', g = cache.get(k);
  if (g) return JSON.parse(g);
  var desde = Date.now() - 30 * 86400000, mapa = {}, cnt = {};
  leerTabla_('pedidos').forEach(function (p) { if (p.creado instanceof Date && p.creado.getTime() >= desde && String(p.estado) !== 'Anulado') mapa[String(p.id)] = true; });
  leerTabla_('pedido_detalle').forEach(function (d) { if (mapa[String(d.pedido_id)]) cnt[String(d.plato_id)] = (cnt[String(d.plato_id)] || 0) + numero_(d.cantidad); });
  var lista = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 10);
  cache.put(k, JSON.stringify(lista), 300);
  return lista;
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
  // 3.0: tipo de entrega. Pedidos viejos (sin tipo): con zona = domicilio, sin zona = retiro.
  var tipo = limpiarTexto_(data.tipo_entrega, 20) || (zonaId ? 'domicilio' : 'retiro');
  if (TIPOS_ENTREGA.indexOf(tipo) < 0) throw fallo_('Elija cómo recibe su pedido.');
  if (tipo !== 'domicilio') zonaId = '';
  if (tipo === 'domicilio' && !zonaId) throw fallo_('Elija su zona de envío.');
  var mesa = tipo === 'mesa' ? limpiarTexto_(data.mesa, 10) : '';
  if (tipo === 'mesa') {
    var nMesas = numero_(cfg.mesas);
    if (!nMesas) throw fallo_('Este local no tiene pedidos en mesa.');
    if (mesa && !(/^\d{1,3}$/.test(mesa) && Number(mesa) >= 1 && Number(mesa) <= nMesas)) throw fallo_('Número de mesa no válido.');
  }
  var direccion = tipo === 'domicilio' ? limpiarTexto_(cli.direccion, 200) : '';
  var referencia = tipo === 'domicilio' ? limpiarTexto_(cli.referencia, 200) : '';
  var lat = tipo !== 'domicilio' || cli.lat === '' || cli.lat == null ? '' : Number(cli.lat);
  var lng = tipo !== 'domicilio' || cli.lng === '' || cli.lng == null ? '' : Number(cli.lng);
  if (lat !== '' && !(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) { lat = ''; lng = ''; }
  var enlaceUbic = tipo === 'domicilio' ? limpiarTexto_(cli.ubicacion_enlace, 400) : '';
  if (enlaceUbic && !/^https:\/\//.test(enlaceUbic)) enlaceUbic = '';
  var fuente = lat !== '' ? (limpiarTexto_(cli.ubicacion_fuente, 20) === 'enlace' ? 'enlace' : 'gps') : (enlaceUbic ? 'enlace' : '');
  if (tipo === 'domicilio' && !direccion && lat === '' && !enlaceUbic) throw fallo_('Escriba su dirección o use «Usar mi ubicación».');
  var forma = String(data.forma_pago || '');
  if (FORMAS_PAGO.indexOf(forma) < 0) throw fallo_('Elija la forma de pago.');
  if (forma === 'deuna' && !cfg.deuna_qr_url) throw fallo_('Este negocio aún no recibe pagos con Deuna. Elija otra forma de pago.');
  var propina = siNo_(cfg.propinas) && tipo === 'domicilio' ? redondear_(numero_(data.propina)) : 0;
  if (!(propina >= 0 && propina <= 50)) throw fallo_('Propina no válida.');
  var items = Array.isArray(data.items) ? data.items.slice(0, 60) : [];
  if (!items.length) throw fallo_('Su pedido está vacío.');
  var origen = limpiarTexto_(data.origen, 30).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  // 3.1: la pantalla nueva manda la aceptación del aviso de privacidad (la vieja no: se acepta igual).
  if (!ses && Object.prototype.hasOwnProperty.call(data, 'acepta_privacidad') && data.acepta_privacidad !== true) throw fallo_('Para enviar tu pedido, acepta el aviso de privacidad.', 'PRIVACIDAD');
  var aceptaPromos = data.acepta_promos === true;
  var dispId = limpiarTexto_(data.disp_id, 60).replace(/[^A-Za-z0-9_-]/g, '');

  // Horario: si está cerrado, solo se acepta un pedido programado para cuando abra.
  var ahora = new Date();
  var llegada = '';
  if (data.hora_llegada && !siNo_(cfg.permitir_programar)) throw fallo_('Este negocio no tiene pedidos programados activados.');
  if (data.hora_llegada) {
    llegada = horaDeHoy_(String(data.hora_llegada), cfg, ahora);
    if (!llegada) throw fallo_('Hora no válida.');
    if (llegada.getTime() < ahora.getTime() + 10 * 60000) throw fallo_('Elija una hora al menos 10 minutos más tarde.');
  }
  var abierto = estaAbierto_(cfg, llegada || ahora);
  if (!abierto.abierto && !(cfg.recibir_cerrado === 'SI' && !llegada)) throw fallo_(abierto.mensaje, 'CERRADO');

  // Freno contra pedidos en cadena (sin sesión): por teléfono y por dispositivo.
  var cache = CacheService.getScriptCache();
  var claveFreno = 'FRENO_' + telefono;
  var claveFrenoD = dispId ? 'FRENOD_' + dispId : '';

  var lock = candado_();
  var pedido, detalleFilas = [], creado = false;
  try {
    var pedidos = leerTabla_('pedidos');
    var repetido = pedidos.filter(function (p) { return String(p.op_id) === opId; })[0];
    if (repetido) return { ok: true, data: { pedido: pedidoSalida_(repetido), repetido: true } };
    if (!ses && Number(cache.get(claveFreno) || 0) >= 6) throw fallo_('Recibimos varios pedidos seguidos de este número. Espere unos minutos o escríbanos por WhatsApp.', 'FRENO');
    if (!ses && claveFrenoD && Number(cache.get(claveFrenoD) || 0) >= 8) throw fallo_('Recibimos varios pedidos seguidos desde este teléfono. Espere unos minutos o escríbanos por WhatsApp.', 'FRENO');

    var local = leerTabla_('locales').filter(function (l) { return String(l.id) === localId && l.activo === true; })[0];
    if (!local) throw fallo_('Elija un local disponible.');
    if (local.pausado === true && (!ses || data.canal === 'cliente')) throw fallo_(String(local.mensaje_pausa || 'Este local pausó los pedidos. Vuelve pronto.'), 'PAUSADO');
    if (ses && ses.rol !== 'dueno' && ses.local_id !== localId) throw fallo_('Solo puede tomar pedidos de su local.', 'PERMISO');

    var platos = {};
    leerTabla_('platos').forEach(function (p) { platos[String(p.id)] = p; });
    var sinInsumos = (!ses || data.canal === 'cliente') ? (agotadosPorLocal_()[localId] || {}) : {}; // 3.1.3: agotado automático por inventario
    var subtotal = 0, masCaro = 0;
    items.forEach(function (it) {
      var p = platos[String(it.plato_id)];
      var cant = Math.floor(numero_(it.cantidad));
      if (!p || p.activo !== true || (String(p.local_id) !== 'TODOS' && String(p.local_id) !== localId)) throw fallo_('Un plato de su pedido ya no está disponible. Revise su pedido.', 'PLATO');
      if (p.agotado === true || sinInsumos[String(p.id)]) throw fallo_('«' + p.nombre + '» se agotó. Quítelo de su pedido.', 'AGOTADO');
      if (!(cant >= 1 && cant <= 50)) throw fallo_('Cantidad no válida en «' + p.nombre + '».');
      var extrasDisp = leerExtras_(p.extras_json);
      var elegidos = (Array.isArray(it.extras) ? it.extras : []).map(function (n) { return claveComparar_(n); });
      var extras = extrasDisp.filter(function (x) { return elegidos.indexOf(claveComparar_(x.nombre)) >= 0; });
      var unitario = redondear_(numero_(p.precio) + extras.reduce(function (s, x) { return s + x.precio; }, 0));
      var totalLinea = redondear_(unitario * cant);
      subtotal = redondear_(subtotal + totalLinea);
      masCaro = Math.max(masCaro, unitario);
      detalleFilas.push({ plato_id: String(p.id), nombre: String(p.nombre), precio: unitario, cantidad: cant, extras: extras.map(function (x) { return x.nombre; }).join(', '), total_linea: totalLinea });
    });

    var envio = 0, minutos = 0, zona = null;
    if (zonaId) {
      zona = leerTabla_('zonas_envio').filter(function (z) { return String(z.id) === zonaId && z.activo === true; })[0];
      if (!zona || (String(zona.local_id) !== 'TODOS' && String(zona.local_id) !== localId)) throw fallo_('Elija una zona de envío disponible.');
      envio = redondear_(zona.costo);
      minutos = numero_(zona.minutos);
    }

    var distancia = tipo === 'domicilio' && tienePunto_(local) && lat !== '' && lng !== '' ? distanciaKm_(local, { lat: lat, lng: lng }) : '';
    if (distancia !== '' && numero_(cfg.cobertura_km) > 0 && distancia > numero_(cfg.cobertura_km) && cfg.cobertura_modo === 'bloquear') throw fallo_('La dirección indicada está fuera de la cobertura. Puede cambiarla o elegir Retiro.', 'COBERTURA');
    // Los mínimos de pedido se comunican, sin impedir la venta.
    var descuento = 0, cuponFila = null, codigo = limpiarTexto_(data.cupon, 30).toUpperCase();
    if (codigo) {
      var cupValidado = validarCupon316_(codigo, localId, telefono, subtotal, pedidos);
      cuponFila = cupValidado.fila;
      descuento = cupValidado.descuento;
    }

    // Cliente: uno por teléfono (no se repite).
    var clientes = leerTabla_('clientes');
    var cFila = clientes.filter(function (c) { return String(c.telefono) === telefono; })[0];

    // Premio de fidelidad: con los sellos completos, descuento sobre el plato más caro.
    var premio = 0, nSellos = numero_(cfg.fidelidad_sellos);
    if (nSellos > 0 && cFila && numero_(cFila.sellos) >= nSellos && data.usar_premio !== false) {
      premio = redondear_(Math.min(masCaro * numero_(cfg.fidelidad_descuento) / 100, subtotal - descuento));
    }
    var total = redondear_(subtotal + envio - descuento - premio + propina);
    var pctIva = numero_(cfg.iva_porcentaje);
    var gravado = redondear_(total - propina);
    var baseIva = siNo_(cfg.precios_incluyen_iva) ? redondear_(gravado / (1 + pctIva / 100)) : gravado;
    var iva = siNo_(cfg.precios_incluyen_iva) ? redondear_(gravado - baseIva) : redondear_(gravado * pctIva / 100);
    if (!siNo_(cfg.precios_incluyen_iva)) total = redondear_(total + iva);
    /* 3.1.3: efectivo solo si el dueño lo permite y hasta su monto máximo (el personal sí puede registrar efectivo) */
    var efectivoCliente = !!(cFila && cFila.efectivo_ok === true); // 3.1.5: el dueño autorizó a este cliente a pagar en efectivo
    if (forma === 'efectivo' && (!ses || data.canal === 'cliente') && !efectivoCliente) {
      if (String(cfg.efectivo_permitido) === 'NO') throw fallo_('Este local no recibe efectivo. Elige transferencia' + (cfg.deuna_qr_url ? ' o Deuna.' : '.'), 'EFECTIVO');
      var maxEf = numero_(cfg.efectivo_maximo);
      if (maxEf > 0 && total > maxEf) throw fallo_('En efectivo se aceptan pedidos de hasta ' + UI_dinero_(maxEf) + '. Elige transferencia' + (cfg.deuna_qr_url ? ' o Deuna.' : '.'), 'EFECTIVO');
    }

    // Número correlativo: el mayor que exista + 1 (bajo candado: nunca se repite).
    var mayor = 0;
    pedidos.forEach(function (p) { var m = /^PED-(\d+)$/.exec(String(p.numero)); if (m) mayor = Math.max(mayor, Number(m[1])); });
    var numero = 'PED-' + ('000' + (mayor + 1)).slice(-Math.max(4, String(mayor + 1).length));
    var id = nuevoId_('PED');
    var base = llegada && llegada.getTime() > ahora.getTime() ? llegada : ahora;
    var horaEst = !abierto.abierto && !llegada ? '' : (llegada || new Date(base.getTime() + (numero_(cfg.minutos_preparacion) + minutos) * 60000));

    var clienteId, nuevo = !cFila || numero_(cFila.entregados) + numero_(cFila.pedidos) === 0;
    if (cFila) {
      clienteId = String(cFila.id);
      // 3.0: si el nombre no coincide, NO se pisa la ficha (alguien pudo escribir un número ajeno).
      var mismo = claveComparar_(cFila.nombre) === claveComparar_(nombre) || !String(cFila.nombre);
      var cambiosCli = { pedidos: numero_(cFila.pedidos) + 1, ultimo_pedido: ahora };
      if (mismo) {
        cambiosCli.nombre = nombre;
        if (direccion) { cambiosCli.direccion = direccion; cambiosCli.referencia = referencia; }
        if (lat !== '') { cambiosCli.lat = lat; cambiosCli.lng = lng; }
      }
      if (premio) cambiosCli.sellos = Math.max(0, numero_(cFila.sellos) - nSellos);
      if (aceptaPromos && cFila.acepta_promos !== true) cambiosCli.acepta_promos = true;
      actualizarCampos_('clientes', cFila._fila, cFila, cambiosCli);
    } else {
      clienteId = nuevoId_('CLI');
      agregarFilas_('clientes', [[clienteId, telefono, nombre, direccion, referencia, lat, lng, 1, 0, ahora, ahora, 0, 0, aceptaPromos, false, false, nuevaClaveSeguimiento_() + nuevaClaveSeguimiento_()]]);
    }

    var fila = [id, numero, opId, localId, fechaDia_(diaTrabajo_(ahora, cfg), cfg), clienteId, nombre, telefono, direccion, referencia, lat, lng, zonaId, forma,
      subtotal, envio, descuento, total, codigo, 'Recibido', '', ahora, '', '', '', '', '', ses ? ses.usuario : 'cliente',
      horaEst, enlaceUbic, limpiarTexto_(data.notas, 300), '', '', '', '', '', false, '', false,
      tipo, mesa, llegada || '', origen, propina, baseIva, iva, fuente, nuevo, '', '', premio, dispId,
      ses && data.canal !== 'cliente' ? 'NO' : '', '', nuevaClaveSeguimiento_(), esDigital_(forma) ? limpiarTexto_(data.cuenta_pago, 80) : '', '',
      distancia, llegada ? new Date(llegada.getTime() + numero_(cfg.ventana_minutos) * 60000) : '', '', '']; // 3.1: pedido tomado por el personal (teléfono/mostrador): sin código. 3.1.1: si se hizo desde la página del cliente, sí lleva código
    agregarFilas_('pedidos', [fila]);
    agregarFilas_('pedido_detalle', detalleFilas.map(function (d) { return [nuevoId_('DET'), id, d.plato_id, d.nombre, d.precio, d.cantidad, d.extras, d.total_linea]; }));
    if (cuponFila) actualizarCampos_('cupones', cuponFila._fila, cuponFila, { usos: numero_(cuponFila.usos) + 1 });
    CacheService.getScriptCache().remove('POPULAR_30');

    var descontado = descontarInventario_(id, numero, localId, detalleFilas, 1, ses ? ses.usuario : 'cliente');
    if (descontado) {
      limpiarMenuCache_(); // 3.1.3
      var recien = leerTabla_('pedidos').filter(function (p) { return String(p.id) === id; })[0];
      actualizarCampos_('pedidos', recien._fila, recien, { inventario_descontado: true });
    }
    pedido = leerTabla_('pedidos').filter(function (p) { return String(p.id) === id; })[0];
    creado = true;
  } finally {
    lock.releaseLock();
  }
  if (creado && !ses) {
    cache.put(claveFreno, String(Number(cache.get(claveFreno) || 0) + 1), 600);
    if (claveFrenoD) cache.put(claveFrenoD, String(Number(cache.get(claveFrenoD) || 0) + 1), 600);
  }
  cache.put('ULTIMO_PEDIDO', String(Date.now()), 21600);
  bitacora_(ses || { usuario: 'cliente', rol: '', local_id: localId }, 'PEDIDOS', 'CREAR', pedido.numero + ' · ' + UI_dinero_(pedido.total), ctx.dispositivo);
  return { ok: true, data: { pedido: pedidoSalida_(pedido, detalleFilas), repetido: false } };
}

function UI_dinero_(n) { return (leerConfig_().moneda || 'USD') + ' ' + redondear_(n).toFixed(2); }

/* Seguimiento del cliente: número + teléfono (sin listas, sin datos ajenos). */
/* Consulta idempotente previa al reintento: solo devuelve el pedido del mismo teléfono. */
function accionPedidoRecuperar_(data) {
  if (!estaInstalado_()) throw fallo_('El sistema aún no está instalado.', 'NO_INSTALADO');
  var opId = limpiarTexto_(data.op_id, 80);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(opId)) throw fallo_('Código de envío no válido.');
  var tel = normalizarTelefono_(data.telefono, leerConfig_().pais_codigo);
  if (!tel) throw fallo_('Número de celular no válido.');
  var p = leerTabla_('pedidos').filter(function (x) {
    return String(x.op_id) === opId && String(x.telefono) === tel;
  })[0];
  if (!p) return { ok: true, data: { encontrado: false } };
  return { ok: true, data: { encontrado: true, pedido: pedidoSalida_(p) } };
}

function accionPedidoConsultar_(data) {
  if (!estaInstalado_()) throw fallo_('El sistema aún no está instalado.', 'NO_INSTALADO');
  var p;
  /* 3.1.3: enlace propio del pedido (PED-0006-k7x9q2): abre el seguimiento en cualquier teléfono, sin escribir nada */
  var sg = /^(PED-\d{4,})-([a-z0-9]{6,12})$/i.exec(limpiarTexto_(data.s, 40));
  if (sg) {
    p = leerTabla_('pedidos').filter(function (x) { return String(x.numero) === sg[1].toUpperCase() && String(x.clave_seguimiento || '') === sg[2].toLowerCase(); })[0];
    if (!p) throw fallo_('Este enlace no es válido o ya venció. Escríbenos por WhatsApp.', 'NO_EXISTE');
  } else {
    var numero = limpiarTexto_(data.numero, 20).toUpperCase();
    var tel = normalizarTelefono_(data.telefono, leerConfig_().pais_codigo);
    p = leerTabla_('pedidos').filter(function (x) { return String(x.numero) === numero && String(x.telefono) === tel; })[0];
    if (!p) throw fallo_('No encontramos ese pedido con ese número de celular.', 'NO_EXISTE');
  }
  var cfgC = leerConfig_();
  /* 3.1.1: pedido que salió «En camino» antes de actualizar el script: se le crea su código ahora. */
  if (String(p.estado) === 'En camino' && siNo_(cfgC.codigo_entrega) && !String(p.codigo_entrega || '')) {
    var nuevoCod = nuevoCodigoEntrega_();
    actualizarCampos_('pedidos', p._fila, p, { codigo_entrega: nuevoCod });
    p.codigo_entrega = nuevoCod;
  }
  var cli = leerTabla_('clientes').filter(function (c) { return String(c.id) === String(p.cliente_id); })[0];
  return { ok: true, data: { numero: String(p.numero), seguimiento: String(p.clave_seguimiento || '') ? String(p.numero) + '-' + String(p.clave_seguimiento) : '', estado: String(p.estado), creado: iso_(p.creado),
    forma_pago: String(p.forma_pago), pago_verificado: p.pago_verificado === true, cuenta_pago: String(p.cuenta_pago || ''), /* 3.1.5 */
    preparando: iso_(p.preparando), en_camino: iso_(p.en_camino), entregado: iso_(p.entregado), hora_estimada: iso_(p.hora_estimada), total: redondear_(p.total),
    tipo_entrega: tipoEntrega_(p), mesa: String(p.mesa || ''), calificacion: numero_(p.calificacion) || '', motivo_anulacion: String(p.estado) === 'Anulado' ? String(p.motivo_anulacion) : '',
    sellos: cli ? numero_(cli.sellos) : 0, sellos_meta: numero_(cfgC.fidelidad_sellos),
    tiempo_preparacion: numero_(cfgC.minutos_preparacion) || 20,
    tiempo_zona: numero_((leerTabla_('zonas_envio').filter(function (z) { return String(z.id) === String(p.zona_id); })[0] || {}).minutos),
    ventana_fin: iso_(p.hora_ventana_fin),
    eta_moto: etaMoto316_(p, cfgC),
    /* 3.1: tarjeta del motorizado y código de entrega — solo mientras va en camino */
    motorizado: String(p.estado) === 'En camino' ? tarjetaMotorizado_(p) : null,
    codigo_entrega: String(p.estado) === 'En camino' && siNo_(cfgC.codigo_entrega) && String(p.codigo_entrega || '') !== 'NO' ? String(p.codigo_entrega || '') : '' } };
}

/* ETA aproximado: último punto GPS del motorizado de ESTE pedido, sin mostrar las coordenadas. */
function etaMoto316_(p, cfg) {
  if (String(p.estado) !== 'En camino' || !tienePunto_(p)) return null;
  var puntos = leerTabla_('rastreo').filter(function (r) { return String(r.pedido_id) === String(p.id) && String(r.motorizado_id) === String(p.motorizado_id) && tienePunto_(r) && p.en_camino instanceof Date && r.fecha instanceof Date && r.fecha >= p.en_camino; });
  var ultimo = puntos.length ? puntos[puntos.length - 1] : null;
  if (!ultimo && p.sali_lat !== '' && p.sali_lng !== '') ultimo = { lat: p.sali_lat, lng: p.sali_lng };
  if (!ultimo) return null;
  var n = distanciaKm_(ultimo, p) * 1.4 / Math.max(5, numero_(cfg.velocidad_moto_kmh) || 20) * 60;
  return { desde: Math.max(2, Math.floor(n * 0.85)), hasta: Math.max(6, Math.ceil(n * 1.35 + 3)) };
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
      return { id: String(z.id), local_id: String(z.local_id), nombre: String(z.nombre), costo: redondear_(z.costo), minutos: numero_(z.minutos), activo: z.activo === true, lat: z.lat === '' ? '' : numero_(z.lat), lng: z.lng === '' ? '' : numero_(z.lng), radio_km: numero_(z.radio_km), minimo_domicilio: z.minimo_domicilio === '' ? '' : redondear_(z.minimo_domicilio) };
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

function accionPlatoGuardarBase_(data, ctx) {
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
    foto_url: enlaceImagen_(data.foto_url), extras_json: JSON.stringify(extras), agotado: data.agotado === true, activo: data.activo !== false,
    etiquetas: limpiarEtiquetas_(data.etiquetas), sugerido: data.sugerido === true
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
      agregarFilas_('platos', [[nuevoId_('PLA'), localId, catId, nombre, cambios.descripcion, cambios.precio, cambios.foto_url, cambios.extras_json, cambios.agotado, cambios.activo, new Date(), cambios.etiquetas, cambios.sugerido]]);
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
  /* 3.1.2: las carpetas de fotos se crean junto a la hoja «Pedidos» (si no se puede, en Mi unidad). */
  var padre = null;
  try { var ps = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents(); if (ps.hasNext()) padre = ps.next(); } catch (e) { padre = null; }
  var carpeta = padre ? padre.createFolder(nombre) : DriveApp.createFolder(nombre);
  props.setProperty(clave, carpeta.getId());
  return carpeta;
}

function guardarFoto_(base64, nombreArchivo, carpeta, publica) {
  var m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(base64 || ''));
  if (!m) throw fallo_('La foto no es válida (use JPG o PNG).');
  if (m[3].length > 2800000) throw fallo_('La foto es muy grande. Use una más liviana.');
  var blob = Utilities.newBlob(Utilities.base64Decode(m[3]), m[1], nombreArchivo + '.' + (m[2] === 'jpeg' ? 'jpg' : m[2]));
  var f;
  try { f = carpetaFotos_(carpeta).createFile(blob); }
  catch (e) { // 3.1.2: se muestra el motivo real que da Google (y queda en la bitácora)
    var motivo = String(e && e.message || e).slice(0, 220);
    bitacora_({ usuario: 'sistema', rol: '', local_id: '' }, 'FOTOS', 'ERROR_DRIVE', carpeta + ': ' + motivo, '');
    throw fallo_('No se pudo guardar la foto. Intente más tarde.', 'FOTO'); // el motivo técnico queda solo en la bitácora
  }
  if (publica) {
    try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { console.error('compartir foto: ' + e); }
    return 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w800';
  }
  return f.getUrl();
}

function accionFotoSubir_(data, ctx) {
  var moto = data.tipo === 'motorizado'; // 3.1: fotos de motorizados en su propia carpeta
  var url = guardarFoto_(data.foto, (moto ? 'motorizado-' : 'plato-') + Utilities.formatDate(new Date(), zona_(leerConfig_()), 'yyyyMMdd-HHmmss'), moto ? 'Fotos de motorizados' : 'Fotos del menú', true);
  bitacora_(ctx.sesion, 'MENU', 'SUBIR_FOTO', '', ctx.dispositivo);
  return { ok: true, data: { url: url } };
}

function accionZonaGuardar_(data, ctx) {
  var id = limpiarTexto_(data.id, 40), nombre = limpiarTexto_(data.nombre, 60), localId = limpiarTexto_(data.local_id, 40) || 'TODOS';
  var costo = Number(data.costo), minutos = Math.round(Number(data.minutos || 0));
  if (!nombre) throw fallo_('Escriba el nombre de la zona.');
  if (!(costo >= 0 && costo <= 500)) throw fallo_('Costo de envío no válido.');
  if (!(minutos >= 0 && minutos <= 300)) throw fallo_('Minutos no válidos.');
  var punto = puntoConfig_(data), radio = data.radio_km === '' || data.radio_km == null ? 0 : Number(data.radio_km);
  var minimo = data.minimo_domicilio === '' || data.minimo_domicilio == null ? '' : Number(data.minimo_domicilio);
  if (!(radio >= 0 && radio <= 1000)) throw fallo_('Radio no válido (0 a 1000 km).');
  if (minimo !== '' && !(minimo >= 0 && minimo <= 10000)) throw fallo_('Pedido mínimo no válido.');
  var cambios = { nombre: nombre, local_id: localId, costo: redondear_(costo), minutos: minutos, activo: data.activo !== false, lat: punto.lat, lng: punto.lng, radio_km: radio, minimo_domicilio: minimo };
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
      agregarFilas_('zonas_envio', [[nuevoId_('ZON'), localId, nombre, cambios.costo, minutos, cambios.activo, new Date(), punto.lat, punto.lng, radio, minimo]]);
      bitacora_(ctx.sesion, 'MENU', 'CREAR_ZONA', nombre, ctx.dispositivo);
    }
    limpiarMenuCache_();
  } finally { lock.releaseLock(); }
  return accionMenuListar_({ local_id: 'TODOS' }, ctx);
}

function accionCuponesListar_() {
  var cfg = leerConfig_();
  return { ok: true, data: { cupones: leerTabla_('cupones').map(function (c) {
    return { id: String(c.id), codigo: String(c.codigo), tipo: String(c.tipo), valor: numero_(c.valor), vence: c.vence instanceof Date ? ymd_(c.vence, cfg) : '', usos_max: numero_(c.usos_max), usos: numero_(c.usos), activo: c.activo === true, local_id: String(c.local_id || 'TODOS'), un_uso_cliente: c.un_uso_cliente === true, compra_minima: numero_(c.compra_minima) };
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
  var localId = limpiarTexto_(data.local_id, 40) || 'TODOS', compraMin = Number(data.compra_minima || 0);
  if (!(compraMin >= 0 && compraMin <= 10000)) throw fallo_('Compra mínima no válida.');
  var cambios = { codigo: codigo, tipo: tipo, valor: valor, vence: vence ? fechaDia_(vence) : '', usos_max: usosMax, activo: data.activo !== false, local_id: localId, un_uso_cliente: data.un_uso_cliente === true, compra_minima: redondear_(compraMin) };
  var lock = candado_();
  try {
    validarLocalOTodos_(localId);
    var filas = leerTabla_('cupones');
    var rep = filas.filter(function (r) { return String(r.id) !== id && claveComparar_(r.codigo) === claveComparar_(codigo); })[0];
    if (rep) throw fallo_('El cupón «' + codigo + '» ya existe.', 'DUPLICADO');
    if (id) {
      var actual = filas.filter(function (r) { return String(r.id) === id; })[0];
      if (!actual) throw fallo_('Ese cupón ya no existe.', 'NO_EXISTE');
      if (actualizarCampos_('cupones', actual._fila, actual, cambios)) bitacora_(ctx.sesion, 'MENU', 'EDITAR_CUPON', codigo, ctx.dispositivo);
    } else {
      agregarFilas_('cupones', [[nuevoId_('CUP'), codigo, tipo, valor, cambios.vence, usosMax, 0, cambios.activo, new Date(), localId, cambios.un_uso_cliente, cambios.compra_minima]]);
      bitacora_(ctx.sesion, 'MENU', 'CREAR_CUPON', codigo, ctx.dispositivo);
    }
  } finally { lock.releaseLock(); }
  return accionCuponesListar_();
}

/* Validación única del cupón: consulta pública y creación usan las mismas reglas. */
function validarCupon316_(codigo, localId, telefono, subtotal, pedidos) {
  if (!codigo) return { descuento: 0, fila: null };
  var c = leerTabla_('cupones').filter(function (x) { return claveComparar_(x.codigo) === claveComparar_(codigo); })[0];
  var hoy = Utilities.formatDate(new Date(), zona_(leerConfig_()), 'yyyy-MM-dd');
  if (!c || c.activo !== true) throw fallo_('Ese cupón no está disponible.', 'CUPON');
  if (c.vence instanceof Date && ymd_(c.vence, leerConfig_()) < hoy) throw fallo_('Este cupón ya venció.', 'CUPON');
  if (numero_(c.usos_max) > 0 && numero_(c.usos) >= numero_(c.usos_max)) throw fallo_('Este cupón alcanzó el máximo de usos.', 'CUPON');
  if (String(c.local_id || 'TODOS') !== 'TODOS' && String(c.local_id) !== localId) throw fallo_('Este cupón es para otro local.', 'CUPON');
  if (subtotal < numero_(c.compra_minima)) throw fallo_('Este cupón es para compras desde ' + UI_dinero_(c.compra_minima) + '.', 'CUPON');
  if (c.un_uso_cliente === true && telefono && pedidos.some(function (p) { return String(p.telefono) === telefono && claveComparar_(p.cupon) === claveComparar_(codigo) && String(p.estado) !== 'Anulado'; })) throw fallo_('Este cupón ya se utilizó con ese número.', 'CUPON');
  var d = String(c.tipo) === 'porcentaje' ? redondear_(subtotal * numero_(c.valor) / 100) : redondear_(c.valor);
  return { descuento: Math.min(subtotal, d), fila: c };
}
function accionCuponValidar_(data) {
  var localId = limpiarTexto_(data.local_id, 40), codigo = limpiarTexto_(data.cupon, 30).toUpperCase();
  if (!codigo) throw fallo_('Escriba un cupón.', 'CUPON');
  var tel = data.telefono ? normalizarTelefono_(data.telefono, leerConfig_().pais_codigo) : '';
  var productos = {}; leerTabla_('platos').forEach(function (p) { productos[String(p.id)] = p; });
  var subtotal = 0;
  (Array.isArray(data.items) ? data.items : []).slice(0, 60).forEach(function (it) {
    var p = productos[String(it.plato_id)], n = Math.floor(numero_(it.cantidad));
    if (!p || p.activo !== true || !(n >= 1 && n <= 50) || (String(p.local_id) !== 'TODOS' && String(p.local_id) !== localId)) throw fallo_('Revise los platos del carrito.', 'PLATO');
    var extras = (Array.isArray(it.extras) ? it.extras : []).map(claveComparar_);
    var extra = leerExtras_(p.extras_json).filter(function (x) { return extras.indexOf(claveComparar_(x.nombre)) >= 0; }).reduce(function (s, x) { return s + x.precio; }, 0);
    subtotal = redondear_(subtotal + redondear_((numero_(p.precio) + extra) * n));
  });
  if (!subtotal) throw fallo_('Agregue platos antes de aplicar un cupón.', 'CUPON');
  var r = validarCupon316_(codigo, localId, tel, subtotal, leerTabla_('pedidos'));
  return { ok: true, data: { codigo: codigo, descuento: r.descuento, subtotal: subtotal } };
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
  limpiarMenuCache_(); // 3.1.3
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
    return { id: String(c.id), telefono: String(c.telefono), nombre: String(c.nombre), direccion: String(c.direccion), pedidos: numero_(c.pedidos), total_gastado: redondear_(c.total_gastado), ultimo_pedido: iso_(ult), inactivo: !!ult && ult.getTime() < hace30,
      acepta_promos: c.acepta_promos === true, anonimizado: c.anonimizado === true, efectivo_ok: c.efectivo_ok === true }; // 3.1 · 3.1.5
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
    // Abiertos: siempre visibles; entregados: por fecha REAL de entrega; anulados: conservan día contable.
    if (abierto) return true;
    if (String(p.estado) === 'Entregado') return fechaCalendario_(p.entregado, cfg) === dia || (!p.entregado && d === dia);
    return d === dia;
  });
  /* 3.1.3: pedidos de antes de la 3.1.3 reciben su clave de seguimiento la primera vez que se listan */
  var sinClave = lista.filter(function (p) { return !String(p.clave_seguimiento || ''); });
  if (sinClave.length) {
    var lockC = LockService.getScriptLock();
    if (lockC.tryLock(5000)) {
      try { sinClave.forEach(function (p) { var c = nuevaClaveSeguimiento_(); actualizarCampos_('pedidos', p._fila, p, { clave_seguimiento: c }); p.clave_seguimiento = c; }); }
      finally { lockC.releaseLock(); }
    }
  }
  var det = detallePorPedido_(lista.map(function (p) { return String(p.id); }));
  var motos = {};
  leerTabla_('motorizados').forEach(function (m) { motos[String(m.id)] = motoCorto_(m); });
  /* 3.1.5: clave del enlace «Mis pedidos» de cada cliente (para los mensajes de WhatsApp) */
  var clis = {}, idsCli = {};
  lista.forEach(function (p) { idsCli[String(p.cliente_id)] = true; });
  var filasCli = leerTabla_('clientes').filter(function (c) { return idsCli[String(c.id)] && c.anonimizado !== true; });
  if (filasCli.some(function (c) { return !String(c.clave_cliente || ''); })) {
    var lockK = LockService.getScriptLock();
    if (lockK.tryLock(5000)) { try { filasCli.forEach(function (c) { claveCliente_(c); }); } finally { lockK.releaseLock(); } }
  }
  filasCli.forEach(function (c) { clis[String(c.id)] = String(c.clave_cliente || ''); });
  return { ok: true, data: {
    dia: dia, hoy: fechaCalendario_(new Date(), cfg), ahora: new Date().toISOString(), minutos_atraso: numero_(cfg.minutos_atraso) || 45, minutos_alerta_pedido: numero_(cfg.minutos_alerta_pedido) || 15,
    pedidos: lista.map(function (p) {
      var o = pedidoSalida_(p, det[String(p.id)] || []);
      o.motorizado = motos[o.motorizado_id] || null;
      o.cliente_clave = clis[String(p.cliente_id)] || ''; // 3.1.5
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
    if (a === 'En camino' || (a === 'Entregado' && String(p.estado) === 'Preparando')) exigirPagoVerificado_(p);
    if (a === 'Preparando' && siNo_(leerConfig_().verificar_antes_preparar)) exigirPagoVerificado_(p, true); // 3.1.5
    var cambios = { estado: a };
    if (a === 'En camino' && !String(p.codigo_entrega || '')) cambios.codigo_entrega = nuevoCodigoEntrega_();
    cambios[{ 'Preparando': 'preparando', 'En camino': 'en_camino', 'Entregado': 'entregado' }[a]] = new Date();
    actualizarCampos_('pedidos', p._fila, p, cambios);
    if (a === 'Entregado') sumarEntregaCliente_(p, 1);
    p = buscarPedido_(data.id, ctx);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'PEDIDOS', 'ESTADO', p.numero + ' → ' + a, ctx.dispositivo);
  return { ok: true, data: { pedido: pedidoSalida_(p) } };
}

function accionPedidoAsignar_(data, ctx) {
  exigirTurnoAbierto_(data.motorizado_id); // 3.1 (solo si el dueño lo activó)
  var motivoCambio = limpiarTexto_(data.motivo, 200);
  var motoId = limpiarTexto_(data.motorizado_id, 40);
  var lock = candado_();
  var p, m;
  try {
    p = buscarPedido_(data.id, ctx);
    if (['Recibido', 'Preparando', 'En camino'].indexOf(String(p.estado)) < 0) throw fallo_('Este pedido ya no admite cambio de motorizado.');
    if (String(p.estado) === 'En camino' && motivoCambio.length < 3) throw fallo_('Escriba el motivo del cambio de motorizado.');
    if (!p.zona_id) throw fallo_('Este pedido es para retirar en el local.');
    m = leerTabla_('motorizados').filter(function (x) { return String(x.id) === motoId; })[0];
    if (!m || m.activo !== true) throw fallo_('Ese motorizado no está activo.');
    if (m.local_id && String(m.local_id) !== 'TODOS' && String(m.local_id) !== String(p.local_id)) throw fallo_('Ese motorizado es de otro local.');
    if (String(p.motorizado_id) !== motoId) actualizarCampos_('pedidos', p._fila, p, { motorizado_id: motoId, incidencia_motivo: motivoCambio, ultima_senal: '', sali_lat: String(p.estado) === 'En camino' ? '' : p.sali_lat, sali_lng: String(p.estado) === 'En camino' ? '' : p.sali_lng });
    p = buscarPedido_(data.id, ctx);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'PEDIDOS', 'ASIGNAR', p.numero + ' → ' + m.nombre + (motivoCambio ? ' · Motivo: ' + motivoCambio : ''), ctx.dispositivo);
  return { ok: true, data: { pedido: pedidoSalida_(p) } };
}

/* Reingreso al local: conservamos repartidor y código; invalidamos salida y ETA previos. */
function accionPedidoRegresar_(data, ctx) {
  var motivo = limpiarTexto_(data.motivo, 200);
  if (motivo.length < 3) throw fallo_('Escriba el motivo del regreso.');
  var lock = candado_(), p;
  try {
    p = buscarPedido_(data.id, ctx);
    if (String(p.estado) !== 'En camino') throw fallo_('Solo un pedido En camino puede regresar al local.', 'CAMBIO');
    actualizarCampos_('pedidos', p._fila, p, { estado: 'Preparando', en_camino: '', sali_lat: '', sali_lng: '', ultima_senal: '', incidencia_motivo: motivo });
    p = buscarPedido_(data.id, ctx);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'PEDIDOS', 'REGRESO', p.numero + ' · ' + motivo, ctx.dispositivo);
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
    var eraEntregado = String(p.estado) === 'Entregado';
    actualizarCampos_('pedidos', p._fila, p, { estado: 'Anulado', anulado: new Date(), motivo_anulacion: motivo, anulado_por: ctx.sesion.usuario });
    var c = leerTabla_('clientes').filter(function (x) { return String(x.id) === String(p.cliente_id); })[0];
    if (c) actualizarCampos_('clientes', c._fila, c, { pedidos: Math.max(0, numero_(c.pedidos) - 1) });
    if (eraEntregado) sumarEntregaCliente_(p, -1);
    if (numero_(p.premio) > 0 && c) { var cc = leerTabla_('clientes').filter(function (x) { return String(x.id) === String(p.cliente_id); })[0]; actualizarCampos_('clientes', cc._fila, cc, { sellos: numero_(cc.sellos) + numero_(leerConfig_().fidelidad_sellos) }); }
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
  CacheService.getScriptCache().remove('POPULAR_30');
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
    var punto = enlace ? coordenadasDeEnlace_(enlace) : null;
    var cambiosU = { ubicacion_enlace: enlace, ubicacion_fuente: enlace ? 'whatsapp' : (p.lat !== '' ? 'gps' : '') };
    if (punto) { cambiosU.lat = punto.lat; cambiosU.lng = punto.lng; }
    actualizarCampos_('pedidos', p._fila, p, cambiosU);
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
    if (!esDigital_(p.forma_pago)) throw fallo_('Este pedido no es por transferencia ni Deuna.');
    actualizarCampos_('pedidos', p._fila, p, { pago_verificado: data.verificado !== false, pago_verificado_fecha: data.verificado !== false ? new Date() : '' }); // 3.1.5
    p = buscarPedido_(data.id, ctx);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'CAJA', data.verificado !== false ? 'TRANSFERENCIA_VERIFICADA' : 'TRANSFERENCIA_PENDIENTE', p.numero, ctx.dispositivo);
  return { ok: true, data: { pedido: pedidoSalida_(p) } };
}

/* ---------- 11.6 Motorizados y «Mis entregas» ---------- */

function motorizadoSalida_(m) {
  return { id: String(m.id), nombre: String(m.nombre), cedula: String(m.cedula), celular: String(m.celular), direccion: String(m.direccion), placa: String(m.placa), foto_url: String(m.foto_url), usuario_id: String(m.usuario_id), local_id: String(m.local_id || 'TODOS'), activo: m.activo === true,
    /* 3.1 */ color_moto: String(m.color_moto || ''), modelo_moto: String(m.modelo_moto || ''), licencia_vence: ymd_(m.licencia_vence), matricula_vence: ymd_(m.matricula_vence), forma_pago: String(m.forma_pago || ''), tarifa: m.tarifa === '' || m.tarifa == null ? '' : Number(m.tarifa) };
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
  var fotoAntes = '';
  if (id) { var ma = leerTabla_('motorizados').filter(function (x) { return String(x.id) === id; })[0]; fotoAntes = ma ? String(ma.foto_url || '') : ''; }
  if (fotoAntes && fotoAntes !== enlaceImagen_(data.foto_url)) botarFotoVieja_(fotoAntes, 'Fotos de motorizados'); // 3.1
  var cambios = { nombre: nombre, cedula: cedula, celular: celular, direccion: limpiarTexto_(data.direccion, 200), placa: placa, foto_url: enlaceImagen_(data.foto_url), usuario_id: usuarioId, activo: data.activo !== false, local_id: localId };
  /* 3.1: datos justos de la moto y del pago (solo los que vengan) */
  datosExtraMoto_(data, cambios);
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
      agregarFilas_('motorizados', [[nuevoId_('MOT'), nombre, cedula, celular, cambios.direccion, placa, cambios.foto_url, usuarioId, cambios.activo, new Date(), localId,
        cambios.color_moto || '', cambios.modelo_moto || '', cambios.licencia_vence || '', cambios.matricula_vence || '', cambios.forma_pago || '', cambios.tarifa === undefined ? '' : cambios.tarifa]]);
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
      efectivo += numero_(p.total) - numero_(p.propina); // la propina se la queda el motorizado
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
    return abierto || (String(p.estado) === 'Entregado' && fechaCalendario_(p.entregado, cfg) === fechaCalendario_(new Date(), cfg));
  });
  var det = detallePorPedido_(mios.map(function (p) { return String(p.id); }));
  var cajas = leerTabla_('caja').filter(function (c) { return String(c.estado) === 'abierta'; });
  var deuda = deudaMotorizado_(String(m.id), cajas, pedidos);
  return { ok: true, data: {
    motorizado: { id: String(m.id), nombre: String(m.nombre) },
    pedidos: mios.map(function (p) { return pedidoSalida_(p, det[String(p.id)] || []); }).sort(function (a, b) { return a.creado < b.creado ? -1 : 1; }),
    debe: { fondo: deuda.fondo, efectivo: deuda.efectivo, total: deuda.total },
    turno: turnoSalida_(turnoAbierto_(String(m.id))), // 3.1
    exigir_turno: siNo_(cfg.exigir_turno), codigo_entrega: siNo_(cfg.codigo_entrega)
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
    exigirPagoVerificado_(p);
    if (!String(p.codigo_entrega || '')) actualizarCampos_('pedidos', p._fila, p, { codigo_entrega: nuevoCodigoEntrega_() });
    p = buscarPedido_(data.id, null);
    actualizarCampos_('pedidos', p._fila, p, { estado: 'En camino', en_camino: new Date(), sali_lat: coord_(data.lat, -90, 90), sali_lng: coord_(data.lng, -180, 180), preparando: p.preparando instanceof Date ? p.preparando : new Date() });
    p = buscarPedido_(data.id, null);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'ENTREGAS', 'SALI', String(p.numero), ctx.dispositivo);
  return { ok: true, data: { pedido: pedidoSalida_(p) } };
}

function accionEntregaEntregado_(data, ctx) {
  var foto = '', avisoFoto = '';
  if (data.foto) {
    try { foto = guardarFoto_(data.foto, 'entrega-' + limpiarTexto_(data.id, 40), 'Fotos de entregas', false); }
    catch (ef) { avisoFoto = ef.message; } // 3.1.2: la foto es opcional: el pedido igual se marca entregado
  }
  var lock = candado_();
  var p;
  try {
    p = pedidoDeMotorizado_(data, ctx);
    if (String(p.estado) !== 'En camino') throw fallo_('Primero toque «Salí». Este pedido está «' + p.estado + '».', 'CAMBIO');
    exigirCodigoEntrega_(p, data.codigo);
    var cambios = { estado: 'Entregado', entregado: new Date(), entrega_lat: coord_(data.lat, -90, 90), entrega_lng: coord_(data.lng, -180, 180) };
    if (foto) cambios.foto_entrega = foto;
    actualizarCampos_('pedidos', p._fila, p, cambios);
    sumarEntregaCliente_(p, 1);
    p = buscarPedido_(data.id, null);
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'ENTREGAS', 'ENTREGADO', String(p.numero) + (avisoFoto ? ' (sin foto)' : ''), ctx.dispositivo);
  var rEnt = accionMisEntregas_({}, ctx);
  if (avisoFoto) rEnt.data.aviso_foto = avisoFoto;
  return rEnt;
}

/* ---------- 11.7 Reportes (dueño) — todo se calcula de los detalles ---------- */

function accionReportesBase_(data, ctx) {
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
    totales[esDigital_(p.forma_pago) ? 'transferencia' : 'efectivo'] += t;
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
  return { id: String(i.id), local_id: String(i.local_id), local: nombresLocal[String(i.local_id)] || '', nombre: String(i.nombre), unidad: String(i.unidad), stock: s, minimo: mn, bajo: i.activo === true && s <= mn, activo: i.activo === true,
    costo: i.costo === '' || i.costo == null ? '' : redondear_(i.costo), proveedor: String(i.proveedor || ''), proveedor_tel: String(i.proveedor_tel || '') }; // 3.1.3
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
  /* 3.1.3: costo por unidad y proveedor */
  var costo = data.costo === '' || data.costo == null ? '' : Number(data.costo);
  if (costo !== '' && !(costo >= 0 && costo <= 100000)) throw fallo_('Costo no válido.');
  var proveedor = limpiarTexto_(data.proveedor, 60);
  var provTel = data.proveedor_tel ? normalizarTelefono_(data.proveedor_tel, leerConfig_().pais_codigo) : '';
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
      if (actualizarCampos_('insumos', actual._fila, actual, { nombre: nombre, unidad: unidad, minimo: minimo, activo: data.activo !== false, costo: costo, proveedor: proveedor, proveedor_tel: provTel })) bitacora_(ctx.sesion, 'INVENTARIO', 'EDITAR_INSUMO', nombre, ctx.dispositivo);
    } else {
      var inicial = Number(data.stock || 0);
      if (!(inicial >= 0)) throw fallo_('Cantidad inicial no válida.');
      var nid = nuevoId_('INS'), ahora = new Date();
      agregarFilas_('insumos', [[nid, localId, nombre, unidad, inicial, minimo, data.activo !== false, ahora, costo, proveedor, provTel]]);
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
      else { otroId = nuevoId_('INS'); agregarFilas_('insumos', [[otroId, destino, ins.nombre, ins.unidad, cant, 0, true, ahora, ins.costo, ins.proveedor, ins.proveedor_tel]]); }
      movs.push([nuevoId_('MOV'), ahora, ins.local_id, ins.id, 'traspaso_salida', -cant, motivo, destino, u]);
      movs.push([nuevoId_('MOV'), ahora, destino, otroId, 'traspaso_entrada', cant, motivo, String(ins.local_id), u]);
    }
    actualizarCampos_('insumos', ins._fila, ins, { stock: stock });
    agregarFilas_('movimientos_inventario', movs);
    limpiarMenuCache_(); // 3.1.3: el plato vuelve a aparecer (o se agota) al instante
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
    if (esDigital_(p.forma_pago)) {
      if (p.pago_verificado === true) r.transferencias += numero_(p.total); else r.transferencias_pendientes += numero_(p.total);
      transf.push({ id: String(p.id), numero: String(p.numero), cliente: String(p.cliente_nombre), total: redondear_(p.total), verificado: p.pago_verificado === true, estado: String(p.estado), forma: String(p.forma_pago) });
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
    var avisos = avisosCierre_(c, cfg, res);
    if (avisos.length && data.confirmar !== true) throw fallo_(avisos.join(' '), 'CONFIRMAR');
    var dif = redondear_(contado - res.resumen.esperado);
    actualizarCampos_('caja', c._fila, c, { cierre: new Date(), esperado: res.resumen.esperado, contado: contado, diferencia: dif, cerrada_por: ctx.sesion.usuario, estado: 'cerrada' });
    res.resumen.contado = redondear_(contado);
    res.resumen.diferencia = dif;
  } finally { lock.releaseLock(); }
  var nombreLocal = (leerTabla_('locales').filter(function (l) { return String(l.id) === local; })[0] || {}).nombre || local;
  var r = res.resumen, mon = cfg.moneda || 'USD';
  function f(n) { return mon + ' ' + redondear_(n).toFixed(2); }
  var pedidosDia = leerTabla_('pedidos').filter(function (p) { return String(p.local_id) === local && ymd_(p.dia_trabajo, cfg) === ymd_(c.dia_trabajo, cfg); });
  var anulDia = pedidosDia.filter(function (p) { return String(p.estado) === 'Anulado'; }).length;
  var propDia = pedidosDia.filter(function (p) { return String(p.estado) !== 'Anulado'; }).reduce(function (sum, p) { return sum + numero_(p.propina); }, 0);
  var texto = '*Cierre de caja — ' + nombreLocal + '*\nDía: ' + ymd_(c.dia_trabajo, cfg) + '\nCerró: ' + ctx.sesion.nombre +
    '\n\nPedidos: ' + r.pedidos + ' · Anulados: ' + anulDia + ' · Propinas: ' + f(propDia) + ' · Ventas: ' + f(r.ventas) +
    '\nFondo inicial: ' + f(r.fondo) + '\nEfectivo de motorizados: ' + f(r.liquidado) + '\nEfectivo en el local: ' + f(r.efectivo_local) +
    '\nEntradas: ' + f(r.entradas) + '\nSalidas: ' + f(r.salidas) + '\nFondos a motorizados: ' + f(r.fondos_motorizado) +
    '\nTransferencias verificadas: ' + f(r.transferencias) + (r.transferencias_pendientes ? '\n⚠️ Transferencias sin verificar: ' + f(r.transferencias_pendientes) : '') +
    '\n\nDebía haber: ' + f(r.esperado) + '\nContado: ' + f(r.contado) + '\n*Diferencia: ' + f(r.diferencia) + '*';
  bitacora_(ctx.sesion, 'CAJA', 'CERRAR', nombreLocal + ' · dif ' + r.diferencia.toFixed(2), ctx.dispositivo);
  var out = accionCajaEstado_({ local_id: local }, ctx);
  out.data.cierre = { resumen: r, texto: texto, whatsapp_dueno: cfg.whatsapp_dueno || cfg.whatsapp || '' };
  return out;
}

/* ============================================================
 * 12. VERSIÓN 3.0 — tipos de entrega, IVA, propina, fidelidad,
 * horario, Deuna, verificación de pagos, ubicación pegada,
 * aviso de pedidos nuevos, menú de ejemplo, exportar y seguridad.
 * Todo lo nuevo está aquí; lo de antes solo se tocó lo mínimo.
 * ============================================================ */

/* ---------- 12.1 Claves más fuertes (1.000 vueltas) ---------- */
function hashClave2_(clave, sal) {
  var h = sal + '|' + clave;
  for (var i = 0; i < 1000; i++) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + '|' + i, Utilities.Charset.UTF_8);
    h = bytes.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
  }
  return 'v2$' + h;
}

/* Acepta la clave guardada nueva (v2$) o la de antes. */
function claveCorrecta_(clave, u) {
  var guardado = String(u.hash || '');
  if (guardado.indexOf('v2$') === 0) return hashClave2_(clave, String(u.sal)) === guardado;
  return hashClave_(clave, String(u.sal)) === guardado;
}

/* ---------- 12.2 Ayudas ---------- */
var ETIQUETAS = ['mas_vendido', 'nuevo', 'picante', 'vegetariano', 'para_compartir', 'promo'];
function limpiarEtiquetas_(v) {
  var lista = Array.isArray(v) ? v : String(v || '').split(',');
  return lista.map(function (x) { return String(x).trim(); }).filter(function (x, i, a) { return ETIQUETAS.indexOf(x) >= 0 && a.indexOf(x) === i; }).join(',');
}

function tipoEntrega_(p) { return String(p.tipo_entrega || '') || (p.zona_id ? 'domicilio' : 'retiro'); }

/* "13:30" -> fecha de hoy a esa hora, en la zona del negocio. */
function horaDeHoy_(hhmm, cfg, ahora) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return null;
  var dia = Utilities.formatDate(ahora, zona_(cfg), 'yyyy-MM-dd');
  return Utilities.parseDate(dia + ' ' + hhmm, zona_(cfg), 'yyyy-MM-dd HH:mm');
}

/* ¿Atiende a esa hora? Sin horario configurado = siempre abierto. Admite cierre después de medianoche. */
function estaAbierto_(cfg, fecha) {
  var zona = zona_(cfg);
  var dia = Number(Utilities.formatDate(fecha, zona, 'u')); // 1 = lunes … 7 = domingo
  var cerrados = String(cfg.dias_cerrado || '').split(',').map(function (x) { return Number(String(x).trim()); });
  var ap = String(cfg.horario_apertura || ''), ci = String(cfg.horario_cierre || '');
  var texto = ap && ci ? 'Atendemos de ' + ap + ' a ' + ci + '.' : '';
  if (cerrados.indexOf(dia) >= 0) return { abierto: false, mensaje: 'Hoy no atendemos. ' + texto + ' Puede escribirnos por WhatsApp.' };
  if (!/^\d{2}:\d{2}$/.test(ap) || !/^\d{2}:\d{2}$/.test(ci)) return { abierto: true };
  var hm = Utilities.formatDate(fecha, zona, 'HH:mm');
  var ok = ap <= ci ? (hm >= ap && hm < ci) : (hm >= ap || hm < ci);
  return ok ? { abierto: true } : { abierto: false, mensaje: 'En este momento estamos cerrados. ' + texto + ' Puede programar su pedido para cuando abramos.' };
}

/* 3.0: transferencia o Deuna sin verificar no sale ni se entrega. */
function exigirPagoVerificado_(p, preparar) {
  if (!preparar && !siNo_(leerConfig_().verificar_antes_salir)) return;
  if (esDigital_(p.forma_pago) && p.pago_verificado !== true) {
    throw fallo_('Primero verifique el pago en la app del banco' + (String(p.forma_pago) === 'deuna' ? ' o de Deuna' : '') + ' y toque «Marcar pago verificado».', 'PAGO_SIN_VERIFICAR');
  }
}

/* Lo gastado y los sellos se cuentan cuando el pedido se ENTREGA (no al crearlo). */
function sumarEntregaCliente_(p, signo) {
  var c = leerTabla_('clientes').filter(function (x) { return String(x.id) === String(p.cliente_id); })[0];
  if (!c) return;
  var cambios = {
    entregados: Math.max(0, numero_(c.entregados) + signo),
    total_gastado: Math.max(0, redondear_(numero_(c.total_gastado) + signo * numero_(p.total)))
  };
  if (numero_(leerConfig_().fidelidad_sellos) > 0) cambios.sellos = Math.max(0, numero_(c.sellos) + signo);
  actualizarCampos_('clientes', c._fila, c, cambios);
}

/* Saca el punto de un enlace de Google Maps / Apple Maps / Waze. Sigue enlaces cortos (hasta 3 saltos). */
function coordenadasDeEnlace_(url) {
  function leer(u) {
    var t = decodeURIComponent(String(u));
    var m = /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(t) || /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(t) ||
      /[?&](?:q|ll|query|destination|daddr|sll)=(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/.exec(t) || /^(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})$/.exec(t.trim());
    if (!m) return null;
    var lat = Number(m[1]), lng = Number(m[2]);
    return (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 } : null;
  }
  var directo = leer(url);
  if (directo) return directo;
  if (!/^https:\/\/(maps\.app\.goo\.gl|goo\.gl|maps\.google\.|www\.google\.|google\.|maps\.apple\.com|waze\.com|ul\.waze\.com)/i.test(url)) return null;
  var actual = url;
  for (var i = 0; i < 3; i++) {
    try {
      var r = UrlFetchApp.fetch(actual, { followRedirects: false, muteHttpExceptions: true });
      var h = r.getAllHeaders();
      var sig = h.Location || h.location;
      if (!sig) { return leer(r.getContentText().slice(0, 20000).match(/@-?\d{1,2}\.\d+,-?\d{1,3}\.\d+/) || ''); }
      if (Array.isArray(sig)) sig = sig[0];
      var p = leer(sig);
      if (p) return p;
      actual = sig;
    } catch (e) { console.error('ubicación: ' + e); return null; }
  }
  return null;
}

/* ---------- 12.3 Acciones públicas nuevas ---------- */

/* El cliente pegó un enlace de mapa: devuelve el punto para mostrarlo. */
function accionUbicacionResolver_(data) {
  var enlace = limpiarTexto_(data.enlace, 400);
  var disp = limpiarTexto_(data.disp_id, 60).replace(/[^A-Za-z0-9_-]/g, '') || 'sin-id';
  var cache = CacheService.getScriptCache(), k = 'UBIC_' + disp, n = Number(cache.get(k) || 0);
  if (n >= 20) throw fallo_('Demasiados intentos. Espere unos minutos.', 'FRENO');
  cache.put(k, String(n + 1), 600);
  if (!/^https:\/\//.test(enlace) && !/^-?\d{1,2}\.\d+\s*,\s*-?\d{1,3}\.\d+$/.test(enlace)) throw fallo_('Pegue el enlace completo del mapa (empieza con https://).');
  var p = coordenadasDeEnlace_(enlace);
  return { ok: true, data: { punto: p } };
}

/* Calificación al recibir (1 a 5 estrellas), una sola vez, con número de pedido + celular. */
function accionPedidoCalificar_(data) {
  var numero = limpiarTexto_(data.numero, 20).toUpperCase();
  var tel = normalizarTelefono_(data.telefono, leerConfig_().pais_codigo);
  var estrellas = Math.round(numero_(data.estrellas));
  if (!(estrellas >= 1 && estrellas <= 5)) throw fallo_('Elija de 1 a 5 estrellas.');
  var lock = candado_(), p;
  try {
    var sgC = /^(PED-\d{4,})-([a-z0-9]{6,12})$/i.exec(limpiarTexto_(data.s, 40)); // 3.1.3: también con el enlace del pedido
    p = leerTabla_('pedidos').filter(function (x) { return sgC ? (String(x.numero) === sgC[1].toUpperCase() && String(x.clave_seguimiento || '') === sgC[2].toLowerCase()) : (String(x.numero) === numero && String(x.telefono) === tel); })[0];
    if (!p) throw fallo_('No encontramos ese pedido con ese número de celular.', 'NO_EXISTE');
    if (String(p.estado) !== 'Entregado') throw fallo_('Podrá calificar cuando reciba su pedido.');
    if (numero_(p.calificacion) > 0) throw fallo_('Este pedido ya fue calificado. ¡Gracias!', 'DUPLICADO');
    actualizarCampos_('pedidos', p._fila, p, { calificacion: estrellas, comentario: limpiarTexto_(data.comentario, 300) });
  } finally { lock.releaseLock(); }
  bitacora_({ usuario: 'cliente', rol: '', local_id: String(p.local_id) }, 'PEDIDOS', 'CALIFICAR', numero + ' · ' + estrellas + '★', '');
  return { ok: true, data: { calificacion: estrellas } };
}

/* ---------- 12.4 Panel: aviso de pedidos nuevos (liviano: no lee la hoja) ---------- */
function accionPedidosNuevos_() {
  return { ok: true, data: { ultimo: Number(CacheService.getScriptCache().get('ULTIMO_PEDIDO') || 0) } };
}

/* Al escanear el QR del pedido: lo busca por número. */
function accionPedidoBuscar_(data, ctx) {
  if (data.texto !== undefined) return buscarPedidosTexto_(data, ctx); // 3.1: por nombre, celular o número
  var numero = limpiarTexto_(data.numero, 20).toUpperCase();
  var p = leerTabla_('pedidos').filter(function (x) { return String(x.numero) === numero; })[0];
  if (!p) throw fallo_('No existe el pedido ' + numero + '.', 'NO_EXISTE');
  if (!puedeVerLocal_(ctx, p.local_id)) throw fallo_('Ese pedido es de otro local.', 'PERMISO');
  var o = pedidoSalida_(p, detallePorPedido_([String(p.id)])[String(p.id)] || []);
  var m = leerTabla_('motorizados').filter(function (x) { return String(x.id) === o.motorizado_id; })[0];
  o.motorizado = m ? motoCorto_(m) : null;
  return { ok: true, data: { pedido: o } };
}

/* ---------- 12.5 Menú de ejemplo (botón del dueño) ---------- */
function accionMenuEjemplo_(data, ctx) {
  var log = [];
  function cat(nombre, orden) {
    try { accionCategoriaGuardar_({ nombre: nombre, local_id: 'TODOS', orden: orden }, ctx); } catch (e) { if (e.codigo !== 'DUPLICADO') throw e; }
    var c = leerTabla_('categorias').filter(function (x) { return String(x.local_id) === 'TODOS' && claveComparar_(x.nombre) === claveComparar_(nombre); })[0];
    return c ? String(c.id) : '';
  }
  var cAlm = cat('Almuerzos', 1), cPollo = cat('Pollos', 2), cFuerte = cat('Platos fuertes', 3), cBeb = cat('Bebidas', 4);
  var platos = [
    ['Almuerzo del día', cAlm, 3.50, 'Sopa del día, segundo con arroz, menestra, ensalada y jugo.', [{ nombre: 'Doble arroz', precio: 0.50 }, { nombre: 'Huevo frito', precio: 0.50 }], 'mas_vendido', false],
    ['Seco de pollo', cAlm, 4.00, 'Pollo en salsa de naranjilla, arroz, maduro frito y aguacate.', [{ nombre: 'Aguacate extra', precio: 0.75 }], '', false],
    ['1/4 pollo broaster con papas', cPollo, 4.50, 'Presa crocante, papas fritas y ensalada.', [{ nombre: 'Queso extra', precio: 0.50 }, { nombre: 'Sin ensalada', precio: 0 }], 'mas_vendido', false],
    ['Combo familiar 8 presas', cPollo, 18.50, '8 presas, papas familiares y cola de 1 litro.', [], 'para_compartir,promo', false],
    ['Encebollado', cFuerte, 4.50, 'Albacora, yuca y cebolla curtida. Con chifles o canguil.', [{ nombre: 'Chifles extra', precio: 0.50 }, { nombre: 'Sin cebolla', precio: 0 }], 'nuevo', false],
    ['Churrasco', cFuerte, 6.50, 'Carne a la plancha, arroz, papas fritas, huevo, aguacate y ensalada.', [{ nombre: 'Huevo extra', precio: 0.50 }], '', false],
    ['Jugo natural', cBeb, 1.50, 'Mora, naranjilla o maracuyá.', [], 'vegetariano', true],
    ['Cola 500 ml', cBeb, 1.00, 'Bien fría.', [], '', true]
  ];
  var creados = 0;
  platos.forEach(function (p) {
    try {
      accionPlatoGuardar_({ nombre: p[0], categoria_id: p[1], precio: p[2], descripcion: p[3], extras: p[4], etiquetas: p[5], sugerido: p[6], local_id: 'TODOS' }, ctx);
      creados++;
    } catch (e) { if (e.codigo !== 'DUPLICADO') throw e; log.push(p[0]); }
  });
  limpiarMenuCache_();
  bitacora_(ctx.sesion, 'MENU', 'MENU_EJEMPLO', creados + ' platos', ctx.dispositivo);
  var r = accionMenuListar_({ local_id: 'TODOS' }, ctx);
  r.data.ejemplo = { creados: creados, ya_existian: log.length };
  return r;
}

/* ---------- 12.6 Motorizado en un solo paso: usuario + ficha ---------- */
function accionMotorizadoCrearTodo_(data, ctx) {
  var cfg = leerConfig_();
  var cedula = limpiarTexto_(data.cedula, 20).replace(/\s/g, '');
  // Se revisa la ficha ANTES de crear el usuario, para no dejar usuarios sueltos.
  if (!limpiarTexto_(data.nombre, 80)) throw fallo_('Escriba el nombre del motorizado.');
  if (String(cfg.pais_codigo) === '593' && !cedulaEcuadorValida_(cedula)) throw fallo_('La cédula no es válida (revise los 10 dígitos).', 'CEDULA');
  if (!normalizarTelefono_(data.celular, cfg.pais_codigo)) throw fallo_('Escriba el celular.');
  var localUsuario = limpiarTexto_(data.local_id, 40);
  if (!localUsuario || localUsuario === 'TODOS') {
    var primero = leerTabla_('locales').filter(function (l) { return l.activo === true; })[0];
    localUsuario = primero ? String(primero.id) : '';
  }
  if (leerTabla_('motorizados').some(function (m) { return String(m.cedula) === cedula; })) throw fallo_('Ya existe un motorizado con esa cédula.', 'DUPLICADO');
  accionUsuarioGuardar_({ usuario: data.usuario, nombre: data.nombre, rol: 'motorizado', local_id: localUsuario, clave: data.clave, activo: true }, ctx);
  var u = leerTabla_('usuarios').filter(function (x) { return normalizarUsuario_(x.usuario) === normalizarUsuario_(data.usuario); })[0];
  var ficha = Object.assign({}, data, { id: '', usuario_id: u ? String(u.id) : '' });
  try {
    accionMotorizadoGuardar_(ficha, ctx);
  } catch (e) {
    if (u) actualizarCampos_('usuarios', u._fila, u, { activo: false }); // no queda un usuario suelto activo
    throw e;
  }
  return accionMotorizadosListar_({ local_id: 'TODOS' }, ctx);
}

/* ---------- 12.7 Cierre de caja: avisos antes de cerrar ---------- */
function avisosCierre_(caja, cfg, res) {
  var local = String(caja.local_id), dia = ymd_(caja.dia_trabajo, cfg), avisos = [];
  var enCamino = leerTabla_('pedidos').filter(function (p) {
    return String(p.local_id) === local && String(p.estado) === 'En camino' && String(p.forma_pago) === 'efectivo';
  });
  if (enCamino.length) avisos.push('Hay ' + enCamino.length + ' pedido(s) en efectivo todavía en camino (' + enCamino.map(function (p) { return p.numero; }).join(', ') + '): ese dinero quedará para la caja de mañana.');
  var sinVerificar = (res.transferencias || []).filter(function (t) { return !t.verificado && t.estado !== 'Anulado'; });
  if (sinVerificar.length) avisos.push('Hay ' + sinVerificar.length + ' pago(s) digitales sin verificar (' + sinVerificar.map(function (t) { return t.numero; }).join(', ') + ').');
  return avisos;
}

/* ---------- 12.8 Reportes con IVA, comida y envío por separado ---------- */
function accionReportes_(data, ctx) {
  var r = accionReportesBase_(data, ctx);
  var d = r.data, cfg = leerConfig_();
  var local = d.local;
  var ex = { comida: 0, envio: 0, propinas: 0, premios: 0, base_iva: 0, iva: 0, deuna: 0, transferencia_banco: 0, calificaciones: 0, estrellas: 0, clientes_nuevos: 0 };
  var porTipo = { domicilio: { pedidos: 0, total: 0 }, retiro: { pedidos: 0, total: 0 }, mesa: { pedidos: 0, total: 0 } };
  var porOrigen = {}, comentarios = [];
  leerTabla_('pedidos').forEach(function (p) {
    var dia = ymd_(p.dia_trabajo, cfg);
    if (dia < d.desde || dia > d.hasta || String(p.estado) === 'Anulado' || (local !== 'TODOS' && String(p.local_id) !== local)) return;
    var t = numero_(p.total), prop = numero_(p.propina);
    ex.envio += numero_(p.envio); ex.propinas += prop; ex.premios += numero_(p.premio);
    ex.comida += numero_(p.subtotal) - numero_(p.descuento) - numero_(p.premio);
    var pct = numero_(cfg.iva_porcentaje);
    var base = p.base_iva === '' || p.base_iva == null ? redondear_((t - prop) / (1 + pct / 100)) : numero_(p.base_iva); // pedidos viejos: se calcula
    ex.base_iva += base; ex.iva += (p.iva === '' || p.iva == null) ? (t - prop - base) : numero_(p.iva);
    if (String(p.forma_pago) === 'deuna') ex.deuna += t;
    if (String(p.forma_pago) === 'transferencia') ex.transferencia_banco += t;
    var tipo = tipoEntrega_(p);
    porTipo[tipo].pedidos++; porTipo[tipo].total += t;
    var o = String(p.origen || '') || 'directo';
    porOrigen[o] = porOrigen[o] || { origen: o, pedidos: 0, total: 0 };
    porOrigen[o].pedidos++; porOrigen[o].total += t;
    if (numero_(p.calificacion) > 0) {
      ex.calificaciones++; ex.estrellas += numero_(p.calificacion);
      if (String(p.comentario)) comentarios.push({ numero: String(p.numero), estrellas: numero_(p.calificacion), comentario: String(p.comentario), cliente: String(p.cliente_nombre) });
    }
    if (p.cliente_nuevo === true) ex.clientes_nuevos++;
  });
  Object.keys(ex).forEach(function (k) { ex[k] = redondear_(ex[k]); });
  ex.estrellas_promedio = ex.calificaciones ? Math.round(ex.estrellas / ex.calificaciones * 10) / 10 : null;
  ex.iva_porcentaje = numero_(cfg.iva_porcentaje);
  d.extra = ex;
  d.por_tipo = Object.keys(porTipo).map(function (k) { return { tipo: k, pedidos: porTipo[k].pedidos, total: redondear_(porTipo[k].total) }; });
  d.por_origen = Object.keys(porOrigen).map(function (k) { var o = porOrigen[k]; o.total = redondear_(o.total); return o; }).sort(function (a, b) { return b.pedidos - a.pedidos; });
  d.comentarios = comentarios.slice(-20).reverse();
  /* 3.1.6: informes adicionales separados, no recalculan caja ni ventas. */
  var anulaciones = {}, tiempos = {}, zonas = {}, motos = {}, locales = {};
  leerTabla_('zonas_envio').forEach(function (z) { zonas[String(z.id)] = numero_(z.minutos); });
  leerTabla_('motorizados').forEach(function (m) { motos[String(m.id)] = String(m.nombre); });
  leerTabla_('locales').forEach(function (l) { locales[String(l.id)] = String(l.nombre); });
  leerTabla_('pedidos').forEach(function (p) {
    var dia = ymd_(p.dia_trabajo, cfg), lid = String(p.local_id);
    if (dia < d.desde || dia > d.hasta || (local !== 'TODOS' && lid !== local)) return;
    if (String(p.estado) === 'Anulado') {
      var motivo = String(p.motivo_anulacion || 'Sin motivo'), caj = String(p.anulado_por || 'Sin registro anterior'), mot = String(p.motorizado_id || 'Sin motorizado');
      var k = [lid, motivo, caj, mot].join('|');
      anulaciones[k] = anulaciones[k] || { local: locales[lid] || lid, motivo: motivo, cajero: caj, motorizado: motos[mot] || mot, cantidad: 0 };
      anulaciones[k].cantidad++;
    }
    if (String(p.estado) === 'Entregado' && p.creado instanceof Date && p.entregado instanceof Date && p.zona_id) {
      var real = (p.entregado - p.creado) / 60000, previsto = numero_(cfg.minutos_preparacion) + (zonas[String(p.zona_id)] || 0);
      if (!(real >= 0 && real <= 10080)) return;
      var claves = ['LOCAL:' + lid, 'MOTO:' + String(p.motorizado_id || '')];
      claves.forEach(function (k) { if (k === 'MOTO:') return; tiempos[k] = tiempos[k] || { tipo: k.indexOf('LOCAL:') === 0 ? 'Local' : 'Motorizado', nombre: k.indexOf('LOCAL:') === 0 ? (locales[lid] || lid) : (motos[String(p.motorizado_id)] || String(p.motorizado_id)), total_real: 0, total_previsto: 0, cantidad: 0 }; tiempos[k].cantidad++; tiempos[k].total_real += real; tiempos[k].total_previsto += previsto; });
    }
  });
  d.anulaciones = Object.keys(anulaciones).map(function (k) { return anulaciones[k]; }).sort(function (a, b) { return b.cantidad - a.cantidad; });
  d.tiempos_reales = Object.keys(tiempos).map(function (k) { var t = tiempos[k]; return { tipo: t.tipo, nombre: t.nombre, cantidad: t.cantidad, real: Math.round(t.total_real / t.cantidad), previsto: Math.round(t.total_previsto / t.cantidad) }; });
  return r;
}

/* ---------- 12.9 Exportar para el contador (la pantalla arma el archivo) ---------- */
function accionExportar_(data, ctx) {
  var cfg = leerConfig_();
  var hasta = /^\d{4}-\d{2}-\d{2}$/.test(String(data.hasta || '')) ? String(data.hasta) : diaTrabajo_(new Date(), cfg);
  var desde = /^\d{4}-\d{2}-\d{2}$/.test(String(data.desde || '')) ? String(data.desde) : hasta;
  if (desde > hasta) throw fallo_('La fecha «desde» es posterior a «hasta».');
  var local = localDeSesion_(ctx, data.local_id);
  var nombres = {};
  leerTabla_('locales').forEach(function (l) { nombres[String(l.id)] = String(l.nombre); });
  var zona = zona_(cfg), pct = numero_(cfg.iva_porcentaje);
  var filas = [['Día', 'Hora', 'Pedido', 'Local', 'Tipo', 'Cliente', 'Celular', 'Estado', 'Forma de pago', 'Pago verificado', 'Comida', 'Envío', 'Descuento', 'Premio', 'Propina', 'Base imponible', 'IVA ' + pct + '%', 'Total']];
  leerTabla_('pedidos').forEach(function (p) {
    var dia = ymd_(p.dia_trabajo, cfg);
    if (dia < desde || dia > hasta || (local !== 'TODOS' && String(p.local_id) !== local)) return;
    var t = numero_(p.total), prop = numero_(p.propina);
    var base = p.base_iva === '' || p.base_iva == null ? redondear_((t - prop) / (1 + pct / 100)) : numero_(p.base_iva);
    var iva = p.iva === '' || p.iva == null ? redondear_(t - prop - base) : numero_(p.iva);
    filas.push([dia, p.creado instanceof Date ? Utilities.formatDate(p.creado, zona, 'HH:mm') : '', String(p.numero), nombres[String(p.local_id)] || '', tipoEntrega_(p),
      String(p.cliente_nombre), String(p.telefono), String(p.estado), String(p.forma_pago), p.pago_verificado === true ? 'Sí' : (esDigital_(p.forma_pago) ? 'No' : ''),
      redondear_(numero_(p.subtotal)), redondear_(numero_(p.envio)), redondear_(numero_(p.descuento)), redondear_(numero_(p.premio)), redondear_(prop), base, iva, redondear_(t)]);
  });
  bitacora_(ctx.sesion, 'REPORTES', 'EXPORTAR', desde + ' a ' + hasta + ' · ' + (filas.length - 1) + ' pedidos', ctx.dispositivo);
  return { ok: true, data: { nombre: 'ventas_' + desde + '_a_' + hasta, filas: filas } };
}

/* Ejecutar UNA vez desde el editor después de pegar la versión 3.0:
 * Google pide permiso para leer enlaces de mapas (UrlFetch). */
function autorizarPermisos() {
  UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions: true });
  instalarLimpiezaDiaria(); // 3.1: borra recorridos y fotos de entrega viejos cada madrugada
  console.log('Cuenta que ejecuta: ' + Session.getEffectiveUser().getEmail());
  /* 3.1.2: prueba real de Google Drive: crea las 3 carpetas de fotos y dice si funcionó */
  ['Fotos de entregas', 'Fotos de motorizados', 'Fotos del menú'].forEach(function (n) {
    try { console.log('✅ Carpeta lista: ' + n + ' → ' + carpetaFotos_(n).getUrl()); }
    catch (e) { console.log('❌ NO SE PUDO CREAR «' + n + '»: ' + (e && e.message || e)); }
  });
  console.log('Permisos listos.');
}

/* ============================================================
 * 13. VERSIÓN 3.1 — control del motorizado (turnos, rastreo,
 * alertas, código de entrega), monitoreo, informe de motorizados,
 * buscador de pedidos, privacidad (LOPDP) y limpieza a los 30 días.
 * ============================================================ */

/* ---------- 13.1 Ayudas ---------- */
function datosExtraMoto_(data, cambios) {
  if (data.color_moto !== undefined) cambios.color_moto = limpiarTexto_(data.color_moto, 30);
  if (data.modelo_moto !== undefined) cambios.modelo_moto = limpiarTexto_(data.modelo_moto, 40);
  ['licencia_vence', 'matricula_vence'].forEach(function (k) {
    if (data[k] === undefined) return;
    var v = String(data[k] || '');
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw fallo_('Fecha no válida.');
    cambios[k] = v ? fechaDesdeTexto_(v) : '';
  });
  if (data.forma_pago !== undefined) {
    var f = String(data.forma_pago || '');
    if (['', 'entrega', 'dia', 'sueldo'].indexOf(f) < 0) throw fallo_('Forma de pago no válida.');
    cambios.forma_pago = f;
  }
  if (data.tarifa !== undefined) {
    var t = data.tarifa === '' ? '' : Number(data.tarifa);
    if (t !== '' && !(t >= 0 && t <= 5000)) throw fallo_('Tarifa no válida.');
    cambios.tarifa = t;
  }
}

function nuevoCodigoEntrega_() { return ('000' + Math.floor(Math.random() * 10000)).slice(-4); }

function exigirCodigoEntrega_(p, codigo) {
  if (!siNo_(leerConfig_().codigo_entrega)) return;
  var c = String(p.codigo_entrega || '');
  if (c === 'NO') return; // pedido tomado por el personal
  if (c && String(codigo || '').replace(/\D/g, '') !== c) throw fallo_('El código no coincide. Pídale al cliente los 4 números que ve en su pantalla.', 'CODIGO');
}

function turnoAbierto_(motoId) {
  return leerTabla_('turnos').filter(function (t) { return String(t.motorizado_id) === motoId && !(t.fin instanceof Date); })[0] || null;
}
function turnoSalida_(t) { return t ? { id: String(t.id), inicio: iso_(t.inicio) } : null; }

function exigirTurnoAbierto_(motoId) {
  if (!siNo_(leerConfig_().exigir_turno) || !motoId) return;
  if (!turnoAbierto_(String(motoId))) throw fallo_('Ese motorizado no ha empezado su turno. Pídale que toque «Empezar turno».', 'SIN_TURNO');
}

/* Lo que ve el cliente del motorizado: nombre, foto, placa y moto. NUNCA cédula ni su celular. */
function tarjetaMotorizado_(p) {
  var m = leerTabla_('motorizados').filter(function (x) { return String(x.id) === String(p.motorizado_id); })[0];
  if (!m) return null;
  var l = leerTabla_('locales').filter(function (x) { return String(x.id) === String(p.local_id); })[0];
  var partes = String(m.nombre).trim().split(/\s+/);
  return { nombre: partes[0] + (partes[1] ? ' ' + partes[1] : ''), foto_url: String(m.foto_url || ''), placa: String(m.placa || ''),
    moto: [String(m.modelo_moto || ''), String(m.color_moto || '')].filter(String).join(' · '),
    salio: iso_(p.en_camino), telefono_local: l ? String(l.telefono || '') : '' };
}

function distanciaM_(a, b) {
  var R = 6371000, r = Math.PI / 180;
  var dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/* Solo las últimas filas de rastreo (rápido aunque la hoja crezca). */
function rastreoReciente_(n) {
  var sh = hoja_('rastreo'), ult = sh.getLastRow();
  if (ult < 2) return [];
  var desde = Math.max(2, ult - n + 1);
  var cols = HOJAS.rastreo;
  return sh.getRange(desde, 1, ult - desde + 1, cols.length).getValues().map(function (f) {
    var o = {}; cols.forEach(function (c, i) { o[c[0]] = f[i]; }); return o;
  });
}

/* ---------- 13.2 Turnos ---------- */
function accionTurnoIniciar_(data, ctx) {
  var m = miMotorizado_(ctx), cfg = leerConfig_();
  var lock = candado_();
  try {
    if (!turnoAbierto_(String(m.id))) {
      agregarFilas_('turnos', [[nuevoId_('TUR'), String(m.id), fechaDia_(diaTrabajo_(new Date(), cfg), cfg), new Date(), '', coord_(data.lat, -90, 90), coord_(data.lng, -180, 180), '', '']]);
      bitacora_(ctx.sesion, 'MOTORIZADOS', 'TURNO_INICIO', String(m.nombre), ctx.dispositivo);
    }
  } finally { lock.releaseLock(); }
  return accionMisEntregas_({}, ctx);
}

function accionTurnoTerminar_(data, ctx) {
  var m = miMotorizado_(ctx);
  var lock = candado_();
  try {
    var enCamino = leerTabla_('pedidos').filter(function (p) { return String(p.motorizado_id) === String(m.id) && String(p.estado) === 'En camino'; });
    if (enCamino.length) throw fallo_('Todavía tiene pedidos en camino (' + enCamino.map(function (p) { return p.numero; }).join(', ') + '). Entréguelos primero.');
    var t = turnoAbierto_(String(m.id));
    if (t) {
      actualizarCampos_('turnos', t._fila, t, { fin: new Date(), fin_lat: coord_(data.lat, -90, 90), fin_lng: coord_(data.lng, -180, 180) });
      bitacora_(ctx.sesion, 'MOTORIZADOS', 'TURNO_FIN', String(m.nombre), ctx.dispositivo);
    }
  } finally { lock.releaseLock(); }
  return accionMisEntregas_({}, ctx);
}

/* ---------- 13.3 Rastreo: SOLO con pedido «En camino» (privacidad) ---------- */
function accionRastreoPunto_(data, ctx) {
  var m = miMotorizado_(ctx);
  var lat = coord_(data.lat, -90, 90), lng = coord_(data.lng, -180, 180);
  if (lat === '' || lng === '') throw fallo_('Ubicación no válida.');
  var cache = CacheService.getScriptCache(), k = 'RASTREO_' + m.id;
  if (cache.get(k)) return { ok: true, data: { guardado: false } }; // máximo 1 punto cada 40 s
  var p = leerTabla_('pedidos').filter(function (x) { return String(x.id) === limpiarTexto_(data.pedido_id, 40); })[0];
  if (!p || String(p.motorizado_id) !== String(m.id) || String(p.estado) !== 'En camino') return { ok: true, data: { guardado: false, motivo: 'sin_pedido_en_camino' } };
  cache.put(k, '1', 40);
  agregarFilas_('rastreo', [[nuevoId_('RAS'), String(p.id), String(m.id), new Date(), lat, lng, Math.round(numero_(data.precision))]]);
  actualizarCampos_('pedidos', p._fila, p, { ultima_senal: new Date() });
  return { ok: true, data: { guardado: true } };
}

function accionRutaPedido_(data) {
  var id = limpiarTexto_(data.pedido_id, 40);
  var puntos = leerTabla_('rastreo').filter(function (r) { return String(r.pedido_id) === id; }).map(function (r) {
    return { fecha: iso_(r.fecha), lat: Number(r.lat), lng: Number(r.lng) };
  });
  return { ok: true, data: { puntos: puntos } };
}

/* ---------- 13.4 Monitoreo (dueño y cajero) ---------- */
function accionMonitoreo_(data, ctx) {
  var cfg = leerConfig_(), ahora = new Date(), hoy = diaTrabajo_(ahora, cfg);
  var local = localDeSesion_(ctx, data.local_id);
  var minDet = numero_(cfg.minutos_alerta_detenido) || 10, minSen = numero_(cfg.minutos_alerta_senal) || 5;
  var motos = leerTabla_('motorizados').filter(function (m) { return m.activo === true && (local === 'TODOS' || String(m.local_id) === 'TODOS' || String(m.local_id) === local); });
  var pedidos = leerTabla_('pedidos');
  var turnos = leerTabla_('turnos');
  var rastreo = rastreoReciente_(3000);
  var cajas = leerTabla_('caja').filter(function (c) { return String(c.estado) === 'abierta'; });
  var lista = motos.map(function (m) {
    var id = String(m.id);
    var mios = pedidos.filter(function (p) { return String(p.motorizado_id) === id; });
    var abiertos = mios.filter(function (p) { return ['Recibido', 'Preparando', 'En camino'].indexOf(String(p.estado)) >= 0; });
    var hoyEnt = mios.filter(function (p) { return String(p.estado) === 'Entregado' && ymd_(p.dia_trabajo, cfg) === hoy; });
    var mins = hoyEnt.filter(function (p) { return p.en_camino instanceof Date && p.entregado instanceof Date; }).map(function (p) { return (p.entregado - p.en_camino) / 60000; });
    var cal = hoyEnt.filter(function (p) { return numero_(p.calificacion) > 0; }).map(function (p) { return numero_(p.calificacion); });
    var t = turnos.filter(function (x) { return String(x.motorizado_id) === id && !(x.fin instanceof Date); })[0];
    var puntos = rastreo.filter(function (r) { return String(r.motorizado_id) === id; });
    var ultimo = puntos.length ? puntos[puntos.length - 1] : null;
    // también cuentan «Salí» y «Entregado» como señal
    mios.forEach(function (p) {
      [['en_camino', 'sali_lat', 'sali_lng'], ['entregado', 'entrega_lat', 'entrega_lng']].forEach(function (k) {
        if (p[k[0]] instanceof Date && p[k[1]] !== '' && (!ultimo || p[k[0]] > ultimo.fecha)) ultimo = { fecha: p[k[0]], lat: Number(p[k[1]]), lng: Number(p[k[2]]) };
      });
    });
    var alertas = [];
    abiertos.filter(function (p) { return String(p.estado) === 'En camino'; }).forEach(function (p) {
      var senal = p.ultima_senal instanceof Date ? p.ultima_senal : p.en_camino;
      if (p.hora_estimada instanceof Date && ahora > p.hora_estimada) alertas.push({ tipo: 'atraso', texto: p.numero + ': atrasado ' + Math.round((ahora - p.hora_estimada) / 60000) + ' min' });
      if (senal instanceof Date && (ahora - senal) / 60000 > minSen) alertas.push({ tipo: 'senal', texto: p.numero + ': sin señal hace ' + Math.round((ahora - senal) / 60000) + ' min' });
      var recientes = puntos.filter(function (r) { return String(r.pedido_id) === String(p.id) && r.fecha instanceof Date && (ahora - r.fecha) / 60000 <= minDet + 1; });
      if (recientes.length >= 3 && (recientes[recientes.length - 1].fecha - recientes[0].fecha) / 60000 >= minDet - 1 &&
        recientes.every(function (r) { return distanciaM_({ lat: Number(r.lat), lng: Number(r.lng) }, { lat: Number(recientes[0].lat), lng: Number(recientes[0].lng) }) < 60; })) {
        alertas.push({ tipo: 'detenido', texto: p.numero + ': detenido ' + minDet + '+ min en el mismo lugar' });
      }
    });
    var estado = abiertos.some(function (p) { return String(p.estado) === 'En camino'; }) ? 'en_camino' : abiertos.length ? 'asignado' : t ? 'libre' : 'fuera';
    return {
      id: id, nombre: String(m.nombre), placa: String(m.placa), foto_url: String(m.foto_url || ''), celular: String(m.celular),
      estado: estado, turno_inicio: t ? iso_(t.inicio) : '',
      pedidos: abiertos.map(function (p) { return { id: String(p.id), numero: String(p.numero), estado: String(p.estado), cliente: String(p.cliente_nombre), total: redondear_(p.total), forma_pago: String(p.forma_pago), en_camino: iso_(p.en_camino), hora_estimada: iso_(p.hora_estimada), lat: p.lat === '' ? '' : Number(p.lat), lng: p.lng === '' ? '' : Number(p.lng), ubicacion_enlace: String(p.ubicacion_enlace || '') }; }),
      ultimo_punto: ultimo ? { fecha: iso_(ultimo.fecha), lat: Number(ultimo.lat), lng: Number(ultimo.lng) } : null,
      debe: deudaMotorizado_(id, cajas, pedidos).total,
      hoy: { entregas: hoyEnt.length, minutos: mins.length ? Math.round(mins.reduce(function (a, b) { return a + b; }, 0) / mins.length) : null, estrellas: cal.length ? Math.round(cal.reduce(function (a, b) { return a + b; }, 0) / cal.length * 10) / 10 : null },
      alertas: alertas
    };
  });
  var orden = { en_camino: 0, asignado: 1, libre: 2, fuera: 3 };
  lista.sort(function (a, b) { return (b.alertas.length - a.alertas.length) || (orden[a.estado] - orden[b.estado]) || (a.nombre < b.nombre ? -1 : 1); });
  return { ok: true, data: { motorizados: lista, ahora: iso_(ahora), alertas: lista.reduce(function (s, m) { return s + m.alertas.length; }, 0) } };
}

/* ---------- 13.5 Informe de motorizados (solo dueño) ---------- */
function accionInformeMotorizados_(data, ctx) {
  var cfg = leerConfig_();
  var hasta = /^\d{4}-\d{2}-\d{2}$/.test(String(data.hasta || '')) ? String(data.hasta) : diaTrabajo_(new Date(), cfg);
  var desde = /^\d{4}-\d{2}-\d{2}$/.test(String(data.desde || '')) ? String(data.desde) : hasta;
  if (desde > hasta) throw fallo_('La fecha «desde» es posterior a «hasta».');
  var dias = Math.round((Utilities.parseDate(hasta, zona_(cfg), 'yyyy-MM-dd') - Utilities.parseDate(desde, zona_(cfg), 'yyyy-MM-dd')) / 86400000) + 1;
  var antHasta = Utilities.formatDate(new Date(Utilities.parseDate(desde, zona_(cfg), 'yyyy-MM-dd').getTime() - 86400000), zona_(cfg), 'yyyy-MM-dd');
  var antDesde = Utilities.formatDate(new Date(Utilities.parseDate(desde, zona_(cfg), 'yyyy-MM-dd').getTime() - dias * 86400000), zona_(cfg), 'yyyy-MM-dd');
  var local = localDeSesion_(ctx, data.local_id);
  var motos = leerTabla_('motorizados');
  var pedidos = leerTabla_('pedidos').filter(function (p) { return local === 'TODOS' || String(p.local_id) === local; });
  var turnos = leerTabla_('turnos'), liqs = leerTabla_('liquidaciones_motorizado'), rastreo = leerTabla_('rastreo');
  var zonas = {}; leerTabla_('zonas_envio').forEach(function (z) { zonas[String(z.id)] = String(z.nombre); });
  function enRango(d, a, b) { var y = ymd_(d, cfg); return y >= a && y <= b; }
  function calcular(m, a, b, detalle) {
    var id = String(m.id);
    var ent = pedidos.filter(function (p) { return String(p.motorizado_id) === id && String(p.estado) === 'Entregado' && enRango(p.dia_trabajo, a, b); });
    var anulEnCamino = pedidos.filter(function (p) { return String(p.motorizado_id) === id && String(p.estado) === 'Anulado' && p.en_camino instanceof Date && enRango(p.dia_trabajo, a, b); }).length;
    var mins = [], puntuales = 0, conHora = 0, cal = [], malas = 0, efectivo = 0, propinas = 0, porZona = {};
    ent.forEach(function (p) {
      if (p.en_camino instanceof Date && p.entregado instanceof Date) mins.push((p.entregado - p.en_camino) / 60000);
      if (p.hora_estimada instanceof Date && p.entregado instanceof Date) { conHora++; if (p.entregado <= new Date(p.hora_estimada.getTime() + 5 * 60000)) puntuales++; }
      if (numero_(p.calificacion) > 0) { cal.push(numero_(p.calificacion)); if (numero_(p.calificacion) <= 2) malas++; }
      if (String(p.forma_pago) === 'efectivo') efectivo += numero_(p.total) - numero_(p.propina);
      propinas += numero_(p.propina);
      var z = zonas[String(p.zona_id)] || 'Sin zona'; porZona[z] = (porZona[z] || 0) + 1;
    });
    var horas = 0, diasTurno = {};
    turnos.forEach(function (t) {
      if (String(t.motorizado_id) !== id || !(t.inicio instanceof Date) || !enRango(t.dia_trabajo, a, b)) return;
      var fin = t.fin instanceof Date ? t.fin : new Date();
      horas += (fin - t.inicio) / 3600000; diasTurno[ymd_(t.dia_trabajo, cfg)] = true;
    });
    var dif = 0, entregado = 0;
    liqs.forEach(function (l) { if (String(l.motorizado_id) === id && l.fecha instanceof Date && enRango(l.fecha, a, b)) { dif += numero_(l.diferencia); entregado += numero_(l.entregado); } });
    var km = 0, porPedido = {};
    if (detalle !== 'rapido') {
      rastreo.forEach(function (r) { if (String(r.motorizado_id) === id && r.fecha instanceof Date && enRango(r.fecha, a, b)) (porPedido[String(r.pedido_id)] = porPedido[String(r.pedido_id)] || []).push({ lat: Number(r.lat), lng: Number(r.lng) }); });
      Object.keys(porPedido).forEach(function (k) { var ps = porPedido[k]; for (var i = 1; i < ps.length; i++) km += distanciaM_(ps[i - 1], ps[i]) / 1000; });
    }
    var forma = String(m.forma_pago || ''), tarifa = numero_(m.tarifa);
    var gano = forma === 'entrega' ? tarifa * ent.length : forma === 'dia' ? tarifa * Object.keys(diasTurno).length : forma === 'sueldo' ? tarifa : null;
    var prom = function (l) { return l.length ? Math.round(l.reduce(function (x, y) { return x + y; }, 0) / l.length * 10) / 10 : null; };
    var o = {
      id: id, nombre: String(m.nombre), placa: String(m.placa), activo: m.activo === true,
      entregas: ent.length, minutos: prom(mins) === null ? null : Math.round(prom(mins)), puntualidad: conHora ? Math.round(puntuales / conHora * 100) : null,
      estrellas: prom(cal), calificaciones: cal.length, malas: malas, anulados_en_camino: anulEnCamino,
      efectivo: redondear_(efectivo), entregado_caja: redondear_(entregado), diferencia: redondear_(dif), propinas: redondear_(propinas),
      horas: Math.round(horas * 10) / 10, dias_trabajados: Object.keys(diasTurno).length, km: Math.round(km * 10) / 10,
      forma_pago: forma, tarifa: tarifa, gano: gano === null ? null : redondear_(gano),
      costo_por_entrega: gano !== null && ent.length ? redondear_(gano / ent.length) : null,
      por_zona: Object.keys(porZona).map(function (z) { return { zona: z, entregas: porZona[z] }; }).sort(function (x, y) { return y.entregas - x.entregas; })
    };
    /* 3.1: meta diaria y bono (si el dueño los puso en Ajustes) */
    var meta = numero_(cfg.meta_entregas_dia), bono = numero_(cfg.bono_meta);
    if (meta > 0) {
      var porDia = {};
      ent.forEach(function (p) { var d = ymd_(p.dia_trabajo, cfg); porDia[d] = (porDia[d] || 0) + 1; });
      o.dias_meta = Object.keys(porDia).filter(function (d) { return porDia[d] >= meta; }).length;
      o.bono = bono > 0 ? redondear_(o.dias_meta * bono) : 0;
    } else { o.dias_meta = null; o.bono = 0; }
    if (detalle === 'completo') {
      o.detalle = ent.map(function (p) {
        return { id: String(p.id), numero: String(p.numero), dia: ymd_(p.dia_trabajo, cfg), salio: iso_(p.en_camino), entrego: iso_(p.entregado), tiene_foto: !!String(p.foto_entrega || ''), // 3.1.3
          minutos: p.en_camino instanceof Date && p.entregado instanceof Date ? Math.round((p.entregado - p.en_camino) / 60000) : null,
          a_tiempo: p.hora_estimada instanceof Date && p.entregado instanceof Date ? p.entregado <= new Date(p.hora_estimada.getTime() + 5 * 60000) : null,
          total: redondear_(p.total), forma_pago: String(p.forma_pago), propina: numero_(p.propina), estrellas: numero_(p.calificacion) || null, comentario: String(p.comentario || ''),
          zona: zonas[String(p.zona_id)] || '', con_ruta: !!porPedido[String(p.id)] };
      }).sort(function (x, y) { return x.salio < y.salio ? 1 : -1; });
    }
    return o;
  }
  var soloUno = limpiarTexto_(data.motorizado_id, 40);
  var lista = motos.filter(function (m) { return !soloUno || String(m.id) === soloUno; }).map(function (m) {
    var o = calcular(m, desde, hasta, soloUno ? 'completo' : 'normal');
    var ant = calcular(m, antDesde, antHasta, 'rapido');
    o.anterior = { entregas: ant.entregas, minutos: ant.minutos, estrellas: ant.estrellas };
    // semáforo: verde = puntual y bien calificado; rojo = diferencias de caja, malas notas o muy impuntual
    o.semaforo = (o.diferencia < 0 || o.malas >= 2 || (o.puntualidad !== null && o.puntualidad < 60)) ? 'rojo' : ((o.puntualidad !== null && o.puntualidad < 85) || (o.estrellas !== null && o.estrellas < 4.3) || o.anulados_en_camino) ? 'amarillo' : 'verde';
    return o;
  }).filter(function (o) { return soloUno || o.activo || o.entregas; });
  lista.sort(function (a, b) { return (b.entregas - a.entregas) || ((b.estrellas || 0) - (a.estrellas || 0)); });
  bitacora_(ctx.sesion, 'REPORTES', 'INFORME_MOTORIZADOS', desde + ' a ' + hasta, ctx.dispositivo);
  return { ok: true, data: { desde: desde, hasta: hasta, hoy: diaTrabajo_(new Date(), cfg), meta_entregas_dia: numero_(cfg.meta_entregas_dia) || null, bono_meta: numero_(cfg.bono_meta) || 0, anterior: { desde: antDesde, hasta: antHasta }, motorizados: lista } };
}

/* ---------- 13.6 Buscador de pedidos por nombre, celular o número ---------- */
function buscarPedidosTexto_(data, ctx) {
  var t = limpiarTexto_(data.texto, 60);
  var clave = claveComparar_(t), digitos = t.replace(/\D/g, '');
  var num = /^(ped-?)?\d{1,6}$/i.test(t.replace(/\s/g, '')) ? Number(digitos) : null;
  if (num === null && t.replace(/\s/g, '').length < 2) throw fallo_('Escriba al menos 2 letras o el número del pedido.');
  var cfg = leerConfig_();
  var desde = Utilities.formatDate(new Date(Date.now() - 30 * 86400000), zona_(cfg), 'yyyy-MM-dd');
  var res = leerTabla_('pedidos').filter(function (p) {
    if (!puedeVerLocal_(ctx, p.local_id) || ymd_(p.dia_trabajo, cfg) < desde) return false;
    if (num !== null && Number(String(p.numero).replace(/\D/g, '')) === num) return true;
    if (digitos.length >= 4 && String(p.telefono).replace(/\D/g, '').indexOf(digitos.replace(/^0/, '')) >= 0) return true;
    return clave.length >= 2 && claveComparar_(p.cliente_nombre).indexOf(clave) >= 0;
  }).sort(function (a, b) { return a.creado < b.creado ? 1 : -1; }).slice(0, 25);
  return { ok: true, data: { pedidos: res.map(function (p) { return { id: String(p.id), numero: String(p.numero), cliente: String(p.cliente_nombre), telefono: String(p.telefono), estado: String(p.estado), total: redondear_(p.total), creado: iso_(p.creado), tipo_entrega: tipoEntrega_(p), mesa: String(p.mesa || '') }; }) } };
}

/* ---------- 13.7 Privacidad (LOPDP) ---------- */
function accionPrivacidadPublica_() {
  var cfg = leerConfig_();
  return { ok: true, data: { negocio: String(cfg.negocio_nombre), whatsapp: String(cfg.whatsapp || ''), ciudad: String(cfg.ciudad || ''), texto: String(cfg.privacidad_texto || ''), politicas: String(cfg.politicas_texto || ''),
    anos_clientes: String(cfg.anos_limpieza_clientes || '2'), dias_rastreo: String(cfg.dias_guardar_rastreo || '30'), dias_historial: String(cfg.dias_historial_cliente || '30') } };
}

/* El dueño borra los datos personales de un cliente (quedan los totales para la contabilidad). */
function accionClienteAnonimizar_(data, ctx) {
  var id = limpiarTexto_(data.id, 40);
  var lock = candado_(), nombre;
  try {
    var c = leerTabla_('clientes').filter(function (x) { return String(x.id) === id; })[0];
    if (!c) throw fallo_('Ese cliente no existe.', 'NO_EXISTE');
    if (c.anonimizado === true) throw fallo_('Ese cliente ya fue anonimizado.', 'DUPLICADO');
    nombre = String(c.nombre);
    var anon = 'ANON-' + id.slice(-6);
    actualizarCampos_('clientes', c._fila, c, { nombre: 'Cliente anónimo', telefono: anon, direccion: '', referencia: '', lat: '', lng: '', acepta_promos: false, anonimizado: true });
    var suyos = {};
    leerTabla_('pedidos').filter(function (p) { return String(p.cliente_id) === id; }).forEach(function (p) {
      suyos[String(p.id)] = true;
      actualizarCampos_('pedidos', p._fila, p, { cliente_nombre: 'Cliente anónimo', telefono: anon, direccion: '', referencia: '', lat: '', lng: '', ubicacion_enlace: '', notas: '', comentario: '', entrega_lat: '', entrega_lng: '' });
    });
    // su recorrido también se borra
    borrarFilasRastreo_(function (r) { return suyos[String(r.pedido_id)] === true; });
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'PRIVACIDAD', 'ANONIMIZAR_CLIENTE', id, ctx.dispositivo); // sin el nombre (ya se borró)
  return { ok: true, data: { anonimizado: true } };
}

function borrarFilasRastreo_(condicion) {
  var sh = hoja_('rastreo'), filas = leerTabla_('rastreo');
  var borrar = filas.filter(condicion).map(function (r) { return r._fila; }).sort(function (a, b) { return b - a; });
  borrar.forEach(function (f) { sh.deleteRow(f); });
  return borrar.length;
}

/* Cada madrugada: borra recorridos y fotos de entrega de más de N días (por defecto 30). */
function limpiarDatosViejos() {
  if (!estaInstalado_()) return;
  var cfg = leerConfig_(), dias = numero_(cfg.dias_guardar_rastreo) || 30;
  var limite = new Date(Date.now() - dias * 86400000);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    var n = borrarFilasRastreo_(function (r) { return r.fecha instanceof Date && r.fecha < limite; });
    var fotos = 0;
    leerTabla_('pedidos').forEach(function (p) {
      if (!String(p.foto_entrega) || !(p.entregado instanceof Date) || p.entregado >= limite) return;
      var m = /\/d\/([A-Za-z0-9_-]{20,})/.exec(String(p.foto_entrega)) || /id=([A-Za-z0-9_-]{20,})/.exec(String(p.foto_entrega));
      try { if (m) DriveApp.getFileById(m[1]).setTrashed(true); } catch (e) { console.error('foto: ' + e); }
      actualizarCampos_('pedidos', p._fila, p, { foto_entrega: '' });
      fotos++;
    });
    bitacora_({ usuario: 'sistema', rol: '', local_id: 'TODOS' }, 'PRIVACIDAD', 'LIMPIEZA', n + ' puntos de recorrido y ' + fotos + ' fotos de entrega (más de ' + dias + ' días)', '');
  } finally { lock.releaseLock(); }
  var cli = limpiarClientesInactivos_(); // 3.1.5 (cada anonimización toma su propio candado)
  if (cli) bitacora_({ usuario: 'sistema', rol: '', local_id: 'TODOS' }, 'PRIVACIDAD', 'LIMPIEZA_CLIENTES', cli + ' cliente(s) sin pedidos en ' + leerConfig_().anos_limpieza_clientes + ' año(s)', '');
}

function instalarLimpiezaDiaria() {
  var ya = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'limpiarDatosViejos'; });
  if (!ya) ScriptApp.newTrigger('limpiarDatosViejos').timeBased().everyDays(1).atHour(4).create();
}

/* ---------- 13.8 Foto vieja del plato a la papelera (solo si la creó este sistema) ---------- */
function accionPlatoGuardar_(data, ctx) {
  var id = limpiarTexto_(data.id, 40), antes = '';
  if (id) { var a = leerTabla_('platos').filter(function (p) { return String(p.id) === id; })[0]; antes = a ? String(a.foto_url || '') : ''; }
  var r = accionPlatoGuardarBase_(data, ctx);
  if (antes && antes !== enlaceImagen_(data.foto_url)) botarFotoVieja_(antes, 'Fotos del menú');
  return r;
}

/* 3.1: manda a la papelera la foto anterior, SOLO si está en la carpeta de esta app. */
function botarFotoVieja_(url, carpetaNombre) {
  try {
    var m = /[?&]id=([A-Za-z0-9_-]{20,})/.exec(String(url || ''));
    var carpeta = PropertiesService.getScriptProperties().getProperty('CARPETA_' + carpetaNombre);
    if (!m || !carpeta) return;
    var f = DriveApp.getFileById(m[1]), padres = f.getParents(), nuestra = false;
    while (padres.hasNext()) if (padres.next().getId() === carpeta) nuestra = true;
    if (nuestra) f.setTrashed(true);
  } catch (e) { console.error('foto vieja: ' + e); }
}

/* 3.1: lo que el personal necesita del motorizado en la lista de pedidos (sin cédula). */
function motoCorto_(m) {
  return { nombre: String(m.nombre), celular: String(m.celular), placa: String(m.placa || ''), moto: [String(m.modelo_moto || ''), String(m.color_moto || '')].filter(function (x) { return x; }).join(' · ') };
}

/* ============================================================
 * 3.1.3 — SEGUIMIENTO POR ENLACE, FOTO DE ENTREGA, AGOTADO AUTOMÁTICO, REDES
 * ============================================================ */

/* Clave corta y difícil de adivinar para el enlace de seguimiento de cada pedido. */
function nuevaClaveSeguimiento_() {
  var letras = 'abcdefghjkmnpqrstuvwxyz23456789', c = '';
  for (var i = 0; i < 8; i++) c += letras.charAt(Math.floor(Math.random() * letras.length));
  return c;
}

/* Redes y página web: se guardan como enlace https completo. Vacío = no se muestra. */
function enlaceRed_(k, v) {
  v = limpiarTexto_(v, 200).replace(/\s+/g, '');
  if (!v) return '';
  var base = { red_instagram: 'https://instagram.com/', red_facebook: 'https://facebook.com/', red_tiktok: 'https://tiktok.com/@' }[k];
  if (/^@?[A-Za-z0-9._]{2,60}$/.test(v) && base) return base + v.replace(/^@/, '');
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  v = v.replace(/^http:\/\//i, 'https://');
  if (!/^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(\/[^\s<>"']*)?$/.test(v)) throw fallo_('Enlace no válido: ' + v);
  return v;
}

/* { local_id: { plato_id: true } } — platos cuya receta pide más de lo que hay en ese local. */
function agotadosPorLocal_() {
  var recetas = leerTabla_('recetas_plato').filter(function (r) { return numero_(r.cantidad) > 0; });
  if (!recetas.length) return {};
  var insumos = leerTabla_('insumos');
  var porId = {}, porLocalNombre = {};
  insumos.forEach(function (i) { porId[String(i.id)] = i; porLocalNombre[String(i.local_id) + '|' + claveComparar_(i.nombre)] = i; });
  var res = {};
  leerTabla_('locales').filter(function (l) { return l.activo === true; }).forEach(function (l) {
    var lid = String(l.id), m = {};
    recetas.forEach(function (r) {
      var base = porId[String(r.insumo_id)];
      if (!base) return;
      var ins = String(base.local_id) === lid ? base : porLocalNombre[lid + '|' + claveComparar_(base.nombre)];
      if (!ins || ins.activo !== true) return; // sin ese insumo en el local: no se controla
      if (numero_(ins.stock) < numero_(r.cantidad)) m[String(r.plato_id)] = true;
    });
    if (Object.keys(m).length) res[lid] = m;
  });
  return res;
}

/* Foto de entrega (privada): dueño y cajero de su local; el motorizado solo las suyas. */
function accionFotoEntregaVer_(data, ctx) {
  var s = ctx.sesion, p;
  if (s.rol === 'motorizado') {
    var yo = miMotorizado_(ctx);
    p = leerTabla_('pedidos').filter(function (x) { return String(x.id) === String(data.id); })[0];
    if (!p || String(p.motorizado_id) !== String(yo.id)) throw fallo_('Solo puede ver las fotos de sus entregas.', 'PERMISO');
  } else {
    p = buscarPedido_(data.id, ctx);
  }
  var u = String(p.foto_entrega || '');
  var fid = (/\/d\/([-\w]{20,})/.exec(u) || /[?&]id=([-\w]{20,})/.exec(u) || [])[1];
  if (!fid) throw fallo_('Este pedido no tiene foto de entrega.', 'NO_EXISTE');
  var blob;
  try { blob = DriveApp.getFileById(fid).getBlob(); }
  catch (e) { throw fallo_('No se pudo abrir la foto. Intente más tarde.', 'FOTO'); }
  return { ok: true, data: { numero: String(p.numero), entregado: iso_(p.entregado), imagen: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) } };
}

/* 3.1.3: la foto del motorizado queda guardada en su ficha en el mismo momento (sin depender de «Guardar»). */
function accionMotorizadoFoto_(data, ctx) {
  var id = limpiarTexto_(data.id, 40);
  if (!id) throw fallo_('Primero guarde la ficha del motorizado.');
  var url = guardarFoto_(data.foto, 'motorizado-' + Utilities.formatDate(new Date(), zona_(leerConfig_()), 'yyyyMMdd-HHmmss'), 'Fotos de motorizados', true);
  var lock = candado_(), m;
  try {
    m = leerTabla_('motorizados').filter(function (x) { return String(x.id) === id; })[0];
    if (!m) throw fallo_('Ese motorizado ya no existe. Toque Actualizar.', 'NO_EXISTE');
    var antes = String(m.foto_url || '');
    actualizarCampos_('motorizados', m._fila, m, { foto_url: url });
    if (antes && antes !== url) botarFotoVieja_(antes, 'Fotos de motorizados');
  } finally { lock.releaseLock(); }
  bitacora_(ctx.sesion, 'MOTORIZADOS', 'FOTO', String(m.nombre), ctx.dispositivo);
  return { ok: true, data: { url: url } };
}

/* ============================================================
 * 3.1.5 — MIS PEDIDOS, CUENTAS BANCARIAS, EFECTIVO POR CLIENTE, LIMPIEZA
 * ============================================================ */

/* Textos largos de Ajustes: se conservan los saltos de línea. */
var LARGOS_ = { datos_transferencia: 600, privacidad_texto: 1500, politicas_texto: 2000, cuentas_bancarias: 4000 };
function textoLargo_(v, max) {
  return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

/* Cuentas bancarias del negocio (hasta 6), guardadas como JSON en la configuración. */
function cuentasLimpias_(v) {
  var lista;
  try { lista = typeof v === 'string' ? (v ? JSON.parse(v) : []) : v; } catch (e) { throw fallo_('Cuentas bancarias no válidas.'); }
  if (!Array.isArray(lista)) throw fallo_('Cuentas bancarias no válidas.');
  if (lista.length > 6) throw fallo_('Máximo 6 cuentas bancarias.');
  var limpias = lista.map(function (c, i) {
    var o = {
      banco: limpiarTexto_(c.banco, 60), tipo: String(c.tipo) === 'corriente' ? 'corriente' : 'ahorros',
      numero: limpiarTexto_(c.numero, 30).replace(/[^\d\-]/g, ''), titular: limpiarTexto_(c.titular, 80),
      documento: limpiarTexto_(c.documento, 13).replace(/\D/g, ''), correo: limpiarTexto_(c.correo, 80), activa: c.activa !== false
    };
    if (!o.banco) throw fallo_('Cuenta ' + (i + 1) + ': elija el banco.');
    if (o.numero.replace(/\D/g, '').length < 5) throw fallo_('Cuenta ' + (i + 1) + ': escriba el número de cuenta.');
    if (!o.titular) throw fallo_('Cuenta ' + (i + 1) + ': escriba el nombre del titular.');
    if (o.documento && [10, 13].indexOf(o.documento.length) < 0) throw fallo_('Cuenta ' + (i + 1) + ': la cédula tiene 10 dígitos y el RUC 13.');
    if (o.correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.correo)) throw fallo_('Cuenta ' + (i + 1) + ': correo no válido.');
    return o;
  });
  return limpias.length ? JSON.stringify(limpias) : '';
}

/* Datos públicos y mínimos de un pedido para el seguimiento del cliente. */
function pedidoPorClave_(s) {
  var sg = /^(PED-\d{4,})-([a-z0-9]{6,12})$/i.exec(limpiarTexto_(s, 40));
  if (!sg) return null;
  return leerTabla_('pedidos').filter(function (x) { return String(x.numero) === sg[1].toUpperCase() && String(x.clave_seguimiento || '') === sg[2].toLowerCase(); })[0] || null;
}

/* Seguimiento de varios pedidos del mismo teléfono en una sola consulta (máx. 10). */
function accionPedidosSeguir_(data) {
  if (!estaInstalado_()) throw fallo_('El sistema aún no está instalado.', 'NO_INSTALADO');
  var claves = (Array.isArray(data.s) ? data.s : []).slice(0, 10);
  var lista = [];
  claves.forEach(function (k) {
    try {
      var r = accionPedidoConsultar_({ s: k });
      // Una respuesta por clave: nunca desplazar los resultados de otros pedidos.
      lista.push(r && r.ok && r.data ? r.data : { seguimiento: String(k), consulta_error: true });
    } catch (e) {
      lista.push({ seguimiento: String(k), consulta_error: true });
    }
  });
  return { ok: true, data: { pedidos: lista } };
}

/* Enlace personal «Mis pedidos»: historial del cliente (sin dirección ni teléfono). */
function accionMisPedidos_(data) {
  if (!estaInstalado_()) throw fallo_('El sistema aún no está instalado.', 'NO_INSTALADO');
  var c = limpiarTexto_(data.c, 40).toLowerCase();
  if (!/^[a-z0-9]{12,24}$/.test(c)) throw fallo_('Este enlace no es válido.', 'NO_EXISTE');
  var cli = leerTabla_('clientes').filter(function (x) { return String(x.clave_cliente || '') === c && x.anonimizado !== true; })[0];
  if (!cli) throw fallo_('Este enlace no es válido o ya venció.', 'NO_EXISTE');
  var suyos = leerTabla_('pedidos').filter(function (p) { return String(p.cliente_id) === String(cli.id); })
    .sort(function (a, b) { return (b.creado instanceof Date ? b.creado.getTime() : 0) - (a.creado instanceof Date ? a.creado.getTime() : 0); }).slice(0, 30);
  var det = detallePorPedido_(suyos.map(function (p) { return String(p.id); }));
  return { ok: true, data: { nombre: String(cli.nombre).split(/\s+/)[0], pedidos: suyos.map(function (p) {
    return { numero: String(p.numero), s: String(p.clave_seguimiento || '') ? String(p.numero) + '-' + String(p.clave_seguimiento) : '', estado: String(p.estado), creado: iso_(p.creado), total: redondear_(p.total), local_id: String(p.local_id),
      items: (det[String(p.id)] || []).map(function (d) { return { p: d.plato_id, c: d.cantidad, n: d.nombre }; }) };
  }) } };
}

/* ¿Este cliente puede pagar en efectivo? (lo decide el dueño en Clientes). Solo devuelve sí/no. */
function accionPagoOpciones_(data) {
  var tel = normalizarTelefono_(data.telefono, leerConfig_().pais_codigo);
  var cache = CacheService.getScriptCache(), clave = 'PAGOOP_' + String(tel).replace(/\D/g, '');
  var veces = Number(cache.get('PAGOOP_N') || 0);
  if (veces > 600) throw fallo_('Intente en un momento.', 'LIMITE');
  cache.put('PAGOOP_N', String(veces + 1), 60);
  var guardado = cache.get(clave);
  if (guardado) return { ok: true, data: { efectivo: guardado === '1' } };
  var c = leerTabla_('clientes').filter(function (x) { return String(x.telefono) === tel; })[0];
  var ok = !!(c && c.efectivo_ok === true);
  cache.put(clave, ok ? '1' : '0', 120);
  return { ok: true, data: { efectivo: ok } };
}

/* El dueño marca a un cliente como «puede pagar en efectivo». */
function accionClienteEfectivo_(data, ctx) {
  var id = limpiarTexto_(data.id, 40), lock = candado_(), c;
  try {
    c = leerTabla_('clientes').filter(function (x) { return String(x.id) === id; })[0];
    if (!c) throw fallo_('Ese cliente no existe.', 'NO_EXISTE');
    actualizarCampos_('clientes', c._fila, c, { efectivo_ok: data.efectivo === true });
  } finally { lock.releaseLock(); }
  CacheService.getScriptCache().remove('PAGOOP_' + String(c.telefono).replace(/\D/g, ''));
  bitacora_(ctx.sesion, 'CLIENTES', data.efectivo === true ? 'EFECTIVO_SI' : 'EFECTIVO_NO', id, ctx.dispositivo);
  return { ok: true, data: { id: id, efectivo: data.efectivo === true } };
}

/* Clave del enlace «Mis pedidos» de un cliente (se crea si no tiene). */
function claveCliente_(c) {
  if (String(c.clave_cliente || '')) return String(c.clave_cliente);
  var k = nuevaClaveSeguimiento_() + nuevaClaveSeguimiento_();
  actualizarCampos_('clientes', c._fila, c, { clave_cliente: k });
  c.clave_cliente = k;
  return k;
}

/* Datos personales de clientes que no piden en N años: se borran solos (quedan los totales). */
function limpiarClientesInactivos_() {
  var anos = numero_(leerConfig_().anos_limpieza_clientes);
  if (!(anos > 0)) return 0;
  var limite = new Date(Date.now() - anos * 365 * 86400000), n = 0;
  leerTabla_('clientes').forEach(function (c) {
    if (c.anonimizado === true || !(c.ultimo_pedido instanceof Date) || c.ultimo_pedido >= limite) return;
    try { accionClienteAnonimizar_({ id: String(c.id) }, { sesion: { usuario: 'sistema', rol: '', local_id: 'TODOS' }, dispositivo: '' }); n++; } catch (e) { console.error('limpieza cliente: ' + e); }
  });
  return n;
}
