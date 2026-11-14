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

## Para producción CLIMESA (registro institucional INS01 a INS12 de P01)

Siguen pendientes y no afectan al curso: habilitación y servicios (INS01, INS02), modalidades (INS03), organigrama (INS04), formatos de identidad y archivo (INS05), procedimientos de admisión y alta (INS06), catálogo y tarifas (INS07), pagadores (INS08), caja (INS09), régimen fiscal (INS10), sistemas actuales (INS11), continuidad (INS12). Detalle en `docs/investigacion/p01/`. El cuestionario y el mapa contable para la contadora están en `docs/climesa/`.
