# CLIMESA — Cierre de la fase base del sistema

Fecha: 12 de octubre de 2026. Expediente de decisión basado en la investigación V1–V9 y la revisión estática del prototipo Aldara. Estado: **base investigativa consolidada para pasar a levantamiento institucional y especificación**. No constituye certificación de cumplimiento, validación clínica, aprobación institucional ni autorización de producción.

## 1. Conclusión ejecutiva

El sistema debe diseñarse alrededor de episodios, actos y responsabilidades trazables. Una colección de pantallas de pacientes, camas, inventario y facturas resulta insuficiente para coordinar la atención, preservar el expediente, controlar los recursos y reconciliar la operación económica de un hospital real.

La investigación permite cerrar la exploración general: existe un mapa de dominios, circuitos, excepciones, referencias, tareas candidatas y criterios de aceptación que sirve como punto de partida común. La siguiente fase debe convertir esa base en especificaciones aplicables a CLIMESA mediante evidencia institucional y revisión de los textos vigentes pendientes. No hace falta seguir ampliando indefinidamente el dossier antes de comenzar ese trabajo.

La recomendación técnica es evaluar y evolucionar la base existente por dominio, conservando temporalmente el prototipo como material de diagnóstico. No hay evidencia suficiente para aprobar una reconstrucción completa ni para declarar que la aplicación actual soporta la operación hospitalaria. La decisión de conservar, refactorizar, reemplazar o integrar un componente se tomará con sus casos reales, restricciones, coste de transición y pruebas.

**Puede cerrarse la fase base de investigación. La aprobación de requisitos, la comprobación normativa y la habilitación productiva quedan como hitos independientes y explícitos.**

## 2. Qué queda consolidado

| Elemento | Resultado y límite |
|---|---|
| Criterios V3–V8 | 316 criterios individuales candidatos; ninguno acredita ejecución operativa. |
| Tareas V3–V8 | 104 tareas candidatas; 102 con criterios individuales CSV. T309 y T310 conservan aceptación narrativa y requieren descomposición. |
| Fuentes V1–V8 | 206 registros y 198 URLs exactamente distintas. Son registros de consulta, no 206 obligaciones ni documentos íntegramente revisados. |
| Gobierno V9 | 8 criterios adicionales para controlar versiones, aplicabilidad, responsables y decisiones. No se suman a los 316 como cobertura clínica. |
| Trazabilidad | 142 criterios carecen de referencia explícita en su fila; las referencias del capítulo no resuelven automáticamente esa relación. |
| Aprobación | Los 316 criterios siguen pendientes de correspondencia precisa con cláusulas/aplicabilidad y de responsable institucional. |
| Código | Revisión estática; 58 archivos C# comparados en V9 sin cambios respecto de V8. Sin compilación, SQL, migraciones ni pruebas operativas. |

V1 y V2 contienen requisitos preliminares narrativos que se preservan como antecedentes. No se mezclan con los criterios individuales para inflar el total. El paquete V9 adjunto conserva la evidencia, las matrices y el historial V1–V8; este cierre añade la decisión y el traspaso de fase.

## 3. Alcance funcional de referencia

Esta tabla define ámbitos que deben evaluarse. No confirma que CLIMESA ofrezca cada servicio ni obliga a desarrollar cada ámbito desde cero.

| Ámbito | Circuito que debe quedar cubierto | Dependencia de aprobación |
|---|---|---|
| Identidad, agenda y admisión | Identificar, verificar duplicados, reservar, abrir episodio, trasladar y corregir identidad con historia. | Identificadores, población, responsables y formatos locales. |
| Expediente y órdenes | Registrar autoría, validar, firmar, corregir sin perder originales y dar seguimiento a órdenes. | Procedimientos clínicos y reglas legales aplicables. |
| Emergencia y hospitalización | Priorizar, atender, relevar, asignar camas, vigilar, trasladar y dar alta. | Cartera real, competencias y capacidad disponible. |
| Enfermería y medicación | Indicación, revisión, dispensación, administración, omisión, devolución y conciliación. | Formulario, protocolos, turnos y atribuciones profesionales. |
| Laboratorio e imágenes | Orden, preparación, muestra o estudio, aceptación, resultado, validación, entrega y resultado crítico. | Modalidad propia/referida, equipos, autorizaciones y contratos. |
| Cirugía, anestesia y CEYE | Preparación, consentimiento, seguridad, acto, recuperación y trazabilidad del material. | Servicios habilitados, norma CEYE vigente y procedimientos locales. |
| Transfusión | Solicitud, compatibilidad, entrega, administración, reacción, devolución y hemovigilancia. | Modalidad autorizada y convenio/proveedor confirmado. |
| Farmacia, compras e inventario | Solicitar, aprobar, recibir, verificar, almacenar, consumir, devolver, ajustar y reconciliar. | Catálogos, lotes, caducidades, contratos y segregación de funciones. |
| Caja, facturación y contabilidad | Prestación, cargo, cobertura, comprobante, pago, conciliación, devolución y asiento. | Tarifas, contratos, régimen fiscal, emisor y plan contable. |
| RRHH, planilla y credenciales | Vincular, habilitar, programar, cubrir ausencias, liquidar y revocar accesos/atribuciones. | Contratos y reglas laborales, fiscales y previsionales actuales. |
| Calidad, IAAS y derechos | Reportar, investigar, responder, mejorar y conservar evidencias con acceso controlado. | Definiciones, responsables, procedimientos y normativa vigente. |
| Servicios generales y biomédica | Limpieza de cama, alimentación, ropa, residuos, mantenimiento y disponibilidad de equipos. | Modalidades legalmente permitidas, fabricantes y proveedores. |
| TI, archivo y continuidad | Custodia, acceso, intercambio, monitoreo, respaldo, restauración y operación durante caída. | Infraestructura, interfaces, proveedores y pruebas de recuperación. |

