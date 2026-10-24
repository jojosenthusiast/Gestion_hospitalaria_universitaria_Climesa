# Cobertura hospitalaria y límites de automatización
Todos los siguientes son contratos candidatos. Confirmar existencia del servicio en CLIMESA antes de convertirlo en alcance contratado. La profundidad desarrollada en 03 no se pretende ya alcanzada en todos los dominios.

| Grupo | Recorrido operativo | Excepciones/validaciones | Intercambio/evidencia y automatización |
|---|---|---|---|
| Identidad/archivo | Buscar → identificar → episodio → documento → custodiar → corregir/exportar | Homónimos, desconocido, recién nacido, representante; fusionar con revisión y posibilidad de deshacer | MPI; origen y confianza; sugerir duplicados sin fusión automática |
| Agenda/admisión | Referencia → recursos → cita → llegada → atención | Médico/sala/equipo/tiempo concurrentes; no-show; sobrecupo autorizado | Calendario, cola, responsable; recordatorios según preferencias |
| Urgencias | Identidad provisional → triage → reevaluar → tratar → destino | Deterioro, fuga, múltiples víctimas, traslado; protocolo clínico aprobado | Tarea con prioridad/edad; alertas con acuse y escalamiento |
| ADT/camas | Reservar → ocupar → trasladar → egreso → limpiar → habilitar | Aislamiento, cama fuera de servicio, alta revertida; conservar historia | Ubicación, entrega de turno, limpieza con responsable |
| Expediente/médico | Valorar → orden → nota → firma → seguimiento | Orden verbal, cofirma, adenda, resultado posterior al alta | Versión, autor habilitado, destinatario y lectura; cola clínica |
| Enfermería | Valoración → plan → tareas → medicación/observaciones → turno | Omisión/rechazo, dosis tardía, suspensión, entrega incompleta | eMAR y balance con unidades; priorizar tareas sin prescribir automáticamente |
| Farmacia | Orden → validación → preparar → dispensar → devolver/retirar | Parcial, sustitución, urgencia, controlados, frío | Lote y vínculo orden/administración; FEFO y bloqueos |
| Laboratorio | Orden → tomar → transportar → recibir → analizar → validar → comunicar | Muestra insuficiente/rechazada, duplicada, crítica, resultado corregido | Accession/muestra/equipo/QC; reconocimiento de crítico por persona responsable |
| Imagen | Orden → protocolo → agenda → adquirir → interpretar → publicar | Identidad/lateralidad, contraste, embarazo, repetición y equipo caído | RIS/PACS/DICOM; conciliación estudio-orden-informe |
| Cirugía/anestesia | Evaluar → consentir → reservar → checklist → operar → recuperar | Urgencia, cancelación, conteo discrepante, implantes | Caso/tiempos/recursos/lotes; checklists y alertas de disponibilidad |
| CEYE | Recibir → limpiar → preparar → esterilizar → liberar → distribuir → usar | Ciclo fallido, empaque dañado, retiro | Instrumental-ciclo-carga-paciente; bloqueo de carga no liberada |
| Sangre | Solicitar → compatibilidad → reservar → entregar → transfundir → vigilar | Urgencia, devolución, reacción, caducidad | Unidad y cadena responsable; no inventar reglas de compatibilidad |
| Obstetricia/neonatos | Atención materna → nacimiento → identidad hijo → continuidad | Gemelos, desconocido, transferencia y separación | Enlace madre/hijo sin compartir identificador; consentimientos propios |
| UCI/especialidades | Plan específico → parámetros → ejecución → evolución → traslado | Dispositivos, protocolos y cambios de dosis críticos | Integración validada, unidades y origen; evitar transcripción doble |
| Rehabilitación/nutrición | Orden → valorar → plan → sesión/dieta → seguimiento | Ayuno, alergias, textura, aislamiento, suspensión | Dieta vigente a cocina; consumo/sesión a cargo según política |
| Limpieza/lavandería | Solicitud → priorizar → ejecutar → verificar → liberar | Aislamiento, ropa contaminada, entrega incompleta | Cama/área, tiempo, responsable, insumo; cola operativa |
| Residuos | Segregar → recoger → almacenar → entregar → manifiesto | Derrame, clasificación, gestor no habilitado | Peso/categoría/custodia; vencimientos sin reglas legales inventadas |
| Ingeniería biomédica | Inventario → preventivo → fallo → bloqueo → reparar → verificar | Equipo crítico sin respaldo; calibración vencida | CMMS y agenda; no liberar con simple checkbox de técnico |
| Transporte/referencias | Solicitar → aceptar → preparar → trasladar → entregar | Receptor no disponible, ambulancia, aislamiento y deterioro | Custodia/entrega, documentos mínimos, tiempos y aceptación |
| RRHH/credenciales | Vincular → acreditar → asignar privilegio → cubrir → revocar | Suplencia, vencimiento, externo, baja inmediata | IAM/nómina; impedir firma fuera de privilegio |
| Calidad/epidemiología | Capturar incidente → investigar → corregir → medir | Acceso sensible, notificación obligatoria, datos secundarios | Caso, revisión, acciones y efectividad; indicadores con definición |
| Dirección/portal | Publicar información validada → consultar → seguimiento | Resultado sensible, representante, acceso indebido | Dataset mínimo, publicación controlada, auditoría/exportación |

## Contrato común entre departamentos
Toda transferencia requiere emisor, receptor, aceptación, dueño actual, prioridad, plazo aprobado, estado y evidencia. No cerrar una tarea solo porque el emisor terminó.
Orden, tarea ejecutada, resultado, interpretación y cargo son entidades/eventos diferentes.
El alta clínica no cierra automáticamente resultados pendientes ni la cuenta financiera.
Una corrección debe avisar al consumidor de la versión anterior cuando afecta una decisión; conservar entrega y acuse.

## Laboratorio: primer desglose para investigar
[V2-12] El manual OMS es referencia de gestión de calidad, no fuente de todos los umbrales locales.
Separar orden y muestra, múltiples muestras por orden y varios análisis por muestra; registrar recolector, instantes, contenedor, condición, aceptación/rechazo y cadena de transporte.
Resultados importados de analizador quedan sujetos a QC y validación competente; conservar original, unidad, rango por contexto y versión de catálogo.
Crítico: protocolo institucional define umbral/destinatario/plazo; aviso necesita acuse, sustituto y escalamiento. Corregir informe genera versión y comunicación, no sobrescritura silenciosa.
Cobro por prueba solicitada, tomada o ejecutada debe ser decisión contractual explícita. Cancelación por muestra rechazada no justifica automáticamente facturar o no facturar.

## Automatización viable vs decisión reservada
Automatizar recordatorios, colas, reconciliación, deduplicación técnica, disponibilidad, controles de lote, vencimientos y detección de omisiones.
No asumir automatización autónoma de triage, diagnóstico, prescripción, validación clínica, fusión de pacientes o rechazo de reclamaciones. Una investigación de IA no autoriza su uso productivo.
Documentar para cada automatización: entrada, regla/versionado, salida, fallo seguro, dueño, reverso y monitoreo.

