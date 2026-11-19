package sv.edu.catolica.climesa.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import sv.edu.catolica.climesa.domain.AmbulanceForms
import sv.edu.catolica.climesa.domain.AmbulanceLogEntry
import sv.edu.catolica.climesa.domain.AmbulanceMilestone
import sv.edu.catolica.climesa.domain.AmbulanceReadiness
import sv.edu.catolica.climesa.domain.AmbulanceReadiness.State
import sv.edu.catolica.climesa.domain.AmbulanceService
import sv.edu.catolica.climesa.domain.AmbulanceSigns
import sv.edu.catolica.climesa.domain.AmbulanceStatus
import sv.edu.catolica.climesa.domain.AmbulanceTimeline
import sv.edu.catolica.climesa.domain.AmbulanceUnit
import sv.edu.catolica.climesa.domain.DispatchBlock
import sv.edu.catolica.climesa.domain.ParamedicRules

/** Lote 5 S8: dispatch blocker text, readiness checklist, bitácora order and the crew-only filter rule. */
class Lote5AmbulanceRulesTest {
    private fun status(state: String = "disponible", service: AmbulanceService? = null, paramedic: Boolean = true, driver: Boolean = true, block: DispatchBlock? = null) =
        AmbulanceStatus(AmbulanceUnit("u1", "P-123", state, 3), service, paramedic, emptyList(), block, driver)

    private fun service(milestones: List<AmbulanceMilestone> = emptyList()) =
        AmbulanceService("s1", "emergencia_domicilio", "roja", "Colonia Escalón", "Hospital CLIMESA", "2026-11-19T14:00:00Z", false, emptyList(), milestones, emptyList())

    @Test fun blockerSaysTheApiReasonAndNextStepForDispatch() {
        val block = DispatchBlock("sin_motorista_de_turno", "No hay motorista con turno en curso.", "Publica el turno del motorista.")
        val blocker = AmbulanceReadiness.blocker(status(driver = false, block = block))!!
        assertEquals("No se puede despachar", blocker.title)
        assertEquals("No hay motorista con turno en curso. Publica el turno del motorista.", blocker.reason)
        assertEquals(AmbulanceReadiness.Tone.DANGER, blocker.tone)
        // Roles that cannot dispatch read the reason without the dispatcher's next step, like the web.
        assertEquals("No hay motorista con turno en curso.", AmbulanceReadiness.blocker(status(block = block), withAction = false)!!.reason)
    }

    @Test fun busyUnitBlockerIsAWarningThatWaitsForTheService() {
        val blocker = AmbulanceReadiness.blocker(status("en_servicio", service(), block = DispatchBlock("en_servicio", "La unidad atiende un servicio.", "")))!!
        assertEquals(AmbulanceReadiness.Tone.WARNING, blocker.tone)
        assertEquals("La unidad atiende un servicio. Despacha cuando la unidad termine ese servicio.", blocker.reason)
    }

    @Test fun blankApiMessageFallsBackToTheCodeAndNoBlockMeansNoBlocker() {
        assertEquals("La unidad está en mantenimiento.", AmbulanceReadiness.blocker(status("en_mantenimiento", block = DispatchBlock("en_mantenimiento", "", "")), withAction = false)!!.reason)
        assertNull(AmbulanceReadiness.blocker(status()))
    }

    @Test fun checklistMarksEachLineReadyMissingOrBusy() {
        assertEquals(
            listOf("Sin servicio activo" to State.OK, "Paramédico con turno en curso" to State.OK, "Sin motorista con turno en curso" to State.MISSING),
            AmbulanceReadiness.checklist(status(driver = false)).map { it.text to it.state },
        )
        assertEquals(
            listOf("Servicio en curso: emergencia a domicilio" to State.BUSY, "Sin paramédico con turno en curso" to State.MISSING, "Motorista con turno en curso" to State.OK),
            AmbulanceReadiness.checklist(status("en_servicio", service(), paramedic = false)).map { it.text to it.state },
        )
        assertEquals("Unidad en mantenimiento", AmbulanceReadiness.checklist(status("en_mantenimiento"))[1].text)
    }

