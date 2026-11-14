@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import sv.edu.catolica.climesa.domain.*
import sv.edu.catolica.climesa.R
import androidx.compose.ui.res.stringResource
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private fun receptionIcon(section: AndroidSection) = when (section) {
    AndroidSection.PATIENTS -> Icons.Default.Person
    AndroidSection.BEDS -> Icons.Default.Bed
    AndroidSection.APPOINTMENTS,
    AndroidSection.SHIFTS,
    -> Icons.Default.DateRange
    AndroidSection.PROFILE -> Icons.Default.AccountCircle
    else -> Icons.AutoMirrored.Filled.List
}
private fun receptionNavigation(sections: List<AndroidSection>) = sections.map { AdaptiveNavItem(it.label, receptionIcon(it)) }

private fun receptionSections(sections: List<AndroidSection>): List<AndroidSection> {
    val profile = sections.firstOrNull { it == AndroidSection.PROFILE }
    val operational = sections.filterNot { it == AndroidSection.PROFILE || it == AndroidSection.HOSPITAL_INFO }
    return (operational.take(3) + listOfNotNull(profile) + sections.filterNot { it in operational.take(3) || it == profile }).distinct()
}

@Composable fun ReceptionApp(model:ReceptionViewModel,dark:Boolean,setDark:(Boolean)->Unit,account:AuthenticatedAccount,signingOut:Boolean,logout:()->Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val sections=AndroidSections.visible("REC",account.profile.permissions)
    val navSections = receptionSections(sections)
    var selectedName by rememberSaveable { mutableStateOf(AndroidSection.PROFILE.name) }
    val page=sections.firstOrNull { it.name==selectedName } ?: sections.firstOrNull() ?: return
    val tab=navSections.indexOf(page)
    var discard by remember { mutableStateOf(false) }
    val snack=remember { SnackbarHostState() }
    LaunchedEffect(sections) { if(sections.none { it.name==selectedName }) selectedName=sections.firstOrNull { it==AndroidSection.PROFILE }?.name?:sections.first().name }
    LaunchedEffect(state.message) { state.message?.let { snack.showSnackbar(it);model.clearMessage() } }
    fun back() { if(state.saving)return;if(state.formOpen) discard=true else model.select(null) }
    BackHandler(state.formOpen || state.selected!=null) { back() }
    AdaptiveTabScaffold(
        items=receptionNavigation(navSections),
        selected=tab,
        onSelected={selectedName=navSections[it].name},
        showNavigation=!state.formOpen && state.selected==null,
        onLogout={if(!signingOut)logout()},
        snackbarHost={SnackbarHost(snack)},
        topBar={openMenu->ClimesaTopBar(
            title=if(state.formOpen){if(state.editingId==null)"Registrar paciente" else "Editar ficha"}else if(state.selected!=null)"Ficha del paciente" else stringResource(R.string.ui_marca),
            subtitle=if(!state.formOpen&&state.selected==null)page.label else RoleAccess.label("REC"),
            navigationIcon={if(state.formOpen||state.selected!=null)IconButton(onClick={back()},enabled=!state.saving){Icon(Icons.AutoMirrored.Filled.ArrowBack,"Volver")} else MenuButton(openMenu)},
            actions={HospitalClock();ThemeToggleButton(dark,setDark)},
        )},
    ) { padding -> Column(Modifier.fillMaxSize().padding(padding)) {
        state.error?.takeIf { page==AndroidSection.PATIENTS }?.let { error -> Surface(color=MaterialTheme.colorScheme.errorContainer) {
            Row(Modifier.padding(horizontal=12.dp),verticalAlignment=Alignment.CenterVertically) {
                Text(error,Modifier.weight(1f).padding(vertical=10.dp),style=MaterialTheme.typography.bodyMedium)
                if(!state.fatal) IconButton(onClick=model::clearError) { Icon(Icons.Default.Close,"Cerrar aviso") }
            }
        } }
        when {
            state.formOpen -> PatientForm(state,model)
            state.selected!=null -> PatientDetail(state.selected!!,state,model)
            page==AndroidSection.BEDS -> BedsScreen(account.profile)
            page==AndroidSection.QUEUE -> QueueScreen(account.profile)
            page==AndroidSection.HOSPITAL_INFO -> HospitalInfoScreen()
            page==AndroidSection.DISPATCH -> AmbulanceScreen(page,account.profile,account.session.userId)
            page==AndroidSection.ADMISSION -> HospitalizationScreen(profile=account.profile)
            page==AndroidSection.SHIFTS -> MyShiftsScreen(account,"REC")
            page==AndroidSection.PROFILE -> Profile(state,dark,setDark,account){selectedName=it.name}
            page!=AndroidSection.PATIENTS -> {
                val mock=Maquetas.of(page)
                if(mock!=null) Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) { MaquetaContent(mock) }
                else Column(Modifier.fillMaxSize().padding(20.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) {
                    Text(page.label,style=MaterialTheme.typography.headlineMedium)
                    Text("Esta sección usa el destino ${page.screenId} del catálogo. Su contenido operativo se habilitará en la entrega correspondiente.")
                }
            }
            state.loading -> LoadingState(Modifier.fillMaxSize())
            state.fatal -> ErrorState("No pudimos abrir el registro. Tus datos no se han sobrescrito.",model::reload)
            else -> Patients(state,model)
        }
    } }
    if(discard) AlertDialog(onDismissRequest={discard=false},title={Text("¿Salir del formulario?")},text={Text("Los cambios que aún no guardaste se perderán.")},
        confirmButton={TextButton(onClick={discard=false;model.closeForm()}) {Text("Salir")}},dismissButton={TextButton(onClick={discard=false}) {Text("Seguir editando")}})
}
@Composable private fun Home(state:ReceptionState,patients:()->Unit,select:(String)->Unit) {
    LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(bottom=24.dp),verticalArrangement=Arrangement.spacedBy(0.dp)) {
        item { Surface(color=BrandBlue,shape=RoundedCornerShape(0.dp)) {
            Column(Modifier.fillMaxWidth().padding(24.dp),verticalArrangement=Arrangement.spacedBy(18.dp)) {
                Text("RECEPCIÓN / CLIMESA",style=MaterialTheme.typography.labelSmall,color=Color(0xFFD4D9FF))
                Text("Tu jornada.",style=MaterialTheme.typography.displaySmall,color=Color.White)
                Text("Pacientes y registro, en un mismo lugar.",style=MaterialTheme.typography.bodyMedium,color=Color(0xFFD4D9FF))
                HorizontalDivider(color=Color(0x55FFFFFF))
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(32.dp)) {
                    Metric("Activos",(state.registry.totalActive ?: state.registry.patients.count {it.active}),Modifier.weight(1f))
                    Metric("Inactivos",(state.registry.totalInactive ?: state.registry.patients.count {!it.active}),Modifier.weight(1f))
                }
            }
        } }
        item { Button(onClick=patients,modifier=Modifier.fillMaxWidth().padding(24.dp).heightIn(min=54.dp),colors=ButtonDefaults.buttonColors(containerColor=BrandNavy),shape=MaterialTheme.shapes.small) {
            Icon(Icons.Default.Search,null);Spacer(Modifier.width(12.dp));Text("Buscar paciente",Modifier.weight(1f));Text("→")
        } }
        item { Row(Modifier.fillMaxWidth().padding(horizontal=24.dp,vertical=8.dp),verticalAlignment=Alignment.CenterVertically) {
            Text("Pacientes recientes",style=MaterialTheme.typography.titleLarge,modifier=Modifier.weight(1f))
            TextButton(onClick=patients) {Text("Ver todos")}
        } }
        items(state.registry.patients.take(3),key={it.id}) { p -> Box(Modifier.padding(horizontal=24.dp)) {PatientRow(p) {select(p.id)}} }
        item { Text("Busca un paciente para consultar o actualizar su ficha.",Modifier.padding(24.dp),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}
@Composable private fun Metric(label:String,value:Int,modifier:Modifier) {
    Row(modifier,verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) {
        Text(value.toString().padStart(2,'0'),style=MaterialTheme.typography.headlineMedium,color=Color.White)
        Text(label,style=MaterialTheme.typography.labelSmall,color=Color(0xFFD4D9FF))
    }
}
@Composable private fun Patients(state:ReceptionState,model:ReceptionViewModel) {
    LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(14.dp)) {
        item { SectionIntro("Recepción / CLIMESA", "Pacientes", "Buscá antes de registrar.") }
        item { OutlinedTextField(value=state.query,onValueChange=model::query,modifier=Modifier.fillMaxWidth(),label={Text("Nombre, DUI o expediente")},singleLine=true,leadingIcon={Icon(Icons.Default.Search,null)},trailingIcon={if(state.query.isNotEmpty()) IconButton(onClick={model.query("")}) {Icon(Icons.Default.Close,"Limpiar búsqueda")}}) }
        item { Column(verticalArrangement=Arrangement.spacedBy(10.dp)) {
            if(PatientAction.SEARCH in state.actions) ClimesaButton(if(state.searching) "Buscando…" else "Buscar",Icons.Default.Search,model::search,enabled=!state.searching && PatientRules.normalize(state.query).replace(" ","").length>=2)
            if(PatientAction.REGISTER in state.actions) ClimesaButton("Registrar paciente",Icons.Default.Add,model::newPatient,enabled=state.searchedQuery!=null,outlined=true)
        } }
        item { LazyRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) {items(3) {i->val label=listOf("Activos","Inactivos","Todos")[i];FilterChip(selected=state.filter==i,onClick={model.filter(i)},label={Text(label)})}} }
        item { Text(if(state.searchedQuery==null) "${state.results.size} pacientes" else "${state.results.size} coincidencias",style=MaterialTheme.typography.labelLarge) }
        if(state.results.isEmpty()) item { EmptyState("Sin coincidencias. Ajustá la búsqueda o el filtro.") }
        items(state.results,key={it.id}) {p -> PatientRow(p) {model.select(p.id)} }
    }
}
@Composable private fun PatientRow(p:Patient,click:()->Unit) {
    DataRow(p.fullName,meta="EXP. ${p.record}",status={StatusTag(if(p.active) "activo" else "inactivo")},onClick=click)
}
@Composable private fun PatientDetail(p:Patient,state:ReceptionState,model:ReceptionViewModel) {
    var dialog by remember(p.id) {mutableStateOf(false)}
    var reason by remember(p.id) {mutableStateOf("")}
    LaunchedEffect(p.version) {dialog=false;reason=""}
    LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        item {Surface(color=BrandBlue,shape=MaterialTheme.shapes.large) {Column(Modifier.fillMaxWidth().padding(20.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {Text("EXPEDIENTE ${p.record}",style=MaterialTheme.typography.labelSmall,color=Color(0xFFD4D9FF));Text(p.fullName,style=MaterialTheme.typography.titleLarge,color=Color.White);Text(if(p.active) "Activo" else "Inactivo",style=MaterialTheme.typography.bodySmall,color=StateFree)}}}
        item {ClimesaCard {Column(Modifier.fillMaxWidth().padding(20.dp),verticalArrangement=Arrangement.spacedBy(20.dp)) {
            Value("DUI",p.dui ?: "Sin documento registrado");Value("Nacimiento",p.birth?.toString() ?: "No registrado");Value("Sexo",p.sex.label);Value("Teléfono",p.phone.ifBlank {"No registrado"})
        }}}
        item {ClimesaActionGroup {if(PatientAction.EDIT in state.actions) ClimesaButton("Editar datos",Icons.Default.Edit,{model.edit(p)})
            if(PatientAction.CHANGE_STATUS in state.actions) ClimesaButton(if(p.active) "Inactivar paciente" else "Reactivar paciente",Icons.Default.ToggleOff,{dialog=true},enabled=!state.saving,outlined=true)}}
        item {Text("Historial de actividad",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.Bold)}
        val events=state.registry.audit.filter {it.record==p.record}.reversed()
        if(events.isEmpty()) item {Text("Ficha de ejemplo. Todavía no tiene cambios.")}
        items(events) {AuditRow(it)}
        item {Text("Los cambios de esta ficha se conservan en el historial.",style=MaterialTheme.typography.bodySmall)}
    }
    if(dialog) AlertDialog(onDismissRequest={if(!state.saving)dialog=false},title={Text(if(p.active) "Inactivar paciente" else "Reactivar paciente")},
        text={Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {Text("La ficha y su historial se conservan.");OutlinedTextField(reason,{reason=it.take(500)},label={Text("Motivo")},supportingText={Text("Mínimo 10 caracteres")})}},
        confirmButton={TextButton(enabled=ChangeReason.error(reason)==null && !state.saving,onClick={model.changeActive(p,reason)}) {Text(if(state.saving) "Guardando…" else "Confirmar")}},
        dismissButton={TextButton(enabled=!state.saving,onClick={dialog=false}) {Text("Cancelar")}})
}
@Composable private fun Value(label:String,value:String) {Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {Text(label.uppercase(),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant);Text(value,style=MaterialTheme.typography.bodyLarge);HorizontalDivider()}}
@Composable private fun PatientForm(state:ReceptionState,model:ReceptionViewModel) {
    val d=state.draft
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
        Text(if(state.editingId==null) "Nuevo paciente" else "Actualizar información",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)
        Text("Los campos con * son obligatorios.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
        Text("01 / DATOS PERSONALES",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.primary)
        PatientField("Nombres *",d.givenNames,state.fields["givenNames"],enabled=!state.saving) {model.draft(d.copy(givenNames=it.take(80)))}
        PatientField("Apellidos *",d.surnames,state.fields["surnames"],enabled=!state.saving) {model.draft(d.copy(surnames=it.take(100)))}
        PatientField("DUI · opcional",d.dui,state.fields["dui"],"12345678-9",KeyboardType.Phone,!state.saving) {model.draft(d.copy(dui=it.take(10)))}
        PatientField("Nacimiento · opcional",d.birth,state.fields["birth"],"AAAA-MM-DD",enabled=!state.saving) {model.draft(d.copy(birth=it.take(10)))}
        Text("Sexo registrado",style=MaterialTheme.typography.labelLarge)
        Sex.entries.forEach {sex -> Row(verticalAlignment=Alignment.CenterVertically) {RadioButton(selected=d.sex==sex,onClick={model.draft(d.copy(sex=sex))},enabled=!state.saving);TextButton(onClick={model.draft(d.copy(sex=sex))},enabled=!state.saving) {Text(sex.label)}}}
        PatientField("Teléfono · opcional",d.phone,state.fields["phone"],"7000-0000",KeyboardType.Phone,!state.saving) {model.draft(d.copy(phone=it.take(9)))}
        if(state.editingId!=null) OutlinedTextField(state.reason,model::reason,modifier=Modifier.fillMaxWidth(),enabled=!state.saving,label={Text("Motivo de modificación *")},supportingText={Text("Mínimo 10 caracteres. Quedará en el historial.")})
        Button(onClick=model::save,enabled=!state.saving,modifier=Modifier.fillMaxWidth().heightIn(min=52.dp)) {Text(if(state.saving) "Guardando…" else "Guardar paciente")}
        Text("Revisá posibles duplicados antes de guardar.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(24.dp))
    }
}
@Composable private fun PatientField(label:String,value:String,error:String?,hint:String="",keyboard:KeyboardType=KeyboardType.Text,enabled:Boolean=true,change:(String)->Unit) {
    FormField(label,value,change,error=error,hint=hint.ifBlank{null},enabled=enabled,keyboardOptions=KeyboardOptions(keyboardType=keyboard))
}
@Composable private fun Profile(state:ReceptionState,dark:Boolean,setDark:(Boolean)->Unit,account:AuthenticatedAccount,onNavigate:(AndroidSection)->Unit) {
    LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        item {SectionIntro(stringResource(R.string.ui_cuenta_eyebrow),stringResource(R.string.ui_cuenta_titulo))}
        item {ProfileSummaryCard(account)}
        account.profile.notice?.let {item {NoticeBanner(NoticeKind.WARNING,"La validación de permisos todavía no está disponible.")}}
        item {AppearanceCard(dark,setDark)}
        item {Text("Accesos principales",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)}
        items(listOf(AndroidSection.PATIENTS,AndroidSection.QUEUE,AndroidSection.APPOINTMENTS).filter{it in AndroidSections.visible("REC",account.profile.permissions)},key={it.name}){section->
            DataRow(section.label,subtitle=stringResource(R.string.ui_abrir_modulo),leadingIcon=iconFor(section),onClick={onNavigate(section)})
        }
        item {Text("Actividad reciente",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.Bold)}
        if(state.registry.audit.isEmpty()) item {Text("Aquí aparecerán los registros y cambios.")}
        items(state.registry.audit.takeLast(20).reversed()) {AuditRow(it)}
        item {HorizontalDivider();Spacer(Modifier.height(12.dp));Text("Hospital universitario CLIMESA");Text("Tu cuenta es personal. Cierra sesión desde el menú ☰.",style=MaterialTheme.typography.bodySmall)}
    }
}
@Composable private fun AuditRow(a:AuditEvent) {ClimesaCard {Column(Modifier.fillMaxWidth().padding(16.dp),verticalArrangement=Arrangement.spacedBy(5.dp)) {
    Text("${a.action} · ${a.record}",fontWeight=FontWeight.SemiBold);Text(a.reason)
    a.changes.forEach { (field,value) -> Text("$field: $value",style=MaterialTheme.typography.bodySmall) }
    Text("${DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(ZoneId.of("America/El_Salvador")).format(Instant.parse(a.at))} · v${a.version}",style=MaterialTheme.typography.labelSmall)
}}}
