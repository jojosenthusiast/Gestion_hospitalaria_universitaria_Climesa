# Datos de demostración

Datos **ficticios, anotados y removibles** para aprender el software sin inventar registros a mano. No es una migración: no cambia el esquema ni vive en `supabase/migrations/`. Se ejecuta a mano, una vez por entorno de curso, con el rol dueño de las tablas (`postgres` en Supabase). Nunca con `sghu_api` y nunca contra datos reales.

| Archivo | Para qué |
|---|---|
| `semilla-demo.sql` | Siembra todo. Idempotente (se puede repetir), una sola transacción. |
| `limpiar-demo.sql` | Quita exactamente lo demo y lo que crearon las cuentas de prueba, en orden de dependencias. Idempotente. Exige `set demo.confirmar = 'limpiar'` en la sesión. |
| `conteo-demo.sql` | Solo lee: filas demo y filas de cuentas de prueba por tabla. |
| `demo.cjs` | Conteo, simulación (deshace al final) y ejecución con `--ejecutar` de limpiar, cargar o reiniciar. Guía: [`docs/operacion/carga-demo.md`](../../docs/operacion/carga-demo.md). |
| `../../api/tests/datos-demo.spec.ts` | Prueba ambos archivos sobre el esquema completo (PGlite): siembra dos veces, cuenta filas por tabla, limpia y comprueba que la base queda igual que antes. |

## Cómo usarlo

1. Aplica todas las migraciones y `supabase/seed.sql` (el edificio, el catálogo de laboratorio y el CIE-10 salen de ahí).
2. Ejecuta `semilla-demo.sql` en el editor SQL de Supabase (o `psql -f`). Conviene hacerlo en horario laboral: las citas, la fila y los turnos de "hoy" se siembran respecto de la fecha y hora del momento.
3. Para refrescar las fechas: `node tools/demo/demo.cjs reiniciar` (simulación) y luego con `--ejecutar`. Sembrar de nuevo sin limpiar no mueve lo que ya existe.
4. Antes de la entrega real, limpia (`node tools/demo/demo.cjs limpiar --ejecutar`, o `limpiar-demo.sql` después de `set demo.confirmar = 'limpiar'`).

## Cómo se reconoce lo demo (marca de borrado)

- Todos los ids empiezan con `de300000-` (UUID fijo; el cuarto grupo dice el tipo de dato).
- Pacientes: expediente `9900001-d` a `9900330-d` y DUI `9000nnnn-d` (dígito verificador válido, ficticios; los menores se identifican con partida de nacimiento).
- El texto libre empieza con `[DEMO]` y explica qué muestra el registro.
- `ambulancia.cambio_estado` no tiene id propio: lleva `[DEMO]` en el motivo.

## Cuentas de prueba

La semilla **no crea ni modifica usuarios de Supabase Auth**. Busca en `acceso.usuario` las cuentas de prueba con ese rol: `prueba.<algo>@climesa.com` y `admin@climesa.com` en el proyecto del curso, `prueba.<rol>@example.test` o `<rol>@example.test` en las pruebas locales (primero la que nombra el rol, por ejemplo `prueba.med` para MED). Si la cuenta de un rol de trabajo (REC, AST, ENF, MED, LAB, PAR) no tiene persona de personal, le crea una persona demo y la vincula; si ya tenía, usa esa. Así el turno, las citas, las consultas y las órdenes aparecen con la sesión real de cada rol. Si falta una cuenta, la semilla sigue con personal suelto.

El servicio de ambulancia activo (unidad En Servicio) solo se crea si existe la cuenta activa del paramédico de prueba: la regla BL-05 exige un paramédico con cuenta en la app. Sin ella, la semilla avisa con un NOTICE, deja la unidad como estaba y siembra todo lo demás.

Lote 5 (S17): la cuenta PAC de prueba queda unida a Ana Cecilia Portillo (ficha demo 4), cuya ficha lleva el correo de la cuenta; solo si la cuenta no tenía expediente. La limpieza la separa. Cada cuenta de prueba de un rol por turnos con persona de personal trabaja todos los días de 06:00 a 22:00 (guardia con excepción de carga escrita), para que la regla «sin turno activo» no la bloquee de día.

