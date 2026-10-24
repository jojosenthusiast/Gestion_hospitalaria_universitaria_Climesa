# Tasks, políticas y validación de campo

24 tareas candidatas; no hay owners nominales ni estimaciones inventadas. Dependencias históricas son candidatas, no completadas.

| Task | Entrega | Dependencias/flujo | Criterios |
|---|---|---|---|
| T701 | Solicitud y aceptación de ingreso | T301–304/T604; HOS01 | AC701–703 |
| T702 | Capacidad, camas y reservas | T701; HOS02 | AC704–706 |
| T703 | Traslados e intervalos | T702; HOS03 | AC707–709 |
| T704 | Ronda y coordinación interdisciplinaria | T703; HOS04–05 | AC710–712 |
| T705 | Plan enfermero y valoración | T701; NUR01 | AC713–715 |
| T706 | Tareas, delegación y administración | T705; T410–412; NUR02 | AC716–718 |
| T707 | Observaciones y deterioro | T705–706; NUR03 | AC719–721 |
| T708 | Piel, movilidad y dispositivos | T705; NUR04 | AC722–724 |
| T709 | Relevo y carga enfermera | T704–708; NUR05 | AC725–727 |
| T710 | Admisión y salida crítica | T701–704; ICU01/04 | AC728–730 |
| T711 | Identidad de dispositivos y señales | T710; T516; ICU02 | AC731–733 |
| T712 | Infusiones y balance | T711; T410–412; ICU02–03 | AC734–736 |
| T713 | Ronda crítica, elegibilidad y alarmas | T710–712; ICU03–04 | AC737–739 |
| T714 | Tamizaje y evaluación nutricional | T705; NUT01 | AC740–742 |
| T715 | Orden de dieta y cambios | T714; NUT02 | AC743–745 |
| T716 | Producción, entrega e ingesta | T715; NUT03 | AC746–748 |
| T717 | Soporte nutricional y continuidad | T714–716; NUT04 | AC749–751 |
| T718 | Plan de alta y conciliación | T704/T709; DIS01–02 | AC752–754 |
| T719 | Educación, seguimiento y salida | T718; T514; DIS03–05 | AC755–757 |
| T720 | Limpieza y liberación | T702; SUP01 | AC758–760 |
| T721 | Textiles y lavandería | T720; SUP02 | AC761–763 |
| T722 | Residuos y evidencia externa | T720; SUP03 | AC764–766 |
| T723 | Biomédica y mantenimiento | T702/T711; SUP04 | AC767–769 |
| T724 | Finanzas, continuidad y migración | T701–723; T516/T620; SUP05; capítulo 09 | AC770–772 |

## Evidencia institucional pendiente
Confirmar servicios/capacidad/organigrama reales, permisos y contratos, protocolos vigentes por población, cobertura/relevos, planos/rutas y responsabilidades. Levantar datos de proceso sin pacientes identificables/credenciales en archivos de investigación.

| Circuito | Documento/decisión a resolver | Excepción a observar o validar |
|---|---|---|
| Camas | Capacidad habilitada/operativa, aislamiento, asignación/reserva y liberación. | Traslado cancelado, ausencia temporal, limpieza fallida y doble solicitud. |
| Enfermería | Valoración, plan, delegación/privilegios, riesgos y relevo. | Omisión/rechazo, deterioro, intervención suspendida y falta de receptor. |
| Cuidados críticos | Servicio/población autorizados, personal, equipos/señales, alarmas y continuidad. | Sensor inválido, reasignación, bomba/manual duplicados y pérdida de red. |
| Nutrición | Tamizaje, catálogo, prescripción/ayuno, cocina/proveedor y aporte real. | Dieta tras corte, ingrediente cambiado, traslado y consumo desconocido. |
| Alta | Autoridad, conciliación, comprensión, contacto y responsable postalta. | Revocación, receta contradictoria, cuidador sin autoridad y contacto fallido. |
| Apoyo | SOP/contratos/permisos, custodia y liberación por dominio. | Ropa rechazada, residuos sin comprobante y equipo no apto tras reparación. |

Registrar evidencia observada, fuente/version/fecha, responsable y decisión. No atribuir escenarios a CLIMESA sin observación. Los fixtures de tests sirven para software; no sustituyen custodia física, comprensión, habilitación, respuesta clínica o aceptación institucional.

## Especificación antes de implementación
Concretar cada criterio en precondiciones, pasos/dataset autorizado, expected results y evidencia. Clínicos/operadores validan significado; técnica valida estados, seguridad, concurrencia e interfaces. Asesoría verifica normas aplicables, derechos, firma/conservación, permisos y contratos. No marcar completado por existir una pantalla.
Matriz de responsabilidades por servicio/turno: quién indica, ejecuta, valida, recibe relevo, escala y cierra obligación. Funciones pueden combinarse según estructura y controles aprobados; no inventar número de empleados.

## Migración/corte
Censo de pacientes activos por episodio/ubicación, planes y tareas, infusiones/dispositivos, dietas/ayunos, alertas, preparación de alta, resultados/citas pendientes, limpieza/bloqueos, textiles/custodia, residuos/comprobantes y activos/órdenes de trabajo. Dueño por obligación abierta, conciliación de intervalo/cantidad/documento y verificación de recuperación.
Histórico escaneado se importa como documento con fuente; OCR de dosis/score/dieta/custodia no se considera acto validado. Resolver identidad y unidades antes de estructurar. Restore/rollback conserva novedades físicas y avisos externos.

## Próxima iteración propuesta
RRHH/contratación/turnos, credenciales/privilegios, salud ocupacional, calidad/seguridad/IAAS, quejas/legal y gestión documental. Después consolidar cobertura del hospital y cerrar vacíos de lectura normativa, con matriz fuente → flujo → requisito → tarea → evidencia → responsable. Esta base permitirá comparar continuar/refactorizar/reconstruir; no decidir arquitectura por conteo de páginas o módulos.
