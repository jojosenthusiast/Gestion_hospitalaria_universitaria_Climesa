package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VitalSignsTest {
    @Test fun levelsFollowTheReferenceRanges() {
        assertEquals(VitalLevel.NORMAL, VitalMeasure.HEART_RATE.level(72.0))
        assertEquals(VitalLevel.ABNORMAL, VitalMeasure.HEART_RATE.level(110.0))
        assertEquals(VitalLevel.CRITICAL, VitalMeasure.HEART_RATE.level(35.0))
        assertEquals(VitalLevel.ABNORMAL, VitalMeasure.TEMPERATURE.level(38.2))
        assertEquals(VitalLevel.CRITICAL, VitalMeasure.TEMPERATURE.level(40.0))
        assertEquals(VitalLevel.NORMAL, VitalMeasure.OXYGEN.level(98.0))
        assertEquals(VitalLevel.ABNORMAL, VitalMeasure.OXYGEN.level(93.0))
        assertEquals(VitalLevel.CRITICAL, VitalMeasure.OXYGEN.level(90.0))
        assertEquals(VitalLevel.NORMAL, VitalMeasure.PAIN.level(2.0))
        assertEquals(VitalLevel.ABNORMAL, VitalMeasure.PAIN.level(5.0))
        assertEquals(VitalLevel.CRITICAL, VitalMeasure.PAIN.level(8.0))
        assertEquals(VitalLevel.CRITICAL, VitalMeasure.GLUCOSE.level(45.0))
        assertEquals(VitalLevel.INVALID, VitalMeasure.TEMPERATURE.level(50.0))
        assertEquals(VitalLevel.NORMAL, VitalMeasure.WEIGHT.level(70.0))
    }

    @Test fun fieldErrorsUseTheApiLimitsAndAcceptCommaDecimals() {
        assertNull(VitalsRules.fieldError(VitalMeasure.TEMPERATURE, ""))
        assertNull(VitalsRules.fieldError(VitalMeasure.TEMPERATURE, "36,8"))
        assertEquals("Fuera de rango: 30 a 45 °C.", VitalsRules.fieldError(VitalMeasure.TEMPERATURE, "50"))
        assertEquals("Solo números enteros.", VitalsRules.fieldError(VitalMeasure.HEART_RATE, "72,5"))
        assertEquals("Fuera de rango: 0 a 10 /10.", VitalsRules.fieldError(VitalMeasure.PAIN, "11"))
        assertEquals("Escribe un número.", VitalsRules.fieldError(VitalMeasure.HEART_RATE, "-"))
    }

    @Test fun sanitizeKeepsDigitsAndOneSeparator() {
        assertEquals("36,5", VitalsRules.sanitize(VitalMeasure.TEMPERATURE, "36,5"))
        assertEquals("36.57", VitalsRules.sanitize(VitalMeasure.TEMPERATURE, "3a6.5.7"))
        assertEquals("725", VitalsRules.sanitize(VitalMeasure.HEART_RATE, "72.5"))
    }

    @Test fun formNeedsAMeasureAndACompleteOrderedPressure() {
        assertEquals("Registra al menos una medida.", VitalsRules.formError(VitalsForm()))
        assertEquals("La presión necesita la sistólica y la diastólica.", VitalsRules.formError(VitalsForm().with(VitalMeasure.SYSTOLIC, "120")))
        assertEquals("La sistólica debe ser mayor que la diastólica.", VitalsRules.formError(VitalsForm().with(VitalMeasure.SYSTOLIC, "80").with(VitalMeasure.DIASTOLIC, "90")))
        assertNull(VitalsRules.formError(VitalsForm().with(VitalMeasure.SYSTOLIC, "120").with(VitalMeasure.DIASTOLIC, "80")))
        assertNotNull(VitalsRules.formError(VitalsForm().with(VitalMeasure.HEART_RATE, "300")))
        assertNotNull(VitalsRules.formError(VitalsForm(note = "x".repeat(501)).with(VitalMeasure.HEART_RATE, "70")))
    }

    @Test fun bodySendsOnlyFilledMeasuresWithTheirTypes() {
        val form = VitalsForm(note = " En reposo ").with(VitalMeasure.TEMPERATURE, "36,8").with(VitalMeasure.HEART_RATE, "72").with(VitalMeasure.PAIN, "3")
        val body = VitalsRules.body(form, "adm-1")
        assertEquals(36.8, body.getDouble("temperature"), 0.0)
        assertEquals(72, body.getInt("heartRate"))
        assertEquals(3, body.getInt("pain"))
        assertEquals("En reposo", body.getString("note"))
        assertEquals("adm-1", body.getString("admissionId"))
        assertFalse(body.has("systolic"))
        assertFalse(VitalsRules.body(form, null).has("admissionId"))
    }

    private fun historyJson(): JSONObject = JSONObject()
        .put("patientId", "p1").put("patientName", "Ana Pérez").put("record", "EXP-1").put("age", 34).put("admissionId", JSONObject.NULL).put("bed", JSONObject.NULL)
        .put("items", JSONArray()
            .put(JSONObject().put("id", "r2").put("takenAt", "2026-11-14T15:30:00Z").put("takenByName", "Luis Ruiz").put("consultationId", JSONObject.NULL)
                .put("systolic", 150).put("diastolic", 95).put("heartRate", 88).put("oxygenSaturation", 88).put("temperature", "36.5").put("note", "Mareo"))
            .put(JSONObject().put("id", "r1").put("takenAt", "2026-11-14T10:00:00Z").put("consultationId", "c1")
                .put("heartRate", 70).put("oxygenSaturation", 97)))

    @Test fun parserReadsHistoryAndDecimalStrings() {
        val history = VitalsParser.history(historyJson())!!
        assertEquals("Ana Pérez", history.patientName)
        assertEquals(34, history.age)
        assertNull(history.bed)
        assertEquals(2, history.readings.size)
        assertEquals(36.5, history.readings[0].values.getValue(VitalMeasure.TEMPERATURE), 0.0)
        assertEquals("Luis Ruiz", history.readings[0].takenByName)
        assertTrue(history.readings[1].fromConsultation)
        assertNull(history.readings[1].takenByName)
        assertNull(VitalsParser.history("no es objeto"))
    }

    @Test fun alertsUseTheLatestValuePerMeasureAndPutCriticalFirst() {
        val history = VitalsParser.history(historyJson())!!
        val alerts = history.alerts()
        assertEquals(VitalMeasure.OXYGEN, alerts.first().measure)
        assertEquals(VitalLevel.CRITICAL, alerts.first().level)
        assertTrue(alerts.any { it.measure == VitalMeasure.SYSTOLIC && it.level == VitalLevel.ABNORMAL })
        assertFalse(alerts.any { it.measure == VitalMeasure.HEART_RATE })
        assertEquals(VitalLevel.CRITICAL, history.latest!!.worst)
    }

    @Test fun trendRunsOldestToNewestAndSkipsMissingMeasures() {
        val history = VitalsParser.history(historyJson())!!
        assertEquals(listOf(70.0, 88.0), history.trend(VitalMeasure.HEART_RATE))
        assertEquals(listOf(36.5), history.trend(VitalMeasure.TEMPERATURE))
        assertTrue(VitalMeasure.WEIGHT !in history.trendMeasures())
        assertEquals("PA 150/95 · T 36.5°C · FC 88 · SpO2 88%", history.readings[0].summary())
    }

    @Test fun candidatesComeFromWardQueueAndSearch() {
        val ward = VitalsParser.ward(JSONArray()
            .put(JSONObject().put("patientId", "p1").put("patientName", "Ana").put("state", "hospitalizado").put("bed", "HAB-203-A"))
            .put(JSONObject().put("patientId", "p2").put("patientName", "Beto").put("state", "pendiente_cama").put("bed", ""))
            .put(JSONObject().put("patientId", "p3").put("patientName", "Carla").put("state", "alta_firmada").put("bed", "X")))
        assertEquals(listOf("Cama HAB-203-A", "Sin cama asignada"), ward.map { it.detail })
        assertEquals(2, ward.size)
        val queue = VitalsParser.queue(JSONArray()
            .put(JSONObject().put("patientId", "p1").put("patientName", "Ana").put("state", "en_espera").put("service", "consulta_general").put("numero", 4))
            .put(JSONObject().put("patientId", JSONObject.NULL).put("state", "en_espera").put("service", "emergencia").put("numero", 5))
            .put(JSONObject().put("patientId", "p4").put("patientName", "Dora").put("state", "llamado").put("service", "emergencia").put("numero", 6))
            .put(JSONObject().put("patientId", "p5").put("patientName", "Eva").put("state", "atendido").put("service", "emergencia").put("numero", 2)))
        assertEquals(listOf("Dora", "Ana"), queue.map { it.name })
        assertEquals("Emergencia · N° 6 · Llamado", queue.first().detail)
        val found = VitalsParser.search(JSONObject().put("items", JSONArray().put(JSONObject().put("id", "p9").put("record", "EXP-9").put("fullName", "Fidel").put("age", 41))))
        assertEquals("Exp. EXP-9 · 41 años", found.single().detail)
    }

    @Test fun realtimeMatchesOnlyVitalsEvents() {
        assertTrue(VitalsEvents.matches(EventoDominio("signos.registrados", "paciente", "p1", 1)))
        assertFalse(VitalsEvents.matches(EventoDominio("cama.estado_cambiado", "cama", "c1", 1)))
    }
}
