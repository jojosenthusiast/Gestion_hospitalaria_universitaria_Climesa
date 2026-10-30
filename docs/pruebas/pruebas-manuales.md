# Pruebas manuales por pantalla (web)

Requisito: FR-130-06 (lista de pruebas manuales por pantalla, derivada del inventario). Tarea: 130-T06.

**Estado de toda la lista: sin ejecutar.** Nadie ha recorrido estos casos todavía; cada fila de resultado queda vacía hasta que una persona del equipo de pruebas la complete. Esta lista no es evidencia de que algo funcione.

## Alcance

- Solo pantallas web **implementadas hoy** en `web/src/features/` (corte S1/S2). Los códigos W son los de [inventario-pantallas.md](../diseno/inventario-pantallas.md) y `docs/arquitectura/datos/pantallas.csv`.
- Las pantallas que el menú ya muestra como "Próxima entrega" (Laboratorio, Inventario, Fila del día, Citas, Accesos excepcionales) y las de Android e iOS no están aquí: no hay nada que probar todavía.
- Qué rol ve qué sale de `modules` en `web/src/features/shell.tsx` y de `docs/arquitectura/datos/permisos.csv`. La web solo atiende ADM, JOP, REC, LAB y DPD; AST, ENF, MED, PAR y PAC ven "Tu rol no usa esta aplicación".

## Cuentas de prueba

Una cuenta por rol: `adm@climesa`, `jop@climesa`, `rec@climesa`, `lab@climesa`, `dpd@climesa`. Las contraseñas **no** están en este repositorio: están en el archivo local `.env.demo-usuarios` (ignorado por git) o se piden al equipo. Todos los datos son ficticios.

## Dónde se prueba

| Entorno | Qué permite | Qué exige |
|---|---|---|
| Galería sin credenciales (`/work-preview.html` y `/design-preview.html` con `npm run dev --prefix web`) | Revisar el aspecto y los estados con datos ficticios en memoria | Nada de nube. No ejercita API, permisos reales ni tiempo real |
| Local (API + web + `.env`) | Casos funcionales completos | Base de datos con las migraciones y la semilla; ver [README raíz](../../README.md) |
| Nube (`https://sghu-web.onrender.com`) | Casos funcionales con cuentas demo | **Nube.** La API duerme tras 15 minutos: la primera llamada tarda cerca de un minuto. Depende de la configuración pendiente en [ges-15-supabase-remoto.md](../desarrollo/ges-15-supabase-remoto.md) (gancho de token y URL de Auth): sin ella, los roles pueden no ver sus módulos |
| Dos sesiones/navegadores | Casos de tiempo real y de concurrencia | Dos cuentas (o dos navegadores) a la vez |
| Dispositivo Android | Casos marcados "dispositivo" | Teléfono o emulador; ver [android/README.md](../../android/README.md) |

Convención de las tablas: **Req.** indica qué necesita el caso además de un navegador (nube, 2 sesiones, dispositivo, API). **Resultado** queda vacío hasta ejecutar.

## Matriz de menú esperado por rol

Con la API y los permisos reales, cada rol debe ver solo estos módulos (más Inicio y Perfil):

| Rol | Módulos esperados | Resultado |
|---|---|---|
| ADM | Inicio, Personal, Edificio, Turnos, Usuarios, Perfil | sin ejecutar |
| JOP | Inicio, Personal, Camas, Edificio, Ambulancia, Turnos, Perfil | sin ejecutar |
| REC | Inicio, Pacientes, Camas, Edificio, Ambulancia, Turnos, Perfil | sin ejecutar |
| LAB | Inicio, Perfil (Laboratorio e Inventario aparecen como "Próxima entrega" solo si el permiso existe) | sin ejecutar |
| DPD | Inicio, Usuarios, Auditoría, Perfil | sin ejecutar |

Un módulo que no está en la lista del rol no debe abrirse ni escribiendo `#/ruta` a mano: debe mostrar "Sin permiso".

## W01 Ingreso (todos los roles web)

