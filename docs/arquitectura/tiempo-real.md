# Tiempo real: catálogo de eventos

Requisitos: REQ-PLT-06 (nada de recargar), REQ-AMB-02 (ambulancia en tiempo real). Decisiones: D-027, D-060. ADR-0005.

> Catálogo regenerado desde el código (Fase 1, DAT-06). La lista de tipos vive en `api/src/platform/event-types.ts` y se publica en el contrato como `TipoEvento`.

## Cómo viaja un cambio

```mermaid
sequenceDiagram
  participant C1 as Cliente que actúa
  participant API as API NestJS / Fastify
  participant DB as PostgreSQL (Supabase)
  participant RT as Supabase Realtime
  participant C2 as Otros clientes suscritos
  C1->>API: POST /admisiones/{id}/cama (clave de idempotencia)
  API->>DB: BEGIN; ocupación + outbox; COMMIT
  DB-->>RT: disparador realtime.send(canal, evento delgado)
  API-->>C1: 200 con el resultado
  RT-->>C2: EventoDelgado {seq, tipo: "cama.estado_cambiado", entidad, id, version, ocurrido}
  C2->>API: GET /camas/tablero (con su permiso)
  API-->>C2: estado actual filtrado por permiso
```

Reglas: si la transacción falla, no hay evento. El cliente ignora eventos con versión menor o igual a la que ya tiene. Al reconectarse, pide el estado completo en lugar de esperar mensajes perdidos.

Reconexión en la web: no hay sondeo periódico. Al volver un canal a `SUBSCRIBED` tras una caída, o al dispararse el evento `online` del navegador, la web hace una sola consulta de recuperación a `GET /eventos?after=<cursor>`, invalida todas las vistas (suben `version` y cada pantalla vuelve a pedir lo suyo) y refresca el perfil si cambió una cuenta de usuario. Si esa consulta falla, no se reintenta por reloj: queda pendiente hasta la siguiente reconexión. La banda muestra tres estados: en vivo (sin banda), recuperando la conexión y sin conexión.

### Cursor de recuperación (`GET /eventos`)

- Sin `after`, o con `after=0`, la API devuelve la cabeza actual (`{cursor, events: []}`) y ningún evento viejo: un cliente sin punto de partida no necesita el historial porque invalida todo al reconectar.
- Con `after=<seq>` devuelve hasta 200 eventos posteriores, ordenados, y `cursor` es el último `seq` devuelto. Si había más de 200, el cliente vuelve a llamar con ese cursor.
- Los canales de cada evento se derivan del catálogo de permisos (`acceso.rol_permiso`) al momento de emitirlo, no de listas de roles en el código. Los eventos de un paciente incluyen además `usuario:<id>` de la cuenta vinculada a ese paciente.

### Limitación conocida del cursor

`seq` se asigna al insertar en `plataforma.outbox`, pero la fila solo se ve cuando la transacción hace commit. Si una transacción lenta obtiene un `seq` menor que otra que confirma antes, y un cliente ya avanzó su cursor más allá de ese `seq`, el evento tardío queda por debajo del cursor y esa consulta de recuperación no lo devuelve. No se corrige en el código. Los clientes lo mitigan porque, al reconectar, invalidan todas las vistas y vuelven a pedir su estado completo; el cursor solo acota cuántos eventos se leen, no es la fuente de verdad.

## Evento delgado (esquema único)

El broadcast en vivo y `GET /eventos` entregan la misma forma, publicada en el contrato como `EventoDelgado` (DAT-06, migración `20261116002000_fase1_contrato_api.sql`):

