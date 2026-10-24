# 109. Plan

## Backend
Módulo `Ambulancia`. Despacho: `SELECT ... FROM ambulancia.unidad WHERE id = $1 FOR UPDATE`, valida estado Disponible y paramédico de turno (contrato con Personal), inserta servicio (índice único parcial como segunda barrera), actualiza estado y versión. Hitos con máquina de estados e idempotencia por clave del teléfono. Ubicación: tabla de alta frecuencia con retención de 30 días; el evento de Realtime lleva solo coordenadas del servicio y va al canal `ambulancia`.

## Base de datos
`0009_ambulancia.sql`: `unidad`, `cambio_estado_unidad`, `solicitud`, `servicio` (UNIQUE parcial unidad activa), `tripulacion`, `hito`, `reporte_prehospital`, `ubicacion`. Semilla: una unidad.

## Eventos de tiempo real
`ambulancia.estado_cambiado`, `ambulancia.solicitud_creada`, `ambulancia.hito`, `ambulancia.prehospital`, `ambulancia.ubicacion`.

## Clientes
Android de la tripulación con botones grandes y cola sin conexión en Room cifrada; web de despacho con sonido y mapa (Leaflet con OpenStreetMap); paciente con línea de tiempo.

## Pruebas
Despacho concurrente; Disponible sin paramédico; hitos fuera de orden; reenvío del prehospital con la misma clave; bitácora sin datos del paciente para JOP.

## Riesgos
El mapa depende de mosaicos externos: si fallan, se muestra la dirección en texto.
