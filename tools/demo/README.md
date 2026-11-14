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
- Pacientes: expediente `9900001-d` a `9900027-d` y DUI `9000nnnn-d` (dígito verificador válido, ficticios).
- El texto libre empieza con `[DEMO]` y explica qué muestra el registro.
- `ambulancia.cambio_estado` no tiene id propio: lleva `[DEMO]` en el motivo.

## Cuentas de prueba

La semilla **no crea ni modifica usuarios de Supabase Auth**. Busca en `acceso.usuario` las cuentas `prueba.<rol>@example.test` (o `<rol>@example.test`) con ese rol. Si la cuenta de un rol de trabajo (REC, AST, ENF, MED, LAB, PAR) no tiene persona de personal, le crea una persona demo y la vincula; si ya tenía, usa esa. Así el turno, las citas, las consultas y las órdenes aparecen con la sesión real de cada rol. Si falta una cuenta, la semilla sigue con personal suelto.

La cuenta `PAC` real no se toca: para verla vinculada, usa el módulo de vinculación con el DUI `90000004-1` de Ana Cecilia Portillo y su fecha de nacimiento.

## Qué muestra cada dato y dónde mirarlo

| Entidad | Qué hay | Rol y pantalla |
|---|---|---|
| Pacientes (27) | Dos "María" para probar la búsqueda sin tilde (`maria`); un menor con partida de nacimiento; una extranjera con pasaporte; un paciente provisional NN con señas; una ficha inactiva; un par duplicado. La dirección de cada ficha termina con `[DEMO]` y lo que ese paciente ilustra. | REC y MED: Pacientes, Citas, Fila |
| Historial demográfico | 3 fichas editadas (María Alejandra, María Valeria, Pedro Lemus) con motivo `[DEMO]` | REC: ficha del paciente, pestaña historial |
| Duplicados | Un caso `sospechado` (fichas 5 y 6, Carlos Eduardo Mejía) y uno `descartado` (fichas 1 y 2) | REC/ADM: Duplicados |
| Edificio | Planta 4 (ala norte): 4 semiprivadas de 2 camas y 2 VIP, más una bodega de urgencias. Plantas 1 a 3 vienen de `seed.sql` | JOP/ADM: Espacios; ENF: mapa de camas |
| Camas (Planta 4) | `ocupada` (HAB-401 A y B, HAB-402 A, VIP-401 A), `reservada` (VIP-402 A), `bloqueada` (HAB-402 B por aislamiento y HAB-404 A por mantenimiento), `limpieza` (HAB-403 A), `libre` (HAB-403 B, HAB-404 B) | ENF/JOP/ADM: mapa de camas; público: ocupación |
| Equipo | Monitores, una bomba en mantenimiento y una toma de oxígeno dada de baja | ADM/JOP: Espacios |
| Personal | 17 personas demo (5 médicos de varias especialidades, enfermería, asistente, recepción, laboratorio, paramedico, motorista, limpieza, administrativo) más las personas de las cuentas de prueba. La cardióloga no tiene turnos a propósito: en la agenda aparece "Sin turno". Personal no tiene texto libre; este cuadro hace de nota. | ADM: Personal |
| Turnos | 14 días hacia adelante y el día anterior, para todas las áreas: diurno, tarde, nocturno, guardia de 24 h; unos `en_curso`, `completado`, `borrador` (días 11 a 13, solo ADM y JOP) y un `cancelado`. La emergencia queda con huecos de cobertura a propósito. La justificación lleva `[DEMO]` donde explica algo. | ADM/JOP: Turnos y cobertura |
| Citas (27) | Una en cada estado: `solicitada`, `confirmada`, `atendida`, `cancelada`, `rechazada` (con motivo), `no_asistio`; distintos médicos. El motivo de cada cita explica el caso. | REC: Citas. MED: Mi día |
| Fila de hoy (13 números) | Por servicio: en espera, llamado, en atención, atendido, no se presentó. Los números salen de `atencion.emitir_numero`, nunca chocan con los reales. | REC y MED: Fila; pantalla pública |
| Consultas (11) | Firmadas (no se editan), abiertas en borrador, una `ingresada_por_error`, historial de 3 consultas de un hipertenso y un addendum. El motivo de cada consulta explica el caso. | MED: Consulta; PAC (vinculado): Mi historial |
| Diagnósticos, recetas, signos | Principal y secundario; recetas con renglones; signos de consultas y de hospitalizados. Sin texto libre en signos: ver tabla. | MED: Consulta |
| Laboratorio (7 órdenes) | Hemograma completado y **revisado** (con un leucocito alto y un resultado corregido en el historial), hemograma **pendiente** urgente, química básica en proceso, orina completada sin revisar, orden cancelada con motivo, glucosa **crítica** sin revisar, hemograma de un hospitalizado en proceso | LAB: cola; MED: Resultados; PAC: ve valores solo de las revisadas |
| Hospitalización | 6 admisiones: 3 hospitalizados (uno con aislamiento y una paciente trasladada de cama), alta firmada en VIP, pendiente de cama con reserva y un egreso con cama en limpieza. Hay notas de enfermería y alta con pendientes con responsable. | ENF, MED, JOP: Hospitalización |
| Ambulancia | 6 solicitudes (2 por confirmar, confirmada, descartada con motivo, cancelada) y 6 servicios: completado, cancelado, sin traslado, rechaza traslado, traslado interhospitalario y uno **activo** con hitos, ubicaciones y reporte prehospitalario. La unidad queda En Servicio; al limpiar vuelve a su estado previo. | JOP/PAR/REC: Ambulancia |
| Inventario | 10 artículos demo, 11 lotes (uno vencido), existencias en tres bodegas, 5 artículos **bajo el mínimo** y movimientos de entrada, salida, consumo con paciente, traslado y ajuste | AST/JOP: Inventario |
| Avisos | Uno vigente, uno programado, uno vencido y otro vigente | ADM: Avisos; pantalla pública |
| Vinculaciones | 2 solicitudes `pendiente` (una con fecha de nacimiento que no coincide), 1 `aprobada` y 1 `rechazada` con motivo. Las cuentas solicitantes son filas demo de `acceso.usuario` sin cuenta en Auth (no pueden entrar). | REC: Vinculaciones |
| Invitaciones | `enviada`, `expirada` y `aceptada` | ADM: Personal / Usuarios |