| Campo | Tipo | Nota |
|---|---|---|
| `seq` | texto (entero de 64 bits) | Posición en `plataforma.outbox`. Sirve de cursor: el cliente la guarda también con los eventos en vivo. |
| `tipo` | `TipoEvento` (enum del contrato) | Nombre del evento, tabla de abajo. También es el `event` del broadcast. |
| `entidad` | texto | `cita`, `ticket_fila`, `cama`, ... o `publico` / `metricas` en los eventos agregados. |
| `id` | texto | Id de la entidad (uuid) o una clave agregada en `publico` (`ocupacion`, `fila:<servicio>`, `medicos_de_turno`). |
| `version` | entero | Versión de la entidad tras el cambio. |
| `ocurrido` | fecha y hora ISO | Momento de inserción en el outbox. |

`GET /eventos` agrega `type` y `entity`, alias obsoletos de `tipo` y `entidad` que se retiran cuando web y Android lean los nombres en español. Un cliente nuevo (iOS) usa solo `tipo` y `entidad`.

## Canales

| Canal | Quién puede escuchar | Estado |
|---|---|---|
| `publico` | Cualquiera, incluida la pantalla pública sin sesión | Emitido (eventos agregados sin datos personales) |
| `rol:<codigo>` | Usuarios con ese rol | Emitido; los roles se derivan de `acceso.rol_permiso` con `channelsFor` |
| `usuario:<id>` | Solo ese usuario (incluye al paciente) | Emitido |
| `ambulancia` | Lo concede `acceso.canales_de` a REC, JOP y PAR | Emitido |
| `area:<espacio>` | Personal con turno en curso en esa área | Planificado; ningún evento lo usa todavía |
| `paciente:<id>` | Equipo con relación de atención con ese paciente | Planificado; ningún evento lo usa todavía |

## Eventos

Fuente única: `api/src/platform/event-types.ts` (enum `TipoEvento` del contrato). `api/tests/contrato-api.spec.ts` falla si el código o una migración emiten un tipo que no está ahí, o si la lista tiene uno que nadie emite. Los canales `rol:*` salen de los permisos indicados.

