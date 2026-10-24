# 105. Plan

## Backend
Módulo `Atencion` (fila y citas). Emisión: `UPDATE atencion.contador_fila SET ultimo = ultimo + 1 ... RETURNING` con fila creada el primer número del día (`INSERT ... ON CONFLICT DO UPDATE`), dentro de la transacción del ticket. Disponibilidad: franjas de 20 min (política) dentro de los turnos del médico menos citas activas.

## Base de datos
`0006_atencion.sql` (parte 1): `contador_fila`, `ticket_fila` (UNIQUE servicio, fecha, numero), `cita` con `EXCLUDE (medico_id with =, horario with &&) where estado in ('solicitada','confirmada')`.

## Eventos de tiempo real
`fila.emitido`, `fila.llamado`, `fila.estado`, `cita.confirmada`, `cita.cancelada`.

## Clientes
Número grande en app con vibración al ser llamado; bandeja de solicitudes en recepción; pantalla pública en modo televisor.

## Pruebas
50 emisiones concurrentes; cambio de día con reloj de prueba; citas traslapadas concurrentes; cancelación fuera de plazo.

## Riesgos
Solicitudes de cita sin turno publicado no tienen horarios: la app lo explica ("Aún no hay horarios publicados").
