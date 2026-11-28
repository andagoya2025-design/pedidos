# MiPedido 3.1.58 — Lista de entrega comercial

Estado: candidata. La publicación y la instalación requieren autorización separada.

## 1. Alcance y protección
## Candidata de entrega 3.1.58 — 27/11/2026

- MAIN permanece en pantalla 3.1.52, fuente servidor 30133, commit `3151d235f23d4446327aad24a4d7f468732c0fe1`. Despliegue efectivo de Apps Script no verificado.
- Base de desarrollo aprobada 3.1.56: `312d413dbad94d7c40646fb6385f561aa76fe15a`, [CI completo](https://github.com/andagoya2025-design/pedidos/actions/runs/46103897326).
- Base funcional inmediata 3.1.57: `c51f8781c7da83d2124abe0e07e48276b540a4df`, [CI](https://github.com/andagoya2025-design/pedidos/actions/runs/46104306451). Verificar conclusión final; pruebas unitarias aprobadas al preparar este documento.
- Candidata 3.1.58: pantalla 3.1.58, servidor 30138 idéntico al de 3.1.57, caché app-3.1.73-consolidacion. Mínimo comercial 30129 se conserva por compatibilidad; para certificar inventario completo instalar y comprobar 30138.
- No publicar, fusionar ni instalar hasta autorización expresa, CI verde del SHA exacto, respaldo coordinado y validación en instalación de ensayo. Los datos reales no se han modificado.
- Los apartados históricos siguientes se preservan como registro; las versiones vigentes se verifican mediante código, SHA y CI.

Inventario: validación de cantidades, movimientos y traspasos recuperables, devoluciones completas según historial, devoluciones parciales con traza por línea, bloqueo de insumos locales inactivos, alta recuperable con cantidad inicial. Se conserva el esquema y los permisos. No se añaden funcionalidades ni se retiran archivos históricos.

## 2. Archivos para instalación aislada
- PWA: index.html, pedir.html, driver.html, instalar.html, políticas y privacidad, js/, css/, iconos/, img/, manifest*.json y sw.js.
- Servidor: exclusivamente Codigo_MiPedido_3.1.38.txt (idéntico a Codigo.gs).
- MiPedido_Setup.html: herramienta local de preparación. No publicar herramientas del proveedor, pruebas o históricos como documentación pública del cliente.
- Configurar la URL /exec propia del nuevo negocio en js/config.js. No copiar ni distribuir la dirección de la instalación activa. Cada negocio debe tener su propia hoja y script, permisos y usuarios. Mantener la versión y el mínimo compatible.
- No inicializar una hoja existente. No usar Pruebas.gs en producción.

## 3. Puerta de aceptación
- [ ] CI de 3.1.57 y CI exacto de 3.1.58 completamente verdes.
- [ ] Comparar SHA de MAIN; respaldar código y hoja; conservar las ramas 3.1.55, 3.1.56 y 3.1.57.
- [ ] Ensayo aislado con cinco locales: alta, compra, conteo, salida, transferencia, venta, retiro, anulación, inactivo/reactivado y recuperación.
- [ ] Comprobar versión servidor 30138, cliente 3.1.58, sesión, roles, caja, notificaciones y PWA.
- [ ] Prueba física breve iPhone, Android y escritorio, audio/GPS según dispositivo.
- [ ] Autorización expresa para desplegar servidor y publicar frontend; comprobar versión publicada y reversión.
- [ ] Entregar al cliente exclusivamente la copia aislada, sin datos reales del negocio original.

## 4. Límites
Los pedidos históricos sin traza requieren conciliación manual para devoluciones parciales. La recuperación de alta evita duplicados, pero el reintento puede informar que el nombre ya existe. Las interrupciones generales del motor de pedidos no son transacciones atómicas y requieren conciliación según el flujo existente. No restaurar el servidor sobre un diario de inventario pendiente ni restaurar hojas a ciegas. Las simulaciones no certifican GPS, audio físico ni comportamiento en redes reales. No afirmar licencia remota ni protección contra el propietario de la hoja.
