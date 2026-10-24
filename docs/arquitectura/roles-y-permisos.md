# Roles y matriz de control de acceso (RBAC)

> Archivo generado por `tools/generar_docs.py` desde `docs/arquitectura/datos/`. No editar a mano.

Requisitos: REQ-PRV-04 (matriz por rol de endpoints y vistas), REQ-ROL-01 a 06. Decisiones: D-031, D-050 a D-053.

## Roles

| Código | Rol | Plataformas | Origen | Qué hace |
|---|---|---|---|---|
| ADM | Administrador | Web | CUR REQ-ROL-01 | Configura y asegura el sistema: usuarios y roles, edificio, catálogos, políticas. No opera pacientes ni ve contenido clínico (D-050). |
| JOP | Jefe de Operaciones | Web | CUR (panel web); D-050 | Opera el día: tablero de camas, autorizaciones de admisión y traslado, turnos, mantenimiento de ambulancia, inventario, avisos, métricas. |
| REC | Recepcionista | Android; Web | CUR REQ-ROL-03; base pedida | Registro y verificación de pacientes, fila del día, citas, admisión, asignación de cama, despacho de ambulancia. |
| AST | Asistente | Android | CUR REQ-ROL-03; base pedida | Apoya la consulta: prepara al paciente, toma signos vitales, llama y mueve la fila del consultorio. |
| ENF | Enfermero/a | Android | CUR (Android); base pedida | Cuidado del hospitalizado: signos, notas de enfermería, limpieza de cama, consumo de insumos. |
| MED | Médico | iOS; Android | CUR REQ-ROL-02 | Consulta general, diagnósticos, recetas, órdenes y revisión de laboratorio, indicación de hospitalización, alta. Especialidad (alergista, emergenciólogo) es atributo. |
| LAB | Laboratorista | Web; Android | D-043; R07 | Procesa órdenes de laboratorio: muestra, resultados con rangos, completar; reactivos de inventario. |
| PAR | Paramédico | Android | D-042; R04 | Tripulación de la única ambulancia: estados del servicio, reporte prehospital, ubicación en vivo. Solo móvil. |
| DPD | Delegado de protección de datos | Web | D-031; LPDP Art. 15-17 | Aprueba accesos excepcionales a datos clínicos, revisa auditoría y verifica su integridad. |
| PAC | Paciente | Android; iOS | CUR REQ-ROL-04; D-032 a D-034 | Ve su fila, citas, estado de laboratorio, resultados revisados e historial; pide citas y ambulancia. |

## Cómo leer las matrices

| Marca | Significado |
|---|---|
| ✔ | Permitido sin condición adicional |
| relación | Solo con relación de atención activa con el paciente (consulta, admisión, servicio de ambulancia) o acceso excepcional aprobado (D-031) |
| propio | Solo sobre sí mismo (el paciente sobre su expediente, el médico sobre sus citas, el paramédico sobre sus servicios) |
| propio revisado | El paciente ve sus resultados y su historial solo después de la revisión médica (D-040) |
| área | Solo pacientes del área o planta donde la persona tiene turno en curso |
| autor | Solo quien creó el registro |
| · | Denegado (y auditado si se intenta) |

El permiso `camas.ver_ocupante` no tiene endpoint propio: decide si el tablero de camas muestra el nombre del ocupante o solo sus iniciales.

## Matriz de permisos por rol

