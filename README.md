# Sistema de pedidos y entregas para restaurantes

App instalable (iPhone, Android, tableta y computadora) para pedidos, motorizados, caja, inventario y reportes.
Una copia por cliente: cada negocio tiene su propia hoja de Google y su propio script. El nombre y el logo de cada negocio salen de su Configuración.

## Estado

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | Base instalable, instalador, ingreso por rol, locales, usuarios, configuración, licencia, bitácora | Lista para probar |
| 2 | Menú, formulario de pedido con WhatsApp y ubicación, clientes | Pendiente |
| 3 | Panel de pedidos | Pendiente |
| 4 | Motorizados y «Mis entregas» | Pendiente |
| 5–7 | Reportes, inventario, caja | Pendiente |

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | La aplicación |
| `instalar.html`, `js/instalar.js` | Instalador con diagnóstico (se usa una vez por negocio) |
| `js/config.js` | **Única línea a cambiar por cliente**: la dirección del script |
| `js/datos.js` | Única puerta a la base de datos (cambiar aquí si se pasa a Firebase/Supabase) |
| `js/ui.js` | Ventanas premium, avisos, formatos |
| `js/app.js` | Arranque, ingreso, locales, navegación |
| `js/configuracion.js` | Configuración del negocio |
| `css/app.css` | Diseño (colores y medidas en un solo lugar) |
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
