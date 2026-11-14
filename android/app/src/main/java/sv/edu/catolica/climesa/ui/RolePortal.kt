@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import org.json.JSONArray
import org.json.JSONObject
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.ui.dashboard.RoleDashboardScreen
import sv.edu.catolica.climesa.domain.*
import java.net.URLEncoder
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

data class RoleData(val loading:Boolean=false,val data:Any?=null,val error:String?=null)
/** Lectura de datos del portal por rol; separada de [ApiClient] para poder probar el ViewModel. */
fun interface RoleDataSource{
    suspend fun get(path:String):Any
    /** Escritura del portal (por ahora, el mantenimiento de la unidad); por defecto no escribe. */
    suspend fun post(path:String,body:JSONObject):Any=throw UnsupportedOperationException("Este origen de datos es de solo lectura.")
}
/** Estado de la acción de mantenimiento: `conflict` es un 409 de versión (la unidad cambió y nada se guardó). */
data class MaintenanceState(val busy:Boolean=false,val error:String?=null,val conflict:Boolean=false,val saved:Boolean=false)
@HiltViewModel class RoleViewModel @Inject constructor(private val source:RoleDataSource,realtime:RealtimeRepository):ViewModel(){
    private val mutable=MutableStateFlow(RoleData());val state=mutable.asStateFlow()
    private var job:Job?=null
    private var current:String?=null
    private val live=LiveSubscription(realtime)
    private val maintenanceMutable=MutableStateFlow(MaintenanceState());val maintenance=maintenanceMutable.asStateFlow()
    fun resetMaintenance(){maintenanceMutable.value=MaintenanceState()}
    /** `POST /ambulancia/mantenimiento`; el motivo se valida aquí por comodidad, la garantía es la API (regla 5). */
    fun setMaintenance(version:Int,inMaintenance:Boolean,reason:String){
        MaintenanceRules.reasonError(reason)?.let{maintenanceMutable.value=MaintenanceState(error=it);return}
        maintenanceMutable.value=MaintenanceState(busy=true)
        viewModelScope.launch{
            try{source.post("/ambulancia/mantenimiento",MaintenanceRules.body(version,inMaintenance,reason));maintenanceMutable.value=MaintenanceState(saved=true);load(current,silent=true)}
            catch(e:Exception){if(e is CancellationException)throw e
                val conflict=(e as? sv.edu.catolica.climesa.data.AuthRequestException)?.let{it.statusCode==409||it.code=="version_conflicto"}==true
                maintenanceMutable.value=MaintenanceState(conflict=conflict,error=if(conflict)"La unidad cambió. Cierra y vuelve a abrir para ver su estado actual; el cambio no se guardó." else e.message?:"No se pudo guardar. Intenta de nuevo.")}
        }
    }
    fun load(path:String?,silent:Boolean=false){current=path;job?.cancel();job=viewModelScope.launch{if(!silent||path==null)mutable.value=RoleData(loading=path!=null);if(path!=null)try{mutable.value=RoleData(data=source.get(path))}catch(e:Exception){if(e is CancellationException)throw e;if(silent&&mutable.value.data!=null)return@launch;mutable.value=RoleData(error=e.message?:"No se pudo cargar la información.")}}}
    /** Idempotente: refresca la sección abierta cuando llega un evento que le importa, sin mostrar el indicador de carga. */
    fun start(channels:List<String>){live.start(viewModelScope,channels){signal->
        when(signal){
            is RealtimeSignal.Event->if(PortalEvents.matches(current,signal.event))load(current,silent=true)
            RealtimeSignal.Resync->if(current!=null)load(current,silent=true)
            else->Unit
        }
    }}
}
private fun sectionPath(s:AndroidSection)=when(s){AndroidSection.SHIFTS->"/turnos/mios";AndroidSection.PATIENTS->"/pacientes?limit=50";AndroidSection.UNIT->"/ambulancia";else->null}
private val unitStates=mapOf("disponible" to "Disponible","en_servicio" to "En servicio","en_mantenimiento" to "En mantenimiento")
@Composable fun HospitalClock(){
    var now by remember { mutableStateOf(Instant.now()) }
    val zone=remember { ZoneId.of("America/El_Salvador") }
    val timeFormatter=remember { DateTimeFormatter.ofPattern("HH:mm:ss",Locale("es","SV")).withZone(zone) }
    val dateFormatter=remember { DateTimeFormatter.ofPattern("EEE d 'de' MMM",Locale("es","SV")).withZone(zone) }
    LaunchedEffect(Unit){while(isActive){now=Instant.now();delay(1000)}}
    Column(horizontalAlignment=Alignment.End){
        Text(timeFormatter.format(now),style=MaterialTheme.typography.labelLarge.copy(fontFeatureSettings="tnum"),color=MaterialTheme.colorScheme.onPrimary)
        Text(dateFormatter.format(now).replaceFirstChar{it.uppercase(Locale("es","SV"))},style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onPrimary.copy(alpha=.78f),maxLines=1)
    }
}
@Composable fun RolePortal(account:AuthenticatedAccount,role:String,dark:Boolean,setDark:(Boolean)->Unit,signingOut:Boolean,logout:()->Unit){
    val model:RoleViewModel=viewModel(key="role-${account.session.userId}")
    val data by model.state.collectAsStateWithLifecycle()
    var selectedName by rememberSaveable(role){mutableStateOf(AndroidSection.HOME.name)};var query by rememberSaveable{mutableStateOf("")}
    val sections=AndroidSections.visible(role,account.profile.permissions)
    val page=sections.firstOrNull{it.name==selectedName}?:sections.firstOrNull()?:return
    val path=sectionPath(page)
    // Every role lands on its dashboard ("Inicio"); a role without one falls back to Perfil.
    LaunchedEffect(role,sections){if(sections.none{it.name==selectedName})selectedName=sections.firstOrNull{it==AndroidSection.HOME}?.name?:sections.firstOrNull{it==AndroidSection.PROFILE}?.name?:sections.first().name}
    val inbox=rememberQuickActionInbox()
    LaunchedEffect(page){inbox.dropUnless(page)}
    val handled={inbox.consume(page)}
    val onDashboardAction:(QuickActionRequest)->Unit={request->if(request.section in sections){selectedName=request.section.name;inbox.post(request)}}
    LaunchedEffect(role,page){model.load(path)}
    LaunchedEffect(account.profile.channels){model.start(account.profile.channels)}
    PortalScaffold(
        role=role,sections=sections,selected=page,onSelected={selectedName=it.name},dark=dark,setDark=setDark,onLogout={if(!signingOut)logout()},
    ) content@{padding->
        if(page==AndroidSection.HOME){RoleDashboardScreen(account,role,onDashboardAction,Modifier.padding(padding));return@content}
        if(page==AndroidSection.BEDS||page==AndroidSection.CLEANING){BedsScreen(account.profile,Modifier.padding(padding));return@content}
        if(page==AndroidSection.MY_APPOINTMENTS){PatientAppointmentsScreen(account.profile.permissions,account.profile.channels,Modifier.padding(padding),quickAction=inbox.actionFor(page),onQuickActionHandled=handled);return@content}
        if(page==AndroidSection.ADMISSION||page==AndroidSection.HOSPITALIZED||page==AndroidSection.WARD){HospitalizationScreen(Modifier.padding(padding),account.profile,quickAction=inbox.actionFor(page),onQuickActionHandled=handled);return@content}
        if(page==AndroidSection.SUPPLIES){InventoryScreen(Modifier.padding(padding),account.profile);return@content}
        if(page==AndroidSection.MY_ACCESS){MyAccessScreen(Modifier.padding(padding));return@content}
        if(page==AndroidSection.PATIENT_QUEUE||page==AndroidSection.QUEUE||page==AndroidSection.ASSISTANT_STATION){QueueScreen(account.profile,Modifier.padding(padding),quickAction=inbox.actionFor(page),onQuickActionHandled=handled);return@content}
        if(page==AndroidSection.RESULTS||page==AndroidSection.RESULT_REVIEW){LaboratoryScreen(account.profile,Modifier.padding(padding),ownResults=page==AndroidSection.RESULTS,section=page);return@content}
        if(page==AndroidSection.LINK_RECORD){LinkRecordScreen(account.profile,Modifier.padding(padding));return@content}
        if(page==AndroidSection.HISTORY||page==AndroidSection.RECORD){ClinicalHistoryScreen(account.profile,own=page==AndroidSection.HISTORY,modifier=Modifier.padding(padding));return@content}
        if(page==AndroidSection.MEDICAL_DAY){ConsultationScreen(account.profile,Modifier.padding(padding));return@content}
        if(page==AndroidSection.HOSPITAL_INFO){HospitalInfoScreen(Modifier.padding(padding));return@content}
        if(page==AndroidSection.VITAL_SIGNS){VitalSignsScreen(account.profile,Modifier.padding(padding),readOnly=role=="MED");return@content}
        if(page in ambulanceSections||ParamedicRules.handles(page,account.profile.permissions)){AmbulanceScreen(page,account.profile,account.session.userId,Modifier.padding(padding));return@content}
        PageList(Modifier.padding(padding)){
            if(page==AndroidSection.PROFILE){
                profileItems(account,dark,setDark,{if(!signingOut)logout()},myData=if("pacientes.editar_propios" in account.profile.permissions){{MyDataCard()}}else null)
            }
            else if(data.loading)item{LoadingState()}
            else if(data.error!=null)item{ErrorState(data.error,{model.load(path)})}
            else if(page==AndroidSection.PATIENTS){
                item{ClimesaActionGroup {FormField("Nombre, DUI o expediente",query,{query=it.take(100)});PrimaryButton("Buscar paciente",{model.load("/pacientes?query="+URLEncoder.encode(query,"UTF-8")+"&limit=50")},icon=Icons.Default.Search,enabled=query.trim().length>=2)}}
                val rows=PortalParsers.patients(data.data)
                if(rows.isEmpty())item{EmptyState("No hay coincidencias. Ajusta la búsqueda.")}
                else items(rows){p->DataRow(p.fullName,meta="EXP. ${p.record}")}
            }else if(page==AndroidSection.UNIT){
                val unit=PortalParsers.unit(data.data)
                item{SectionCard(unit?.plate.orEmpty()){
                    Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){Text(stringResource(R.string.unidad_estado),style=MaterialTheme.typography.labelSmall);StatusTag(unit?.state.orEmpty(),label=unitStates[unit?.state])}
                    LabeledValue(stringResource(R.string.unidad_paramedico_turno),stringResource(if(unit?.paramedicOnDuty==true)R.string.unidad_si else R.string.unidad_no))
                    LabeledValue(stringResource(R.string.unidad_motorista_turno),stringResource(if(unit?.driverOnDuty!=false)R.string.unidad_si else R.string.unidad_no))
                    HorizontalDivider()
                    if(unit?.hasService!=true)Text(stringResource(R.string.unidad_sin_servicio),style=MaterialTheme.typography.bodyMedium) else {Text(stringResource(R.string.unidad_servicio_activo),style=MaterialTheme.typography.labelSmall);Text("${unit.serviceOrigin.orEmpty()} → ${unit.serviceDestination.orEmpty()}")}
                }}
                if(unit!=null&&MaintenanceRules.available(account.profile.permissions,unit.state))item{MaintenanceControl(model,unit.state,unit.version,unit.paramedicOnDuty,unit.driverOnDuty)}
            }else if(page==AndroidSection.SHIFTS){
                val shifts=MyShifts.parse(data.data)
                if(shifts.isEmpty())item{EmptyState("No tienes turnos publicados.")}
                else items(shifts){shift->MyShiftCard(shift)}
            }else item{EmptyState(stringResource(R.string.portal_seccion_no_disponible))}
        }
    }
}
/** A26 "Mis turnos" as a standalone screen, for scaffolds that do not use [RolePortal] (Recepción). */
@Composable fun MyShiftsScreen(account:AuthenticatedAccount,role:String,modifier:Modifier=Modifier){
    val model:RoleViewModel=viewModel(key="shifts-${account.session.userId}")
    val data by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit){model.load("/turnos/mios")}
    LaunchedEffect(account.profile.channels){model.start(account.profile.channels)}
    PageList(modifier){
        if(data.loading)item{LoadingState()}
        else if(data.error!=null)item{ErrorState(data.error,{model.load("/turnos/mios")})}
        else{
            val shifts=MyShifts.parse(data.data)
            if(shifts.isEmpty())item{EmptyState(stringResource(R.string.turnos_vacio))}
            else items(shifts){shift->MyShiftCard(shift)}
        }
    }
}
@Composable internal fun MyShiftCard(shift:MyShift){
    Column(verticalArrangement=Arrangement.spacedBy(4.dp)){
        AreaChip(shift.area)
        DataRow(shift.period,status={StatusTag(shift.state,label=StaffLabels.shiftState(shift.state))})
    }
}
/** Entrar o salir de mantenimiento; el motivo y el diálogo sobreviven al giro de pantalla. */
@Composable private fun MaintenanceControl(model:RoleViewModel,unitState:String,version:Int,paramedicOnDuty:Boolean,driverOnDuty:Boolean){
    val leaving=unitState=="en_mantenimiento";val blocked=MaintenanceRules.leavingBlocked(unitState,paramedicOnDuty,driverOnDuty)
    val state by model.maintenance.collectAsStateWithLifecycle()
    var open by rememberSaveable{mutableStateOf(false)};var reason by rememberSaveable{mutableStateOf("")}
    val title=stringResource(if(leaving)R.string.mantenimiento_sacar else R.string.mantenimiento_poner)
    LaunchedEffect(state.saved){if(state.saved){open=false;reason="";model.resetMaintenance()}}
    Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
        Text(stringResource(R.string.mantenimiento_titulo),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
        if(blocked)Text(stringResource(when(MaintenanceRules.missingCrew(paramedicOnDuty,driverOnDuty)){"sin_motorista_de_turno"->R.string.mantenimiento_requiere_motorista;"sin_tripulacion_de_turno"->R.string.mantenimiento_requiere_tripulacion;else->R.string.mantenimiento_requiere_paramedico}),style=MaterialTheme.typography.bodySmall)
        SecondaryButton(title,{model.resetMaintenance();open=true},enabled=!blocked)
    }
    if(open){
        val close={open=false;model.resetMaintenance()}
        ConfirmDialog(
            title=title,
            message=stringResource(if(leaving)R.string.mantenimiento_efecto_sacar else R.string.mantenimiento_efecto_poner),
            confirmLabel=if(state.conflict)stringResource(R.string.mantenimiento_cerrar) else title,
            onConfirm=if(state.conflict){close}else{{model.setMaintenance(version,!leaving,reason)}},
            onDismiss=close,
            dismissLabel=stringResource(R.string.mantenimiento_cancelar),
            busy=state.busy,
            body={
                state.error?.let{NoticeBanner(NoticeKind.ERROR,it)}
                if(!state.conflict)FormField(stringResource(R.string.mantenimiento_motivo),reason,{reason=it.take(MaintenanceRules.MAX_REASON)})
            },
        )
    }
}