## Lo que no se siembra, y por qué

- `acceso.acceso_excepcional`: el módulo se retira del producto (decisión del propietario, ronda 1, punto 12).
- `acceso.dispositivo_push`: requiere un token de dispositivo real.
- `acceso.administrador_principal`: lo fija la API la primera vez.
- `pacientes.busqueda_registro`: token de 10 minutos que crea la API al buscar.
- `plataforma.auditoria`, `plataforma.outbox`, `plataforma.inbox`, `plataforma.idempotencia`, `plataforma.politica`: los escribe la API en cada operación o son política vigente; sembrarlos rompería la cadena de hash o los eventos. Lo sembrado se ve en pantalla sin ellos.
- `atencion.contador_fila`: lo mueve `atencion.emitir_numero` al sembrar la fila.
- Catálogos (`seed.sql`): CIE-10, exámenes, rangos de referencia, tipos de equipo y de identificador, roles y permisos.

## Cuidados al limpiar

- La regla "nada clínico se borra" protege datos **reales**. `limpiar-demo.sql` solo toca filas demo y lo declara en su cabecera.
- La base prohíbe cambiar los hijos de una consulta firmada. Para borrar diagnósticos, recetas, renglones y signos de las consultas demo firmadas, la limpieza **desactiva de forma explícita** los cuatro disparadores `*_consulta_abierta` dentro de la transacción y los reactiva antes de seguir. Si algo falla, todo se revierte y quedan activos. No se desactiva nada más.
- La limpieza no puede correr con `sghu_api` (no tiene `DELETE` sobre esas tablas): usa el rol dueño.
- Pacientes, personas de personal y espacios demo que datos **reales** ya usan (por ejemplo una cita creada de verdad sobre un paciente demo) se conservan y la limpieza lo avisa con un `NOTICE`.
- La auditoría (`plataforma.auditoria`) es de solo inserción y encadenada: los eventos sobre pacientes demo se quedan.
- Los números de fila ya emitidos no se reutilizan: la numeración de hoy queda con huecos.
- La vinculación de una cuenta de prueba a una persona demo se deshace (solo la que hizo la semilla); la cuenta no se borra.