## Escala (Fase 2, S6)

La demo tiene el tamaño de un hospital real para que las pantallas se prueben llenas: listas largas, filtros, agendas con muchos médicos y una fila con gente esperando. Volúmenes al sembrar (la prueba exige los mínimos entre paréntesis):

| Dato | Cantidad | Qué muestra |
|---|---|---|
| Médicos demo | 48 (45+) | Todas las especialidades que sugieren las categorías de cita: medicina general e interna, pediatría, ginecología, cirugía, emergencias, traumatología, cardiología, neurología, dermatología, oftalmología, otorrino, psiquiatría, urología, gastroenterología y alergología. |
| Personal demo | 111 | Además de los médicos, 32 de enfermería, 8 asistentes, 6 de recepción, 6 de laboratorio, paramédicos, motoristas, limpieza y un administrativo. Ninguno tiene cuenta en Supabase Auth. |
| Pacientes | 330 (300+) | Las fichas 121 a 330 son de escala: niños, mujeres y adultos de todo el Gran San Salvador, con DUI o partida de nacimiento. |
| Turnos | unos 1 230 (1 000+) | Entre 75 y 90 turnos empiezan cada día (60+), en todas las áreas, con más de 30 médicos de turno (20+). |
| Citas | unas 515 (400+) | Repartidas entre 35 médicos (30+), siempre dentro del turno del médico. |
| Solicitudes por categoría | 30 (25+) | 16 pendientes, 7 asignadas, 4 rechazadas y 3 canceladas. |
| Fila de hoy | 77 números (60+) | Consulta externa, emergencia, laboratorio y admisiones, con prioridad `emergencia`, `urgente` y `rutina`. |

Las cantidades de citas y turnos cambian un poco con el día y la hora en que se siembra, porque los fines de semana trabajan menos personas y lo que ya pasó hoy queda atendido.

## Qué muestra cada dato y dónde mirarlo

