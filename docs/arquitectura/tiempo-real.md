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

> Desde la migración `20261119004000_tiempo_real_canales_ampliados.sql`, la base amplía en `plataforma.outbox` los canales de turnos, personal, usuarios, duplicados, ambulancia, avisos, citas (médico) y admisiones (paciente). Los canales que siguen son los que pone la API; la ampliación está en "Cobertura entre plataformas".

Fuente única: `api/src/platform/event-types.ts` (enum `TipoEvento` del contrato). `api/tests/contrato-api.spec.ts` falla si el código o una migración emiten un tipo que no está ahí, o si la lista tiene uno que nadie emite. Los canales `rol:*` salen de los permisos indicados.

| Evento | Entidad | Emite | Canales (permiso → roles) | Spec |
|---|---|---|---|---|
| `paciente.creado` / `paciente.actualizado` | `paciente` | Registro y edición de ficha | Permisos de pacientes y `usuario:<cuenta del paciente>` | 102 |
| `caso_duplicado.abierto` | `caso_duplicado` | Registro con posible duplicado | `rol:REC` | 102 |
| `usuario.actualizado` | `usuario` | Invitar, roles, desactivar | `rol:ADM`, `usuario:<id>` | 101 |
| `personal.actualizado` | `personal` | Ficha e inscripción | `rol:ADM`, `rol:JOP` | 103 |
| `signos.registrados` | `paciente` | Toma de signos vitales fuera de consulta | `signos.registrar` y `expediente.ver` | 106 |
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

## Cobertura entre plataformas (auditoría 2026-11-14)

Requisito del dueño: lo que un rol cambia en una plataforma aparece en las demás sin recargar (un turno asignado en la web aparece en Android; una cita agendada en iOS aparece en la web y se atiende en Android).

**No se usa `postgres_changes`.** La publicación `supabase_realtime` no tiene tablas, a propósito: los clientes nunca leen tablas de Supabase (regla 4). Los cambios viajan como Broadcast desde `plataforma.outbox` (`outbox_publicar`) y la autorización es la política `sghu_escuchar_canales` sobre `realtime.messages` (`realtime.topic() = any(acceso.canales_actuales())`). Por eso la privacidad no depende de las RLS de cada tabla: el evento es delgado (tipo, entidad, id, versión) y cada cliente vuelve a pedir el dato a la API con su permiso.

Revisión de producción (solo lectura, 2026-11-14): la publicación existe con 0 tablas, la política `sghu_escuchar_canales` está activa, los disparadores `outbox_derivar` y `outbox_publicar` existen, y los 17 grupos de eventos del outbox tienen `publicado_en` (ninguno atascado).

### Matriz

"Web" y "Android" indican si la pantalla vuelve a pedir sus datos al llegar el evento. "Canales" es quién recibe el evento después de la migración `20261119004000_tiempo_real_canales_ampliados.sql`.

