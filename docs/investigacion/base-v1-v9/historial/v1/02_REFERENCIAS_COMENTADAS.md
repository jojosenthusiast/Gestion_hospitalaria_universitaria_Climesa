# Referencias comentadas: qué aprender y qué no asumir

## Método
Búsquedas ES/EN y PT, priorizando propietarios de estándares, organismos públicos, documentación oficial, repositorios oficiales y publicaciones académicas. Se descartó como evidencia principal el marketing de terceros, tutoriales de CRUD, listas de productos sin trazabilidad y copias no oficiales de normas. La traducción facilita lectura, pero los nombres de códigos, estados normativos y versiones deben conservar su forma original.

No se auditó el código completo de ninguna plataforma externa, no se ejecutaron sus demos ni se probaron integraciones. La comparación es de capacidades documentadas, no un ranking de calidad. El catálogo diferencia lectura de contenido, resultado indexado y recuperación incompleta.

## Sistemas hospitalarios y componentes
| Referencia | Uso en esta investigación | Limitación de transferencia |
|---|---|---|
| Bahmni [S01–S04] | Observar integración clínica, laboratorio, inventario y facturación; preparar prueba de concepto del circuito medicamento/cargo | Documentación de ERP depende de edición y antigüedad; confirmar stack realmente soportado |
| OpenMRS [S05–S06] | Núcleo clínico configurable, vocabularios, formularios e interfaces | No asumir contabilidad hospitalaria completa por tener EMR |
| OpenEMR [S07–S08] | Agenda, expediente y facturación; revisar APIs y roles | Cobertura ambulatoria/fiscal extranjera no demuestra aptitud para hospitalización local |
| GNU Health [S09–S10] | Referencia modular de hospital, archivos históricos, finanzas, enfermería y especialidades | Validar alcance de cada paquete y adaptación institucional |
| Frappe Healthcare [S11–S12] | Relación entre atenciones y operación ERP | Documentación v13 no garantiza comportamiento actual; fijar versión |
| Open Hospital [S13–S14] | Procesos básicos y manual de usuario orientado a recursos limitados | No equiparar accesibilidad del proyecto a validación para alta complejidad |
| HospitalRun [S15] | Estudiar decisiones de trabajo sin conexión | Documentación/demos referidas a beta; investigar mantenimiento antes de usar |
| OpenELIS Global [S16] | Especialización de laboratorio y su ecosistema | Verificar interfaces, dispositivos y flujo local de validación |
| Orthanc [S17] y OHIF [S18] | Separar almacenamiento/intercambio DICOM de visualización | No sustituyen automáticamente un RIS ni un proceso de informe firmado |
| Epic [S19] | Referencia de acceso, referencias, autorizaciones y ciclo de ingresos | Página pública de proveedor; no se dispone de manuales internos ni fuente |
| Oracle Health [S20] | Relación entre operación clínica y financiera | Capacidades anunciadas requieren demostración contractual |
| MEDITECH [S21–S22] | Comparar atención aguda y continuidad financiera hasta el cobro | Casos del fabricante no son evidencia independiente de rendimiento |
| TrakCare [S23] | Referencia de expediente y gestión institucional integrada | Evaluar flujos reales y exportaciones mediante demo autorizada |
| Tasy/Bionexo [S24] | Perspectiva latinoamericana sobre clínica, suministros y ciclo financiero | TISS/ANS y reglas brasileñas no se importan a El Salvador |
| AGHU/HU Brasil [S25] | Modelo institucional de red hospitalaria de gran escala | Contexto universitario/público brasileño; acceso y reutilización sujetos a condiciones |
| DHIS2 [S26] | Reportes longitudinales y agregados en red | No reemplaza el libro contable ni todos los circuitos intrahospitalarios |
| OpenHIE/OpenHIM [S27–S29] | Identidad compartida y capa de integración | Son arquitectura/componentes, no hospital completo instalado |

La combinación más prometedora para investigar es un núcleo propio o adaptable con componentes especializados. No copiar ciegamente módulos ni conectar plataformas antes de acordar responsabilidades y consistencia de datos.

## Estándares y guías
FHIR [S30–S32] distingue solicitudes, eventos y definiciones de flujo, y proporciona AuditEvent/Provenance. Aplicación candidata: guardar qué se pidió, qué se hizo y cuál fue su origen. Implementar esos recursos no certifica seguridad ni define por sí mismo el proceso del hospital.

