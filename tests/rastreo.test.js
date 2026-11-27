'use strict';
// 3.1.48 — ubicación del motorizado: la banda dice la verdad, no se envían posiciones viejas,
// los errores se explican y cerrar sesión apaga el GPS. Solo datos ficticios; sin red ni GPS reales.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const fuente = fs.readFileSync('js/rastreo.js', 'utf8');
const fuenteMotorizados = fs.readFileSync('js/motorizados.js', 'utf8');

function entorno(opciones) {
  opciones = opciones || {};
  const e = { ahora: 1000000, oculto: false, llamadas: [], watch: null, actual: [], limpiados: 0, respuesta: { guardado: true }, falla: false, timers: [], eventos: {}, wake: 0 };
  const banda = { hidden: true, className: '', attrs: {}, lastChild: { textContent: '' }, innerHTML: '',
    setAttribute(k, v) { this.attrs[k] = v; } };
  e.banda = banda;
  const geolocation = opciones.sinGps ? undefined : {
    watchPosition(ok, error, o) { e.watch = { ok, error, o }; return 7; },
    clearWatch() { e.limpiados++; },
    getCurrentPosition(ok, error, o) { e.actual.push({ ok, error, o }); }
  };
  // Documento mínimo: la banda del rastreo y los elementos que crea el botón de ayuda.
  function elemento(tag) {
    const el = { tag, className: '', textContent: '', style: {}, hijos: [], attrs: {}, eventos: {},
      classList: { add() {}, remove() {} }, appendChild(h) { this.hijos.push(h); h.padre = this; return h; },
      remove() { if (this.padre) this.padre.hijos = this.padre.hijos.filter(x => x !== this); }, focus() {}, offsetHeight: 70,
      setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { (this.eventos[t] = this.eventos[t] || []).push(f); } };
    Object.defineProperty(el, 'lastChild', { get() { return this.hijos[this.hijos.length - 1]; } });
    return el;
  }
  e.cuerpo = elemento('body');
  const documento = {
    get hidden() { return e.oculto; }, body: e.cuerpo,
    createElement: elemento, querySelectorAll() { return []; },
    getElementById(id) { return id === 'banda-rastreo' ? banda : id === 'navegacion' ? { offsetHeight: 70 } : null; },
    addEventListener(t, f) { (e.eventos[t] = e.eventos[t] || []).push(f); }, removeEventListener() {}
  };
  const ventana = {
    document: documento, navigator: { geolocation: geolocation, wakeLock: { request: async () => { e.wake++; return { addEventListener() {}, release() {} }; } } },
    UI: {}, DATOS: { pedir: async (accion, datos) => { e.llamadas.push({ accion, datos }); if (e.falla) throw new Error('sin red'); return e.respuesta; } },
    APP: { sesion: { rol: 'motorizado' }, salir: async function () { ventana.APP.sesion = null; return 'listo'; } },
    addEventListener(t, f) { (e.eventos[t] = e.eventos[t] || []).push(f); }
  };
  ventana.window = ventana;
  const ctx = vm.createContext({ window: ventana, document: documento, setInterval: (f, ms) => { e.timers.push({ f, ms }); return e.timers.length; }, clearInterval() {}, setTimeout: (f, ms) => { e.timers.push({ f, ms, una: true }); return 0; },
    Date: class extends Date { static now() { return e.ahora; } }, Math, Promise, Number, Object, Array, String, console });
  ctx.window.Date = ctx.Date;
  vm.runInContext(fuente, ctx);
  e.R = ventana.RASTREO; e.win = ventana;
  e.posicion = function (lat, lng, marca) { e.watch.ok({ coords: { latitude: lat, longitude: lng, accuracy: 12 }, timestamp: marca === undefined ? e.ahora : marca }); };
  e.vaciar = () => new Promise(r => setImmediate(r));
  return e;
}

test('rastreo: sin lectura de GPS la banda no dice que comparte y no se envía nada', async () => {
  const e = entorno(); e.R.actualizar(['P1']);
  assert.equal(e.banda.hidden, false); assert.equal(e.R.estado(), 'buscando');
  assert.match(e.banda.lastChild.textContent, /Buscando tu ubicación/); assert.doesNotMatch(e.banda.lastChild.textContent, /Compartiendo/);
  assert.equal(e.banda.className.includes('ok'), false);
  e.timers.filter(t => t.ms === 60000)[0].f(); await e.vaciar();
  assert.equal(e.llamadas.length, 0, 'sin posición no hay envío');
});

test('rastreo: primer punto apenas hay GPS y la banda verde muestra la hora del último envío', async () => {
  const e = entorno(); e.R.actualizar(['P1']); e.posicion(-0.18, -78.48); await e.vaciar();
  assert.equal(e.llamadas.length, 1); assert.equal(e.llamadas[0].accion, 'rastreoPunto');
  assert.deepEqual(Object.assign({}, e.llamadas[0].datos), { pedido_id: 'P1', lat: -0.18, lng: -78.48, precision: 12 });
  assert.equal(e.R.estado(), 'ok'); assert.match(e.banda.className, /\bok\b/); assert.match(e.banda.lastChild.textContent, /Compartiendo tu ubicación con el local\. Último envío: \d\d:\d\d/);
  assert.equal(e.banda.attrs['data-estado'], 'ok');
});

