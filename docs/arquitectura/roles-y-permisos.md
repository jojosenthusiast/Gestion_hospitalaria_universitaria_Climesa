# Roles y matriz de control de acceso (RBAC)

> Archivo generado por `tools/generar_docs.py` desde `docs/arquitectura/datos/`. No editar a mano.

Requisitos: REQ-PRV-04 (matriz por rol de endpoints y vistas), REQ-ROL-01 a 06. Decisiones: D-031, D-050 a D-053.

## Roles

| Código | Rol | Plataformas | Origen | Qué hace |
|---|---|---|---|---|
| ADM | Administrador | Web | CUR REQ-ROL-01 | Configura y asegura el sistema: usuarios y roles, edificio, catálogos, políticas. No opera pacientes ni ve contenido clínico (D-050). |
| JOP | Jefe de Operaciones | Web | CUR (panel web); D-050 | Opera el día: tablero de camas, autorizaciones de admisión y traslado, turnos, mantenimiento de ambulancia, inventario, avisos, métricas. |
| REC | Recepcionista | Android; Web | CUR REQ-ROL-03; base pedida | Registro y verificación de pacientes, fila del día, citas, admisión, asignación de cama, despacho de ambulancia. |
| AST | Asistente | Android | CUR REQ-ROL-03; base pedida; retirado en Lote 5 | Retirado (Lote 5): sus cuentas y funciones pasaron a Enfermería. |
| ENF | Enfermero/a | Android | CUR (Android); base pedida; absorbe AST en Lote 5 | Cuidado del hospitalizado y estación del asistente: signos, notas de enfermería, limpieza de cama, consumo de insumos, fila del consultorio. |
| MED | Médico | iOS; Android | CUR REQ-ROL-02 | Consulta general, diagnósticos, recetas, órdenes y revisión de laboratorio, indicación de hospitalización, alta. Especialidad (alergista, emergenciólogo) es atributo. |
| LAB | Laboratorista | Web | D-043; R07 | Procesa órdenes de laboratorio: muestra, resultados con rangos, completar; reactivos de inventario. |
| PAR | Paramédico | Android | D-042; R04 | Tripulación de la única ambulancia: estados del servicio, reporte prehospital, ubicación en vivo. Solo móvil. |
| DPD | Delegado de protección de datos | Web | D-031; LPDP Art. 15-17 | Revisa la auditoría y verifica su integridad. |
| PAC | Paciente | Android; iOS; Web | CUR REQ-ROL-04; D-032 a D-034 | Ve su fila, citas, estado de laboratorio, resultados revisados e historial; pide citas y ambulancia. |

## Cómo leer las matrices

| Marca | Significado |
|---|---|
| ✔ | Permitido sin condición adicional |
| relación | Solo con relación de atención activa con el paciente (consulta, admisión, servicio de ambulancia) (D-031) |
| propio | Solo sobre sí mismo (el paciente sobre su expediente, el médico sobre sus citas, el paramédico sobre sus servicios) |
| propio revisado | El paciente ve sus resultados y su historial solo después de la revisión médica (D-040) |
| área | Solo pacientes del área o planta donde la persona tiene turno en curso |
| autor | Solo quien creó el registro |
| · | Denegado (y auditado si se intenta) |

El permiso `camas.ver_ocupante` no tiene endpoint propio: decide si el tablero de camas muestra el nombre del ocupante o solo sus iniciales.

## Matriz de permisos por rol

