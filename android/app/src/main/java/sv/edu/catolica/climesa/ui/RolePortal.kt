@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui
import androidx.activity.compose.BackHandler
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
import sv.edu.catolica.climesa.domain.UnitStatusBadge
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
                maintenanceMutable.value=MaintenanceState(conflict=conflict,error=if(conflict)"La unidad cambió. Cierra y vuelve a abrir para ver su estado actual; el cambio no se guardó." else userMessage(e, "No se pudo guardar. Intenta de nuevo."))}
        }
    }
    /**
     * Reads [path]. R3 A-23: reloading the same section keeps its data on screen (stale-while-revalidate) and a failed reload
     * keeps it too, with the error beside it; only a different section starts empty.
     */
    fun load(path:String?,silent:Boolean=false){
        val same=path!=null&&path==current&&mutable.value.data!=null
        current=path;job?.cancel()
        job=viewModelScope.launch{
            if(same){if(!silent)mutable.value=mutable.value.copy(loading=true,error=null)}
            else if(!silent||path==null)mutable.value=RoleData(loading=path!=null)
            if(path!=null)try{mutable.value=RoleData(data=source.get(path))}catch(e:Exception){if(e is CancellationException)throw e
                if(silent&&mutable.value.data!=null)return@launch
                mutable.value=if(same)mutable.value.copy(loading=false,error=userMessage(e, "No se pudo cargar la información.")) else RoleData(error=userMessage(e, "No se pudo cargar la información."))}
        }
    }
    /**
     * RN-25: llegó un valor crítico y la API deja a esta cuenta revisar una orden crítica (`allowedActions` incluye `revisar`,
     * como en iOS); sigue visible hasta que se cierra o se abre la revisión.
     */
    private val criticalLabMutable=MutableStateFlow(false);val criticalLab=criticalLabMutable.asStateFlow()
    fun dismissCriticalLab(){criticalLabMutable.value=false}
    private fun checkCriticalLab(){viewModelScope.launch{
        try{if(LabCritical.pendingReview(LaboratoryParser.orders(source.get("/laboratorio/ordenes")))>0)criticalLabMutable.value=true}
        catch(e:Exception){if(e is CancellationException)throw e}
    }}
    /** Idempotente: refresca la sección abierta cuando llega un evento que le importa, sin mostrar el indicador de carga. */
    fun start(channels:List<String>,permissions:Collection<String> = emptyList()){live.start(viewModelScope,channels){signal->
        when(signal){
            is RealtimeSignal.Event->{
                if(LabCriticalEvents.notifies(signal.event,permissions))checkCriticalLab()
                if(PortalEvents.matches(current,signal.event))load(current,silent=true)
            }
            RealtimeSignal.Resync->if(current!=null)load(current,silent=true)
            else->Unit
        }
    }}
}
private fun sectionPath(s:AndroidSection)=when(s){AndroidSection.SHIFTS->"/turnos/mios";AndroidSection.PATIENTS->"/pacientes?limit=50";AndroidSection.UNIT->"/ambulancia";AndroidSection.MY_ROOM->"/admisiones";else->null}
private val unitStates=mapOf("disponible" to "Disponible","en_servicio" to "En servicio","en_mantenimiento" to "En mantenimiento")
/** Obs 2: live clock with seconds, ticking on each whole second, and the full weekday on a second line that ellipsizes on phones. */
@Composable fun HospitalClock(){
    var now by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(Unit){while(isActive){now=Instant.now();delay(sv.edu.catolica.climesa.domain.HospitalClockText.untilNextSecond(System.currentTimeMillis()))}}
    Column(Modifier.widthIn(max=168.dp).padding(end=8.dp),horizontalAlignment=Alignment.End){
        Text(sv.edu.catolica.climesa.domain.HospitalClockText.time(now),style=MaterialTheme.typography.labelLarge.copy(fontFeatureSettings="tnum"),color=MaterialTheme.colorScheme.onPrimary,maxLines=1)
        Text(sv.edu.catolica.climesa.domain.HospitalClockText.shortDate(now),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onPrimary.copy(alpha=.78f),maxLines=1,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis)
    }
}
@Composable fun RolePortal(account:AuthenticatedAccount,role:String,dark:Boolean,setDark:(Boolean)->Unit,signingOut:Boolean,logout:()->Unit){
    val model:RoleViewModel=viewModel(key="role-${account.session.userId}")
    val data by model.state.collectAsStateWithLifecycle()
    var selectedName by rememberSaveable(role){mutableStateOf(AndroidSection.HOME.name)};var query by rememberSaveable{mutableStateOf("")}
    var pastShiftsOpen by rememberSaveable{mutableStateOf(false)}
    val sections=AndroidSections.forAccount(role,account.profile)
    val page=sections.firstOrNull{it.name==selectedName}?:sections.firstOrNull()?:return
    val path=sectionPath(page)
    // Every role lands on its dashboard ("Inicio"); a role without one falls back to Perfil.
    LaunchedEffect(role,sections){if(sections.none{it.name==selectedName})selectedName=sections.firstOrNull{it==AndroidSection.HOME}?.name?:sections.firstOrNull{it==AndroidSection.PROFILE}?.name?:sections.first().name}
    val inbox=rememberQuickActionInbox()
    LaunchedEffect(page){inbox.dropUnless(page)}
    // R3 A-2: back from any section returns to Inicio before leaving the app. Screens compose their own BackHandler later,
    // so an open form or detail closes first.
    val backTarget=AndroidSections.backTarget(page,sections)
    BackHandler(enabled=backTarget!=null){backTarget?.let{selectedName=it.name}}
    // ENF/AST audit #18: Signos opened from another section (the ward card) goes back there, not to Inicio.
    var vitalsOrigin by rememberSaveable{mutableStateOf<String?>(null)}
    LaunchedEffect(page){if(page!=AndroidSection.VITAL_SIGNS)vitalsOrigin=null}
    BackHandler(enabled=page==AndroidSection.VITAL_SIGNS&&vitalsOrigin!=null){selectedName=vitalsOrigin?:AndroidSection.HOME.name;vitalsOrigin=null}
    // Opens Signos on a patient from the current section; gated by the section (permission), never by role (rule 8).
    val openVitals:((QuickSubject)->Unit)?=if(AndroidSection.VITAL_SIGNS in sections){subject->vitalsOrigin=page.name;selectedName=AndroidSection.VITAL_SIGNS.name;inbox.post(QuickActionRequest(AndroidSection.VITAL_SIGNS,subject=subject))}else null
    val handled={inbox.consume(page)}
    val onDashboardAction:(QuickActionRequest)->Unit={request->if(request.section in sections){selectedName=request.section.name;inbox.post(request)}}
    LaunchedEffect(role,page){model.load(path)}
    LaunchedEffect(account.profile.channels,account.profile.permissions){model.start(account.profile.channels,account.profile.permissions)}
    val criticalLab by model.criticalLab.collectAsStateWithLifecycle()
    // Opening the review section is reading the notice.
    LaunchedEffect(page){if(page==AndroidSection.RESULT_REVIEW)model.dismissCriticalLab()}
    PortalScaffold(
        role=role,sections=sections,selected=page,onSelected={vitalsOrigin=null;selectedName=it.name},dark=dark,setDark=setDark,onLogout={if(!signingOut)logout()},
        badges=noticeBadges(account,sections),
    ) {outer->
      Column(Modifier.padding(outer).fillMaxSize()){
        if(criticalLab&&AndroidSection.RESULT_REVIEW in sections)CriticalLabNotice(onReview={model.dismissCriticalLab();selectedName=AndroidSection.RESULT_REVIEW.name},onDismiss=model::dismissCriticalLab)
        val padding=PaddingValues(0.dp)
        Box(Modifier.weight(1f).fillMaxWidth()){when{
        page==AndroidSection.HOME->RoleDashboardScreen(account,role,onDashboardAction,Modifier.padding(padding),onOpenNotices={if(AndroidSection.NOTICES in sections)selectedName=AndroidSection.NOTICES.name})
        page==AndroidSection.NOTICES->NoticesScreen(account,Modifier.padding(padding))
        page==AndroidSection.BEDS||page==AndroidSection.CLEANING->BedsScreen(account.profile,Modifier.padding(padding))
        page==AndroidSection.MY_APPOINTMENTS->PatientAppointmentsScreen(account.profile.permissions,account.profile.channels,Modifier.padding(padding),quickAction=inbox.actionFor(page),onQuickActionHandled=handled,linked=account.profile.patientId!=null)
        page==AndroidSection.ADMISSION||page==AndroidSection.HOSPITALIZED||page==AndroidSection.WARD->HospitalizationScreen(Modifier.padding(padding),account.profile,quickAction=inbox.actionFor(page),onQuickActionHandled=handled,
            onOpenVitals=openVitals)
        page==AndroidSection.SUPPLIES->InventoryScreen(Modifier.padding(padding),account.profile)
        page==AndroidSection.MY_ACCESS->MyAccessScreen(Modifier.padding(padding))
        page==AndroidSection.PATIENT_QUEUE||page==AndroidSection.QUEUE||page==AndroidSection.ASSISTANT_STATION->QueueScreen(account.profile,Modifier.padding(padding),quickAction=inbox.actionFor(page),onQuickActionHandled=handled,userId=account.session.userId,onOpenVitals=openVitals)
        page==AndroidSection.RESULTS||page==AndroidSection.RESULT_REVIEW->LaboratoryScreen(account.profile,Modifier.padding(padding),ownResults=page==AndroidSection.RESULTS,section=page,userId=account.session.userId)
        page==AndroidSection.LINK_RECORD->LinkRecordScreen(account.profile,Modifier.padding(padding))
        page==AndroidSection.HISTORY||page==AndroidSection.RECORD->ClinicalHistoryScreen(account.profile,own=page==AndroidSection.HISTORY,modifier=Modifier.padding(padding))
        page==AndroidSection.MEDICAL_DAY->ConsultationScreen(account.profile,Modifier.padding(padding),userId=account.session.userId)
        page==AndroidSection.HOSPITAL_INFO->HospitalInfoScreen(Modifier.padding(padding))
        page==AndroidSection.VITAL_SIGNS->VitalSignsScreen(account.profile,Modifier.padding(padding),readOnly=!sv.edu.catolica.climesa.domain.VitalsAccess.canRecord(account.profile.permissions),userId=account.session.userId,subject=inbox.subjectFor(page),onSubjectHandled=handled,
            onExit=vitalsOrigin?.let{origin->{selectedName=origin;vitalsOrigin=null}},
            exitLabel=vitalsOrigin?.let{origin->sections.firstOrNull{it.name==origin}?.let(::sectionShortLabel)})
        page in ambulanceSections||ParamedicRules.handles(page,account.profile.permissions)->AmbulanceScreen(page,account.profile,account.session.userId,Modifier.padding(padding))
        else->PageList(Modifier.padding(padding)){
            if(page==AndroidSection.PROFILE){
                profileItems(account,dark,setDark,{if(!signingOut)logout()},myData=if("pacientes.editar_propios" in account.profile.permissions){{MyDataCard()}}else null)
            }
            else if(data.loading&&data.data==null)item{LoadingState()}
            else if(data.error!=null&&data.data==null)item{ErrorState(data.error,{model.load(path)})}
            else if(page==AndroidSection.PATIENTS){
                item{ClimesaActionGroup {FormField("Nombre, DUI o expediente",query,{query=it.take(100)});PrimaryButton("Buscar paciente",{model.load("/pacientes?query="+URLEncoder.encode(query,"UTF-8")+"&limit=50")},icon=Icons.Default.Search,enabled=query.trim().length>=2)}}
                val rows=PortalParsers.patients(data.data)
                if(rows.isEmpty())item{EmptyState("No hay coincidencias. Ajusta la búsqueda.")}
                else items(rows){p->DataRow(p.fullName,subtitle=p.summary,meta="EXP. ${p.record}")}
            }else if(page==AndroidSection.UNIT){
                val unit=PortalParsers.unit(data.data)
                // Obs 19: one status tag («No se puede despachar» when blocked) with its reason under it, and the service line in the header.
                val blocked=unit?.dispatchBlock!=null
                val state=unit?.state.orEmpty()
                item{SectionCard(unit?.plate.orEmpty(),eyebrow=stringResource(R.string.op_amb_unidad),action={OperacionStatusTag(UnitStatusBadge.code(state,blocked),label=UnitStatusBadge.label(state,blocked,unitStates[state]?:OperacionStatus.label(state)))}){
                    unit?.dispatchBlock?.let{Text(it,style=MaterialTheme.typography.bodyMedium)}
                    if(unit?.hasService!=true)Text(stringResource(R.string.unidad_sin_servicio),style=MaterialTheme.typography.titleSmall,color=MaterialTheme.climesa.primaryText)
                    else Column{Text(stringResource(R.string.unidad_servicio_activo),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant);Text("${unit.serviceOrigin.orEmpty()} → ${unit.serviceDestination.orEmpty()}",style=MaterialTheme.typography.titleSmall)}
                    LabeledValue(stringResource(R.string.unidad_paramedico_turno),stringResource(if(unit?.paramedicOnDuty==true)R.string.unidad_si else R.string.unidad_no))
                    LabeledValue(stringResource(R.string.unidad_motorista_turno),stringResource(if(unit?.driverOnDuty!=false)R.string.unidad_si else R.string.unidad_no))
                }}
                if(unit!=null&&MaintenanceRules.available(account.profile.permissions,unit.state))item{MaintenanceControl(model,unit.state,unit.version,unit.paramedicOnDuty,unit.driverOnDuty)}
            }else if(page==AndroidSection.MY_ROOM){
                val admissions=AdmissionParser.admissions(data.data)
                val room=MyRoomRules.current(admissions,account.profile.patientId)
                val discharge=DischargeSummaryRules.summary(admissions,account.profile.patientId)
                when{
                    room!=null->item{MyRoomCard(room)}
                    MyRoomRules.waiting(admissions,account.profile.patientId)!=null->item{NoticeBanner(NoticeKind.INFO,stringResource(R.string.pac_habitacion_espera))}
                    discharge==null->item{EmptyState(stringResource(R.string.pac_habitacion_ninguna),detail=stringResource(R.string.pac_habitacion_ninguna_detalle),icon=Icons.Default.KingBed)}
                }
                discharge?.let{item{MyRoomDischargeCard(it)}}
            }else if(page==AndroidSection.SHIFTS){
                val shifts=MyShifts.parse(data.data)
                if(shifts.isEmpty())item{EmptyState(stringResource(R.string.turnos_vacio))}
                else myShiftDays(shifts,pastShiftsOpen){pastShiftsOpen=!pastShiftsOpen}
            }else item{EmptyState(stringResource(R.string.portal_seccion_no_disponible))}
        }
        }}
      }
    }
}
/** «Mi habitación»: the assigned bed, its state tag, the room type and isolation (iOS `RoomCard`). */
@Composable private fun MyRoomCard(room:HospitalAdmission){
    SectionCard(stringResource(R.string.pac_habitacion_titulo),action={StatusTag(room.state)}){
        Text(stringResource(R.string.pac_habitacion_cama,room.bed),style=MaterialTheme.typography.headlineSmall)
        val kind=listOfNotNull(HospitalInfoParser.categoryLabels[room.bedCategory?:room.category]?:room.category.takeIf{it.isNotBlank()},stringResource(R.string.pac_habitacion_aislamiento).takeIf{room.isolation})
        if(kind.isNotEmpty())Text(kind.joinToString(" · "),style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
        room.attendingDoctorName?.let{Text(stringResource(R.string.pac_habitacion_medico,it),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)}
    }
}
/** RN-25: app-wide notice of a critical lab value, above the current section, with a shortcut to the review list. */
@Composable private fun CriticalLabNotice(onReview:()->Unit,onDismiss:()->Unit){
    Column(Modifier.fillMaxWidth().padding(horizontal=Spacing.page,vertical=Spacing.sm),verticalArrangement=Arrangement.spacedBy(Spacing.xs)){
        NoticeBanner(NoticeKind.ERROR,stringResource(R.string.portal_critico_aviso))
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End){
            TextButton(onClick=onDismiss){Text(stringResource(R.string.portal_critico_cerrar))}
            TextButton(onClick=onReview){Text(stringResource(R.string.portal_critico_revisar))}
        }
    }
}
/** A26 "Mis turnos" as a standalone screen, for scaffolds that do not use [RolePortal] (Recepción). */
@Composable fun MyShiftsScreen(account:AuthenticatedAccount,role:String,modifier:Modifier=Modifier){
    val model:RoleViewModel=viewModel(key="shifts-${account.session.userId}")
    val data by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit){model.load("/turnos/mios")}
    LaunchedEffect(account.profile.channels){model.start(account.profile.channels)}
    var pastOpen by rememberSaveable{mutableStateOf(false)}
    PageList(modifier){
        if(data.loading&&data.data==null)item{LoadingState()}
        else if(data.error!=null&&data.data==null)item{ErrorState(data.error,{model.load("/turnos/mios")})}
        else{
            val shifts=MyShifts.parse(data.data)
            if(shifts.isEmpty())item{EmptyState(stringResource(R.string.turnos_vacio))}
            else myShiftDays(shifts,pastOpen){pastOpen=!pastOpen}
        }
    }
}
/**
 * A26 "Mis turnos" por día asignado (Hoy, Mañana, día y fecha), cada día en orden de hora de inicio. Abre en hoy: los
 * días de hoy en adelante van primero y los anteriores debajo, bajo "Turnos anteriores".
 */