test('rastreo: nunca envía una posición vieja como si fuera de ahora; pide una nueva', async () => {
  const e = entorno(); e.R.actualizar(['P1']); e.posicion(-0.18, -78.48); await e.vaciar();
  e.llamadas.length = 0; e.ahora += 5 * 60000; // el teléfono estuvo bloqueado 5 min
  e.timers.filter(t => t.ms === 60000)[0].f(); await e.vaciar();
  assert.equal(e.llamadas.length, 0, 'la lectura de hace 5 min no se reenvía');
  assert.equal(e.R.estado(), 'buscando'); assert.equal(e.actual.length, 1); assert.equal(e.actual[0].o.maximumAge, 0);
  e.actual[0].ok({ coords: { latitude: -0.2, longitude: -78.5, accuracy: 9 }, timestamp: e.ahora }); await e.vaciar();
  assert.equal(e.llamadas.length, 1); assert.equal(e.llamadas[0].datos.lat, -0.2); assert.equal(e.R.estado(), 'ok');
});

test('rastreo: al volver a abrir la app con lectura vieja pide una nueva y no reenvía la vieja', async () => {
  const e = entorno(); e.R.actualizar(['P1']); e.posicion(-0.18, -78.48); await e.vaciar(); e.llamadas.length = 0;
  e.oculto = true; e.ahora += 10 * 60000; e.timers.filter(t => t.ms === 60000)[0].f(); await e.vaciar();
  assert.equal(e.llamadas.length, 0, 'con la app oculta no se envía');
  e.oculto = false; e.eventos.visibilitychange.forEach(f => f()); await e.vaciar();
  assert.equal(e.llamadas.length, 0); assert.equal(e.actual.length, 1); assert.equal(e.R.estado(), 'buscando');
});

test('rastreo: permiso bloqueado, sin GPS y tiempo agotado se explican de forma distinta', async () => {
  const e = entorno(); e.R.actualizar(['P1']);
  e.watch.error({ code: 1 }); assert.equal(e.R.estado(), 'permiso'); assert.match(e.banda.lastChild.textContent, /bloqueó la ubicación/); assert.match(e.banda.className, /error/);
  e.watch.error({ code: 2 }); assert.equal(e.R.estado(), 'gps'); assert.match(e.banda.lastChild.textContent, /No encontramos tu GPS/);
  e.posicion(-0.18, -78.48); await e.vaciar(); assert.equal(e.R.estado(), 'ok', 'al volver el GPS se recupera sola');
  e.watch.error({ code: 3 }); assert.equal(e.R.estado(), 'ok', 'un tiempo agotado con una lectura reciente no alarma');
});

test('rastreo: sin conexión lo dice y se recupera; «sin pedido en camino» no cuenta como envío', async () => {
  const e = entorno(); e.R.actualizar(['P1']); e.falla = true; e.posicion(-0.18, -78.48); await e.vaciar();
  assert.equal(e.R.estado(), 'red'); assert.match(e.banda.lastChild.textContent, /Sin conexión/);
  e.falla = false; e.ahora += 30000; e.timers.filter(t => t.ms === 60000)[0].f(); await e.vaciar();
  assert.equal(e.R.estado(), 'ok');
  const f = entorno(); f.R.actualizar(['P1']); f.respuesta = { guardado: false, motivo: 'sin_pedido_en_camino' }; f.posicion(-0.18, -78.48); await f.vaciar();
  assert.notEqual(f.R.estado(), 'ok', 'el servidor no guardó nada: no puede decir verde');
});

test('rastreo: con la app oculta o sin pedidos no se envía; al quedar sin pedidos se apaga el GPS', async () => {
  const e = entorno(); e.R.actualizar(['P1']); e.posicion(-0.18, -78.48); await e.vaciar(); e.llamadas.length = 0;
  e.oculto = true; e.timers.filter(t => t.ms === 60000)[0].f(); await e.vaciar(); assert.equal(e.llamadas.length, 0);
  e.oculto = false; e.R.actualizar([]); assert.equal(e.limpiados, 1); assert.equal(e.banda.hidden, true);
  e.posicion(-0.18, -78.48); await e.vaciar(); assert.equal(e.llamadas.length, 0);
});

test('rastreo: cerrar sesión o vencer la sesión apaga el GPS al instante', async () => {
  const e = entorno(); e.R.actualizar(['P1']); e.posicion(-0.18, -78.48); await e.vaciar();
  assert.equal(await e.win.APP.salir(), 'listo'); assert.equal(e.limpiados, 1, 'cerrar sesión apaga el GPS');
  const v = entorno(); v.R.actualizar(['P1']); v.eventos['app:sesion-terminada'].forEach(f => f()); assert.equal(v.limpiados, 1);
  const g = entorno(); g.R.actualizar(['P1']); g.posicion(-0.18, -78.48); await g.vaciar(); g.llamadas.length = 0;
  g.win.APP.sesion = null; g.ahora += 60000; g.timers.filter(t => t.ms === 60000)[0].f(); await g.vaciar();
  assert.equal(g.llamadas.length, 0); assert.equal(g.limpiados, 1, 'sin sesión no se envía y se apaga');
});

