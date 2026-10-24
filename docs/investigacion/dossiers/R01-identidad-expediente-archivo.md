# R01. Identidad, expediente y archivo

**Versión:** 1 (2026-10-13). **Alimenta:** spec 001 (identidad), 003 (documentos clínicos), 005 (auditoría, retención y derechos).

## 1. Conclusión

La base V3/V8 es correcta en lo esencial: ID interno estable, identificadores con emisor, nada de datos inventados, merge supervisado con manifiesto, corrección por versión y no por sobrescritura. Esta revisión le agrega tres cosas que no tenía: el texto completo de la Norma técnica del expediente clínico leído artículo por artículo, la convención legal salvadoreña de nombres y apellidos, y evidencia empírica sobre duplicados y búsqueda en apellidos hispanos. De ahí salen seis requisitos nuevos para la spec 001 (sección 8).

## 2. Qué se conserva de V1-V9 y P01

| Origen | Contenido | Veredicto | Razón |
|---|---|---|---|
| V3 D301 | ID interno inmutable, independiente de MRN y documento | Se conserva | Coincide con HL7 Patient (id de recurso vs identificador) y SAFER 2.1 |
| V3 D302 | Datos originales y claves de búsqueda separados | Se conserva | Necesario para búsqueda fonética sin alterar el nombre legal |
| V3 D303 | No auto-fusionar | Se conserva | Pew 2018: hasta 18% de duplicados promedio, pero fusiones erróneas producen overlays peores |
| V3 D304 | Merge no transfiere deudas ni DTE | Se conserva | Separación identidad/finanzas, pasa a spec 006 |
| V3 D306 | IsActive no sustituye fallecido ni cierre | Se conserva | SAFER 2.6 pide marca explícita de fallecido |
| V3 ID01-ID06 | Flujos buscar, desconocido, recién nacido, duplicado, representación, rectificación | Se conserva | Base de FR-001 a FR-036 de spec 001 |
| V3 AC301-AC314 | Criterios de aceptación | Se conserva | Trazados en spec 001 y 005 |
| V8 CMP04 | Rectificación demográfica, cambio clínico y discrepancia papel/digital son rutas distintas | Se conserva | Coincide con Norma Art. 42 reformado |
| V8 DOC02 | Documento escaneado con procedencia; OCR no confirma dato ni firma | Se conserva | Pasa a spec 004 |
| V8 DOC03 | Tabla de conservación por serie, sin plazo único supuesto | Se ajusta | La Norma 1616 sí fija plazos para expediente (5+5, fallecidos 5/10, auxiliares 1 año); la tabla por serie sigue siendo necesaria para el resto |
| V2 [V2-03] y V8 CMP04 | Decreto 659 pendiente de lectura | Se cierra | Leído en texto consolidado: derogó Art. 15 y 17 (delegado), Art. 16 y 18 mantienen recepción y trámite de solicitudes, Art. 20 (20 días hábiles) y 25 (72 h) intactos |
| V3 S316 | Norma 1616 "recuperación completa falló" | Se cierra | Leída completa (sección 4) |
| V3 S314 | Rediseño de búsqueda, resumen parcial | Se mantiene pendiente | No reabierto; no se cita como evidencia de mejora |

## 3. Qué se descarta o corrige

| Origen | Afirmación | Corrección |
|---|---|---|
| V3 ID02 | "Cama/sala no son identificadores" basado solo en Joint Commission | Correcto, pero la base local es más fuerte: OMS Solución 2 (2007) y SAFER 1.4/2.1; ninguna de las tres obliga en El Salvador, se usan como buena práctica |
| V3 plan de identidad | Estructura de nombre libre | Se reemplaza por la estructura legal salvadoreña (sección 4.3); un solo campo "apellidos" repite el error de la Utah Population Database (sección 6) |
| Propuesta propia previa (spec 001 v0) | Delegado de datos como responsable | Corregido por Decreto 659: responsable interno de solicitudes, no delegado obligatorio |
| Doc "Base investigativa" | "Ley de Datos Art. 15-17 delegado" | Corregido el 2026-10-12 |

## 4. Marco legal salvadoreño verificado

### 4.1 Norma técnica del expediente clínico (Acuerdo 1616 de 2024, reformado por Acuerdo 698 de 2026)

Leída completa en la versión con reforma publicada por MINSAL. Aplica a prestadores públicos y privados del SNIS (Art. 2).

