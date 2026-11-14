# Datos de demostración

Datos **ficticios, anotados y removibles** para aprender el software sin inventar registros a mano. No es una migración: no cambia el esquema ni vive en `supabase/migrations/`. Se ejecuta a mano, una vez por entorno de curso, con el rol dueño de las tablas (`postgres` en Supabase). Nunca con `sghu_api` y nunca contra datos reales.

| Archivo | Para qué |
|---|---|
| `semilla-demo.sql` | Siembra todo. Idempotente (se puede repetir), una sola transacción. |
| `limpiar-demo.sql` | Quita exactamente lo demo, en orden de dependencias. Idempotente. |
| `../../api/tests/datos-demo.spec.ts` | Prueba ambos archivos sobre el esquema completo (PGlite): siembra dos veces, cuenta filas por tabla, limpia y comprueba que la base queda igual que antes. |

## Cómo usarlo

1. Aplica todas las migraciones y `supabase/seed.sql` (el edificio, el catálogo de laboratorio y el CIE-10 salen de ahí).
2. Ejecuta `semilla-demo.sql` en el editor SQL de Supabase (o `psql -f`). Conviene hacerlo en horario laboral: las citas, la fila y los turnos de "hoy" se siembran respecto de la fecha y hora del momento.
3. Para refrescar las fechas: ejecuta `limpiar-demo.sql` y vuelve a sembrar. Sembrar de nuevo sin limpiar no mueve lo que ya existe.
4. Antes de la entrega real, ejecuta `limpiar-demo.sql`.

## Cómo se reconoce lo demo (marca de borrado)

- Todos los ids empiezan con `de300000-` (UUID fijo; el cuarto grupo dice el tipo de dato).
- Pacientes: expediente `9900001-d` a `9900120-d` y DUI `9000nnnn-d` (dígito verificador válido, ficticios; los menores se identifican con partida de nacimiento).
- El texto libre empieza con `[DEMO]` y explica qué muestra el registro.
- `ambulancia.cambio_estado` no tiene id propio: lleva `[DEMO]` en el motivo.

## Cuentas de prueba

La semilla **no crea ni modifica usuarios de Supabase Auth**. Busca en `acceso.usuario` las cuentas `prueba.<rol>@example.test` (o `<rol>@example.test`) con ese rol. Si la cuenta de un rol de trabajo (REC, AST, ENF, MED, LAB, PAR) no tiene persona de personal, le crea una persona demo y la vincula; si ya tenía, usa esa. Así el turno, las citas, las consultas y las órdenes aparecen con la sesión real de cada rol. Si falta una cuenta, la semilla sigue con personal suelto.

La cuenta `PAC` real no se toca: para verla vinculada, usa el módulo de vinculación con el DUI `90000004-1` de Ana Cecilia Portillo y su fecha de nacimiento.

## Qué muestra cada dato y dónde mirarlo

