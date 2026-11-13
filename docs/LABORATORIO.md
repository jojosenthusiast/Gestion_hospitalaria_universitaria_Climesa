# Flujo de laboratorio

- MED crea una orden desde una consulta abierta o firmada.
- LAB consulta la cola, toma la muestra, captura resultados y completa la orden.
- MED revisa la orden completada y libera los resultados.
- PAC consulta únicamente resultados revisados.
- Se respetan versiones, transiciones de estado, permisos y auditoría.

Rutas principales: 
- GET /api/v1/laboratorio/catalogo
- GET /api/v1/laboratorio/ordenes
- POST /api/v1/laboratorio/ordenes
- POST /api/v1/laboratorio/ordenes/:id/muestra
- POST /api/v1/laboratorio/ordenes/:id/resultados
- POST /api/v1/laboratorio/ordenes/:id/completar
- POST /api/v1/laboratorio/ordenes/:id/revisar
- POST /api/v1/laboratorio/ordenes/:id/cancelar

El bloque utiliza las tablas existentes del esquema laboratorio; no agrega una migración.