| Artículo | Contenido | Consecuencia en el sistema |
|---|---|---|
| 10 | Área responsable de crear expedientes; recién nacido de parto hospitalario recibe expediente automáticamente | Registro de nacimientos crea identidad del neonato (spec 001 FR-021) |
| 11 | Número único por paciente; estructura definida por el establecimiento | MRN propio con formato configurable (FR-006) |
| 12 | Inventario de expedientes para evitar duplicados | Monitoreo de duplicados como obligación, no extra (FR nuevo 041) |
| 13 | Expediente permanente por persona, papel o electrónico, con autenticidad, integridad y conservación | Versionado y hash de documentos (spec 003) |
| 14 | Sin sistema: papel y luego digitar con número coincidente; identidad por CUN/NUI, partida, carné de minoridad, DUI (mayores de 18) o pasaporte (extranjeros); sin documento se registra versión del paciente o responsable; prohibidos duplicados; expedientes temporales para referencias | Tipos de identificador y expediente provisional (FR-008, FR-014); número de papel como identificador legado (FR-007) |
| 15 | Hoja de identificación: número, datos del paciente, familiares o responsable, informante, observaciones, responsable de la toma, fecha y hora | Campos "informante" y "responsable de la toma" en el registro (FR nuevo 039) |
| 16-17 | Contenido ambulatorio y hospitalario; datos generados por atención | Plantillas obligatorias (spec 003) |
| 21 | Certificación de copias firmada y sellada por dirección o delegado; cada folio sellado | Exportación certificada (spec 005) |
| 22 | Condiciones físicas del archivo (activos, pasivos, fallecidos separados) | Ubicación física del expediente en papel durante coexistencia (spec 004) |
| 23 a.4 | Firma electrónica simple asignada a cada profesional | Firma por usuario identificado (spec 003) |
| 24 | Préstamos por solicitud escrita; investigación con aval de Comité de Ética | Préstamo de expediente físico con bitácora (spec 004) |
| 26-27 | Daño o extravío: notificación inmediata, verificación en 15 días hábiles, reconstrucción o acta | Caso de incidente documental (spec 005) |
| 29-31 | Solo archivo archiva y desarchiva; devolución máxima 48 h; registro de movimientos | Control de préstamos con vencimiento (spec 004) |
| 32 | Solicitudes judiciales formales con copias certificadas y digitales encriptadas | Exportación cifrada con constancia (spec 005) |
| 34 | Revisión anual; 5 años sin movimiento pasa a pasivo por 5 más; 10 años total; eliminación con acta e inventario | Reloj de retención por expediente (spec 005) |
| 35 | Fallecidos: 5 años causa natural, 10 años violencia, accidente o investigación | Causa de muerte categorizada para retención (FR-035 ajustado) |
| 37 | Documentos auxiliares (agendas, censos, registros diarios) 1 año | Serie documental separada |
| 41 (reformado) | Copia, resumen o exportación digital a titular o representante; familiares hasta 4.º grado de consanguinidad y 2.º de afinidad para fallecidos | Solicitudes de acceso con verificación de parentesco (spec 005) |
| 42 (reformado) | Rectificación por quien brindó la atención o delegado idóneo; registro electrónico automático de fecha, hora, usuario y detalle; discrepancias papel/electrónico las resuelve comité | Historial de versiones con diff (FR-023); caso de discrepancia papel-digital (spec 004) |
| 43 | Supresión solo si los datos no son necesarios para la atención | Supresión como caso revisado, nunca botón (spec 005) |
| 44-65 | Seguridad: análisis de riesgos, identificación y autenticación inequívoca (53), respaldo diario externo (48), sin datos reales en pruebas (50), bitácoras 2 años con revisión mensual (55-56), auditoría cada 2 años (57), cifrado en transferencias (61), exportaciones certificadas (64), contrato con terceros (65) | Constitución sección 4 y spec 000/005 |
| 66 | Eliminación de soportes por destrucción o borrado seguro con acta | Disposición final con acta (spec 005) |
| 70 | Firma electrónica simple mientras no haya certificada | Firma simple v1; certificada como mejora (sección 4.4) |