| Entidad | Qué hay | Rol y pantalla |
|---|---|---|
| Pacientes (330) | Dos "María" para probar la búsqueda sin tilde (`maria`); un menor con partida de nacimiento; una extranjera con pasaporte; un paciente provisional NN con señas; una ficha inactiva; un par duplicado. Las fichas 28 a 120 son de volumen: nombres salvadoreños ficticios con tilde, edades de 3 a 85 años, sexo, municipio, teléfono y contacto de emergencia coherentes. Cada una cuenta una historia (historial clínico, citas próximas, atención de hoy, emergencia, hospitalización o ficha sin actividad). Las fichas 121 a 300 tienen citas con los médicos nuevos y algunas un número en la fila de hoy; las 301 a 330 pidieron cita por categoría. Los niños van a pediatría y ginecología solo ve mujeres de 18 a 45 años. La dirección de cada ficha termina con `[DEMO]` y lo que ese paciente ilustra. | REC y MED: Pacientes, Citas, Fila |
| Historial demográfico | 3 fichas editadas (María Alejandra, María Valeria, Pedro Lemus) con motivo `[DEMO]` | REC: ficha del paciente, pestaña historial |
| Duplicados | Un caso `sospechado` (fichas 5 y 6, Carlos Eduardo Mejía), uno `descartado` (fichas 1 y 2) y uno `en_revision` | REC/ADM: Duplicados |
| Edificio | Las plantas 1 a 3 y sus camas vienen de `seed.sql`; la demo no crea plantas ni camas (BL-01), solo las bodegas de urgencias y de farmacia hospitalaria. Ocupa las camas reales HAB-201 a 206 (Planta 2) y VIP-301 a 305 (Planta 3): deben estar vacías antes de sembrar; si no, la transacción se aborta completa | JOP/ADM: Espacios; ENF: mapa de camas |
| Camas (plantas 2 y 3) | Todos los estados: `ocupada` (11 camas: HAB-201 A y B, HAB-202 A, HAB-204 B, HAB-205 y HAB-206 completas, VIP-301, VIP-303 y VIP-304; ninguna semiprivada mezcla sexos ni comparte con un aislado), `reservada` (VIP-302 A y VIP-305 A), `bloqueada` (por aislamiento en HAB-202 B; por mantenimiento en HAB-204 A), `limpieza` (HAB-203 A) y `libre` (HAB-203 B). Dos pacientes en aislamiento esperan una habitación sola (`pendiente_cama`) | ENF/JOP/ADM: mapa de camas; público: ocupación |
| Equipo | Monitores, una bomba en mantenimiento y una toma de oxígeno dada de baja | ADM/JOP: Espacios |
| Personal | 111 personas demo (48 médicos de 15 especialidades, 32 de enfermería por área, asistentes, recepción, laboratorio, 3 paramédicos, 4 motoristas, limpieza, administrativo) más las personas de las cuentas de prueba. Las 74 de escala (idx 100 a 173) rotan cinco días de cada siete, de mañana o de tarde. La cardióloga no tiene turnos a propósito: en la agenda aparece "Sin turno". Personal no tiene texto libre; este cuadro hace de nota. | ADM: Personal |
| Turnos | 14 días hacia adelante y 7 hacia atrás, para todas las áreas y todos los roles de trabajo (hospitalización, VIP, laboratorio, ambulancia y recepción tienen cobertura todos los días; las noches las cubren dos personas alternas; la ambulancia tiene paramédico y motorista las 24 h, como exige RN-30): diurno, tarde, nocturno, guardia de 24 h; unos `en_curso`, `completado`, `borrador` (días 11 a 13, solo ADM y JOP) y un `cancelado`. Recepción, laboratorio y emergencia (médico y enfermería) también tienen noche todos los días, con **un solo hueco a propósito**: la noche del día +3 la emergencia queda sin médico (un aviso crítico lo dice). Las cuentas de prueba: 06:00 a 22:00 todos los días. Cada día empiezan entre 75 y 90 turnos. Los planes de siete días seguidos (D7 y T7) llevan `excepcion_carga` con su motivo `[DEMO]`. La justificación lleva `[DEMO]` donde explica algo. | ADM/JOP: Turnos y cobertura |
| Citas (515) | Todos los estados (`solicitada`, `confirmada`, `atendida`, `cancelada`, `rechazada` con motivo, `no_asistio`), pasadas y de los próximos 14 días, con médicos que tienen turno (pediatría solo entre semana, ginecología en días alternos, sin choques de horario). Los 33 médicos nuevos de consulta externa tienen hoy cuatro citas cada uno y una por día en las próximas dos semanas, siempre dentro de su turno. El motivo de cada cita explica el caso. | REC: Citas. MED: Mi día |
| Solicitudes de cita por categoría (30) | Pacientes que pidieron cita por motivo sin elegir médico: 16 `pendiente` (la más antigua primero, algunas con dos categorías, nota o médico preferido), 7 `asignada` (con su cita confirmada con un especialista de la categoría), 4 `rechazada` con motivo y 3 `cancelada`. | REC: Citas, bandeja de solicitudes; PAC: Mis citas |
| Fila de hoy (77 números) | Consulta general, emergencia, laboratorio y admisiones, cada uno en espera, llamado, en atención, atendido o no se presentó. Prioridad: la emergencia trae casos `emergencia` y `urgente`; en los demás servicios hay algún `urgente` y el resto es `rutina`. Los números salen de `atencion.emitir_numero`, nunca chocan con los reales. | REC y MED: Fila; pantalla pública |
| Consultas (80) | Firmadas (no se editan), abiertas en borrador, una `ingresada_por_error`, un addendum y el historial de varias personas, incluidos 11 crónicos (hipertensión o diabetes) con tres controles en los que la presión baja con el tratamiento. Cada consulta pertenece a una cita o a un número de fila del mismo paciente. El motivo de cada consulta explica el caso. | MED: Consulta; PAC (vinculado): Mi historial |
| Diagnósticos, recetas, signos | Diagnóstico principal y secundario (CIE-10 de `seed.sql`); recetas con renglones; signos de cada consulta y series cada ocho horas de cada hospitalizado. Sin texto libre en signos: ver tabla. | MED: Consulta |
| Laboratorio (36 órdenes) | Todos los estados (`pendiente`, `en_proceso`, `completado`, `cancelado`), rutina y urgente, de consultas y de hospitalizados; resultados normales, altos, bajos y **críticos** (glucosa, hemoglobina), unos revisados y otros sin revisar, y un resultado corregido en el historial. Cada resultado cuelga de una orden de una consulta o ingreso del mismo paciente | LAB: cola; MED: Resultados; PAC: ve valores solo de las revisadas |
| Hospitalización | 22 admisiones en todos los estados (hospitalizado, alta firmada, pendiente de cama, egresado, cancelada) con los datos del ingreso guiado de la ronda 2: motivo, origen vinculado a una consulta, cita, número de emergencia o servicio de ambulancia que existe, aislamiento (contacto, gotitas, aérea), visitas y visitantes, y ninguna marcada como legado. Hay traslados de cama, reservas (activa, usada, vencida), altas médica, voluntaria y por traslado, notas de enfermería y camas bloqueadas por aislamiento. | ENF, MED, JOP: Hospitalización |
| Ambulancia | 16 solicitudes (por confirmar, confirmadas, descartadas con motivo, canceladas; por teléfono con el nombre de quien llamó y desde la app) y 14 servicios de los últimos días: completados con sus cinco hitos, tripulación y reporte prehospitalario, cancelado, sin traslado, rechaza traslado, interhospitalarios y uno **activo** con ubicaciones. La unidad queda En Servicio; al limpiar vuelve a su estado previo. | JOP/PAR/REC: Ambulancia |
| Inventario | 40 artículos demo, 44 lotes (vencidos, por vencer en menos de 30 días, uno dado de baja, un artículo retirado y otro agotado), existencias en cuatro bodegas, varios artículos **bajo el mínimo** y movimientos de entrada, salida, consumo con paciente, traslado, ajuste y merma | AST/JOP: Inventario |
| Avisos | 16 avisos con las tres prioridades (`atencion`, `urgente`, `critico`), públicos, solo para roles o ambos, vigentes, programados y vencidos | ADM: Avisos; tablero de cada rol; pantalla pública |
| Vinculaciones | 12 solicitudes: 5 `pendiente` (dos con fecha de nacimiento que no coincide), 4 `aprobada` y 3 `rechazada` con motivo. Las cuentas solicitantes son filas demo de `acceso.usuario` sin cuenta en Auth (no pueden entrar). | REC: Vinculaciones |
| Invitaciones | 9: `enviada`, `expirada`, `aceptada` y `rechazada` | ADM: Personal / Usuarios |
| Conexiones de Lote 5 (S17) | Números de fila de hoy ligados a su cita (llegada registrada) junto a números sin cita; 6 reprogramaciones (4 `pendiente`, 1 `rechazada`, 1 `vencida`) con la franja dentro de un turno del mismo médico; dos citas próximas y una solicitud por categoría de la paciente de la cuenta PAC; una solicitud que pide a la cardióloga sin turnos; resultados por revisar del médico (`critico` pendiente y revisado, `observacion`); dos informes externos que no son texto (JPEG y PDF, solo la referencia: sin archivo en Storage); avisos de nivel `informativo`, `importante` y `critico` y uno dirigido al área de emergencia; mantenimiento preventivo en la bitácora de la ambulancia; siete lecturas del expediente de la paciente PAC | REC, MED, LAB, PAC, JOP |

