package sv.edu.catolica.climesa.domain

import java.text.Normalizer
import java.time.LocalDate
import java.time.Instant
import java.util.Locale
import java.util.UUID

enum class Sex(val label: String) { FEMALE("Femenino"), MALE("Masculino"), INDETERMINATE("Indeterminado"), UNKNOWN("No registrado") }
data class Patient(val id: String = UUID.randomUUID().toString(), val record: String,
    val givenNames: String, val surnames: String, val dui: String?, val birth: LocalDate?,
    val sex: Sex, val phone: String, val active: Boolean = true, val version: Int = 1,
    /** Record email; null when the role does not see contact data (the API leaves the field out). */
    val email: String? = null,
    /** `appAccount` of the record (U12): vinculada, sin_cuenta or correo_repetido; null without contact data. */
    val appAccount: String? = null) {
    val fullName get() = "$givenNames $surnames"
}
data class PatientDraft(val givenNames: String = "", val surnames: String = "", val dui: String = "",
    val birth: String = "", val sex: Sex = Sex.UNKNOWN, val phone: String = "",
    /** Null when the email is not shown to this role: then the save never sends it, so it is never cleared by mistake. */
    val email: String? = null) {
    companion object { fun from(p: Patient) = PatientDraft(p.givenNames,p.surnames,p.dui.orEmpty(),p.birth?.toString().orEmpty(),p.sex,p.phone,p.email) }
}
data class AuditEvent(val record: String, val action: String, val reason: String, val version: Int,
    val at: String = Instant.now().toString(), val changes: Map<String,String> = emptyMap())
data class Registry(val patients: List<Patient>, val audit: List<AuditEvent> = emptyList(), val nextSequence: Long = 6, val totalActive: Int? = null, val totalInactive: Int? = null)

/**
 * U12: the record email links the patient's app account on its own (verified email). The API refuses an email already on
 * another active record (`correo_en_uso`) or owned by an account joined to another record (`correo_de_otra_cuenta`); the
 * form shows that 409 on the email field, with the API text, which names the other record (web `EMAIL_CONFLICTS`).
 */
object PatientEmail {
    const val FORMAT_ERROR = "Revisa el correo: falta el @ o el dominio."
    val CONFLICTS = setOf("correo_en_uso", "correo_de_otra_cuenta")

    /** The field message for an email 409; null for any other code. */
    fun conflict(code: String?, message: String?): String? {
        if (code !in CONFLICTS) return null
        return message?.trim()?.takeIf { it.isNotBlank() } ?: when (code) {
            "correo_en_uso" -> "Ese correo ya está en otro expediente activo. Cada correo puede estar en un solo expediente activo: revisa si es la misma persona o usa otro correo."
            else -> "Ese correo es de una cuenta de la app que ya está unida a otro expediente. Revisa si es la misma persona antes de usarlo aquí."
        }
    }

    /** The record's «Cuenta de la app» line, the same words as the web (`appAccountNames`). */
    fun appAccount(state: String?): String? = when (state) {
        "vinculada" -> "Vinculada"
        "sin_cuenta" -> "Sin cuenta todavía"
        "correo_repetido" -> "Sin vincular: otro expediente activo tiene este mismo correo. Corrige uno de los dos."
        else -> null
    }
}

/** Datos extra del 409 de registro: `dui_duplicado` (paciente) y `posible_duplicado` (candidatos). */
object PatientDuplicates {
    private fun root(body: String?) = runCatching { org.json.JSONObject(body.orEmpty()) }.getOrNull()
    fun similar(body: String?): List<String> {
        val root = root(body) ?: return emptyList()
        if (root.optString("codigo") != "posible_duplicado") return emptyList()
        val rows = root.optJSONArray("candidatos") ?: return emptyList()
        return (0 until rows.length()).mapNotNull { rows.optJSONObject(it) }.map { "${it.optString("fullName")} · ${it.optString("record")}" }
    }
    fun existing(body: String?): String? {
        val root = root(body) ?: return null
        if (root.optString("codigo") != "dui_duplicado") return null
        val p = root.optJSONObject("paciente") ?: return null
        return "${p.optString("fullName")} · ${p.optString("record")}"
    }
}

