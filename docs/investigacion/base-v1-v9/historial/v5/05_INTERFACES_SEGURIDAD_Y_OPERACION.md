# Interfaces: contrato y aceptación por contraparte
No se instalaron LIS/RIS/PACS ni se contactaron sistemas productivos. Productos/versions/firmware y contratos de CLIMESA pendientes.

## Propiedad candidata y transferencias
| Área | Autoridad propuesta | Transferencia verificable |
|---|---|---|
| MPI/atención | HIS o autoridad institucional acordada | LIS/RIS reciben identidad/orden y actualizaciones con reconocimiento |
| Solicitud/prueba/muestra | LIS | HIS recibe estados y resultados/informe autorizados/versionados |
| Analizador | Instrumento/middleware para dato técnico; LIS para validación | Worklist/códigos/QC/resultados con IDs de muestra/corrida |
| Agenda/protocolo/ejecución imagen | RIS | Modalidad recibe worklist; HIS estados |
| Pixels/series/instancias | PACS/archivo | RIS/HIS enlaces/manifests; visor solicita con permisos |
| Comunicación/seguimiento | Dueño clínico y sistema de tareas acordado | Informe→caso→acuse→acción/cierre |
| Cargos y mayor | Motor financiero/ERP acordados | Evento de prestación, ID/versionado y hito; sin nota clínica completa |

Una tabla de mapeo no permite dos sistemas editando la misma verdad sin resolver autoridad. Un resultado importado no pierde su institución/autor fuente.

## INT01 — Contrato de orden/resultados
Por endpoint/mensaje: versión de estándar/perfil, transporte, auth, alcance, formato/encoding, campos obligatorios/opcionales, códigos, unidad, estados, emisor/receptor y ACK/error.
IDs del solicitante/ejecutor y muestra/accession, organización y correlationId; no buscar paciente solo por nombre.
Deduplicación técnica por origen/ID y hash; versionado del contenido clínico separado del ID de mensaje.
Eventos fuera de orden: corrección antes de final, cancelación después de ejecución, merge durante cola; resolver relación/historial, nunca aceptar ciegamente.
ACK transporte/parseo distinto de aceptación de negocio y liberación profesional. Error se pone en cola con dueño/evidencia/reenvío seguro.
No prescribir una mezcla FHIR/HL7v2/ASTM universal: usar contratos reales de cada equipo y versión.
Mapeos locales e históricos con validación/pruebas; no convertir unknown a normal o negativo.

## INT02 — Analizador y QC
Perfil por fabricante/modelo/firmware/protocolo, mensaje de prueba exportado por proveedor, licencia habilitada, bidireccionalidad y limitaciones.
Código de prueba/resultados, flags, unidades, muestra/corrida, tiempos y controles; payload original seguro.
Código/unidad no mapeados retenidos; cambios aprobados con casos de prueba y retrocompatibilidad.
Si middleware reenvía o instrumento repite análisis, diferenciar mismo evento, reanálisis y corrección.
OpenELIS es candidato: anuncios genéricos de ASTM/HL7 no garantizan conexión al analizador concreto; documentación actual diferencia puente analizador de LIS y resultados retenidos.
Aceptar conexión con muestras/QC/errores/retransmisión/fallo y restauración, no solo un ping.

## INT03 — DICOM/RIS/PACS/visor
Conformance statement por versión: SOP classes, SCU/SCP, transfer syntaxes, worklist, pasos realizados si disponibles, store/query/retrieve, Storage Commitment y DICOMweb cuando aplique.
C-ECHO prueba conectividad, no identidad/pixels/report/custodia. UID/accession con emisor, privacidad/charset y lateralidad a probar.
Usar negociación/fallos documentados. Instancia incompleta/corrupta/conflictiva se retiene; no sobrescribir original.
Verificar en visor frames, series, orientación, medidas y contextos soportados según requisitos de diagnóstico; aplicación web atractiva no prueba equivalencia clínica.
No eliminar copies por thumbnail ni por éxito genérico. Compromiso de almacenamiento y recuperación documentado por implementación; backup aparte.

## INT04 — Seguridad y red
Auth por persona/servicio; autorización por paciente/atención/servicio/sede/propósito, auditoría y exportación.
No exponer PACS/REST DICOM como enlace público permanente. Proxy/app autorizada, TLS, segmentación y cuentas con privilegio mínimo; network alone no sustituye autorización.
Configurar modalidades conocidas y permisos por operación; AET/IP son datos de configuración, no autenticación humana.
Indices/pixels/backups y secretos protegidos. Acceso de proveedor/time-limited bajo procedimiento y evidencias; no credenciales compartidas clínicas.
Archivos entrantes se validan; metadata/private tags/pixels quemados pueden revelar identidad. Seudonimización exige prueba, no eliminar PatientName solamente.
Licencias de terminologías/visores/conectores y mantenimiento se evalúan antes de adopción.

## INT05 — Continuidad y capacidad
Cola durable/outbox/inbox, reintentos controlados, alertas de pendientes, checkpoints de versión y reconciliación.
Caída LIS/PACS/equipo: procedimiento asistencial/digital/manual aprobado, origen/actor/tiempo; recepción posterior no duplica orden/resultado/cargo.
Backup restaurado debe recuperar index, archivos, manifests, informes, permisos y pendientes; probar pixels recuperables con identidades correctas.
No inventar capacidad/TB/TAT/RPO/RTO. Medir modalidades, estudios, instancias, tamaños, crecimiento y concurrencia; distinguir transferencia, lectura y almacenamiento.
Contrato de soporte: versión/updates, exportación completa, recuperación, ownership, incidentes y salida proveedor.

## Conciliaciones de este grupo
- Órdenes aceptadas vs ejecutadas/canceladas/pendientes.
- Muestras/alícuotas enviadas vs recibidas/rechazadas/extraviadas/dispuestas.
- Resultados/informes autorizados vs entregados/revisados/corregidos.
- Estudios/instancias esperadas vs custodia/recuperación, según manifest/protocolo.
- Prestaciones/insumos vs cargos/costos/asientos.
Cada diferencia tiene dueño y fecha; no “limpiar” cola descartando eventos.