Obstetricia, neonatal, pediatría especializada, rehabilitación, salud mental, diálisis, oncología y otros circuitos requieren profundización únicamente si la cartera institucional confirma su necesidad. La investigación general no completa sus especificaciones.

## 4. Principios de diseño que pasan a especificación

1. Separar paciente, episodio, orden, ejecución, resultado, cargo y documento fiscal; relacionarlos mediante identificadores estables. La anulación de un cargo no debe borrar un acto clínico.
2. Definir para cada objeto sus estados, transiciones, autoridad, motivo y evidencia. Una modificación importante debe preservar quién la realizó, cuándo, por qué y qué cambió.
3. Diferenciar alta médica, salida física, cierre económico y disponibilidad de cama. La liberación de una cama necesita el procedimiento de limpieza y verificación aplicable.
4. Vincular cargos a su origen y reconciliar prestación, inventario, factura, pago y contabilidad. No parametrizar cortes o cobros sin revisar la norma y el contrato aplicables.
5. Distinguir permiso informático de competencia y privilegio profesional. La condición de administrador no equivale a autorización para firmar o realizar actos clínicos.
6. Controlar concurrencia, reintentos e idempotencia en reservas, inventario, administraciones, cargos e interfaces. Los duplicados o mensajes tardíos deben tener resolución trazable.
7. Modelar cancelación, rechazo, ausencia, devolución, resultado corregido, urgencia, relevo y caída del servicio desde la especificación inicial.
8. Preservar custodia y confidencialidad en consultas, exportaciones, rectificaciones, solicitudes de titulares y restauraciones. La supresión requiere evaluación de conservación y reglas aplicables.
9. Automatizar tareas deterministas y verificables: alertas de vencimiento, colas, acuses, reconciliaciones y seguimiento. La automatización de prioridades clínicas, prescripción, alta o interpretación necesita validación específica y autoridad definida.
10. Mantener reglas configurables con versión, fecha efectiva y aprobación. No introducir porcentajes, plazos, umbrales clínicos o tasas de nómina por suposiciones.

Estos principios son recomendaciones de ingeniería y seguridad operativa. Su forma final debe justificarse con los requisitos y procesos aprobados; no se presentan como transcripción de una única norma.

## 5. Fronteras y sistemas subsecuentes

| Componente | Función y frontera recomendada para evaluación |
|---|---|
| Núcleo hospitalario | Identidad, episodios, coordinación de órdenes, expediente y trazabilidad de la atención. |
| LIS | Procesamiento del circuito de laboratorio, validaciones y comunicación de resultados; reconciliación con el núcleo. |
| RIS/PACS | Agenda y realización de estudios, imágenes e informes; custodia y relación con el episodio. |
| Farmacia/inventario | Productos, lotes, caducidades, movimientos y dispensación; conciliación con administración y compras. |
| ERP/contabilidad | Compras, proveedores, cuentas, tesorería, asientos y cierres; conciliación con cargos y cobros hospitalarios. |
| DTE | Documentos electrónicos y estados fiscales conforme a archivos y mecanismos oficiales aplicables al emisor. |
| RRHH/planilla | Contratos, turnos, incidencias y liquidaciones; sincronización controlada de identidad y acceso. |
| Calidad/archivo/biomédica | Procesos especializados y evidencias; integración cuando evite duplicar fuentes oficiales de información. |

No se seleccionan proveedores ni se aprueba una arquitectura de microservicios en este cierre. Como hipótesis de comparación, un núcleo modular con contratos explícitos puede reducir complejidad inicial; su viabilidad depende del equipo, la infraestructura y los límites reales. HL7/FHIR, DICOM u otros estándares deben aplicarse según versión, perfil y conformidad de cada contraparte, sin presumir compatibilidad por el nombre del estándar.

## 6. Condiciones pendientes que bloquean decisiones concretas

