# 108. Plan

## Backend
Módulo `Hospitalizacion`. Algoritmo de sugerencias en dominio puro (función que recibe camas candidatas con su habitación y ocupantes, y la solicitud) para probarlo sin base de datos; la consulta trae candidatas desde `infra.v_estado_cama`. Asignación: transacción que bloquea la fila de la habitación (`SELECT ... FOR UPDATE` sobre `infra.espacio` de la habitación, por contrato del módulo infraestructura), revalida sexo y aislamiento, e inserta la ocupación (la exclusión decide la cama).

## Base de datos
`0008_hospitalizacion.sql`: `admision` (índice único parcial por paciente activo), `ocupacion_cama` con `EXCLUDE USING gist (cama_id with =, periodo with &&)`, `traslado`, `alta`, `nota_enfermeria`, vista `v_ocupacion_activa`.

## Eventos de tiempo real
`admision.creada`, `admision.cama_asignada`, `cama.estado_cambiado`, `admision.alta_firmada`.

## Clientes
Asistente en tres pasos (paciente, solicitud, cama) con sugerencias y motivos; conflicto manejado con la siguiente sugerencia; tablero actualizado en vivo.

## Pruebas
Unitarias del algoritmo (10 casos de la tabla de RN-05 y RN-06); integración concurrente de última cama y de sexo opuesto en habitación vacía; traslado VIP; aislamiento.

## Riesgos
La concurrencia de sexo opuesto necesita el bloqueo de la habitación; sin él la exclusión por cama no basta. Se prueba explícitamente.
