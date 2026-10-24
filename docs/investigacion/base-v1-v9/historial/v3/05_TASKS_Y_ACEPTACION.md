# Tasks candidatas: diseño, construcción y aceptación
No implementadas ni estimadas. Las condiciones de prueba están en criterios_aceptacion.csv; todas tienen estado NO_EJECUTADO.
Cada task requiere responsable local, modelo aprobado y revisión de impacto antes de una migración.

| Task | Requisito V2 / decisión V3 | Entrega concreta | Dependencias | Aceptación |
|---|---|---|---|---|
| T301 | R203, D301/302 | Identificadores tipados y demografía con certeza/fuente; mapa legacy | I00, política identidad | AC301–305 |
| T302 | R203, D303/304 | Casos de duplicado/overlay; manifest y consumidores | T301, inventario de interfaces | AC306–310 |
| T303 | R204, D302 | Corrección/exportación y representación por ámbito | T301, legal consolidado | AC311–314 |
| T304 | R203/217, D305/306/308 | Atención, estancia, periodo y continuidad | T301, dueños asistenciales | AC315–318 |
| T305 | R205/206, D305 | Cuenta, cargos y tarifa/contrato versionados | T304, contratos/políticas | AC319–322 |
| T306 | R207/209, D307 | Recibo, aplicaciones, reversos y concurrencia | T305, medios/caja | AC323–326 |
| T307 | R208/221, D307/308 | Origen económico, mayor y cierres | T305/306, ERP/políticas contables | AC327–329 |
| T308 | R210/220, D308 | Adaptador fiscal con archivo/entrega/reconciliación | T305/307, anexos MH y emisor | AC330–332; pruebas MH aparte |
| T309 | R211/212, D307 | Reclamaciones, remesas y conciliación | T305/306, convenios y banco | Escenarios E04/E09 de V2, ampliar con contratos |
| T310 | R222, D309/310 | Plan de mapeo/corte/reconciliación y rollback | Todas las anteriores en entorno aprobado | Controles de migración de 06 y V2 |

## Evidencia de aceptación
Captura de configuración/versiones, comandos de prueba, estados antes/después, logs correlacionados, saldos/cantidades y evidencia de roles. Sin datos personales en reportes.
Para concurrencia usar motor SQL Server equivalente al elegido, al menos dos sesiones coordinadas y consultas posteriores al commit. Mock/InMemory no demuestra aislamiento.
Para integración incluir respuesta tardía, pérdida de ACK, reordenación, intento repetido, mismo ID con distinto contenido y recuperación de cola.
Para usabilidad observar admisión/archivo usando búsquedas en escenarios representativos, con homónimos/alias; dataset de prueba no sustituye levantamiento real.
Para fiscal, la suite funcional local no reemplaza las transmisiones mínimas ni la autorización que requiera Hacienda.

## Procedimiento ante fallo
No cambiar la expectativa para hacer pasar una prueba. Abrir hallazgo con flujo/control afectado, reproducibilidad, impacto, evidencia y propuesta.
Actualizar especificación si la política estaba equivocada; versionar decisión y revisar consumidores/migración.
Un criterio aprobado por un desarrollador no equivale a aceptación operativa del hospital.
