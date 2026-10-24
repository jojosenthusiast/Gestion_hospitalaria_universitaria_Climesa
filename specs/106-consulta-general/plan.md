# 106. Plan

## Backend
Módulo `Consulta`. Firma: comando que bloquea la consulta, verifica inscripción (`Actor.RequireLicensed`, legado), cambia estado y emite `consulta.firmada`. Órdenes de laboratorio: el módulo publica `consulta.orden_laboratorio_creada` y laboratorio crea su orden (outbox interno, no lectura cruzada).

## Base de datos
`0006_atencion.sql` (parte 2): `consulta`, `signos_vitales`, `diagnostico`, `receta`, `receta_item`, `addendum`, `relacion_atencion`, `cie10` (semilla).

## Eventos de tiempo real
`consulta.firmada`; la orden genera `lab.orden_creada` en spec 107.

## Clientes
Pantalla de consulta por secciones (signos, motivo, diagnóstico, receta, órdenes) con guardado de borrador en el servidor; buscador CIE-10 con debounce.

## Pruebas
Firma con inscripción vencida, edición de firmada, orden que llega al laboratorio, auditoría de lectura del historial.

## Riesgos
Pantalla larga en móvil: se divide en pasos con un resumen antes de firmar.
