package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

/** One floor of the ward with how many patients are in it; [level] null groups beds the API gives no floor for. */
data class FloorCount(val level: Int?, val patients: Int)

/**
 * Lote 5 S10: nurses work every floor ("si hay una emergencia ... se necesitaria a disposicion todos los pisos"). Their floor is
 * a default filter of the ward, with «Todos los pisos» always one tap away, never a limit. `/admisiones` has no floor, so the
 * floor of each patient comes from the bed board (`/camas`, `code` and `level`).
 */
object NurseFloors {
    /** Admission states that hold a bed: the patients a nurse has on a floor. */
    val IN_BED = setOf("hospitalizado", "alta_firmada")

    private fun rows(value: Any?): List<JSONObject> = (value as? JSONArray)?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) } }.orEmpty()

    /** Bed code to floor, from `/camas`; beds without `level` are left out. */
    fun bedFloors(beds: Any?): Map<String, Int> = rows(beds)
        .filter { it.optString("code").isNotBlank() && it.has("level") && !it.isNull("level") }
        .associate { it.optString("code") to it.optInt("level") }

    /** Patients in a bed per floor, lower floors first and the unknown floor last. */
    fun patientsByFloor(admissions: Any?, floors: Map<String, Int>): List<FloorCount> = rows(admissions)
        .filter { it.optString("state") in IN_BED && it.optString("bed").isNotBlank() }
        .groupingBy { floors[it.optString("bed")] }.eachCount()
        .map { (level, n) -> FloorCount(level, n) }
        .sortedWith(compareBy(nullsLast()) { it.level })

    fun label(level: Int?) = level?.let { "Piso $it" } ?: "Sin piso"

    /** Floors of the ward rows for the filter chips, with their patient count. */
    fun floorsOf(admissions: List<HospitalAdmission>, floors: Map<String, Int>): List<FloorCount> = admissions
        .filter { it.bed.isNotBlank() }
        .groupingBy { floors[it.bed] }.eachCount()
        .map { (level, n) -> FloorCount(level, n) }
        .sortedWith(compareBy(nullsLast()) { it.level })

    /**
     * The nurse's default floor: the number in the name of the area of the shift in progress ("Planta 2", "Piso 3 · Medicina"),
     * when the ward has that floor. Anything else means «Todos los pisos» (null).
     */
    fun defaultFloor(shiftArea: String?, available: Collection<Int?>): Int? {
        val number = shiftArea?.let { Regex("(?i)\\b(planta|piso)\\s*(\\d+)").find(it)?.groupValues?.get(2)?.toIntOrNull() } ?: return null
        return number.takeIf { it in available }
    }

    /** Rows of [floor]; null is «Todos los pisos» and returns every row. Rows without a bed stay visible on every floor. */
    fun filter(admissions: List<HospitalAdmission>, floors: Map<String, Int>, floor: Int?): List<HospitalAdmission> =
        if (floor == null) admissions else admissions.filter { it.bed.isBlank() || floors[it.bed] == floor }
}
