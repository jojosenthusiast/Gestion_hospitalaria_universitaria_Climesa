# Preguntas abiertas

## Del curso (no bloquean; se gobiernan por el estado de las specs, D-045)

| # | Pregunta | Efecto mientras no se responda |
|---|---|---|
| 27 | ¿Quién codifica qué fuera del núcleo? | Las tareas están repartidas en `docs/gestion/` (backlog, CSV de Jira y documento Word); cada tarea tiene dependencias explícitas |
| 28 | ¿Cuándo necesita Figma el inventario? | Ya está listo: `docs/diseno/inventario-pantallas.md` |
| 29 | ¿Defensa en dispositivos reales y con qué red? | Se prepara el entorno `demo` y un punto de acceso propio como respaldo (spec 131) |
| 30 | ¿Nombre y dueño del repositorio en GitHub? | El monorepo está listo para subirse con cualquier nombre |
| 31 | ¿La ficha de AST, ENF y LAB se limita por el contexto del permiso (área, orden) en `permisos.csv` en lugar de por rol en el servicio? | **Resuelta el 29-oct-2026**: `pacientes.ver_ficha` pasa a contexto `area` para AST y ENF y a `orden` (nuevo; paciente con orden de laboratorio pendiente o en proceso) para LAB. El servicio lee los contextos de `acceso.v_permisos_usuario`, sin preguntar por el rol; la semilla conserva `x` y la migración `20261029000100_acceso_contextos_ficha.sql` los actualiza |

## Para confirmar al aprobar specs

| ID | Qué | Dónde |
|---|---|---|
| D-037 | Interpretación de traslados: VIP no se traslada; semiprivada puede ir a otra semiprivada o a VIP libre | spec 108 |
| D-055 | Contenido de la planta 1 (4 consultorios, 3 cubículos de emergencia) | spec 104 |
| D-054 | Reglas de turnos por defecto | spec 103 |
| 110-T06 | `permisos.csv` da `ambulancia.recibir_prehospital` a Jefe de Operaciones y Recepción, pero `privacidad.md` §2 deja el reporte prehospital en `·` para ambos (es clínico, D-031). Decidir cuál cambia. Mientras tanto `tools/generar_docs.py` lo lleva como divergencia conocida | spec 110 |

## Remediación de la auditoría 2026-11-13 (fase 0, API)

Decisiones conservadoras tomadas mientras se confirman:

| Hallazgo | Pregunta | Opción aplicada |
|---|---|---|
| API-05 | ¿El traslado se identifica por la ocupación o por la admisión? | Por la ocupación, como dice la ruta `POST /ocupaciones/{id}/traslado` de `endpoints.csv`; `version` es la de la admisión y `GET /admisiones` devuelve `occupationId` |
| DAT-05 | ¿Cómo se combinan en semiprivada los sexos `indeterminado` y `no_registrado`? | Solo se comparte habitación con el mismo valor registrado; cualquier otro valor se trata como distinto |
| SEG-07 | `privacidad.md` dice "signos (revisado)", pero no existe un acto de revisión de signos | El paciente ve los signos solo dentro de una consulta firmada |
| F-04 | ¿Se aceptan signos vitales después de firmar la consulta? | No: 409 `consulta_firmada`, igual que diagnóstico y receta; la base lo garantiza con `exigir_consulta_abierta` |
| W-07 | ¿Qué pasa con los números duplicados ya existentes en producción? | No se cambian (no se inventa su desenlace); el índice único rige desde el día en que se aplica la migración |
| F-06 | ¿Qué responde un PAC al cancelar una cita que no existe? | 403, igual que una cita ajena, para no revelar la existencia de citas de otros |
| API-07 | ¿Las solicitudes creadas antes de alinear las franjas (inicios como 10:07:33) se pueden confirmar? | Sí: la alineación de 20 minutos se exige al crear o solicitar; al confirmar solo se exige que la jornada publicada cubra la cita y que no haya traslape |
| SEG-02 | ¿Cómo se audita la lectura del catálogo de agenda (hasta 500 pacientes) sin inflar la auditoría? | El detalle se guarda una sola vez: el evento firmado lleva solo su SHA-256 (`detailHash`) y no una segunda copia. El catálogo conserva los identificadores (más `patientCount`) porque `privacidad.md` §3.9 da al paciente el derecho a ver quién consultó sus datos; un conteo con hash no lo permitiría. Las filas anteriores, con el detalle dentro del evento, se siguen verificando |

## Privacidad (110) e inventario (111), noviembre 2026

Decisiones conservadoras tomadas mientras se confirman:

