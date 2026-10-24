# 110. Plan

## Backend
Módulo `Privacidad` con un servicio `ContextoDeAcceso` que todos los módulos con datos de paciente usan antes de responder (contrato). Filtrado con proyecciones por perfil de campos definidas en código y probadas contra `privacidad.md` (prueba que lee la tabla del documento). Trabajo que vence accesos.

## Base de datos
`0010_privacidad.sql`: `acceso_excepcional` (CHECK aprobado_por distinto de solicitante), índices de auditoría por paciente y fecha.

## Eventos de tiempo real
`acceso.solicitado`, `acceso.resuelto`.

## Clientes
Bandeja del delegado en web; botón "pedir acceso" en el estado "sin permiso"; pantalla de transparencia del paciente.

## Pruebas
Una prueba por fila de la tabla de campos de `privacidad.md` (rol por campo), escenarios 1 a 4, vencimiento con reloj de prueba.

## Riesgos
Olvidar el filtrado en un endpoint nuevo: la prueba de arquitectura exige que todo endpoint que devuelve un DTO de paciente pase por `ContextoDeAcceso`.