test('rastreo: teléfono sin GPS avisa y no falla', () => {
  const e = entorno({ sinGps: true }); e.R.actualizar(['P1']); assert.equal(e.R.estado(), 'gps'); assert.match(e.banda.lastChild.textContent, /No encontramos tu GPS/);
});

test('rastreo: el texto de la banda se inserta como texto (sin HTML)', () => {
  assert.match(fuente, /b\.lastChild\.textContent = texto/); assert.doesNotMatch(fuente, /innerHTML = [^;]*texto/);
});

/* ---- Turno abierto demasiado tiempo (motorizados.js) ---- */
function turno(inicioMs, ahoraMs) {
  const Real = Date, FIJA = ahoraMs;
  function Fecha() { return arguments.length ? new Real(...arguments) : new Real(FIJA); }
  Fecha.now = () => FIJA;
  const ini = fuenteMotorizados.indexOf('  var TURNO_LARGO_HORAS'), fin = fuenteMotorizados.indexOf('  async function guardarConAviso');
  assert.ok(ini > 0 && fin > ini);
  const UI = { esc: s => String(s), hora: v => { const d = new Real(v); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); } };
  const f = new Function('UI', 'Date', 'mias', fuenteMotorizados.slice(ini, fin) + ';return turnoHtml;');
  const mias = { turno: inicioMs === null ? null : { inicio: new Real(inicioMs).toISOString() }, exigir_turno: false };
  return f(UI, Fecha, mias)();
}
test('turno: abierto hace pocas horas se ve normal; hace muchas horas se marca en rojo con las horas', () => {
  const AHORA = new Date(2026, 10, 27, 12, 0, 0).getTime();
  const normal = turno(AHORA - 2 * 3600000, AHORA);
  assert.match(normal, /🟢 Turno desde las 10:00/); assert.doesNotMatch(normal, /largo/); assert.match(normal, /Al terminar tu jornada/);
  const largo = turno(AHORA - 18 * 3600000, AHORA);
  assert.match(largo, /tarjeta turno abierto largo/); assert.match(largo, /🔴 Turno abierto desde ayer a las 18:00/); assert.match(largo, /Lleva 18 h abierto/);
  assert.match(largo, /id="btn-turno"[^>]*>Terminar turno/);
  assert.match(turno(null, AHORA), /⚪ Turno sin empezar/); assert.match(turno(null, AHORA), /▶ Empezar turno/);
});
test('turno: justo en el límite de 14 h se marca y un instante antes no', () => {
  const AHORA = new Date(2026, 10, 27, 20, 0, 0).getTime();
  assert.doesNotMatch(turno(AHORA - 14 * 3600000 + 60000, AHORA), /largo/);
  assert.match(turno(AHORA - 14 * 3600000, AHORA), /largo/);
});
test('motorizado: texto sin dirección ya no parece un enlace', () => {
  assert.match(fuenteMotorizados, /Ubicación marcada por el cliente/); assert.doesNotMatch(fuenteMotorizados, /'Ver en el mapa'/);
});

/* ---- Botón de ayuda (el comportamiento visual y táctil lo prueba tests/navegador-ayuda.cjs) ---- */
test('ayuda: aparece solo para el motorizado y desaparece al cerrar sesión', () => {
  const e = entorno(); e.R.actualizar(['P1']);
  assert.equal(e.cuerpo.hijos.filter(h => h.id === 'btn-ayuda').length, 1, 'se crea una sola vez');
  e.R.actualizar(['P1']); assert.equal(e.cuerpo.hijos.filter(h => h.id === 'btn-ayuda').length, 1, 'no se duplica');
  e.R.detener(); assert.equal(e.cuerpo.hijos.filter(h => h.id === 'btn-ayuda').length, 0, 'se quita al cerrar sesión');
  const d = entorno(); d.win.APP.sesion = { rol: 'dueno' }; d.R.actualizar(['P1']);
  assert.equal(d.cuerpo.hijos.length, 0, 'el dueño y el cajero no lo ven');
});
test('ayuda: el código no envía nada solo y no guarda datos nuevos', () => {
  assert.match(fuente, /global\.open\(UI\.enlaceWhatsApp\(numero, mensajeAyuda\(\)\)/, 'abre WhatsApp para que la persona toque Enviar');
  assert.doesNotMatch(fuente, /DATOS\.pedir\('ayuda/, 'no hay llamadas nuevas al servidor');
  assert.doesNotMatch(fuente, /localStorage|sessionStorage/, 'no guarda nada en el teléfono');
  assert.match(fuente, /mejorPosicion\(\)/, 'solo usa una ubicación reciente');
});