| Permiso | Descripción | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `sesion.perfil` | Ver su propio perfil y permisos | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `cuenta.vincular` | Pedir la vinculación de su cuenta con su expediente | · | · | · | · | · | · | · | · | · | propio |
| `cuentas.verificar` | Aprobar o rechazar vinculaciones de pacientes | · | · | ✔ | · | · | · | · | · | · | · |
| `usuarios.ver` | Ver usuarios del sistema | ✔ | · | · | · | · | · | · | · | ✔ | · |
| `usuarios.invitar` | Invitar personal y crear su cuenta | ✔ | · | · | · | · | · | · | · | · | · |
| `usuarios.asignar_roles` | Asignar o quitar roles (nunca a sí mismo) | ✔ | · | · | · | · | · | · | · | · | · |
| `usuarios.desactivar` | Desactivar una cuenta | ✔ | · | · | · | · | · | · | · | · | · |
| `pacientes.buscar` | Buscar pacientes (datos mínimos) | · | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | · | · |
| `pacientes.registrar` | Registrar paciente tras buscar | · | · | ✔ | · | · | · | · | · | · | · |
| `pacientes.registrar_provisional` | Registrar paciente sin identidad confirmada | · | · | ✔ | · | ✔ | · | · | ✔ | · | · |
| `pacientes.ver_ficha` | Ver datos personales del paciente | · | ✔ | ✔ | ✔ | ✔ | relación | ✔ | relación | · | propio |
| `pacientes.editar_demograficos` | Corregir datos personales con historial | · | · | ✔ | · | · | · | · | · | · | · |
| `pacientes.gestionar_duplicados` | Revisar casos de posible duplicado | · | ✔ | ✔ | · | · | · | · | · | · | · |
| `expediente.ver` | Ver historial clínico | · | · | · | · | relación | relación | · | · | · | propio revisado |
| `personal.ver` | Ver personal de salud | ✔ | ✔ | · | · | · | · | · | · | · | · |
| `personal.gestionar` | Crear y editar personal e inscripciones | ✔ | · | · | · | · | · | · | · | · | · |
| `turnos.ver` | Ver horarios del personal | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | · | · |
| `turnos.planificar` | Crear y editar turnos | · | ✔ | · | · | · | · | · | · | · | · |
| `turnos.publicar` | Publicar una planificación | · | ✔ | · | · | · | · | · | · | · | · |
| `espacios.ver` | Ver el árbol del edificio | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | · | · | · | · |
| `espacios.configurar` | Crear y editar espacios y capacidades | ✔ | · | · | · | · | · | · | · | · | · |
| `camas.ver_tablero` | Ver tablero de camas sin ocupantes | · | ✔ | ✔ | · | ✔ | ✔ | · | · | · | · |
| `camas.ver_ocupante` | Ver qué paciente ocupa una cama | · | ✔ | ✔ | · | área | relación | · | · | · | propio |
| `camas.asignar` | Asignar cama a una admisión | · | ✔ | ✔ | · | · | · | · | · | · | · |
| `camas.trasladar` | Trasladar a otra cama | · | ✔ | ✔ | · | · | · | · | · | · | · |
| `camas.bloquear` | Bloquear o desbloquear una cama | · | ✔ | · | · | · | · | · | · | · | · |
| `camas.registrar_limpieza` | Registrar limpieza de cama | · | · | · | · | ✔ | · | · | · | · | · |
| `camas.verificar_limpieza` | Verificar limpieza (otra persona) | · | ✔ | · | · | ✔ | · | · | · | · | · |
| `recursos.gestionar` | Equipo médico por espacio y su estado | · | ✔ | · | · | · | · | · | · | · | · |
| `recursos.configurar` | Tipos de equipo y catálogos de recursos | ✔ | · | · | · | · | · | · | · | · | · |
| `fila.emitir` | Emitir número de fila | · | · | ✔ | · | · | · | · | · | · | · |
| `fila.ver` | Ver la fila del día | · | ✔ | ✔ | ✔ | · | ✔ | · | · | · | propio |
| `fila.llamar` | Llamar un número | · | · | · | ✔ | · | ✔ | · | · | · | · |
| `fila.gestionar` | Cambiar estado de un número | · | · | ✔ | ✔ | · | ✔ | · | · | · | · |
| `citas.ver` | Ver citas | · | ✔ | ✔ | ✔ | · | propio | · | · | · | propio |
| `citas.agendar` | Agendar y confirmar citas | · | · | ✔ | · | · | · | · | · | · | · |
| `citas.solicitar` | Pedir una cita | · | · | · | · | · | · | · | · | · | propio |
| `citas.cancelar` | Cancelar una cita | · | · | ✔ | · | · | · | · | · | · | propio |
| `consulta.iniciar` | Iniciar consulta desde número o cita | · | · | · | · | · | ✔ | · | · | · | · |
| `consulta.registrar` | Registrar motivo, examen, diagnóstico y plan | · | · | · | · | · | relación | · | · | · | · |
| `consulta.corregir` | Corregir una consulta firmada con addendum | · | · | · | · | · | autor | · | · | · | · |
| `signos.registrar` | Registrar signos vitales | · | · | · | ✔ | ✔ | ✔ | · | ✔ | · | · |
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
| `ambulancia.mantenimiento` | Poner y quitar mantenimiento | · | ✔ | · | · | · | · | · | · | · | · |
| `ambulancia.ver_bitacora` | Ver bitácora filtrable | · | ✔ | ✔ | · | · | · | · | propio | ✔ | · |
| `privacidad.solicitar_acceso` | Pedir acceso excepcional a datos clínicos | ✔ | ✔ | · | · | · | ✔ | · | · | · | · |
| `privacidad.aprobar_acceso` | Aprobar o negar accesos excepcionales | · | · | · | · | · | · | · | · | ✔ | · |
| `auditoria.ver` | Consultar y verificar auditoría | · | · | · | · | · | · | · | · | ✔ | · |
| `auditoria.mis_accesos` | Ver quién consultó mi expediente | · | · | · | · | · | · | · | · | · | propio |
| `inventario.ver` | Ver existencias | · | ✔ | · | · | ✔ | · | ✔ | · | · | · |
| `inventario.mover` | Registrar entradas, salidas, ajustes y traslados | · | ✔ | · | · | consumo | · | reactivos | · | · | · |
| `inventario.configurar` | Artículos, bodegas y mínimos | ✔ | ✔ | · | · | · | · | · | · | · | · |
| `avisos.publicar` | Publicar avisos generales | · | ✔ | · | · | · | · | · | · | · | · |
| `metricas.ver` | Ver métricas y tablero | ✔ | ✔ | · | · | · | · | · | · | ✔ | · |