| # | Pasos | Resultado esperado | Req. | Resultado |
|---|---|---|---|---|
| 1 | Abrir la web sin sesión. Escribir correo y contraseña correctos de `rec@climesa` | Entra al portal con el menú de REC | nube o local | sin ejecutar |
| 2 | Repetir con contraseña incorrecta | Mensaje "Correo o contraseña incorrectos, o la cuenta todavía no está activa." sin revelar cuál falló | nube o local | sin ejecutar |
| 3 | Con una cuenta de rol móvil (por ejemplo `pac@climesa`) | "Tu rol no usa esta aplicación" con botón para cerrar sesión | nube o local | sin ejecutar |
| 4 | Con sesión abierta, dejar 15 minutos sin tocar nada | La sesión se cierra y el ingreso avisa "Tu sesión se cerró por inactividad" | nube o local | sin ejecutar |
| 5 | Abrir la web sin variables de Supabase (`web/.env` ausente) | Pantalla "Configura tu conexión" | local | sin ejecutar |

## W02 Activar cuenta (personal invitado)

| # | Pasos | Resultado esperado | Req. | Resultado |
|---|---|---|---|---|
| 1 | Con una invitación enviada desde Usuarios, abrir el enlace del correo (`/aceptar-invitacion`) | Pide contraseña y confirmación para el correo invitado | nube (correo real) | sin ejecutar |
| 2 | Escribir una contraseña débil | Rechaza: mínimo 8 caracteres con mayúscula, minúscula, número y símbolo | nube o local | sin ejecutar |
| 3 | Escribir contraseña válida y confirmar | Cierra la sesión temporal y redirige al ingreso con aviso de invitación aceptada | nube (correo real) | sin ejecutar |

## W03 / W04 Tablero inicial (Inicio)

| # | Rol | Pasos | Resultado esperado | Req. | Resultado |
|---|---|---|---|---|---|
| 1 | ADM | Entrar y abrir Inicio | "Resumen del hospital" con camas libres/ocupadas, personas activas y cuentas activas (no pacientes ni turnos en borrador) y la fecha de "Actualizado" | nube o local | sin ejecutar |
| 2 | JOP | Igual | Camas libres/ocupadas, pacientes activos, personas activas y turnos en borrador (no cuentas) | nube o local | sin ejecutar |
| 3 | REC | Igual | Camas libres/ocupadas y pacientes activos (no personal ni cuentas) | nube o local | sin ejecutar |
| 4 | LAB, DPD | Igual | LAB: sin indicadores. DPD: solo cuentas activas. "Accesos directos" solo a módulos habilitados | nube o local | sin ejecutar |
| 5 | Cualquiera | Pulsar un acceso directo | Navega al módulo | nube o local | sin ejecutar |
| 6 | Cualquiera | Con la sesión abierta, desde otra sesión cambiar un dato que alimente un indicador (por ejemplo, bloquear una cama) | El indicador se actualiza sin recargar la página | 2 sesiones | sin ejecutar |

## W26 Pacientes (REC)

Regla probada: se busca **antes** de registrar.

| # | Pasos | Resultado esperado | Req. | Resultado |
|---|---|---|---|---|
| 1 | Entrar como `rec@climesa` y abrir Pacientes | Lista de expedientes recientes; el botón "Registrar paciente" está deshabilitado y el texto dice "Haz una búsqueda para habilitar el registro" | nube o local | sin ejecutar |
| 2 | Escribir un solo carácter y buscar | No busca; pide al menos dos caracteres | nube o local | sin ejecutar |
| 3 | Buscar un nombre que existe | Lista de coincidencias con el motivo de coincidencia; el botón "Registrar paciente" se habilita; aviso de revisar cada ficha | nube o local | sin ejecutar |
| 4 | Cambiar el filtro entre Activos, Inactivos y Todos | La lista cambia; sin resultados muestra "No hay coincidencias" y sugiere revisar inactivos | nube o local | sin ejecutar |
| 5 | Pulsar "Ver ficha" en un resultado | Ficha con datos, historial de cambios y botones de editar y de cambiar estado | nube o local | sin ejecutar |
| 6 | Buscar un nombre inexistente y pulsar "Registrar paciente" | Abre el formulario; completar datos ficticios y guardar | nube o local | sin ejecutar |
| 7 | Intentar registrar con un documento (DUI) ya usado | Rechaza con el mensaje del servidor que nombra el expediente existente; no crea duplicado | nube o local | sin ejecutar |
| 8 | Esperar a que venza la búsqueda y pulsar registrar | Aviso "La búsqueda venció"; exige buscar de nuevo | nube o local | sin ejecutar |
| 9 | Editar datos de una ficha | Pide motivo de al menos 10 caracteres; el cambio aparece en el historial de cambios | nube o local | sin ejecutar |
| 10 | Desactivar y reactivar un paciente | Pide motivo; la ficha se conserva y cambia de estado (nada se borra) | nube o local | sin ejecutar |
| 11 | Dos sesiones editan la misma ficha: una guarda, la otra guarda después con la versión vieja | La segunda recibe aviso de conflicto de versión y debe recargar ("Cerrar y recargar") | 2 sesiones | sin ejecutar |
| 12 | Entrar con `jop@climesa` y escribir `#/pacientes` | "Sin permiso" (el módulo es de REC) | nube o local | sin ejecutar |
| 13 | En la ficha, comprobar los campos visibles según privacidad | REC ve identidad y contacto; no ve contenido clínico | nube o local | sin ejecutar |

