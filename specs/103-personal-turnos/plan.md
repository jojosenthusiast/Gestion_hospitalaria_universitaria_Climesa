# 103. Plan

## Backend
Módulo `Personal`: comandos `CrearPersonal`, `EditarPersonal`, `RegistrarInscripcion`, `CrearTurno`, `MoverTurno`, `CancelarTurno`, `PublicarRango`; consultas `Cobertura`, `MisTurnos`, `MedicosDeTurno`. Trabajo programado cada minuto que pasa turnos a "en curso" y "completado" (con reloj sustituible en pruebas).

## Base de datos
`0004_personal.sql`: `personal.persona`, `inscripcion`, `turno` con `EXCLUDE USING gist (persona_id with =, periodo with &&) where (estado <> 'cancelado')`. Las reglas de descanso y duración se validan en la API dentro de la transacción con bloqueo de los turnos de la persona (`FOR UPDATE`). Políticas: `turnos.duracion`, `turnos.descanso`, `turnos.horas_semanales`, `turnos.cobertura_minima`.

## Eventos de tiempo real
`turno.publicado`, `turno.cambiado` (usuario afectado, rol JOP, público para médicos de turno).

## Clientes
Web: planificador semanal con bloques y franja de cobertura. Móvil: lista de mis turnos.

## Pruebas
Traslape secuencial y concurrente, descanso, duración, cobertura con huecos, transición automática de estados.

## Riesgos
Un calendario arrastrable en web cuesta tiempo: primera versión con formulario y vista semanal de solo lectura; arrastrar es mejora.
