# Selección de plataforma basada en capacidades
## Opciones todavía abiertas
Evolucionar Aldara por dominios; reconstruir componentes cuyo modelo impida continuidad; adaptar un HIS; integrar núcleo propio con productos especializados.
No hay benchmark ni costo contractual suficiente para declarar ganador. El framework no resuelve por sí mismo autorización, trazabilidad clínica ni contabilidad.

## Sistemas de referencia y pruebas de selección
| Componente | Candidatos/referencias | Evidencia que debe exigirse |
|---|---|---|
| HIS/EMR abierto | Bahmni, GNU Health, OpenMRS, OpenEMR | Episodios reales, eMAR, trazabilidad, permisos, exportación, actualización/licencia y soporte |
| HIS cerrado | Epic, Oracle Health, MEDITECH, TrakCare, Tasy | Demostración contractual de escenarios; referencias locales; APIs/documentación; costos y salida |
| ERP | Odoo, ERPNext y ERP actual de CLIMESA si existe | Mayor, cierres, submayores, conciliación, compras, activos, nómina/localización validada |
| LIS | OpenELIS y proveedores compatibles con equipos reales | Órdenes/muestras, QC, resultados corregidos, crítico, conexión analizador y soporte |
| RIS/PACS | Orthanc y sistemas RIS/PACS especializados | Identidad, orden, accession, DICOM/conformance, informes, volumen y recuperación |
| Integración | Motor/adaptadores con HL7/FHIR/DICOM según contraparte | ACK, orden, deduplicación, errores, colas y reconciliación |
| Documentos | Repositorio con versiones, firma, acceso y custodia | Exportación legible, retención, hash, vínculo a paciente y restauración |
| Operación | IAM, SIEM/observabilidad, backup, CMMS, BI | Responsabilidades, continuidad, auditoría y acceso mínimo |

La lista de candidatos no equivale a productos instalados ni aprobados. El catálogo v1 conserva referencias generales de estos productos; V2 profundiza el patrón financiero, no hace una auditoría integral de cada uno.
Bahmni documenta una integración con Odoo [V2-10, V2-11]; confirmar versión/distribución. No extrapolar funciones del Odoo actual a una integración histórica. Las aplicaciones de terceros que anuncian DTE no prueban certificación ni mantenimiento.

## Propiedad de datos candidata
HIS: identidad/episodio/orden/evidencia asistencial y origen de cargo.
Motor hospitalario financiero: tarifa/contrato/pagador/cuenta/reclamación.
ERP: mayor, proveedores, activos, cierre; decidir propiedad de stock y CxC para evitar dos autoridades.
Adaptador fiscal: transmisión/estado fiscal y artefactos firmados, con enlace al documento económico.
LIS/PACS: ejecución diagnóstica y resultados/imágenes, integrados al expediente.
No mantener la misma verdad editable en dos aplicaciones. Cada identificador externo exige mapa y organización emisora.

## Contrato de integración
Evento con eventId, aggregateId/version, entity/sede, source, occurredAt/recordedAt, schemaVersion, correlationId y mínimo payload.
Outbox en transacción local; receptor con inbox/idempotencia; orden por agregado cuando sea necesario; ACK, reintento y cola de error.
No prometer exactamente una entrega en toda la red. Diseñar entrega repetible con efecto único y reconciliación.
Separar evento clínico de financiero; fallo fiscal/ERP no debe destruir el evento asistencial. Registro de pendientes con dueño y antigüedad.
Seguridad: scopes y contexto, cifrado, cuentas de servicio, rotación, auditoría y mínimo dato; FHIR no concede acceso ni cumple regulación por sí mismo.

## Arquitectura candidata inicial
Monolito modular con contratos de dominio y adaptadores especializados puede reducir complejidad operativa mientras se prueba la carga. No elegir microservicios solo por aspiración nacional.
Separar lectura analítica del OLTP cuando evidencia de volumen lo justifique; mantener definiciones coherentes.
Sedes requieren modelo de entidad/ubicación/permisos y políticas; multitenencia depende de entidades legales reales, no del nombre de una sucursal.
Actualizar runtime con soporte y probar dependencias antes de salida; sin cambios de stack en esta investigación.

## Comparación sin demostraciones superficiales
Para cada alternativa usar el mismo paquete de escenarios: paciente desconocido que ingresa y luego se identifica; dispensación parcial con devolución; resultado corregido tras alta; anticipo y factura distribuida; aseguradora con glosa/remesa parcial; compra recibida parcialmente; cierre y ajuste tardío; caída fiscal y reenvío.
Comparar controles, pasos manuales, evidencia, exportación, recuperación, costo total y capacidad de soporte. Registrar versión/edición.
Ponderación se decide con hospital; seguridad/pérdida de evidencia son criterios de descarte. No asignar puntajes numéricos sin pruebas.

