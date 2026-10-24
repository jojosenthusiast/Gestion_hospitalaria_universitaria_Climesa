# R09. Cirugía, anestesia y CEYE

**Versión:** 1 (2026-10-13). **Alimenta:** módulo quirúrgico (agenda, pausas, registro operatorio), anestesia y recuperación, CEYE, consumo de implantes (R06, R14), preautorización (R16).

## 1. Conclusión

V6-03, V6-04 y V6-05 (SUR, ANE, STE) están bien orientados y se conservan. Esta revisión abre las dos normas que V6 tenía a medias o sin descargar, y las dos cambian el diseño:

- **[Norma técnica de anestesiología, Acuerdo 1895 (2025)](https://www.jurisprudencia.gob.sv/DocumentosBoveda/D/2/2020-2029/2025/11/10FA00.PDF)** aplica al SNIS, que incluye al sector privado (Art. 2 y 4). Fija evaluación preanestésica electiva al menos 24 h antes, contenido de la nota preanestésica, registro transanestésico con hora y dosis, relevo registrado, criterios de traslado a recuperación (SpO2 > 94%, entre otros), escala de alta de recuperación de seis parámetros con mínimo 10, dos camas de recuperación por quirófano y exclusiones de cirugía ambulatoria.
- **[Lineamientos técnicos de la CEYE del SNIS, Acuerdo 1584 (16-jul-2026)](https://asp.salud.gob.sv/regulacion/pdf/lineamientos/lineamientostecnicosdelacentraldeequiposyesterilizaciondelosestablecimientosdelsnis-AE-1584-16072026_v1.pdf)**, que V6 daba como no recuperado, ya está publicado. Exige bitácora de esterilización e indicador biológico por carga, etiqueta de paquete, indicador químico dentro de cada paquete, cargas con implantes retenidas hasta indicador biológico negativo, caducidad por evento y validación anual del esterilizador. **No dice nada** de trazabilidad paquete-paciente, retiro de lotes, reuso de dispositivos de un solo uso ni plazo de retención. Ahí el sistema va más allá de la norma con CDC.
- **Evidencia de la lista de verificación quirúrgica:** el efecto depende de cómo se usa. Haynes 2009 (antes-después, 8 hospitales) mostró grandes reducciones; Urbach 2014 (Ontario, implantación obligatoria) no encontró reducción significativa; Haugen 2015 (Noruega, ensayo escalonado) bajó complicaciones de 19.9% a 11.5%, con mortalidad global no significativa ([resumen](https://www.patientsafetysolutions.com/docs/May_2015_The_Great_Checklist_Debate.htm)). Hay efecto dosis: más beneficio cuando se cumplen todas las partes. Un sistema que deja marcar todo con un clic produce la versión de Ontario.

## 2. Qué se conserva de V1-V9

| Origen | Contenido | Veredicto |
|---|---|---|
| V6 SUR01 | Indicación, procedimiento, sitio y lateralidad; consentimiento versionado con alcance, informante, capacidad, representación | Se conserva |
| V6 SUR02 | Agenda con sala, equipo, instrumental liberado, implante, recuperación; bloqueo transaccional; duración estimada y real; no sobreprogramar más de lo que recuperación y CEYE soportan | Se conserva; capacidad de recuperación con base legal (Art. 36) |
| V6 SUR03 | Tres pausas con hora, coordinador, participantes y discrepancias; nada marcado por defecto; excepción vital sin completar retroactivo | Se conserva; respaldado por la evidencia de efecto dosis |
| V6 SUR04 | Conteos con discrepancia abierta; implante con fabricante, modelo, lote, serie, UDI si existe; consignación distinta de implantación; muestras con ID propio | Se conserva |
| V6 SUR05 | Informe operatorio, entrega a recuperación con receptor, retorno de instrumental vinculado al paquete usado, indicadores por causa | Se conserva |
| V6 ANE01-ANE05 | Evaluación con fecha y plazo electivo que no bloquea urgencia; revisión de equipo; registro temporal con hora del acto y de captura; relevo sin autoría compartida; escala con componentes y total | Se conservan; ahora con artículos concretos |
| V6 STE01-STE05 | Custodia sucio-limpio; paquete con contenido real e ID; liberación por profesional competente; estados de paquete; retiro con evaluación de alcance, no automático universal | Se conservan; la norma CEYE confirma lo básico y deja huecos que estas reglas llenan |

## 3. Qué se descarta o corrige

| Afirmación | Corrección |
|---|---|
| V6: "norma CEYE SNIS 16/07/2026 no recuperada" | Recuperada y leída (Acuerdo 1584) |
| Indicador biológico "según protocolo" | La norma es inconsistente: Tabla 5 pide uno por carga; Anexo 11 pone mínimo semanal por autoclave y recomienda diario. **Default del sistema: por carga** (la regla más estricta), configurable a la baja solo con aprobación de comité de infecciones registrada |
| Caducidad fija de paquetes (30, 90 días) | La norma adopta caducidad por evento; el Anexo 12 permite fecha estimada por puntaje (24 h a 5 años) según envoltura y almacenamiento. El sistema guarda la fecha calculada y el puntaje, y además permite invalidar por evento |
| Retiro universal ante cualquier indicador biológico positivo | Se mantiene la corrección de V6 STE04 con el protocolo CDC: no se retira material no implantable tras un solo positivo si el esterilizador y el procedimiento están bien; se repite el biológico en tres ciclos; si persiste, se retiran las cargas desde el último negativo |
| Supuesto común de software importado: Aldrete de 5 parámetros con corte 9 (V6 ANE05 ya lo advertía) | La norma salvadoreña usa 6 parámetros (actividad, respiración, circulación, conciencia, saturación, **dolor**) de 0 a 2 y corte ≥ 10 (Art. 39) |

## 4. Anestesia: Acuerdo 1895 (2025)

| Art. | Regla | Regla del sistema |
|---|---|---|
| 2, 4 | Aplica al personal del SNIS, público y privado | Aplicable a CLIMESA |
| 6 n.10 | Una máquina de anestesia y un monitor de respaldo por cada 5 quirófanos electivos o 3 de emergencia | Inventario biomédico con verificación de respaldo (R13) |
| 9 | Anestesiólogo supervisa a licenciados; sin anestesiólogo supervisa el médico tratante; residentes supervisados por anestesiólogo | Privilegio con supervisor obligatorio por categoría profesional |
| 10 c, g, h | Consentimiento firmado verificado; revisión de equipo, fármacos, insumos y hemocomponentes antes de inducción; inicio con cirujano presente | Lista previa a inducción con campos de la norma; bloqueo de "inicio de anestesia" si falta consentimiento, salvo ruta de emergencia |
| 10 i, j | Sin anestesia simultánea por la misma persona salvo supervisión o requerimiento en otra área; licenciado permanece todo el procedimiento | Alerta (no bloqueo) cuando un mismo profesional figura como conductor en dos salas; registro del motivo |
| 10 l | Relevo registrado con condiciones clínicas | Evento de relevo con quien entrega, quien recibe, hora y estado |
| 11 | Evaluación preanestésica electiva al menos 24 h antes, por anestesiólogo o residente supervisado; sin anestesiólogo, licenciado supervisado por el tratante | Regla de agenda: cirugía electiva sin evaluación vigente ≥ 24 h antes queda en "preparación incompleta" con dueño |
| 14 | Nota preanestésica: evaluación clínica, tipo de anestesia, estado físico (ASA), medicación preanestésica, ayuno según ERAS | Formulario estructurado con esos campos |
| 17 | En emergencia se pueden omitir requisitos, incluido el consentimiento, registrándolo | Ruta de emergencia con lista de omisiones y razón; nunca completar después como si se hubiera hecho |
| 26 | Verificar equipo, desfibrilador, succión, venoclisis; registrar eventos, fármacos con hora y dosis, líquidos y hemoderivados, condición final, nombre y firma | Registro transanestésico con hora del acto y de captura; balance hídrico enlazado |
| 29 | Pediatría: balance hídrico cada hora | Recordatorio horario en caso pediátrico |
| 31 | Anestesiólogo atiende al neonato; excepcionalmente licenciado supervisado | Rol en registro de cesárea |
| 36 | Dos camas de recuperación por quirófano | Capacidad de recuperación como recurso de agenda |
| 37 | Traslado a recuperación: signos estables, ventilación espontánea, reflejos laríngeos, SpO2 > 94%, sin sangrado activo, venoclisis funcional, hoja de anestesia completa | Lista de traslado; hoja incompleta bloquea el evento "trasladado a recuperación" salvo excepción con razón |
| 39 | Alta de recuperación: 6 parámetros de 0 a 2, total ≥ 10, anotado en hoja de recuperación | Escala versionada con componentes; total calculado; alta bajo 10 requiere decisión médica documentada |
| 40 | Ambulatoria: consentimiento, ayuno, exámenes vigentes, evaluación no más de 5 días antes para ASA II (sin anestesiólogo) o ASA III (con anestesiólogo) | Validación de vigencia de evaluación para ambulatoria |
| 41 | Exclusiones de ambulatoria: posible transfusión, hipertermia maligna, seguimiento domiciliario inviable, ASA IV o más, alto riesgo respiratorio, prematuros < 60 semanas corregidas, entre otras | Advertencia al programar como ambulatoria con cualquier exclusión registrada |

## 5. CEYE: Acuerdo 1584 (16-jul-2026)

| Sección | Regla | Regla del sistema |
|---|---|---|
| III | Personal del SNIS que maneja material quirúrgico | Aplicable a CLIMESA (confirmar) |
| 8.1-8.7 | Etapas: recepción y prelavado, limpieza y descontaminación, lubricación, empaque y etiquetado, esterilización, almacenamiento y distribución, transporte | Máquina de estados del conjunto por etapa con operador y hora |
| 8.4 | Etiqueta con fecha de esterilización, fecha de caducidad, nombre del artículo y preparador | Etiqueta con código de barras que además lleva ID de paquete y carga |
| 8.5, Anexo 9 | Bitácora de esterilización y de biológicos: número de carga, inicio, fin, responsable, resultado; biológico tras mantenimiento o reparación | Carga como entidad; equipo pasa a "requiere biológico" tras evento de mantenimiento |
| 8.6 f | Revisión diaria de caducidades | Reporte diario de paquetes por vencer y vencidos por ubicación |
| 9, Anexo 10 | Indicadores químicos de clase I a VI; indicador dentro de cada paquete | Resultado del indicador interno registrado al abrir en quirófano |
| 9, Tabla 5 / Anexo 11 | Biológico por carga y método; mínimo semanal por autoclave | Default por carga (sección 3) |
| Anexo 11 | Carga con implantes lleva biológico rápido y no se libera hasta resultado negativo | Bloqueo duro: paquete con implante no se despacha con biológico pendiente |
| 9, Anexo 12 | Caducidad por evento; estimación por puntaje 24 h a 5 años | Fecha calculada con puntaje guardado; evento de compromiso invalida |
| 9 | Validación con carga y cámara vacía al menos anual y tras reparación | Equipo con vencimiento de validación; vencida bloquea uso |
| 10 | Desinfección de alto nivel | Registro de ciclo para endoscopios y equipos no esterilizables |
| No cubierto | Trazabilidad a paciente, retiro, dispositivos de un solo uso, retención | Ver sección 6 |

## 6. Lo que el sistema agrega sobre la norma

1. **Trazabilidad paquete-paciente:** escaneo del paquete al abrirlo en sala vincula carga, esterilizador, ciclo y paciente. Sin esto, un biológico positivo no se puede convertir en lista de pacientes expuestos.
2. **Retiro según CDC** ([protocolo de indicador positivo](https://www.cdc.gov/infection-control/hcp/disinfection-and-sterilization/management-positive-indicator.html)): equipo fuera de servicio, aviso a infecciones, verificación de parámetros, repetición en tres ciclos; si persiste, retiro de cargas desde el último negativo con lista de paquetes, ubicaciones y pacientes; cierre solo con reconciliación de todos los paquetes.
3. **Dispositivos de un solo uso:** marcados en catálogo como no reprocesables; política de reuso, si existiera, solo con aprobación formal registrada.
4. **Retención de registros de CEYE:** sin plazo en la norma; se propone igualar a la retención del expediente para cargas vinculadas a pacientes (decisión de CLIMESA, PENDING-INS).

## 7. Requisitos derivados

Cirugía:

1. Solicitud quirúrgica con procedimiento, sitio, lateralidad, prioridad (electiva, urgente, emergencia), recursos, implante y sangre previstos.
2. Agenda con recursos: sala, cirujano, anestesia, instrumental liberado, implante disponible o en consignación, cama de recuperación (Art. 36); bloqueo de doble reserva.
3. "Preparación incompleta" con dueño cuando falta consentimiento, evaluación preanestésica vigente (Art. 11), preautorización (R16, solo electiva) o exámenes.
4. Tres pausas OMS con hora real, coordinador, participantes y cada ítem confirmado activamente; discrepancia abierta hasta resolverse; adaptación local versionada.
5. Conteos con resultado y discrepancia; implante con UDI, lote, serie y vínculo a consumo y cargo sin duplicar.
6. Muestras quirúrgicas con ID por recipiente y entrega a patología con receptor.
7. Informe operatorio firmado; entrega a recuperación o UCI con receptor.

Anestesia:

8. Nota preanestésica estructurada (Art. 14) con ASA y ayuno.
9. Registro transanestésico con hora del acto y de captura, fármacos con dosis, unidad y vía, líquidos y hemoderivados, eventos, relevos.
10. Lista de traslado a recuperación (Art. 37) y escala de alta de 6 parámetros con corte 10 (Art. 39).
11. Reglas de ambulatoria (Art. 40-41) como advertencias al programar.

CEYE:

12. Conjunto versionado, paquete con ID único, carga con esterilizador, programa, parámetros, indicadores y biológico.
13. Liberación por profesional competente; implantes retenidos hasta biológico negativo.
14. Caducidad por puntaje y por evento; reporte diario.
15. Escaneo en sala y retiro con lista de pacientes expuestos.
16. Validación anual y biológico tras mantenimiento como estados del equipo.

## 8. Pendientes para CLIMESA

1. Número de quirófanos y camas de recuperación (compara contra Art. 36).
2. ¿Anestesiólogos de planta o por evento? ¿Licenciados en anestesia?
3. ¿Usan la lista de verificación OMS hoy y cómo (papel, adaptada)?
4. CEYE: número y tipo de esterilizadores, método (vapor, peróxido, óxido de etileno), frecuencia real de biológicos, si reciben equipo prestado de proveedores.
5. ¿Implantes en consignación? ¿Quién factura el implante?
6. ¿Cirugía ambulatoria o de corta estancia?

## Fuentes

- [Norma técnica de anestesiología, Acuerdo 1895 (2025)](https://www.jurisprudencia.gob.sv/DocumentosBoveda/D/2/2020-2029/2025/11/10FA00.PDF): leída.
- [Lineamientos técnicos de la CEYE del SNIS, Acuerdo 1584 (2026)](https://asp.salud.gob.sv/regulacion/pdf/lineamientos/lineamientostecnicosdelacentraldeequiposyesterilizaciondelosestablecimientosdelsnis-AE-1584-16072026_v1.pdf): leída.
- [CDC, manejo de indicador biológico positivo en esterilizador de vapor](https://www.cdc.gov/infection-control/hcp/disinfection-and-sterilization/management-positive-indicator.html): leída.
- [Patient Safety Solutions, "The Great Checklist Debate" (2015)](https://www.patientsafetysolutions.com/docs/May_2015_The_Great_Checklist_Debate.htm): leída (secundaria; cifras de Haugen 2015).
- OMS lista de verificación 2009, Haynes 2009, Urbach 2014 (V6 E604-E606): heredadas.
