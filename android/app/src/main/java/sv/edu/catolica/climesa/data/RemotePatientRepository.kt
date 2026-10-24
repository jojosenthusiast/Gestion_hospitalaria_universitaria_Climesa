package sv.edu.catolica.climesa.data
import org.json.JSONArray
import org.json.JSONObject
import sv.edu.catolica.climesa.domain.*
import java.time.Instant
import java.time.LocalDate
class RemotePatientRepository(private val api:ApiClient):PatientRepository {
    override val remote=true
    private fun JSONObject.stringOrNull(k:String)=if(!has(k)||isNull(k))null else optString(k).takeIf{it.isNotBlank()}
    private fun patient(p:JSONObject)=Patient(id=p.getString("id"),record=p.getString("record"),givenNames=p.optString("givenNames"),surnames=p.optString("surnames"),dui=p.stringOrNull("dui"),birth=p.stringOrNull("birth")?.take(10)?.let(LocalDate::parse),sex=when(p.optString("sex")){"femenino"->Sex.FEMALE;"masculino"->Sex.MALE;"indeterminado"->Sex.INDETERMINATE;else->Sex.UNKNOWN},phone=p.stringOrNull("phone")?:"",active=p.optBoolean("active",true),version=p.getInt("version"))
    private fun patients(a:JSONArray)=(0 until a.length()).map{patient(a.getJSONObject(it))}
    override suspend fun load():Registry {
        val rows=api.request("/pacientes?limit=50") as JSONArray
        val summary=(api.request("/inicio") as JSONObject).optJSONObject("patients")
        val active=summary?.optInt("active")
        return Registry(patients(rows),totalActive=active,totalInactive=summary?.let{it.optInt("total")-it.optInt("active")})
    }
    override suspend fun update(transform:(Registry)->Registry):Registry=throw UnsupportedOperationException("Los cambios se envían como operaciones a la API.")
    override suspend fun search(query:String):PatientSearchResult {
        val r=api.request("/pacientes/busquedas","POST",JSONObject().put("query",query)) as JSONObject
        return PatientSearchResult(Registry(patients(r.getJSONArray("candidates"))),r.getString("token"),Instant.parse(r.getString("expiresAt")).epochSecond)
    }
    override suspend fun detail(id:String):PatientDetails {
        val p=api.request("/pacientes/$id") as JSONObject
        val person=patient(p)
        val history=p.optJSONArray("history")?:JSONArray()
        val labels=mapOf("nombres" to "Nombres","primer_apellido" to "Apellidos","nacimiento" to "Nacimiento","telefono" to "Teléfono","sexo" to "Sexo","estado" to "Estado","dui" to "DUI")
        val events=(0 until history.length()).map { i->val h=history.getJSONObject(i);val changes=h.optJSONObject("changes")?:JSONObject();AuditEvent(person.record,"Modificación",h.getString("reason"),h.getInt("version"),h.getString("at"),changes.keys().asSequence().associate { key->val item=changes.optJSONObject(key);(labels[key]?:key) to "${item?.stringOrNull("before")?:"Sin registrar"} → ${item?.stringOrNull("after")?:"Sin registrar"}" }) }
        return PatientDetails(person,events.sortedBy{it.version})
    }
    private fun body(d:PatientDraft)=JSONObject().put("givenNames",d.givenNames.trim()).put("surnames",d.surnames.trim()).put("dui",d.dui).put("birth",d.birth).put("sex",when(d.sex){Sex.FEMALE->"femenino";Sex.MALE->"masculino";Sex.INDETERMINATE->"indeterminado";Sex.UNKNOWN->"no_registrado"}).put("phone",d.phone)
    override suspend fun save(draft:PatientDraft,id:String?,version:Int?,reason:String,token:String?,query:String):PatientDetails {
        val data=body(draft)
        if(id==null){data.put("searchToken",token).put("searchQuery",query)}else data.put("version",version).put("reason",reason)
        val r=api.request(if(id==null)"/pacientes" else "/pacientes/$id",if(id==null)"POST" else "PATCH",data) as JSONObject
        return detail(r.getString("id"))
    }
    override suspend fun changeActive(p:Patient,active:Boolean,reason:String):PatientDetails {api.request("/pacientes/${p.id}/estado","POST",JSONObject().put("active",active).put("version",p.version).put("reason",reason));return detail(p.id)}
}