## W07 Personal (ADM, JOP)

| # | Rol | Pasos | Resultado esperado | Req. | Resultado |
|---|---|---|---|---|---|
| 1 | JOP | Abrir Personal | Directorio con búsqueda por nombre o especialidad y filtro Activo/Inactivo/Todo; sin botón de crear | nube o local | sin ejecutar |
| 2 | ADM | Abrir Personal | Igual, con botón de crear persona | nube o local | sin ejecutar |
| 3 | ADM | Crear persona (tipo, especialidad, área opcional) y guardar | Aparece en el directorio | nube o local | sin ejecutar |
| 4 | ADM | Editar una persona y desactivarla | Pasa al filtro de inactivos; el cambio conserva versión | nube o local | sin ejecutar |
| 5 | ADM | Buscar con un texto sin resultados | "No hay personas en esta vista" | nube o local | sin ejecutar |
| 6 | 2 sesiones | Una sesión edita; la otra ya tenía la lista abierta | La otra lista se actualiza sin recargar | 2 sesiones | sin ejecutar |

## W16 / W17 Turnos (ADM, JOP, REC ven; JOP planifica)

| # | Rol | Pasos | Resultado esperado | Req. | Resultado |
|---|---|---|---|---|---|
| 1 | REC y ADM | Abrir Turnos | Lista de turnos con filtros por persona y estado; sin botón de planificar | nube o local | sin ejecutar |
| 2 | JOP | Abrir Turnos | Igual, con botón de crear turno | nube o local | sin ejecutar |
| 3 | JOP | Crear un turno diurno para una persona activa en un área | Aparece en estado borrador | nube o local | sin ejecutar |
| 4 | JOP | Crear otro turno de la misma persona que se traslape | Rechazado; el mensaje explica el conflicto (la base lo garantiza) | nube o local | sin ejecutar |
| 5 | JOP | Crear un turno que viole el descanso mínimo de la política vigente | Rechazado con el motivo de descanso | nube o local | sin ejecutar |
| 6 | JOP | Editar y cancelar un turno | Cambia de estado; el filtro "Cancelados" lo muestra | nube o local | sin ejecutar |
| 7 | 2 sesiones | Dos jefes intentan crear a la vez turnos que se traslapan para la misma persona | Uno se confirma y el otro recibe conflicto | 2 sesiones | sin ejecutar |

## W09 Edificio (ADM, JOP, REC ven; ADM configura)

| # | Rol | Pasos | Resultado esperado | Req. | Resultado |
|---|---|---|---|---|---|
| 1 | JOP o REC | Abrir Edificio, vista "Árbol del edificio" | Árbol Hospital, plantas, áreas, habitaciones, camas; sin botón de crear | nube o local | sin ejecutar |
| 2 | JOP o REC | Cambiar a "Por planta" y elegir Planta 2 y Planta 3 | Habitaciones de cada planta (semiprivadas con dos camas; VIP con una) | nube o local | sin ejecutar |
| 3 | ADM | Crear un espacio con padre y tipo | Aparece en el árbol | nube o local | sin ejecutar |
| 4 | ADM | Crear una cama de más en una habitación llena | Rechazado: la habitación no puede superar su capacidad | nube o local | sin ejecutar |
| 5 | ADM | Editar un espacio (nombre, activo) | Cambio visible; conserva versión | nube o local | sin ejecutar |

## W12 Camas: bloquear, limpiar y verificar (JOP, REC)

La web solo muestra el tablero y estas acciones. Asignar cama y trasladar (W13 a W15) **no existen** todavía.

