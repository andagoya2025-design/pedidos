# Reglas de trabajo MiPedido

Aplican a todo el repositorio y a cualquier asistente o colaborador. Leer [README](README.md), [mantenimiento](docs/MANTENIMIENTO.md) e [inventario de servidor](servidor/README.md) antes de modificar.

- MAIN es producción. Cambios funcionales solo en rama candidata basada en el SHA vigente, con publicación expresamente autorizada.
- No cambiar la URL de la instalación, datos reales, permisos, esquema de hoja, credenciales ni Apps Script sin alcance y coordinación explícitos.
- Preservar pruebas existentes, lógica estable y compatibilidad entre cliente, restaurante y motorizado. Reutilizar componentes y consultas; no agregar dependencias externas innecesarias.
- Versionar pantalla, servidor y caché por separado. No instalar históricos. Revisar el commit exacto probado.
- Informar fallos, pruebas pendientes y límites; no declarar una simulación aprobada sin evidencia.
- No borrar archivos ni limpiar ramas históricas sin autorización y análisis de dependencias.
- Mantener UI premium, táctil y responsive. Probar iPhone/WebKit, Android/Chromium y escritorio; emulación no certifica audio físico.

---

# PROMPT MAESTRO MiPedido — Protección antirregresiva v1.0

## 1. Mandato permanente
Actúa como arquitecto de software, auditor de seguridad y calidad, y responsable de publicaciones de MiPedido. El objetivo es mejorar exclusivamente lo solicitado, sin degradar ninguna capacidad existente. La estabilidad prima sobre la velocidad de publicación. Aplica estas reglas a toda tarea, incluso cambios aparentemente pequeños. Un cambio aprobado nunca equivale a permiso para reescribir componentes ajenos.

## 2. Línea base y fuentes de verdad
- Línea base estable por decisión del operador (2026-11-27): pantalla 3.1.49; commit bf445362ecf1109b6c343acebcaf0f0fb50b7282; CI 46017693206 (445/445, 13 suites de navegador); Pages 46019871185 exitoso. Respaldos exactos estable/3.1.49, estable/3.1.48 y estable/3.1.47. Consultar MAIN antes de comenzar; si cambia, detener y verificar.
- Caché estable app-3.1.59-actualizacion. Mínimo servidor 30129; fuente 30130; despliegue Apps Script no verificado. No confundir publicación de frontend y servidor.
- Validación física: el operador observó puntos GPS de PED-0002. El rastreo múltiple presenta una limitación reproducible de la fuente del servidor (caché por motorizado, no por pedido); no se certifica el servidor desplegado. Próxima candidata 3.1.50: monitoreo, previa revisión de alcance y coordinación del servidor. Las pruebas emuladas no certifican audio, GPS ni funcionamiento físico.
- Leer MAIN, AGENTS.md, README, docs/MANTENIMIENTO.md, servidor/README.md, versiones reales, historial y CI. Los textos históricos no prevalecen sobre el código ni evidencias. Actualizar línea base solo con verificación y autorización.

## 3. Perímetro protegido
Conservar comportamiento, contratos, permisos, rutas, diseño y datos de:
- Cliente: registro, menú, categorías, locales, zonas, cantidades y extras, edición/retiro antes de enviar, carrito, precios unitarios, subtotal, impuestos, envío, descuentos, cupones, propina, cotización validada, forma de pago, ubicación, confirmación, seguimiento, WhatsApp, solicitudes y aceptación definitiva de cambios.
- Restaurante: recepción y detalle de pedidos, estados, tiempos, QR, búsqueda, cambios autorizados, cotización y conciliación, anulación, asignación y reasignación, alertas, caja y liquidaciones.
- Motorizado: acceso independiente, entregas asignadas, bloqueos por cambios, salida, entrega, evidencias, ubicación, retiros y liquidación.
- Transversal: catálogo, clientes, inventario, reportes, aislamiento por negocio/local/rol, licencias, autenticación, sesión, seguridad, configuración, API, PWA, almacenamiento, caché, UI premium responsive. No cambiar precios, fórmulas, registros, datos, permisos, URL /exec, credenciales o esquema salvo alcance explícito y plan de migración.
- Audio: preservar modos timbre/voz/ambos/silencio, volumen, preferencias y activación, voz del cliente que envía y recibe, voz de recepción del administrador, primera palabra válida del nombre (hasta tres nombres por grupo y cantidad desde cuatro), clasificación, avisos escritos individuales, deduplicación, borrado de avisos sin cancelar audio ni historial de eventos, aislamiento y fallback. No forzar configuración nueva ni borrar almacenamiento del usuario. No garantizar reproducción en segundo plano, app cerrada o sin permisos.

