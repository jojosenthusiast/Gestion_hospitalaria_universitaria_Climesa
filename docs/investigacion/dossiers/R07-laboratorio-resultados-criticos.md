# R07. Laboratorio y resultados críticos

**Versión:** 1 (2026-10-13). **Alimenta:** módulo de órdenes y resultados, integración LIS, flujo de resultados críticos, alta (R03, pendientes postalta).

## 1. Conclusión

V5-02 (LAB01-LAB07) y V5-04 (RES01-RES05) son de lo mejor del paquete: separan orden, muestra, corrida, validación, informe y comunicación, y no inventan umbrales. Se conservan. Lo nuevo:

- **La Norma técnica de laboratorios clínicos (Acuerdo 1855, 2023) da reglas concretas** que V5 no tenía abiertas: rechazo de muestra sin solicitud, bitácora diaria de recibidas y rechazadas, control de calidad con dos niveles y Westgard, prohibido reportar con QC sin resolver, crítico se reprocesa y se avisa con urgencia, resultados de emergencia, sala de operaciones y UCI en 2 horas, resultados guardados 5 años, muestras 24 horas.
- **Su ámbito es el SNIS** (incluye privados por definición de la Ley SNIS), pero el Art. 81 excluye a los laboratorios privados del programa obligatorio de evaluación externa. Hay que tratar la norma como aplicable a CLIMESA salvo ese artículo, y confirmarlo con su jefatura de laboratorio.
- **La norma no define lista de valores críticos ni exige read-back.** Eso lo pone el laboratorio en su protocolo; el sistema lo versiona.
- **La evidencia real sobre críticos** (un hospital con LIS y aviso telefónico, [Biochemia Medica 2019](https://www.biochemia-medica.com/en/journal/29/3/10.11613/BM.2019.030703)): mediana de 3 minutos para urgentes y 17 para rutina, 0.3% de avisos fallidos, pero solo 6 de 100 expedientes de emergencia mencionaban la llamada. El problema no es avisar, es que el aviso quede en el expediente y que alguien actúe. Eso es lo que el sistema tiene que cerrar.

## 2. Qué se conserva de V1-V9

| Origen | Contenido | Veredicto |
|---|---|---|
| V5 LAB01 | Orden con pregunta clínica, prioridad, solicitante habilitado; doble envío no duplica; orden externa no se firma en nombre del médico local | Se conserva |
| V5 LAB02 | Etiqueta en el punto de toma, ID de muestra distinto del de orden, nunca asignar por cama, reimpresión controlada | Se conserva |
| V5 LAB03 | Custodia en transporte; rechazo con motivo y pruebas afectadas; recolección crea muestra nueva vinculada | Se conserva; se agrega bitácora diaria (Art. 48) |
| V5 LAB04 | QC separado de paciente; mapeo de código de analizador; código desconocido retenido; QC fuera de control bloquea liberación | Se conserva; ahora con base legal (Art. 58-59) |
| V5 LAB05 | Validación técnica distinta de autorización; comparadores (<, >) conservados; rango de referencia y límite crítico versionados; versión y motivo en corrección | Se conserva |
| V5 LAB06 | Microbiología con informes parciales; reflex con autorización; derivación con laboratorio ejecutor; POCT con operador y dispositivo | Se conserva |
| V5 LAB07 | TAT por tramos, no un promedio; disposición no borra resultados | Se conserva; plazos legales en sección 4 |
| V5 RES01-RES05 | Responsable por cobertura y turno; intentos y acuse; escalamiento con umbral institucional; "OK" no cierra un crítico; corrección con reentrega; pendientes al alta | Se conservan íntegros |
| V5 L501-L525 | FHIR ServiceRequest, Specimen, DiagnosticReport, Observation; LOINC; UCUM; IHE PaLM; OMS LQMS; OpenELIS; Roy 2005 | Heredadas como estándares |

## 3. Qué se descarta o corrige

| Afirmación | Corrección |
|---|---|
| V5: "plazos de conservación por normativa, por confirmar" | Se cierra parcialmente: resultados 5 años para auditoría del laboratorio (Art. 75) y muestras de sangre y líquidos 24 h (Art. 76). El resultado dentro del expediente sigue la retención del expediente (R01), que es mayor |
| Suponer que la norma obliga evaluación externa a CLIMESA | Art. 81 excluye a laboratorios privados del PEEC obligatorio; participación voluntaria o internacional sigue siendo buena práctica |
| "Valores críticos según norma nacional" | La norma no trae lista. Lista institucional versionada, firmada por la jefatura de laboratorio y aprobada por dirección médica |
| Art. 101 (conectividad de equipos desde el día 1) como obligación de CLIMESA | Es para laboratorios MINSAL con SIS. Se adopta como **criterio de compra**: todo analizador nuevo con interfaz bidireccional desde la instalación |

## 4. Marco normativo verificado: [Norma técnica de laboratorios clínicos, Acuerdo 1855 (2023)](https://www.jurisprudencia.gob.sv/DocumentosBoveda/D/2/2020-2029/2023/09/FBDBC.PDF)

| Art. | Regla | Regla del sistema |
|---|---|---|
| 2 | Aplica al personal técnico y administrativo de laboratorios del SNIS | Aplicable a CLIMESA (confirmar) |
| 23, 29 | Derivar solo lo que excede la oferta propia, con coordinación previa; no derivar lo que se ofrece en horario salvo caso fortuito | Catálogo de pruebas con laboratorio ejecutor y horario; derivación de prueba propia exige motivo |
| 25, 51 | Resultados de muestras derivadas se recogen en 7 días hábiles salvo pruebas más largas; derivadas se registran | Pendiente externo con vencimiento configurable y alerta |
| 44 | Solicitud física o digital del médico; manuscrita legible y completa | Orden electrónica; orden en papel en contingencia se transcribe con imagen adjunta |
| 46-49 | Procedimientos de preparación, toma y transporte; criterios de aceptación y rechazo; bitácora diaria de recibidas y rechazadas; sin solicitud se rechaza | Recepción con motivo de rechazo codificado y reporte diario automático |
| 53 | Análisis por profesional inscrito en la Junta de Vigilancia | Privilegio de validación ligado a credencial vigente (R17) |
| 54 | Calibración o verificación antes de usar, periódicamente y tras reparación | Equipo con estado; resultado de equipo no verificado no se libera |
| 55-58 | QC interno al inicio de turno o según política; mínimo dos niveles; gráfico; análisis con reglas de Westgard; acciones correctivas documentadas | Registro de corridas de QC, gráfico Levey-Jennings, reglas configurables, acción correctiva obligatoria |
| 59 | No reportar resultados con fallas de QC sin resolver | Bloqueo duro de liberación por analito y equipo afectados |
| 63 | Resultado que pone en riesgo la vida: reprocesar para verificar y avisar con urgencia al médico tratante | Flujo de crítico (sección 6); repetición configurable por prueba porque retrasa el aviso |
| 64-66 | Registro claro, sin enmiendas; unidades y rangos; el resultado forma parte del expediente | Resultado inmutable con versiones; publicación al expediente |
| 69 | Emergencia, sala de operaciones y UCI o intermedios: resultado en 2 horas | TAT objetivo por origen; alerta antes del vencimiento |
| 67, 73 | Bitácora diaria de análisis y de exámenes no retirados por origen | Reportes diarios generados, no llenados a mano |
| 75 | Resultados conservados 5 años para auditoría | Mínimo; prevalece retención del expediente |
| 76 | Sangre y derivados, exudados, trasudados y lavados se guardan 24 h antes de descartar | Seroteca con ubicación y fecha de descarte calculada; la política puede ampliar |
| 81-83 | PEEC al menos una vez al año; privados excluidos | Módulo de evaluación externa opcional |

## 5. Estándares y sistemas de referencia

| Fuente | Aporte | Uso | Estado |
|---|---|---|---|
| HL7 v2 OML/ORU, FHIR R4/R5 ServiceRequest, Specimen, Observation, DiagnosticReport | Mensajes y recursos de orden y resultado | Contrato con LIS y, a futuro, con laboratorios de referencia | Heredada (V5 L501-L503) |
| LOINC | Código universal de prueba | Mapeo opcional del catálogo local; no bloquea arranque | Heredada |
| UCUM | Unidades | Unidad canónica por resultado numérico | Heredada |
| IHE PaLM (LTW, LAW) | Flujo orden-resultado y analizador-LIS | Patrón de integración | Heredada |
| CLSI LIS2-A2 / ASTM E1394 | Protocolo de analizadores más comunes | Lo maneja el middleware o LIS, no el HIS | Heredada |
| [CLSI GP47 (2015)](https://clsi.org/shop/standards/gp47/) | Distingue resultados de riesgo crítico y de riesgo significativo; tiempos de comunicación | Dos niveles de alerta en el modelo | Pendiente (de pago; solo resumen secundario) |
| [Biochemia Medica 2019, 29(3):030703](https://www.biochemia-medica.com/en/journal/29/3/10.11613/BM.2019.030703) | 5,601 críticos marcados; 74% notificados; mediana 3 min urgente y 17 min rutina; fallidos 0.3%; 26% no notificados por criterio del laboratorio; llamada rara vez anotada en expediente; escalamiento al 061 para ambulatorios | Diseño del cierre y la trazabilidad; política de sobrenotificación | Leída |
| OpenELIS Global, SENAITE | LIS de código abierto | Opción si CLIMESA no tiene LIS; evaluar antes de construir uno | Heredada (V5) |
| OMS LQMS | Sistema de gestión de calidad del laboratorio | Referencia de procesos | Heredada |

## 6. Decisión de arquitectura

El HIS **no construye un LIS completo** en la primera fase. El HIS es dueño de: orden, identidad de paciente y muestra, etiqueta, repositorio de resultados con versiones, publicación al expediente, flujo de críticos y pendientes postalta. El LIS (propio de CLIMESA, comercial u OpenELIS) es dueño de: hoja de trabajo, comunicación con analizadores, QC y validación técnica. Si CLIMESA no tiene LIS, la decisión entre adoptar OpenELIS e integrarlo o construir un LIS mínimo se toma con su inventario de analizadores (pendiente 2).

## 7. Requisitos derivados

1. Orden con prioridad (rutina, urgente, emergencia), origen (consulta, emergencia, hospitalización, sala de operaciones, UCI) y TAT objetivo por origen; el de Art. 69 como valor por defecto para emergencia, sala de operaciones y UCI.
2. Muestra con ID propio, impreso en el punto de toma, vinculada a orden; tomador y hora real.
3. Recepción con aceptación o rechazo codificado; bitácora diaria automática (Art. 48).
4. Resultado con valor, comparador, unidad UCUM, rango de referencia versionado, método, equipo, validador con credencial vigente, estado (preliminar, final, corregido, anulado).
5. Bloqueo de liberación por QC no resuelto, recibido como estado desde el LIS (Art. 59).
6. Lista de valores críticos versionada, con dos niveles (crítico y significativo) y regla de repetición por prueba.
7. Crítico: evento con resultado, paciente, responsable resuelto por cobertura y turno, canal, intentos, receptor identificado, read-back registrado cuando la política lo exija, hora de cada paso; escalamiento con umbral configurable; el aviso queda **automáticamente** en el expediente como nota de comunicación.
8. Cierre del crítico solo por el responsable con acción documentada (RES03); un acuse no cierra.
9. Corrección después de publicar: nueva versión, motivo, aviso a quienes vieron la anterior.
10. Al alta, lista de órdenes y resultados pendientes con responsable de seguimiento (R03, RES05).
11. Derivación externa con laboratorio ejecutor, vencimiento a 7 días hábiles por defecto y alerta.
12. Seroteca con fecha de descarte calculada (mínimo 24 h, Art. 76).
13. Reportes: TAT por tramo y origen, rechazos por causa, críticos con tiempo a aviso y a acción, fallidos, pendientes postalta, no retirados.

## 8. Pendientes para CLIMESA

1. ¿Laboratorio propio, tercerizado o mixto? ¿Qué se deriva y a quién?
2. ¿Tienen LIS? ¿Qué analizadores y con qué interfaz?
3. ¿Tienen lista de valores críticos? ¿Cómo avisan hoy y dónde queda registrado?
4. ¿Banco de sangre propio? (R10)
5. ¿Participan en algún programa de evaluación externa?
6. ¿Patología propia o derivada?

## Fuentes

- [Norma técnica de laboratorios clínicos del SNIS, Acuerdo 1855 (2023)](https://www.jurisprudencia.gob.sv/DocumentosBoveda/D/2/2020-2029/2023/09/FBDBC.PDF): leída.
- [Biochemia Medica 2019, 29(3):030703](https://www.biochemia-medica.com/en/journal/29/3/10.11613/BM.2019.030703): leída.
- [CLSI GP47](https://clsi.org/shop/standards/gp47/): pendiente (norma de pago).
- V5 L501-L525: heredadas.
