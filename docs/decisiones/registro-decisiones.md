# Registro de decisiones

Cada decisión tiene un ID estable. Las specs citan el ID (por ejemplo `D-031`) en lugar de repetir el porqué. Una decisión solo cambia con una entrada nueva que la reemplace; nunca se edita en silencio.

Origen: **EQ** = respuesta del equipo; **AN** = definida por análisis a pedido del equipo ("determínalo tú"); **BASE** = heredada de la base CLIMESA (constitución v0.1, ADR legado, specs 000 a 006); **CUR** = documento del curso.

Nota de trazabilidad: las 27 respuestas iniciales del equipo (12-oct-2026) no se conservaron como texto literal en este espacio de trabajo. Lo que decidieron sí: quedó aplicado en la constitución v0.1, ADR-0001 y las specs 000 a 006 del legado, y se recoge abajo como `BASE`.

## A. Heredadas de la base CLIMESA (12 y 13-oct-2026)

| ID | Decisión | Origen |
|---|---|---|
| D-001 | Investigación primero, especificación después (SDD). Reconstruir antes que parchar cuando falla un supuesto de fondo. | BASE |
| D-002 | Separar paciente, episodio, orden, prestación, resultado, cargo, documento fiscal, pago y asiento. Nunca un solo estado para dos de ellos. | BASE |
| D-003 | Nada clínico, económico ni fiscal se borra. Las correcciones crean versión nueva con autor, motivo y evidencia; "ingresado por error" es un estado. | BASE |
| D-004 | No inventar datos para llenar campos: fecha de nacimiento estimada, documento ausente e identidad provisional son explícitos. | BASE |
| D-005 | Toda regla que viene de ley, contrato o política es configuración con versión, vigencia, fuente y aprobador. | BASE |
| D-006 | La automatización propone, avisa y concilia; no fusiona pacientes, no firma contenido clínico ni decide prioridad clínica sin decisión humana. | BASE |
| D-007 | Toda orden que cambia estado lleva clave de idempotencia. Concurrencia con restricciones de base de datos o versión, nunca "consultar y luego escribir". | BASE |
| D-008 | Efectos entre módulos por outbox transaccional; consumidores deduplican. | BASE |
| D-009 | Auditoría de lectura y escritura de datos de paciente, solo inserción y encadenada por hash; 2 años mínimo (Norma 1616 Art. 55-56). | BASE |
| D-010 | Permisos por acción y contexto, no por nombre de rol; la administración técnica no da autoridad clínica. | BASE |
| D-011 | Buscar antes de crear un paciente; DUI con dígito verificador; expediente con dígito ISO 7064; nunca fusionar automáticamente. | BASE |
| D-012 | Inscripción profesional vigente verificada en el momento del acto clínico (R17). | BASE |
| D-013 | Cama exclusiva garantizada por la base de datos; la cama se libera solo tras limpieza verificada por otra persona. | BASE |
| D-014 | Datos de prueba y demostración siempre ficticios (Norma 1616 Art. 50). | BASE |
| D-015 | Acceso a datos SQL directo con Npgsql (ADR-0002 legado). | BASE, reafirmada en ADR-0004 |

## B. Cambio al proyecto del curso (17-oct-2026)

