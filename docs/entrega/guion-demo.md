# Guion de la defensa · CLIMESA

Demostración en vivo del 21 de noviembre de 2026. Usa solo datos ficticios y las cuentas de demostración de cada rol (las credenciales se entregan por un canal privado del equipo; no están en el repositorio). El guion cubre lo que existe en la rama `fix/fase0-api`; los módulos en desarrollo se mencionan al final sin demostrarse como terminados.

## Preparación (el día anterior y 30 minutos antes)

| Paso | Qué hacer | Comprobación |
|---|---|---|
| 1 | Desplegar la versión aprobada en Render (`sghu-api` y `sghu-web`, Manual Deploy) | `GET https://sghu-api.onrender.com/salud` responde 200 |
| 2 | Confirmar que las migraciones `20261114000100…300` están aplicadas en Supabase | Iniciar y firmar una consulta de prueba no da error |
| 3 | Despertar la API 5 minutos antes (plan gratuito) | Abrir https://sghu-web.onrender.com e ingresar con cualquier cuenta |
| 4 | Con JOP, asignar hoy un turno al médico de prueba en su consultorio | En **Turnos** aparece `En curso` o `Pendiente de iniciar` |
| 5 | Preparar un paciente ficticio con cuenta PAC vinculada y una cita solicitada | En **Citas** (REC) aparece `Solicitada` |
| 6 | Instalar el APK en el teléfono, apuntando a la API de producción (ver `ENTREGA_2026-11-21.md`, sección 6) | La app abre y el ingreso con PAC muestra **Mis citas** |
| 7 | Abrir dos navegadores (o una ventana normal y una privada) para la demostración de concurrencia | Ambas sesiones en la web de producción |

Pantallas en el proyector: web (izquierda) y teléfono Android duplicado con `scrcpy` u otra herramienta (derecha).

## Bloque 1 · Arquitectura (3 minutos)

1. Mostrar el diagrama de la sección 3 de `docs/entrega/documento-arquitectura.pdf`: tres clientes, una API NestJS, Supabase (Postgres, Auth, Realtime).
2. Explicar en una frase cada regla: la API es la única que escribe; permisos por nombre; invariantes en la base; tiempo real sin recarga.

## Bloque 2 · Flujo PAC → REC → MED → LAB → PAC (12 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Android · PAC | **Mis citas → Solicitar cita**: elegir médico, fecha y una franja libre de 20 minutos | La solicitud queda `Solicitada` |
| 2 | Web · REC | **Citas**: la solicitud aparece sin recargar; **Gestionar → Confirmar** | La cita pasa a `Confirmada` |
| 3 | Android · PAC | Volver a **Mis citas** | La cita aparece `Confirmada` sin cerrar la app |
| 4 | Web · REC | **Fila del día**: emitir número para el paciente | El número aparece en la fila |
| 5 | Android · AST (o web · MED) | Llamar el número | El estado pasa a `Llamado`; PAC lo ve en **Mi turno** |
| 6 | Web · MED | **Mi consultorio**: iniciar la consulta desde la cita | Consulta `abierta` vinculada a la cita |
| 7 | Web · MED | Registrar signos vitales, un diagnóstico CIE-10 (principal) y una receta | Cada registro se guarda; el diagnóstico principal es único |
| 8 | Web · MED | Pedir un examen de laboratorio desde la consulta abierta | La orden aparece `Pendiente` |
| 9 | Web · MED | Firmar la consulta | La cita pasa a `Atendida`; la consulta ya no se edita |
| 10 | Web o Android · LAB | **Laboratorio**: tomar muestra con doble identificación (expediente + nombre completo) | La orden pasa a `En Proceso`. Si el nombre no coincide, la API lo rechaza |
| 11 | LAB | Capturar resultados y completar | La orden pasa a `Completado`; la marca (normal, alto, crítico) la calcula la API |
| 12 | Android · PAC | **Mis exámenes** | Ve el estado `Completado`, **sin valores** |
| 13 | Web · MED | Revisar el resultado | Queda revisado |
| 14 | Android · PAC | **Mis exámenes** | Ahora ve los valores |

