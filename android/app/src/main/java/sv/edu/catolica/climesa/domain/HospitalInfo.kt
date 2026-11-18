package sv.edu.catolica.climesa.domain

import org.json.JSONObject

/** A10 · información pública del hospital (spec 112): solo agregados y datos públicos, nunca pacientes. */
data class FloorOccupancy(val floor: Int?, val category: String, val beds: Int, val free: Int)
data class DoctorOnDuty(val name: String, val specialty: String, val area: String?, val until: String)
data class PublicNotice(val id: String, val title: String, val body: String, val until: String)

/** `GET /publico/hospital`: name, address and phone of the hospital and its coordinates (iOS «Ubicación»). */
data class HospitalLocation(
    val name: String,
    val address: String,
    val municipality: String,
    val department: String,
    val phone: String,
    val latitude: Double?,
    val longitude: Double?,
) {
    /** `tel:` with digits only; null when the hospital has no usable phone. */
    val callUri: String? get() = phone.filter(Char::isDigit).takeIf { it.isNotEmpty() }?.let { "tel:$it" }
    /** `geo:` at the coordinates with the name as label; a name search when the coordinates are missing. */
    val mapUri: String get() {
        val label = java.net.URLEncoder.encode(name, "UTF-8").replace("+", "%20")
        return if (latitude != null && longitude != null) "geo:$latitude,$longitude?q=$latitude,$longitude($label)" else "geo:0,0?q=$label"
    }
}

/** One part of the screen; a part that failed shows its own notice and the rest stays on screen (iOS `Part`). */
enum class HospitalInfoPart { LOCATION, OCCUPANCY, DOCTORS, NOTICES }

data class HospitalInfo(
    val occupancy: List<FloorOccupancy> = emptyList(),
    val doctors: List<DoctorOnDuty> = emptyList(),
    val notices: List<PublicNotice> = emptyList(),
    val location: HospitalLocation? = null,
    val failed: Set<HospitalInfoPart> = emptySet(),
)

object HospitalInfoParser {
    fun occupancy(value: Any?): List<FloorOccupancy> {
        val rows = (value as? JSONObject)?.optJSONArray("ocupacion") ?: return emptyList()
        return (0 until rows.length()).mapNotNull { i -> rows.optJSONObject(i)?.let { r ->
            FloorOccupancy(if (r.isNull("planta")) null else r.optInt("planta"), r.optString("categoria"), r.optInt("camas"), r.optInt("libres"))
        } }
    }

    fun doctors(value: Any?): List<DoctorOnDuty> {
        val rows = (value as? JSONObject)?.optJSONArray("medicos") ?: return emptyList()
        return (0 until rows.length()).mapNotNull { i -> rows.optJSONObject(i)?.let { r ->
            DoctorOnDuty(r.optString("nombre"), r.optString("especialidad"), r.optString("area").takeUnless { r.isNull("area") || it.isBlank() }, r.optString("hasta"))
        } }
    }

    fun notices(value: Any?): List<PublicNotice> {
        val rows = (value as? JSONObject)?.optJSONArray("avisos") ?: return emptyList()
        return (0 until rows.length()).mapNotNull { i -> rows.optJSONObject(i)?.let { r ->
            PublicNotice(r.optString("id"), r.optString("titulo"), r.optString("cuerpo"), r.optString("hasta"))
        } }
    }

    fun location(value: Any?): HospitalLocation? {
        val r = value as? JSONObject ?: return null
        val name = r.optString("nombre").takeIf { it.isNotBlank() } ?: return null
        fun coordinate(key: String) = if (r.isNull(key) || !r.has(key)) null else r.optDouble(key).takeIf { !it.isNaN() }
        return HospitalLocation(name, r.optString("direccion"), r.optString("municipio"), r.optString("departamento"), r.optString("telefono"), coordinate("latitud"), coordinate("longitud"))
    }

    /** Camas libres de total por planta, sumando los tipos de habitación. */
    fun byFloor(rows: List<FloorOccupancy>): List<Triple<Int?, Int, Int>> =
        rows.groupBy { it.floor }.map { (floor, list) -> Triple(floor, list.sumOf { it.free }, list.sumOf { it.beds }) }
            .sortedWith(compareBy(nullsLast<Int>()) { it.first })

    val categoryLabels = mapOf("vip" to "VIP", "semiprivada" to "Semiprivada")
}

/**
 * Eventos del canal `publico` (tiempo-real.md): los agregados de cama, fila y turnos llegan con entidad
 * `publico`, y los avisos con entidad `aviso` (`aviso.publicado`, y `aviso.actualizado` al editarlos o retirarlos, MA-AVI-02).
 */
object HospitalInfoEvents {
    fun matches(event: EventoDominio) = event.entity == "publico" || NoticeEvents.matches(event)
}