IHE [S33] aporta perfiles de integración. Evaluar identidad (PIX/PDQ o equivalentes FHIR), documentos y auditoría según los sistemas participantes; no desplegar todos los perfiles indiscriminadamente. DICOM [S34] cubre intercambio de imagen; openEHR [S35] ofrece una vía de modelos clínicos gobernados. La decisión de usar un repositorio openEHR requiere una prueba de mantenimiento de plantillas, consultas y edición clínica.

LOINC/UCUM [S36] orientan códigos y unidades. SNOMED CT [S37] requiere comprobar licencia, territorio y uso. ICD debe elegirse por reportes y regulación local, no como sustituto de toda la semántica clínica.

OMS DIIG [S38] apoya planificación y costos; SMART/DAK [S39–S40] inspira especificaciones con personas, escenarios, datos y decisiones. OPS IS4H [S41] aporta evaluación de madurez. No son listas mágicas de módulos; sirven para planificar con evidencia y responsables.

SAFER [S42] orienta identificación, resultados y contingencia. NIST [S43] ayuda a estructurar riesgo institucional; OWASP ASVS [S44] aporta requisitos verificables de aplicación. GS1 [S45] sirve para estudiar identificación de producto/lote y escaneo. Checklist quirúrgico OMS [S46] y manual de calidad de laboratorio [S47] son referencias de proceso, no autorizaciones para automatizar decisiones clínicas.

## Literatura: lectura crítica y consecuencia propuesta
- Raut et al., 2017, DOI 10.14236/jhi.v24i2.862 [S48]. Caso de implementación de Bahmni en Nepal. Ilustra despliegue gradual, capacitación y restricciones de infraestructura. Propuesta para Aldara: piloto por circuitos completos y medición de carga de documentación. Un caso de hospital distrital no prueba escalabilidad nacional del producto.
- Huang et al., 2020, DOI 10.1055/s-0040-1718535 [S49]. Analiza transiciones EHR y mitigaciones. Propuesta: inventario, reconciliación, responsables y seguimiento del cambio, no solo ETL. Sus recomendaciones no fijan los umbrales locales de aceptación.
- Poissant et al., 2005 [S51]. Revisión de tiempo de documentación. Propuesta: medir tiempos y clics por rol antes/después; no prometer productividad porque se digitalizó. La antigüedad impide extrapolar números a interfaces actuales.
- Poon et al., 2010, DOI 10.1056/NEJMsa0907115 [S52]. Estudio cuasiexperimental de bar-code eMAR. Encontró reducción de errores sin eliminarlos. Propuesta: estudiar escaneo y excepciones, incluyendo equipo, disponibilidad y atajos peligrosos; no asignar al hospital un porcentaje de mejora ajeno.
- Sittig y Singh, 2010, DOI 10.1136/qshc.2010.042085 [S53]. Marco sociotécnico. Propuesta: revisar conjuntamente personas, procesos, interfaz y organización. Es un marco conceptual, no una prueba de eficacia de Aldara.
- Revisión de transición EHR, 2023 [S54]. Se localizó el registro indexado, pero el texto completo quedó bloqueado. No se extrajeron conclusiones específicas de resultados; queda en cola de lectura.

## Fuentes salvadoreñas
Norma técnica del expediente clínico MINSAL [S55]: localizada en repositorio oficial; el PDF no pudo recuperarse íntegramente. Falta lectura artículo por artículo, alcance en hospital privado, reforma aplicable y plazos. No se fijaron plazos de conservación basados en snippets.

Ley de protección de datos y reforma de septiembre de 2026 [S56–S58]: el catálogo legislativo identifica la reforma y artículos afectados. Falta consolidar texto promulgado y verificar obligaciones del hospital. No usar un proyecto de ley como si fuera ley definitiva.

Hacienda [S59–S60]: se localizaron manual y guía oficiales de DTE; hubo fallas de recuperación completa. Son una pista de integración, no base suficiente para codificar endpoints, esquemas, plazos o tratamiento tributario de cada servicio. Obtener documentación vigente y entorno de pruebas antes de implementar.

## Qué investigar adicionalmente
Banco de sangre y hemovigilancia; CEYE/esterilización; oncología y preparación estéril; UCI y dispositivos; patologías especiales; farmacia controlada; gestión de talento/credenciales; ingeniería biomédica; aseguradoras concretas; reglamentos de SRS/CSSP; contratos de alojamiento; accesibilidad; interoperabilidad nacional disponible. Añadir casos internacionales como VistA y redes españolas tras verificar documentación oficial y pertinencia. Estos son pendientes, no sistemas evaluados.
