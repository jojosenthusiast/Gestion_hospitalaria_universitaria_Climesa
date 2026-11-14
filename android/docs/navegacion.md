# Navegación de Android

Una sola regla: **la barra inferior lleva lo que el rol hace todo el día; "Más" lleva el resto, agrupado**. No hay menú hamburguesa que repita la barra, y cada pantalla se alcanza por un solo camino.

## Estructura

- **Barra inferior (teléfono)**: `Inicio` + hasta 3 tareas núcleo del rol + `Más`. Máximo 5 destinos.
- **Encabezado**: título de la pantalla y, cuando ayuda, el contexto (nombre del paciente, unidad). Nunca "Rol / CLIMESA". Las pantallas de detalle muestran la flecha de volver y la barra inferior se oculta.
- **Más** (hoja inferior): grupos `Más tareas`, `Hospital` (información del hospital, quién vio mi expediente), `Mi cuenta` (perfil), `Ajustes` (modo oscuro, cerrar sesión).
- **Tablet (600 dp o más)**: riel con todas las secciones; **pantalla ancha (840 dp o más)**: menú lateral permanente. Ambos incluyen "Cerrar sesión".
- Lo que se ve sale de los permisos de `/auth/me` (regla 8). El catálogo por rol solo evita mostrar destinos que no existen para ese rol.

## Mapa por rol

| Rol | Barra (después de Inicio) | Más tareas | Hospital / Cuenta |
|---|---|---|---|
| Recepción | Fila, Pacientes, Citas | Vinculaciones, Admisión, Camas, Despacho, Mis turnos | Hospital; Perfil |
| Asistente y Enfermería (estación de cuidado, un solo catálogo) | Signos, Consultorio, Planta (Asistente sin `admision.ver` ve Insumos o Turnos en su lugar) | Limpieza, Insumos, Llegada de ambulancia, Mis turnos | Hospital; Perfil |
| Médico | Mi día, Resultados, Internados | Expediente, Llegada de ambulancia, Mis turnos | Hospital; Perfil |
| Paramédico | Servicio, Unidad, Reporte | Paciente sin identidad, Mi bitácora, Mis turnos | Hospital; Perfil |
| Paciente | Mi turno, Mis citas, Exámenes | Vincular expediente, Mi historial, Pedir ambulancia | Hospital, Quién vio mi expediente; Perfil |

Sin Android (D-090): **Jefe de Operaciones** y **Laboratorio**. Si entran, ven "Tu rol no usa esta aplicación".

## Decisiones de diseño

- Asistente y Enfermería son el mismo rol del curso: comparten catálogo y se filtran por permiso. "Paciente hospitalizado" desaparece como entrada aparte porque abría la misma pantalla que "Mi planta"; "Limpieza" abre el tablero de camas con las acciones de limpieza.
- Medicina tenía "Mi día" y "Consulta" apuntando a la misma pantalla; queda una sola entrada.
- El Perfil ya no repite accesos directos: muestra la cuenta, "Mis datos" (paciente), apariencia y cerrar sesión. No hay botón "Actualizar acceso": los cambios de rol y permisos llegan por tiempo real.
- Los textos de eyebrow con formato "A / B" ya no se pintan; el encabezado dice dónde estás.

## Pruebas

`AndroidNavigationPolicyTest` comprueba que cada sección visible esté exactamente una vez en la barra o en "Más", que la barra no pase de 5 destinos y el agrupado. `AndroidSectionsTest` fija el catálogo de cada rol. `StringsEncodingTest` busca mojibake en `res/values*/strings*.xml` y en el código Kotlin.