| Permiso | Descripción | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `sesion.perfil` | Ver su propio perfil y permisos | ✔ | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `cuenta.vincular` | Pedir la vinculación de su cuenta con su expediente | · | · | · | · | · | · | · | · | · | propio |
| `cuentas.verificar` | Aprobar o rechazar vinculaciones de pacientes | · | · | ✔ | · | · | · | · | · | · | · |
| `usuarios.ver` | Ver usuarios del sistema | ✔ | · | · | · | · | · | · | · | ✔ | · |
| `usuarios.invitar` | Invitar personal y crear su cuenta | ✔ | · | · | · | · | · | · | · | · | · |
| `usuarios.asignar_roles` | Asignar o quitar roles (nunca a sí mismo) | ✔ | · | · | · | · | · | · | · | · | · |
| `usuarios.desactivar` | Desactivar una cuenta | ✔ | · | · | · | · | · | · | · | · | · |
| `pacientes.buscar` | Buscar pacientes (datos mínimos) | · | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | · | · |
| `pacientes.registrar` | Registrar paciente tras buscar | · | · | ✔ | · | · | · | · | · | · | · |
| `pacientes.registrar_provisional` | Registrar paciente sin identidad confirmada | · | · | ✔ | · | ✔ | · | · | ✔ | · | · |
| `pacientes.ver_ficha` | Ver datos personales del paciente | · | ✔ | ✔ | · | área | relación | orden | relación | · | propio |
| `pacientes.ver_nacimiento` | Ver la fecha de nacimiento exacta (rango de edad si el contexto es rango) | · | · | ✔ | · | ✔ | ✔ | rango de edad | ✔ | · | propio |
| `pacientes.ver_contacto` | Ver DUI teléfono correo y dirección del paciente | · | · | ✔ | · | · | ✔ | · | · | · | propio |
| `pacientes.editar_demograficos` | Corregir datos personales con historial | · | · | ✔ | · | · | · | · | · | · | · |
| `pacientes.editar_propios` | Editar su propio teléfono correo y dirección | · | · | · | · | · | · | · | · | · | propio |
| `pacientes.gestionar_duplicados` | Revisar casos de posible duplicado | · | ✔ | ✔ | · | · | · | · | · | · | · |
| `expediente.ver` | Ver historial clínico | · | · | · | · | relación | relación | · | · | · | propio revisado |
| `personal.ver` | Ver personal de salud | ✔ | ✔ | · | · | · | · | · | · | · | · |
| `personal.gestionar` | Crear y editar personal e inscripciones | ✔ | · | · | · | · | · | · | · | · | · |
| `personal.ver_datos_personales` | Ver DUI y teléfono del personal | ✔ | · | · | · | · | · | · | · | · | · |
| `turnos.ver` | Ver horarios del personal | ✔ | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | · | · |
| `turnos.planificar` | Crear y editar turnos | · | ✔ | · | · | · | · | · | · | · | · |
| `turnos.publicar` | Publicar una planificación | · | ✔ | · | · | · | · | · | · | · | · |
| `turnos.ver_borradores` | Ver turnos en borrador antes de publicarlos | ✔ | ✔ | · | · | · | · | · | · | · | · |
| `espacios.ver` | Ver el árbol del edificio | ✔ | ✔ | ✔ | · | ✔ | ✔ | · | · | · | · |
| `espacios.configurar` | Crear y editar espacios y capacidades | ✔ | · | · | · | · | · | · | · | · | · |
| `camas.ver_tablero` | Ver tablero de camas sin ocupantes | · | ✔ | ✔ | · | ✔ | ✔ | · | · | · | · |
| `camas.ver_ocupante` | Ver qué paciente ocupa una cama | · | ✔ | ✔ | · | área | relación | · | · | · | propio |
| `camas.asignar` | Asignar cama a una admisión | · | ✔ | ✔ | · | · | · | · | · | · | · |
| `camas.trasladar` | Trasladar a otra cama | · | ✔ | ✔ | · | · | · | · | · | · | · |
| `camas.bloquear` | Bloquear o desbloquear una cama | · | ✔ | · | · | · | · | · | · | · | · |
| `camas.registrar_limpieza` | Registrar limpieza de cama | · | ✔ | · | · | ✔ | · | · | · | · | · |
| `camas.verificar_limpieza` | Verificar limpieza (otra persona) | · | ✔ | · | · | ✔ | · | · | · | · | · |
| `fila.emitir` | Emitir número de fila | · | · | ✔ | · | · | · | · | · | · | · |
| `fila.ver` | Ver la fila del día | · | ✔ | ✔ | · | ✔ | ✔ | · | · | · | propio |
| `fila.llamar` | Llamar un número | · | · | ✔ | · | ✔ | ✔ | · | · | · | · |
| `fila.gestionar` | Cambiar estado de un número | · | · | ✔ | · | ✔ | ✔ | · | · | · | · |
| `citas.ver` | Ver citas | · | ✔ | ✔ | · | ✔ | propio | · | · | · | propio |
| `citas.agendar` | Agendar y confirmar citas | · | · | ✔ | · | · | · | · | · | · | · |
| `citas.solicitar` | Pedir una cita | · | · | · | · | · | · | · | · | · | propio |
| `citas.cancelar` | Cancelar una cita | · | · | ✔ | · | · | · | · | · | · | propio |
| `consulta.iniciar` | Iniciar consulta desde número o cita | · | · | · | · | · | ✔ | · | · | · | · |
| `consulta.registrar` | Registrar motivo, examen, diagnóstico y plan | · | · | · | · | · | relación | · | · | · | · |
| `consulta.corregir` | Corregir una consulta firmada con addendum | · | · | · | · | · | autor | · | · | · | · |
| `signos.registrar` | Registrar signos vitales | · | · | · | · | ✔ | ✔ | · | ✔ | · | · |
| `recetas.emitir` | Emitir receta | · | · | · | · | · | relación | · | · | · | · |
| `laboratorio.ordenar` | Emitir orden de laboratorio | · | · | · | · | · | relación | · | · | · | · |
| `laboratorio.ver_cola` | Ver cola de órdenes | · | · | · | · | · | · | ✔ | · | · | · |
| `laboratorio.procesar` | Tomar muestra y capturar resultados | · | · | · | · | · | · | ✔ | · | · | · |
| `laboratorio.validar` | Completar una orden validada | · | · | · | · | · | · | ✔ | · | · | · |
| `laboratorio.cancelar` | Cancelar una orden | · | · | · | · | · | autor | ✔ | · | · | · |
| `laboratorio.revisar` | Revisar resultado y liberarlo al paciente | · | · | · | · | · | relación | · | · | · | · |
| `resultados.ver` | Ver valores de resultados | · | · | · | · | relación | relación | ✔ | · | · | propio revisado |
| `catalogo.configurar` | Exámenes, paneles y rangos de referencia | ✔ | · | · | · | · | · | · | · | · | · |
| `admision.solicitar` | Indicar hospitalización | · | · | · | · | · | relación | · | · | · | · |
| `admision.crear` | Crear admisión con su origen | · | ✔ | ✔ | · | · | · | · | · | · | · |
| `admision.autorizar` | Autorizar excepciones de admisión | · | ✔ | · | · | · | · | · | · | · | · |
| `admision.ver` | Ver admisiones activas | · | ✔ | ✔ | · | área | relación | · | · | · | propio |
| `admision.registrar_salida` | Registrar salida física | · | · | ✔ | · | ✔ | · | · | · | · | · |
| `alta.firmar` | Firmar alta médica | · | · | · | · | · | relación | · | · | · | · |
| `enfermeria.registrar` | Notas de enfermería | · | · | · | · | área | · | · | · | · | · |
| `ambulancia.ver_estado` | Ver estado de la ambulancia | · | ✔ | ✔ | · | · | ✔ | · | ✔ | · | · |
| `ambulancia.solicitar` | Pedir ambulancia | · | · | ✔ | · | · | · | · | · | · | propio |
| `ambulancia.despachar` | Confirmar solicitudes y despachar | · | ✔ | ✔ | · | · | · | · | · | · | · |
| `ambulancia.operar` | Hitos del servicio y ubicación | · | · | · | · | · | · | · | ✔ | · | · |
| `ambulancia.reportar_prehospital` | Enviar datos del paciente antes de llegar | · | · | · | · | · | · | · | ✔ | · | · |
| `ambulancia.recibir_prehospital` | Ver el reporte prehospital | · | ✔ | ✔ | · | ✔ | ✔ | · | · | · | · |
| `ambulancia.mantenimiento` | Poner y quitar mantenimiento | · | ✔ | · | · | · | · | · | ✔ | · | · |
| `ambulancia.ver_bitacora` | Ver bitácora filtrable | · | ✔ | ✔ | · | · | ✔ | · | propio | ✔ | · |
| `auditoria.ver` | Consultar y verificar auditoría | · | · | · | · | · | · | · | · | ✔ | · |
| `auditoria.mis_accesos` | Ver quién consultó mi expediente | · | · | · | · | · | · | · | · | · | propio |
| `inventario.ver` | Ver existencias | ✔ | ✔ | · | · | ✔ | · | ✔ | · | · | · |
| `inventario.mover` | Registrar entradas, salidas, ajustes y traslados | · | ✔ | · | · | consumo | · | reactivos | · | · | · |
| `inventario.configurar` | Artículos, bodegas y mínimos | ✔ | ✔ | · | · | · | · | · | · | · | · |
| `avisos.publicar` | Publicar avisos generales | ✔ | ✔ | · | · | · | · | · | · | · | · |
| `metricas.ver` | Ver métricas y tablero | ✔ | ✔ | · | · | · | · | · | · | ✔ | · |

