# Arquitectura candidata y decisiones por comprobar

## Tres alternativas reales
| Alternativa | Ventaja posible | Costo/riesgo | Evidencia para elegir |
|---|---|---|---|
| Evolucionar Aldara | Conservar stack y conocimiento, control de procesos locales | Rediseño clínico, deuda y responsabilidad operativa propias | Probar identidad, medicamento, cama, cuenta/contabilidad y migración |
| Adaptar plataforma consolidada | Reutilizar modelos, flujos y comunidad | Configuración, localización, licencia, actualizaciones e integración | Ejecutar los mismos escenarios y medir brechas/costo total |
| Híbrida | Núcleo local e integración LIS/PACS/ERP especializada | Identidad, estados y reconciliación entre sistemas | Demostrar contratos, reintentos, operación degradada y exportación |

Recomendación provisional: evolución modular o híbrida. No se ha medido una comparación suficiente para descartar adaptación. No cambiar SQL Server por moda ni introducir microservicios como requisito de escala nacional. Escala exige requisitos de carga, aislamiento, disponibilidad, soberanía y operación que aún no están cuantificados.

## Límites funcionales propuestos
Identidad/archivo; acceso/ADT; expediente/órdenes; enfermería; medicamento; laboratorio; imagen; cirugía; suministros; ingresos/seguros; contabilidad/tesorería; personas/activos; calidad/analítica; integración; seguridad/auditoría. Pueden comenzar dentro de un monolito modular, con esquemas/responsabilidades explícitos y sin escrituras arbitrarias entre módulos.

Entidad central clínica: paciente con identificadores múltiples, episodio, encuentro, ubicación histórica, equipo asistencial, orden, tarea, ejecución, resultado/documento, consentimiento y versión. Entidad central financiera: responsable de pago, contrato, cargo, cuenta por episodio, factura, anticipo, pago, reclamación, ajuste, asiento y conciliación. No usar PatientId como único enlace de toda operación: no distingue episodio, fuente ni responsabilidad financiera.

## Contratos y consistencia
Una acción clínica relevante conserva un identificador de negocio y versión. El cargo referencia la ejecución o fundamento contractual, con regla/tarifa versionada. Cada sistema declara su fuente de verdad: HIS para episodio; LIS para análisis validado; PACS para objetos de imagen; ERP/mayor para asiento contabilizado, según la arquitectura elegida.

Propuesta técnica: cambios locales críticos dentro de transacción ACID; publicación fiable mediante outbox; consumidores idempotentes con identificador único; reintentos acotados y cola de errores; panel de reconciliación. No prometer exactamente una entrega en toda la red. Separar instante del evento, captura, recepción y procesamiento. No hay una transacción distribuida gratuita entre LIS, caja y ERP.

Cama, reserva y saldo necesitan invariantes verificadas en persistencia. Para SQL Server, evaluar bloqueo adecuado/aislamiento y restricciones con pruebas reales; RowVersion detecta actualizaciones concurrentes, pero no resuelve por sí sola todas las carreras entre filas o intervalos de agenda. Una validación previa en C# no sustituye la garantía.

## Interoperabilidad
FHIR [S30] sirve al intercambio; elegir versión/perfiles según receptores, no adoptar R5 automáticamente por la página consultada. Mapear Patient, Encounter, ServiceRequest, Observation, DiagnosticReport, MedicationRequest/Dispense/Administration, DocumentReference, AuditEvent y Provenance donde corresponda. Account/ChargeItem/Claim orientan intercambio financiero, sin reemplazar normas del mayor o DTE.

Para sistemas antiguos, investigar HL7 v2 ADT/ORM/ORU y protocolos de analizadores conforme a interfaces reales. DICOM/DICOMweb [S34] para imagen. Perfiles IHE [S33] cuando ambos extremos los soporten. OpenHIE [S27–S29] inspira registros compartidos y mediación en red. API REST propia sigue siendo válida donde no hay perfil interoperable aplicable, con documentación, versionado y autenticación.

openEHR [S35] es una opción distinta para persistencia/modelado clínico; puede coexistir con FHIR, pero introduce gobierno de arquetipos y experiencia operativa. No adoptarlo sin demostrar edición, consultas, versiones y exportación.

## Terminologías y configuración
Catálogos con código, sistema, edición, versión, vigencia, traducción y equivalencias aprobadas. Conservar código original durante migración; no inventar equivalencia por parecido textual. LOINC/UCUM [S36] para observaciones/unidades según caso; evaluar SNOMED CT y licencia [S37]; clasificaciones diagnósticas/procedimientos según obligaciones institucionales.

Tarifas, contratos, paquetes, cuentas y centros de costo deben estar versionados por vigencia. Diferenciar instante de atención y fecha económica/fiscal; retroactividad autorizada no modifica silenciosamente documentos históricos.

## Operación y escala
Conjunto inicial candidato: aplicación con réplicas cuando proceda, base con estrategia de alta disponibilidad y backups, almacenamiento documental protegido, integración, auditoría separada y analítica fuera de consultas transaccionales pesadas. El tamaño concreto necesita volumetría.

Para red: distinguir organización legal, establecimiento, departamento y ubicación. Decidir identidad compartida versus federada, acceso entre sedes, residencia/transferencia de datos y operación ante enlaces rotos. No replicar íntegramente todos los expedientes a cada equipo ni diseñar sincronización offline genérica sin resolución de conflictos.

Un hospital puede continuar en red local ante caída de internet, según infraestructura elegida, sin que eso garantice funcionamiento ante caída eléctrica o del servidor. Definir contingencia para cada dependencia.

## Registro de decisiones candidatas
| ADR | Propuesta | Prueba/revisión necesaria |
|---|---|---|
| 01 | Monolito modular inicial | Medir complejidad, equipos y requisitos de despliegue |
| 02 | Preservar stack .NET/SQL Server mientras se compara | LTS vigente, pruebas, costos y competencia del equipo |
| 03 | Separar episodio de paciente e identidad de documento | Desconocidos, menores, duplicados y fusión reversible |
| 04 | Medicamento en circuito cerrado | Escenarios con dispensación parcial, suspensión y omisión |
| 05 | Financiero con reglas versionadas y submayores | Conciliación completa con contador y aseguradoras |
| 06 | Integración durable e idempotente | Mensajes repetidos, fuera de orden y recuperación |
| 07 | Auditoría de acceso y procedencia documental | Consulta/exportación, investigación y evidencia de alteración |
| 08 | Migración por oleadas con coexistencia delimitada | Ensayo y rollback con reconciliación de cambios |
| 09 | Plataforma existente versus propia sin decisión final | Pruebas de concepto comparables y costo total |

No existe ADR aprobado ni selección contractual en este paquete.