## Matriz de endpoints por rol

Nivel: R = exigido por el curso; E = extra de alto valor; F = solo CLIMESA. Semana = semana del cronograma en que debe funcionar.

### Spec 101

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/me` | `sesion.perfil` |  | R | 2 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| PUT | `/api/v1/me/dispositivos` | `sesion.perfil` |  | E | 5 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| POST | `/api/v1/cuentas/vinculacion` | `cuenta.vincular` | Solo su cuenta | R | 2 | · | · | · | · | · | · | · | · | · | propio |
| GET | `/api/v1/cuentas/vinculaciones` | `cuentas.verificar` |  | R | 3 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/cuentas/vinculaciones/{id}/aprobar` | `cuentas.verificar` |  | R | 3 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/cuentas/vinculaciones/{id}/rechazar` | `cuentas.verificar` | Motivo obligatorio | R | 3 | · | · | ✔ | · | · | · | · | · | · | · |
| GET | `/api/v1/usuarios` | `usuarios.ver` |  | R | 2 | ✔ | · | · | · | · | · | · | · | ✔ | · |
| POST | `/api/v1/usuarios/invitaciones` | `usuarios.invitar` |  | R | 2 | ✔ | · | · | · | · | · | · | · | · | · |
| PUT | `/api/v1/usuarios/{id}/roles` | `usuarios.asignar_roles` | Nunca a sí mismo | R | 2 | ✔ | · | · | · | · | · | · | · | · | · |
| POST | `/api/v1/usuarios/{id}/desactivar` | `usuarios.desactivar` | Nunca a sí mismo | R | 2 | ✔ | · | · | · | · | · | · | · | · | · |

### Spec 102

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/pacientes` | `pacientes.buscar` | Devuelve datos mínimos y motivo de coincidencia | R | 2 | · | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | · | · |
| POST | `/api/v1/pacientes` | `pacientes.registrar` | Exige búsqueda previa reciente | R | 2 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/pacientes/provisional` | `pacientes.registrar_provisional` |  | R | 4 | · | · | ✔ | · | ✔ | · | · | ✔ | · | · |
| GET | `/api/v1/pacientes/{id}` | `pacientes.ver_ficha` | Relación de atención para MED y PAR; propio para PAC | R | 2 | · | ✔ | ✔ | ✔ | ✔ | relación | ✔ | relación | · | propio |
| PUT | `/api/v1/pacientes/{id}` | `pacientes.editar_demograficos` | Versión optimista; historial | R | 2 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/pacientes/{id}/desactivar` | `pacientes.editar_demograficos` | Nunca borra | R | 2 | · | · | ✔ | · | · | · | · | · | · | · |
| GET | `/api/v1/pacientes/casos-duplicado` | `pacientes.gestionar_duplicados` |  | E | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| GET | `/api/v1/me/paciente` | `pacientes.ver_ficha` | Propio | R | 2 | · | ✔ | ✔ | ✔ | ✔ | relación | ✔ | relación | · | propio |