## Matriz de endpoints por rol

Nivel: R = exigido por el curso; E = extra de alto valor; F = solo CLIMESA. Semana = semana del cronograma en que debe funcionar.

### Spec 101

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/auth/me` | `sesion.perfil` |  | R | 2 | ✔ | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| GET | `/api/v1/inicio` | `sesion.perfil` |  | R | 2 | ✔ | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| GET | `/api/v1/eventos` | `sesion.perfil` | Solo eventos de canales permitidos al usuario | R | 2 | ✔ | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| POST | `/api/v1/cuentas/vinculacion` | `cuenta.vincular` | Solo su cuenta | R | 2 | · | · | · | · | · | · | · | · | · | propio |
| GET | `/api/v1/cuentas/vinculaciones` | `cuentas.verificar` |  | R | 3 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/cuentas/vinculaciones/{id}/aprobar` | `cuentas.verificar` |  | R | 3 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/cuentas/vinculaciones/{id}/rechazar` | `cuentas.verificar` | Motivo obligatorio | R | 3 | · | · | ✔ | · | · | · | · | · | · | · |
| GET | `/api/v1/usuarios` | `usuarios.ver` |  | R | 2 | ✔ | · | · | · | · | · | · | · | ✔ | · |
| POST | `/api/v1/usuarios/invitaciones` | `usuarios.invitar` |  | R | 2 | ✔ | · | · | · | · | · | · | · | · | · |
| POST | `/api/v1/usuarios/{id}/invitacion/reenvio` | `usuarios.invitar` | Solo invitación pendiente | R | 2 | ✔ | · | · | · | · | · | · | · | · | · |
| POST | `/api/v1/usuarios/{id}/invitacion/cancelacion` | `usuarios.invitar` | Solo invitación pendiente; desactiva la cuenta | R | 2 | ✔ | · | · | · | · | · | · | · | · | · |
| PATCH | `/api/v1/usuarios/{id}/roles` | `usuarios.asignar_roles` | Nunca a sí mismo | R | 2 | ✔ | · | · | · | · | · | · | · | · | · |
| PATCH | `/api/v1/usuarios/{id}/estado` | `usuarios.desactivar` | Nunca a sí mismo | R | 2 | ✔ | · | · | · | · | · | · | · | · | · |
| GET | `/api/v1/me/vinculacion` | `cuenta.vincular` | Solo su cuenta | R | 5 | · | · | · | · | · | · | · | · | · | propio |

### Spec 110

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| POST | `/api/v1/exportaciones` | `sesion.perfil` | Solo registra la exportación; el archivo se arma en la web | R | 2 | ✔ | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| GET | `/api/v1/auditoria` | `auditoria.ver` |  | R | 4 | · | · | · | · | · | · | · | · | ✔ | · |
| POST | `/api/v1/auditoria/verificacion` | `auditoria.ver` |  | R | 4 | · | · | · | · | · | · | · | · | ✔ | · |
| GET | `/api/v1/auditoria/registros` | `auditoria.ver` |  | R | 4 | · | · | · | · | · | · | · | · | ✔ | · |
| GET | `/api/v1/auditoria/registros/{seq}` | `auditoria.ver` |  | R | 4 | · | · | · | · | · | · | · | · | ✔ | · |
| GET | `/api/v1/auditoria/opciones` | `auditoria.ver` |  | R | 4 | · | · | · | · | · | · | · | · | ✔ | · |
| GET | `/api/v1/me/accesos` | `auditoria.mis_accesos` | Propio | E | 5 | · | · | · | · | · | · | · | · | · | propio |

### Spec 102

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/pacientes` | `pacientes.buscar` | Devuelve datos mínimos y motivo de coincidencia; filtrar por situación de hoy, área o médico exige admision.ver, fila.ver o citas.ver con alcance global | R | 2 | · | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | · | · |
| GET | `/api/v1/pacientes/selector` | `pacientes.buscar` | Respuesta mínima (id, expediente, nombre, edad), paginada | R | 2 | · | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | · | · |
| POST | `/api/v1/pacientes/busquedas` | `pacientes.buscar` | Registra la búsqueda previa que exige el alta | R | 2 | · | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | · | · |
| POST | `/api/v1/pacientes` | `pacientes.registrar` | Exige búsqueda previa reciente | R | 2 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/pacientes/provisionales` | `pacientes.registrar_provisional` |  | R | 4 | · | · | ✔ | · | ✔ | · | · | ✔ | · | · |
| GET | `/api/v1/pacientes/{id}` | `pacientes.ver_ficha` | Relación de atención para MED y PAR; propio para PAC | R | 2 | · | ✔ | ✔ | · | área | relación | orden | relación | · | propio |
| PATCH | `/api/v1/pacientes/{id}` | `pacientes.editar_demograficos` | Versión optimista; historial | R | 2 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/pacientes/{id}/estado` | `pacientes.editar_demograficos` | Nunca borra | R | 2 | · | · | ✔ | · | · | · | · | · | · | · |
| GET | `/api/v1/pacientes/casos-duplicado` | `pacientes.gestionar_duplicados` |  | E | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| GET | `/api/v1/me/paciente` | `pacientes.ver_ficha` | Propio | R | 2 | · | ✔ | ✔ | · | área | relación | orden | relación | · | propio |
| PATCH | `/api/v1/me/paciente` | `pacientes.editar_propios` | Propio; solo teléfono correo y dirección; versión optimista | R | 2 | · | · | · | · | · | · | · | · | · | propio |

