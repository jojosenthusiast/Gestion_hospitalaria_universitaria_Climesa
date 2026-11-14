package sv.edu.catolica.climesa.data

import sv.edu.catolica.climesa.domain.*
import java.time.LocalDate

data class PatientSearchResult(val registry:Registry,val token:String,val expiresAt:Long)
data class PatientDetails(val patient:Patient,val audit:List<AuditEvent>)
interface PatientRepository {
    val remote:Boolean get()=false
    suspend fun load():Registry
    suspend fun update(transform:(Registry)->Registry):Registry
    suspend fun search(query:String):PatientSearchResult=PatientSearchResult(load().let{it.copy(patients=it.patients.filter{p->PatientRules.matches(p,query)})},"local",java.time.Instant.now().epochSecond+600)
    suspend fun detail(id:String):PatientDetails {val r=load();return PatientDetails(r.patients.first{it.id==id},r.audit.filter{it.record==r.patients.first{p->p.id==id}.record})}
    suspend fun save(draft:PatientDraft,id:String?,version:Int?,reason:String,token:String?,query:String,confirmNew:Boolean=false):PatientDetails {
        val r=update{PatientRules.save(it,draft,java.time.LocalDate.now(),id,version,reason)}
        val p=if(id==null)r.patients.last()else r.patients.first{it.id==id};return PatientDetails(p,r.audit.filter{it.record==p.record})
    }
    suspend fun changeActive(p:Patient,active:Boolean,reason:String):PatientDetails {val r=update{PatientRules.setActive(it,p.id,p.version,active,reason)};return PatientDetails(r.patients.first{it.id==p.id},r.audit.filter{it.record==p.record})}
}
