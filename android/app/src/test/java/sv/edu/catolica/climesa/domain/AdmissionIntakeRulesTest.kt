package sv.edu.catolica.climesa.domain

import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AdmissionIntakeRulesTest {
    private val now = Instant.parse("2026-11-20T14:30:00Z") // 08:30 en El Salvador
    private val bed = IntakeBed("b1", 3, "C-201", "r1", "H-201", 2, "semiprivada", 2, true, null, true)
    private val full = AdmissionDraft(
        patient = PickerPatient("p9", "EXP-9", "Paciente Ficticio", 41), origin = OriginKind.APPOINTMENT,
        originRecord = OriginRecord("c1", OriginKind.APPOINTMENT, "Cita del 19/11/2026", ""), motive = "Dolor abdominal con fiebre", at = "2026-11-20 08:30",
        doctor = IntakeDoctor("d1", "Dra. Ficticia", null, true, null), category = "semiprivada", bed = bed,
    )

    @Test fun eachStepExplainsWhatIsMissing() {
        assertNotNull(AdmissionIntake.stepError(0, AdmissionDraft(), true, now = now))
        assertNotNull(AdmissionIntake.stepError(1, full.copy(origin = null, originRecord = null), true, now = now))
        assertEquals("Elige el registro de origen del paciente.", AdmissionIntake.stepError(1, full.copy(originRecord = null), true, now = now))
        assertTrue(AdmissionIntake.stepError(1, full.copy(motive = "corto"), true, now = now)!!.contains("motivo"))
        assertNull(AdmissionIntake.stepError(1, full, true, now = now))
    }

    @Test fun aDoctorWithoutShiftCannotBeUsed() {
        val grey = full.copy(doctor = IntakeDoctor("d2", "Dr. Sin Turno", null, false, "Sin turno en ese horario"))
        assertTrue(AdmissionIntake.stepError(2, grey, true, now = now)!!.contains("Sin turno en ese horario"))
        assertNotNull(AdmissionIntake.stepError(2, full.copy(at = "mañana"), true, now = now))
        assertNull(AdmissionIntake.stepError(2, full, true, now = now))
    }

    @Test fun theBedIsRequiredOnlyForAnImmediateAdmissionWithBedPermission() {
        val noBed = full.copy(bed = null)
        assertEquals("Elige una cama compatible.", AdmissionIntake.stepError(5, noBed, true, now = now))
        assertNull(AdmissionIntake.stepError(5, noBed, false, now = now))
        assertNull(AdmissionIntake.stepError(5, noBed.copy(at = "2026-11-22 08:30"), true, now = now))
    }

    @Test fun visitorsFollowTheCategory() {
        assertNull(AdmissionIntake.visitorError(false, 0, "vip"))
        assertNotNull(AdmissionIntake.visitorError(false, 1, "vip"))
        assertNotNull(AdmissionIntake.visitorError(true, 0, "vip"))
        assertTrue(AdmissionIntake.visitorError(true, 2, "semiprivada")!!.contains("hasta 1"))
        assertNull(AdmissionIntake.visitorError(true, 3, "vip"))
    }

    @Test fun theBodyCarriesTheBedOnlyWhenImmediate() {
        val body = AdmissionIntake.body(full.copy(unstable = true), true, now)!!
        assertEquals("cita", body.getString("origin")); assertEquals("c1", body.getString("originId"))
        assertEquals("Dolor abdominal con fiebre", body.getString("motive")); assertEquals("2026-11-20T14:30:00Z", body.getString("scheduledAt"))
        assertEquals("b1", body.getString("bedId")); assertEquals(3, body.getInt("bedVersion")); assertTrue(body.getBoolean("unstable"))
        assertFalse(AdmissionIntake.body(full, false, now)!!.has("bedId"))
        assertFalse(AdmissionIntake.body(full.copy(at = "2026-11-22 08:30"), true, now)!!.has("bedId"))
        assertEquals(0, AdmissionIntake.body(full.copy(visitorsAllowed = false, visitorsMax = 0), true, now)!!.getInt("visitorsMax"))
        assertEquals("gotitas", AdmissionIntake.body(full.copy(isolation = true, isolationType = IsolationType.DROPLET), true, now)!!.getString("isolationType"))
    }

    @Test fun theFeasibilityPathCarriesEveryCondition() {
        val path = AdmissionIntake.feasibilityPath(full, true, now)!!
        assertTrue(path.startsWith("/admisiones/factibilidad?patientId=p9&origin=cita&originId=c1&doctorId=d1"))
        assertTrue(path.contains("category=semiprivada")); assertTrue(path.contains("bedId=b1"))
    }

    @Test fun anIncompleteDraftNeverBuildsABodyAndSaysWhatIsMissing() {
        assertNull(AdmissionIntake.body(full.copy(doctor = null), true, now))
        assertEquals("Elige al médico tratante.", AdmissionIntake.missing(full.copy(doctor = null)))
        assertNull(AdmissionIntake.body(full.copy(originRecord = null), true, now))
        assertEquals("Elige el registro de origen del paciente.", AdmissionIntake.missing(full.copy(originRecord = null)))
        assertNull(AdmissionIntake.feasibilityPath(full.copy(patient = null), true, now))
        assertNull(AdmissionIntake.missing(full))
    }

    @Test fun parsesTheApiAnswersAndGroupsBedsByFloorAndRoom() {
        val map = AdmissionIntake.bedMap(JSONObject("""{"categories":[{"category":"vip","free":0,"compatible":0}],"beds":[
            {"id":"b1","version":3,"code":"C-201","roomId":"r1","room":"H-201","floor":2,"category":"semiprivada","capacity":2,"compatible":true,"reason":null,"suggested":true},
            {"id":"b2","version":1,"code":"C-202","roomId":"r1","room":"H-201","floor":2,"category":"semiprivada","capacity":2,"compatible":false,"reason":"Ocupada","suggested":false},
            {"id":"b3","version":1,"code":"C-101","roomId":"r2","room":"H-101","floor":1,"category":"semiprivada","capacity":1,"compatible":true,"reason":null,"suggested":false}]}"""))
        assertFalse(map.categories.single().selectable)
        val floors = AdmissionIntake.floors(map.beds)
        assertEquals(listOf(1, 2), floors.map { it.floor })
        assertEquals(2, floors[1].rooms.single().beds.size)
        assertEquals("Ocupada", map.beds[1].reason)
        val doctors = AdmissionIntake.doctors(JSONArray("""[{"id":"d2","name":"Dr. Sin Turno","specialty":null,"available":false,"reason":"Sin turno en ese horario"}]"""))
        assertFalse(doctors.single().available); assertEquals("Sin turno en ese horario", doctors.single().reason)
        assertEquals(1, AdmissionIntake.origins(JSONArray("""[{"id":"e1","origin":"emergencia","label":"Emergencia","detail":""},{"id":"x","origin":"otra","label":"?","detail":""}]""")).size)
    }
}