### Spec 103

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/personal` | `personal.ver` |  | R | 2 | ✔ | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/personal` | `personal.gestionar` |  | R | 2 | ✔ | · | · | · | · | · | · | · | · | · |
| PUT | `/api/v1/personal/{id}` | `personal.gestionar` | Versión optimista | R | 2 | ✔ | · | · | · | · | · | · | · | · | · |
| POST | `/api/v1/personal/{id}/inscripciones` | `personal.gestionar` |  | E | 4 | ✔ | · | · | · | · | · | · | · | · | · |
| GET | `/api/v1/turnos` | `turnos.ver` | PAR, AST, ENF ven los suyos y los de su área | R | 2 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | · | · |
| POST | `/api/v1/turnos` | `turnos.planificar` | Sin traslape; reglas D-054 | R | 2 | · | ✔ | · | · | · | · | · | · | · | · |
| PUT | `/api/v1/turnos/{id}` | `turnos.planificar` | Versión optimista | R | 3 | · | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/turnos/publicar` | `turnos.publicar` | Advierte huecos de cobertura | R | 4 | · | ✔ | · | · | · | · | · | · | · | · |
| GET | `/api/v1/turnos/cobertura` | `turnos.ver` |  | E | 4 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | · | · |
| GET | `/api/v1/me/turnos` | `turnos.ver` | Propio | R | 3 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | · | · |

### Spec 104

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/espacios/arbol` | `espacios.ver` |  | R | 2 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | · | · | · | · |
| POST | `/api/v1/espacios` | `espacios.configurar` |  | R | 2 | ✔ | · | · | · | · | · | · | · | · | · |
| PUT | `/api/v1/espacios/{id}` | `espacios.configurar` | No reduce capacidad bajo ocupación | R | 2 | ✔ | · | · | · | · | · | · | · | · | · |
| GET | `/api/v1/camas/tablero` | `camas.ver_tablero` | Ocupante solo con camas.ver_ocupante | R | 2 | · | ✔ | ✔ | · | ✔ | ✔ | · | · | · | · |
| POST | `/api/v1/camas/{id}/bloquear` | `camas.bloquear` | Motivo obligatorio | R | 4 | · | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/camas/{id}/desbloquear` | `camas.bloquear` |  | R | 4 | · | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/camas/{id}/limpieza` | `camas.registrar_limpieza` |  | R | 4 | · | · | · | · | ✔ | · | · | · | · | · |
| POST | `/api/v1/camas/{id}/limpieza/verificar` | `camas.verificar_limpieza` | Distinta persona que limpió | R | 4 | · | ✔ | · | · | ✔ | · | · | · | · | · |
| GET | `/api/v1/recursos/equipos` | `recursos.gestionar` |  | E | 4 | · | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/recursos/equipos/{id}/estado` | `recursos.gestionar` |  | E | 4 | · | ✔ | · | · | · | · | · | · | · | · |
| PUT | `/api/v1/recursos/tipos/{id}` | `recursos.configurar` |  | E | 4 | ✔ | · | · | · | · | · | · | · | · | · |

### Spec 105

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| POST | `/api/v1/fila/tickets` | `fila.emitir` | Número único por servicio y día | R | 3 | · | · | ✔ | · | · | · | · | · | · | · |
| GET | `/api/v1/fila/hoy` | `fila.ver` |  | R | 3 | · | ✔ | ✔ | ✔ | · | ✔ | · | · | · | propio |
| POST | `/api/v1/fila/tickets/{id}/llamar` | `fila.llamar` |  | R | 3 | · | · | · | ✔ | · | ✔ | · | · | · | · |
| POST | `/api/v1/fila/tickets/{id}/estado` | `fila.gestionar` | Transiciones válidas | R | 3 | · | · | ✔ | ✔ | · | ✔ | · | · | · | · |
| GET | `/api/v1/me/fila` | `fila.ver` | Propio | R | 3 | · | ✔ | ✔ | ✔ | · | ✔ | · | · | · | propio |
| GET | `/api/v1/citas` | `citas.ver` | MED y PAC solo propias | R | 3 | · | ✔ | ✔ | ✔ | · | propio | · | · | · | propio |
| GET | `/api/v1/citas/disponibilidad` | `citas.ver` | PAC también | R | 3 | · | ✔ | ✔ | ✔ | · | propio | · | · | · | propio |
| POST | `/api/v1/citas` | `citas.agendar` | Sin traslape por médico | R | 3 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/citas/solicitudes` | `citas.solicitar` | Cuenta verificada | R | 4 | · | · | · | · | · | · | · | · | · | propio |
| POST | `/api/v1/citas/solicitudes/{id}/confirmar` | `citas.agendar` |  | R | 4 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/citas/solicitudes/{id}/rechazar` | `citas.agendar` | Motivo | R | 4 | · | · | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/citas/{id}/cancelar` | `citas.cancelar` | PAC solo propias | R | 3 | · | · | ✔ | · | · | · | · | · | · | propio |