| Tema | Pregunta | Opción aplicada |
|---|---|---|
| (Retirada por D-082) 110 · `GET /accesos-excepcionales` | La fila de `endpoints.csv` pide `privacidad.aprobar_acceso` y su contexto dice "Solicitante ve los suyos". ¿Cómo entra el solicitante, que no tiene ese permiso? | El `x-permiso` sigue siendo `privacidad.aprobar_acceso` (como el catálogo); la guarda también admite `privacidad.solicitar_acceso` y el servicio le devuelve solo sus solicitudes |
| (Retirada por D-082) 110 · escenario 2 | El Jefe de Operaciones con acceso aprobado debería ver el historial, pero `GET /pacientes/{id}/historial` no existe todavía y `GET /consultas/{id}/detalle` exige `expediente.ver` o `consulta.iniciar`, que JOP y ADM no tienen | El acceso excepcional vigente solo amplía la lectura de quien ya pasa la guarda (médico no tratante); abrirla a JOP y ADM requiere cambiar `endpoints.csv` |
| 110 · romper el vidrio (FR-110-09) | ¿Quién es "médico de emergencia"? ¿Se exige turno en curso en el área de emergencia? | Lo puede abrir el personal con `expediente.ver` en contexto `relacion` (MED); no se comprueba el área del turno. Queda aprobado al instante, por revisar, y el delegado lo confirma o lo cierra con "negar" |
| (Retirada por D-082) 110 · duración aprobada | ¿El delegado puede aprobar menos horas que las pedidas? | Sí (escenario 2 "aprueba por 2 h"), nunca más que lo pedido ni que la política `privacidad.acceso_excepcional_max_horas` |
| 110 · negar | ¿Negar exige motivo? | Sí, de 10 a 500 caracteres (W30 "Negar con motivo"); queda en la auditoría |
| 110 · W31 para ADM | ADM no tiene `pacientes.buscar`. ¿Cómo elige paciente? | Escribe el identificador del paciente; JOP lo busca por nombre, DUI o expediente |
| 110 · "Quién vio mi expediente" | ¿Qué cuenta como acceso y qué motivo se muestra? | Toda operación exitosa de otra cuenta sobre el paciente, salvo la gestión del acceso excepcional y los rechazos; el motivo es "atención" o "acceso excepcional" (nunca el texto libre del personal) |
| 110 · auditoría en vivo | No hay evento `auditoria.*` en `tiempo-real.md` | W32 se refresca con otros eventos, como antes; no se creó un evento nuevo |
| 111 · ajuste (API-15) | ¿Cómo resta un ajuste si `movimiento.cantidad` es positiva? | El ajuste admite cantidad negativa en la API; el movimiento guarda la cantidad absoluta con bodega origen (resta) o destino (suma), y el historial la devuelve con signo |
| 111 · alerta | ¿Quién recibe `inventario.bajo_minimo` sin escribir roles en código? | Los roles con `inventario.mover` salvo el contexto `consumo`, y salvo `reactivos` cuando el artículo no es reactivo (hoy: JOP siempre, LAB en reactivos). Se emite al cruzar el mínimo (también al subir el mínimo), no en cada movimiento posterior |

## Información pública y tablero (specs 112 y 113, rama feat/r-publico-metricas)

Decisiones conservadoras tomadas mientras se confirman:

| Tema | Pregunta | Opción aplicada |
|---|---|---|
| FR-112-03 / W25 | La pantalla W25 dice "Crear, retirar", pero `endpoints.csv` solo tiene `POST /avisos`. ¿Se agrega un endpoint para retirar un aviso antes de su vencimiento? | No se inventó la ruta: un aviso desaparece solo al vencer su vigencia. Para retirarlo antes hace falta una fila nueva en `endpoints.csv` |
| FR-112-05 | ¿La advertencia de datos personales bloquea o solo advierte? | Advierte: `POST /avisos` responde 422 `aviso_con_datos_personales` con `datosPersonales` (`dui`, `expediente`, `telefono`) y publica si se reenvía con `confirmarDatosPersonales: true`; la auditoría guarda qué se confirmó |
| FR-112-04 | Un aviso o un turno vence sin que ocurra ningún evento. ¿Cómo se entera la pantalla? | Las respuestas públicas traen `proximoCambio`; la web pública hace una sola recarga en ese instante (no es sondeo: no se repite si la API no anuncia otro). Android, por su regla de no usar temporizadores, lo refleja con el siguiente evento o al volver a abrir la sección |
| tiempo-real.md | Los eventos de cama, fila y turno no llevaban el canal `publico`. ¿Se emiten desde cada módulo? | La migración `20261115002000_publico_metricas.sql` los deriva en la base al insertar en `plataforma.outbox`: un evento delgado con entidad `publico` (sin ids de camas, números ni personas) y `metricas.recalculadas` para los roles con `metricas.ver` |
| tiempo-real.md | `metricas.recalculadas` figura para ADM y JOP, pero `permisos.csv` da `metricas.ver` también a DPD | Los canales salen del catálogo (regla 8): llega a ADM, JOP y DPD |
| FR-112-06 | ¿Qué servicios muestra la pantalla pública y cuántos números? | Los cuatro servicios de la fila; los 20 últimos números en estado `llamado` del día (la web muestra 3 por servicio) |
| FR-113-05 | Definición de cada indicador | Ocupación diaria: % de horas-cama ocupadas sobre las camas actuales; estancia promedio: días entre el inicio y el fin de la ocupación de admisiones egresadas, por día de egreso; laboratorio: minutos de creación a completado; ambulancia: minutos de la solicitud (o el despacho) al hito `en_escena`; cobertura: horas con algún hueco frente al mínimo vigente. Un día sin muestras devuelve `valor: null` |
| Plan 112 | Límite de solicitudes por IP | 120 por minuto y por IP, en memoria del proceso (429 `demasiadas_solicitudes`). Con varias instancias de la API el límite es por instancia |

