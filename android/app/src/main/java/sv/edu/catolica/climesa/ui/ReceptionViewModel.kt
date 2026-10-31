package sv.edu.catolica.climesa.ui
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import sv.edu.catolica.climesa.data.*
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.*
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

data class ReceptionState(val loading:Boolean=true,val fatal:Boolean=false,val registry:Registry=Registry(emptyList()),val error:String?=null,val query:String="",val searchedQuery:String?=null,val filter:Int=0,val selectedId:String?=null,val actions:Set<PatientAction> = emptySet(),val formOpen:Boolean=false,val editingId:String?=null,val editingVersion:Int?=null,val draft:PatientDraft=PatientDraft(),val reason:String="",val fields:Map<String,String> = emptyMap(),val saving:Boolean=false,val searching:Boolean=false,val message:String?=null,val remote:Boolean=false) {
    val selected get()=registry.patients.firstOrNull{it.id==selectedId}
    val results get()=registry.patients.filter{(filter==2||it.active==(filter==0))&&(remote||PatientRules.matches(it,searchedQuery.orEmpty()))}.sortedBy{PatientRules.normalize(it.fullName)}
}
@HiltViewModel
class ReceptionViewModel @Inject constructor(private val repository:PatientRepository,realtime:RealtimeRepository):ViewModel(){
    private val mutable=MutableStateFlow(ReceptionState(remote=repository.remote));val state=mutable.asStateFlow()
    private val live=LiveSubscription(realtime)
    /** Idempotente: refresca lista y ficha cuando llegan eventos de paciente, sin temporizadores. */
    fun startLive(channels:List<String>){live.start(viewModelScope,channels){signal->
        val s=mutable.value
        when(signal){
            is RealtimeSignal.Event->when(val plan=PatientEvents.refreshFor(signal.event,s.registry.patients.map{it.id}.toSet(),s.selectedId,s.searchedQuery!=null)){
                PatientEvents.Refresh.None->Unit
                is PatientEvents.Refresh.Detail->refreshDetail(plan.id)
                PatientEvents.Refresh.List->refreshList()
            }
            RealtimeSignal.Resync->refreshList()
            else->Unit
        }
    }}
    private suspend fun refreshDetail(id:String){try{applyDetails(repository.detail(id))}catch(e:Exception){if(e is CancellationException)throw e}}
    private suspend fun refreshList(){
        try{val data=repository.load();mutable.update{if(it.searchedQuery!=null)it else it.copy(registry=data)}}catch(e:Exception){if(e is CancellationException)throw e;return}
        mutable.value.selectedId?.let{refreshDetail(it)}
    }
    private var token:String?=null;private var expiresAt=0L;private var searchJob:Job?=null
    private val today get()=LocalDate.now(ZoneId.of("America/El_Salvador"))
    fun reload(){viewModelScope.launch{mutable.update{it.copy(loading=true,fatal=false,error=null)};try{val data=repository.load();mutable.update{it.copy(loading=false,registry=data)}}catch(e:Exception){if(e is CancellationException)throw e;mutable.update{it.copy(loading=false,fatal=true,error=e.message?:"No se pudo consultar el registro.")}}}}
    fun clear(){live.stop();viewModelScope.coroutineContext.cancelChildren();searchJob?.cancel();token=null;expiresAt=0;mutable.update{ReceptionState(remote=repository.remote,actions=it.actions)}}
    /** Acciones de pacientes según permisos de `/auth/me`; sin permiso no hay botón ni llamada. */
    fun setPermissions(permissions:Collection<String>){mutable.update{it.copy(actions=PatientAccess.allowed(permissions))}}
    fun query(s:String){searchJob?.cancel();token=null;expiresAt=0;mutable.update{it.copy(query=s.take(100),searchedQuery=null,searching=false)}}
    fun search(){val q=mutable.value.query.trim();if(PatientRules.normalize(q).replace(" ","").length<2){mutable.update{it.copy(error="Escribe al menos dos letras o números.")};return}
        searchJob?.cancel();searchJob=viewModelScope.launch{mutable.update{it.copy(searching=true,error=null)};try{val result=repository.search(q);if(mutable.value.query.trim()==q){token=result.token;expiresAt=result.expiresAt;mutable.update{it.copy(searching=false,searchedQuery=q,registry=result.registry)}}}catch(e:Exception){if(e is CancellationException)throw e;mutable.update{it.copy(searching=false,error=e.message?:"No se pudo buscar.")}}}
    }
    fun filter(value:Int){mutable.update{it.copy(filter=value)}}
    fun select(id:String?){if(mutable.value.saving)return;if(id==null){mutable.update{it.copy(selectedId=null,formOpen=false,error=null)};return};viewModelScope.launch{mutable.update{it.copy(loading=true,error=null)};try{val d=repository.detail(id);applyDetails(d);mutable.update{it.copy(loading=false,selectedId=id,formOpen=false)}}catch(e:Exception){if(e is CancellationException)throw e;mutable.update{it.copy(loading=false,error=e.message?:"No se pudo abrir la ficha.")}}}}
    private fun validSearch()=token!=null&&Instant.now().epochSecond<expiresAt
    fun newPatient(){if(mutable.value.saving)return;if(PatientAction.REGISTER !in mutable.value.actions)return;if(!validSearch()){mutable.update{it.copy(error="Busca primero al paciente. La búsqueda dura diez minutos.")};return};mutable.update{it.copy(formOpen=true,selectedId=null,editingId=null,editingVersion=null,draft=PatientDraft(),reason="",fields=emptyMap(),error=null)}}
    fun edit(p:Patient){if(PatientAction.EDIT !in mutable.value.actions)return;mutable.update{it.copy(formOpen=true,editingId=p.id,editingVersion=p.version,draft=PatientDraft.from(p),reason="",fields=emptyMap(),error=null)}}
    fun draft(d:PatientDraft){mutable.update{it.copy(draft=d,fields=emptyMap())}}
    fun reason(s:String){mutable.update{it.copy(reason=s.take(500))}}
    fun closeForm(){if(!mutable.value.saving)mutable.update{it.copy(formOpen=false,error=null,fields=emptyMap())}}
    fun clearMessage(){mutable.update{it.copy(message=null)}}
    fun clearError(){mutable.update{it.copy(error=null)}}
    private fun applyDetails(d:PatientDetails){mutable.update{it.copy(registry=it.registry.copy(patients=it.registry.patients.filterNot{p->p.id==d.patient.id}+d.patient,audit=it.registry.audit.filterNot{a->a.record==d.patient.record}+d.audit))}}
    fun save(){val s=mutable.value;if(s.saving)return;val required=if(s.editingId==null)PatientAction.REGISTER else PatientAction.EDIT;if(required !in s.actions)return;val fields=PatientRules.validate(s.draft,today);if(fields.isNotEmpty()){mutable.update{it.copy(fields=fields,error="Revisa los campos señalados.")};return};if(s.editingId==null&&!validSearch()){mutable.update{it.copy(error="La búsqueda venció. Cierra el formulario y vuelve a buscar.")};return};ChangeReason.error(s.reason).takeIf{s.editingId!=null}?.let{mutable.update{st->st.copy(error=it)};return}
        mutate("Paciente guardado",s.editingId){repository.save(s.draft,s.editingId,s.editingVersion,s.reason,token,s.searchedQuery.orEmpty())}
    }
    fun changeActive(p:Patient,reason:String){val s=mutable.value;if(s.saving||PatientAction.CHANGE_STATUS !in s.actions)return;ChangeReason.error(reason)?.let{mutable.update{st->st.copy(error=it)};return}
        mutate(if(p.active)"Paciente inactivado"else"Paciente reactivado",p.id){repository.changeActive(p,!p.active,reason)}}
    /** Un 409 `version_conflicto` no guarda nada: se recarga la ficha para mostrar la versión vigente. */
    private fun mutate(message:String,patientId:String?,work:suspend()->PatientDetails){mutable.update{it.copy(saving=true,error=null)};viewModelScope.launch{try{val d=work();applyDetails(d);token=null;expiresAt=0;mutable.update{it.copy(saving=false,formOpen=false,selectedId=d.patient.id,message=message)}}catch(e:Exception){if(e is CancellationException)throw e;val conflict=(e as? AuthRequestException)?.let{it.statusCode==409&&it.code=="version_conflicto"}==true;if(conflict)patientId?.let{refreshDetail(it)};mutable.update{it.copy(saving=false,error=if(conflict)CONFLICT_MESSAGE else e.message?:"No se pudo guardar. El formulario se conserva.")}}}}
    private companion object{const val CONFLICT_MESSAGE="La ficha cambió. Se recargó con la versión vigente; el cambio no se guardó. Revisa y vuelve a guardar."}
}