Punto para explicar: los pasos 12 a 14 demuestran la política de privacidad (D-040): el paciente ve el estado siempre y los valores solo tras la revisión médica.

## Bloque 3 · Habitaciones y concurrencia (6 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Web · JOP | **Edificio**: mostrar el árbol. Planta 3 con VIP-301 a VIP-305 (1 cama) y planta 2 con HAB-201 a HAB-206 (2 camas) | 17 camas: 5 VIP y 12 semiprivadas |
| 2 | Web · REC | **Hospitalización**: crear una admisión y pedir sugerencias de cama | La API sugiere camas compatibles (sexo de la habitación, aislamiento) |
| 3 | Web · REC (navegador 1) y web · JOP (navegador 2) | Preparar dos admisiones y asignar **la misma cama** casi al mismo tiempo | Una asignación se confirma; la otra recibe 409 y debe elegir otra cama |
| 4 | Ambos navegadores | Mirar el **tablero de camas** | La cama ocupada se actualiza en las dos sesiones sin recargar |
| 5 | Web · REC | Registrar salida del paciente | La cama queda en limpieza |

Punto para explicar: la doble asignación la impide PostgreSQL con `EXCLUDE USING gist` (sección 6.3 del documento de arquitectura), no el cliente.

## Bloque 4 · Turnos del personal (3 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Web · JOP | **Turnos**: filtrar por área y rol | Se ven las asignaciones del día |
| 2 | Web · JOP | Asignar un turno nocturno 18:00–07:00 a una persona y luego intentar asignarla el día en que termina | La API responde `personal_en_descanso` con la hora de disponibilidad |
| 3 | Android · MED | **Mis turnos** | Ve su turno publicado |

## Bloque 5 · Ambulancia (2 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Web · JOP | **Ambulancia**: poner la unidad en mantenimiento | Estado `En Mantenimiento` |
| 2 | Android · PAR | **Unidad** | El cambio llega sin recargar |
| 3 | Web · JOP | Sacar la unidad de mantenimiento | Estado `Disponible` |

Decir con claridad: solicitud, despacho, hitos y bitácora están **en desarrollo**. La base ya garantiza un solo servicio activo por unidad (`servicio_activo_unico`), pero todavía no hay endpoint para despachar.

## Bloque 6 · Seguridad y privacidad (4 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Web · ADM | Abrir el menú | ADM ve Usuarios, Personal, Edificio y Turnos; no ve Mi consultorio ni Laboratorio |
| 2 | Web · ADM | Escribir a mano la ruta de un módulo clínico (por ejemplo `#/consultas`) | "Sin permiso" |
| 3 | Web · DPD | **Auditoría** | Ve quién, cuándo y qué tipo de dato, sin contenido clínico |
| 4 | Web · REC | Abrir la ficha de un paciente | Ve datos personales; no ve diagnósticos ni resultados |
| 5 | Documento | Mostrar la matriz RBAC (Anexo B) y `permisos.csv` | Explicar que el código pregunta permisos, no roles (`sin-roles-en-codigo.spec.ts`) |

## Bloque 7 · Calidad y cierre (3 minutos)

1. Mostrar los workflows de `.github/workflows/` (uno por plataforma) y una ejecución de pruebas de la API.
2. Mostrar MVVM en Android (`*Screen.kt` + `*ViewModel.kt` con `StateFlow` y corrutinas) y la estructura SwiftUI/MVVM de iOS.
3. Limitaciones, dichas por el equipo antes de que pregunten: ambulancia incompleta, sin pantalla pública, módulo DPD e historial clínico en desarrollo, iOS sin compilar, Figma desactualizado (sección 15 del documento de arquitectura).

## Plan B

| Si pasa esto | Hacer esto |
|---|---|
| La API tarda en responder | Es el arranque del plan gratuito; esperar un minuto y repetir |
| Una pantalla no se actualiza sola | Mostrar la banda de conexión; al reconectar, la web pide `GET /eventos?after=` una vez |
| Falla el teléfono | Mostrar el mismo flujo de PAC con la API en la documentación interactiva (`/api/v1/docs`) o con el emulador |
| No hay agenda para MED | Repetir el paso 4 de la preparación con JOP |