## Ambulancia, spec 109 (rama `feat/r-ambulancia`, 15-nov-2026)

| # | Pregunta | Efecto mientras no se responda |
|---|---|---|
| AMB-01 | El paciente (A09, I09, FR-109-16) no tiene ningún endpoint de lectura de su solicitud: `GET /ambulancia` exige `ambulancia.ver_estado` y PAC no lo tiene. ¿Se agrega `GET /ambulancia/solicitudes/mias` (o un contexto `propio` de `ambulancia.ver_estado`)? | La app del paciente envía la solicitud, muestra "Por confirmar" y el aviso del 911, y lista los eventos que llegan a `usuario:<id>` (confirmada, hitos) sin poder volver a pedir el estado. 109-T06 sigue abierta |
| AMB-02 | A09 dice "cancelar antes de confirmar", pero no hay endpoint para que el paciente cancele. | No se ofrece cancelar; despacho puede descartar con motivo |
| AMB-03 | A54 y A25 piden "Marcar recibido" y A54 "pasar a admisión"; no hay endpoint para lo primero (`reporte_prehospital.recibido_por` existe sin uso) y Enfermería no tiene `admision.crear`. | No se ofrece; la admisión con origen ambulancia se crea desde Recepción con `POST /admisiones` (109-T08 sigue abierta) |
| AMB-04 | Enfermería tiene `ambulancia.recibir_prehospital` pero no `ambulancia.ver_estado`, así que no puede descubrir el servicio activo después de abrir la app. | A54 abre el reporte del servicio que llega por el evento `ambulancia.prehospital` (canal `rol:ENF`); antes de un evento muestra "Aún no llega un reporte" |
| AMB-05 | `permisos.csv` da `ambulancia.recibir_prehospital` a JOP y REC, pero `privacidad.md` no les permite ver el reporte prehospital (ya anotado en 110-T06). | `GET /ambulancia/servicios/{id}/prehospital` devuelve motivo y signos solo a quien tiene `expediente.ver` (ENF, MED con relación); a JOP y REC les devuelve prioridad y horas, sin contenido clínico |
| AMB-06 | La tripulación del despacho: la spec no dice si despacho la elige. | Al despachar se asignan los paramédicos y motoristas con turno en curso; sin paramédico de turno se rechaza con `sin_paramedico_de_turno` |
| AMB-07 | No hay evento catalogado para "solicitud descartada" ni campo para vincular al paciente del servicio. | Descartar emite `ambulancia.estado_cambiado` con entidad `solicitud`; el paciente provisional (A73) se vincula con el campo opcional `patientId` del reporte prehospital, solo si el servicio aún no tiene paciente |
| AMB-08 | Al finalizar un servicio la unidad vuelve a Disponible (RN-32) aunque ya no haya paramédico de turno (RN-30). | Se cumple RN-32; el siguiente despacho se rechaza si no hay paramédico de turno |
| AMB-09 | La garantía "solo se despacha una unidad Disponible" vive en la API (bloqueo `FOR UPDATE`) más el índice `servicio_activo_unico`; no se agregó un disparador al insertar servicio porque `supabase/pruebas/01_invariantes.sql` (caso 12) y `02_concurrencia.sh` insertan servicios directo sobre la unidad sembrada en mantenimiento. ¿Se ajustan esas pruebas para poder agregarlo? | La base sí rechaza: una segunda unidad, un segundo servicio activo y que la unidad salga de En Servicio con servicio activo (o entre sin él) |
| AMB-10 | FR-109-10 pide la cola sin conexión cifrada en el teléfono (Room cifrada); Android no tiene Room. | La cola vive en el ViewModel (sobrevive al giro y al cambio de sección, no a cerrar la app) y reenvía el mismo cuerpo, con la misma `Idempotency-Key`, al reconectar |
| AMB-11 | Mapa (Leaflet) y envío de ubicación cada 10 s (FR-109-13, E). | La API recibe `POST /ambulancia/ubicacion` y W18 muestra la última coordenada en texto; Android no envía ubicación ni hay mapa web |

