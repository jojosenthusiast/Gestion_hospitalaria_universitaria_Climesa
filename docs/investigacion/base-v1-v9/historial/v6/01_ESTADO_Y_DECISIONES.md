# Estado del modelo y decisiones candidatas
## Revisión estática
ClinicalEntities.cs tiene Appointment, Bed, Admission, ClinicalRecord, Consultation, VitalSign, Diagnosis, Prescription y PrescriptionDetail. AdmissionService.DischargeAsync valida fechas, registra alta y vuelve disponible la cama. HospitalRoles.cs define roles generales; no se encontraron entidades específicas del grupo mediante la búsqueda documentada en evidencia_codigo.json. Esto solo describe el alcance inspeccionado: no prueba ausencia de sistemas institucionales externos.

## Brechas
| ID | Brecha del modelo revisado | Consecuencia a resolver |
|---|---|---|
| B601 | Sin episodio de urgencia y triaje específico | Prioridad, reevaluación y disposición no quedan modeladas como secuencia verificable. |
| B602 | Cita general no expresa preparación quirúrgica | Una reserva no demuestra recursos, consentimiento o aptitud. |
| B603 | Sin registro anestésico y relevos específico | La nota clínica general no acredita cronología de administración/monitorización. |
| B604 | Sin carga/paquete/instrumento de CEYE específico | Existencia de un producto no demuestra liberación estéril. |
| B605 | Sin unidad transfusional individual y compatibilidad específica | Movimiento de inventario no prueba administración al receptor correcto. |
| B606 | Alta de cama simple | Requiere diferenciar salida clínica, recuperación, limpieza y disponibilidad. |

## Decisiones D601–610
- D601: identidad provisional única, emisor, pulsera y reconciliación supervisada según v3; emergencia sin detener atención por expediente completo.
- D602: EmergencyEncounter, TriageAssessment y Disposition separados de Admission; cada evaluación conserva autor, algoritmo/version y hechos.
- D603: SurgicalCase tiene procedimiento previsto y efectivamente realizado; agenda es una reserva revisable, no una autorización.
- D604: anestesia usa registro temporal, validación profesional y relevos; registros tardíos mantienen hora del acto y de entrada.
- D605: capacidad de recuperación y limpieza forman parte de agenda; no cerrar cirugía liberando automáticamente recursos.
- D606: inventario comercial y estado sanitario son dimensiones diferentes. Una cantidad disponible puede estar en cuarentena.
- D607: cada reprocesamiento tiene carga, paquete, evidencia y decisión de liberación; vínculo a procedimiento/paciente para retiros.
- D608: hemocomponente tiene identidad individual y destino final. Reserva, despacho y transfusión son estados diferentes.
- D609: excepciones urgentes son rutas específicas con autoridad, motivo y pendientes; no botón universal que evada controles.
- D610: automatización puede preparar datos y señalar inconsistencias; decisiones clínicas, compatibilidad y liberación requieren competencia y validación autorizadas.

Son decisiones propuestas, no esquema SQL aprobado. Antes de implementarlas: revisión de architecture decision records, migración y límites MVC/service/data conforme AGENTS.md.
