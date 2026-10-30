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

## Para producción CLIMESA (registro institucional INS01 a INS12 de P01)

Siguen pendientes y no afectan al curso: habilitación y servicios (INS01, INS02), modalidades (INS03), organigrama (INS04), formatos de identidad y archivo (INS05), procedimientos de admisión y alta (INS06), catálogo y tarifas (INS07), pagadores (INS08), caja (INS09), régimen fiscal (INS10), sistemas actuales (INS11), continuidad (INS12). Detalle en `docs/investigacion/p01/`. El cuestionario y el mapa contable para la contadora están en `docs/climesa/`.
