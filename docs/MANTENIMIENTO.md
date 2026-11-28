# Mantenimiento y publicación antirregresiva

## Fuentes de verdad
MAIN contiene el código publicado, no una candidata. Leer primero js/config.js (versión pantalla y mínimo servidor), servidor/Codigo.gs (APP_VERSION_NUM), sw.js (caché) y el historial Git. El TXT vigente debe ser idéntico a Codigo.gs. No deducir versiones desde comentarios antiguos.

## Flujo obligatorio
1. Leer MAIN y registrar SHA exacto, versiones y alcance. Confirmar que no existan cambios concurrentes.
2. Crear rama candidata/<versión>-<objetivo> desde MAIN. No editar MAIN para cambios funcionales.
3. Mantener cambios pequeños y modulares. No mezclar funcionalidades, limpieza o migraciones de datos. Conservar interfaces, permisos, URLs, rutas, QR, pagos, caja e inventario fuera del alcance.
4. Auditar estáticamente dependencias, sesiones, datos, caché, eventos y llamadas de red. Simular errores, concurrencia y cambios de perfil según el alcance.
5. Ejecutar node --check, node --test tests/*.test.js y todas las pruebas de navegador del workflow. Añadir pruebas por cada defecto corregido; no debilitar las antiguas. Usar datos ficticios y bloquear escrituras reales.
6. Confirmar que CI corresponde al SHA exacto de la candidata. No confundir éxito de un commit anterior con aprobación del último. Si falla, corregir y repetir; informar cualquier prueba pendiente o limitación física.
7. Crear respaldo respaldo/main-antes-<versión> y verificar SHA. Si cambia el servidor, coordinar previamente respaldo de hoja/script y despliegue compatible por negocio. Si solo cambia frontend, conservar mínimo de servidor salvo razón probada.
8. Publicar con autorización expresa, avance sin force y comprobación de MAIN. Verificar despliegue Pages, versión en dispositivos y pruebas de humo por perfil. Registrar resultado.
9. Reversión: recuperar el árbol estable mediante un commit de restauración, sin reescribir historial; usar identificador de caché nuevo y verificar actualización PWA. Si hubo migración de servidor/datos, plan específico; no restaurar hojas a ciegas.

## Protección comercial
- Cada negocio usa su propia hoja y URL /exec. La URL de MAIN pertenece a la instalación activa: jamás reutilizarla en una plantilla para un tercero.
- No almacenar contraseñas, tokens, datos de clientes ni copias de hojas en Git. La URL pública no sustituye autenticación.
- Mantener históricos y pruebas; no eliminar archivos sin mapa de referencias (HTML, JS, manifiestos, service worker, documentación, CI) y aprobación independiente.
- Recursos del proveedor son herramientas locales, no un servicio remoto de licencias ni un control de acceso.
- Para nuevos clientes, preparar copia aislada y validar conexión antes de inicializar. No reinicializar instalaciones existentes.
- La voz depende del dispositivo y permisos. No prometer avisos con aplicación cerrada sin infraestructura de push.

## Hoja de ruta
- Estable de referencia 3.1.49 (`bf445362ecf1109b6c343acebcaf0f0fb50b7282`); conservar ramas estable/3.1.49, estable/3.1.48 y estable/3.1.47. CI 445/445 y 13 suites de navegador; Pages exitoso.
- Candidata 3.1.50: monitoreo, previa coordinación de servidor; validar GPS real y entregas múltiples. MAIN debe permanecer intacta hasta superar pruebas y recibir autorización expresa de publicación.
- Archivo histórico `archivo/historico-2026-11-27` (`918f5361fcaf0810bdfd1407c72107dac92db469`) conserva el inventario de las ramas y los cuatro tips independientes. No integrar a MAIN. Retirar ramas antiguas solo tras verificar cada SHA y su alcance en el archivo; las pruebas usan SHA históricos que permanecen accesibles. No borrar datos, archivos ni historial Git.
- Depuración: eliminar del árbol activo solo documentos obsoletos verificados, con recuperación por SHA y sin afectar pruebas ni instalación. No eliminar ramas con commits únicos ni reescribir historial.
- Caja anual y comercialización: cambios separados.

- Candidata 3.1.50: servidor 30132 obligatorio para habilitar monitoreo y GPS por lote; mínimo comercial 30129, pantalla 3.1.50, caché app-3.1.63-monitoreo-final. No publicar hasta confirmar CI del SHA, respaldo de hoja/script y prueba GPS física. La fuente estable sigue intacta.


### Endurecimiento 3.1.50 / servidor 30132 (solo candidata)
- Base estable: bf445362ecf1109b6c343acebcaf0f0fb50b7282. Candidata anterior aprobada: c0d37ec2cd7f89f19fdbc37d9e2ada41e5f0d268. No publicar ni desplegar sin autorización.
- GPS: una lectura por lote (máx. 50 pedidos), candado existente, identificación persistente de muestra en el ID de rastreo, conciliación de escritura parcial y corte de recorrido en la bitácora ya existente. No se crean columnas ni hojas; la URL /exec y el mínimo comercial 30129 no cambian. La recuperación de GPS con versión anterior conserva el endpoint individual; la candidata múltiple exige 30132.
- Simulación de carga: 10 motorizados, 30 pedidos, 480 minutos virtuales y reintentos; no certifica tiempos reales, cuotas de Apps Script ni batería. El cambio Wi-Fi/datos se simula con eventos de red.
- Reversión: tras un eventual despliegue autorizado, restaurar el árbol de la estable por commit sin reescribir historial y generar una caché inédita; validar sesiones de los tres perfiles y conservar la URL de Apps Script. No restaurar ciegamente las hojas ni eliminar rastreo/bitácora. El 30132 mantiene las acciones del 30130; antes de un rollback de servidor, hacer respaldo y prueba en copia de negocio. Prueba de service worker local con datos ficticios.
- Puerta física: dos dispositivos motorizados, tres pedidos por motorizado, dos locales, seguimiento restaurante/cliente, pérdida y regreso de señal, reasignación M-X-M, sesión cerrada, Safari/PWA/Android, y verificación del backend 30132 y Cloudflare. No certificar GPS en segundo plano ni con teléfono bloqueado.

### Consolidación definitiva
- Candidata principal anterior `0ddc06bdee807d4ced707c04de0cdead18b2dda6` (482 pruebas y 15 suites, CI 46057483039); candidata alternativa preservada `9708ed13d566682a28f2f404608f9c7135e962bf`. Se conserva el contrato de lote y los cortes de bitácora de la primera, incorporando identificación de tramo emitida por servidor, descarte de permisos revocados, confirmación en dos fases y cobertura visual de la segunda. No se integra por mezcla automática ni se sobrescribe la rama alternativa.
- Pantalla 3.1.50, fuente de servidor 30132 (sin desplegar), caché app-3.1.63-monitoreo-final. Pruebas nuevas de carreras de reasignación y permisos. Verificar CI exacto y prueba física antes de publicar.

### Corrección focalizada de mapas 403 / pantalla 3.1.50
Incidente observado en MAIN tras publicación: OSM denegó cuadros, la pantalla enviaba no-referrer y el SW conservaba imágenes opacas en fotos-1. Ajustar ambos renderizadores para origen válido y CORS, validar estado HTTP, respetar caché HTTP normal y retirar solo cuadros OSM antiguos. Mostrar aviso si falla sin modificar coordenadas, pedidos, almacenamiento de fotos o servidor 30132. Cache nueva app-3.1.64-mapa-403. Sin probar contra proveedor real hasta validar en navegador físico. Rama candidata antes de publicar.


## Candidata de entrega 3.1.58 — 27/11/2026

- MAIN permanece en pantalla 3.1.52, fuente servidor 30133, commit `3151d235f23d4446327aad24a4d7f468732c0fe1`. Despliegue efectivo de Apps Script no verificado.
- Base de desarrollo aprobada 3.1.56: `312d413dbad94d7c40646fb6385f561aa76fe15a`, [CI completo](https://github.com/andagoya2025-design/pedidos/actions/runs/46103897326).
- Base funcional inmediata 3.1.57: `c51f8781c7da83d2124abe0e07e48276b540a4df`, [CI](https://github.com/andagoya2025-design/pedidos/actions/runs/46104306451). Verificar conclusión final; pruebas unitarias aprobadas al preparar este documento.
- Candidata 3.1.58: pantalla 3.1.58, servidor 30138 idéntico al de 3.1.57, caché app-3.1.73-consolidacion. Mínimo comercial 30129 se conserva por compatibilidad; para certificar inventario completo instalar y comprobar 30138.
- No publicar, fusionar ni instalar hasta autorización expresa, CI verde del SHA exacto, respaldo coordinado y validación en instalación de ensayo. Los datos reales no se han modificado.
- Los apartados históricos siguientes se preservan como registro; las versiones vigentes se verifican mediante código, SHA y CI.