## Para producción CLIMESA (registro institucional INS01 a INS12 de P01)

Siguen pendientes y no afectan al curso: habilitación y servicios (INS01, INS02), modalidades (INS03), organigrama (INS04), formatos de identidad y archivo (INS05), procedimientos de admisión y alta (INS06), catálogo y tarifas (INS07), pagadores (INS08), caja (INS09), régimen fiscal (INS10), sistemas actuales (INS11), continuidad (INS12). Detalle en `docs/investigacion/p01/`. El cuestionario y el mapa contable para la contadora están en `docs/climesa/`.

## Vinculación de cuenta e historial clínico (REQ-03, REQ-05; specs 101, 102, 106, 107)

Decisiones conservadoras tomadas mientras se confirman:

| Tema | Pregunta | Opción aplicada |
|---|---|---|
| FR-101-10 | El paciente debe ver el motivo del rechazo, pero `endpoints.csv` no tiene una lectura de su propia solicitud (solo `POST /cuentas/vinculacion` y la bandeja `GET /cuentas/vinculaciones` con `cuentas.verificar`). ¿Se agrega `GET /api/v1/cuentas/vinculacion` (`cuenta.vincular`, propio)? | No se inventó la ruta. La API guarda el motivo y lo devuelve en la respuesta del rechazo; A03 muestra "Solicitud rechazada" con un texto genérico al recibir `vinculacion.resuelta` sin expediente enlazado. Falta mostrar el motivo exacto |
| FR-101-11 | ¿Recepción elige el expediente al aprobar? | No: al aprobar, la API vuelve a buscar el expediente activo con el mismo DUI y la misma fecha de nacimiento declarados (RN-39). Sin coincidencia responde 409 `sin_expediente` (crear tras buscar y volver a aprobar); con más de una, 409 |
| FR-106-09 | ¿El historial del médico incluye borradores de otros médicos? | No: firmadas e "ingresada por error" de todos; abiertas solo las del propio médico. El paciente ve solo firmadas |
| FR-106-09 | ¿El historial del paciente incluye hospitalizaciones? | No (A08 pide consultas, diagnósticos y recetas); las ven solo el personal con relación o acceso excepcional |
| W27 | ¿El nombre de la cuenta debe coincidir con el del expediente para aprobar? | Se muestra como dato de apoyo ("Coincide"/"Revisar"); la API solo exige DUI y fecha de nacimiento |
| A22 | No hay rol web con `expediente.ver`; el diálogo de historial web solo aparece a quien lo tenga (hoy, nadie en la web por catálogo) | Se mantiene detrás del permiso; Android A22 es la vista del médico |

## Remediación de la auditoría 2026-11-13 (fase 1, Android; rama fix/fase1-android)

Decisiones conservadoras tomadas mientras se confirman:

| Hallazgo | Pregunta | Opción aplicada |
|---|---|---|
| AND-13 | A05 "Mi turno en fila" (PAC) pide "cuántos faltan", pero no existe `GET /me/fila` en el contrato. ¿Se crea ese endpoint? | No se inventa la ruta (regla 11): A05 sigue sobre `GET /fila` con `fila.ver`, y la privacidad depende del filtro del servidor. A07 ya usa `GET /me/laboratorio` |
| AND-12 | JOP ve en Android A34, A35 y A53, que `pantallas.csv` asigna solo a REC y ENF (para JOP el CSV solo da A10, A12 y A26). ¿JOP conserva esos destinos en Android? | Se mantienen (son los mismos flujos que JOP tiene en la web, W12 a W14 y W22, y ya se probaron con sus cuentas); falta registrar la decisión o actualizar el CSV. `PLANNING` y `STAFF` siguen fuera del catálogo |
| AND-08 | ¿El APK de entrega se firma con un keystore institucional o del equipo? | El build lee la firma de propiedades de Gradle o variables de entorno (`CLIMESA_RELEASE_*`); sin ellas genera un APK sin firmar. Nadie sube el keystore al repositorio |
| CON-07 | ¿Cuánto vive la intención de un formulario? | En Android, mientras viva el ViewModel de la cuenta: si el proceso muere, el reintento recibe una clave nueva. Termina con la respuesta 2xx o con `idempotencia_conflicto`; los formularios sin `SubmissionIntent` usan la clave por petición (método, ruta y cuerpo) hasta una respuesta definitiva |
## Remediación de la auditoría 2026-11-13 (fase 1, web; rama `fix/fase1-web`)

