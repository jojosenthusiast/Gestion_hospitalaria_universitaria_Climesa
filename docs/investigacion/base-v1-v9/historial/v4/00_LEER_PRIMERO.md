# CLIMESA — iteración 4
Compras, cuentas por pagar, inventario y circuito del medicamento.
Fecha de revisión: 12/10/2026. Estado: investigación ampliada y especificaciones candidatas; sin cambios a la aplicación.

## Resultado de esta iteración
La base de Aldara tiene movimientos de stock y protección concurrente por lote, pero no un circuito hospitalario verificable de adquisición, custodia, prescripción, dispensación, administración y costo. Las brechas son de modelo y relaciones, no únicamente de pantallas.

Esta entrega desarrolla:
- Compras multilínea, recepción parcial, inspección/cuarentena, devolución y cotejo de factura.
- Inventario por ubicación, propietario, lote, condición y unidad; valoración y cierre.
- Medicación estructurada, validación farmacéutica, preparación, entrega, eMAR, devoluciones, retiro y continuidad.
- Eventos y efectos económicos distintos para custodia, consumo, cargo, CxP y asiento.
- 44 criterios de aceptación nuevos y 14 tareas con dependencias.
- Referencias oficiales/técnicas y artículos, con nivel de lectura y límites.

## Lectura y continuidad
01 documenta evidencia del código; 02–05 los contratos operativos; 06 permisos/tareas y migración; 07 fuentes; 08 decisiones locales pendientes.
historial contiene v1, v2 y v3 como documentos históricos sin duplicación recursiva. Se preservan sus nombres/contenidos; v4 precisa este grupo y no invalida avances previos.

## Límites
No se realizaron pruebas clínicas, build, SQL, migraciones, transmisiones ni conexiones con CLIMESA. El catálogo no demuestra que el hospital use un producto concreto. Los procesos propuestos no son SOP aprobados del establecimiento.
El lineamiento SRS de controlados se identificó en la ficha oficial; su PDF no se pudo leer. No se inventaron artículos, periodicidad de libros, plazos de notificación, tasas ni listas farmacológicas.
La literatura de barcode no prueba resultados en CLIMESA; sirve para diseñar evaluación y controles frente a atajos operativos.

## Próximo grupo definido
Laboratorio, imagen e interfaces: orden, muestra/estudio, aceptación, calidad, resultado/informe, críticos, correcciones y continuidad postalta. Integra las identidades/atenciones de v3 y los cargos/costos de v2–v4.

