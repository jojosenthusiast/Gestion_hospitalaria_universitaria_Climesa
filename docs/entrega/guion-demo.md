# Guion de la defensa · CLIMESA

Demostración en vivo del 21 de noviembre de 2026. Usa solo datos ficticios y las cuentas de demostración de cada rol (las credenciales se entregan por un canal privado del equipo; no están en el repositorio). El guion cubre lo que existe en `main` (hasta el PR #68): flujo clínico, camas, turnos, ambulancia, vinculación de cuentas, acceso excepcional, página pública, métricas y la app iOS. Lo que sigue pendiente se dice al final.

## Preparación (el día anterior y 30 minutos antes)

| Paso | Qué hacer | Comprobación |
|---|---|---|
| 1 | Desplegar `main` en Render (`sghu-api` y `sghu-web`, Manual Deploy) y sincronizar `render.yaml` (reescritura `/*` → `/index.html` y cabeceras) | `GET https://sghu-api.onrender.com/salud` responde 200 y `https://sghu-web.onrender.com/publico` abre sin 404 |
| 2 | Confirmar que las migraciones hasta `20261116002000` están aplicadas en Supabase y, desde la medianoche del 14-nov, también `20261114000300` | Iniciar y firmar una consulta de prueba no da error; `GET /api/v1/publico/ocupacion` responde 200 |
| 3 | Despertar la API 5 minutos antes (plan gratuito) | Abrir https://sghu-web.onrender.com e ingresar con cualquier cuenta |
| 4 | Con JOP, asignar hoy un turno al médico de prueba en su consultorio | En **Turnos** aparece `En curso` o `Pendiente de iniciar` |
| 5 | Preparar un paciente ficticio con cuenta PAC vinculada y una cita solicitada | En **Citas** (REC) aparece `Solicitada` |
| 6 | Instalar el APK en el teléfono, apuntando a la API de producción (ver `ENTREGA_2026-11-21.md`, sección 7) | La app abre y el ingreso con PAC muestra **Mis citas** |
| 7 | Abrir dos navegadores (o una ventana normal y una privada) para la demostración de concurrencia | Ambas sesiones en la web de producción |
| 8 | Si se fusionó el selector temporal de rol (`docs/operacion/login-de-prueba.md`), apagarlo | El ingreso pide correo y contraseña |
| 9 | Preparar una segunda cuenta PAC sin expediente vinculado y un paciente ficticio del que se conozca el DUI | Aparece en **Pacientes** (REC) |
| 10 | Tener un simulador o iPhone con la app iOS y cuentas MED y PAC (`ios/README.md`) | La app abre y el ingreso con MED muestra **Mi día** |
| 11 | Dejar una solicitud de ambulancia creada por PAC o REC y a PAR con turno | En **Ambulancia** (JOP) aparece la solicitud |

Pantallas en el proyector: web (izquierda) y teléfono Android duplicado con `scrcpy` u otra herramienta (derecha); el simulador iOS se muestra en el bloque 9.

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

## Bloque 3 · Vinculación de cuenta con expediente (3 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Android · PAC (segunda cuenta) | **Vincular expediente**: ingresar el DUI y la fecha de nacimiento del paciente ficticio | La solicitud queda pendiente; la cuenta aún no ve datos clínicos |
| 2 | Web · REC | **Vinculaciones**: abrir la solicitud y **Aprobar** | La solicitud se resuelve |
| 3 | Android · PAC | Volver a **Mi historial** | Aparece el historial sin cerrar la app (evento `vinculacion.resuelta`) |
| 4 | Web · REC | Intentar aprobar otra vez la misma solicitud | La API responde 409 `vinculacion_resuelta` |

Punto para explicar: el paciente declara DUI y fecha de nacimiento, pero nunca elige el expediente; la base permite una sola vinculación pendiente por cuenta; la aprobación la decide un humano, no el cliente.

## Bloque 4 · Habitaciones y concurrencia (6 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Web · JOP | **Edificio**: mostrar el árbol. Planta 3 con VIP-301 a VIP-305 (1 cama) y planta 2 con HAB-201 a HAB-206 (2 camas) | 17 camas: 5 VIP y 12 semiprivadas |
| 2 | Web · REC | **Hospitalización**: crear una admisión y pedir sugerencias de cama | La API sugiere camas compatibles (sexo de la habitación, aislamiento) |
| 3 | Web · REC (navegador 1) y web · JOP (navegador 2) | Preparar dos admisiones y asignar **la misma cama** casi al mismo tiempo | Una asignación se confirma; la otra recibe 409 y debe elegir otra cama |
| 4 | Ambos navegadores | Mirar el **tablero de camas** | La cama ocupada se actualiza en las dos sesiones sin recargar |
| 5 | Web · REC | Registrar salida del paciente | La cama queda en limpieza |

Punto para explicar: la doble asignación la impide PostgreSQL con `EXCLUDE USING gist` (sección 6.3 del documento de arquitectura), no el cliente.

## Bloque 5 · Turnos del personal (3 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Web · JOP | **Turnos**: filtrar por área y rol | Se ven las asignaciones del día |
| 2 | Web · JOP | Asignar un turno nocturno 18:00–07:00 a una persona y luego intentar asignarla el día en que termina | La API responde `personal_en_descanso` con la hora de disponibilidad |
| 3 | Android · MED | **Mis turnos** | Ve su turno publicado |

## Bloque 6 · Ambulancia (5 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Android · PAC o web · REC | **Pedir ambulancia** con el motivo y la ubicación | La solicitud aparece en la web de JOP sin recargar |
| 2 | Web · JOP | **Ambulancia**: despachar la solicitud a la unidad | La unidad pasa a `En Servicio`; un segundo despacho a la misma unidad se rechaza (`servicio_activo_unico`) |
| 3 | Android · PAR | **Servicio**: registrar los hitos en orden (salida, en escena, trasladando, en hospital) y la ubicación | Cada hito llega a la web sin recargar; saltarse un hito se rechaza |
| 4 | Android · PAR | **Reporte prehospital** | El reporte queda guardado |
| 5 | Web · MED o Android · MED | **Llegada de ambulancia**: ver el reporte prehospital | El médico lo ve antes de que llegue el paciente |
| 6 | Web · JOP y DPD | **Bitácora de ambulancia** | El servicio aparece con sus hitos y actores |
| 7 | Web · JOP | Finalizar el servicio; poner la unidad en mantenimiento y sacarla | `Disponible` → `En Mantenimiento` → `Disponible` |

## Bloque 7 · Seguridad y privacidad (5 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Web · ADM | Abrir el menú | ADM ve Usuarios, Personal, Edificio y Turnos; no ve Mi consultorio ni Laboratorio |
| 2 | Web · ADM | Escribir a mano la ruta de un módulo clínico (por ejemplo `#/consultas`) | "Sin permiso" |
| 3 | Web · DPD | **Auditoría** | Ve quién, cuándo y qué tipo de dato, sin contenido clínico |
| 4 | Web · REC | Abrir la ficha de un paciente | Ve datos personales; no ve diagnósticos ni resultados |
| 5 | Web · MED | **Pacientes**: abrir un paciente sin relación de atención y **Solicitar acceso excepcional** con motivo | La solicitud queda pendiente; el contenido clínico sigue oculto |
| 6 | Web · DPD | **Accesos excepcionales**: aprobar la solicitud | MED ve el expediente; el acceso queda auditado |
| 7 | Web · DPD | **Auditoría**: buscar por paciente y fecha y ejecutar la **verificación de la cadena** | Ve el acceso excepcional (sin contenido clínico); la cadena de hash resulta íntegra |
| 8 | Android · PAC | **Quién vio mi expediente** | El paciente ve fecha, rol y motivo del acceso, sin el nombre del personal |
| 9 | Documento | Mostrar la matriz RBAC (Anexo B) y `permisos.csv` | Explicar que el código pregunta permisos, no roles (`sin-roles-en-codigo.spec.ts`) |

## Bloque 8 · Información pública y métricas (3 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Navegador privado, sin sesión | Abrir `https://sghu-web.onrender.com/publico` | Ocupación por planta, médicos de turno y avisos, sin nombres ni camas |
| 2 | Web · JOP | **Avisos**: publicar un aviso | El aviso aparece en la página pública sin recargar |
| 3 | Web · JOP | **Métricas**: abrir el tablero | Ocupación y laboratorio por estado; se actualiza al ocupar una cama |
| 4 | Web · JOP | **Inventario**: sacar un artículo hasta bajar de su mínimo | Aparece la alerta de mínimo (`inventario.bajo_minimo`) |

Punto para explicar: `/publico/*` no requiere sesión, no lleva datos personales y tiene límite de tasa.

## Bloque 9 · App iOS (3 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | iOS · MED | **Mi día**: ver la agenda y abrir una **Consulta** | Muestra la agenda y la consulta del día |
| 2 | iOS · PAC | **Mi turno** y **Mis exámenes** | El turno cambia sin recargar; los valores de un examen aparecen solo tras la revisión |
| 3 | iOS · PAC | **Pedir ambulancia** | La solicitud llega a la web de JOP |

Decir con claridad: la app iOS compila y pasa sus pruebas en CI, pero no se ha probado en un iPhone; no hay IPA.

## Bloque 10 · Calidad y cierre (3 minutos)

1. Mostrar los workflows de `.github/workflows/` (uno por plataforma) y una ejecución de pruebas de la API.
2. Mostrar MVVM en Android (`*Screen.kt` + `*ViewModel.kt` con `StateFlow` y corrutinas) y la estructura SwiftUI/MVVM de iOS.
3. Limitaciones, dichas por el equipo antes de que pregunten: despliegue manual en Render, iOS sin probar en dispositivo y sin IPA, sin notificaciones push, pantallas Android pendientes (Citas y Vinculaciones de recepción, Signos vitales, Limpieza), Figma desactualizado (sección 15 del documento de arquitectura).

## Plan B

| Si pasa esto | Hacer esto |
|---|---|
| La API tarda en responder | Es el arranque del plan gratuito; esperar un minuto y repetir |
| Una pantalla no se actualiza sola | Mostrar la banda de conexión; al reconectar, la web pide `GET /eventos?after=` una vez |
| Falla el teléfono | Mostrar el mismo flujo de PAC con la API en la documentación interactiva (`/api/v1/docs`) o con el emulador |
| No hay agenda para MED | Repetir el paso 4 de la preparación con JOP |
| `/publico` da 404 | Falta sincronizar `render.yaml` en Render; mostrar la pantalla pública desde `npm run dev` local |
| Falla el simulador iOS | Mostrar las pantallas de `ios/README.md` y el resultado de `ios.yml` en GitHub Actions |