| ID | Decisión | Origen |
|---|---|---|
| D-020 | El proyecto del curso DAMA y la base CLIMESA son un mismo producto: "Sistema de Gestión Hospitalaria Universitaria (CLIMESA)", abreviado SGHU. | EQ |
| D-021 | Monolito modular; los microservicios eran sugerencia. | EQ |
| D-022 | Base de datos PostgreSQL en Supabase, en la nube. | EQ |
| D-023 | API propia como única entrada de negocio. Se implementa en ASP.NET Core (.NET 10), reutilizando la plataforma del legado. | EQ (API), AN (tecnología) |
| D-024 | Web administrativa en React. | EQ |
| D-025 | Android en Kotlin con Jetpack Compose y MVVM. | EQ |
| D-026 | iOS en SwiftUI con MVVM, versión mínima iOS 18. Compilación en Mac universitaria; hay cuenta de Apple para notificaciones push. | EQ |
| D-027 | Los cambios se empujan a los clientes; no hay recarga manual ni sondeo periódico. | EQ |
| D-028 | Toda la documentación y la interfaz en español. | EQ |
| D-029 | Jira, Figma y pruebas manuales los lleva otra parte del equipo; el desarrollo principal se controla aparte. | EQ |
| D-030 | "Administrador de ingresos" se implementa como admisión robusta (episodio, origen, cama, traslados, alta), no como formulario genérico. | EQ |
| D-031 | El administrador no ve contenido clínico por defecto. Para verlo pide acceso temporal con motivo; lo aprueba el delegado de protección de datos; queda auditado. | EQ |
| D-032 | El paciente crea su cuenta él mismo; se vincula a su expediente por DUI y recepción la verifica. Sin verificar no ve nada privado. | EQ |
| D-033 | "Solicitudes de atención" del paciente: pedir cita y pedir ambulancia. | EQ |
| D-034 | El paciente usa Android e iOS. | EQ |
| D-035 | "Turno" del paciente es el número de fila del día. Los horarios del personal son otro módulo. | EQ |
| D-036 | Criterios de asignación de cama confirmados: tipo VIP o semiprivada según solicitud y cobertura, compañero del mismo sexo en semiprivada, aislamiento bloquea la segunda cama, cama en limpieza no disponible. | EQ |
| D-037 | Traslados: quien ocupa una VIP no se traslada; quien ocupa una semiprivada puede pasar a otra semiprivada o a una VIP libre. | EQ (interpretación anotada: confirmar en revisión de spec 108) |
| D-038 | Una hospitalización puede originarse en consulta, emergencia, ambulancia o programación. | EQ |
| D-039 | Resultados de laboratorio con valores y rangos de referencia. | EQ |
| D-040 | El paciente ve un resultado solo después de que el médico lo revisa. | EQ |
| D-041 | La ambulancia atiende emergencias a domicilio y traslados entre hospitales, con ubicación en vivo como extra. | EQ |
| D-042 | La tripulación cambia el estado de la ambulancia desde Android y el despacho desde web; los dos ven lo mismo en tiempo real. | EQ |
| D-043 | Laboratorista existe como rol, en web y Android. | EQ |
| D-044 | Hay roles que por lógica solo existen en móvil. | EQ, detalle en D-051 |
| D-045 | Preguntas 27 a 30 (reparto de código, fecha de Figma, dispositivos de la defensa, repositorio) quedan abiertas a propósito; el avance se gobierna por el estado de las specs. | EQ |

## C. Definidas por análisis (17-oct-2026)