object PatientRules {
    fun normalize(s: String): String = Normalizer.normalize(s.lowercase(Locale.ROOT),Normalizer.Form.NFD)
        .replace(Regex("\\p{M}"),"").replace(Regex("[^a-z0-9]+")," ").trim()
    fun digits(s: String) = s.filter { it in '0'..'9' }
    fun validDui(s: String): Boolean {
        val n=digits(s)
        return n.length==9 && n.take(8).any { it!='0' } &&
            (10 - n.take(8).mapIndexed { i,c -> (c - '0') * (9 - i) }.sum() % 10) % 10 == n.last() - '0'
    }
    /**
     * Rellena el formulario de registro con lo que se buscó, para no volver a escribirlo: un DUI va al campo DUI;
     * un nombre se reparte entre nombres y apellidos; cualquier otra cosa (expediente, fecha) no se copia.
     */
    fun prefill(query: String): PatientDraft {
        val text = query.trim()
        if (Regex("[0-9]{8}-?[0-9]").matches(text)) return PatientDraft(dui = formatDui(text))
        if (text.any { it.isDigit() }) return PatientDraft()
        val words = text.split(Regex("\\s+")).filter(String::isNotBlank)
        return when {
            words.isEmpty() -> PatientDraft()
            words.size == 1 -> PatientDraft(givenNames = words[0])
            else -> { val n = if (words.size >= 4) 2 else 1; PatientDraft(givenNames = words.take(n).joinToString(" "), surnames = words.drop(n).joinToString(" ")) }
        }
    }
    fun formatDui(s: String): String { val n=digits(s);return if(n.length==9) "${n.take(8)}-${n.last()}" else s }
    fun record(sequence: Long): String {
        val body=sequence.toString().padStart(7,'0');var accumulator=0
        body.forEach { accumulator=((accumulator+(it-'0'))*2)%11 }
        val check=(12-accumulator%11)%11
        return "$body-${if(check==10) "X" else check.toString()}"
    }
    fun validate(d: PatientDraft,today: LocalDate): Map<String,String> = buildMap {
        fun nameValid(s: String,max: Int) = s.trim().length in 2..max && s.any(Char::isLetter) && s.matches(Regex("[\\p{L}\\p{M} .’'-]+"))
        if(!nameValid(d.givenNames,80)) put("givenNames","Escribe nombres válidos (2 a 80 caracteres, sin números).")
        if(!nameValid(d.surnames,100)) put("surnames","Escribe apellidos válidos (2 a 100 caracteres, sin números).")
        if(d.dui.isNotBlank() && (!d.dui.matches(Regex("[0-9]{8}-?[0-9]")) || !validDui(d.dui))) put("dui","Usa 9 dígitos con un verificador válido.")
        if(d.phone.isNotBlank() && !d.phone.matches(Regex("[267][0-9]{3}-?[0-9]{4}"))) put("phone","Usa un teléfono de 8 dígitos: 7000-0000.")
        d.email?.trim()?.takeIf(String::isNotBlank)?.let { if(!it.matches(Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))) put("email",PatientEmail.FORMAT_ERROR) }
        if(d.birth.isNotBlank()) {
            val date=runCatching { LocalDate.parse(d.birth) }.getOrNull()
            if(date==null || date>today || date<today.minusYears(120)) put("birth","Usa AAAA-MM-DD, sin fechas futuras ni mayores a 120 años.")
        }
    }
    fun matches(p: Patient,query: String): Boolean {
        val text=normalize("${p.fullName} ${p.record} ${p.dui.orEmpty()}")
        return normalize(query).split(' ').filter(String::isNotBlank).all { text.contains(it) } ||
            (digits(query).length>=4 && p.dui?.let { digits(it).contains(digits(query)) }==true)
    }
    fun save(r: Registry,d: PatientDraft,today: LocalDate,id: String?=null,expectedVersion: Int?=null,reason: String="Registro tras búsqueda"): Registry {
        require(validate(d,today).isEmpty()) { "Revisa los campos del formulario." }
        val old=id?.let { key -> r.patients.firstOrNull { it.id==key } ?: error("El paciente ya no está disponible.") }
        require(old==null || old.version==expectedVersion) { "La ficha cambió. Vuelve a abrirla antes de guardar." }
        require(old==null || ChangeReason.error(reason)==null) { ChangeReason.error(reason) ?: "" }
        val dui=d.dui.takeIf(String::isNotBlank)?.let(::formatDui)
        val duplicate=r.patients.firstOrNull { it.id!=id && dui!=null && it.dui==dui }
        require(duplicate==null) { "Ese DUI ya pertenece al expediente ${duplicate?.record}, aunque esté inactivo." }
        val p=Patient(id=old?.id ?: UUID.randomUUID().toString(),record=old?.record ?: record(r.nextSequence),givenNames=d.givenNames.trim(),
            surnames=d.surnames.trim(),dui=dui,birth=d.birth.takeIf(String::isNotBlank)?.let(LocalDate::parse),sex=d.sex,phone=d.phone.trim(),active=old?.active ?: true,version=(old?.version ?: 0)+1)
        val changes=buildMap {
            fun changed(label:String,before:String?,after:String?) {
                val a=before?.takeIf(String::isNotBlank);val b=after?.takeIf(String::isNotBlank)
                if(a!=b) put(label,"${a ?: "Sin registrar"} → ${b ?: "Sin registrar"}")
            }
            changed("Nombres",old?.givenNames,p.givenNames);changed("Apellidos",old?.surnames,p.surnames)
            changed("DUI",old?.dui,p.dui);changed("Nacimiento",old?.birth?.toString(),p.birth?.toString())
            changed("Sexo",old?.sex?.label,p.sex.label);changed("Teléfono",old?.phone,p.phone)
        }
        return r.copy(patients=if(old==null) r.patients+p else r.patients.map { if(it.id==id) p else it },
            nextSequence=r.nextSequence+if(old==null) 1 else 0,
            audit=r.audit+AuditEvent(p.record,if(old==null) "Registro" else "Edición",reason.trim(),p.version,changes=changes))
    }
    fun setActive(r:Registry,id:String,version:Int,active:Boolean,reason:String):Registry {
        require(ChangeReason.error(reason)==null) { ChangeReason.error(reason) ?: "" }
        val old=r.patients.first { it.id==id }
        require(old.version==version) { "La ficha cambió. Vuelve a abrirla." }
        val p=old.copy(active=active,version=old.version+1)
        return r.copy(patients=r.patients.map { if(it.id==id) p else it },audit=r.audit+AuditEvent(p.record,if(active) "Reactivación" else "Inactivación",reason.trim(),p.version))
    }
}