| Tema | Pregunta | Opción aplicada |
|---|---|---|
| WEB-13 / W01 | Las rutas de cliente `/recuperar` (pedir el enlace) y `/restablecer` (crear la nueva contraseña desde el correo) no están en `pantallas.csv` como pantallas propias. ¿Se registran como parte de W01? | Se tratan como parte de W01 ("recuperar contraseña"); no hay endpoint nuevo: Supabase Auth envía el correo (`resetPasswordForEmail`) y guarda la contraseña (`updateUser`). La respuesta no dice si el correo tiene cuenta |
| WEB-13 / Supabase | El enlace de recuperación solo funciona si `https://<dominio web>/restablecer` (y `http://localhost:5173/restablecer` para desarrollo) está en Authentication > URL Configuration > Redirect URLs del proyecto Supabase, y la plantilla "Reset password" está en español | Acción del responsable del proyecto Supabase; el código ya envía `redirectTo` a `/restablecer` |
| WEB-13 / W35 | Si "Secure password change" está activo en Supabase, `updateUser` exige reautenticación reciente. La web vuelve a iniciar sesión con la contraseña actual antes de cambiarla, lo que cuenta como reciente. ¿Se deja activo? | Se deja como esté; si Supabase responde `reauthentication_needed`, la web pide usar "¿Olvidaste tu contraseña?" |
| WEB-01 | `docs/arquitectura/tiempo-real.md` dice que al llegar un evento la web "invalida todas las vistas". Ahora la web invalida por `entidad` (y por `entidad:id`) y solo invalida todo al reconectar o ante un evento sin entidad (`web/src/features/live-scope.ts`). ¿Se actualiza el documento? | No se editó (fuera del alcance de esta rama); el comportamiento al reconectar no cambió |
| WEB-01 | Una búsqueda de pacientes (`/pacientes?query=`) es una lectura auditada que la persona pide. ¿Debe repetirse sola cuando otro usuario edita un expediente? | No: solo se repite al reconectar o si la persona busca de nuevo. La ficha abierta (`/pacientes/{id}`) se repite solo con eventos de ese mismo paciente |
| WEB-10 | La clave de idempotencia ahora nace con la intención (formulario o diálogo abierto y su operación) y se reutiliza en los reintentos aunque se corrijan los datos: una escritura fallida no deja nada guardado en la API, y una cuya respuesta se perdió no debe ejecutarse dos veces (la API responde 409 `idempotencia_conflicto` si los datos cambiaron). ¿Se documenta así en el contrato (CON-07)? | Aplicado en la web (`web/src/features/intent.ts`, `useAction`); la nota del contrato queda para la rama del contrato |
| W04 | ¿Qué permiso abre cada pendiente de la bandeja? | Vinculaciones: `cuentas.verificar`; solicitudes de cita: `citas.agendar`; ambulancia por confirmar: `ambulancia.ver_estado` (solo si la API devuelve `pendingRequests`); admisiones sin cama: `admision.ver`; cola de laboratorio: `laboratorio.ver_cola`; accesos por aprobar: `privacidad.aprobar_acceso`. Se usan solo los listados existentes |

## Remediación de la auditoría 2026-11-13 (fase 1, contrato de la API; rama `fix/fase1-contrato-api`)

Decisiones conservadoras tomadas mientras se confirman. Convenciones completas en `docs/arquitectura/convenciones-api.md`.

