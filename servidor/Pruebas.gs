/**
 * ============================================================
 * DATOS DE PRUEBA — se ejecuta UNA vez desde el editor de Apps Script.
 * Archivo aparte (Pruebas.gs): no cambia nada de Codigo.gs.
 * Cómo: elegir la función «cargarDatosDePrueba» arriba y tocar «Ejecutar».
 * Usa las mismas acciones de la app (mismas validaciones y candado).
 * Todo lo creado dice «PRUEBA» para reconocerlo y borrarlo después.
 * ============================================================
 */
function cargarDatosDePrueba() {
  if (!estaInstalado_()) throw new Error('Primero instale el sistema desde instalar.html');
  var dueno = leerTabla_('usuarios').filter(function (u) { return String(u.rol) === 'dueno' && u.activo === true; })[0];
  if (!dueno) throw new Error('No hay un dueño activo.');
  var ctx = { dispositivo: 'datos de prueba', sesion: { usuario_id: String(dueno.id), usuario: String(dueno.usuario), nombre: String(dueno.nombre), rol: 'dueno', local_id: 'TODOS' } };
  var log = [];
  function paso(texto, fn) {
    try { var r = fn(); log.push('✅ ' + texto); return r; }
    catch (e) { log.push('⚠️ ' + texto + ': ' + e.message); return null; }
  }
  var local = leerTabla_('locales').filter(function (l) { return l.activo === true; })[0];
  var L1 = String(local.id);

  // Menú
  function catId(nombre) {
    paso('Categoría ' + nombre, function () { return accionCategoriaGuardar_({ nombre: nombre, local_id: 'TODOS' }, ctx); });
    var c = leerTabla_('categorias').filter(function (x) { return claveComparar_(x.nombre) === claveComparar_(nombre); })[0];
    return c ? String(c.id) : '';
  }
  var cAlm = catId('Almuerzos'), cPollo = catId('Pollos'), cPlato = catId('Platos fuertes'), cBebida = catId('Bebidas');
  var platos = [
    ['Almuerzo del día', cAlm, 3.50, 'Sopa del día, segundo con arroz, menestra, ensalada y jugo.', [{ nombre: 'Doble porción de arroz', precio: 0.50 }, { nombre: 'Huevo frito', precio: 0.50 }]],
    ['Seco de pollo', cAlm, 4.00, 'Pollo en salsa de naranjilla y cerveza, arroz, maduro y aguacate.', [{ nombre: 'Aguacate extra', precio: 0.75 }]],
    ['Encebollado', cPlato, 4.50, 'Albacora, yuca y cebolla curtida. Con chifles o canguil.', [{ nombre: 'Chifles extra', precio: 0.50 }, { nombre: 'Sin cebolla', precio: 0 }]],
    ['Churrasco', cPlato, 6.50, 'Carne a la plancha, arroz, papas fritas, huevo, aguacate y ensalada.', [{ nombre: 'Huevo extra', precio: 0.50 }]],
    ['1/4 pollo broaster con papas', cPollo, 4.50, 'Presa crocante, papas fritas y ensalada.', [{ nombre: 'Queso extra', precio: 0.50 }, { nombre: 'Sin ensalada', precio: 0 }]],
    ['1/2 pollo broaster', cPollo, 7.90, 'Para compartir entre dos.', [{ nombre: 'Papas grandes', precio: 1.00 }]],
    ['Combo familiar 8 presas', cPollo, 18.50, '8 presas, papas familiares y cola de 1 litro.', []],
    ['Jugo natural', cBebida, 1.50, 'Mora, naranjilla o maracuyá.', []],
    ['Cola 500 ml', cBebida, 1.00, '', []]
  ];
  platos.forEach(function (p) {
    paso('Plato ' + p[0], function () { return accionPlatoGuardar_({ nombre: p[0], categoria_id: p[1], precio: p[2], descripcion: p[3], extras: p[4], local_id: 'TODOS' }, ctx); });
  });
  function platoId(nombre) { var p = leerTabla_('platos').filter(function (x) { return claveComparar_(x.nombre) === claveComparar_(nombre); })[0]; return p ? String(p.id) : ''; }
  paso('Zona Centro', function () { return accionZonaGuardar_({ nombre: 'Centro', costo: 1.50, minutos: 15, local_id: L1 }, ctx); });
  paso('Zona Lejana', function () { return accionZonaGuardar_({ nombre: 'Norte lejano', costo: 2.50, minutos: 30, local_id: L1 }, ctx); });
  paso('Cupón PRUEBA10 (10%)', function () { return accionCuponGuardar_({ codigo: 'PRUEBA10', tipo: 'porcentaje', valor: 10, usos_max: 0 }, ctx); });
  paso('Datos de transferencia', function () { return accionConfigGuardar_({ config: { datos_transferencia: 'PRUEBA · Banco Pichincha · Ahorros 0000000000 · a nombre del negocio' } }, ctx); });

  // Inventario + receta
  paso('Insumo Pollo (presas)', function () { return accionInsumoGuardar_({ nombre: 'Pollo presas (PRUEBA)', unidad: 'presa', local_id: L1, minimo: 20, stock: 50 }, ctx); });
  paso('Insumo Papas', function () { return accionInsumoGuardar_({ nombre: 'Papas kg (PRUEBA)', unidad: 'kg', local_id: L1, minimo: 5, stock: 4 }, ctx); });
  var insPollo = leerTabla_('insumos').filter(function (i) { return claveComparar_(i.nombre) === claveComparar_('Pollo presas (PRUEBA)'); })[0];
  if (insPollo) {
    paso('Receta 1/4 pollo = 1 presa', function () { return accionRecetaGuardar_({ plato_id: platoId('1/4 pollo broaster con papas'), items: [{ insumo_id: String(insPollo.id), cantidad: 1 }] }, ctx); });
    paso('Receta 1/2 pollo = 2 presas', function () { return accionRecetaGuardar_({ plato_id: platoId('1/2 pollo broaster'), items: [{ insumo_id: String(insPollo.id), cantidad: 2 }] }, ctx); });
  }

  // Fichas de motorizado SIN usuario: se unen al usuario motorizado del mismo nombre (ej. JOSÉ PERALTA ↔ moto1).
  var usuariosMoto = leerTabla_('usuarios').filter(function (u) { return String(u.rol) === 'motorizado' && u.activo === true; });
  leerTabla_('motorizados').forEach(function (m) {
    if (String(m.usuario_id)) return;
    var usados = leerTabla_('motorizados').map(function (x) { return String(x.usuario_id); });
    var u = usuariosMoto.filter(function (x) { return claveComparar_(x.nombre) === claveComparar_(m.nombre) && usados.indexOf(String(x.id)) < 0; })[0];
    if (u) paso('Ficha de ' + m.nombre + ' unida al usuario @' + u.usuario, function () { return actualizarCampos_('motorizados', m._fila, m, { usuario_id: String(u.id) }); });
    else log.push('ℹ️ Ficha de ' + m.nombre + ' sigue sin usuario (no hay usuario motorizado con ese mismo nombre).');
  });

  // Usuarios de prueba y motorizado
  paso('Usuario cajero «cajaprueba» (clave 123456)', function () { return accionUsuarioGuardar_({ usuario: 'cajaprueba', nombre: 'Cajera PRUEBA', rol: 'cajero', local_id: L1, clave: '123456' }, ctx); });
  paso('Usuario motorizado «motoprueba» (clave 123456)', function () { return accionUsuarioGuardar_({ usuario: 'motoprueba', nombre: 'Motorizado PRUEBA', rol: 'motorizado', local_id: L1, clave: '123456' }, ctx); });
  var um = leerTabla_('usuarios').filter(function (u) { return String(u.usuario) === 'motoprueba'; })[0];
  paso('Ficha del motorizado', function () { return accionMotorizadoGuardar_({ nombre: 'Motorizado PRUEBA', cedula: '1710034065', celular: '0990000001', placa: 'PRU-0001', usuario_id: um ? String(um.id) : '', local_id: L1 }, ctx); });
  var moto = leerTabla_('motorizados').filter(function (m) { return String(m.cedula) === '1710034065'; })[0];

  // 3 pedidos en distintos estados
  function pedido(n, extra) {
    var d = { op_id: 'prueba-carga-' + n + '-' + Utilities.getUuid().slice(0, 8), local_id: L1, forma_pago: 'efectivo', zona_id: '',
      items: [{ plato_id: platoId('1/4 pollo broaster con papas'), cantidad: 2, extras: ['Queso extra'] }, { plato_id: platoId('Cola 500 ml'), cantidad: 2 }],
      cliente: { nombre: 'Cliente PRUEBA ' + n, telefono: '09900000' + (10 + n), direccion: 'Av. Amazonas y Naciones Unidas (PRUEBA)', referencia: 'Edificio azul' } };
    Object.keys(extra || {}).forEach(function (k) { d[k] = extra[k]; });
    var r = paso('Pedido de Cliente PRUEBA ' + n, function () { return accionPedidoCrear_(d, { tokenPublico: '', dispositivo: 'datos de prueba' }); });
    return r && r.data ? r.data.pedido : null;
  }
  var zona = leerTabla_('zonas_envio').filter(function (z) { return claveComparar_(z.nombre) === claveComparar_('Centro'); })[0];
  var zId = zona ? String(zona.id) : '';
  pedido(1, { zona_id: zId });                                       // queda Recibido
  var p2 = pedido(2, { zona_id: zId, forma_pago: 'transferencia' }); // queda Preparando con motorizado
  var p3 = pedido(3, { zona_id: '' });                               // retiro en local, queda Preparando
  if (p2) {
    paso('Pedido 2 → Preparando', function () { return accionPedidoEstado_({ id: p2.id, a: 'Preparando' }, ctx); });
    if (moto) paso('Pedido 2 → asignado al motorizado', function () { return accionPedidoAsignar_({ id: p2.id, motorizado_id: String(moto.id) }, ctx); });
  }
  if (p3) paso('Pedido 3 → Preparando', function () { return accionPedidoEstado_({ id: p3.id, a: 'Preparando' }, ctx); });

  var resumen = log.join('\n');
  console.log(resumen);
  return resumen;
}
