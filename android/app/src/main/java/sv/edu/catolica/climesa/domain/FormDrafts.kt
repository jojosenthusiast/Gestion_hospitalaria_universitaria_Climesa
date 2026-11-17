package sv.edu.catolica.climesa.domain

import org.json.JSONObject

/** JSON shape of the local drafts of the vital signs entry (A-signos) and the prehospital report (A72). */
object FormDrafts {
    fun vitalsKey(patientId: String) = "signos:$patientId"
    const val PREHOSPITAL_FORM = "prehospital:formulario"
    const val PREHOSPITAL_QUEUE = "prehospital:cola"
    /** MA-AMB-06: milestones recorded without signal, in order (`{"items":[...]}`). */
    const val MILESTONE_QUEUE = "hitos:cola"
    /** MA-AMB-06: provisional patient created on this phone, linked with the next prehospital report. */
    const val PROVISIONAL_PATIENT = "prehospital:provisional"
    /** D-3: "No asistió" taps waiting in, or past, their undo window until the API confirms them. */
    const val DEFERRED_NO_SHOW = "diferidas:no_asistio"
    /** D-3: "No se presentó" taps on the queue board, same rule. */
    const val DEFERRED_ABSENCE = "diferidas:no_presento"
    /** Catalog ids ordered from this device for one consultation, so a repeat stays blocked after leaving it. */
    fun orderedExamsKey(consultationId: String) = "consulta:examenes:$consultationId"

    fun vitals(form: VitalsForm) = JSONObject().apply { form.values.forEach { (measure, text) -> if (text.isNotBlank()) put(measure.key, text) }; if (form.note.isNotBlank()) put("note", form.note) }

    fun vitals(json: JSONObject?): VitalsForm? {
        json ?: return null
        val values = VitalMeasure.entries.mapNotNull { measure -> DraftRules.text(json, measure.key, "").takeIf { it.isNotBlank() }?.let { measure to it } }.toMap()
        val form = VitalsForm(values, DraftRules.text(json, "note", ""))
        return form.takeIf { it.values.isNotEmpty() || it.note.isNotBlank() }
    }

    fun isEmpty(form: VitalsForm) = form.values.values.all { it.isBlank() } && form.note.isBlank()

    fun prehospital(serviceId: String, form: PrehospitalForm) = JSONObject().put("serviceId", serviceId).put("reason", form.reason).put("priority", form.priority)
        .put("etaMinutes", form.etaMinutes).put("heartRate", form.heartRate).put("systolic", form.systolic).put("diastolic", form.diastolic)
        .put("oxygenSaturation", form.oxygenSaturation).put("temperature", form.temperature).put("glasgow", form.glasgow)

    /** The saved form, only when it belongs to [serviceId] (a draft of a finished service is discarded). */
    fun prehospital(json: JSONObject?, serviceId: String): PrehospitalForm? {
        if (json == null || DraftRules.text(json, "serviceId", "") != serviceId) return null
        val empty = PrehospitalForm()
        return PrehospitalForm(DraftRules.text(json, "reason", ""), DraftRules.text(json, "priority", empty.priority), DraftRules.text(json, "etaMinutes", ""),
            DraftRules.text(json, "heartRate", ""), DraftRules.text(json, "systolic", ""), DraftRules.text(json, "diastolic", ""),
            DraftRules.text(json, "oxygenSaturation", ""), DraftRules.text(json, "temperature", ""), DraftRules.text(json, "glasgow", ""))
    }

    fun isEmpty(form: PrehospitalForm) = form.copy(priority = PrehospitalForm().priority) == PrehospitalForm()
}