### Spec 103

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/personal` | `personal.ver` | Incluye las inscripciones de cada persona (W07 y W08) | R | 2 | ✔ | ✔ | · | · | · | · | · | · | · | · |
| GET | `/api/v1/personal/especialidades` | `personal.ver` | Catálogo por categoría (medico, enfermero); la API valida la especialidad contra él | R | 2 | ✔ | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/personal` | `personal.gestionar` |  | R | 2 | ✔ | · | · | · | · | · | · | · | · | · |
| PATCH | `/api/v1/personal/{id}` | `personal.gestionar` | Versión optimista | R | 2 | ✔ | · | · | · | · | · | · | · | · | · |
| POST | `/api/v1/personal/{id}/inscripciones` | `personal.gestionar` | Versión optimista y motivo; sin inscripción vigente no se programa MED ni ENF | E | 4 | ✔ | · | · | · | · | · | · | · | · | · |
| GET | `/api/v1/turnos` | `turnos.ver` | PAR, AST, ENF ven los suyos y los de su área; from/to opcionales (máximo 31 días), la semana que se ve | R | 2 | ✔ | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | · | · |
| POST | `/api/v1/turnos` | `turnos.planificar` | Sin traslape; reglas D-054 | R | 2 | · | ✔ | · | · | · | · | · | · | · | · |
| PATCH | `/api/v1/turnos/{id}` | `turnos.planificar` | Versión optimista | R | 3 | · | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/turnos/publicar` | `turnos.publicar` | Advierte huecos de cobertura | R | 4 | · | ✔ | · | · | · | · | · | · | · | · |
| GET | `/api/v1/turnos/cobertura` | `turnos.ver` |  | E | 4 | ✔ | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | · | · |
| GET | `/api/v1/turnos/catalogo` | `turnos.ver` | Todas las áreas, funciones y personal activo para filtrar y asignar turnos; sin datos personales | R | 2 | ✔ | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | · | · |
| GET | `/api/v1/turnos/mios` | `turnos.ver` | Propio | R | 3 | ✔ | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | · | · |
| GET | `/api/v1/me/turno-activo` | `sesion.perfil` | Propio; Lote 5 S9: REC AST ENF MED LAB PAR necesitan turno (margen 30 min) para comandos operativos | R | 6 | ✔ | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| GET | `/api/v1/turnos/especialistas` | `turnos.ver` | Médicos de turno por día y especialidad durante 7 días; sin datos de contacto (RN-17, CARGA-04) | R | 3 | ✔ | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | · | · |
| POST | `/api/v1/turnos/{id}/entrada` | `turnos.ver` | Propio; obsoleto, una versión para apps instaladas: no cambia nada, devuelve el estado del turno ya empezado o 409 entrada_automatica antes del inicio | R | 3 | ✔ | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | · | · |
| POST | `/api/v1/turnos/{id}/asistencia` | `turnos.planificar` | La entrada es automática al inicio; ausencia con tipo y motivo, corregir la hora real de entrada o deshacer una ausencia; versión y motivo (ASIS-01 a ASIS-03) | R | 3 | · | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/turnos/lote/validar` | `turnos.planificar` | No guarda; un resultado por turno con las reglas de un turno suelto (descanso, tope de 7 días, traslape, inscripción) y huecos de cobertura | R | 4 | · | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/turnos/lote` | `turnos.planificar` | Todo o nada, como borradores; 409 lote_con_conflictos con el resultado de cada turno | R | 4 | · | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/turnos/generar` | `turnos.planificar` | Vista previa sin guardar: rotativo, 12x36, 24x72 o personalizado; llena la cobertura mínima del área y explica los huecos; máximo 31 días | R | 4 | · | ✔ | · | · | · | · | · | · | · | · |
| GET | `/api/v1/turnos/candidatos` | `turnos.planificar` | Sin guardar: cada persona de la función pasa las reglas de un turno suelto; válidas primero (área, menos horas) y las demás con su código | R | 4 | · | ✔ | · | · | · | · | · | · | · | · |
| GET | `/api/v1/turnos/plantillas` | `turnos.planificar` |  | R | 4 | · | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/turnos/plantillas` | `turnos.planificar` | Nombre único por área | R | 4 | · | ✔ | · | · | · | · | · | · | · | · |
| PATCH | `/api/v1/turnos/plantillas/{id}` | `turnos.planificar` | Versión optimista | R | 4 | · | ✔ | · | · | · | · | · | · | · | · |

### Spec 104

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/espacios` | `espacios.ver` |  | R | 2 | ✔ | ✔ | ✔ | · | ✔ | ✔ | · | · | · | · |
| POST | `/api/v1/espacios` | `espacios.configurar` |  | R | 2 | ✔ | · | · | · | · | · | · | · | · | · |
| PATCH | `/api/v1/espacios/{id}` | `espacios.configurar` | No reduce capacidad bajo ocupación | R | 2 | ✔ | · | · | · | · | · | · | · | · | · |
| GET | `/api/v1/camas` | `camas.ver_tablero` | Ocupante solo con camas.ver_ocupante | R | 2 | · | ✔ | ✔ | · | ✔ | ✔ | · | · | · | · |
| POST | `/api/v1/camas/{id}/bloquear` | `camas.bloquear` | Motivo y versión obligatorios | R | 4 | · | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/camas/{id}/desbloquear` | `camas.bloquear` | Versión y motivo obligatorios | R | 4 | · | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/camas/{id}/limpieza` | `camas.registrar_limpieza` | Versión y motivo obligatorios | R | 4 | · | ✔ | · | · | ✔ | · | · | · | · | · |
| POST | `/api/v1/camas/{id}/limpieza/completar` | `camas.registrar_limpieza` | Versión y motivo obligatorios | R | 4 | · | ✔ | · | · | ✔ | · | · | · | · | · |
| POST | `/api/v1/camas/{id}/limpieza/verificar` | `camas.verificar_limpieza` | Distinta persona; versión y motivo obligatorios | R | 4 | · | ✔ | · | · | ✔ | · | · | · | · | · |