/** Age and sex for the patient list (obs 15): "34 años · Femenino". Unknown parts are left out; DUI never goes in the list. */
object PatientSummary {
    fun age(birth: LocalDate?, today: LocalDate = LocalDate.now()): Int? =
        birth?.takeIf { !it.isAfter(today) }?.let { java.time.Period.between(it, today).years }

    fun ageText(birth: LocalDate?, today: LocalDate = LocalDate.now()): String? = age(birth, today)?.let { if (it == 1) "1 año" else "$it años" }

    /** Same line from a `PatientCandidateResponse`: exact age from `birth`, else the `ageRange` the role may see. */
    fun fromApi(birth: String?, ageRange: String?, sex: String?, today: LocalDate = LocalDate.now()): String? {
        val date = birth?.takeIf { it.isNotBlank() && it != "null" }?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        val age = ageText(date, today) ?: ageRange?.takeIf { it.isNotBlank() && it != "null" }?.let { "$it años" }
        return listOfNotNull(age, sexLabel(sex)).joinToString(" · ").ifBlank { null }
    }

    /** Spanish label of the API sex code (`femenino`, `masculino`, `indeterminado`); `no_registrado`, null or unknown give none. */
    fun sexLabel(sex: String?): String? = when (sex) { "femenino" -> Sex.FEMALE.label; "masculino" -> Sex.MALE.label; "indeterminado" -> Sex.INDETERMINATE.label; else -> null }

    /** Lote 5: the same line from the `patientAge` / `patientSex` read fields of `/fila` and category requests. */
    fun fromAge(age: Int?, sex: String?): String? =
        listOfNotNull(age?.takeIf { it >= 0 }?.let { if (it == 1) "1 año" else "$it años" }, sexLabel(sex)).joinToString(" · ").ifBlank { null }

    fun line(p: Patient, today: LocalDate = LocalDate.now()): String? =
        listOfNotNull(ageText(p.birth, today), p.sex.takeIf { it != Sex.UNKNOWN }?.label).joinToString(" · ").ifBlank { null }
}
