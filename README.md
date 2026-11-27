# Sistema de pedidos y entregas para restaurantes

App instalable (iPhone, Android, tableta y computadora) para pedidos, motorizados, caja, inventario y reportes.
Una copia por cliente: cada negocio tiene su propia hoja de Google y su propio script. El nombre y el logo de cada negocio salen de su Configuración.

## Versión vigente y fuente de verdad

- **MAIN / estable 3.1.49:** base oficial verificada el 27 de noviembre de 2026, commit `bf445362ecf1109b6c343acebcaf0f0fb50b7282`; 445/445 pruebas unitarias y 13 suites de navegador ([CI](https://github.com/andagoya2025-design/pedidos/actions/runs/46017693206)); [Pages](https://github.com/andagoya2025-design/pedidos/actions/runs/46019871185) exitoso.
- **Próxima candidata 3.1.50:** monitoreo y rastreo múltiple; fase documental, sin modificación funcional ni despliegue de servidor. Consultar MAIN antes de determinar estado vigente.
- **Servidor:** mínimo compatible 30129; fuente y TXT 30130 idénticos, despliegue de Apps Script no confirmado. No instalar sin autorización coordinada.
- **Caché estable:** app-3.1.59-actualizacion. La versión de pantalla se declara en js/config.js; la caché en sw.js.
- **Recuperación:** ramas `estable/3.1.49`, `estable/3.1.48`, `estable/3.1.47`. Historial preservado en [archivo/historico-2026-11-27](https://github.com/andagoya2025-design/pedidos/tree/archivo/historico-2026-11-27), commit `918f5361fcaf0810bdfd1407c72107dac92db469`. No instalar históricos ni integrar el archivo a MAIN.

Consultar [Inventario de servidor](servidor/README.md), [mantenimiento](docs/MANTENIMIENTO.md) y [reglas de trabajo](AGENTS.md). Los TXT obsoletos se conservan en el historial Git y no en el árbol activo.

`servidor/Pruebas.gs` es opcional y exclusivo de una hoja de ensayo: no instalar ni ejecutar en producción. Las pruebas automáticas de `tests/` se conservan para evitar regresiones. `MiPedido_Setup.html` es el asistente local de configuración; `instalar.html` es el instalador técnico. `herramientas-proveedor/` y `COMERCIAL.md` son recursos separados de administración comercial.

## Estado

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | Base instalable, instalador, ingreso por rol, locales, usuarios, configuración, licencia, bitácora | Lista |
| 2 | Menú (platos, fotos, extras, agotado, zonas, cupones), pedido del cliente con WhatsApp y ubicación, clientes | Lista (versión 2.0.0) |
| 3 | Panel de pedidos por estados, atrasados en rojo, asignar motorizado, avisar al cliente, anular con motivo | Lista (versión 2.0.0) |
| 4 | Motorizados (cédula validada) y «Mis entregas» (Salí / Entregado con hora, ubicación y foto) | Lista (versión 2.0.0) |
| 5 | Reportes: ventas por local, platos, horas y días pico, tiempos, motorizados, diferencias de caja | Lista (versión 2.0.0) |
| 6 | Inventario: compras, salidas, conteo, traspasos, mínimos; receta que descuenta al vender | Lista (versión 2.0.0) |
| 7 | Caja por turno: fondo, salidas, liquidación del motorizado, transferencias, cierre y resumen por WhatsApp | Lista (versión 2.0.0) |

**Enlace para que los clientes pidan:** `pedir.html` (o `pedir.html?local=ID` para un local fijo; el dueño lo copia en Menú → Enlace y ajustes).

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | La aplicación (dueño, cajero, motorizado) |
| `pedir.html`, `js/pedir.js` | Pantalla pública para que el cliente haga su pedido |
| `instalar.html`, `js/instalar.js` | Instalador con diagnóstico (se usa una vez por negocio) |
| `js/config.js` | **Única línea a cambiar por cliente**: la dirección del script |
| `js/datos.js` | Única puerta a la base de datos (cambiar aquí si se pasa a Firebase/Supabase) |
| `js/ui.js`, `js/comun.js` | Ventanas premium, avisos, formatos, WhatsApp, mapa, fotos |
| `js/app.js` | Arranque, ingreso, locales, navegación |
| `driver.html` | Aplicación de motorizados |
| `js/voz.js`, `js/notificaciones.js` | Motor de voz y centro de avisos; reutilizar sin duplicar consultas |
| `js/configuracion.js` | Configuración del negocio |
| `js/pedidos.js` | Panel de pedidos |
| `js/menu.js` | Menú, categorías, zonas, cupones, clientes, enlace y ajustes |
| `js/motorizados.js` | Fichas de motorizados y «Mis entregas» |
| `js/caja.js`, `js/inventario.js`, `js/reportes.js` | Caja, inventario y reportes |
| `css/app.css`, `css/modulos.css` | Diseño (colores y medidas en un solo lugar) |
| `sw.js` | Ayudante de la app: abre rápido y se actualiza solo (subir `VERSION` en cada cambio) |
| `manifest.json`, `iconos/` | Instalación en el teléfono |
| `servidor/Codigo.gs` | Script del servidor (se pega en la hoja del cliente) |

## Instalar para un cliente nuevo

0. **Aislamiento:** preparar una copia independiente del producto, sin reutilizar la URL del negocio activo. No modificar MAIN ni inicializar una hoja existente. Verificar titularidad y entorno de prueba.
1. **Hoja:** en el Drive del cliente, crear una hoja de cálculo vacía.
2. **Script:** en esa hoja, *Extensiones → Apps Script*. Borrar lo que haya y pegar `servidor/Codigo.gs` completo. Guardar.
3. **Publicar:** *Implementar → Nueva implementación → Tipo: Aplicación web*.
   - Ejecutar como: **Yo** (la cuenta del cliente).
   - Quién tiene acceso: **Cualquier persona**.
   - Autorizar los permisos que pide Google. Copiar la dirección que termina en `/exec`.
4. **Pantalla:** pegar esa dirección en `js/config.js` (línea `URL_SCRIPT`) y subir `VERSION` en `sw.js`.
5. **Instalar:** abrir `instalar.html`, revisar que el diagnóstico salga «Correcto» y completar nombre del negocio, dueño, usuario y clave.
6. **Listo:** entrar con ese usuario, renombrar los locales y crear los usuarios en *Configuración*.

Solo si la actualización requiere cambiar el servidor (ver matriz de compatibilidad y autorización): pegar el nuevo `Codigo.gs` y hacer *Implementar → Gestionar implementaciones → Editar → Nueva versión* (la dirección `/exec` no cambia).

## Instalar la app en el equipo

- **iPhone / iPad:** abrir el enlace en Safari → Compartir → *Agregar a pantalla de inicio*.
- **Android:** abrir en Chrome → *Instalar app*.
- **Computadora:** Chrome o Edge → ícono de instalar en la barra de direcciones.