### Spec 105

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/citas` | `citas.ver` | MED y PAC solo propias | R | 3 | · | ✔ | ✔ | · | ✔ | propio | · | · | · | propio |
| GET | `/api/v1/citas/disponibilidad` | `citas.agendar` o `citas.solicitar` | PAC y REC según permisos | R | 3 | · | · | ✔ | · | · | · | · | · | · | propio |
| POST | `/api/v1/citas` | `citas.agendar` | Sin traslape por médico | R | 3 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/citas/solicitudes` | `citas.solicitar` | Cuenta verificada | R | 4 | · | · | · | · | · | · | · | · | · | propio |
| POST | `/api/v1/citas/solicitudes/{id}/confirmar` | `citas.agendar` |  | R | 4 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/citas/solicitudes/{id}/rechazar` | `citas.agendar` | Motivo | R | 4 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/citas/{id}/cancelar` | `citas.cancelar` | PAC solo propias | R | 3 | · | · | ✔ | · | · | · | · | · | · | propio |
| GET | `/api/v1/citas/catalogos` | `citas.agendar` o `citas.solicitar` | Médicos activos con turno del día; pacientes solo el propio de PAC (REC busca con /pacientes/selector) | R | 3 | · | · | ✔ | · | · | · | · | · | · | propio |
| GET | `/api/v1/fila` | `fila.ver` | Filtra según relación | R | 3 | · | ✔ | ✔ | · | ✔ | ✔ | · | · | · | propio |
| POST | `/api/v1/fila` | `fila.emitir` | Número único por servicio y día | R | 3 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/fila/{id}/llamar` | `fila.llamar` | Transición válida | R | 3 | · | · | ✔ | · | ✔ | ✔ | · | · | · | · |
| POST | `/api/v1/fila/{id}/atender` | `fila.gestionar` | Transición válida | R | 3 | · | · | ✔ | · | ✔ | ✔ | · | · | · | · |
| POST | `/api/v1/fila/{id}/completar` | `fila.gestionar` | Transición válida | R | 3 | · | · | ✔ | · | ✔ | ✔ | · | · | · | · |
| POST | `/api/v1/fila/{id}/no-se-presento` | `fila.gestionar` | Transición válida | R | 3 | · | · | ✔ | · | ✔ | ✔ | · | · | · | · |
| POST | `/api/v1/citas/{id}/reprogramar` | `citas.agendar` o `citas.solicitar` | REC la aplica; PAC solo propias, deja solicitud hasta N h antes | R | 4 | · | · | ✔ | · | · | · | · | · | · | propio |
| POST | `/api/v1/citas/reprogramaciones/{id}/aceptar` | `citas.agendar` o `consulta.iniciar` | REC o el médico de la cita | R | 4 | · | · | ✔ | · | · | ✔ | · | · | · | · |
| POST | `/api/v1/citas/reprogramaciones/{id}/rechazar` | `citas.agendar` o `consulta.iniciar` | REC o el médico de la cita, motivo | R | 4 | · | · | ✔ | · | · | ✔ | · | · | · | · |
| POST | `/api/v1/citas/{id}/no-asistio` | `citas.agendar` | Hora alcanzada y sin consulta | R | 4 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/fila/llamar-siguiente` | `fila.llamar` | Número que propone la regla RN-FILA-SIGUIENTE | R | 4 | · | · | ✔ | · | ✔ | ✔ | · | · | · | · |
| GET | `/api/v1/fila/siguiente` | `fila.ver` | Solo con fila completa; emergencias, urgentes, citas en ventana y llegada | R | 4 | · | ✔ | ✔ | · | ✔ | ✔ | · | · | · | propio |
| POST | `/api/v1/fila/{id}/deshacer-llamado` | `fila.llamar` | Solo un número llamado | R | 4 | · | · | ✔ | · | ✔ | ✔ | · | · | · | · |
| POST | `/api/v1/fila/{id}/prioridad` | `fila.gestionar` | Solo antes de la atención | R | 4 | · | · | ✔ | · | ✔ | ✔ | · | · | · | · |
| POST | `/api/v1/fila/{id}/anular` | `fila.emitir` | Solo quien lo emitió, en espera y dentro de 10 minutos | R | 5 | · | · | ✔ | · | · | · | · | · | · | · |
| GET | `/api/v1/fila/mi-puesto` | `fila.llamar` | Turno en curso de quien llama | R | 5 | · | · | ✔ | · | ✔ | ✔ | · | · | · | · |
| GET | `/api/v1/citas/categorias` | `citas.solicitar` o `citas.agendar` |  | R | 5 | · | · | ✔ | · | · | · | · | · | · | propio |
| GET | `/api/v1/citas/solicitudes-categoria` | `citas.ver` | REC todas las pendientes y las resueltas en 30 días; PAC solo propias | R | 5 | · | ✔ | ✔ | · | ✔ | propio | · | · | · | propio |
| POST | `/api/v1/citas/solicitudes-categoria` | `citas.solicitar` | PAC propio; una a tres categorías, franja y nota; sin médico | R | 5 | · | · | · | · | · | · | · | · | · | propio |
| POST | `/api/v1/citas/solicitudes-categoria/{id}/asignar` | `citas.agendar` | Crea cita confirmada con las reglas de siempre; auditado | R | 5 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/citas/solicitudes-categoria/{id}/rechazar` | `citas.agendar` | Motivo | R | 5 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/citas/solicitudes-categoria/{id}/cancelar` | `citas.cancelar` | PAC solo propias y pendientes | R | 5 | · | · | ✔ | · | · | · | · | · | · | propio |
| GET | `/api/v1/citas/solicitudes-categoria/{id}/sugerencia` | `citas.agendar` | Hasta 14 días; médico preferido o de las especialidades sugeridas | R | 5 | · | · | ✔ | · | · | · | · | · | · | · |

### Spec 106

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| POST | `/api/v1/consultas` | `consulta.iniciar` | Desde número llamado (ticketId) o cita confirmada (appointmentId), uno solo | R | 3 | · | · | · | · | · | ✔ | · | · | · | · |
| POST | `/api/v1/consultas/{id}/signos` | `signos.registrar` |  | R | 3 | · | · | · | · | ✔ | ✔ | · | ✔ | · | · |
| GET | `/api/v1/pacientes/{id}/signos` | `signos.registrar` | Contexto x más contexto de atención (relación; ingreso; ambulancia o actividad de hoy) (MA-SEG-07); audita la lectura | R | 3 | · | · | · | · | ✔ | ✔ | · | ✔ | · | · |
| POST | `/api/v1/pacientes/{id}/signos` | `signos.registrar` | Fuera de consulta; incluye dolor y glucemia; Idempotency-Key | R | 3 | · | · | · | · | ✔ | ✔ | · | ✔ | · | · |
| POST | `/api/v1/consultas/{id}/diagnosticos` | `consulta.registrar` | CIE-10 | R | 3 | · | · | · | · | · | relación | · | · | · | · |
| POST | `/api/v1/consultas/{id}/firmar` | `consulta.registrar` | Inscripción vigente en el acto | R | 3 | · | · | · | · | · | relación | · | · | · | · |
| POST | `/api/v1/consultas/{id}/addendum` | `consulta.corregir` | Solo el autor; conserva original | E | 4 | · | · | · | · | · | autor | · | · | · | · |
| GET | `/api/v1/pacientes/{id}/historial` | `expediente.ver` | Relación o propio revisado | R | 3 | · | · | · | · | relación | relación | · | · | · | propio revisado |
| GET | `/api/v1/consultas/agenda` | `consulta.iniciar` | Solo agenda propia | R | 3 | · | · | · | · | · | ✔ | · | · | · | · |
| PATCH | `/api/v1/consultas/{id}` | `consulta.registrar` | Versión y autor | R | 3 | · | · | · | · | · | relación | · | · | · | · |
| GET | `/api/v1/consultas/{id}/detalle` | `expediente.ver` o `consulta.iniciar` | Relación clínica y auditoría | R | 3 | · | · | · | · | relación | relación / ✔ | · | · | · | propio revisado |
| GET | `/api/v1/consultas/cie10` | `consulta.registrar` | Al menos 2 caracteres; hasta 20 | R | 6 | · | · | · | · | · | relación | · | · | · | · |
| POST | `/api/v1/consultas/{id}/receta` | `recetas.emitir` | Inscripción vigente | R | 3 | · | · | · | · | · | relación | · | · | · | · |
| GET | `/api/v1/consultas/sin-firmar` | `consulta.iniciar` | Solo propias | R | 4 | · | · | · | · | · | ✔ | · | · | · | · |

