# Convenciones del contrato de la API

Requisitos: FR-100-06 (idempotencia), FR-100-11 (errores), FR-100-12 (versión). Auditoría 2026-11-13, Fase 1: CON-01, CON-02, CON-03, CON-06, CON-07, CON-09, API-10, API-11.

El contrato vive en `contrato/openapi.json`. Lo genera la API (`npm run api:generate` en `api/`) y el CI de la API falla si el archivo no está al día. `api/tests/contrato-api.spec.ts` exige que cada operación declare su respuesta tipada, sus errores problem+json y parámetros sin duplicar. Con eso se puede generar un cliente (Swift, Kotlin o TypeScript) solo desde el contrato.

## Nombres de los campos JSON (CON-06)

- Todo campo JSON va en **camelCase**. Ningún campo nuevo usa snake_case.
- Los campos que ya existen conservan su nombre: hay nombres en inglés de S1/S2 (`patientId`, `doctorName`, `start`) y en español (`expediente`, `numero`, `solicitanteId`). Renombrarlos rompería a web y Android sin beneficio para el usuario, y la auditoría no lo exige.
- Los campos nuevos siguen `AGENTS.md` §4.1: en español y camelCase (`fechaNacimiento`, `numeroFila`).
- Los campos snake_case que todavía devuelve alguna lectura quedan registrados en `docs/preguntas-abiertas.md` (sección de Fase 1, contrato). Se renombran con un alias temporal y con los clientes actualizados en la misma rama, nunca solo en la API.
- Fechas con hora: ISO 8601 en UTC (`2026-11-20T15:00:00.000Z`). Fechas sin hora: `yyyy-MM-dd` del día local de `America/El_Salvador`.

## Errores (CON-02)

Todo error responde `application/problem+json` con el esquema `Problem` del contrato:

| Campo | Uso |
|---|---|
| `codigo` | Código estable en snake_case. Es el enum `CodigoProblema`. **El cliente decide solo por `codigo`**, nunca por `detail` ni solo por el estado HTTP. |
| `detail` | Mensaje en español para mostrar. |
| `campo` | Campo del cuerpo o cabecera que causó el error, si aplica. El cliente lo resalta. |
| `requestId` | Correlación con los registros del servidor. El cliente lo muestra como "código de soporte". |
| `versionActual` | Solo en `version_conflicto`. |
| `disponibleDesde` | Solo en `personal_en_descanso`. |

La lista de códigos vive en `api/src/platform/problem-codes.ts`. Una prueba falla si el código lanza un `codigo` que no está ahí. Ejemplos de conflictos de negocio con código propio: `franja_ocupada` (otra cita tomó la franja; el cliente vuelve a pedir `/citas/disponibilidad`), `medico_sin_jornada`, `paciente_con_cita`, `transicion_invalida` (el registro ya no admite ese cambio de estado), `cancelacion_fuera_de_plazo` (RN-21), `fila_max_llamados`, `consulta_ya_iniciada`, `consulta_firmada`.

## Concurrencia optimista (API-10)

- Toda escritura que cambia un registro existente lleva su `version` en el cuerpo. No se usan `If-Match` ni 412.
- Si la versión no coincide, la API responde 409 `version_conflicto` con `versionActual`. El cliente vuelve a pedir el registro y no reintenta a ciegas.
- La respuesta de cada comando devuelve la `version` nueva. Si un comando sube la versión de otro registro, la devuelve con su nombre (por ejemplo, `orderVersion` al capturar un resultado de laboratorio).
- Excepciones: los comandos que solo agregan un registro hijo sin cambiar el padre (signos, diagnósticos, receta, notas de enfermería) no llevan versión; la API comprueba en la transacción que el padre siga abierto.
- Pendiente: en `POST /laboratorio/ordenes/{id}/resultados` la versión se compara cuando llega, pero todavía es opcional porque la app Android no la envía (ver `docs/preguntas-abiertas.md`).

## Idempotencia (CON-07, API-11)

### Regla del servidor

- Toda escritura (salvo `POST /pacientes/busquedas`) exige la cabecera `Idempotency-Key` (8 a 128 caracteres `[a-zA-Z0-9_-]`).
- La clave se guarda por **cuenta + permiso + id del registro afectado** (por ejemplo `citas.agendar:<id de la cita>:confirmada`). Solo las creaciones, que todavía no tienen id, usan el permiso solo. Así, la misma clave con el mismo cuerpo sobre otra cita u orden ejecuta su propia operación. `api/tests/command-scopes.spec.ts` lo exige para cada comando.
- La misma clave con el mismo cuerpo y el mismo registro devuelve la respuesta guardada, sin repetir la operación.
- La misma clave con **otro cuerpo** responde 409 `idempotencia_conflicto` y se audita.
- Si la operación falla (4xx o 5xx), la transacción se revierte y la clave no queda guardada: reintentar con la misma clave vuelve a ejecutar la operación.

### Regla del cliente (web, Android, iOS)

La clave identifica una **intención del usuario**, no una firma de la petición.

1. Generar la clave (UUID v4) cuando el usuario inicia la intención: al abrir el formulario o al pulsar el botón de la acción.
2. Reutilizar esa misma clave en todos los reintentos de esa intención: error de red, tiempo de espera, 5xx, refresco del token o reinicio del proceso. En Android se guarda en `SavedStateHandle`; en la web, en el estado del formulario o de la acción, no en el cliente HTTP.
3. Descartarla cuando la API responde 2xx, o cuando el usuario cambia los datos después de un 4xx (cambiar los datos es otra intención).
4. Tras un 409 `idempotencia_conflicto`, generar una clave nueva: la anterior ya se usó con otros datos.
5. Nunca calcular la clave a partir de método, ruta y cuerpo: dos intenciones iguales (dos números de fila para el mismo paciente) deben llevar claves distintas.

## Estados (CON-09)

Los estados de dominio se publican como enums con nombre en el contrato (`EstadoCita`, `EstadoFila`, `EstadoConsulta`, ...). Los clientes generan sus tipos desde ahí y solo agregan la etiqueta en español. Las transiciones válidas las decide la base (triggers `atencion.validar_ticket`, `atencion.validar_cita`, ...) y la API; los clientes no las repiten.

Máquina de estados de la cita (API-09, migración `20261116002000_fase1_contrato_api.sql`):

| Desde | Hacia | Quién |
|---|---|---|
| `solicitada` | `confirmada`, `rechazada` | Recepción (`citas.agendar`) |
| `solicitada`, `confirmada` | `cancelada` | Recepción, o el paciente hasta 2 h antes (RN-21, política `citas.cancelacion_horas`). Nunca una cita que ya empezó. |
| `confirmada` | `atendida` | Al firmar la consulta |
| `confirmada` | `no_asistio` | Reservado; ningún endpoint lo usa todavía |

## Tiempo real

El evento delgado tiene un solo esquema, `EventoDelgado`, para el broadcast y para `GET /eventos`. El catálogo de tipos y canales está en `docs/arquitectura/tiempo-real.md`.