| # | Rol | Pasos | Resultado esperado | Req. | Resultado |
|---|---|---|---|---|---|
| 1 | REC | Abrir Camas, Planta 2 y Planta 3 | Estado de cada cama (libre, ocupada, reservada, limpieza, bloqueada) y contadores; sin botones de bloquear | nube o local | sin ejecutar |
| 2 | JOP o REC | Filtrar por cada estado | La lista cambia; sin resultados muestra "No hay camas con este estado" | nube o local | sin ejecutar |
| 3 | JOP | Bloquear una cama libre indicando motivo (mínimo 5 caracteres) | Pasa a bloqueada y aparece "Retirar bloqueo" | nube o local | sin ejecutar |
| 4 | JOP | Retirar el bloqueo con motivo (mínimo 10 caracteres) | Vuelve a libre; el historial no se borra | nube o local | sin ejecutar |
| 5 | 2 sesiones | JOP bloquea una cama y REC la tiene abierta | La cama de REC cambia a bloqueada sin recargar | 2 sesiones | sin ejecutar |
| 6 | 2 sesiones | Dos sesiones intentan bloquear la misma cama con la misma versión | Una tiene éxito y la otra recibe conflicto de versión | 2 sesiones | sin ejecutar |
| 7 | ENF (no es rol web) | Solicitar limpieza y completarla: `POST /camas/{id}/limpieza` y `/limpieza/completar` con un token de ENF (`enf@climesa`) | La cama pasa a "En limpieza" con limpieza completada | API; Android solo lista camas, no ofrece esta acción; no hay interfaz web para ENF | sin ejecutar |
| 8 | JOP | Con una limpieza completada, pulsar "Verificar limpieza" | La cama pasa a libre | nube o local; depende del paso 7 | sin ejecutar |
| 9 | ENF y JOP | Intentar verificar la limpieza con la misma cuenta que la completó | Rechazado: debe verificar otra persona | API; depende del paso 7 | sin ejecutar |
| 10 | REC | Ver una cama ocupada | Muestra el ocupante según su permiso; a quien no tiene permiso, "Identidad restringida" | nube o local con una cama ocupada | sin ejecutar |

Nota: con los permisos actuales, solicitar y completar limpieza (`camas.registrar_limpieza`) solo los tiene ENF, que no usa la web. Por eso el ciclo completo no se puede recorrer solo desde la interfaz web.

## W18 Ambulancia (JOP, REC) — versión mínima de solo lectura

| # | Rol | Pasos | Resultado esperado | Req. | Resultado |
|---|---|---|---|---|---|
| 1 | JOP o REC | Abrir Ambulancia | Placa de la unidad única, su estado (Disponible, En servicio, En mantenimiento) y si hay paramédico de turno | nube o local | sin ejecutar |
| 2 | JOP o REC | Sin servicio activo | Texto "Sin servicio activo" | nube o local | sin ejecutar |
| 3 | JOP o REC | Con un servicio activo | Tipo, prioridad, origen, destino, hora de despacho y tripulación; sin datos del paciente | nube o local con un servicio creado en la base | sin ejecutar |
| 4 | 2 sesiones | Cambiar el estado de la unidad o el servicio en la base | La pantalla se actualiza sola sin recargar | 2 sesiones y acceso a la base | sin ejecutar |
| 5 | ADM, LAB, DPD | Escribir `#/ambulancia` | "Sin permiso" | nube o local | sin ejecutar |

Despachar, bitácora (W19) y el centro de despacho completo no existen todavía en la web.

## W05 / W06 Usuarios (ADM, DPD)

| # | Rol | Pasos | Resultado esperado | Req. | Resultado |
|---|---|---|---|---|---|
| 1 | DPD | Abrir Usuarios | Lista de cuentas con búsqueda por nombre, correo o rol; sin acciones de invitar, roles ni desactivar | nube o local | sin ejecutar |
| 2 | ADM | Abrir Usuarios | Lista con "Invitar persona", "Roles" y activar/desactivar | nube o local | sin ejecutar |
| 3 | ADM | Invitar a una persona (correo, nombre, rol y vínculo opcional con personal) | Cuenta en estado invitado; confirmación de envío | nube (correo real) | sin ejecutar |
| 4 | ADM | Cambiar roles de otra cuenta | Cambio visible; el afectado ve su menú cambiar sin recargar (refresca su perfil) | 2 sesiones | sin ejecutar |
| 5 | ADM | Intentar quitarse un rol a sí mismo | Rechazado: nadie se asigna ni se quita roles | nube o local | sin ejecutar |
| 6 | ADM | Intentar desactivar al último administrador activo | Rechazado | nube o local | sin ejecutar |
| 7 | ADM | Desactivar y reactivar una cuenta de otro rol | Cambia de estado; esa persona pierde acceso en su siguiente solicitud | 2 sesiones | sin ejecutar |
| 8 | ADM | Buscar con texto sin coincidencias | "No hay cuentas que coincidan" | nube o local | sin ejecutar |

