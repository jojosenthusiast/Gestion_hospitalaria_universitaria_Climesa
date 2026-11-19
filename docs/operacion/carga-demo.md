# Reinicio de los datos de demostración

Cómo vaciar y volver a llenar la base del curso con datos de demostración ricos y conectados (Lote 5, S17), sin tocar usuarios reales ni catálogos. Todo vive en `tools/demo/`; el detalle de qué muestra cada registro está en [`tools/demo/README.md`](../../tools/demo/README.md).

> Escribir en la base del proyecto (producción del curso) requiere la aprobación del propietario con la lista de abajo. Primero se corre la simulación y se le muestra el resultado; solo después se ejecuta con `--ejecutar`.

## Qué hace cada paso

| Paso | Archivo | Qué cambia |
|---|---|---|
| Conteo | `conteo-demo.sql` | Nada. Una sola consulta `SELECT`: por tabla, filas demo y filas de las cuentas de prueba. |
| Limpiar | `limpiar-demo.sql` | Borra lo demo y lo que crearon las cuentas de prueba. Exige `set demo.confirmar = 'limpiar'` en la misma sesión; sin eso se detiene sin borrar. |
| Cargar | `semilla-demo.sql` | Agrega los datos demo. Idempotente: repetirla no duplica nada. |
| Reiniciar | los dos | Limpiar y luego cargar. Así las fechas (turnos, citas, fila de hoy) quedan respecto del día en que se corre. |

## Cómo correrlo

Requisitos: Node 22, las dependencias de la API (`cd api && npm ci`, el programa usa su paquete `pg`) y la cadena de conexión del **rol dueño de las tablas** (`postgres` en Supabase; nunca `sghu_api`). El programa imprime solo el servidor, la base y el rol; nunca la contraseña, y no lee `demo-credenciales.json`.

```bash
export DEMO_DATABASE_URL='postgresql://postgres:<contraseña>@<servidor>:5432/postgres'   # PowerShell: $env:DEMO_DATABASE_URL = '...'

node tools/demo/demo.cjs conteo                 # solo lee
node tools/demo/demo.cjs reiniciar              # simulación: limpia, carga, cuenta por tabla y DESHACE todo
node tools/demo/demo.cjs reiniciar --ejecutar   # lo mismo, confirmado (limpiar se confirma antes de cargar)
```

`limpiar` y `cargar` también existen por separado, con o sin `--ejecutar`. Sin `--ejecutar` cada comando corre dentro de una transacción que termina en `ROLLBACK`: muestra exactamente cuántas filas cambiarían por tabla (antes, después, diferencia) y no deja nada escrito.

Conviene correrlo en horario laboral: la fila y las citas de "hoy" se siembran según la hora del momento.

Sin Node, desde `psql` (cada `-c` y `-f` corre en la misma sesión, en orden):

```bash
psql "$DEMO_DATABASE_URL" -v ON_ERROR_STOP=1 -f tools/demo/conteo-demo.sql
psql "$DEMO_DATABASE_URL" -v ON_ERROR_STOP=1 -c "set demo.confirmar = 'limpiar'" -f tools/demo/limpiar-demo.sql -f tools/demo/semilla-demo.sql
```

En el editor SQL de Supabase solo conviene el conteo (`conteo-demo.sql`): la limpieza y la semilla traen su propio `begin`/`commit`, así que allí no hay simulación.

## Qué borra la limpieza

**Lo demo** (secciones 1 a 8 de `limpiar-demo.sql`): toda fila con id `de300000-...` y lo que la bitácora de la ambulancia marca con `[DEMO]`. La unidad de ambulancia vuelve al estado que tenía antes de sembrar y la cuenta PAC de prueba se separa de la paciente demo.

**Lo que crearon las cuentas de prueba** (sección 0). Cuentas de prueba: `prueba.<algo>@climesa.com` y `admin@climesa.com` (en las pruebas locales, `<rol>@example.test`). Las cuentas no se borran. Se borran las filas que no son demo y que:

