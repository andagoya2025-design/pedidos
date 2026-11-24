# Sistema de pedidos y entregas para restaurantes

App instalable (iPhone, Android, tableta y computadora) para pedidos, motorizados, caja, inventario y reportes.
Una copia por cliente: cada negocio tiene su propia hoja de Google y su propio script. El nombre y el logo de cada negocio salen de su Configuración.

## Versión vigente

**MiPedido 3.1.16.** Pantallas compatibles con el servidor 3.1.14; para mensaje personalizado y desglose exacto de nuevas propuestas, instalar el servidor 3.1.16. Para instalar o actualizar Apps Script, utilizar únicamente [`servidor/Codigo_MiPedido_3.1.16.txt`](servidor/Codigo_MiPedido_3.1.16.txt) (copia exacta de `servidor/Codigo.gs`). `Codigo.gs` es el archivo fuente mantenido; el TXT facilita la descarga e instalación. Las versiones anteriores se conservan en el historial de Git y en el respaldo `backup/antes-limpieza-20261124`, no en la carpeta principal.

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
| `js/configuracion.js` | Configuración del negocio |
| `js/pedidos.js` | Panel de pedidos |
| `js/menu.js` | Menú, categorías, zonas, cupones, clientes, enlace y ajustes |
| `js/motorizados.js` | Fichas de motorizados y «Mis entregas» |
| `js/caja.js`, `js/inventario.js`, `js/reportes.js` | Caja, inventario y reportes |
| `css/app.css`, `css/modulos.css` | Diseño (colores y medidas en un solo lugar) |
| `sw.js` | Ayudante de la app: abre rápido y se actualiza solo (subir `VERSION` en cada cambio) |
| `manifest.json`, `iconos/` | Instalación en el teléfono |
| `servidor/Codigo.gs` | Script del servidor (se pega en la hoja del cliente) |

## Instalar para un cliente nuevo (menos de 1 hora)

1. **Hoja:** en el Drive del cliente, crear una hoja de cálculo vacía.
2. **Script:** en esa hoja, *Extensiones → Apps Script*. Borrar lo que haya y pegar `servidor/Codigo.gs` completo. Guardar.
3. **Publicar:** *Implementar → Nueva implementación → Tipo: Aplicación web*.
   - Ejecutar como: **Yo** (la cuenta del cliente).
   - Quién tiene acceso: **Cualquier persona**.
   - Autorizar los permisos que pide Google. Copiar la dirección que termina en `/exec`.
4. **Pantalla:** pegar esa dirección en `js/config.js` (línea `URL_SCRIPT`) y subir `VERSION` en `sw.js`.
5. **Instalar:** abrir `instalar.html`, revisar que el diagnóstico salga «Correcto» y completar nombre del negocio, dueño, usuario y clave.
6. **Listo:** entrar con ese usuario, renombrar los locales y crear los usuarios en *Configuración*.

Cuando se cambia el script: pegar el nuevo `Codigo.gs` y hacer *Implementar → Gestionar implementaciones → Editar → Nueva versión* (la dirección `/exec` no cambia).

## Instalar la app en el equipo

- **iPhone / iPad:** abrir el enlace en Safari → Compartir → *Agregar a pantalla de inicio*.
- **Android:** abrir en Chrome → *Instalar app*.
- **Computadora:** Chrome o Edge → ícono de instalar en la barra de direcciones.
