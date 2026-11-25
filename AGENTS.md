# Reglas de trabajo MiPedido

Aplican a todo el repositorio y a cualquier asistente o colaborador. Leer [README](README.md), [mantenimiento](docs/MANTENIMIENTO.md) e [inventario de servidor](servidor/README.md) antes de modificar.

- MAIN es producción. Cambios funcionales solo en rama candidata basada en el SHA vigente, con publicación expresamente autorizada.
- No cambiar la URL de la instalación, datos reales, permisos, esquema de hoja, credenciales ni Apps Script sin alcance y coordinación explícitos.
- Preservar pruebas existentes, lógica estable y compatibilidad entre cliente, restaurante y motorizado. Reutilizar componentes y consultas; no agregar dependencias externas innecesarias.
- Versionar pantalla, servidor y caché por separado. No instalar históricos. Revisar el commit exacto probado.
- Informar fallos, pruebas pendientes y límites; no declarar una simulación aprobada sin evidencia.
- No borrar archivos ni limpiar ramas históricas sin autorización y análisis de dependencias.
- Mantener UI premium, táctil y responsive. Probar iPhone/WebKit, Android/Chromium y escritorio; emulación no certifica audio físico.
