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
3.1.31: avisos de cliente y ampliación de motorizados, reutilizando voz y lecturas existentes cuando sea posible. Caja anual y mejoras de comercialización: cambios separados. No asignar fechas ni versiones definitivas sin verificar MAIN.