| Entidad | Qué hay | Rol y pantalla |
|---|---|---|
| Pacientes (120) | Dos "María" para probar la búsqueda sin tilde (`maria`); un menor con partida de nacimiento; una extranjera con pasaporte; un paciente provisional NN con señas; una ficha inactiva; un par duplicado. Las fichas 28 a 120 son de volumen: nombres salvadoreños ficticios con tilde, edades de 3 a 85 años, sexo, municipio, teléfono y contacto de emergencia coherentes. Cada una cuenta una historia (historial clínico, citas próximas, atención de hoy, emergencia, hospitalización o ficha sin actividad). La dirección de cada ficha termina con `[DEMO]` y lo que ese paciente ilustra. | REC y MED: Pacientes, Citas, Fila |
| Historial demográfico | 3 fichas editadas (María Alejandra, María Valeria, Pedro Lemus) con motivo `[DEMO]` | REC: ficha del paciente, pestaña historial |
| Duplicados | Un caso `sospechado` (fichas 5 y 6, Carlos Eduardo Mejía), uno `descartado` (fichas 1 y 2) y uno `en_revision` | REC/ADM: Duplicados |
| Edificio | Planta 4 (ala norte): 10 semiprivadas de 2 camas y 5 VIP, más las bodegas de urgencias y de farmacia hospitalaria. Plantas 1 a 3 vienen de `seed.sql` | JOP/ADM: Espacios; ENF: mapa de camas |
| Camas (Planta 4) | Todos los estados: `ocupada` (13 camas; ninguna semiprivada mezcla sexos ni comparte con un aislado), `reservada` (VIP-402 A y VIP-405 A), `bloqueada` (por aislamiento en HAB-402 B, HAB-407 B y HAB-408 B; por mantenimiento en HAB-404 A), `limpieza` (HAB-403 A, HAB-409 A, HAB-410 A) y `libre` | ENF/JOP/ADM: mapa de camas; público: ocupación |
| Equipo | Monitores, una bomba en mantenimiento y una toma de oxígeno dada de baja | ADM/JOP: Espacios |
| Personal | 37 personas demo (7 médicos de varias especialidades, enfermería por planta y noche, asistente, recepción, laboratorio, 3 paramédicos, 4 motoristas, limpieza, administrativo) más las personas de las cuentas de prueba. La cardióloga no tiene turnos a propósito: en la agenda aparece "Sin turno". Personal no tiene texto libre; este cuadro hace de nota. | ADM: Personal |
| Turnos | 14 días hacia adelante y el día anterior, para todas las áreas y todos los roles de trabajo (hospitalización, VIP, Planta 4, laboratorio, ambulancia y recepción tienen cobertura todos los días; las noches las cubren dos personas alternas; la ambulancia tiene paramédico y motorista las 24 h, como exige RN-30): diurno, tarde, nocturno, guardia de 24 h; unos `en_curso`, `completado`, `borrador` (días 11 a 13, solo ADM y JOP) y un `cancelado`. La emergencia queda con huecos de cobertura a propósito. La justificación lleva `[DEMO]` donde explica algo. | ADM/JOP: Turnos y cobertura |
| Citas (140+) | Todos los estados (`solicitada`, `confirmada`, `atendida`, `cancelada`, `rechazada` con motivo, `no_asistio`), pasadas y de los próximos 14 días, con médicos que tienen turno (pediatría solo entre semana, ginecología en días alternos, sin choques de horario). El motivo de cada cita explica el caso. | REC: Citas. MED: Mi día |
| Fila de hoy (33 números) | Consulta general, emergencia, laboratorio y admisiones, cada uno en espera, llamado, en atención, atendido o no se presentó. Los números salen de `atencion.emitir_numero`, nunca chocan con los reales. | REC y MED: Fila; pantalla pública |
| Consultas (80) | Firmadas (no se editan), abiertas en borrador, una `ingresada_por_error`, un addendum y el historial de varias personas, incluidos 11 crónicos (hipertensión o diabetes) con tres controles en los que la presión baja con el tratamiento. Cada consulta pertenece a una cita o a un número de fila del mismo paciente. El motivo de cada consulta explica el caso. | MED: Consulta; PAC (vinculado): Mi historial |
| Diagnósticos, recetas, signos | Diagnóstico principal y secundario (CIE-10 de `seed.sql`); recetas con renglones; signos de cada consulta y series cada ocho horas de cada hospitalizado. Sin texto libre en signos: ver tabla. | MED: Consulta |
| Laboratorio (36 órdenes) | Todos los estados (`pendiente`, `en_proceso`, `completado`, `cancelado`), rutina y urgente, de consultas y de hospitalizados; resultados normales, altos, bajos y **críticos** (glucosa, hemoglobina), unos revisados y otros sin revisar, y un resultado corregido en el historial. Cada resultado cuelga de una orden de una consulta o ingreso del mismo paciente | LAB: cola; MED: Resultados; PAC: ve valores solo de las revisadas |
| Hospitalización | 22 admisiones en todos los estados (hospitalizado, alta firmada, pendiente de cama, egresado, cancelada) con los datos del ingreso guiado de la ronda 2: motivo, origen vinculado a una consulta, cita, número de emergencia o servicio de ambulancia que existe, aislamiento (contacto, gotitas, aérea), visitas y visitantes, y ninguna marcada como legado. Hay traslados de cama, reservas (activa, usada, vencida), altas médica, voluntaria y por traslado, notas de enfermería y camas bloqueadas por aislamiento. | ENF, MED, JOP: Hospitalización |
| Ambulancia | 16 solicitudes (por confirmar, confirmadas, descartadas con motivo, canceladas; por teléfono con el nombre de quien llamó y desde la app) y 14 servicios de los últimos días: completados con sus cinco hitos, tripulación y reporte prehospitalario, cancelado, sin traslado, rechaza traslado, interhospitalarios y uno **activo** con ubicaciones. La unidad queda En Servicio; al limpiar vuelve a su estado previo. | JOP/PAR/REC: Ambulancia |
| Inventario | 40 artículos demo, 44 lotes (vencidos, por vencer en menos de 30 días, uno dado de baja, un artículo retirado y otro agotado), existencias en cuatro bodegas, varios artículos **bajo el mínimo** y movimientos de entrada, salida, consumo con paciente, traslado, ajuste y merma | AST/JOP: Inventario |
| Avisos | 16 avisos con las tres prioridades (`atencion`, `urgente`, `critico`), públicos, solo para roles o ambos, vigentes, programados y vencidos | ADM: Avisos; tablero de cada rol; pantalla pública |
| Vinculaciones | 12 solicitudes: 5 `pendiente` (dos con fecha de nacimiento que no coincide), 4 `aprobada` y 3 `rechazada` con motivo. Las cuentas solicitantes son filas demo de `acceso.usuario` sin cuenta en Auth (no pueden entrar). | REC: Vinculaciones |
| Invitaciones | 9: `enviada`, `expirada`, `aceptada` y `rechazada` | ADM: Personal / Usuarios |

