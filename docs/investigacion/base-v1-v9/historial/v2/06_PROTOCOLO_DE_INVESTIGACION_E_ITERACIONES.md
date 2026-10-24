# Investigación acumulativa orientada a decisiones
## Preguntas
¿Qué trabajo ocurre realmente, quién lo recibe, qué evidencia deja, dónde falla, qué obligación lo limita, qué producto lo resuelve y qué costo/riesgo crea integrarlo?
No medir calidad por cantidad de enlaces. Exigir que cada fuente cambie o sostenga una regla, requisito, excepción o decisión.

## Recolección y clasificación
Buscar en español/inglés; ampliar a portugués/francés cuando un producto/documento relevante lo requiera, conservando idioma original y traducción identificada.
Fuentes: regulación oficial, SOP/manuales institucionales, estándares, documentación/repositorios de productos, artículos/estudios, implementaciones verificables y evidencia de operación del hospital.
Para cada búsqueda: fecha, motor/base, consulta exacta, objetivo, inclusiones/exclusiones, resultados seleccionados, acceso y razón.
Registro: autor, fecha/versión, URL/DOI, jurisdicción, tipo de evidencia, sección leída, limitación, hallazgo, flujo y requisito.
Producto promocional no prueba operación; paper de consulta pequeña no generaliza a hospital; guía pública no es SOP CLIMESA; normativa derogada no fija requisitos.
No afirmar revisión sistemática sin protocolo, búsqueda reproducible, cribado y evaluación adecuados.

## Revisión de literatura
[V2-13, V2-14, V2-15] Se identificaron un estudio de workflow en consultorios, una investigación con enfermeras y un estudio de preparación EHR en Vietnam. No se recuperaron íntegramente todos; se mantienen como candidatos de lectura.
Usar para elaborar preguntas sobre organización/carga/documentación/integración; no convertir sus resultados en SLA de CLIMESA.
Por paper extraer diseño, población, contexto, tamaño, desenlace, incertidumbre, financiación/conflictos, limitación y transferibilidad.
Priorizar seguridad medicamentosa, adopción en hospitales, interrupciones/downtime, calidad de datos, migración, carga documental, interoperabilidad y ciclos financieros. IA avanzada es posterior a identidad/órdenes/datos confiables.

## Investigación de campo necesaria
Sin usar información personal en el dossier, levantar un caso real desidentificado por tipo de flujo y una excepción frecuente. Observar turnos y entregas con responsables.
Solicitar organigrama, catálogo de servicios, políticas clínicas, contratos/anexos de seguros, plan de cuentas, políticas de ingresos, tarifas, documentos fiscales, reportes de cierre, inventario y mapas de sistemas.
Registrar documentos históricos como tales; el dueño confirma versión utilizada.
Medir esperas, doble captura, puntos de decisión y fallos; no inventar volúmenes, TAT o RPO/RTO.
Para cada flujo comparar SOP escrito y ejecución real; divergencia puede ser un problema organizativo, no una función nueva.

## Secuencia de iteraciones y salida obligatoria
| Iteración | Grupo | Producto y evidencia de cierre |
|---|---|---|
| I00 | Institución, legal y operación | Alcance CLIMESA, servicios/licencias, dueños, sistemas, mapa legal consolidado |
| I01 | MPI, archivo, representación, episodio | Identidad provisional/fusión/rectificación/exportación; dueños validan reglas |
| I02 | Ingresos, seguros, contador, caja, tesorería | Tarifas, anticipos, devengo, DTE, glosas, conciliación/cierre; políticas económicas aprobadas |
| I03 | Compras, inventario, activos, CxP | Recepción parcial, valoración, cotejo, pagos, mantenimiento, contratos |
| I04 | Órdenes, enfermería, farmacia, ADT | Circuito medicamento, administración, camas, altas y seguimiento firmado |
| I05 | Laboratorio, imagen e interfaces | Muestras/QC/críticos/correcciones, RIS/PACS y equipos reales |
| I06 | Urgencias, cirugía, anestesia, CEYE, sangre | Seguridad/transferencias/custodia; servicios confirmados |
| I07 | Especialidades, nutrición, rehabilitación | Reglas propias y conexión a episodio/cargo, según alcance |
| I08 | RRHH, servicios generales, calidad, dirección | Credenciales/nómina, limpieza/residuos/transporte, indicadores |
| I09 | Migración, seguridad, continuidad y piloto | Restauración, reconciliación, cortes, formación y aceptación operativa |

Orden admite ajustes por riesgo. I00 y trazabilidad no se saltan; contratos comunes se definen antes de especificar pantallas. No requiere un chat por módulo; cada iteración debe entregar una unidad revisable.

## Plantilla de salida por workflow
ID, versión, dueño, disparador y alcance; AS-IS evidenciado; TO-BE propuesto; participantes/permisos; estados/transiciones; datos/unidades; documentos; reglas/invariantes; automatizaciones; excepciones; contingencia/recuperación; controles legales/económicos; interfaces; indicadores; criterios de aceptación; referencias y decisiones pendientes.
No etiquetar TO-BE como operación existente. No cerrar brecha solo por encontrar referencia.

## Criterios para convertir a tareas de construcción
Toda task debe apuntar a flujo/requisito/aceptación y tener dependencias, migración, permisos, errores y evidencia. Diseño sin dueño local confirmado queda borrador.
La selección continuar/refactor/reconstruir requiere matriz de capacidades probadas, deuda/modelo, soporte/mantenimiento, integración, migración y costo; no depende del gusto por un stack.