## Lo que no se siembra, y por qué

- `acceso.acceso_excepcional`: el módulo se retira del producto (decisión del propietario, ronda 1, punto 12).
- `acceso.dispositivo_push`: requiere un token de dispositivo real.
- `acceso.administrador_principal`: lo fija la API la primera vez.
- `pacientes.busqueda_registro`: token de 10 minutos que crea la API al buscar.
- `plataforma.outbox`, `plataforma.inbox`, `plataforma.idempotencia`, `plataforma.politica`: los escribe la API en cada operación o son política vigente. (Los disparadores de tiempo real de la base sí agregan eventos a `plataforma.outbox` al sembrar y al limpiar.)
- `plataforma.auditoria`: solo siete lecturas del expediente de la paciente de la cuenta PAC (Lote 5, «Quién vio mi expediente»), firmadas igual que en la API para que la cadena siga válida, con `evento_id` fijo `de300000-0098-...`. No se borran al limpiar.
- `atencion.contador_fila`: lo mueve `atencion.emitir_numero` al sembrar la fila.
- Catálogos (`seed.sql`): CIE-10, exámenes, rangos de referencia, tipos de equipo y de identificador, roles y permisos.

## Coherencia que garantiza la semilla (la prueba lo comprueba)

- Cada resultado de laboratorio cuelga de una orden de una consulta o de un ingreso del mismo paciente; ninguna orden es anterior a su consulta.
- Cada ingreso apunta a un origen que existe, es del mismo paciente y es anterior al ingreso.
- La ocupación coincide con las admisiones: solo los hospitalizados y las altas firmadas tienen cama abierta, una sola; la categoría es la de la habitación; una semiprivada no mezcla sexos; quien está en aislamiento queda solo y la otra cama se bloquea; la VIP no se traslada.
- Los tiempos salen de `now()`: nada que ya ocurrió (consultas firmadas, signos, resultados, hitos, altas) queda en el futuro, a cualquier hora que se ejecute.

