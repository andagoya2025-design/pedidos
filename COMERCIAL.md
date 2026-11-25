# Administración comercial local

El proveedor configura LICENCIA_MAX_LOCALES en las propiedades del script (entero positivo). Si no existe, se conserva el comportamiento anterior para instalaciones existentes. Se cuentan todos los establecimientos registrados, incluso inactivos. El estado y vencimiento de licencia se administran directamente en la configuración de la hoja por el operador autorizado, no desde la interfaz ordinaria. Realizar respaldo antes de cambiar valores. La licencia vencida bloquea nuevos pedidos. No existe todavía un panel remoto ni protección frente al propietario del código o la hoja. Para ello se necesita un servicio bajo control exclusivo del proveedor. No publicar sin validar la migración y las pruebas de navegador.

## Instalaciones de terceros

La URL de js/config.js en MAIN corresponde al negocio activo. No entregar esa configuración como plantilla. Preparar una copia independiente con la URL propia del nuevo negocio, validar su conexión y permisos, y no reinicializar hojas existentes. Consultar [procedimiento de mantenimiento](docs/MANTENIMIENTO.md). El registro comercial HTML es local y no autentica ni controla licencias remotas; no introducir contraseñas ni datos clínicos o de clientes.
