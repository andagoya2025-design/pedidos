# Inventario del servidor

| Archivo | Clasificación |
| --- | --- |
| Codigo.gs | Fuente candidata 30131, instalar solo con coordinación expresa |
| Codigo_MiPedido_3.1.31.txt | Distribución candidata 30131, idéntica a Codigo.gs |
| Codigo_MiPedido_3.1.30.txt | Respaldo estable 30130 |
| Codigo_MiPedido_3.1.29.txt | Respaldo compatible anterior; no instalar por defecto |
| Pruebas.gs | Solo hoja de ensayo; nunca ejecutar en producción |

El mínimo comercial de pantalla sigue en 30129. El nuevo endpoint monitoreoSeguro exige servidor 30131; no publicar la candidata hasta confirmar el servidor. El despliegue de la fuente 30130 en Apps Script no está confirmado. No reinstalar para cambios exclusivamente web.

Versiones 3.1.18, 3.1.19, 3.1.20, 3.1.21, 3.1.27 y 3.1.28: retiradas del árbol activo para evitar instalaciones equivocadas. Recuperables desde [commit histórico 3.1.41](https://github.com/andagoya2025-design/pedidos/tree/ab5ff3845b56cfc6a824a5080096ecc24e5ab45b/servidor) y su historial Git. Mantener la prueba de identidad del TXT vigente y Codigo.gs.
