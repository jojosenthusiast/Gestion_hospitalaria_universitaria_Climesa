# 130. Calidad y pruebas de concurrencia

**Estado:** En revisión · **Semanas:** S1 a S5 · **Depende de:** todas · **Investigación:** ADR-0007; D-063; legado (37 pruebas, 29 comprobaciones de interfaz)

## Objetivo

Las "pruebas de concurrencia" de la semana 5 y la calidad que se evalúa en código y arquitectura (20%), con pruebas que se pueden ejecutar delante del docente.

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-130-01 | Cada caso de la tabla de ADR-0007 debe tener una prueba automática que lance operaciones simultáneas reales contra PostgreSQL. | R | D-063; cronograma S5 |
| FR-130-02 | Las pruebas de backend deben correr contra PostgreSQL real con las mismas migraciones de `supabase/migrations`. | R | constitución 6.4 |
| FR-130-03 | Debe existir integración continua en GitHub que compile backend, web y Android, ejecute pruebas y verifique los documentos generados en cada PR. | R | entregable repositorio |
| FR-130-04 | Debe existir un script de demostración de concurrencia que muestre en consola el resultado de dos operaciones simultáneas (cama, ambulancia, fila). | R | defensa en vivo |
| FR-130-05 | Las pruebas de arquitectura deben fallar si un módulo usa el interior de otro o si un endpoint con datos de paciente no pasa por el contexto de acceso. | R | ADR-0001; spec 110 |
| FR-130-06 | Debe existir una lista de pruebas manuales por pantalla para el equipo de pruebas, derivada del inventario. | R | D-029 |

## Escenarios de aceptación
1. **Demostración.** Dado el script `tools/demo-concurrencia`, cuando se ejecuta en la defensa, entonces muestra "cama HAB-203-B: 1 asignación confirmada, 1 conflicto" y lo mismo para la ambulancia y 50 números de fila.
