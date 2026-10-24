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
import sv.edu.catolica.climesa.data.ApiClient
import sv.edu.catolica.climesa.domain.*
import java.net.URLEncoder
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class RoleData(val loading:Boolean=false,val data:Any?=null,val error:String?=null)
@HiltViewModel class RoleViewModel @Inject constructor(private val api:ApiClient):ViewModel(){
    private val mutable=MutableStateFlow(RoleData());val state=mutable.asStateFlow()
    private var job:Job?=null
    fun load(path:String?){job?.cancel();job=viewModelScope.launch{mutable.value=RoleData(loading=path!=null);if(path!=null)try{mutable.value=RoleData(data=api.request(path))}catch(e:Exception){if(e is CancellationException)throw e;mutable.value=RoleData(error=e.message?:"No se pudo cargar la información.")}}}
}
@Composable fun RolePortal(account:AuthenticatedAccount,role:String,dark:Boolean,setDark:(Boolean)->Unit,signingOut:Boolean,logout:()->Unit,refresh:()->Unit){
    val model:RoleViewModel=viewModel(key="role-${account.session.userId}")
    val data by model.state.collectAsStateWithLifecycle()
    var selected by rememberSaveable(role){mutableIntStateOf(0)};var query by rememberSaveable{mutableStateOf("")}
    val sections=RoleAccess.sections(role);val page=sections[selected.coerceIn(0,sections.lastIndex)]
    val path=when(page){"Inicio"->"/inicio";"Camas"->"/camas";"Mis turnos"->"/turnos/mios";"Pacientes"->"/pacientes?limit=50";else->null}
    LaunchedEffect(role,page){model.load(path)}
    Scaffold(containerColor=MaterialTheme.colorScheme.background,topBar={TopAppBar(title={Column{Text("climesa",style=MaterialTheme.typography.titleMedium);Text(RoleAccess.label(role),style=MaterialTheme.typography.labelSmall,color=Color(0xFFB0B4C9))}},actions={IconButton(onClick={setDark(!dark)}){Icon(Icons.Default.Settings,"Cambiar apariencia")}},colors=TopAppBarDefaults.topAppBarColors(containerColor=BrandNavy,titleContentColor=Color.White,actionIconContentColor=Color.White))},bottomBar={NavigationBar(containerColor=BrandNavy,tonalElevation=0.dp){sections.forEachIndexed{i,s->NavigationBarItem(selected=selected==i,onClick={selected=i},icon={Icon(when(s){"Inicio"->Icons.Default.Home;"Mi cuenta"->Icons.Default.AccountCircle;"Mis turnos","Citas"->Icons.Default.DateRange;"Pacientes"->Icons.Default.Person;else->Icons.Default.List},null)},label={Text(s)},colors=NavigationBarItemDefaults.colors(selectedIconColor=Color.White,selectedTextColor=Color.White,indicatorColor=BrandBlue,unselectedIconColor=Color(0xFFB0B4C9),unselectedTextColor=Color(0xFFB0B4C9)))}}}){padding->
        LazyColumn(Modifier.fillMaxSize().padding(padding),contentPadding=PaddingValues(22.dp),verticalArrangement=Arrangement.spacedBy(20.dp)){
            item{Text("${RoleAccess.label(role).uppercase()} / CLIMESA",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.primary);Spacer(Modifier.height(12.dp));Text(if(page=="Inicio")"Tu jornada."else"$page.",style=MaterialTheme.typography.displaySmall)}
            if(page=="Mi cuenta"){
                item{Surface(color=MaterialTheme.colorScheme.surface,shape=RoundedCornerShape(0.dp)){Column(Modifier.fillMaxWidth().padding(22.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){Text(account.profile.name.ifBlank{account.session.email},style=MaterialTheme.typography.titleLarge);Text(account.session.email);HorizontalDivider();Text("Roles: ${account.profile.roles.joinToString{RoleAccess.label(it)}}",style=MaterialTheme.typography.bodyMedium);Text("Tu cuenta es personal. Cierra sesión al terminar tu jornada.",style=MaterialTheme.typography.bodySmall)}}}
                item{OutlinedButton(onClick=refresh,modifier=Modifier.fillMaxWidth()){Text("Actualizar acceso")};Spacer(Modifier.height(10.dp));Button(onClick=logout,enabled=!signingOut,modifier=Modifier.fillMaxWidth()){Text(if(signingOut)"Cerrando sesión…"else"Cerrar sesión")}}
            }else if(data.loading)item{Box(Modifier.fillMaxWidth().height(200.dp),contentAlignment=Alignment.Center){CircularProgressIndicator()}}
            else if(data.error!=null)item{Text(data.error!!,color=MaterialTheme.colorScheme.error);Button(onClick={model.load(path)}){Text("Volver a intentar")}}
            else if(page=="Inicio"){
                item{Surface(color=BrandBlue,shape=RoundedCornerShape(0.dp)){Column(Modifier.fillMaxWidth().padding(24.dp),verticalArrangement=Arrangement.spacedBy(13.dp)){Text(account.profile.name.ifBlank{"Bienvenido a CLIMESA"},style=MaterialTheme.typography.headlineMedium,color=Color.White);Text("${RoleAccess.label(role)} · Cuenta activa",color=Color(0xFFD4D9FF),style=MaterialTheme.typography.bodyMedium)}}}
                val summary=data.data as? JSONObject
                val beds=summary?.optJSONObject("beds")
                if(beds!=null)item{Text("${beds.optInt("free")} de ${beds.optInt("total")} camas libres",style=MaterialTheme.typography.titleLarge);HorizontalDivider()}
                items(sections.filter{it!="Inicio"}){s->TextButton(onClick={selected=sections.indexOf(s)},modifier=Modifier.fillMaxWidth()){Text(s,Modifier.weight(1f));Text("→")};HorizontalDivider()}
            }else if(page=="Pacientes"){
                item{OutlinedTextField(query,{query=it.take(100)},label={Text("Nombre, DUI o expediente")},modifier=Modifier.fillMaxWidth(),singleLine=true);Spacer(Modifier.height(12.dp));Button(onClick={model.load("/pacientes?query="+URLEncoder.encode(query,"UTF-8")+"&limit=50")},enabled=query.trim().length>=2,modifier=Modifier.fillMaxWidth()){Text("Buscar paciente")}}
                val rows=data.data as? JSONArray
                if(rows==null||rows.length()==0)item{Text("No hay coincidencias. Ajusta la búsqueda.")}
                else items((0 until rows.length()).toList()){i->val p=rows.getJSONObject(i);Column(verticalArrangement=Arrangement.spacedBy(8.dp)){Text(p.optString("fullName"),style=MaterialTheme.typography.titleMedium);Text("EXP. ${p.optString("record")}",style=MaterialTheme.typography.labelSmall);HorizontalDivider()}}
            }else if(page=="Camas"||page=="Mis turnos"){
                val rows=data.data as? JSONArray
                if(rows==null||rows.length()==0)item{Text(if(page=="Camas")"No hay camas disponibles en esta vista."else"No tienes turnos publicados.",style=MaterialTheme.typography.bodyMedium)}
                else items((0 until rows.length()).toList()){i->val r=rows.getJSONObject(i);Surface(color=MaterialTheme.colorScheme.surface,shape=RoundedCornerShape(0.dp)){Column(Modifier.fillMaxWidth().padding(18.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){if(page=="Camas"){Text(r.optString("code"),style=MaterialTheme.typography.titleMedium);Text(r.optString("room"),style=MaterialTheme.typography.bodySmall);Text(mapOf("libre" to "Libre","ocupada" to "Ocupada","reservada" to "Reservada","limpieza" to "En limpieza","bloqueada" to "Bloqueada")[r.optString("state")]?:r.optString("state"),color=MaterialTheme.colorScheme.primary);r.optString("occupant").takeIf{it.isNotBlank()}?.let{Text(it)}}else{Text(r.optString("area"),style=MaterialTheme.typography.titleMedium);val format=DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(ZoneId.of("America/El_Salvador"));Text(format.format(Instant.parse(r.getString("start")))+" — "+format.format(Instant.parse(r.getString("end"))),style=MaterialTheme.typography.bodyMedium);Text(r.optString("state"),style=MaterialTheme.typography.labelSmall)}}}}
            }else item{HorizontalDivider();Spacer(Modifier.height(22.dp));Text("Próxima entrega",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.primary);Spacer(Modifier.height(14.dp));Text("Este módulo todavía no está habilitado.",style=MaterialTheme.typography.titleLarge);Spacer(Modifier.height(12.dp));Text("Su acceso y navegación ya están definidos para tu rol. Las operaciones se habilitarán en la siguiente entrega.",style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)}
        }
    }
}