| ID | Decisión | Origen |
|---|---|---|
| D-050 | **Administrador y Jefe de Operaciones son roles distintos (segregación de funciones).** Administrador configura y asegura: usuarios, asignación de roles (nunca a sí mismo), catálogos, edificio, políticas. No opera pacientes, camas ni ambulancia. Jefe de Operaciones opera el día: tablero de camas, autorizaciones de admisión y traslado, planificación y publicación de turnos, mantenimiento de la ambulancia, inventario, avisos, métricas. Ninguno ve contenido clínico sin D-031. | AN |
| D-051 | **Roles del sistema (10).** Base pedida: Recepcionista, Asistente, Enfermero. Del curso: Administrador, Médico, Paciente, Jefe de Operaciones. De lo hablado e investigado: Laboratorista, Paramédico, Delegado de protección de datos. El despacho de ambulancia es un permiso de Recepcionista y Jefe de Operaciones, no un rol. "Alergista" y otras especialidades son atributos del personal médico, no roles. Detalle en `docs/arquitectura/roles-y-permisos.md`. | AN |
| D-052 | **Plataformas por rol.** Web: Administrador, Jefe de Operaciones, Recepcionista, Laboratorista, Delegado. Android: Recepcionista, Asistente, Enfermero, Médico, Laboratorista, Paramédico, Paciente. iOS: Médico, Paciente. Solo móvil por lógica: Paramédico, Asistente, Enfermero, Médico, Paciente. | AN |
| D-053 | **Personal y cuentas son cosas distintas.** Una persona del personal puede tener turnos sin tener usuario (motorista, limpieza). | AN |
| D-054 | **Reglas de turnos del personal** (configurables, con fuente): sin traslape por persona (garantizado en base de datos); duración 4 a 12 h, guardia médica hasta 24 h; descanso mínimo 8 h, 12 h tras una guardia de 24 h; aviso sobre 44 h semanales diurnas (Código de Trabajo Art. 161), no bloqueo; cobertura mínima: Emergencia 1 médico y 1 enfermero las 24 h, 1 enfermero por planta con camas ocupadas, 1 recepcionista en horario de atención, 1 laboratorista en horario de laboratorio; solo personal con inscripción vigente en roles clínicos; la ambulancia no puede estar Disponible sin paramédico de turno. Estados: Borrador, Publicado, En curso, Completado, Cancelado. | AN |
| D-055 | **Planta 1** (datos semilla, no código): Recepción y admisión; sala de espera con pantalla de fila; 4 consultorios de consulta general C-101 a C-104; Emergencia con 3 cubículos de observación E-01 a E-03 (no son camas de hospitalización); Laboratorio con toma de muestras y procesamiento; bahía de ambulancia; Farmacia y Caja reservadas para fases de CLIMESA. | AN |
| D-056 | **Bitácora de ambulancia.** Filtros: rango de fechas, tipo de servicio (emergencia a domicilio, traslado entre hospitales), estado final (completado, cancelado, sin traslado, paciente rechaza), prioridad, tripulación, origen y destino por municipio, tiempos de respuesta mayores a un umbral. Los datos del paciente se ocultan a quien no tenga relación de atención. | AN |
| D-057 | **Recursos e inventario.** Recursos físicos: espacios (habitaciones, camas, consultorios, cubículos), equipo médico asignado a un espacio con estado operativo o en mantenimiento, y la ambulancia. Inventario: insumos médicos y reactivos por bodega, con existencia, mínimo, lote y vencimiento, movimientos (entrada, salida, ajuste, traslado) y alerta de mínimo en tiempo real. Farmacia y dispensación quedan como fase CLIMESA. | AN |
| D-058 | **Solicitud de ambulancia por el paciente** entra como "por confirmar"; despacho la confirma por llamada antes de mover el recurso. La app muestra "si hay riesgo de vida, llame al 911". | AN |
| D-059 | **Laboratorio.** Estados del curso: Pendiente, En Proceso, Completado. Se agregan Cancelado (terminal) y la marca "revisado por el médico" (D-040). Un valor crítico avisa al médico solicitante en tiempo real. | AN |
| D-060 | **Tiempo real.** La API escribe el evento en el outbox dentro de la misma transacción; un disparador lo publica en Supabase Realtime (Broadcast) en canales privados autorizados por rol. El mensaje es delgado (tipo, id, versión) y el cliente vuelve a pedir el dato a la API, que aplica los permisos. | AN, ADR-0005 |
| D-061 | **Autenticación con Supabase Auth; autorización en la API.** La API valida el token de Supabase y decide permisos con sus propias tablas. Los clientes nunca escriben tablas directamente. | AN, ADR-0004 |
| D-062 | **Recursión visible y con propósito:** edificio como árbol (edificio, planta, área, habitación, cama) recorrido con consultas recursivas y vistas en árbol; catálogo de exámenes con paneles que contienen paneles. | AN |
| D-063 | **Concurrencia demostrable:** dos recepcionistas tomando la última cama; dos despachos simultáneos de la única ambulancia; dos turnos que se traslapan; doble emisión de número de fila; doble clic en cualquier orden (idempotencia). Cada caso con prueba automática. | AN |
| D-064 | **Despliegue del curso:** Supabase en la nube; API en contenedor (Azure for Students por defecto, Render o Railway de respaldo). Producción CLIMESA: servidor propio en el hospital (LPDP Art. 44-45); queda como perfil de despliegue distinto. | AN, ADR-0008 |

## D. Organización y arranque (17-oct-2026)

| ID | Decisión | Origen |
|---|---|---|
| D-065 | Equipo: Carlos (Scrum Master, backend y base de datos, supervisión), Leonel (desarrollador principal 2, web y base de front, supervisión), Fernando (Android), Milton (iOS), Walter y Ángel (QA, pruebas, prototipos y documentación; no programan). | EQ |
| D-066 | Para equilibrar carga, Leonel toma además el backend de turnos, fila y citas, laboratorio, inventario, información pública y métricas; Carlos conserva plataforma, acceso, pacientes, edificio, consulta, hospitalización, ambulancia y privacidad. Nadie aprueba su propia subtarea. | AN |
| D-067 | Base de datos y API en español (esquemas, tablas, columnas, rutas y JSON); identificadores internos del código (clases, variables) en inglés. | AN, ajusta constitución 6.6 |
| D-068 | Sistema de diseño: tipografía Atkinson Hyperlegible Next y Mono, íconos Material Symbols Rounded (web y Android) y SF Symbols (iOS), paleta verde azulado clínico con estados semánticos que cumplen contraste AA en claro y oscuro (`docs/diseno/brief-claude-design.md`). | AN |
| D-069 | Migraciones aplicadas en el proyecto Supabase "Gestion hospitalaria universitaria (Climesa)" el 17-oct-2026, con semillas ficticias; las mismas migraciones pasan las pruebas locales de invariantes y concurrencia. | AN |
