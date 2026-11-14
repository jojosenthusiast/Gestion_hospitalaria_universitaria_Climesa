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
import sv.edu.catolica.climesa.ui.dashboard.RoleDashboardScreen
import androidx.compose.ui.res.stringResource
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable fun ReceptionApp(model:ReceptionViewModel,dark:Boolean,setDark:(Boolean)->Unit,account:AuthenticatedAccount,signingOut:Boolean,logout:()->Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val sections=AndroidSections.visible("REC",account.profile.permissions)
    var selectedName by rememberSaveable { mutableStateOf(AndroidSection.HOME.name) }
    val inbox=rememberQuickActionInbox()
    val page=sections.firstOrNull { it.name==selectedName } ?: sections.firstOrNull() ?: return
    var discard by remember { mutableStateOf(false) }
    val snack=remember { SnackbarHostState() }
    LaunchedEffect(sections) { if(sections.none { it.name==selectedName }) selectedName=sections.firstOrNull { it==AndroidSection.PROFILE }?.name?:sections.first().name }
    LaunchedEffect(page) { inbox.dropUnless(page) }
    val patientAction=inbox.actionFor(AndroidSection.PATIENTS)
    LaunchedEffect(patientAction,state.loading) {
        if(patientAction==null||state.loading)return@LaunchedEffect
        if(patientAction==QuickAction.REGISTER_PATIENT&&QuickActions.allowed(patientAction,account.profile.permissions)&&state.query.trim().length>=2) model.newPatient()
        inbox.consume(AndroidSection.PATIENTS)
    }
    LaunchedEffect(state.message) { state.message?.let { snack.showSnackbar(it);model.clearMessage() } }
    fun back() { if(state.saving)return;if(state.formOpen) discard=true else model.select(null) }
    BackHandler(state.formOpen || state.selected!=null) { back() }
    PortalScaffold(
        role="REC",sections=sections,selected=page,onSelected={selectedName=it.name},dark=dark,setDark=setDark,
        onLogout={if(!signingOut)logout()},
        showNavigation=!state.formOpen && state.selected==null,
        snackbarHost={SnackbarHost(snack)},
        title=if(state.formOpen){if(state.editingId==null)"Registrar paciente" else "Editar ficha"}else if(state.selected!=null)"Ficha del paciente" else page.label,
        subtitle=if(state.formOpen)state.registry.patients.firstOrNull{it.id==state.editingId}?.fullName else state.selected?.fullName,
        navigationIcon={if(state.formOpen||state.selected!=null)BackButton({back()},enabled=!state.saving)},
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
            page==AndroidSection.HOME -> RoleDashboardScreen(account,"REC",{request->if(request.section in sections){selectedName=request.section.name;inbox.post(request)}})
            page==AndroidSection.APPOINTMENTS -> ReceptionAppointmentsScreen(account.profile.channels,"citas.agendar" in account.profile.permissions,quickAction=inbox.actionFor(AndroidSection.APPOINTMENTS),onQuickActionHandled={inbox.consume(AndroidSection.APPOINTMENTS)},permissions=account.profile.permissions)
            page==AndroidSection.LINKING -> ReceptionLinkingScreen(account.profile.channels,"cuentas.verificar" in account.profile.permissions,{selectedName=AndroidSection.PATIENTS.name})
            page==AndroidSection.BEDS -> BedsScreen(account.profile)
            page==AndroidSection.QUEUE -> QueueScreen(account.profile)
            page==AndroidSection.HOSPITAL_INFO -> HospitalInfoScreen()
            page==AndroidSection.DISPATCH -> AmbulanceScreen(page,account.profile,account.session.userId)
            page==AndroidSection.ADMISSION -> HospitalizationScreen(profile=account.profile)
            page==AndroidSection.SHIFTS -> MyShiftsScreen(account,"REC")
            page==AndroidSection.PROFILE -> Profile(state,dark,setDark,account,{if(!signingOut)logout()})
            page!=AndroidSection.PATIENTS -> {
                Column(Modifier.fillMaxSize().padding(20.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) {
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
    PageList {
        item { SectionCard(stringResource(R.string.recepcion_home_titulo),eyebrow=stringResource(R.string.recepcion_home_eyebrow)) {
            Text(stringResource(R.string.recepcion_home_detalle),style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(Spacing.sm)) {
                StatTile((state.registry.totalActive ?: state.registry.patients.count {it.active}).toString(),stringResource(R.string.recepcion_stat_activos),Modifier.weight(1f))
                StatTile((state.registry.totalInactive ?: state.registry.patients.count {!it.active}).toString(),stringResource(R.string.recepcion_stat_inactivos),Modifier.weight(1f))
            }
        } }
        item { PrimaryButton(stringResource(R.string.recepcion_buscar_paciente),patients,icon=Icons.Default.Search) }
        item { Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
            Text(stringResource(R.string.recepcion_pacientes_recientes),style=MaterialTheme.typography.titleLarge,modifier=Modifier.weight(1f))
            TextButton(onClick=patients) {Text(stringResource(R.string.recepcion_ver_todos))}
        } }
        items(state.registry.patients.take(3),key={it.id}) { p -> PatientRow(p) {select(p.id)} }
        item { Text(stringResource(R.string.recepcion_home_ayuda),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}
@Composable private fun Patients(state:ReceptionState,model:ReceptionViewModel) {
    LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(14.dp)) {
        item { SectionIntro("Recepción / CLIMESA", "Pacientes", stringResource(R.string.rec_registrar_regla)) }
        item { OutlinedTextField(value=state.query,onValueChange=model::query,modifier=Modifier.fillMaxWidth(),label={Text("Nombre, DUI o expediente")},singleLine=true,leadingIcon={Icon(Icons.Default.Search,null)},trailingIcon={if(state.query.isNotEmpty()) IconButton(onClick={model.query("")}) {Icon(Icons.Default.Close,"Limpiar búsqueda")}}) }
        item { Column(verticalArrangement=Arrangement.spacedBy(10.dp)) {
            if(PatientAction.SEARCH in state.actions) ClimesaButton(if(state.searching) "Buscando…" else "Buscar",Icons.Default.Search,model::search,enabled=!state.searching && PatientRules.normalize(state.query).replace(" ","").length>=2)
            if(PatientAction.REGISTER in state.actions) ClimesaButton(if(state.searching) "Buscando…" else "Registrar paciente",Icons.Default.Add,model::newPatient,enabled=!state.searching,outlined=true)
            if(PatientAction.REGISTER in state.actions && state.searchedQuery==null && PatientRules.normalize(state.query).replace(" ","").length<2) Text(stringResource(R.string.rec_registrar_sin_busqueda),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
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
    var tab by rememberSaveable(p.id) {mutableStateOf(0)}
    val gaps=sv.edu.catolica.climesa.domain.PatientCompleteness.gaps(p)
    var reason by remember(p.id) {mutableStateOf("")}
    LaunchedEffect(p.version) {dialog=false;reason=""}
    LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        item {Surface(color=BrandBlue,shape=MaterialTheme.shapes.large) {Column(Modifier.fillMaxWidth().padding(20.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {Text("EXPEDIENTE ${p.record}",style=MaterialTheme.typography.labelSmall,color=Color(0xFFD4D9FF));Text(p.fullName,style=MaterialTheme.typography.titleLarge,color=Color.White);Text(if(p.active) "Activo" else "Inactivo",style=MaterialTheme.typography.bodySmall,color=StateFree)}}}
        item {androidx.compose.material3.TabRow(selectedTabIndex=tab) {listOf(R.string.pac_ficha_datos,R.string.pac_ficha_cambios).forEachIndexed {i,id->androidx.compose.material3.Tab(selected=tab==i,onClick={tab=i},text={Text(stringResource(id))})}}}
        if(tab==0) item {Text(if(gaps.isEmpty()) stringResource(R.string.pac_ficha_completa) else stringResource(R.string.pac_ficha_faltan,gaps.joinToString(", ")),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)}
        if(tab==0) item {ClimesaCard {Column(Modifier.fillMaxWidth().padding(20.dp),verticalArrangement=Arrangement.spacedBy(20.dp)) {
            Value("DUI",p.dui ?: "Sin documento registrado");Value("Nacimiento",p.birth?.toString() ?: "No registrado");Value("Sexo",p.sex.label);Value("Teléfono",p.phone.ifBlank {"No registrado"})
        }}}
        if(tab==0) item {ClimesaActionGroup {if(PatientAction.EDIT in state.actions) ClimesaButton("Editar datos",Icons.Default.Edit,{model.edit(p)})
            if(PatientAction.CHANGE_STATUS in state.actions) ClimesaButton(if(p.active) "Inactivar paciente" else "Reactivar paciente",Icons.Default.ToggleOff,{dialog=true},enabled=!state.saving,outlined=true)}}
        if(tab==1) item {Text("Historial de actividad",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.Bold)}
        val events=state.registry.audit.filter {it.record==p.record}.reversed()
        if(tab==1&&events.isEmpty()) item {Text("Ficha de ejemplo. Todavía no tiene cambios.")}
        if(tab==1) items(events) {AuditRow(it)}
        if(tab==1) item {Text("Los cambios de esta ficha se conservan en el historial.",style=MaterialTheme.typography.bodySmall)}
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
        if(state.editingId==null) Text(stringResource(R.string.rec_registrar_formulario_ayuda),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.primary)
        state.existing?.let { NoticeBanner(NoticeKind.INFO,stringResource(R.string.rec_dui_existente,it)) }
        if(state.similar.isNotEmpty()) ClimesaCard { Column(Modifier.fillMaxWidth().padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.rec_duplicado_titulo),style=MaterialTheme.typography.titleSmall,fontWeight=FontWeight.Bold)
            state.similar.forEach { Text(it,style=MaterialTheme.typography.bodyMedium) }
            ClimesaButton(stringResource(R.string.rec_duplicado_confirmar),Icons.Default.Add,{model.save(true)},enabled=!state.saving,outlined=true)
        } }
        Text("01 / DATOS PERSONALES",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.primary)
        PatientField("Nombres *",d.givenNames,state.fields["givenNames"],enabled=!state.saving) {model.draft(d.copy(givenNames=it.take(80)))}
        PatientField("Apellidos *",d.surnames,state.fields["surnames"],enabled=!state.saving) {model.draft(d.copy(surnames=it.take(100)))}
        PatientField("DUI · opcional",d.dui,state.fields["dui"],"12345678-9",KeyboardType.Phone,!state.saving) {model.draft(d.copy(dui=it.take(10)))}
        PatientField("Nacimiento · opcional",d.birth,state.fields["birth"],"AAAA-MM-DD",enabled=!state.saving) {model.draft(d.copy(birth=it.take(10)))}
        Text("Sexo registrado",style=MaterialTheme.typography.labelLarge)
        Sex.entries.forEach {sex -> Row(verticalAlignment=Alignment.CenterVertically) {RadioButton(selected=d.sex==sex,onClick={model.draft(d.copy(sex=sex))},enabled=!state.saving);TextButton(onClick={model.draft(d.copy(sex=sex))},enabled=!state.saving) {Text(sex.label)}}}
        PatientField("Teléfono · opcional",d.phone,state.fields["phone"],"7000-0000",KeyboardType.Phone,!state.saving) {model.draft(d.copy(phone=it.take(9)))}
        if(state.editingId!=null) OutlinedTextField(state.reason,model::reason,modifier=Modifier.fillMaxWidth(),enabled=!state.saving,label={Text("Motivo de modificación *")},supportingText={Text("Mínimo 10 caracteres. Quedará en el historial.")})
        Button(onClick={model.save()},enabled=!state.saving,modifier=Modifier.fillMaxWidth().heightIn(min=52.dp)) {Text(if(state.saving) "Guardando…" else "Guardar paciente")}
        Text("Revisá posibles duplicados antes de guardar.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(24.dp))
    }
}
@Composable private fun PatientField(label:String,value:String,error:String?,hint:String="",keyboard:KeyboardType=KeyboardType.Text,enabled:Boolean=true,change:(String)->Unit) {
    FormField(label,value,change,error=error,hint=hint.ifBlank{null},enabled=enabled,keyboardOptions=KeyboardOptions(keyboardType=keyboard))
}
@Composable private fun Profile(state:ReceptionState,dark:Boolean,setDark:(Boolean)->Unit,account:AuthenticatedAccount,onLogout:()->Unit) {
    LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        item {ProfileSummaryCard(account)}
        account.profile.notice?.let {item {NoticeBanner(NoticeKind.WARNING,"La validación de permisos todavía no está disponible.")}}
        item {AppearanceCard(dark,setDark)}
        item {Text("Actividad reciente",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.Bold)}
        if(state.registry.audit.isEmpty()) item {Text("Aquí aparecerán los registros y cambios.")}
        items(state.registry.audit.takeLast(20).reversed()) {AuditRow(it)}
        item {HorizontalDivider();Spacer(Modifier.height(12.dp));SecondaryButton(stringResource(R.string.cerrar_sesion),onLogout,icon=Icons.Default.Logout);Spacer(Modifier.height(8.dp));Text(stringResource(R.string.ui_cerrar_sesion_ayuda),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)}
    }
}
@Composable private fun AuditRow(a:AuditEvent) {ClimesaCard {Column(Modifier.fillMaxWidth().padding(16.dp),verticalArrangement=Arrangement.spacedBy(5.dp)) {
    Text("${a.action} · ${a.record}",fontWeight=FontWeight.SemiBold);Text(a.reason)
    a.changes.forEach { (field,value) -> Text("$field: $value",style=MaterialTheme.typography.bodySmall) }
    Text("${DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(ZoneId.of("America/El_Salvador")).format(Instant.parse(a.at))} · v${a.version}",style=MaterialTheme.typography.labelSmall)
}}}
