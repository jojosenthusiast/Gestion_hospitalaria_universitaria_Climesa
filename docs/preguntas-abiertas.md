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
| 110 · `GET /accesos-excepcionales` | La fila de `endpoints.csv` pide `privacidad.aprobar_acceso` y su contexto dice "Solicitante ve los suyos". ¿Cómo entra el solicitante, que no tiene ese permiso? | El `x-permiso` sigue siendo `privacidad.aprobar_acceso` (como el catálogo); la guarda también admite `privacidad.solicitar_acceso` y el servicio le devuelve solo sus solicitudes |
| 110 · escenario 2 | El Jefe de Operaciones con acceso aprobado debería ver el historial, pero `GET /pacientes/{id}/historial` no existe todavía y `GET /consultas/{id}/detalle` exige `expediente.ver` o `consulta.iniciar`, que JOP y ADM no tienen | El acceso excepcional vigente solo amplía la lectura de quien ya pasa la guarda (médico no tratante); abrirla a JOP y ADM requiere cambiar `endpoints.csv` |
| 110 · romper el vidrio (FR-110-09) | ¿Quién es "médico de emergencia"? ¿Se exige turno en curso en el área de emergencia? | Lo puede abrir el personal con `expediente.ver` en contexto `relacion` (MED); no se comprueba el área del turno. Queda aprobado al instante, por revisar, y el delegado lo confirma o lo cierra con "negar" |
| 110 · duración aprobada | ¿El delegado puede aprobar menos horas que las pedidas? | Sí (escenario 2 "aprueba por 2 h"), nunca más que lo pedido ni que la política `privacidad.acceso_excepcional_max_horas` |
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