| Tema | Pregunta | Opción aplicada |
|---|---|---|
| CON-06 | ¿Se renombran los campos JSON en inglés o snake_case a español camelCase (`AGENTS.md` §4.1)? Requiere una D-xxx en `docs/decisiones/registro-decisiones.md` | No se renombró nada. Se documentó la convención: camelCase siempre, los nombres existentes se conservan, los nuevos van en español. Falta registrar la D-xxx (fuera de esta rama) |
| CON-06 | Campos snake_case que siguen en respuestas: `articulo_id` y `bajo_minimo` en `GET /inventario/existencias` (el servicio selecciona `v.*` de `inventario.v_existencias`). Además mezclan idiomas en una misma respuesta: fila (`fecha`, `numero`, `llamados`), resultado de laboratorio (`valor`, `texto`, `marca`), limpieza de camas (`camaId`, `pendienteDesde`) e inventario | Se conservan y quedan declarados así en el contrato. Renombrarlos exige alias temporal y actualizar web y Android en la misma rama |
| API-10 | `LabResultDto.version`: la app Android (`ui/LaboratoryViewModel.kt`, fuera de esta rama) no la envía | La API la compara cuando llega y siempre sube la versión de la orden (`orderVersion` en la respuesta); sigue opcional hasta que Android la envíe. Luego se vuelve obligatoria |
| API-10 | Notas de enfermería, signos, diagnósticos y receta no llevan `version` | Solo agregan un registro hijo; no hay actualización perdida posible. La API comprueba que la consulta o admisión siga abierta |
| API-08 | ¿Desde qué servicios de la fila se inicia una consulta? | Desde cualquier número con paciente en estado `llamado` o `en_atencion`; un número `llamado` pasa a `en_atencion` en la misma transacción. Cualquier médico con `consulta.iniciar` puede tomarlo (no hay asignación de número a médico) |
| API-09 | RN-21 (cancelar hasta 2 h antes) ¿aplica también a recepción? | Solo al paciente (contexto `propio`). Nadie cancela una cita que ya empezó. El motivo de cancelación sigue solo en la auditoría (no hay columna) |
| API-09 | `no_asistio` existe en la base pero ningún endpoint lo usa | El trigger lo admite solo desde `confirmada`; no se agregó endpoint |
| DAT-06 | ¿Se retiran `type`/`entity` de `GET /eventos`? | Se conservan como alias obsoletos junto a `tipo`/`entidad` (esquema `EventoDelgado`) porque `web/src/lib/live.ts` y Android `domain/Realtime.kt` los leen. Retirarlos cuando ambos lean los nombres en español |
| CON-04 | Filas de `endpoints.csv` sin ruta | Se quitaron las 9 filas originales reemplazadas por la forma implementada (`/fila/tickets*`, `PUT /consultas/{id}`, `/recetas`, `/ordenes-laboratorio`, `PUT .../resultados`, `GET /catalogo/examenes`). Quedan 8 pendientes reales, listados en `api/tests/contrato-api.spec.ts`. Falta la D-xxx que registre el reemplazo |


## Remediación de la auditoría 2026-11-13 (fase 1, seguridad, CI y configuración)

Decisiones conservadoras tomadas mientras se confirman:

| Hallazgo | Pregunta | Opción aplicada |
|---|---|---|
| SEG-03 | ¿Enfermería puede escribir notas cuando el alta ya está firmada pero el paciente sigue en la cama? | Sí: se aceptan notas en `hospitalizado` y `alta_firmada`; se rechazan en `pendiente_cama`, `egresado` y demás estados |
| SEG-03 | ¿La relación que habilita `alta.firmar` incluye una relación de atención vigente además del médico tratante? | Sí: médico tratante de la admisión o `atencion.relacion_atencion` vigente con el paciente |
| SEG-09 | `privacidad.md` §2 da a Laboratorio la fecha de nacimiento "por rangos", pero `permisos-sin-roles.spec.ts` exige hoy `birth` exacto para LAB en `GET /pacientes` y `POST /pacientes/busquedas` | Sin cambio en esta rama: corregirlo exige cambiar esa prueba (fuera del alcance). Propuesta: en la búsqueda, `birth` solo con contexto `x` y `ageRange` con `rango` |
| SEG-09 | ¿La búsqueda `GET /pacientes` sin texto debe rechazarse (mínimo 2 caracteres)? | Sin cambio: la web (`features/patients.tsx`) y Android (`RemotePatientRepository.kt`) cargan `/pacientes?limit=50` sin texto como lista inicial. Exigir el mínimo rompe esas pantallas; se audita ahora qué pacientes devolvió cada búsqueda |
| SEG-08 | ¿Límite general de la API? | 300 solicitudes por IP y minuto (`RATE_LIMIT_MAX`), `/salud` exento; las pantallas públicas conservan 120. El límite por usuario de búsquedas (FR-100-17, 100-T09) sigue pendiente |
| SEG-08 | ¿Cuántos proxies hay delante de la API en Render? | `TRUST_PROXY_HOPS=1`. Confirmarlo en el registro: si dos clientes distintos reciben 429 juntos, la IP no se está leyendo bien |
| API-19 | `app.module.ts` conserva la URL real de Supabase como valor por defecto | En producción la API exige la variable (`config/environment.ts`); quitar el valor por defecto requiere tocar `app.module.ts` (fuera del alcance) |

## App iOS de Médico y Paciente (acción 1.3, CON-05; rama `feat/ios-med-pac`)

La app usa solo endpoints que ya existen en `contrato/openapi.json`. Donde la pantalla del catálogo pide algo que la API no ofrece, se tomó la opción conservadora:

| Pantalla | Pregunta | Opción aplicada |
|---|---|---|
| I05 | ¿Cómo calcula el paciente "cuántos faltan"? `GET /fila` (contexto `propio`) solo trae su número | Se estima con `GET /publico/fila/{servicio}`: mi número menos el último número llamado hoy, rotulado "aproximado". La app no se une al canal `publico`, así que el conteo se actualiza cuando cambia el número propio o al reabrir. Propuesta: que `GET /fila` devuelva `delante` para el ticket propio |
| I09 | El paciente no tiene lectura de su solicitud de ambulancia (no tiene `ambulancia.ver_estado`) ni un endpoint para cancelarla antes de confirmar | Se muestra el estado devuelto por `POST /ambulancia/solicitudes` y un aviso cuando llega un evento `ambulancia.*` de esa solicitud; no hay botón de cancelar. Propuesta: `GET /me/ambulancia` y `POST /ambulancia/solicitudes/{id}/cancelar` con `ambulancia.solicitar` |
| I03 | No hay `GET` de la vinculación propia: tras reiniciar la app no se sabe si está pendiente, y el motivo del rechazo no llega | Se muestra el estado devuelto al enviar; al llegar `vinculacion.resuelta` se vuelve a pedir `/auth/me`: con `patientId` está aprobada, sin él se informa el rechazo sin motivo. Reenviar mientras está pendiente devuelve `vinculacion_pendiente` |
| I21 | No hay endpoint de búsqueda CIE-10 ni árbol del catálogo de laboratorio | El código CIE-10 se escribe a mano (la API lo valida contra `atencion.cie10`); el catálogo de laboratorio se muestra como lista plana con la marca "Panel" |
| I24 | `AdmissionResponse` no trae fecha de ingreso, así que no se pueden mostrar "días" de hospitalización | Se muestran paciente, cama, categoría, aislamiento y estado, sin días |
| I25 | No existe una acción "Marcar recibido" para la llegada de ambulancia | Pantalla de solo lectura con `GET /ambulancia` y el reporte prehospital; se indica que la recepción todavía no está en la API |
| I23 | Push de valor crítico (APNs, 122-T04) | Fuera de este corte: el crítico se marca en rojo y llega en vivo por `laboratorio.critico` solo con la app abierta |
| I13 | "Mi cuenta" (cargos y factura) es de nivel F | No se implementa |
| Config | Release apunta a `https://sghu-api.onrender.com/api/v1` (pública, la misma de web y Android) desde `ios/Config/Release.xcconfig` | Debug usa `http://localhost:3000/api/v1`; un `ios/Config.xcconfig` local (ignorado) puede cambiar ambas |

## Ronda 1: administración y espacios (rama `feat/r1-admin-espacios`, 14-nov-2026)

Cambios autorizados por la persona dueña del producto tras las pruebas manuales (observaciones 5, 6, 9, 11 y 13). Decisiones conservadoras mientras se confirman:

| Observación | Pregunta | Opción aplicada |
|---|---|---|
| 9 | ¿Qué especialidades lleva el catálogo? No hay lista oficial | `personal.especialidad_catalogo` trae 19 especialidades médicas (incluida "Medicina general", por defecto) y 8 áreas de enfermería, sembradas en `20261117003000_especialidad_catalogo.sql`; se amplía con filas nuevas, sin cambiar código |
| 9 | ¿Qué pasa con las especialidades de texto libre ya guardadas? | La columna `personal.persona.especialidad` sigue siendo texto y no se reescribe; la API solo valida el valor que cambia, y un valor histórico fuera del catálogo se conserva al editar |
| 9 | ¿Los tipos de personal distintos de médico y enfermería llevan especialidad? | No: la API rechaza una especialidad para ellos (400) y la web oculta el campo |
| 9 | Endpoint nuevo `GET /personal/especialidades` (permiso `personal.ver`) | Agregado a `endpoints.csv` con la autorización de esta ronda |
| 9 | Usuarios y Personal pasan a un solo módulo "Personal". La ruta `#/usuarios` desaparece del menú | `shell.tsx`: se quitó la entrada "Usuarios" y `personal` también se muestra con `usuarios.ver` (el DPD solo lee cuentas). Un enlace viejo a `#/usuarios` ahora dice "Página no encontrada" |
| 6 | "Rol" en el filtro de turnos: ¿rol de la cuenta o función del personal? | Función del personal (`staffType`, los 10 tipos), porque un turno pertenece a una persona del directorio y hay personal sin cuenta; el filtro lista siempre todos los tipos |
| 5 y 11 | El ADM no tiene `camas.ver_tablero`: ¿ve el estado cama por cama en Edificio? | No: ve la estructura y las camas libres por nodo (que sí entrega `GET /espacios`); quien tiene `camas.ver_tablero` ve además el estado de cada cama |
| 5 y 11 | ¿Cómo se asigna una cama desde el plano? | Con el endpoint existente `POST /admisiones/{id}/cama`, para admisiones en `pendiente_cama` y quien tenga `camas.asignar` y `admision.ver`; las reglas de asignación las valida la API (no se muestran sugerencias en el plano) |
| 13 | Los pasos "Revisada por médico" y "Visible al paciente" | Se marcan juntos: el paciente ve los valores en el mismo momento en que el médico revisa (D-040). "Muestra tomada" y "En proceso" se distinguen porque el segundo exige al menos un valor capturado |
| 13 | ¿Se puede completar una orden sin todos los valores? | No (la API ya lo rechaza con 409); la web deshabilita "Completar" y muestra cuántos valores faltan |