## W32 Auditoría (DPD)

| # | Pasos | Resultado esperado | Req. | Resultado |
|---|---|---|---|---|
| 1 | Realizar una acción (por ejemplo bloquear una cama con JOP) y entrar como `dpd@climesa` a Auditoría | La operación aparece con fecha, persona y rol, operación, entidad y resultado | 2 sesiones | sin ejecutar |
| 2 | Revisar las filas | Muestra las últimas 100 operaciones y ningún valor clínico, contraseña ni token | nube o local | sin ejecutar |
| 3 | Con `adm@climesa` escribir `#/auditoria` | "Sin permiso" | nube o local | sin ejecutar |
| 4 | Intentar una acción denegada (por ejemplo `rec@climesa` bloquear una cama por API) | Queda registrada como denegada | API | sin ejecutar |

## W35 Perfil (todos los roles web)

| # | Pasos | Resultado esperado | Req. | Resultado |
|---|---|---|---|---|
| 1 | Abrir "Ver mi cuenta" desde el menú de cuenta | Muestra correo, estado, plataformas habilitadas y roles asignados | nube o local | sin ejecutar |
| 2 | Pulsar "Cerrar sesión" | Vuelve al ingreso; al retroceder en el navegador no se ven datos | nube o local | sin ejecutar |

## Tiempo real: sin red y volver

La web no consulta cada cierto tiempo (regla 9). Estos casos verifican la reconexión.

| # | Pasos | Resultado esperado | Req. | Resultado |
|---|---|---|---|---|
| 1 | Iniciar sesión y dejar el portal abierto | Sin banda de conexión (en vivo) | nube o local | sin ejecutar |
| 2 | Con la sesión abierta, desactivar la red del equipo (modo avión o DevTools, "Offline") | Aparece la banda "Sin conexión. No se pueden guardar cambios." | nube o local | sin ejecutar |
| 3 | Con la red apagada, intentar guardar un cambio | No se guarda; se informa el error de conexión, sin perder lo escrito | nube o local | sin ejecutar |
| 4 | Con la red apagada, desde otra sesión cambiar un dato visible (por ejemplo bloquear una cama) | La sesión sin red no cambia | 2 sesiones | sin ejecutar |
| 5 | Volver a encender la red | Banda "Recuperando la conexión…" y luego desaparece; la pantalla muestra el cambio hecho mientras no había red, sin recargar | 2 sesiones | sin ejecutar |
| 6 | En DevTools, pestaña Red, observar tráfico con la sesión estable durante 2 minutos | Ninguna solicitud periódica a `/eventos` ni a otros datos; solo aparecen tras una reconexión | local | sin ejecutar |
| 7 | Cambiar los roles de una cuenta mientras esa persona tiene la web abierta | Su menú y permisos se actualizan sin recargar | 2 sesiones | sin ejecutar |
| 8 | Cerrar la pestaña y reabrirla tras un cambio | Muestra el dato actual al cargar | nube o local | sin ejecutar |

## Pruebas de privacidad transversales

| # | Pasos | Resultado esperado | Req. | Resultado |
|---|---|---|---|---|
| 1 | Con ADM y JOP, revisar que ninguna pantalla muestre contenido clínico | No aparece diagnóstico, receta ni resultado | nube o local | sin ejecutar |
| 2 | Abrir una ficha de paciente y revisar Auditoría con DPD | La lectura de la ficha quedó auditada | 2 sesiones | sin ejecutar |
| 3 | Revisar las respuestas de red de cualquier pantalla (DevTools) | No contienen contraseñas, `service_role` ni tokens de otras personas | local | sin ejecutar |

## Cómo reportar un hallazgo

Anotar: caso (por ejemplo `W12-6`), rol, entorno (local o nube), pasos exactos, resultado obtenido frente al esperado y captura. Si falta información para decidir si un resultado es correcto, no lo inventes: agrégalo a [preguntas-abiertas.md](../preguntas-abiertas.md).