| Tabla | Condición |
|---|---|
| `personal.turno` | son de la persona de personal de una cuenta de prueba |
| `atencion.cita` | las creó una cuenta de prueba, o son de su médico o del expediente unido a la cuenta PAC de prueba |
| `atencion.solicitud_cita`, `atencion.ticket_fila` | las creó o emitió una cuenta de prueba, o son de ese expediente |
| `atencion.consulta` y sus diagnósticos, recetas, signos y addendum | son de su médico o de ese expediente |
| `atencion.reprogramacion` | sobre esas citas, o pedidas por una cuenta de prueba |
| `laboratorio.orden` y sus renglones, resultados, historial, adjuntos, pendientes y propuestas | de su médico, de ese expediente, o de esas consultas o admisiones |
| `hospitalizacion.admision` y sus camas, traslados, reservas, altas, notas y cambios de tratante | las creó una cuenta de prueba, las atiende su médico, son de ese expediente o nacieron de esas consultas, citas, números o servicios |
| `ambulancia.servicio` (con hitos, ubicaciones, tripulación y reporte) y `ambulancia.solicitud` | los despachó o registró una cuenta de prueba, fue su paramédico, o son de ese expediente |
| `infra.bloqueo_cama`, `infra.limpieza_cama` | bloqueos que creó una cuenta de prueba; limpiezas pendientes de camas de esas admisiones |
| `publico.aviso`, `publico.aviso_enterado` | avisos que publicó una cuenta de prueba; los «Enterado» que marcó |
| `acceso.vinculacion_paciente` | solicitudes no aprobadas de una cuenta de prueba |
| `pacientes.caso_duplicado` | casos que abrió una cuenta de prueba |
| `pacientes.paciente` (con identificadores e historial) | expedientes que creó una cuenta de prueba, si ya ningún dato los usa |
| `acceso.usuario` | solo `paciente_id` de la cuenta PAC de prueba vuelve a nulo |

Se conserva, con un `NOTICE`: una cita o número que una consulta de otra cuenta usa, y los pacientes, personas o espacios demo que datos de otras cuentas usan.

**No se borra nunca**: usuarios, roles, catálogos (`seed.sql`), inventario de las cuentas de prueba (sus movimientos ya cambiaron las existencias), invitaciones, plantillas de turnos, `plataforma.auditoria` (cadena de solo inserción) y `plataforma.outbox` (eventos de tiempo real ya enviados). Los números de fila ya emitidos no se reutilizan.

## Qué carga la semilla

Medido el 2026-11-19 con `node tools/demo/demo.cjs cargar` (simulación) sobre una base recién migrada con las 10 cuentas de prueba (las cantidades cambian un poco con el día y la hora). La carga también agrega unos 90 eventos de tiempo real a `plataforma.outbox`:

| Tabla | Filas | Tabla | Filas |
|---|---|---|---|
| `personal.turno` | 1 809 | `pacientes.paciente` | 330 |
| `atencion.cita` | 517 | `pacientes.identificador` | 328 |
| `atencion.signos_vitales` | 159 | `laboratorio.orden_item` | 137 |
| `laboratorio.resultado` | 93 | `atencion.diagnostico` | 126 |
| `personal.persona` | 116 | `inventario.movimiento` | 98 |
| `atencion.relacion_atencion` | 97 | `atencion.receta_item` | 91 |
| `personal.inscripcion` | 84 | `atencion.consulta` | 81 |
| `atencion.ticket_fila` | 77 | `atencion.receta` | 72 |
| `inventario.existencia` | 50 | `ambulancia.hito` | 49 |
| `inventario.lote` | 44 | `inventario.articulo` | 41 |
| `laboratorio.orden` | 36 | `atencion.solicitud_cita` | 32 |
| `hospitalizacion.nota_enfermeria` | 32 | `ambulancia.cambio_estado` | 31 |
| `ambulancia.tripulacion` | 31 | `hospitalizacion.admision` | 22 |
| `acceso.usuario` / `acceso.asignacion_rol` (cuentas demo sin Auth) | 21 | `publico.aviso` | 20 |
| `hospitalizacion.ocupacion_cama` | 18 | `ambulancia.solicitud` | 16 |
| `ambulancia.servicio` | 14 | `acceso.vinculacion_paciente` | 12 |
| `ambulancia.reporte_prehospital` | 11 | `acceso.invitacion` | 9 |
| `infra.equipo` | 8 | `pacientes.historial_demografico` | 8 |
| `hospitalizacion.alta` | 7 | `plataforma.auditoria` (solo la primera vez) | 7 |
| `atencion.reprogramacion` | 6 | `infra.limpieza_cama` | 5 |
| `hospitalizacion.reserva_cama` | 4 | `laboratorio.pendiente_medico` | 4 |
| `ambulancia.ubicacion` | 4 | `infra.bloqueo_cama` | 3 |
| `pacientes.caso_duplicado` | 3 | `hospitalizacion.traslado` | 2 |
| `infra.espacio` (bodegas) | 2 | `laboratorio.adjunto` | 2 |

