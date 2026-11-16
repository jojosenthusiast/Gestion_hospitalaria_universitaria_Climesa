# Guion de la defensa · CLIMESA

Demostración en vivo del 21 de noviembre de 2026. Usa solo datos ficticios y las cuentas de demostración de cada rol (las credenciales se entregan por un canal privado del equipo; no están en el repositorio). El guion cubre lo que existe en `main` (`c7f31a6`, hasta el PR #122): flujo clínico, cierre de hospitalización, camas, turnos con asistencia y carga, ambulancia de punta a punta, vinculación de cuentas, auditoría, página pública, métricas y la app iOS. Lo que sigue pendiente se dice al final.

Regla de plataformas (`docs/arquitectura/datos/roles.csv`): ADM, JOP, LAB y DPD trabajan en la web; MED trabaja en Android o iOS (la web le muestra "Tu rol no usa esta aplicación"); AST, ENF y PAR, en Android; REC, en web y Android; PAC, en Android e iOS.

## Preparación (el día anterior y 30 minutos antes)

| Paso | Qué hacer | Comprobación |
|---|---|---|
| 1 | Desplegar `main` en Render (`sghu-api` y `sghu-web`, Manual Deploy) con `WEB_APP_URL` definida (`docs/operacion/runbook-operador.md`, sección 2) | `GET https://sghu-api.onrender.com/salud` responde 200 con `"database":"ok"` y `https://sghu-web.onrender.com/publico` abre |
| 2 | Confirmar que las migraciones hasta `20261121003200` están aplicadas en Supabase (runbook, sección 3) | La comprobación previa de cada archivo ya no encuentra nada que aplicar; `GET /api/v1/publico/ocupacion` responde 200 |
| 3 | Confirmar que producción no conserva la planta 4 de una semilla anterior (BL-01) | La pantalla `/publico` muestra solo las plantas 2 y 3 en hospitalización |
| 4 | Despertar la API 5 minutos antes (plan gratuito) | Abrir https://sghu-web.onrender.com e ingresar con cualquier cuenta; el aviso "El servidor se está activando" desaparece |
| 5 | Con JOP, asignar hoy un turno al médico de prueba en su consultorio y turnos de paramédico, motorista y enfermería de Emergencia | En **Turnos** aparecen `En curso` o `Publicado` (por iniciar) |
| 6 | Preparar un paciente ficticio con cuenta PAC vinculada y una cita solicitada | En **Citas** (REC) aparece `Solicitada` |
| 7 | Instalar el APK en el teléfono, apuntando a la API de producción (`ENTREGA_2026-11-21.md`, sección 7) | La app abre y el ingreso con PAC muestra **Mis citas** |
| 8 | Abrir dos navegadores (o una ventana normal y una privada) para la demostración de concurrencia | Ambas sesiones en la web de producción |
| 9 | Apagar el inicio de sesión de prueba y rotar las contraseñas demo (runbook, sección 4) | El ingreso pide correo y contraseña |
| 10 | Preparar una segunda cuenta PAC sin expediente vinculado y un paciente ficticio del que se conozca el DUI | Aparece en **Pacientes** (REC) |
| 11 | Tener un simulador o iPhone con la app iOS y cuentas MED y PAC | La app abre y el ingreso con MED muestra **Mi día** |
| 12 | Dejar un paciente hospitalizado cuyo médico tratante sea la cuenta MED de prueba | Aparece en **Mis hospitalizados** (MED) |

Pantallas en el proyector: web (izquierda) y teléfono Android duplicado con `scrcpy` u otra herramienta (derecha); el simulador iOS se muestra en el bloque 9.

## Bloque 1 · Arquitectura (3 minutos)

1. Mostrar el diagrama de la sección 3 de `docs/entrega/documento-arquitectura.pdf`: tres clientes, una API NestJS, Supabase (Postgres, Auth, Realtime).
2. Explicar en una frase cada regla: la API es la única que escribe; permisos por nombre; invariantes en la base; tiempo real sin recarga; los botones salen de lo que el servidor permite (`allowedActions`).

## Bloque 2 · Flujo PAC → REC → MED → LAB → PAC (12 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Android · PAC | **Mis citas → Solicitar cita**: elegir médico, fecha y una franja libre de 20 minutos | La solicitud queda `Solicitada` |
| 2 | Web · REC | **Citas**: la solicitud aparece sin recargar; **Confirmar** | La cita pasa a `Confirmada` |
| 3 | Android · PAC | Volver a **Mis citas** | La cita aparece `Confirmada` sin cerrar la app; muestra hasta qué hora se puede cancelar o reprogramar |
| 4 | Web · REC | **Fila del día**: emitir número para el paciente | El número aparece en la fila |
| 5 | Android · AST (o MED) | **Llamar siguiente** | El estado pasa a `Llamado`; PAC lo ve en **Mi turno** |
| 6 | Android · MED | **Mi día**: iniciar la consulta desde el número llamado | Consulta abierta vinculada a la cita |
| 7 | Android · MED | **Registrar signos**, **Registrar diagnóstico** (CIE-10, principal) y **Emitir receta** | Cada registro se guarda; el diagnóstico principal es único |
| 8 | Android · MED | **Ordenar exámenes** desde la consulta abierta | La orden aparece `Pendiente` en Laboratorio |
| 9 | Android · MED | **Firmar** la consulta | La cita pasa a `Atendida`; la consulta ya no se edita |
| 10 | Web · LAB | **Laboratorio → Tomar muestra** con doble identificación (expediente + nombre completo) | La orden pasa a `En Proceso`. Si el nombre no coincide, la API lo rechaza |
| 11 | Web · LAB | Capturar resultados con un valor crítico y **Completar** | La orden pasa a `Completado`; la marca (normal, alto, crítico) la calcula la API |
| 12 | Android · MED | Aparece el aviso "Llegó un resultado con valor crítico" | El aviso llega solo a LAB, al médico que pidió y al tratante; nunca al paciente |
| 13 | Android · PAC | **Mis exámenes** | Ve el estado `Completado`, **sin valores** |
| 14 | Android · MED | **Resultados por revisar → Revisar** | Queda revisado |
| 15 | Android · PAC | **Mis exámenes** | Ahora ve los valores |
| 16 | Web · LAB | **Corregir resultado** con un motivo de 10 caracteres o más | Se guarda el valor anterior y la orden vuelve a revisión médica |

Punto para explicar: los pasos 13 a 16 demuestran la política de privacidad (D-040): el paciente ve el estado siempre y los valores solo tras la revisión médica, también después de una corrección. Si el médico no revisa en 2 horas, puede hacerlo un médico de turno en el área de origen (revisión suplente, auditada).

## Bloque 3 · Vinculación de cuenta con expediente (3 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Android · PAC (segunda cuenta) | **Vincular expediente**: ingresar el DUI y la fecha de nacimiento del paciente ficticio | La solicitud queda pendiente; la cuenta aún no ve datos clínicos |
| 2 | Web · REC | **Vinculaciones**: abrir la solicitud y aprobarla | La solicitud se resuelve |
| 3 | Android · PAC | Volver a **Mi historial** | Aparece el historial sin cerrar la app (evento `vinculacion.resuelta`) |
| 4 | Web · REC | Intentar aprobar otra vez la misma solicitud | La API responde 409 `vinculacion_resuelta` |

Punto para explicar: el paciente declara DUI y fecha de nacimiento, pero nunca elige el expediente; la base permite una sola vinculación pendiente por cuenta; la aprobación la decide un humano, no el cliente.

## Bloque 4 · Habitaciones, concurrencia y cierre del ciclo (7 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Web · JOP | **Edificio**: mostrar el árbol. Planta 3 con VIP-301 a VIP-305 (1 cama) y planta 2 con HAB-201 a HAB-206 (2 camas) | 17 camas de hospitalización: 5 VIP y 12 semiprivadas |
| 2 | Web · REC | **Hospitalización → Ingresar paciente** y pedir sugerencias de cama | La API sugiere camas compatibles (sexo de la habitación, aislamiento) |
| 3 | Web · REC (navegador 1) y web · JOP (navegador 2) | Preparar dos admisiones y asignar **la misma cama** casi al mismo tiempo | Una asignación se confirma; la otra recibe 409 y debe elegir otra cama |
| 4 | Ambos navegadores | Mirar **Camas** | La cama ocupada se actualiza en las dos sesiones sin recargar |
| 5 | Web · JOP | En la admisión que quedó sin cama, **Cancelar admisión** con motivo | La admisión pasa a `cancelada`; el paciente puede volver a ingresar |
| 6 | Web · REC | En la admisión hospitalizada, **Solicitar alta al médico tratante** | Al médico le llega el aviso en vivo |
| 7 | Android o iOS · MED | **Mis hospitalizados → Firmar alta** | El alta queda firmada; la web muestra **Registrar salida** |
| 8 | Web · REC | **Registrar salida** | La cama pasa a limpieza; JOP o ENF registran y verifican la limpieza (otra persona) |

Punto para explicar: la doble asignación la impide PostgreSQL con `EXCLUDE USING gist` (sección 6.3 del documento de arquitectura), no el cliente. Solo MED firma el alta (D-02); JOP puede reasignar el tratante, revocar un alta sin salida o anular un ingreso por error, siempre con motivo.

## Bloque 5 · Turnos, asistencia y carga (4 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Web · JOP | **Turnos**, vista **Semana**: filtrar por área y rol | Se ven los turnos de la semana por día y hora, con el color de su estado; los huecos de cobertura aparecen rayados |
| 2 | Web · JOP | Asignar un turno nocturno 18:00–07:00 a una persona y luego intentar asignarla el día en que termina | La API rechaza el turno por descanso insuficiente e indica desde cuándo está disponible |
| 3 | Web · JOP | Asignar un turno que deje a la persona sobre 72 horas en 7 días | El formulario muestra la carga; la API lo rechaza salvo con "Motivo de la emergencia", que queda auditado |
| 4 | Android · MED | **Mis turnos** | Los turnos aparecen por día (Hoy, Mañana…); el turno en curso ya tiene la entrada confirmada sola |
| 5 | Web · JOP | **Asistencia** de otro turno: marcar ausencia injustificada | La persona deja de contar como de turno; aparecen "Suplentes disponibles" con **Asignar turno** |
| 6 | Web · JOP | **Personal → Turno de hoy: Ausentes** | Si la ausencia del paso 5 es de hoy, aparece esa persona; el filtro queda en la dirección y el enlace se puede compartir |

## Bloque 6 · Ambulancia (6 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Android · PAC o web · REC | **Pedir ambulancia** (PAC) o **Registrar llamada** (REC) con el motivo y la ubicación | La solicitud aparece en la web de JOP sin recargar |
| 2 | Web · JOP (o Android · REC, **Despacho**) | **Confirmar y despachar**: la tripulación de turno viene propuesta; elegir paramédico y motorista | La unidad pasa a `En Servicio`. Sin paramédico con cuenta o sin motorista de turno, el despacho se rechaza |
| 3 | Android · PAR | **Servicio**: "Salí hacia el lugar", "Llegué al lugar", "Salgo con el paciente", "Llegué al hospital", y la ubicación | Cada hito llega a la web sin recargar; saltarse un hito se rechaza |
| 4 | Android · PAR | **Reporte prehospital → Enviar reporte prehospital** | El reporte queda guardado; sin señal queda en cola y se envía una sola vez |
| 5 | Android · ENF o MED con turno en Emergencia | **Recepción / Llegada de ambulancia**: ver el reporte y **Marcar recibido** | Queda "Recibido por …" con hora; la entrega es única |
| 6 | Android · PAR | **Finalizar servicio** | El servicio termina `Completado`; la unidad vuelve a `Disponible` |
| 7 | Web · JOP y DPD | **Bitácora de ambulancia**, filtro "Estado final" | El servicio aparece con sus hitos, actores y estado final |
| 8 | Web · JOP | Despachar otro servicio y usar **Cierre administrativo** con motivo | El servicio termina `Cancelado`; la única unidad nunca queda bloqueada |
| 9 | Web · JOP | Poner la unidad en mantenimiento y sacarla | `Disponible` → `En Mantenimiento` → `Disponible` |

Punto para explicar: PAR también puede **Terminar sin llegar al hospital** con un estado final válido para los hitos registrados (sin traslado, rechaza traslado, fallecido, desviado a otro centro); la base rechaza un estado final que no corresponde.

## Bloque 7 · Seguridad y privacidad (5 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Web · ADM | Abrir el menú | ADM ve Personal, Edificio, Turnos, Catálogo de laboratorio, Inventario y Métricas; no ve Pacientes, Hospitalización ni Laboratorio |
| 2 | Web · ADM | Escribir a mano la ruta de un módulo clínico (por ejemplo `#/hospitalizacion`) | La web regresa a Inicio |
| 3 | Web · MED | Ingresar con la cuenta MED en la web | "Tu rol no usa esta aplicación": MED trabaja en Android o iOS |
| 4 | Web · REC | Abrir la ficha de un paciente | Ve datos personales; no ve diagnósticos ni resultados |
| 5 | Android · MED | **Expediente**: abrir un paciente sin relación de atención | La API responde 403; el contenido clínico sigue oculto |
| 6 | Web · DPD | **Auditoría**: buscar por expediente y fecha y **Verificar integridad** | Ve el intento denegado (sin contenido clínico); la cadena de hash resulta íntegra |
| 7 | Android · PAC | **Quién vio mi expediente** | El paciente ve fecha, rol y motivo del acceso, sin el nombre del personal |
| 8 | Documento | Mostrar la matriz RBAC (Anexo B) y `permisos.csv` | Explicar que el código pregunta permisos, no roles (`sin-roles-en-codigo.spec.ts`) |
| 9 | Web · LAB | **Pacientes**: abrir un enlace con `?situacion=hospitalizado` | La web quita el filtro: LAB no tiene `admision.ver` con alcance global y la API respondería 403 |

## Bloque 8 · Información pública y métricas (3 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Navegador privado, sin sesión | Abrir `https://sghu-web.onrender.com/publico` | Ocupación por planta, médicos de turno y avisos, sin nombres ni camas |
| 2 | Web · JOP | **Avisos**: publicar, **Editar** y **Retirar** un aviso | El aviso aparece, cambia y desaparece de la página pública sin recargar |
| 3 | Web · JOP | **Métricas**: abrir el tablero y **Exportar** | Ocupación, laboratorio y ambulancia por periodo; la exportación queda auditada |
| 4 | Web · JOP | **Inventario**: registrar una salida hasta bajar de su mínimo | Aparece la alerta de mínimo (`inventario.bajo_minimo`) |

Punto para explicar: `/publico/*` no requiere sesión, no lleva datos personales y tiene límite de tasa.

## Bloque 9 · App iOS (3 minutos)

| # | Plataforma y rol | Acción | Resultado esperado |
|---|---|---|---|
| 1 | iOS · MED | **Mi día**: ver la agenda y abrir una consulta | Muestra la agenda y la consulta del día |
| 2 | iOS · PAC | **Fila** y **Exámenes** | El turno cambia sin recargar; los valores de un examen aparecen solo tras la revisión |
| 3 | iOS · PAC | **Más → Pedir ambulancia** y **Cancelar solicitud** | La solicitud llega a la web de JOP y desaparece al cancelarla |

Decir con claridad: la app iOS compila y pasa sus pruebas en CI, pero no se ha probado en un iPhone; no hay IPA.

## Bloque 10 · Calidad y cierre (3 minutos)

1. Mostrar los workflows de `.github/workflows/` (uno por componente) y una ejecución de pruebas de la API.
2. Mostrar MVVM en Android (`*Screen.kt` + `*ViewModel.kt` con `StateFlow` y corrutinas) y la estructura SwiftUI/MVVM de iOS.
3. Limitaciones, dichas por el equipo antes de que pregunten: despliegue y migraciones manuales en Render y Supabase, iOS sin probar en dispositivo y sin IPA, sin notificaciones push, sin addendum de consultas firmadas, Figma no sincronizado (sección 15 del documento de arquitectura).

## Plan B

| Si pasa esto | Hacer esto |
|---|---|
| La API tarda en responder | Es el arranque del plan gratuito; los clientes muestran "El servidor se está activando" y reintentan; esperar un minuto |
| Una pantalla no se actualiza sola | Mostrar la banda de conexión; al reconectar, el cliente pide `GET /eventos?after=` una vez |
| Falla el teléfono | Mostrar el mismo flujo con el emulador o con la documentación interactiva (`/api/v1/docs`) |
| No hay agenda para MED | Repetir el paso 5 de la preparación con JOP |
| El despacho se rechaza por tripulación | Falta turno de paramédico o motorista: JOP lo planifica en **Turnos** ("Planificar turno de …") |
| `/publico` da 404 | Falta la reescritura en Render; mostrar la pantalla pública desde `npm run dev` local |
| Falla el simulador iOS | Mostrar el resultado de `ios.yml` en GitHub Actions |