### Spec 107

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/laboratorio/ordenes` | `laboratorio.ver_cola` o `resultados.ver` | Filtra por laboratorio médico o paciente y oculta valores no revisados | R | 3 | · | · | · | · | relación | relación | ✔ | · | · | propio revisado |
| GET | `/api/v1/laboratorio/ordenes/{id}` | `resultados.ver` | Ver contexto | R | 3 | · | · | · | · | relación | relación | ✔ | · | · | propio revisado |
| POST | `/api/v1/laboratorio/ordenes/{id}/muestra` | `laboratorio.procesar` | Pendiente a En Proceso | R | 3 | · | · | · | · | · | · | ✔ | · | · | · |
| POST | `/api/v1/laboratorio/ordenes/{id}/completar` | `laboratorio.validar` | Todos los exámenes con valor | R | 3 | · | · | · | · | · | · | ✔ | · | · | · |
| POST | `/api/v1/laboratorio/ordenes/{id}/cancelar` | `laboratorio.cancelar` | Motivo | R | 4 | · | · | · | · | · | autor | ✔ | · | · | · |
| POST | `/api/v1/laboratorio/ordenes/{id}/revisar` | `laboratorio.revisar` | Solo Completado | R | 4 | · | · | · | · | · | relación | · | · | · | · |
| GET | `/api/v1/me/laboratorio` | `resultados.ver` | Estado siempre; valores solo revisados | R | 3 | · | · | · | · | relación | relación | ✔ | · | · | propio revisado |
| PUT | `/api/v1/catalogo/examenes/{id}` | `catalogo.configurar` | Versión con vigencia | R | 3 | ✔ | · | · | · | · | · | · | · | · | · |
| GET | `/api/v1/laboratorio/catalogo` | `laboratorio.ordenar` o `catalogo.configurar` | Catálogo activo | R | 3 | ✔ | · | · | · | · | relación | · | · | · | · |
| POST | `/api/v1/laboratorio/ordenes` | `laboratorio.ordenar` | Consulta propia | R | 3 | · | · | · | · | · | relación | · | · | · | · |
| POST | `/api/v1/laboratorio/ordenes/{id}/resultados` | `laboratorio.procesar` | Marca calculada en servidor | R | 3 | · | · | · | · | · | · | ✔ | · | · | · |
| POST | `/api/v1/laboratorio/ordenes/{id}/resultados/lote` | `laboratorio.procesar` | Solo En Proceso; todo o nada con una versión; complete=true exige laboratorio.validar | R | 4 | · | · | · | · | · | · | ✔ | · | · | · |
| POST | `/api/v1/laboratorio/ordenes/{id}/enmendar` | `laboratorio.validar` | Solo Completado; motivo de 10 o más; vuelve a revisión médica | R | 4 | · | · | · | · | · | · | ✔ | · | · | · |
| POST | `/api/v1/laboratorio/ordenes/{id}/externa` | `laboratorio.procesar` o `laboratorio.ordenar` | Solo Pendiente; laboratorio o médico que pidió; lugar e instrucciones para el paciente | R | 4 | · | · | · | · | · | relación | ✔ | · | · | · |
| POST | `/api/v1/laboratorio/ordenes/{id}/resultado-externo` | `laboratorio.procesar` o `laboratorio.revisar` | Solo orden externa Pendiente; referencia del adjunto y valor de cada examen; completa la orden | R | 4 | · | · | · | · | · | relación | ✔ | · | · | · |
| POST | `/api/v1/laboratorio/pacientes/{id}/resultado-externo` | `laboratorio.ordenar` | Médico con relación de atención vigente; exámenes del catálogo uno por uno; crea la orden externa ya completada | R | 4 | · | · | · | · | · | relación | · | · | · | · |
| POST | `/api/v1/laboratorio/adjuntos/{id}/archivo` | `laboratorio.procesar` o `laboratorio.revisar` | Adjunto solo con referencia; laboratorio o médico que puede revisar; tipo por contenido, 10 MB, SHA-256 del servidor; bucket privado; no reemplaza | R | 4 | · | · | · | · | · | relación | ✔ | · | · | · |
| GET | `/api/v1/laboratorio/adjuntos/{id}/enlace` | `resultados.ver` | Personal que ve los valores de la orden; nunca el paciente (404); enlace firmado de 5 minutos; auditado | R | 4 | · | · | · | · | relación | relación | ✔ | · | · | propio revisado |
| GET | `/api/v1/laboratorio/pendientes` | `laboratorio.revisar` | Órdenes que pidió quien lee; crítico primero | R | 4 | · | · | · | · | · | relación | · | · | · | · |
| POST | `/api/v1/laboratorio/pendientes/{id}/revisar` | `laboratorio.revisar` | Médico que pidió o revisor; con versión | R | 4 | · | · | · | · | · | relación | · | · | · | · |
| GET | `/api/v1/laboratorio/seguimientos` | `citas.agendar` | Sin exámenes ni valores | R | 4 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/laboratorio/seguimientos/{id}/confirmar` | `citas.agendar` | Cita del mismo paciente y médico creada con POST /citas | R | 4 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/laboratorio/seguimientos/{id}/descartar` | `citas.agendar` | Motivo de 10 o más | R | 4 | · | · | ✔ | · | · | · | · | · | · | · |
| GET | `/api/v1/laboratorio/tiempo-entrega` | `laboratorio.ver_cola` | Solo agregados; últimos 7 días; sin órdenes externas; mismo cálculo que /metricas/tiempo_laboratorio | R | 5 | · | · | · | · | · | · | ✔ | · | · | · |
| GET | `/api/v1/catalogo/examenes` | `catalogo.configurar` | Activos e inactivos, con componentes y rangos vigentes | R | 3 | ✔ | · | · | · | · | · | · | · | · | · |

### Spec 108

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| POST | `/api/v1/admisiones` | `admision.crear` | Origen cita, consulta, emergencia o ambulancia enlazado a un registro del paciente; motivo obligatorio; médico con turno; cama opcional para ingreso inmediato | R | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| GET | `/api/v1/admisiones` | `admision.ver` |  | R | 4 | · | ✔ | ✔ | · | área | relación | · | · | · | propio |
| GET | `/api/v1/admisiones/origenes` | `admision.crear` | Registros recientes del paciente (cita, consulta, emergencia, ambulancia) | R | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| GET | `/api/v1/admisiones/medicos-disponibles` | `admision.crear` | Médicos con turno en el instante de ingreso; el resto con su motivo | R | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| GET | `/api/v1/admisiones/mapa-camas` | `admision.crear` | Camas por planta y habitación con compatibilidad (sexo, aislamiento, categoría) | R | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| GET | `/api/v1/admisiones/factibilidad` | `admision.crear` | Comprobación previa sin escribir | R | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| GET | `/api/v1/admisiones/{id}/sugerencias-cama` | `camas.asignar` | Algoritmo D-036 | R | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/admisiones/{id}/cama` | `camas.asignar` | Exclusión en base de datos | R | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/admisiones/{id}/autorizar` | `admision.autorizar` | Motivo | E | 4 | · | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/ocupaciones/{id}/traslado` | `camas.trasladar` | VIP no se traslada (D-037) | R | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/admisiones/{id}/notas-enfermeria` | `enfermeria.registrar` |  | E | 4 | · | · | · | · | área | · | · | · | · | · |
| POST | `/api/v1/admisiones/{id}/alta` | `alta.firmar` | Pendientes con responsable; inscripción vigente | R | 4 | · | · | · | · | · | relación | · | · | · | · |
| POST | `/api/v1/admisiones/{id}/salida` | `admision.registrar_salida` | Cama pasa a limpieza | R | 4 | · | · | ✔ | · | ✔ | · | · | · | · | · |
| POST | `/api/v1/admisiones/indicaciones` | `admision.solicitar` |  | R | 4 | · | · | · | · | · | relación | · | · | · | · |
| GET | `/api/v1/admisiones/{id}/notas-enfermeria` | `enfermeria.registrar` | Mismo contexto de área que al escribir; lectura auditada | R | 6 | · | · | · | · | área | · | · | · | · | · |
| POST | `/api/v1/admisiones/{id}/cancelar` | `admision.crear` | Solo pendiente de cama; motivo de 10 caracteres o más | R | 6 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/admisiones/{id}/anular` | `admision.autorizar` | Solo hospitalizado; ocupación cerrada como ingresado por error y cama a limpieza | R | 6 | · | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/admisiones/{id}/tratante` | `admision.autorizar` | Médico activo con cuenta; motivo; historial en cambio_tratante | R | 6 | · | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/admisiones/{id}/solicitar-alta` | `admision.crear` | Solo hospitalizado; aviso en vivo a la cuenta del médico tratante (D-02) | R | 6 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/admisiones/{id}/revocar-alta` | `alta.firmar` o `admision.autorizar` | El firmante o Jefatura; antes de la salida física; motivo | R | 6 | · | ✔ | · | · | · | relación | · | · | · | · |

### Spec 109

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/ambulancia` | `ambulancia.ver_estado` |  | R | 3 | · | ✔ | ✔ | · | · | ✔ | · | ✔ | · | · |
| POST | `/api/v1/ambulancia/solicitudes` | `ambulancia.solicitar` | PAC: cuenta verificada; queda por confirmar | R | 4 | · | · | ✔ | · | · | · | · | · | · | propio |
| POST | `/api/v1/ambulancia/solicitudes/{id}/descartar` | `ambulancia.despachar` | Motivo | R | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| GET | `/api/v1/ambulancia/solicitudes/mias` | `ambulancia.solicitar` | Solo las propias (cuenta o expediente); últimos 7 días; MA-AMB-05 | R | 6 | · | · | ✔ | · | · | · | · | · | · | propio |
| POST | `/api/v1/ambulancia/solicitudes/{id}/cancelar` | `ambulancia.solicitar` | Solo quien pidió y solo por confirmar; motivo opcional; MA-AMB-05 | R | 6 | · | · | ✔ | · | · | · | · | · | · | propio |
| POST | `/api/v1/ambulancia/servicios` | `ambulancia.despachar` | Solo si Disponible; bloqueo de fila | R | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/ambulancia/servicios/{id}/hitos` | `ambulancia.operar` | Orden de hitos | R | 4 | · | · | · | · | · | · | · | ✔ | · | · |
| POST | `/api/v1/ambulancia/servicios/{id}/hitos/deshacer` | `ambulancia.operar` | Solo la tripulación; último hito; 15 minutos; nunca finalizado ni llegada recibida | R | 6 | · | · | · | · | · | · | · | ✔ | · | · |
| POST | `/api/v1/ambulancia/servicios/{id}/cerrar` | `ambulancia.mantenimiento` | Además ambulancia.despachar (solo Jefatura; Lote 5 S8); solo servicio activo; motivo; estado final cancelado; unidad a Disponible | R | 6 | · | ✔ | · | · | · | · | · | ✔ | · | · |
| POST | `/api/v1/ambulancia/servicios/{id}/prehospital` | `ambulancia.reportar_prehospital` | Funciona sin conexión con reintento | E | 4 | · | · | · | · | · | · | · | ✔ | · | · |
| GET | `/api/v1/ambulancia/servicios/{id}/prehospital` | `ambulancia.recibir_prehospital` |  | E | 4 | · | ✔ | ✔ | · | ✔ | ✔ | · | · | · | · |
| GET | `/api/v1/ambulancia/llegada` | `ambulancia.recibir_prehospital` | Servicios por recibir: primero los llegados sin entrega (24 h) y después el activo; sin datos clínicos; MA-AMB-04 | R | 6 | · | ✔ | ✔ | · | ✔ | ✔ | · | · | · | · |
| POST | `/api/v1/ambulancia/servicios/{id}/recepcion` | `ambulancia.recibir_prehospital` | Personal clínico (expediente.ver); después de en_hospital; una sola vez; MA-AMB-04 | E | 6 | · | ✔ | ✔ | · | ✔ | ✔ | · | · | · | · |
| POST | `/api/v1/ambulancia/ubicacion` | `ambulancia.operar` | Solo con servicio activo | E | 5 | · | · | · | · | · | · | · | ✔ | · | · |
| GET | `/api/v1/ambulancia/cobertura` | `ambulancia.ver_estado` | Lote 5 S8: dias 1 a 14 (7 por omisión); paramédico y motorista por hora; huecos por día local; informativo (no bloquea publicar) | R | 6 | · | ✔ | ✔ | · | · | ✔ | · | ✔ | · | · |
| POST | `/api/v1/ambulancia/mantenimiento` | `ambulancia.mantenimiento` | Solo sin servicio activo; Jefatura o la tripulación (Lote 5 S8) | R | 4 | · | ✔ | · | · | · | · | · | ✔ | · | · |
| GET | `/api/v1/ambulancia/bitacora` | `ambulancia.ver_bitacora` | Datos del paciente ocultos sin relación | R | 4 | · | ✔ | ✔ | · | · | ✔ | · | propio | ✔ | · |

### Spec 111

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/inventario/existencias` | `inventario.ver` |  | R | 4 | ✔ | ✔ | · | · | ✔ | · | ✔ | · | · | · |
| GET | `/api/v1/inventario/movimientos` | `inventario.ver` |  | R | 4 | ✔ | ✔ | · | · | ✔ | · | ✔ | · | · | · |
| POST | `/api/v1/inventario/movimientos` | `inventario.mover` | Sin existencia negativa | R | 4 | · | ✔ | · | · | consumo | · | reactivos | · | · | · |
| PUT | `/api/v1/inventario/articulos/{id}` | `inventario.configurar` |  | R | 4 | ✔ | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/inventario/articulos` | `inventario.configurar` |  | R | 4 | ✔ | ✔ | · | · | · | · | · | · | · | · |
| GET | `/api/v1/inventario/articulos` | `inventario.ver` | Según el contexto del rol | R | 4 | ✔ | ✔ | · | · | ✔ | · | ✔ | · | · | · |
| GET | `/api/v1/inventario/articulos/{id}` | `inventario.ver` | Según el contexto del rol | R | 4 | ✔ | ✔ | · | · | ✔ | · | ✔ | · | · | · |
| DELETE | `/api/v1/inventario/articulos/{id}` | `inventario.configurar` | Solo sin lotes ni historial | R | 4 | ✔ | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/inventario/articulos/{id}/lotes` | `inventario.configurar` |  | R | 4 | ✔ | ✔ | · | · | · | · | · | · | · | · |
| PUT | `/api/v1/inventario/lotes/{id}` | `inventario.configurar` | Sin existencia para dar de baja | R | 4 | ✔ | ✔ | · | · | · | · | · | · | · | · |
| GET | `/api/v1/inventario/lotes` | `inventario.ver` | Según el contexto del rol | R | 4 | ✔ | ✔ | · | · | ✔ | · | ✔ | · | · | · |
| GET | `/api/v1/inventario/bodegas` | `inventario.ver` | Según el contexto del rol | R | 4 | ✔ | ✔ | · | · | ✔ | · | ✔ | · | · | · |