| Pendiente | Decisión bloqueada | Evidencia de cierre |
|---|---|---|
| Clase, cartera, permisos y RTA vigente | Configuración de servicios, recursos y tercerización. | Permisos y cartera institucional; texto vigente aplicable por junta y cláusulas revisadas. |
| Privacidad y expediente tras reformas de 2026 | Rutas de solicitudes, rectificación, representación y conservación. | Revisión conjunta de textos y procedimiento privado aprobado; no presumir cargo obligatorio por una disposición anterior. |
| CEYE 2026 | Reglas de procesamiento y liberación de material. | Texto íntegro vigente, procedimientos locales, equipos y registros validados. |
| Laboral y previsional vigente | Turnos, horas, prestaciones y planilla. | Régimen, contratos, normas y parámetros efectivos revisados por responsables. |
| DTE y régimen económico | Esquemas, catálogos, envío, anulaciones y asientos. | Archivos/versiones oficiales vigentes, autorización aplicable, contratos y conciliación probada. |
| Transfusión e IAAS | Circuitos específicos, denominadores y respuestas. | Normas aplicables completas, convenios, definiciones y procedimientos aprobados. |
| Interfaces y continuidad | Automatización con equipos y puesta en servicio. | Inventario técnico, contratos, pruebas de intercambio y recuperación. |
| Responsables y casos reales | Aprobación del backlog y alcance. | Dueños designados y revisión documentada de casos ordinarios y excepcionales. |

La V9 identificó una revisión RTA posterior al PDF histórico recuperado, una edición antigua del Código de Trabajo y publicaciones fiscales actualizadas en 2026. También dejó pendiente el texto CEYE de julio de 2026. Este cierre no convierte esos hallazgos en documentos íntegramente leídos ni resuelve su vigencia por suposición.

## 7. Traspaso a especificación: productos y salida

| Orden | Producto concreto | Condición de salida |
|---|---|---|
| 1 | Ficha institucional: servicios, permisos, población, modalidades y organigrama. | Validación por autoridad designada y evidencia documental. |
| 2 | Mapa de procesos reales por circuito. | Entradas, estados, salidas, responsables, excepciones, tiempos y dependencias revisados con sus dueños. |
| 3 | Matriz normativa y contractual aplicable. | Fuente, versión, cláusula, interpretación, requisito y evidencia enlazados; pendientes visibles. |
| 4 | Modelo de dominio y contratos de integración. | Identificadores, estados, eventos, fuente de verdad y resolución de discrepancias definidos. |
| 5 | Especificaciones y backlog aprobado. | Cada tarea enlaza proceso, regla, interfaz, criterio verificable y responsable; T309/T310 descompuestas. |
| 6 | Decisiones técnicas por dominio. | Comparación documentada de conservación, refactorización, reemplazo e integración; coste y transición considerados. |
| 7 | Implementación de un circuito completo acotado. | Pruebas técnicas y aceptación funcional con casos autorizados, migración y reconciliación verificadas. |
| 8 | Preparación productiva. | Formación, accesos, monitoreo, continuidad, restauración, soporte y decisión formal de puesta en servicio. |

El siguiente paquete de trabajo será la **especificación institucional del núcleo y de un primer circuito completo**, elegido tras confirmar la cartera. Debe atravesar identidad, episodio, prestación, registro, cargo, pago y conciliación con sus excepciones. No se elige un servicio de alto riesgo como primer piloto sin evaluación.

Para cada especificación utilizar: propósito; alcance; fuente de verdad; actores y autoridad; precondiciones; estados y transiciones; datos y validaciones; reglas con versión; excepciones; interfaces; auditoría; continuidad; criterios de aceptación; evidencias; aprobación; pendientes. Los casos de prueba técnicos no sustituyen observación ni aceptación institucional.

## 8. Verificación y conclusión final

Esta entrega verifica la integridad del paquete consolidado y sus recuentos. No añade investigación normativa nueva ni modifica el prototipo. Los hallazgos técnicos siguen siendo estáticos; no se ha demostrado funcionamiento en producción, rendimiento, seguridad, restauración ni aceptación clínica.

Se cierra la fase base como **expediente de investigación y marco de especificación**. La base permite dirigir el trabajo siguiente con alcance y evidencia, evitando decidir una reescritura por intuición o convertir borradores en requisitos aprobados. Permanecen abiertas las verificaciones que requieren textos vigentes completos, documentos institucionales y responsables autorizados.

La conclusión no es que el hospital esté listo para usar la aplicación. La conclusión es que el proyecto cuenta con una base consolidada para comenzar especificaciones reales y decidir, con evidencia por dominio, cómo construir el sistema.

## Referencias y navegación

Lectura de base: `base_investigativa_v9/00_LEER_PRIMERO.md`. Trazabilidad: `matriz_trazabilidad_criterios_v3_v8.csv`. Tareas: `registro_tasks_v3_v8.csv`. Fuentes: `catalogo_fuentes_consolidado.csv` y `06_FUENTES_Y_LIMITES_DE_INVESTIGACION.md`. Historial: `historial/v1` a `historial/v8`. Los identificadores y estados originales se conservan en esos archivos.

Localizadores primarios consultados en fases anteriores: [CSSP, catálogo RTA](https://cssp.gob.sv/rta/); [MH, documentación DTE](https://factura.gob.sv/informacion-tecnica-y-funcional/); [MINSAL, índice de lineamientos](https://asp.salud.gob.sv/regulacion/lineamientos.asp). Estos enlaces facilitan revisión y no sustituyen los estados de lectura y versión registrados en el expediente. Fecha de corte de la investigación consolidada: 12/10/2026.
