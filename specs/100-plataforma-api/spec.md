# 100. Plataforma de la API

**Estado:** En revisión · **Semanas:** S1, S2 · **Depende de:** ninguna · **Investigación:** R20; legado spec 000 (FR-001 a FR-031); notas/02, 03

## Objetivo

La base común sobre la que corren todos los módulos: autenticación del token de Supabase, permisos, transacción, idempotencia, auditoría encadenada, outbox con publicación en tiempo real, políticas con vigencia, errores uniformes y contrato OpenAPI. Si esta spec falla, ninguna otra se puede demostrar.

## Alcance
- Dentro: trabajador de notificaciones push, proyecto ASP.NET Core, conexión a Supabase PostgreSQL, validación JWT, `CommandRunner`, idempotencia, auditoría, outbox y disparador `realtime.send`, políticas, reloj, errores, OpenAPI, salud, registro de eventos sin datos sensibles, contenedor.
- Fuera: lógica de dominio (cada módulo).

## Requisitos

| ID | Requisito (EARS) | Nivel | Origen |
|---|---|---|---|
| FR-100-01 | Cuando llega una solicitud a `/api/v1`, el sistema debe validar el JWT de Supabase (firma, emisor, audiencia, vencimiento) y rechazar con 401 cualquier token inválido. | R | REQ-PLT-05; ADR-0004 |
| FR-100-02 | Cuando un endpoint declara un permiso, el sistema debe comprobarlo contra las asignaciones de rol vigentes del usuario antes de ejecutar y responder 403 si no lo tiene. | R | D-010 |
| FR-100-03 | Si un intento es denegado, entonces el sistema debe auditarlo en una transacción separada que no dependa del resultado de la orden. | R | legado 000 FR-018 |
| FR-100-04 | Cuando se ejecuta una orden que cambia estado, el sistema debe hacerlo en una sola transacción que incluya el efecto, la auditoría y los eventos del outbox. | R | D-008 |
| FR-100-05 | Cuando una orden llega con una clave de idempotencia ya usada y el mismo contenido, el sistema debe devolver el resultado original sin repetir el efecto. | R | D-007 |
| FR-100-06 | Si la clave ya se usó con contenido distinto, entonces el sistema debe responder 409 y auditar el conflicto. | R | D-007 |
| FR-100-07 | El sistema debe registrar la auditoría en una tabla de solo inserción, encadenada por SHA-256 sobre JSON canónico, y permitir verificar la cadena completa. | R | D-009; Norma 1616 Art. 55-56 |
| FR-100-08 | Cuando se confirma una transacción con eventos en el outbox, el sistema debe publicarlos en Supabase Realtime en los canales indicados, sin datos personales ni clínicos. | R | D-060, ADR-0005 |
| FR-100-09 | Si la transacción se revierte, entonces no se debe publicar ningún evento. | R | D-060 |
| FR-100-10 | El sistema debe resolver cada política configurable por clave y fecha de vigencia, y fallar de forma explícita si no hay política vigente. | R | D-005; legado 000 FR-023 |
| FR-100-11 | El sistema debe responder errores con un formato único (código estable, mensaje en español, campo afectado, id de correlación) y nunca exponer trazas ni SQL. | R | R20 |
| FR-100-12 | Cuando una edición llega con una versión distinta a la vigente, el sistema debe responder 409 con la versión actual. | R | D-007 |
| FR-100-13 | El sistema debe publicar su contrato OpenAPI con los permisos de cada endpoint. | R | REQ-PLT-07; curso, entregable 2 |
| FR-100-14 | El sistema debe exponer `/salud` con el estado de la base de datos sin requerir sesión. | R | ADR-0008 |
| FR-100-15 | El sistema no debe escribir en sus registros de ejecución contenido clínico, tokens ni contraseñas. | R | REQ-PRV-05; Norma 1616 Art. 50; constitución 5.5 |
| FR-100-16 | El sistema debe usar una zona horaria fija `America/El_Salvador` para fechas locales y un reloj sustituible en pruebas. | R | legado 000 FR-025 |
| FR-100-17 | Donde la API recibe más de 20 búsquedas de pacientes por minuto de un mismo usuario, el sistema debe limitar y auditar. | E | R20 |
| FR-100-18 | El sistema debe ejecutarse como contenedor configurado solo por variables de entorno. | R | ADR-0008 |
| FR-100-19 | Cuando se confirma un evento marcado con push en `tiempo-real.md`, un trabajador debe enviarlo por FCM o APNs a los dispositivos registrados del destinatario, sin datos clínicos, una sola vez por evento. | E | ADR-0005 |

## Escenarios de aceptación

1. **Token vencido.** Dado un JWT vencido, cuando llama a `/api/v1/me`, entonces recibe 401 y no se ejecuta nada.
2. **Sin permiso.** Dado un paciente, cuando llama a `POST /api/v1/turnos`, entonces recibe 403 y la auditoría registra el intento denegado.
3. **Doble clic.** Dada una orden con clave K que asignó una cama, cuando se reenvía con la misma clave y contenido, entonces se devuelve la misma respuesta y existe una sola ocupación.
4. **Transacción fallida.** Dada una orden que falla después de escribir el outbox, cuando se revierte, entonces ningún cliente recibe el evento.
5. **Cadena alterada.** Dado un registro de auditoría modificado por un superusuario, cuando el delegado verifica, entonces la verificación señala el registro exacto.
6. **Edición concurrente.** Dadas dos ediciones con versión 3, cuando ambas se envían, entonces una pasa a versión 4 y la otra recibe 409.

## Reglas, datos, endpoints y pantallas
- Datos: tablas de plataforma en `docs/arquitectura/modelo-datos.md`.
- Endpoints: `/salud`, `/openapi`; todos los demás usan esta plataforma.
- Pantallas: W36 y estados comunes de los clientes.

## Preguntas abiertas
Ninguna bloqueante.
