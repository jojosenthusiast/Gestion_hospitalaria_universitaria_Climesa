# Roles, tasks y transición
## Privilegios candidatos
Solicitante firma orden y responde/deriva seguimiento; tomador identifica/toma/etiqueta; transporte custodia; recepción laboratorio acepta/rechaza; operador analiza con QC; validador autoriza dentro de privilegios.
Técnico radiología ejecuta; radiólogo protocoliza/interpreta/firma; responsable radioprotección y biomédica controla evidencia de equipo/autorización según competencias.
Caja/facturación recibe prestaciones/cargos mínimos; TI administra transporte/seguridad sin firmar informes. Paciente/representante consulta bajo autoridad/estado aplicables.
Combinación de funciones según estructura requiere controles y auditoría; no usar Administrator como firma profesional.

## Tasks candidatas y criterios
| ID | Entrega | Dependencias | Aceptación |
|---|---|---|---|
| T501 | Catálogo pruebas/panel/material/método/unidad/rangos versionados | T301/T401, jefatura | AC501–503 |
| T502 | Orden/aceptación/derivación | T304/T501, privilegios | AC504–506 |
| T503 | Toma/etiqueta/reimpresión/provisionales | T301/302/T502 | AC507–509 |
| T504 | Custodia/recepción/rechazo/recolección | T503 | AC510–512 |
| T505 | Alícuota/QC/corrida/reactivos | T403/405/T504 | AC513–515 |
| T506 | Analizador/códigos/retención/idempotencia | T505, perfil proveedor | AC516–518 |
| T507 | Resultados/informe/versión/firma | T501/506, validadores | AC519–521 |
| T508 | Microbiología/reflex/externos/POCT | T505/507, protocolos | AC522–524 |
| T509 | Orden/protocolo/agenda imagen | T304, equipo y normativa | AC525–527 |
| T510 | Identidad/worklist/acquisition/reconciliación | T302/509 | AC528–530 |
| T511 | PACS/UID/manifests/custodia | T510, conformance/infraestructura | AC531–533 |
| T512 | Informe/visor/correcciones | T511, privilegios | AC534–536 |
| T513 | Críticos/acuse/escalamiento/acción | T507/512, cobertura | AC537–539 |
| T514 | Seguimiento postalta/portal/representación | T303/304/513 | AC540–542 |
| T515 | Cargos/costos y calidad/seguridad | T305/413 + T508/512 | AC543–545 |
| T516 | Interfaces/continuidad/migración | T310 (v3), T414 (v4), T501–T515 según alcance | AC546–548 |

Todas son candidatas, no completadas. Sin estimaciones ficticias ni owners nominales de CLIMESA.
Los CSV técnicos adjuntos guardan 48 criterios nuevos, todos NO_EJECUTADO.

## Migración sin fabricar conocimiento
Inventariar LIS/RIS/PACS/modalidades/equipos externos reales, versiones, licencias, responsables, exportación, interfaces y documentos; ausencia en Aldara no demuestra ausencia institucional.
Importar ID/emisor/paciente/orden/accession/muestra/UID/documento con mapa supervisado. Resolver provisional/merge conforme v3; no matching por nombre solo.
Informe PDF escaneado queda documento histórico, no resultado estructurado confiable sin revisión. OCR/unidad/rango/estado/firma requieren confirmación.
No inferir final/preliminar por fecha; reporte corregido conserva fuente/versión previa y destinatarios si disponibles.
Migrar estudios en formato original y manifests; JPG derivados no sustituyen series DICOM cuando corresponda.
Detectar colisiones de IDs/UID y contenido conflictivo antes de importar. Estudio extranjero conserva emisor y fuente.
Corte contempla muestras en análisis/derivación, preliminares/cultivos, estudios pendientes de envío/lectura, críticos sin ACK y seguimientos postalta.
Conciliar cantidades, documentos, vínculos, hashes, imágenes recuperables y obligaciones pendientes con responsables.
Restauración/rollback conserva actos/resultados nuevos durante corte y reparte responsabilidades; no restaurar BD ignorando equipos/archivos/avisos ya entregados.

## Evidencia de pruebas
Contraparte/version/configuración y dataset de prueba desidentificado; comando/mensaje/raw payload seguro; estados/versión antes/después, autor y logs correlacionados; aceptación por dueño.
Pruebas técnicas pueden usar fixtures, pero no sustituyen observación/validación de operación real. No afirmar resultados clínicos con datos simulados.

