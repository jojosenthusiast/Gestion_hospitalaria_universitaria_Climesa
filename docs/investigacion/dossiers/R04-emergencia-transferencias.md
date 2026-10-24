# R04. Emergencia y transferencias

**Versión:** 1 (2026-10-13). **Alimenta:** spec 002 (episodio), módulo clínico de emergencia, spec 009 (autorizaciones: la emergencia no se bloquea por preautorización).

## 1. Conclusión

V6-02 (EMG01-EMG06) está bien planteado y se conserva casi completo: atención antes que datos administrativos, relojes separados, prioridad que recepción no puede degradar, solicitud de traslado distinta de aceptación. Lo que esta revisión agrega es incómodo pero útil:

- **No existe una norma salvadoreña de triaje hospitalario que obligue a un hospital privado** con escala y tiempos. Lo que se encontró es para el primer nivel (Acuerdo 2456-BIS, 2025, heredado de V6) o para establecimientos MINSAL. CLIMESA tiene que **elegir y versionar** su protocolo de triaje; el sistema no puede traerlo fijo.
- **Los lineamientos de referencia, retorno e interconsulta (Acuerdo 1653, 30-may-2024) solo obligan a MINSAL y FOSALUD.** Sirven como modelo de campos y de coordinación previa, y como contrato de facto cuando CLIMESA refiere un paciente a un hospital nacional, porque ese hospital lo registrará con esa lógica.
- **La regla legal dura sigue siendo la de R03:** no negar ni deteriorar la atención de emergencia por condición económica (LDDPPSS Art. 11, 42 b). En emergencia ninguna validación de cobertura, anticipo o preautorización bloquea nada.

## 2. Qué se conserva de V1-V9

| Origen | Contenido | Veredicto |
|---|---|---|
| V6 EMG01 | Hora real de llegada, medio de ingreso, acompañante, fuente de identidad; atención antes que datos completos; identidad temporal | Se conserva; identidad temporal ya diseñada en spec 001 (FR de paciente desconocido) |
| V6 EMG01 | Sin datos sensibles en tablero público | Se conserva; tablero con iniciales o código, no diagnóstico |
| V6 EMG02 | Triaje por profesional habilitado con versión de protocolo, hallazgos, hora y autor; recepción no degrada prioridad; reevaluación como nuevo registro | Se conserva |
| V6 EMG02 | Relojes separados: llegada, triaje, primer contacto médico, reevaluación, decisión, salida; no usar "6 horas" como temporizador general | Se conserva; tiempos objetivo como política versionada |
| V6 EMG03 | Observación con objetivo, vigilancia y decisión pendiente, no cama indefinida; interconsulta con solicitante, respuesta y hora | Se conserva |
| V6 EMG04 | Disposiciones distintas: alta, ingreso, cirugía, traslado, abandono, rechazo informado (alta voluntaria), fallecimiento | Se conserva; alta voluntaria ya ligada a LDDPPSS en R03 |
| V6 EMG05 | Traslado: motivo, capacidad que falta, estabilización, aceptación con nombre, documentos, transporte, acompañante, hora de entrega; solicitud no es aceptación | Se conserva y se refuerza con el Acuerdo 1653 |
| V6 EMG06 | Activación formal de demanda extraordinaria; no reemplazar triaje rutinario por clasificación de víctimas múltiples sin activación; identificadores de contingencia | Se conserva |

## 3. Qué se descarta o corrige

| Afirmación | Corrección |
|---|---|
| "MINSAL triaje 2025 (Acuerdo 2456-BIS)" como norma del hospital | Es de primer nivel. Referencia de lenguaje y colores, no obligación de CLIMESA |
| Asumir que los lineamientos RRI aplican a privados | El ámbito (sección III) es solo personal MINSAL y FOSALUD. Se usan como referencia de interoperabilidad, no como requisito |
| Escala de triaje fija en código (ESI o Manchester) | Descartado: protocolo como catálogo versionado con niveles, colores, discriminadores y tiempos objetivo; la elección es de la jefatura médica |
| Búsqueda de "lineamientos de triaje hospitalario MINSAL" | No se encontró documento vigente para segundo y tercer nivel; el resultado más cercano (Acuerdo 2100 de 2021) categoriza establecimientos y no define triaje. Queda pendiente preguntar a CLIMESA qué escala usa hoy |