## Lo que no se siembra, y por qué

- `acceso.acceso_excepcional`: el módulo se retira del producto (decisión del propietario, ronda 1, punto 12).
- `acceso.dispositivo_push`: requiere un token de dispositivo real.
- `acceso.administrador_principal`: lo fija la API la primera vez.
- `pacientes.busqueda_registro`: token de 10 minutos que crea la API al buscar.
- `plataforma.auditoria`, `plataforma.outbox`, `plataforma.inbox`, `plataforma.idempotencia`, `plataforma.politica`: los escribe la API en cada operación o son política vigente; sembrarlos rompería la cadena de hash o los eventos. Lo sembrado se ve en pantalla sin ellos.
- `atencion.contador_fila`: lo mueve `atencion.emitir_numero` al sembrar la fila.
- Catálogos (`seed.sql`): CIE-10, exámenes, rangos de referencia, tipos de equipo y de identificador, roles y permisos.

## Coherencia que garantiza la semilla (la prueba lo comprueba)

- Cada resultado de laboratorio cuelga de una orden de una consulta o de un ingreso del mismo paciente; ninguna orden es anterior a su consulta.
- Cada ingreso apunta a un origen que existe, es del mismo paciente y es anterior al ingreso.
- La ocupación coincide con las admisiones: solo los hospitalizados y las altas firmadas tienen cama abierta, una sola; la categoría es la de la habitación; una semiprivada no mezcla sexos; quien está en aislamiento queda solo y la otra cama se bloquea; la VIP no se traslada.
- Los tiempos salen de `now()`: nada que ya ocurrió (consultas firmadas, signos, resultados, hitos, altas) queda en el futuro, a cualquier hora que se ejecute.

## Cuidados al limpiar

- La regla "nada clínico se borra" protege datos **reales**. `limpiar-demo.sql` solo toca filas demo y lo declara en su cabecera.
- La base prohíbe cambiar los hijos de una consulta firmada. Para borrar diagnósticos, recetas, renglones y signos de las consultas demo firmadas, la limpieza **desactiva de forma explícita** los cuatro disparadores `*_consulta_abierta` dentro de la transacción y los reactiva antes de seguir. Si algo falla, todo se revierte y quedan activos. No se desactiva nada más.
- La limpieza no puede correr con `sghu_api` (no tiene `DELETE` sobre esas tablas): usa el rol dueño.
- Pacientes, personas de personal y espacios demo que datos **reales** ya usan (por ejemplo una cita creada de verdad sobre un paciente demo) se conservan y la limpieza lo avisa con un `NOTICE`.
- La auditoría (`plataforma.auditoria`) es de solo inserción y encadenada: los eventos sobre pacientes demo se quedan.
- Los números de fila ya emitidos no se reutilizan: la numeración de hoy queda con huecos.
- La vinculación de una cuenta de prueba a una persona demo se deshace (solo la que hizo la semilla); la cuenta no se borra.