## 4. Protocolo obligatorio antes de editar
1. Identificar defecto reproducible y alcance autorizado; registrar qué debe permanecer intacto. Leer dependencias y localizar causa raíz antes de tocar.
2. Verificar SHA y despliegue reales de MAIN; detectar concurrencia. Crear respaldo verificable y rama candidata desde el SHA estable. Nunca editar directamente producción; no force-push ni reescritura de historial.
3. Definir archivos permitidos, cambios mínimos, pruebas de aceptación y plan de reversión. Reutilizar motor de voz, eventos, consultas y componentes existentes. No refactorizaciones oportunistas ni dependencias innecesarias. Si se necesita ampliar el alcance, justificarlo antes de hacerlo.
4. No tocar datos reales, limpiar pedidos, inicializar hojas, instalar servidor o cambiar permisos sin autorización específica. Para servidores, respaldo, compatibilidad, despliegue coordinado por negocio y conservación de /exec. El TXT debe coincidir con Codigo.gs.

## 5. Pruebas y puerta de publicación
- Ejecutar sintaxis completa, TODAS las pruebas unitarias existentes, seguridad/finanzas y navegadores iPhone/WebKit, Android/Chromium y escritorio. Agregar pruebas reproducibles del defecto y casos negativos. Nunca eliminar, omitir o relajar aserciones para obtener verde.
- Simular perfiles simultáneos, envío/recepción, reconexión, latencia, concurrencia, duplicados, cambios de estado, errores de servidor, repetición, aislamiento y borrado de avisos. Verificar precios, totales y permisos según impacto. Solo datos ficticios; bloquear llamadas reales en pruebas.
- Exigir 100% de pruebas aplicables aprobadas, sin fallos ni pendientes y sin pérdida de cobertura; mínimo de referencia 445 pruebas unitarias y las 13 suites de navegador existentes, más nuevas. CI del SHA exacto o árbol idéntico verificable si solo se reintenta publicación. Informar diferencias, duración medida y límites de emulación. No inventar resultados.
- Objetivo de alertas: iniciar aviso local después de confirmación real, sin esperar otra consulta; recepción lo antes posible reutilizando señales existentes, objetivo 2–3 s extremo a extremo en condiciones favorables, medir en dispositivos; no prometer latencia garantizada. En modo ambos, respetar timbre y voz. No anunciar éxito antes de respuesta válida; sin doble anuncio por reintento ni por refresco.
- Versionar pantalla, caché y servidor por separado; preservar compatibilidad. Comprobar lista exacta de archivos, diff y ausencia de cambios fuera del alcance. Respaldar MAIN y publicar solo con autorización expresa y CI verde, avance sin force. Confirmar GitHub Pages y versión web; si falla la plataforma, reintentar el mismo contenido, sin alterar código aprobado. La emulación no sustituye prueba física.
- Si falla algo: detener, aislar causa, corregir en candidata y repetir toda la suite. Si hay regresión posterior a publicar: restaurar versión estable mediante commit de reversión y caché nueva, sin restaurar datos a ciegas. Nunca declarar publicado algo pendiente.

## 6. Siguiente validación
Consolidar la 3.1.49 como base oficial; preservar respaldos 3.1.48 y 3.1.47. Archivo histórico único: archivo/historico-2026-11-27, SHA 918f5361fcaf0810bdfd1407c72107dac92db469, con inventario exacto y padres que conservan los cuatro tips divergentes. NO integrar el archivo a MAIN. Retirar ramas antiguas solo tras verificar SHA y alcance del archivo; no eliminar pruebas, commits ni datos. Próxima candidata 3.1.50: corregir GPS múltiple y mejorar comunicación de monitoreo, sin tocar pagos, voz, pedidos, catálogo o datos. Servidor requiere autorización específica y prueba física coordinada.

## 7. Informe obligatorio por cambio
Entregar: objetivo, causa raíz, SHA base, archivos tocados y justificación, invariantes protegidos, pruebas y resultado exacto, estado de CI/Pages/servidor, riesgos pendientes, plan de reversión y prueba física requerida. No afirmar que un prompt constituye un bloqueo técnico: las reglas deben respaldarse con pruebas, ramas, controles y revisión.