| Evento | Entidad | Emite | Canales (permiso → roles) | Spec |
|---|---|---|---|---|
| `paciente.creado` / `paciente.actualizado` | `paciente` | Registro y edición de ficha | Permisos de pacientes y `usuario:<cuenta del paciente>` | 102 |
| `caso_duplicado.abierto` | `caso_duplicado` | Registro con posible duplicado | `rol:REC` | 102 |
| `usuario.actualizado` | `usuario` | Invitar, roles, desactivar | `rol:ADM`, `usuario:<id>` | 101 |
| `personal.actualizado` | `personal` | Ficha e inscripción | `rol:ADM`, `rol:JOP` | 103 |
| `turno.actualizado` / `turno.publicado` | `turno` | Planificar, publicar, cambio de estado por reloj | `rol:JOP`, `rol:ADM`, `usuario:<persona>` | 103 |
| `turno.publicado` / `turno.cambiado` | `publico` | Derivado en la base (turnos de médicos) | `publico` | 112 |
| `espacio.actualizado` | `espacio` | Crear o editar espacio | `camas.ver_tablero`, `espacios.ver` | 104 |
| `cama.estado_cambiado` | `cama` | Bloqueo, limpieza, asignación, traslado, salida | `camas.ver_tablero` (y `espacios.ver` desde infraestructura) | 104, 108 |
| `cama.estado_cambiado` | `publico` | Derivado en la base (ocupación agregada) | `publico` | 112 |
| `cama.limpieza_pendiente` | `cama` | Solicitar limpieza | `camas.ver_tablero`, `espacios.ver` | 104 |
| `cita.actualizada` | `cita` | Agendar, solicitar, confirmar, rechazar, cancelar, atender (al firmar) | `citas.ver` (sin `propio`), `usuario:<paciente>` | 105 |
| `fila.actualizada` | `ticket_fila` | Emitir, llamar, atender, completar, ausencia, iniciar consulta desde la fila | `fila.ver`, `fila.llamar`, `fila.gestionar`, `usuario:<paciente>` | 105 |
| `fila.llamado` / `fila.estado` | `publico` | Derivado en la base (número sin nombre) | `publico` | 112 |
| `consulta.actualizada` | `consulta` | Iniciar, borrador, signos, diagnóstico, receta, firmar | `expediente.ver` y el permiso del paso; al firmar, `usuario:<paciente>` | 106 |
| `laboratorio.actualizado` | `orden_laboratorio` | Ordenar, muestra, resultado, completar, cancelar | `laboratorio.ver_cola`, `resultados.ver` (el paciente solo al revisar) | 107 |
| `laboratorio.critico` | `orden_laboratorio` | Resultado con marca crítica | `resultados.ver`, `laboratorio.ver_cola` (nunca el paciente) | 107 |
| `admision.creada` / `admision.actualizada` / `admision.cama_asignada` | `admision` | Admisión, indicación, cama, autorizar, notas, alta, salida, traslado | `admision.ver`, `camas.asignar` o `camas.ver_tablero` | 108 |
| `ambulancia.estado_cambiado` | `unidad` o `solicitud` | Mantenimiento, despacho, descarte, cierre | `ambulancia`, `ambulancia.despachar`, `usuario:<solicitante>` | 109 |
| `ambulancia.solicitud_creada` | `solicitud` | Solicitud de paciente o recepción | `ambulancia`, `ambulancia.despachar`, `usuario:<paciente>` | 109 |
| `ambulancia.hito` | `servicio` | Hito del servicio | `ambulancia`, `usuario:<paciente solicitante>` | 109 |
| `ambulancia.prehospital` | `servicio` | Reporte prehospitalario | `ambulancia`, `ambulancia.recibir_prehospital` | 109 |
| `ambulancia.ubicacion` | `servicio` | Ubicación en vivo | `ambulancia` | 109 |
| `vinculacion.solicitada` / `vinculacion.resuelta` | `vinculacion_paciente` | Solicitud, aprobación o rechazo | `cuentas.verificar`, `usuario:<solicitante>` | 101 |
| `inventario.actualizado` | `articulo` | Movimiento | `inventario.ver` | 111 |
| `inventario.bajo_minimo` | `articulo` | Movimiento o mínimo que cruza el umbral | `inventario.mover` según tipo de artículo | 111 |
| `aviso.publicado` | `aviso` | Publicar aviso | `publico` | 112 |
| `metricas.recalculadas` | `metricas` | Derivado en la base cuando cambia un indicador | `metricas.ver` | 113 |

### Eventos del catálogo anterior que no se emiten

El catálogo original nombraba eventos finos por transición. La API emite un evento por entidad (`*.actualizada`) y el cliente decide qué volver a pedir por `entidad`, no por la transición. Equivalencias:

| Nombre anterior | Se emite como |
|---|---|
| `cita.confirmada`, `cita.cancelada` | `cita.actualizada` |
| `fila.emitido`, `fila.llamado`, `fila.estado` (con datos) | `fila.actualizada` (los nombres `fila.llamado` y `fila.estado` quedan solo para el canal `publico`) |
| `consulta.firmada` | `consulta.actualizada` |
| `lab.orden_creada`, `lab.estado_cambiado`, `lab.revisado` | `laboratorio.actualizado` |
| `lab.valor_critico` | `laboratorio.critico` |
| `turno.cambiado` (con datos) | `turno.actualizado` |

Pendientes (no emitidos; su spec no está implementada): push con la app cerrada (`PUT /me/dispositivos`), y los canales `area:*` y `paciente:*`.

## Límites conocidos

- **Pantalla de auditoría (W32, `#/auditoria`).** La web la sirve con la `version` del canal en vivo, pero ninguna mutación emite hoy un evento de auditoría: las filas de `plataforma.auditoria` no pasan por el outbox. La pantalla solo se refresca cuando llega otro evento (que sube `version`), al reconectar o al recargar a mano. No hay evento `auditoria.*` en el catálogo; crearlo queda fuera de este corte y se decide con 110-T04.