## Cuidados al limpiar

- La regla "nada clínico se borra" protege datos **reales**. `limpiar-demo.sql` solo toca filas demo y lo que crearon las cuentas de prueba (sección 0; la lista exacta está en [`docs/operacion/carga-demo.md`](../../docs/operacion/carga-demo.md)) y lo declara en su cabecera.
- Sin `set demo.confirmar = 'limpiar'` en la misma sesión la limpieza se detiene sin borrar nada. `demo.cjs` la pone solo con `--ejecutar`; sin ese indicador simula y deshace.
- La base prohíbe cambiar los hijos de una consulta firmada. Para borrar diagnósticos, recetas, renglones y signos de las consultas demo firmadas, la limpieza **desactiva de forma explícita** los cuatro disparadores `*_consulta_abierta` dentro de la transacción y los reactiva antes de seguir. Si algo falla, todo se revierte y quedan activos. No se desactiva nada más.
- La limpieza no puede correr con `sghu_api` (no tiene `DELETE` sobre esas tablas): usa el rol dueño.
- Pacientes, personas de personal y espacios demo que datos **reales** ya usan (por ejemplo una cita creada de verdad sobre un paciente demo) se conservan y la limpieza lo avisa con un `NOTICE`.
- La auditoría (`plataforma.auditoria`) es de solo inserción y encadenada: los eventos sobre pacientes demo se quedan.
- Los números de fila ya emitidos no se reutilizan: la numeración de hoy queda con huecos.
- La vinculación de una cuenta de prueba a una persona demo se deshace (solo la que hizo la semilla); la cuenta no se borra.

## Turno de noche de prueba

`turno-noche.sql` agrega una segunda cuenta de prueba por rol de trabajo (`prueba.noche.rec`, `.enf`, `.med`, `.lab`, `.par` en `@climesa.com`) con turno de 22:00 a 06:00 durante 14 noches. Cada cuenta es copia de la cuenta de prueba de día de su rol y entra con la misma contraseña; el archivo no lleva contraseñas. Es idempotente; tras recargar la demo, vuelve a ejecutarlo:

```sh
psql "$DEMO_DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f tools/demo/turno-noche.sql
```