### Spec 106

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| POST | `/api/v1/consultas` | `consulta.iniciar` | Desde número llamado o cita | R | 3 | · | · | · | · | · | ✔ | · | · | · | · |
| PUT | `/api/v1/consultas/{id}` | `consulta.registrar` | Autor; antes de firmar | R | 3 | · | · | · | · | · | relación | · | · | · | · |
| POST | `/api/v1/consultas/{id}/signos` | `signos.registrar` |  | R | 3 | · | · | · | ✔ | ✔ | ✔ | · | ✔ | · | · |
| POST | `/api/v1/consultas/{id}/diagnosticos` | `consulta.registrar` | CIE-10 | R | 3 | · | · | · | · | · | relación | · | · | · | · |
| POST | `/api/v1/consultas/{id}/recetas` | `recetas.emitir` | Inscripción vigente | R | 3 | · | · | · | · | · | relación | · | · | · | · |
| POST | `/api/v1/consultas/{id}/ordenes-laboratorio` | `laboratorio.ordenar` |  | R | 3 | · | · | · | · | · | relación | · | · | · | · |
| POST | `/api/v1/consultas/{id}/firmar` | `consulta.registrar` | Inscripción vigente en el acto | R | 3 | · | · | · | · | · | relación | · | · | · | · |
| POST | `/api/v1/consultas/{id}/addendum` | `consulta.corregir` | Solo el autor; conserva original | E | 4 | · | · | · | · | · | autor | · | · | · | · |
| GET | `/api/v1/pacientes/{id}/historial` | `expediente.ver` | Relación, acceso excepcional o propio revisado | R | 3 | · | · | · | · | relación | relación | · | · | · | propio revisado |