| Módulo | Entidad del evento | Web | Android | Canales (permiso → roles) | Antes de esta revisión |
|---|---|---|---|---|---|
| Turnos | `turno` | Sí: `/turnos`, `/citas`, `/ambulancia`, médicos disponibles al ingresar | Sí: planificación, mis turnos, citas, ingreso guiado, ambulancia del portal | JOP, ADM, la persona del turno y todo rol con `turnos.ver` | Solo JOP y ADM: REC, MED, ENF, PAR y AST no veían turnos nuevos |
| Citas | `cita` | Sí: citas, agenda del médico, fila | Sí: citas de recepción y del paciente, consulta, tablero | `citas.ver` (sin propio), el paciente y la cuenta del médico de la cita | El médico nunca recibía la cita (su `citas.ver` es propio). Android no refrescaba horarios libres al cambiar un turno |
| Fila | `ticket_fila` | Sí | Sí | `fila.ver`, `fila.llamar`, `fila.gestionar`, el paciente | Sin cambio |
| Consultas | `consulta` | Sí | Sí | `expediente.ver` y el permiso del paso; el paciente al firmar | Sin cambio |
| Laboratorio | `orden_laboratorio` | Sí | Sí | `laboratorio.ver_cola`, `resultados.ver`; el paciente al revisar | Sin cambio |
| Admisiones y camas (incluye el bloqueo por aislamiento, `20261119004100`) | `admision`, `cama`, `espacio` | Sí; el mapa de camas del ingreso también sigue `espacio` | Sí; el ingreso guiado (A34) ahora recarga médicos y mapa de camas en vivo | `admision.ver`, `camas.*`, `espacios.ver` y la cuenta del paciente internado | El paciente no recibía su admisión; el ingreso guiado de Android no estaba suscrito |
| Ambulancia | `unidad`, `solicitud`, `servicio` | Sí; la tripulación de turno sigue `turno` | Sí; el portal ya no recarga con cada ubicación en vivo | Canal `ambulancia` y roles con `ambulancia.ver_estado` o `ver_bitacora` (MED, DPD...); la ubicación en vivo solo en `ambulancia` | MED y DPD no recibían cambios de estado ni bitácora |
| Inventario | `articulo` | Sí | Sí | `inventario.ver`, `inventario.mover` | Crear, editar o eliminar un artículo y crear o editar un lote no emitían evento; ahora los emite la base (`20261119004100`) |
| Signos vitales | `paciente` | Sí: expediente e historial | Sí: signos | `signos.registrar`, `expediente.ver` | Sin cambio |
| Avisos | `aviso` | Sí: `/me/avisos`, `/avisos` | Sí: avisos del tablero | Público: `publico` y toda cuenta con sesión (`sesion.perfil`). Dirigido: sus roles. Siempre: `avisos.publicar` | Un aviso público solo iba a `publico`, que web y Android no escuchan con sesión: no aparecía hasta recargar |
| Pacientes y duplicados | `paciente`, `caso_duplicado` | Sí | Sí | Permisos de pacientes; duplicados a `pacientes.gestionar_duplicados` | Duplicados solo a REC (JOP también los revisa) |
| Personal y usuarios | `personal`, `usuario` | Sí | Sí | ADM, JOP y roles con `personal.ver` o `usuarios.ver` | DPD no recibía cambios de usuarios |
| Vinculación de cuentas | `vinculacion_paciente` | Sí | Sí | `cuentas.verificar`, el solicitante | Sin cambio |
| Información pública | `publico` | Sí (pantalla sin sesión, canal `publico`) | No (ver límites) | `publico` | Sin cambio |
| Métricas | `metricas` | Sí | Sí (tablero) | `metricas.ver` | Sin cambio |
| Auditoría | — | Bajo demanda (cada lectura se audita) | No aplica | — | Por diseño |

### Volver a la app o a la pestaña

Un socket puede quedar muerto sin cerrarse (teléfono bloqueado, equipo suspendido). Ninguna plataforma consulta por reloj; recupera al volver:

- **Web** (`web/src/lib/live.ts`): al volver a ver la pestaña tras al menos 30 s oculta (`RESUME_STALE_MS`), al restaurarse desde la caché de páginas (`pageshow` persistido) o con el evento `online`, hace una consulta de recuperación a `GET /eventos` e invalida todas las vistas. Un vistazo corto a otra pestaña no pide nada.
- **Android** (`data/realtime/AppWakeups.kt`): cuando la app vuelve al frente tras al menos 30 s en segundo plano, o cuando la red vuelve tras perderse (`ConnectivityManager`, permiso `ACCESS_NETWORK_STATE`), el repositorio cierra el socket y reconecta sin esperar el reintento. Luego recupera desde el cursor y emite `Resync`, y cada ViewModel vuelve a pedir sus datos. Se usan los callbacks de `Application`, sin `lifecycle-process`.

### Límites que quedan

- **Eventos que emite la base y no la API:** `20261119004100_tiempo_real_eventos_faltantes.sql` emite `inventario.actualizado` al cambiar artículos o lotes, y `cama.estado_cambiado` por cada cama que se bloquea o libera por aislamiento (el bloqueo manual lo anuncia la API). Cuando la API los emita, el disparador sobra y se retira con su reversión.
- **Android, información pública:** `HospitalInfoViewModel` se suscribe solo a `publico`, que el repositorio descarta. Se pone al día al abrirse.
- **Android, Mis datos y Mis accesos:** no están suscritos. Mis datos se edita solo por el propio paciente, y Mis accesos lee una función retirada (`20261117002000`).
- **Consulta en Android:** el diálogo no sigue `signos.registrados` tomados fuera de la consulta.