private fun androidx.compose.foundation.lazy.LazyListScope.myShiftDays(shifts:List<MyShift>,pastOpen:Boolean,togglePast:()->Unit){
    val days=MyShifts.byDay(shifts)
    // R3 A-8: past days fold under one closed heading with their count, like the web list (#122).
    val pastCount=days.filter{it.past}.sumOf{it.shifts.size}
    for((index,day) in days.withIndex()){
        if(day.past&&days.getOrNull(index-1)?.past!=true)item(key="turnos-anteriores"){
            TextButton(onClick=togglePast,modifier=Modifier.padding(top=Spacing.sm).heightIn(min=Spacing.touch)){Text(stringResource(if(pastOpen)R.string.turnos_ocultar_anteriores else R.string.turnos_ver_anteriores,pastCount))}
        }
        if(day.past&&!pastOpen)continue
        item(key="dia-${day.title}"){Text(day.title,style=MaterialTheme.typography.titleSmall,modifier=Modifier.padding(top=Spacing.sm))}
        items(day.shifts,key={it.id.ifBlank{it.period}}){shift->MyShiftCard(shift)}
    }
}
/** La entrada se confirma sola al iniciar el turno (ASIS-01): la tarjeta solo muestra el estado y la asistencia. */
@Composable internal fun MyShiftCard(shift:MyShift){
    Column(verticalArrangement=Arrangement.spacedBy(4.dp)){
        AreaChip(shift.area)
        DataRow(shift.hours,meta=MyShifts.attendanceLabel(shift),status={StatusTag(shift.state,label=StaffLabels.shiftState(shift.state))})
    }
}
/** Entrar o salir de mantenimiento; el motivo y el diálogo sobreviven al giro de pantalla. */
@Composable internal fun MaintenanceControl(model:RoleViewModel,unitState:String,version:Int,paramedicOnDuty:Boolean,driverOnDuty:Boolean,onSaved:()->Unit={}){
    val leaving=unitState=="en_mantenimiento";val blocked=MaintenanceRules.leavingBlocked(unitState,paramedicOnDuty,driverOnDuty)
    val state by model.maintenance.collectAsStateWithLifecycle()
    var open by rememberSaveable{mutableStateOf(false)};var reason by rememberSaveable{mutableStateOf("")}
    val title=stringResource(if(leaving)R.string.mantenimiento_sacar else R.string.mantenimiento_poner)
    LaunchedEffect(state.saved){if(state.saved){open=false;reason="";model.resetMaintenance();onSaved()}}
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
