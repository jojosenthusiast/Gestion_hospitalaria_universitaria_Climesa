package sv.edu.catolica.climesa.data

import android.content.Context
import android.util.AtomicFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import sv.edu.catolica.climesa.domain.*
import java.io.File
import java.time.LocalDate

data class PatientSearchResult(val registry:Registry,val token:String,val expiresAt:Long)
data class PatientDetails(val patient:Patient,val audit:List<AuditEvent>)
interface PatientRepository {
    val remote:Boolean get()=false
    suspend fun load():Registry
    suspend fun update(transform:(Registry)->Registry):Registry
    suspend fun search(query:String):PatientSearchResult=PatientSearchResult(load().let{it.copy(patients=it.patients.filter{p->PatientRules.matches(p,query)})},"local",java.time.Instant.now().epochSecond+600)
    suspend fun detail(id:String):PatientDetails {val r=load();return PatientDetails(r.patients.first{it.id==id},r.audit.filter{it.record==r.patients.first{p->p.id==id}.record})}
    suspend fun save(draft:PatientDraft,id:String?,version:Int?,reason:String,token:String?,query:String):PatientDetails {
        val r=update{PatientRules.save(it,draft,java.time.LocalDate.now(),id,version,reason)}
        val p=if(id==null)r.patients.last()else r.patients.first{it.id==id};return PatientDetails(p,r.audit.filter{it.record==p.record})
    }
    suspend fun changeActive(p:Patient,active:Boolean,reason:String):PatientDetails {val r=update{PatientRules.setActive(it,p.id,p.version,active,reason)};return PatientDetails(r.patients.first{it.id==p.id},r.audit.filter{it.record==p.record})}
}
/** Adaptador de demostración con datos ficticios. Se reemplazará por el cliente de la API. */
class DemoPatientRepository(context:Context):PatientRepository {
    private val file=AtomicFile(File(context.filesDir,"demo-patients-v1.json"))
    private val mutex=Mutex()
    override suspend fun load():Registry=withContext(Dispatchers.IO) { mutex.withLock { read() } }
    override suspend fun update(transform:(Registry)->Registry):Registry=withContext(Dispatchers.IO) { mutex.withLock { transform(read()).also(::write) } }
    private fun JSONObject.optional(k:String)=if(isNull(k)) null else getString(k)
    private fun JSONArray.objects()=(0 until length()).map(::getJSONObject)
    private fun read():Registry {
        if(!file.baseFile.exists() && !File(file.baseFile.path+".bak").exists()) return seed().also(::write)
        val root=JSONObject(file.openRead().bufferedReader().use { it.readText() })
        require(root.getInt("schema")==1) { "Versión de datos no compatible." }
        val patients=root.getJSONArray("patients").objects().map { p -> Patient(p.getString("id"),p.getString("record"),p.getString("givenNames"),p.getString("surnames"),p.optional("dui"),p.optional("birth")?.let(LocalDate::parse),Sex.valueOf(p.getString("sex")),p.getString("phone"),p.getBoolean("active"),p.getInt("version")) }
        val audit=root.getJSONArray("audit").objects().map { a -> AuditEvent(a.getString("record"),a.getString("action"),a.getString("reason"),a.getInt("version"),a.getString("at"),a.getJSONObject("changes").let { c -> c.keys().asSequence().associateWith { c.getString(it) } }) }
        return Registry(patients,audit,root.getLong("nextSequence"))
    }
    private fun write(r:Registry) {
        val patients=JSONArray();r.patients.forEach { p -> patients.put(JSONObject().apply {
            put("id",p.id);put("record",p.record);put("givenNames",p.givenNames);put("surnames",p.surnames);put("dui",p.dui ?: JSONObject.NULL)
            put("birth",p.birth?.toString() ?: JSONObject.NULL);put("sex",p.sex.name);put("phone",p.phone);put("active",p.active);put("version",p.version)
        }) }
        val audit=JSONArray();r.audit.forEach { a -> audit.put(JSONObject().apply { put("record",a.record);put("action",a.action);put("reason",a.reason);put("version",a.version);put("at",a.at);put("changes",JSONObject(a.changes)) }) }
        val bytes=JSONObject().apply { put("schema",1);put("nextSequence",r.nextSequence);put("patients",patients);put("audit",audit) }.toString().toByteArray(Charsets.UTF_8)
        val stream=file.startWrite()
        try { stream.write(bytes);file.finishWrite(stream) } catch(e:Exception) { file.failWrite(stream);throw e }
    }
    private fun seed():Registry {
        val names=listOf("Ana Lucía" to "Ejemplo Hernández","José Manuel" to "Ejemplo Vásquez","María Elena" to "Ejemplo Rivas","Diego Andrés" to "Ejemplo Flores","Sofía Isabel" to "Ejemplo Castro")
        return Registry(names.mapIndexed { i,n -> Patient(id="demo-${i+1}",record=PatientRules.record((i+1).toLong()),givenNames=n.first,surnames=n.second,dui=null,birth=null,sex=Sex.UNKNOWN,phone="",active=i!=4) })
    }
}
