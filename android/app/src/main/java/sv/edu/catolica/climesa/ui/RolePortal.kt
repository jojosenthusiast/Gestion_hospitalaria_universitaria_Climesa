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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import org.json.JSONArray
import org.json.JSONObject
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.*
import java.net.URLEncoder
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class RoleData(val loading:Boolean=false,val data:Any?=null,val error:String?=null)
/** Lectura de datos del portal por rol; separada de [ApiClient] para poder probar el ViewModel. */
fun interface RoleDataSource{suspend fun get(path:String):Any}
@HiltViewModel class RoleViewModel @Inject constructor(private val source:RoleDataSource,realtime:RealtimeRepository):ViewModel(){
    private val mutable=MutableStateFlow(RoleData());val state=mutable.asStateFlow()
    private var job:Job?=null
    private var current:String?=null
    private val live=LiveSubscription(realtime)
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
private fun sectionIcon(s:AndroidSection)=when(s){AndroidSection.HOME->Icons.Default.Home;AndroidSection.PROFILE->Icons.Default.AccountCircle;AndroidSection.SHIFTS,AndroidSection.APPOINTMENTS->Icons.Default.DateRange;AndroidSection.PATIENTS->Icons.Default.Person;AndroidSection.UNIT,AndroidSection.SERVICE->Icons.Default.Info;else->Icons.Default.List}
private fun sectionPath(s:AndroidSection)=when(s){AndroidSection.HOME->"/inicio";AndroidSection.SHIFTS->"/turnos/mios";AndroidSection.PATIENTS->"/pacientes?limit=50";AndroidSection.UNIT->"/ambulancia";else->null}
private val unitStates=mapOf("disponible" to "Disponible","en_servicio" to "En servicio","en_mantenimiento" to "En mantenimiento")
@Composable fun RolePortal(account:AuthenticatedAccount,role:String,dark:Boolean,setDark:(Boolean)->Unit,signingOut:Boolean,logout:()->Unit,refresh:()->Unit){
    val model:RoleViewModel=viewModel(key="role-${account.session.userId}")
    val data by model.state.collectAsStateWithLifecycle()
    var selected by rememberSaveable(role){mutableIntStateOf(0)};var query by rememberSaveable{mutableStateOf("")}
    val sections=AndroidSections.visible(account.profile.permissions);val page=sections[selected.coerceIn(0,sections.lastIndex)]
    val path=sectionPath(page)
    LaunchedEffect(role,page){model.load(path)}
    LaunchedEffect(account.profile.channels){model.start(account.profile.channels)}
    Scaffold(containerColor=MaterialTheme.colorScheme.background,topBar={TopAppBar(title={Column{Text("climesa",style=MaterialTheme.typography.titleMedium);Text(RoleAccess.label(role),style=MaterialTheme.typography.labelSmall,color=Color(0xFFB0B4C9))}},actions={IconButton(onClick={setDark(!dark)}){Icon(Icons.Default.Settings,"Cambiar apariencia")}},colors=TopAppBarDefaults.topAppBarColors(containerColor=BrandNavy,titleContentColor=Color.White,actionIconContentColor=Color.White))},bottomBar={NavigationBar(containerColor=BrandNavy,tonalElevation=0.dp){sections.forEachIndexed{i,s->NavigationBarItem(selected=selected==i,onClick={selected=i},icon={Icon(sectionIcon(s),null)},label={Text(s.label)},colors=NavigationBarItemDefaults.colors(selectedIconColor=Color.White,selectedTextColor=Color.White,indicatorColor=BrandBlue,unselectedIconColor=Color(0xFFB0B4C9),unselectedTextColor=Color(0xFFB0B4C9)))}}}){padding->
        if(page==AndroidSection.BEDS){BedsScreen(account.profile,Modifier.padding(padding));return@Scaffold}
        LazyColumn(Modifier.fillMaxSize().padding(padding),contentPadding=PaddingValues(22.dp),verticalArrangement=Arrangement.spacedBy(20.dp)){
            item{Text("${RoleAccess.label(role).uppercase()} / CLIMESA",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.primary);Spacer(Modifier.height(12.dp));Text(if(page==AndroidSection.HOME)"Tu jornada."else"${page.label}.",style=MaterialTheme.typography.displaySmall)}
            if(page==AndroidSection.PROFILE){
                item{Surface(color=MaterialTheme.colorScheme.surface,shape=RoundedCornerShape(0.dp)){Column(Modifier.fillMaxWidth().padding(22.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){Text(account.profile.name.ifBlank{account.session.email},style=MaterialTheme.typography.titleLarge);Text(account.session.email);HorizontalDivider();Text("Roles: ${account.profile.roles.joinToString{RoleAccess.label(it)}}",style=MaterialTheme.typography.bodyMedium);Text("Tu cuenta es personal. Cierra sesión al terminar tu jornada.",style=MaterialTheme.typography.bodySmall)}}}
                item{OutlinedButton(onClick=refresh,modifier=Modifier.fillMaxWidth()){Text("Actualizar acceso")};Spacer(Modifier.height(10.dp));Button(onClick=logout,enabled=!signingOut,modifier=Modifier.fillMaxWidth()){Text(if(signingOut)"Cerrando sesión…"else stringResource(R.string.cerrar_sesion))}}
            }else if(!page.ready)item{PendingModule()}
            else if(data.loading)item{Box(Modifier.fillMaxWidth().height(200.dp),contentAlignment=Alignment.Center){CircularProgressIndicator()}}
            else if(data.error!=null)item{Text(data.error!!,color=MaterialTheme.colorScheme.error);Button(onClick={model.load(path)}){Text(stringResource(R.string.camas_reintentar))}}
            else if(page==AndroidSection.HOME){
                item{Surface(color=BrandBlue,shape=RoundedCornerShape(0.dp)){Column(Modifier.fillMaxWidth().padding(24.dp),verticalArrangement=Arrangement.spacedBy(13.dp)){Text(account.profile.name.ifBlank{"Bienvenido a CLIMESA"},style=MaterialTheme.typography.headlineMedium,color=Color.White);Text("${RoleAccess.label(role)} · Cuenta activa",color=Color(0xFFD4D9FF),style=MaterialTheme.typography.bodyMedium)}}}
                val summary=data.data as? JSONObject
                val beds=summary?.optJSONObject("beds")
                if(beds!=null)item{Text("${beds.optInt("free")} de ${beds.optInt("total")} camas libres",style=MaterialTheme.typography.titleLarge);HorizontalDivider()}
                items(sections.filter{it!=AndroidSection.HOME}){s->TextButton(onClick={selected=sections.indexOf(s)},modifier=Modifier.fillMaxWidth()){Text(s.label,Modifier.weight(1f));Text("→")};HorizontalDivider()}
            }else if(page==AndroidSection.PATIENTS){
                item{OutlinedTextField(query,{query=it.take(100)},label={Text("Nombre, DUI o expediente")},modifier=Modifier.fillMaxWidth(),singleLine=true);Spacer(Modifier.height(12.dp));Button(onClick={model.load("/pacientes?query="+URLEncoder.encode(query,"UTF-8")+"&limit=50")},enabled=query.trim().length>=2,modifier=Modifier.fillMaxWidth()){Text("Buscar paciente")}}
                val rows=data.data as? JSONArray
                if(rows==null||rows.length()==0)item{Text("No hay coincidencias. Ajusta la búsqueda.")}
                else items((0 until rows.length()).toList()){i->val p=rows.getJSONObject(i);Column(verticalArrangement=Arrangement.spacedBy(8.dp)){Text(p.optString("fullName"),style=MaterialTheme.typography.titleMedium);Text("EXP. ${p.optString("record")}",style=MaterialTheme.typography.labelSmall);HorizontalDivider()}}
            }else if(page==AndroidSection.UNIT){
                val unit=(data.data as? JSONObject)?.optJSONObject("unit");val service=(data.data as? JSONObject)?.optJSONObject("activeService")
                item{Surface(color=MaterialTheme.colorScheme.surface,shape=RoundedCornerShape(0.dp)){Column(Modifier.fillMaxWidth().padding(18.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){Text(unit?.optString("plate").orEmpty(),style=MaterialTheme.typography.titleMedium);Text("${stringResource(R.string.unidad_estado)}: ${unitStates[unit?.optString("state")]?:unit?.optString("state").orEmpty()}",color=MaterialTheme.colorScheme.primary);Text("${stringResource(R.string.unidad_paramedico_turno)}: ${stringResource(if((data.data as? JSONObject)?.optBoolean("paramedicOnDuty")==true)R.string.unidad_si else R.string.unidad_no)}",style=MaterialTheme.typography.bodySmall);HorizontalDivider();if(service==null)Text(stringResource(R.string.unidad_sin_servicio)) else {Text(stringResource(R.string.unidad_servicio_activo),style=MaterialTheme.typography.labelSmall);Text("${service.optString("origin")} → ${service.optString("destination")}")}}}}
            }else if(page==AndroidSection.SHIFTS){
                val rows=data.data as? JSONArray
                if(rows==null||rows.length()==0)item{Text("No tienes turnos publicados.",style=MaterialTheme.typography.bodyMedium)}
                else items((0 until rows.length()).toList()){i->val r=rows.getJSONObject(i);Surface(color=MaterialTheme.colorScheme.surface,shape=RoundedCornerShape(0.dp)){Column(Modifier.fillMaxWidth().padding(18.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){Text(r.optString("area"),style=MaterialTheme.typography.titleMedium);val format=DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(ZoneId.of("America/El_Salvador"));Text(format.format(Instant.parse(r.getString("start")))+" — "+format.format(Instant.parse(r.getString("end"))),style=MaterialTheme.typography.bodyMedium);Text(r.optString("state"),style=MaterialTheme.typography.labelSmall)}}}
            }else item{PendingModule()}
        }
    }
}
@Composable private fun PendingModule(){Column{HorizontalDivider();Spacer(Modifier.height(22.dp));Text(stringResource(R.string.portal_proxima_entrega),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.primary);Spacer(Modifier.height(14.dp));Text(stringResource(R.string.portal_modulo_pendiente),style=MaterialTheme.typography.titleLarge);Spacer(Modifier.height(12.dp));Text(stringResource(R.string.portal_modulo_pendiente_detalle),style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)}}