Además modifica dos filas existentes: la unidad de ambulancia pasa a En Servicio (vuelve a su estado al limpiar) y la cuenta PAC de prueba queda unida a la paciente demo 4 (se separa al limpiar). Las cuentas de prueba de roles por turnos sin persona de personal reciben una persona demo (se desvincula al limpiar).

Lo nuevo de Lote 5:

- **Turnos** de 7 días atrás a 14 adelante. Las cuentas de prueba de roles por turnos (REC, AST, ENF, MED, LAB, PAR) trabajan todos los días de 06:00 a 22:00, así la regla «sin turno activo» no las bloquea de día; con el margen de 30 minutos de la API quedan fuera de turno de 22:30 a 05:30. Recepción, laboratorio, emergencia (médico y enfermería), hospitalización y ambulancia (paramédico y motorista) tienen cobertura las 24 horas, con **un hueco a propósito**: la noche del día +3 la emergencia queda sin médico, y hay un aviso crítico que lo dice.
- **Cuenta PAC de prueba** unida a Ana Cecilia Portillo (ficha demo 4), cuya ficha lleva el correo de la cuenta; ella tiene cita, número en la fila, una solicitud por categoría por asignar, una reprogramación pendiente y siete lecturas de su expediente para «Quién vio mi expediente».
- **Fila de hoy** con números ligados a la cita cuya llegada registran y números sin cita, con prioridades rutina, urgente y emergencia.
- **Reprogramaciones**: cuatro pendientes, una rechazada y una vencida; la franja pedida cae dentro de un turno publicado del mismo médico.
- **Solicitudes por categoría**: una de la cuenta PAC y una que pide a la cardióloga demo sin turnos (no hay médico disponible).
- **Laboratorio**: resultados por revisar del médico (dos críticos pendientes, uno revisado y una observación) e informes externos que no son texto: una radiografía (JPEG) y un ultrasonido (PDF).
- **Avisos** de cada nivel (informativo, importante, crítico) y uno dirigido solo al área de emergencia.
- **Ambulancia**: en la bitácora, un mantenimiento preventivo de la semana pasada.

## Huecos conocidos

- **Resultados que no son texto**: el modelo los admite como adjuntos (`laboratorio.adjunto`: PDF, JPEG, PNG, HEIC, WEBP), pero la semilla solo guarda la referencia (`ruta_almacenamiento` nula): no sube archivos a Storage, así que la pantalla los muestra sin archivo para abrir.
- **Tipos de habitación**: el esquema solo tiene `vip` y `semiprivada`; no existe la categoría "general".
- **Ambulancias**: el esquema admite una sola unidad (`unidad_unica`); no se pueden ver a la vez unidades disponibles, en servicio y en mantenimiento. La unidad queda En Servicio con un servicio activo y el mantenimiento aparece en su bitácora.
- **Auditoría**: las siete lecturas sembradas quedan para siempre (la cadena no admite borrar); sembrar otra vez no las repite.

## Cómo se probó

- `cd api && npm test -- tests/datos-demo.spec.ts` sobre PGlite con el esquema completo: siembra, idempotencia, coherencia, conteos mínimos, la confirmación obligatoria, los turnos de las cuentas de prueba, el hueco de cobertura único (por `GET /turnos/cobertura`), «Quién vio mi expediente» por la API con la cadena de auditoría válida, la limpieza de datos de cuentas de prueba y la simulación de `demo.cjs`.
- Con PostgreSQL local desechable (`initdb` en una carpeta temporal, migraciones y `seed.sql`, diez cuentas `@climesa.com` con datos de uso): `conteo`, `limpiar`, `reiniciar` en simulación y con `--ejecutar`, `cargar` de nuevo (solo cambia `plataforma.outbox`) y `limpiar --ejecutar` hasta dejar cero filas demo.