### Spec 107

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/laboratorio/ordenes` | `laboratorio.ver_cola` |  | R | 3 | · | · | · | · | · | · | ✔ | · | · | · |
| GET | `/api/v1/laboratorio/ordenes/{id}` | `resultados.ver` | Ver contexto | R | 3 | · | · | · | · | relación | relación | ✔ | · | · | propio revisado |
| POST | `/api/v1/laboratorio/ordenes/{id}/muestra` | `laboratorio.procesar` | Pendiente a En Proceso | R | 3 | · | · | · | · | · | · | ✔ | · | · | · |
| PUT | `/api/v1/laboratorio/ordenes/{id}/resultados` | `laboratorio.procesar` | Valida unidades y rangos | R | 3 | · | · | · | · | · | · | ✔ | · | · | · |
| POST | `/api/v1/laboratorio/ordenes/{id}/completar` | `laboratorio.validar` | Todos los exámenes con valor | R | 3 | · | · | · | · | · | · | ✔ | · | · | · |
| POST | `/api/v1/laboratorio/ordenes/{id}/cancelar` | `laboratorio.cancelar` | Motivo | R | 4 | · | · | · | · | · | autor | ✔ | · | · | · |
| POST | `/api/v1/laboratorio/ordenes/{id}/revisar` | `laboratorio.revisar` | Solo Completado | R | 4 | · | · | · | · | · | relación | · | · | · | · |
| GET | `/api/v1/me/laboratorio` | `resultados.ver` | Estado siempre; valores solo revisados | R | 3 | · | · | · | · | relación | relación | ✔ | · | · | propio revisado |
| GET | `/api/v1/catalogo/examenes` | `laboratorio.ordenar` | LAB y ADM también | R | 3 | · | · | · | · | · | relación | · | · | · | · |
| PUT | `/api/v1/catalogo/examenes/{id}` | `catalogo.configurar` | Versión con vigencia | R | 3 | ✔ | · | · | · | · | · | · | · | · | · |

### Spec 108

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| POST | `/api/v1/admisiones` | `admision.crear` | Origen: consulta, emergencia, ambulancia, programada | R | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| GET | `/api/v1/admisiones` | `admision.ver` |  | R | 4 | · | ✔ | ✔ | · | área | relación | · | · | · | propio |
| GET | `/api/v1/admisiones/{id}/sugerencias-cama` | `camas.asignar` | Algoritmo D-036 | R | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/admisiones/{id}/cama` | `camas.asignar` | Exclusión en base de datos | R | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/admisiones/{id}/autorizar` | `admision.autorizar` | Motivo | E | 4 | · | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/ocupaciones/{id}/traslado` | `camas.trasladar` | VIP no se traslada (D-037) | R | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/admisiones/{id}/notas-enfermeria` | `enfermeria.registrar` |  | E | 4 | · | · | · | · | área | · | · | · | · | · |
| POST | `/api/v1/admisiones/{id}/alta` | `alta.firmar` | Pendientes con responsable; inscripción vigente | R | 4 | · | · | · | · | · | relación | · | · | · | · |
| POST | `/api/v1/admisiones/{id}/salida` | `admision.registrar_salida` | Cama pasa a limpieza | R | 4 | · | · | ✔ | · | ✔ | · | · | · | · | · |
| POST | `/api/v1/admisiones/indicaciones` | `admision.solicitar` |  | R | 4 | · | · | · | · | · | relación | · | · | · | · |

### Spec 109

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/ambulancia` | `ambulancia.ver_estado` |  | R | 3 | · | ✔ | ✔ | · | · | ✔ | · | ✔ | · | · |
| POST | `/api/v1/ambulancia/solicitudes` | `ambulancia.solicitar` | PAC: cuenta verificada; queda por confirmar | R | 4 | · | · | ✔ | · | · | · | · | · | · | propio |
| POST | `/api/v1/ambulancia/solicitudes/{id}/descartar` | `ambulancia.despachar` | Motivo | R | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/ambulancia/servicios` | `ambulancia.despachar` | Solo si Disponible; bloqueo de fila | R | 4 | · | ✔ | ✔ | · | · | · | · | · | · | · |
| POST | `/api/v1/ambulancia/servicios/{id}/hitos` | `ambulancia.operar` | Orden de hitos | R | 4 | · | · | · | · | · | · | · | ✔ | · | · |
| POST | `/api/v1/ambulancia/servicios/{id}/prehospital` | `ambulancia.reportar_prehospital` | Funciona sin conexión con reintento | E | 4 | · | · | · | · | · | · | · | ✔ | · | · |
| GET | `/api/v1/ambulancia/servicios/{id}/prehospital` | `ambulancia.recibir_prehospital` |  | E | 4 | · | ✔ | ✔ | · | ✔ | ✔ | · | · | · | · |
| POST | `/api/v1/ambulancia/ubicacion` | `ambulancia.operar` | Solo con servicio activo | E | 5 | · | · | · | · | · | · | · | ✔ | · | · |
| POST | `/api/v1/ambulancia/mantenimiento` | `ambulancia.mantenimiento` | Solo sin servicio activo | R | 4 | · | ✔ | · | · | · | · | · | · | · | · |
| GET | `/api/v1/ambulancia/bitacora` | `ambulancia.ver_bitacora` | Datos del paciente ocultos sin relación | R | 4 | · | ✔ | ✔ | · | · | · | · | propio | ✔ | · |

### Spec 110

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| POST | `/api/v1/accesos-excepcionales` | `privacidad.solicitar_acceso` | Motivo y duración | R | 4 | ✔ | ✔ | · | · | · | ✔ | · | · | · | · |
| POST | `/api/v1/accesos-excepcionales/{id}/aprobar` | `privacidad.aprobar_acceso` | Nunca el propio | R | 4 | · | · | · | · | · | · | · | · | ✔ | · |
| POST | `/api/v1/accesos-excepcionales/{id}/negar` | `privacidad.aprobar_acceso` |  | R | 4 | · | · | · | · | · | · | · | · | ✔ | · |
| GET | `/api/v1/accesos-excepcionales` | `privacidad.aprobar_acceso` | Solicitante ve los suyos | R | 4 | · | · | · | · | · | · | · | · | ✔ | · |
| GET | `/api/v1/auditoria` | `auditoria.ver` |  | R | 4 | · | · | · | · | · | · | · | · | ✔ | · |
| POST | `/api/v1/auditoria/verificacion` | `auditoria.ver` |  | R | 4 | · | · | · | · | · | · | · | · | ✔ | · |
| GET | `/api/v1/me/accesos` | `auditoria.mis_accesos` | Propio | E | 5 | · | · | · | · | · | · | · | · | · | propio |

### Spec 111

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/inventario/existencias` | `inventario.ver` |  | R | 4 | · | ✔ | · | · | ✔ | · | ✔ | · | · | · |
| POST | `/api/v1/inventario/movimientos` | `inventario.mover` | Sin existencia negativa | R | 4 | · | ✔ | · | · | consumo | · | reactivos | · | · | · |
| PUT | `/api/v1/inventario/articulos/{id}` | `inventario.configurar` |  | R | 4 | ✔ | ✔ | · | · | · | · | · | · | · | · |
| POST | `/api/v1/inventario/articulos` | `inventario.configurar` |  | R | 4 | ✔ | ✔ | · | · | · | · | · | · | · | · |

### Spec 112

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/publico/ocupacion` | público, sin sesión | Solo agregados | R | 3 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| GET | `/api/v1/publico/medicos-de-turno` | público, sin sesión | Nombre, especialidad, área | R | 3 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| GET | `/api/v1/publico/avisos` | público, sin sesión |  | R | 3 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| GET | `/api/v1/publico/fila/{servicio}` | público, sin sesión | Sin nombres | E | 4 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| POST | `/api/v1/avisos` | `avisos.publicar` | Vigencia | R | 3 | · | ✔ | · | · | · | · | · | · | · | · |

### Spec 113

| Método | Ruta | Permiso | Condición | Nivel | Sem. | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/v1/metricas/tablero` | `metricas.ver` | Agregados sin datos personales | R | 2 | ✔ | ✔ | · | · | · | · | · | · | ✔ | · |
| GET | `/api/v1/metricas/{indicador}` | `metricas.ver` |  | E | 5 | ✔ | ✔ | · | · | · | · | · | · | ✔ | · |

