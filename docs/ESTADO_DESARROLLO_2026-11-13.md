# CLIMESA: estado de desarrollo (13 de noviembre de 2026)

> **Actualización del 16 de noviembre de 2026.** Las secciones "Fase 0 y 1" y "Fase 2" describen `main` en el commit `1b2cf2d`. Desde "Ajustes de esta entrega" en adelante, el texto es el estado histórico del 13 de noviembre y ya no describe la producción.

## Fase 0 y 1 (PR #105 a #123)

La auditoría final cerró los ciclos de hospitalización y ambulancia, guió citas y fila con las acciones que permite el servidor, agregó asistencia y carga de turnos, invitaciones de cuentas, enmienda y revisión de laboratorio, edición y retiro de avisos, la vista de inventario del administrador, filtros en Pacientes y Personal, y turnos que empiezan y terminan con el reloj. El detalle por módulo está en `docs/entrega/ENTREGA_2026-11-21.md`.

## Fase 2 (PR #124 a #145)

Fase 2 rehace el front end de web, Android e iOS para el uso clínico diario y agrega la API que cada flujo necesita. El registro de decisiones y la evidencia por tarea están en `odd/tasks/fase2-frontend.md` (fuera del repositorio) y en las líneas "Avance 16-nov-2026" de `specs/*/tasks.md`.

### Base común (PR #124 a #128, #143)

