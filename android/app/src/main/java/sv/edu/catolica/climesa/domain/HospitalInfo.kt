package sv.edu.catolica.climesa.domain

import org.json.JSONObject

/** A10 · información pública del hospital (spec 112): solo agregados y datos públicos, nunca pacientes. */
data class FloorOccupancy(val floor: Int?, val category: String, val beds: Int, val free: Int)
data class DoctorOnDuty(val name: String, val specialty: String, val area: String?, val until: String)
data class PublicNotice(val id: String, val title: String, val body: String, val until: String)

data class HospitalInfo(
    val occupancy: List<FloorOccupancy> = emptyList(),
    val doctors: List<DoctorOnDuty> = emptyList(),
    val notices: List<PublicNotice> = emptyList(),
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

    /** Camas libres de total por planta, sumando los tipos de habitación. */
    fun byFloor(rows: List<FloorOccupancy>): List<Triple<Int?, Int, Int>> =
        rows.groupBy { it.floor }.map { (floor, list) -> Triple(floor, list.sumOf { it.free }, list.sumOf { it.beds }) }
            .sortedWith(compareBy(nullsLast<Int>()) { it.first })

    val categoryLabels = mapOf("vip" to "VIP", "semiprivada" to "Semiprivada")
}

/**
 * Eventos del canal `publico` (tiempo-real.md): los agregados de cama, fila y turnos llegan con entidad
 * `publico`, y los avisos con `aviso.publicado`.
 */
object HospitalInfoEvents {
    fun matches(event: EventoDominio) = event.entity == "publico" || event.type == "aviso.publicado"
}