## Ronda 1 · Recepción (rama `feat/r1-recepcion`; observaciones 1, 4, 8 y 16)

Cambios de producto autorizados por el dueño (observaciones de la prueba manual del 14-nov). Quedan registrados porque tocan rutas y respuestas fuera del catálogo original.

| Tema | Pregunta | Opción aplicada |
|---|---|---|
| Registro de pacientes | ¿La búsqueda previa debe parecerse a los datos del paciente nuevo? | No. La constancia (10 minutos, misma cuenta) solo prueba que se buscó; se gasta únicamente al registrar. El control de duplicados se hace al crear: mismo DUI responde 409 `dui_duplicado` con el paciente existente; mismo nombre normalizado y misma fecha de nacimiento responde 409 `posible_duplicado` con candidatos, salvo `confirmarNuevo: true` |
| Selector de pacientes | `GET /pacientes/selector` no está en el catálogo original | Se agregó a `endpoints.csv` (permiso `pacientes.buscar`): `id`, `record`, `fullName` y `age` (solo si el rol ve la fecha de nacimiento), con `limit` máximo 20 y `offset`. Cada consulta queda auditada como una búsqueda más, con espera de 250 ms y mínimo 2 caracteres en los clientes |
| Catálogo de citas | ¿Qué pasa con `patients` en `GET /citas/catalogos`? | Recepción ya no recibe pacientes (antes 500 filas): los busca con el selector. PAC conserva solo el propio. Con `?date=yyyy-MM-dd` cada médico trae `tieneTurno` y `motivo` |
| Franjas del día | `GET /citas/disponibilidad` solo devolvía franjas libres | Se conserva `slots` (libres) y se agrega `franjas` con todas: `estado` `libre`, `ocupado`, `sin_turno` o `pasado` y `motivo` corto. Sin turno se devuelve la rejilla estándar 08:00 a 16:00 como `sin_turno` |
| Datos ficticios de Vinculaciones | La observación 4 pide datos de ejemplo para la cola | No se agregaron semillas aquí: pertenecen al flujo de datos de demostración (observación 7); la pantalla ya explica el vacío |
<<<<<<< HEAD

## Ronda 2 · Ambulancia (rama `feat/r2-ambulancia`; observaciones 7, 8 y 16)

Cambios de producto autorizados por el dueño. Quedan registrados porque agregan campos fuera del catálogo original.

| Tema | Pregunta | Opción aplicada |
|---|---|---|
| Salir de mantenimiento | La unidad no sale de mantenimiento sin paramédico con turno en curso (RN-30, D-054). ¿Se relaja? | No. La transición ya existía; lo que faltaba era explicarla. `GET /ambulancia` devuelve `dispatchBlock` (`code`, `message`, `action`) y `unit.stateReason`/`stateSince`; las pantallas dicen por qué no se despacha y qué hacer (publicar un turno de paramédico). |
| Quién pidió | `GET /ambulancia` no traía el solicitante | `pendingRequests[]` agrega `requesterName` (paciente o quien llamó), `callerName` y `patientRecord`. Nueva columna opcional `ambulancia.solicitud.solicitante_nombre` y campo opcional `callerName` en `POST /ambulancia/solicitudes` (solo recepción). La consulta de solicitudes de pacientes registrados ya se audita. |
| Paciente en la bitácora | La bitácora no muestra al paciente (D-056). El dueño pide «paciente Y» para DPD | Se muestra solo `patientRef`: el expediente enmascarado (últimos 3 caracteres), nunca nombre ni id. ¿Se debe ocultar también para DPD, o mostrar el nombre a quien tiene relación de atención? |
| Búsqueda y hitos | `GET /ambulancia/bitacora` solo filtraba por columnas exactas | Se agrega `q` (texto libre sin acentos sobre origen, destino, municipio y tripulación) y `milestones[]` por servicio para contar la historia. |
=======
| Ronda 2 · avisos | `avisos.publicar` solo lo tiene el Jefe de Operaciones; la observación 14 dice «JOP/ADM según permisos». ¿Debe poder publicar también Administración? | No: se respeta `permisos.csv` (D-050, segregación de funciones). Si se quiere, es una fila nueva en `permisos.csv` y una migración. |
>>>>>>> ba6ab32 (feat(android): show role notices on the dashboard; docs: audience, priority and retired exceptional access)
