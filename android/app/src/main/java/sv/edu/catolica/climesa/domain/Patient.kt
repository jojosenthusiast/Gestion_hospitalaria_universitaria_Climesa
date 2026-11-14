package sv.edu.catolica.climesa.domain

import java.text.Normalizer
import java.time.LocalDate
import java.time.Instant
import java.util.Locale
import java.util.UUID

enum class Sex(val label: String) { FEMALE("Femenino"), MALE("Masculino"), INDETERMINATE("Indeterminado"), UNKNOWN("No registrado") }
data class Patient(val id: String = UUID.randomUUID().toString(), val record: String,
    val givenNames: String, val surnames: String, val dui: String?, val birth: LocalDate?,
    val sex: Sex, val phone: String, val active: Boolean = true, val version: Int = 1) {
    val fullName get() = "$givenNames $surnames"
}
data class PatientDraft(val givenNames: String = "", val surnames: String = "", val dui: String = "",
    val birth: String = "", val sex: Sex = Sex.UNKNOWN, val phone: String = "") {
    companion object { fun from(p: Patient) = PatientDraft(p.givenNames,p.surnames,p.dui.orEmpty(),p.birth?.toString().orEmpty(),p.sex,p.phone) }
}
data class AuditEvent(val record: String, val action: String, val reason: String, val version: Int,
    val at: String = Instant.now().toString(), val changes: Map<String,String> = emptyMap())
data class Registry(val patients: List<Patient>, val audit: List<AuditEvent> = emptyList(), val nextSequence: Long = 6, val totalActive: Int? = null, val totalInactive: Int? = null)

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