Fuente: [Norma técnica del expediente clínico, versión con reforma](https://asp.salud.gob.sv/regulacion/pdf/norma/normatecnicadelexpedienteclinico-Acuerdo-Ejecutivo-1616-30052024_v1-reforma1.pdf) (leída).

### 4.2 Ley de Deberes y Derechos de los Pacientes (Decreto 307 de 2016)

| Artículo | Contenido | Consecuencia |
|---|---|---|
| 13 a | El paciente recibe nombre completo y número de registro en la Junta de Vigilancia del profesional | El perfil del profesional guarda número JVPM/JVPE (spec RRHH); documentos muestran autor con registro |
| 14 | Informe escrito de alta; en servicios privados incluye detalle de costos y facturación | Informe de alta une spec 003 y 006 |
| 20 | Confidencialidad del expediente | Mínimo privilegio y auditoría |
| 21 | Sugerencias, quejas y reclamos con respuesta escrita; prioridades y plazos por reglamento | Módulo de quejas (R21) |
| 29 | En servicios privados, los costos hospitalarios corren desde el ingreso hasta que el facultativo firma el alta | La estancia deja de cargarse al firmarse el alta médica, no a la salida física (spec 002 y 006) |
| 33 d | Custodiar los expedientes | Custodia y préstamos |
| 42 g | Dañar, alterar o retirar hojas del expediente es infracción grave | Inmutabilidad de versiones |
| 44 f | No foliar las hojas agregadas es infracción leve | Numeración de folios en papel durante coexistencia y en exportación certificada |

Fuente: [LDDPPSS, CSSP](https://local.cssp.gob.sv/wp-content/uploads/2019/06/LDDPPSS.pdf) (leída en los artículos citados).

### 4.3 Ley del Nombre de la Persona Natural (Decreto 450 de 1990)

- Art. 14: hijos de matrimonio o reconocidos llevan el primer apellido del padre seguido del primer apellido de la madre.
- Art. 21: la mujer casada puede seguir usando sus apellidos o agregar a continuación de su primer apellido el primero del cónyuge, con o sin la partícula "de"; la opción consta en la partida y se cancela por divorcio o nulidad.
- La Sala de lo Constitucional (Inc. 45-2012, 2015) declaró que no existe la inconstitucionalidad alegada contra los Art. 14 y 21; siguen vigentes.

Consecuencia: el modelo de nombre necesita nombre(s), primer apellido, segundo apellido y apellido de casada opcional con su partícula, y la búsqueda debe encontrar "Ana López de Pérez", "Ana López Martínez" y "Ana Pérez" como la misma persona candidata. Fuente: [sentencia Inc. 45-2012](https://www.jurisprudencia.gob.sv/DocumentosBoveda/D/1/2010-2019/2015/07/B3C56.PDF) (leída; cita textual de los artículos 14 y 21). Texto íntegro de la ley: pendiente.

### 4.4 Identificadores oficiales

| Identificador | Emisor | Hallazgo | Estado |
|---|---|---|---|
| DUI | RNPN | 8 dígitos y dígito verificador con pesos 9 a 2, módulo 10 ([implementación de referencia](https://gist.github.com/3609421)) | Leída |
| DUI como NIT | MH | Desde el 17-dic-2021 el DUI vale como NIT para personas naturales ([idsv](https://github.com/avalon-tech/idsv-php)) | Leída (fuente secundaria; confirmar con MH) |
| NUI | RNPN | Número asignado desde el nacimiento por reforma de 2022; carné sin foto de 0 a 4 años, renovación cada 4 años hasta los 16 ([El Mundo](https://diario.elmundo.sv/politica/rnpn-genero-mas-de-20-mil-numeros-de-identidad-a-recien-nacidos-en-el-periodo-2024-2025)) | Leída; formato pendiente |
| Partida de nacimiento | Registro del Estado Familiar de la alcaldía | Identificada por alcaldía, libro, folio y número de asiento | Heredada de práctica registral; confirmar campos con archivo de CLIMESA |
| Carné de minoridad | Alcaldía | Sin estructura pública confirmada | Pendiente |

### 4.5 Firma electrónica

La Unidad de Firma Electrónica del MINEC lista tres proveedores acreditados de servicios de certificación: Uanataca El Salvador, Productive Business Solutions y Banco Central de Reserva ([MINEC](https://firmaelectronica.economia.gob.sv/proveedores-servicios-certificados/), leída). Con la Norma Art. 70, la v1 usa firma electrónica simple por usuario autenticado con MFA y deja la firma certificada como integración posterior para documentos que la Junta decida (consentimientos, certificaciones).

### 4.6 Protección de datos (Decreto 144 de 2024, reformado por Decreto 659 de 2026)

Texto consolidado leído: Art. 15 y 17 derogados; Art. 16 obliga a recibir, tramitar y establecer lineamientos internos; Art. 18 regula la solicitud; Art. 20 mantiene 20 días hábiles prorrogables; Art. 25 mantiene 72 horas para notificar brechas. Fuente: [texto consolidado](https://www.jurisprudencia.gob.sv/DocumentosBoveda/D/2/2020-2029/2024/11/10660E.PDF).

## 5. Estándares y guías

| Fuente | Qué aporta | Uso |
|---|---|---|
| [SAFER Guide 6, Patient Identification (ONC, ago-2024)](https://healthit.gov/wp-content/uploads/2025/01/Safer-Guide-6.-Patient-Identification-Final.pdf) | 16 prácticas: buscar antes de crear (1.1), distinguir nombres similares (1.2), identificadores consistentes en pantalla (1.3), identificadores y código en brazalete (1.4), **dígito verificador en el MRN (1.5)**, alerta de posibles duplicados (1.6), IDs temporales únicos (2.2), escaneo de brazalete (2.3), biometría (2.4), **foto del paciente (2.5)**, **marca clara de fallecido (2.6)**, monitoreo de errores de identificación (3.1) y de duplicados y overlays (3.2) | Checklist de spec 001 y 002 |
| [OMS, Soluciones para la seguridad del paciente, Solución 2 (2007)](https://mri.alexu.edu.eg/images/patiden.pdf) | Dos identificadores, nunca número de habitación; protocolos para pacientes sin identificación o con nombres iguales; etiquetar muestras frente al paciente; chequeos repetidos para que la automatización no multiplique un error | Principio rector, aplicable a todo entorno |
| [Joint Commission R3 Report 17 (2018)](https://www.jointcommission.org:443/-/media/tjc/documents/standards/r3-reports/r3_17_newborn_identification_6_22_18_final.pdf) | Nombre temporal distintivo del recién nacido: nombre y apellido de la madre más sexo ("Smith, Judy Girl"), sufijo A/B para múltiples; alertas visuales | Convención de nombre temporal neonatal (FR nuevo 040) |
| [HL7 FHIR Patient $merge](https://build.fhir.org/patient-operation-merge.html) | Fuente `replaced-by` e inactiva, destino `replaces`, todas las referencias se re-apuntan, Provenance para permitir un-merge, modo preview, procesamiento asíncrono con Task | Valida el diseño de manifiesto y la fase `reconciling`; agregar "preview" (FR nuevo 042). Estado: build CI, madurez 0 |
| [HL7 FHIR Patient R4](https://hl7.org/fhir/R4/patient.html) | Id de recurso vs identificadores humanos | Heredada (V3 S301) |
| [IHE PMIR](https://profiles.ihe.net/ITI/PMIR/volume-1.html) | Propagación de altas, cambios y fusiones a consumidores | Heredada (V3 S304); modelo de acuses |
| [openEHR RM common](https://specifications.openehr.org/releases/RM/latest/common.html) | AUDIT_DETAILS (committer, time, change_type) y ATTESTATION (firma sobre contenido, motivo, vista atestada) | Modelo de versionado y firma para spec 003; lectura parcial |

## 6. Evidencia empírica

| Estudio | Hallazgo | Implicación |
|---|---|---|
| [Pew Charitable Trusts, 2018](https://www.pew.org/en/research-and-analysis/reports/2018/10/02/enhanced-patient-matching-critical-to-achieving-full-promise-of-digital-health-records) | Duplicados promedio 18% (Black Book 2018); tasas de creación medidas 0.77% a 6%; 4% de duplicados confirmados afectaron la atención; costo de $96 por registro duplicado (Children's Dallas); estandarizar dirección y apellido mejora el emparejamiento | Medir tasa de creación de duplicados desde el día 1; estandarizar dirección salvadoreña (departamento, municipio, distrito) |
| [Fraser et al., IJPDS 2018](https://ijpds.org/index.php/ijpds/article/view/764) | En registros hispanos, guardar apellidos concatenados ("MARTINEZCRUZ") impide emparejar; usar arreglos de nombres y frecuencias de nombres hispanos subió el enlace completo de 82.6% a 94.7%, con más falsos enlaces | Apellidos en campos separados, búsqueda por arreglo de tokens, pesos por frecuencia de apellido local, medir falsos positivos |
| [Angeles y Bailón-Miguel, 2016](https://www.scitepress.org/Papers/2016/62277/) | Comparación de codificaciones fonéticas para español; un algoritmo "Phonetic Spanish" fue el mejor la mayoría de las veces | Soundex y Metaphone en inglés no sirven; usar clave fonética española y calibrar |
| [Joffe et al., 2012](https://pubmed.ncbi.nlm.nih.gov/23304405/) | Duplicados asociados a resultados anormales sin seguimiento (OR 1.44) | Heredada (V3 S313); duplicados son riesgo clínico, no solo administrativo |
| [AHIMA, 2016](https://www.healthcareitnews.com/news/ahima-patient-matching-problems-plague-healthcare-pose-safety-risk) | 73% de profesionales de información de salud manejan duplicados cada semana; menos de la mitad tiene control de calidad en el registro | El control de calidad en el registro es parte del proceso, no del sistema solamente |
| [Splink (Ministerio de Justicia, Reino Unido)](https://www.gov.uk/government/publications/joined-up-data-in-government-the-future-of-data-linking-methods/splink-mojs-open-source-library-for-probabilistic-record-linkage-at-scale) | Fellegi-Sunter con EM, hasta 15 M de registros en menos de una hora, explicación por par | Herramienta para la carga masiva y calibración de spec 004 (Python, fuera del runtime .NET) |

## 7. Sistemas de referencia

| Sistema | Comportamiento relevante | Toma |
|---|---|---|
| OpenMRS (`PatientService`, V3 S306) | Merge con auditoría de elementos movidos | Manifiesto por elemento |
| GNU Health (V3 S307/S308) | Persona separada de paciente; neonato con identificador propio | Persona como entidad, paciente como rol |
| FHIR $merge | Preview, Task asíncrono, Provenance | Preview y estado asíncrono |

## 8. Cambios que provoca en la spec 001

| Nuevo requisito | Fuente | Contenido |
|---|---|---|
| FR-039 | Norma Art. 15 | Registrar informante (paciente, familiar, responsable) y usuario que tomó los datos, con fecha y hora |
| FR-040 | Joint Commission R3 17; OMS Sol. 2 | Nombre temporal del recién nacido: apellido(s) y nombre de la madre + sexo + sufijo A/B en múltiples, reemplazable por nombre oficial con historial |
| FR-041 | Norma Art. 12; SAFER 3.1, 3.2; Pew | Indicadores de identidad: tasa de creación de duplicados, casos abiertos por antigüedad, overlays, identidades provisionales sin resolver, merges revertidos |
| FR-042 | FHIR $merge | Vista previa del merge que muestra el impacto (registros y consumidores afectados) sin aplicar cambios |
| FR-043 | SAFER 1.5 | MRN con dígito verificador (algoritmo Luhn o ISO 7064 mod 11-2, decisión en plan) |
| FR-044 | SAFER 1.2, 2.5 | Alerta de nombre similar entre pacientes con episodios activos simultáneos; foto opcional con consentimiento, visible en identidad |
| Ajuste FR-018 | Ley del Nombre Art. 14 y 21 | Apellido de casada con partícula "de" opcional; búsqueda por cualquier combinación de primer apellido, segundo apellido y apellido de casada |
| Ajuste FR-035 | Norma Art. 35 | Fallecido registra categoría de causa para retención (natural, violenta o accidental, en investigación) sin diagnóstico |
| Ajuste FR-020 | Pew; Ley Especial para la Reestructuración Municipal | Dirección estructurada por departamento, municipio y distrito más texto libre. Desde el 1-may-2024 hay 44 municipios y 262 distritos; los antiguos municipios pasaron a ser distritos (Santa Ana Centro = distrito Santa Ana; Santa Ana Oeste incluye Chalchuapa, El Porvenir, Candelaria de la Frontera, entre otros) ([El Mundo](https://diario.elmundo.sv/politica/los-44-municipios-y-los-262-distritos-de-el-salvador-segun-la-ley-de-reestructuracion-municipal)). Catálogo territorial versionado: una dirección anterior a 2024 se guarda con su municipio original y se mapea a distrito sin perder el dato escrito |

## 9. Pendientes para CLIMESA (INS05)

1. Formato actual del número de expediente en papel y si se quiere mantener como MRN visible.
2. Qué documentos acepta admisión hoy y cómo registran a pacientes sin documento.
3. Convención actual para nombrar recién nacidos y gemelos.
4. Quién decide fusiones y correcciones hoy; si existe comité de expediente.
5. Si existe registro de préstamos del archivo físico y tiempos reales de devolución.
6. Uso de fotos de pacientes: aceptación institucional y consentimiento.

## 10. Búsquedas realizadas

SAFER Guides 2025; Pew patient matching 2018; Joint Commission distinct newborn naming; record linkage hispanic compound surnames; Spanish phonetic encoding record linkage; FHIR Patient $merge; Ley del Nombre de la Persona Natural; firma electrónica proveedores acreditados MINEC; RNPN NUI; openEHR change control; OMS patient identification 2007; Splink.