### Spec 112

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/publico/ocupacion` | público, sin sesión | Solo agregados | R | 3 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| GET | `/api/v1/publico/hospital` | público, sin sesión | Dirección teléfono y coordenadas del hospital | R | 3 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| GET | `/api/v1/publico/medicos-de-turno` | público, sin sesión | Nombre, especialidad, área | R | 3 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| GET | `/api/v1/publico/avisos` | público, sin sesión |  | R | 3 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| GET | `/api/v1/publico/fila/{servicio}` | público, sin sesión | Sin nombres | E | 4 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| POST | `/api/v1/avisos` | `avisos.publicar` | Vigencia | R | 3 | ✔ | ✔ | · | · | · | · | · | · | · | · |
| GET | `/api/v1/avisos` | `avisos.publicar` |  | R | 3 | ✔ | ✔ | · | · | · | · | · | · | · | · |
| GET | `/api/v1/me/avisos` | `sesion.perfil` | Propio | R | 3 | ✔ | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| GET | `/api/v1/me/avisos/bandeja` | `sesion.perfil` | Propio | R | 3 | ✔ | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| POST | `/api/v1/me/avisos/{id}/enterado` | `sesion.perfil` | Propio; aviso dirigido a la cuenta | R | 3 | ✔ | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| POST | `/api/v1/me/avisos/{id}/posponer` | `sesion.perfil` | Propio; aviso dirigido a la cuenta | R | 3 | ✔ | ✔ | ✔ | · | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| GET | `/api/v1/avisos/estadisticas` | `avisos.publicar` |  | R | 3 | ✔ | ✔ | · | · | · | · | · | · | · | · |
| GET | `/api/v1/avisos/alcance` | `avisos.publicar` | Solo el conteo; misma regla que estadisticas | R | 6 | ✔ | ✔ | · | · | · | · | · | · | · | · |
| PUT | `/api/v1/avisos/{id}` | `avisos.publicar` | Vigente o programado; exige versión | R | 3 | ✔ | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/avisos/{id}/retirar` | `avisos.publicar` | Motivo de 10 caracteres o más (D-13) | R | 3 | ✔ | ✔ | · | · | · | · | · | · | · | · |

### Spec 113

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/metricas/tablero` | `metricas.ver` | Agregados sin datos personales | R | 2 | ✔ | ✔ | · | · | · | · | · | · | ✔ | · |
| GET | `/api/v1/metricas/{indicador}` | `metricas.ver` |  | E | 5 | ✔ | ✔ | · | · | · | · | · | · | ✔ | · |