## 4. Marco legal y normativo verificado

| Norma | Regla | Regla del sistema | Estado |
|---|---|---|---|
| LDDPPSS Art. 11, 42 b | No discriminar por condición económica; negar emergencia o atenderla deficientemente por ello es infracción grave | Episodio de emergencia se abre sin validaciones económicas; la cuenta se arma después | Leída (R03) |
| LDDPPSS Art. 29 | Costo desde ingreso hasta firma del alta | Reloj económico arranca con el episodio, no con el triaje | Leída (R03) |
| [Lineamientos RRI, Acuerdo 1653, 30-may-2024](https://transparencia.gob.sv/institutions/minsal/documents/590122/download) | Emergencia: amenaza vital, estabilizar antes de trasladar, acompañamiento de personal idóneo. Urgencia: no amenaza vital, estabilizar y coordinar. Coordinación previa por teléfono o medio electrónico (IV.B.2.a). Registrar nombre de quien recibe en destino (Tabla 1). El receptor no rechaza: recibe, estabiliza y refiere si hace falta (IV.F.1.b). Paciente de emergencia = Prioridad I "usuario rojo" | Formulario de traslado con esos campos; estado `aceptado` solo con nombre del receptor y hora; constancia de traslado para el paciente | Leída (texto truncado al final; anexos 5-6 no revisados) |
| [Norma de anestesiología, Acuerdo 1895, 2025](https://www.jurisprudencia.gob.sv/DocumentosBoveda/D/2/2020-2029/2025/11/10FA00.PDF) Art. 17 | En emergencia el anestesiólogo puede omitir requisitos, incluido el consentimiento, dejándolo registrado | Ruta de emergencia quirúrgica con omisiones explícitas y razón (ver R09) | Leída |
| [Lineamientos de categorización, Acuerdo 2100, 2021](https://transparencia.gob.sv/institutions/minsal/documents/493652/download) | Categorías de hospitales MINSAL; "emergencia general 24 horas" desde categoría I | Solo contexto para saber a qué hospital nacional se refiere según capacidad | Leída; ámbito MINSAL |
| Ley de Protección Civil / plan hospitalario de emergencias | No abierto | Activación de demanda extraordinaria queda como política | Pendiente |

## 5. Escalas de triaje: referencias para que CLIMESA elija

| Escala | Qué es | Nota para el sistema | Estado |
|---|---|---|---|
| [ESI v5 (ENA, 2023)](https://www.ena.org/press-room/articles/detail/2023/04/25/ena-updates-emergency-severity-index-resources-to-improve-patient-triage) | Cinco niveles; creada en 1998, de ENA desde 2019; la v5 aclara lenguaje para evitar malas interpretaciones y aborda sesgo en la decisión | Marca registrada de ENA; usar su nombre y material requiere revisar términos. El [manual](https://emscimprovement.center/documents/2177/Emergency_Severity_Index_Handbook.pdf) no se abrió aquí | Parcial |
| Manchester (MTS) | Cinco niveles con colores y tiempos máximos, discriminadores por diagrama de presentación; licenciado por el Manchester Triage Group; [manual de un hospital de Ecuador](https://hospitalgeneralchone.gob.ec/wp-content/uploads/2015/11/manual_de_sistema_de_triaje_manchester.pdf) como ejemplo de uso en la región | Si CLIMESA lo usa, los diagramas son contenido licenciado: el sistema guarda nivel, discriminador y versión, no reproduce el contenido | Pendiente de lectura |
| OMS IITT / BEC (V6 E601-E602) | Triaje interagencial y curso básico de emergencias de la OMS | Alternativa abierta para formación | Heredada |
| [Triaje SEUP pediátrico](https://seup.org/pdf_public/enfermeria/triaje.pdf), [Honduras Hospital Escuela](https://honduras.bvsalud.org/wp-content/uploads/2024/04/PROTOCOLO-DE-TRIAJE-DEL-HOSPITAL-ESCUELA-EMERGENCIA-UNIFICADA-DE-ADULTOS.pdf) | Protocolos regionales en español | Ejemplos de cómo se documenta un protocolo local | Pendiente de lectura |

Modelo resultante: `triage_protocol` (nombre, versión, licencia, vigencia), `triage_level` (código, color, tiempo objetivo a primer contacto, intervalo de reevaluación), `triage_assessment` (signos, discriminador o criterio, nivel asignado, nivel sugerido si hay cálculo, autor, hora, motivo de sobreescritura). El nivel sugerido por algoritmo nunca reemplaza el asignado por el profesional.

## 6. Requisitos derivados

1. Apertura de episodio de emergencia en una sola pantalla con identidad temporal (el tiempo objetivo se mide en piloto, no se supone); sin campos obligatorios económicos.
2. Relojes registrados como eventos con hora real y hora de captura: llegada, triaje, reevaluaciones, primer contacto médico, decisión de disposición, salida física.
3. Protocolo de triaje versionado y elegido por CLIMESA; tiempos objetivo e intervalos de reevaluación configurables por nivel; alerta cuando se vence la reevaluación.
4. Cola ordenada por nivel y tiempo de espera; cambiar nivel exige nuevo registro clínico con autor; recepción y caja no tienen permiso.
5. Tablero de emergencia con código o iniciales, ubicación, nivel, tiempo y pendientes (resultados, interconsulta, cama); sin diagnóstico visible al público.
6. Observación con objetivo, plan de vigilancia y hora límite de decisión configurable.
7. Disposición obligatoria al cerrar con una de las categorías de EMG04; abandono sin alta con hora y último contacto.
8. Traslado externo: motivo y capacidad faltante, estado clínico, estabilización realizada, institución destino, contacto, nombre del receptor que acepta, hora, documentos enviados (resumen, resultados, imágenes), transporte, acompañante; constancia para el paciente; estado `solicitado → aceptado → en tránsito → entregado`.
9. Si el destino es un hospital MINSAL, el resumen de referencia incluye los campos del formulario RRI (motivo ligado a condición, teléfono del paciente o responsable, nombre de quien recibe).
10. Cobertura y preautorización se registran en paralelo y nunca bloquean triaje, órdenes ni procedimientos de emergencia (R16).
11. Modo de víctimas múltiples solo con activación formal registrada; identificadores de contingencia reconciliables (spec 001).
12. Indicadores: tiempo llegada-triaje y triaje-médico por nivel, reevaluaciones vencidas, abandono, retorno a 72 h, traslados por capacidad faltante.

## 7. Pendientes para CLIMESA

1. ¿Qué escala de triaje usan hoy, si alguna? ¿Quién la hace (enfermería, médico)?
2. ¿Emergencia 24 h con médico de planta o por llamada?
3. ¿A qué hospitales trasladan y cómo coordinan hoy (teléfono, nota)? ¿Ambulancia propia o contratada?
4. ¿Cómo manejan al paciente asegurado que llega por emergencia fuera de horario de la aseguradora?
5. ¿Tienen plan hospitalario de emergencias y desastres?

## Fuentes

- [Lineamientos técnicos para el cumplimiento de la referencia, retorno e interconsulta, Acuerdo 1653 (2024)](https://transparencia.gob.sv/institutions/minsal/documents/590122/download): leída (salvo últimos 65 caracteres y anexos).
- [Lineamientos de categorización de establecimientos MINSAL, Acuerdo 2100 (2021)](https://transparencia.gob.sv/institutions/minsal/documents/493652/download): leída.
- [Norma técnica de anestesiología, Acuerdo 1895 (2025)](https://www.jurisprudencia.gob.sv/DocumentosBoveda/D/2/2020-2029/2025/11/10FA00.PDF): leída.
- [ENA, actualización ESI v5 (2023)](https://www.ena.org/press-room/articles/detail/2023/04/25/ena-updates-emergency-severity-index-resources-to-improve-patient-triage): leída.
- [Manual ESI](https://emscimprovement.center/documents/2177/Emergency_Severity_Index_Handbook.pdf): pendiente.
- [Manual Manchester, Hospital General Chone](https://hospitalgeneralchone.gob.ec/wp-content/uploads/2015/11/manual_de_sistema_de_triaje_manchester.pdf): pendiente.
- LDDPPSS Decreto 307: leída en R03.
- V6 E601-E603 (OMS IITT, BEC, triaje primer nivel 2025): heredadas.
