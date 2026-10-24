# Comunicación cerrada y responsabilidad postalta
Contrato común para laboratorio/radiología. Propuesta; límites críticos, urgencias y tiempos se aprueban por gobierno clínico.

## Separar los hitos
Resultado producido → revisado/autorizado por servicio → publicado → aviso emitido → entrega técnica → acuse del receptor competente → revisión clínica → decisión/acción documentada → cierre del seguimiento.
No todos los resultados exigen alerta urgente, pero todo resultado pendiente relevante debe tener dueño y política de revisión.
No exigir final analítico para iniciar toda comunicación urgente: un protocolo puede permitir alerta provisional con sus limitaciones y confirmación posterior.
“Delivered” del correo, lectura del portal, ACK HL7 y marcar visto no prueban atención clínica.

## RES01 — Enrutar a responsable
Asignar responsable en orden y resolver cobertura actual por atención/servicio/turno. Al alta, destino explícito y aceptación de seguimiento o excepción supervisada.
Cambio de médico/turno/servicio entrega pendientes con acuse. Solicitante externo o inactivo requiere ruta alterna, no abandono de resultado.
Datos de contacto del paciente y preferencia de comunicación no reemplazan responsabilidad profesional.
Traslado externo registra entidad receptor/aceptación y obligaciones residuales; el HIS mantiene evidencias necesarias.

## RES02 — Avisar y escalar
Caso crítico: ID/versionado, resultado/informe, paciente/atención, origen, criterio aplicable/versionado, prioridad, destinatario, canal e instantes.
Enviar mínimo contenido según canal y finalidad; canal humano de contingencia cuando no hay acuse.
Registrar intentos, respuesta, quien acepta y competencia. Comunicación telefónica deja evidencia/read-back según política.
Escalamiento por tiempos/turno/receptor no disponible con umbral institucional aprobado; no inventar “10 minutos” como requisito universal.
Alerta repetida del mismo evento se deduplica sin silenciar resultado nuevo/corrección o cambio relevante.
Automatización enruta/recuerda/escala; no prescribe ni marca “tratado” por recibir notificación.

## RES03 — Revisar, actuar y cerrar
Responsable documenta revisión, interpretación/decisión y siguiente acción: intervención, contacto/reconsulta, seguimiento delegado, sin acción justificada o revisión pendiente.
La evidencia enlaza orden/notificación/informe/versión y actos posteriores. Una respuesta libre “OK” no cierra por sí sola un crítico.
Si se delega, aceptar dueño nuevo antes de soltar responsabilidad actual. Tarea no atendida permanece visible/escalable.
Cierre tiene criterio documentado, autor y fecha; reapertura por nueva evidencia conserva historia.
Separar resultado sin acción clínica de falta de respuesta. No contarlos como la misma categoría.

## RES04 — Corregir y reentregar
Cambiar valor/unidad/identidad/interpretación después de publicar requiere autorización, razón, versión anterior/nueva y alcance.
Identificar destinatarios que recibieron versión previa. Comunicación clínica priorizada por impacto según protocolo; conservar acuses.
Si informe corregido deja de cumplir criterio crítico, no borrar alerta anterior: registrar rectificación y actuación.
Si identidad equivocada, proteger datos, abrir incidente y corregir circuitos de ambos pacientes con investigación.
No recomputar cargos/modificar DTE automáticamente por adenda; finanzas revisa efectos.

## RES05 — Seguimiento tras alta
Antes de alta enumerar órdenes no resueltas, resultados preliminares/cultivos en proceso y responsables. Cierre de cuenta no elimina tareas.
Aparece resultado: ruta postalta definida, seguimiento y contacto seguro, documentación; incongruencia de identidad/representación no resuelve con envío indiscriminado.
Paciente no localizable: intentos, escalamiento y decisiones conforme a protocolo/ley; no registrar como informado por agotar el primer intento.
Desarrollo no inventa consejo terapéutico automático. El contenido al paciente lo prepara/publica profesional autorizado.
Literatura L515–L519 apoya investigar awareness/continuidad/comunicación; contexto y desenlaces no se generalizan a CLIMESA.

## Publicación y acceso
Política por estado/sensibilidad/representación; resultados requieren permisos contextuales y autoridad legal aplicable.
No retrasar universalmente toda publicación por regla extranjera ni liberar automáticamente toda prueba sensible sin revisión normativa local.
Paciente pagador/contacto/representante son relaciones distintas; la deuda no se convierte aquí en regla de acceso clínico.
Auditar lectura, descarga, impresión y entrega con propósito/alcance.

## Métricas
Tiempo de disponibilidad→aviso→acuse→revisión→acción; casos sin dueño; resultados postalta sin seguimiento; corregidos reentregados; alertas/overrides/fatiga.
Denominador y cohortes por criticidad, prioridad, estado/provisional, servicio y horario.
No medir éxito solo en mensajes enviados. Comparar carga y omisiones, no prometer que más alertas mejoran todo.