- Dirección visual, sistema y mapa de migración en `docs/diseno/fase2/01-direccion-visual.md`, `02-sistema.md` y `03-mapa-migracion.md`.
- Tokens compartidos en las tres plataformas: seis áreas (EMG, CON, LAB, HOS, REC, AMB) y la neutra GEN, seis familias de estado con patrón e ícono propios, y tres prioridades. El rojo queda solo para lo crítico. La tipografía es Atkinson Hyperlegible en web, Android e iOS.
- Web: encabezado compacto, esqueletos por sección, caché de `useData`, división de código por ruta y un límite de error por módulo. El paquete principal bajó de 662 kB a 322 kB.
- Los códigos de espacio numerados se asignan al área de su padre: `E-0n` es EMG, `HAB-20n` es HOS y `C-` con número es CON (PR #143).
- CI: el job `postgres-native` espera al script de inicio de la base antes de declararla lista (PR #124).

### Cambios por flujo

| Flujo | Qué cambió | PR |
|---|---|---|
| A. Citas por categoría | El paciente pide cita por motivo (hasta tres categorías con ícono, búsqueda, franja preferida y nota; el médico es opcional) en Android e iOS. Recepción asigna médico y hora desde **Solicitudes por asignar** en web y Android, o rechaza con motivo. Una solicitud por categoría cuenta para el límite de solicitudes solo 14 días | #132 |
| B. Fila y tablero | Recepción puede llamar desde la web (`fila.llamar`). Número por área desde 1 con su código (**CON 7**), prioridad (Rutina, Urgente o Emergencia), marca **Cita** o **Sin cita**, tablero por estado con arrastre y menú de teclado, **Quién pasa después** con regla fija del servidor y **Deshacer** del último llamado. `/fila` informa `calledByColleague` (llamó otra cuenta clínica), sin decir quién | #124, #130, #141 |
| C. Laboratorio y resultados externos | Bandeja **Resultados por revisar** del médico (valor crítico u observación relevante). Órdenes externas con lugar e instrucciones para el paciente, carga del resultado con valores clave y propuesta de cita de seguimiento a recepción. Los adjuntos (foto o PDF, hasta 10 MiB) se guardan en un bucket privado; la descarga usa un enlace firmado de 5 minutos y queda en la auditoría. El paciente nunca ve adjuntos ni observaciones internas. Web sube y descarga; Android abre y sube; iOS abre | #131, #134, #139, #142 |
| D. Avisos | Niveles Informativo, Importante y Crítico; audiencia por rol o por área; área **Avisos** propia en web, Android e iOS. Solo el crítico dirigido al rol o al área queda arriba en Inicio hasta **Enterado**, con **Recordarme en 4 h**. Quien publica ve el conteo de Enterado, sin nombres | #136, #139, #142 |
| F. Turnos y cobertura | Calendario semanal (crear, arrastrar, estirar, mover con teclado, **Deshacer**), **Lista por día** con hoy primero, lote con vista previa de borradores (**Generar rotación**, **Copiar semana anterior**, **Asignación masiva**, **Plantillas**) y **Publicar semana**. El generador llena la cobertura mínima por área y franja y lista los huecos que quedan | #129, #133 |
| G. Pantallas por rol | Una acción principal por pantalla, formularios prellenados (registro de paciente con búsqueda primero, llamada de ambulancia, admisión, solicitud de ambulancia del paciente), firma de consulta con confirmación y familias de estado para existencias y vinculaciones | #135, #137, #138, #140 |
| Datos demo | La semilla escala a un hospital real: 48 médicos de demostración, 330 pacientes y solicitudes por categoría. Si no existe cuenta de paramédico de prueba, no se crea el servicio activo | #144, #145 |

### Migraciones aplicadas en producción

| Migración | Efecto en producción |
|---|---|
| `20261125001000_permisos_fase2_fila_recepcion.sql` | REC recibe `fila.llamar` |
| `20261125002000_citas_solicitud_por_categoria.sql` | 2 tablas nuevas y 14 categorías |
| `20261125003000_fila_prioridad.sql` | Prioridad de la fila; 36 números existentes quedan en rutina |
| `20261125004000_laboratorio_seguimiento_externo.sql` | Seguimiento y órdenes externas; 46 órdenes quedan `externa=false` y 96 resultados sin observación |
| `20261125005000_turnos_plantillas_semana.sql` | Plantillas de semana (tabla vacía) |
| `20261125006000_laboratorio_adjuntos_storage.sql` y `20261125006100_laboratorio_adjunto_archivo.sql` | Bucket privado sin políticas públicas y trigger del archivo; sin datos cambiados |
| `20261125007000_avisos_nivel_enterado.sql` | Nivel y Enterado; 16 avisos pasan a informativo, política de 4 h |
| `20261125008000_fila_llamado_por.sql` | Columna de quién llamó (nula en las filas existentes) |

### Pendientes conocidos

- Android e iOS todavía deciden el "llamado propio" en memoria: resaltan la acción principal solo para el número que llamó esa sesión y no usan `calledByColleague` de `/fila`.
- La semilla demo a escala no está cargada en producción; la carga la ejecuta la dueña del proyecto (ensayo con ROLLBACK correcto).
- Las pantallas móviles de Fase 2 no se han probado a mano en un dispositivo; Android e iOS pasan su CI.
- Falta confirmar con una subida real que `SUPABASE_SECRET_KEY` está configurada en Render para los adjuntos de laboratorio.
- Siguen sin push (FCM ni APNs) y sin addendum de consulta firmada.

## Estado histórico del 13 de noviembre

Esta entrega contiene ajustes locales en laboratorio, hospitalización e inventario; **no está desplegada** en Render ni en el enlace web de pruebas. No se aplicó ninguna migración remota ni se modificaron cuentas.

## Ajustes de esta entrega

- La API calcula `normal`, `alto`, `bajo`, `critico_*` o `sin_rango` desde el rango por examen, sexo, edad y fecha de la muestra. Ignora la marca enviada por versiones anteriores del cliente.
- La corrección de un resultado exige motivo y guarda el valor anterior en `laboratorio.resultado_historial`; se emite evento de actualización o de resultado crítico.
- El paciente puede consultar el estado de sus órdenes en todo momento; los valores se excluyen hasta la revisión del médico. Cada lectura de orden queda en auditoría.
- Web y Android dejaron de permitir elegir manualmente la marca. Web solicita motivo cuando se corrige un resultado.

## Verificación y límites

- `npm run build --prefix api` y `npm run build --prefix web`: pasan.
- `npm test --prefix api -- --runTestsByPath tests/laboratory.rules.spec.ts`: 10 pruebas pasan.
- Se actualizaron las pruebas heredadas de turnos a D-083 (publicación automática), sin quitar la verificación de descansos, traslapes ni permisos. La publicación explícita sigue probada solo para borradores históricos.
- La matriz RBAC valida cada permiso de alternativas `OR` y se actualizaron las rutas implementadas en `endpoints.csv`. `npm test --prefix api -- --silent`: 25 suites y 273 pruebas pasan. `npm test --prefix web -- --reporter=dot`: 13 archivos y 143 pruebas pasan. Ambas compilaciones pasan. `python3 tools/progreso.py --verificar`: sin errores.
- `npm run lint --prefix api` no pudo ejecutarse porque esta instalación no trae el ejecutable `eslint`; la compilación TypeScript sí pasa. No se ha ejecutado Android en un dispositivo en esta entrega.
- La toma de muestra ya exige doble identificación (expediente + nombre completo) en API, web y Android; una discrepancia se rechaza y queda dentro del flujo auditable.
- Hospitalización incorpora API, pantalla web y pantallas Android para admisiones activas, sugerencias y asignación de cama, aislamiento, alta y salida física. Las operaciones mantienen idempotencia, concurrencia optimista, auditoría y eventos; la salida deja la cama en limpieza.
- Inventario incorpora API, pantalla web y pantalla Android para existencias por lote/bodega y registro de consumo; API y web también cubren historial, artículos y movimientos de entrada, salida, traslado y ajuste. Se rechazan lotes vencidos y saldos negativos.
- Sigue pendiente la validación clínica extremo a extremo con datos ficticios, aviso push crítico y pruebas ampliadas de permisos/resultados.
- Las pruebas de aceptación con datos ficticios de hospitalización e inventario, la integración móvil completa (incluye todavía signos vitales, limpieza y notas clínicas), privacidad/auditoría de todos los módulos, push crítico y reportes siguen pendientes. Por tanto, **no solo faltan reportes**.

## Orden recomendado

1. Armonizar las specs 103/105/106/107 y los endpoints históricos con las decisiones y rutas ya implementadas, sin eliminar compatibilidad a ciegas.
2. Ejecutar pruebas de laboratorio PAC–LAB–MED con datos ficticios, incluyendo doble identificación, datos sin rango y correcciones.
3. Ejecutar pruebas de aceptación PAC–REC–MED–ENF–LAB para hospitalización e inventario con datos ficticios.
4. Probar en Android las pantallas de hospitalización e inventario con las cuentas de JOP, REC, ENF y MED; después continuar con privacidad, push crítico y reportes.
5. Crear PR por historia, revisar y fusionar; entonces desplegar la versión aprobada. No ejecutar “deploy latest commit” esperando que incluya estos cambios locales.