    @Test fun noActiveServiceIsClaimedOnlyWhenTheApiSaysSo() {
        assertTrue(AmbulanceReadiness.noActiveService(status()))
        // A unit in service whose detail did not come never reads «Sin servicio activo».
        assertFalse(AmbulanceReadiness.noActiveService(status("en_servicio")))
        assertEquals(State.BUSY to "Servicio en curso", AmbulanceReadiness.checklist(status("en_servicio")).first().let { it.state to it.text })
    }

    @Test fun timelineOrdersByTimeAndMarksTheNextStep() {
        val steps = AmbulanceTimeline.of(service(listOf(AmbulanceMilestone("en_escena", "2026-11-19T14:20:00Z"), AmbulanceMilestone("salida", "2026-11-19T14:02:00Z"))))
        assertEquals(listOf("despacho", "salida", "en_escena", "trasladando", "en_hospital", "finalizado"), steps.map { it.code })
        assertEquals(listOf(true, true, true, false, false, false), steps.map { it.done })
        assertEquals("trasladando", steps.single { it.current }.code)
        assertEquals(listOf("Despacho", "Paramédico"), steps.take(2).map { it.author })
    }

    @Test fun finishedLogEntryShowsOnlyWhatHappenedWithItsFinalState() {
        val entry = AmbulanceLogEntry("s1", "emergencia_domicilio", "roja", "A", "B", "2026-11-19T14:00:00Z", "sin_traslado", 10,
            milestones = listOf(AmbulanceMilestone("finalizado", "2026-11-19T14:40:00Z"), AmbulanceMilestone("salida", "2026-11-19T14:02:00Z"), AmbulanceMilestone("en_escena", "2026-11-19T14:12:00Z")))
        val steps = AmbulanceTimeline.of(entry)
        assertEquals(listOf("despacho", "salida", "en_escena", "finalizado"), steps.map { it.code })
        assertEquals("Finalizado: sin traslado", steps.last().label)
        assertTrue(steps.none { it.current })
    }

    @Test fun signsAreWrittenInFullWords() {
        assertEquals(
            listOf("Presión arterial" to "120/80 mmHg", "Frecuencia cardiaca" to "110 latidos por minuto", "Saturación de oxígeno" to "94 %", "Escala de Glasgow" to "14 de 15"),
            AmbulanceSigns.inFull(mapOf("systolic" to "120", "diastolic" to "80", "heartRate" to "110", "oxygenSaturation" to "94", "glasgow" to "14")),
        )
    }

    @Test fun requestFormErrorsSitOnEachFieldInScreenOrder() {
        assertEquals(listOf(AmbulanceForms.REASON, AmbulanceForms.ADDRESS, AmbulanceForms.PHONE), AmbulanceForms.requestErrors("", "", "12").keys.toList())
        assertTrue(AmbulanceForms.requestErrors("Colonia Escalón", "Dolor de pecho", "7777-1234").isEmpty())
        assertEquals("Indica el motivo, de al menos 5 caracteres.", AmbulanceForms.reasonError("no"))
    }

    @Test fun paramedicBlockerUsesItsTitleAndIgnoresTheRunningService() {
        assertNull(ParamedicRules.blocker(DispatchBlock("en_servicio", "En servicio.", ""), canPlanShifts = false))
        val blocker = ParamedicRules.blocker(DispatchBlock("en_mantenimiento", "La unidad está en mantenimiento.", ""), canPlanShifts = false)!!
        assertEquals("La unidad no puede salir", blocker.title)
        assertEquals("La unidad está en mantenimiento. Jefatura de Operaciones debe sacar la unidad de mantenimiento.", blocker.reason)
    }

    @Test fun onlyCrewThatDoesNotDispatchLosesTheLogFilters() {
        assertTrue(ParamedicRules.crewOnly(setOf("ambulancia.operar")))
        assertFalse(ParamedicRules.crewOnly(setOf("ambulancia.operar", "ambulancia.despachar")))
        assertFalse(ParamedicRules.crewOnly(setOf("ambulancia.despachar")))
    }
}
