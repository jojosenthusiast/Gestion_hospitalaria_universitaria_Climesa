package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

/** Persona del personal de salud tal como la devuelve `GET /personal`. */
data class StaffMember(
    val id: String, val givenNames: String, val surnames: String, val type: String, val specialty: String,
    val areaId: String?, val phone: String, val dui: String?, val active: Boolean, val version: Int,
) {
    val fullName get() = "$givenNames $surnames"
}

/** Lo escrito en el formulario de personal (`POST /personal`, `PATCH /personal/{id}`). */
data class StaffDraft(
    val givenNames: String = "", val surnames: String = "", val type: String = "otro", val specialty: String = "",
    val areaId: String = "", val phone: String = "", val dui: String = "",
) {
    companion object {
        fun from(m: StaffMember) = StaffDraft(m.givenNames, m.surnames, m.type, m.specialty, m.areaId.orEmpty(), m.phone, m.dui.orEmpty())
    }
}

/**
 * Personal de salud (FR-103). Todo se pregunta por permiso del catálogo (regla 8): `personal.ver` para listar,
 * `personal.gestionar` para crear, editar e inactivar, `personal.ver_datos_personales` para DUI y teléfono.
 * La inactivación es un `PATCH` con `active: false`, con versión y motivo; nunca borra.
 */
object StaffRules {
    const val VIEW = "personal.ver"
    const val MANAGE = "personal.gestionar"
    const val VIEW_PERSONAL_DATA = "personal.ver_datos_personales"
    val typeCodes = listOf("medico", "enfermero", "asistente", "recepcionista", "laboratorista", "paramedico", "motorista", "limpieza", "administrativo", "otro")

    fun canView(permissions: Collection<String>) = VIEW in permissions
    fun canManage(permissions: Collection<String>) = VIEW in permissions && MANAGE in permissions
    fun canSeePersonalData(permissions: Collection<String>) = VIEW_PERSONAL_DATA in permissions

    fun typeLabel(code: String) = StaffLabels.function(code)

    fun validate(d: StaffDraft): Map<String, String> = buildMap {
        if (d.givenNames.trim().length !in 2..80 || d.givenNames.none(Char::isLetter)) put("givenNames", "Escribe nombres válidos (2 a 80 caracteres).")
        if (d.surnames.trim().length !in 2..100 || d.surnames.none(Char::isLetter)) put("surnames", "Escribe apellidos válidos (2 a 100 caracteres).")
        if (d.type !in typeCodes) put("type", "Elige la función del personal.")
        if (d.specialty.trim().length > 120) put("specialty", "La especialidad no puede pasar de 120 caracteres.")
        if (d.phone.isNotBlank() && !d.phone.matches(Regex("[267][0-9]{3}-?[0-9]{4}"))) put("phone", "Usa un teléfono de 8 dígitos: 7000-0000.")
        if (d.dui.isNotBlank() && (!d.dui.matches(Regex("[0-9]{8}-?[0-9]")) || !PatientRules.validDui(d.dui))) put("dui", "Usa 9 dígitos con un verificador válido.")
    }

    private fun payload(d: StaffDraft): JSONObject = JSONObject()
        .put("givenNames", d.givenNames.trim()).put("surnames", d.surnames.trim()).put("type", d.type)
        .put("specialty", d.specialty.trim()).put("areaId", if (d.areaId.isBlank()) JSONObject.NULL else d.areaId)
        .put("phone", d.phone.trim()).put("dui", d.dui.trim())

    fun createBody(d: StaffDraft): JSONObject = payload(d)

    /** Editar o inactivar: la API pide la versión y un motivo de 10 a 500 caracteres. */
    fun updateBody(d: StaffDraft, active: Boolean, version: Int, reason: String): JSONObject =
        payload(d).put("active", active).put("version", version).put("reason", reason.trim())

    /** Texto no vacío; `null` del JSON cuenta como ausente (org.json devolvería la cadena "null"). */
    private fun text(r: JSONObject, key: String): String? =
        if (!r.has(key) || r.isNull(key)) null else r.optString(key).takeIf { it.isNotBlank() }

    fun parse(rows: JSONArray): List<StaffMember> = (0 until rows.length()).map { i ->
        val r = rows.getJSONObject(i)
        StaffMember(
            id = r.getString("id"), givenNames = r.optString("givenNames"), surnames = r.optString("surnames"),
            type = r.optString("type", "otro"), specialty = r.optString("specialty"),
            areaId = text(r, "areaId"), phone = text(r, "phone").orEmpty(),
            dui = text(r, "dui"), active = r.optBoolean("active", true),
            version = r.optInt("version", 1),
        )
    }
}
