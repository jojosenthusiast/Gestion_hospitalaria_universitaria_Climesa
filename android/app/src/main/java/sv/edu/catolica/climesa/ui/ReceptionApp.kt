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
    // G2 (web `declaredPatient`): "Buscar antes de crear" in Vinculaciones searches the declared DUI and, if the person then
    // registers, the form starts with the declared DUI, birth date and the account's name.
    var linkPrefill by rememberSaveable { mutableStateOf<List<String>?>(null) }
    LaunchedEffect(state.formOpen,state.editingId) {
        val prefill=linkPrefill?:return@LaunchedEffect
        if(!state.formOpen||state.editingId!=null)return@LaunchedEffect
        val names=PatientRules.prefill(prefill[2])
        model.draft(state.draft.copy(dui=prefill[0].ifBlank{state.draft.dui},birth=prefill[1].ifBlank{state.draft.birth},givenNames=state.draft.givenNames.ifBlank{names.givenNames},surnames=state.draft.surnames.ifBlank{names.surnames}))
        linkPrefill=null
    }
    /** R7 U1 (G2, hub): an action of the patient record opens its section with this patient already chosen. */
    fun openWith(section:AndroidSection,action:QuickAction,p:Patient){model.select(null);selectedName=section.name;inbox.post(QuickActionRequest(section,action,QuickSubject(p.id,p.fullName,p.record)))}
    fun back() { if(state.saving)return;if(state.formOpen) discard=true else model.select(null) }
    // R3 A-2 (QA final): back from any section returns to Inicio before leaving the app, as in RolePortal. The form/detail
    // handler below is composed later, so an open form or patient record closes first.
    val backTarget=AndroidSections.backTarget(page,sections)
    BackHandler(backTarget!=null) { backTarget?.let { selectedName=it.name } }
    BackHandler(state.formOpen || state.selected!=null) { back() }
    PortalScaffold(
        role="REC",sections=sections,selected=page,onSelected={selectedName=it.name},dark=dark,setDark=setDark,
        onLogout={if(!signingOut)logout()},
        showNavigation=!state.formOpen && state.selected==null,
        snackbarHost={SnackbarHost(snack)},
        badges=noticeBadges(account,sections),
        title=if(state.formOpen){stringResource(if(state.editingId==null)R.string.rec_form_registrar else R.string.rec_form_editar)}else if(state.selected!=null)stringResource(R.string.rec_ficha_titulo) else page.label,
        subtitle=if(state.formOpen)state.registry.patients.firstOrNull{it.id==state.editingId}?.fullName else state.selected?.fullName,
        navigationIcon={if(state.formOpen||state.selected!=null)BackButton({back()},enabled=!state.saving)},
    ) { padding -> Column(Modifier.fillMaxSize().padding(padding)) {
        state.error?.takeIf { page==AndroidSection.PATIENTS }?.let { error -> Surface(color=MaterialTheme.colorScheme.errorContainer) {
            Row(Modifier.padding(horizontal=12.dp),verticalAlignment=Alignment.CenterVertically) {
                Text(error,Modifier.weight(1f).padding(vertical=10.dp),style=MaterialTheme.typography.bodyMedium)
                if(!state.fatal) IconButton(onClick=model::clearError) { Icon(Icons.Default.Close,stringResource(R.string.ui_cerrar_aviso)) }
            }
        } }
        when {
            state.formOpen -> PatientForm(state,model)
            state.selected!=null -> PatientDetail(state.selected!!,state,model,hub=patientHub(account.profile.permissions,sections),onHub={section,action->openWith(section,action,state.selected!!)})
            page==AndroidSection.HOME -> RoleDashboardScreen(account,"REC",{request->if(request.section in sections){selectedName=request.section.name;inbox.post(request)}},onOpenNotices={if(AndroidSection.NOTICES in sections)selectedName=AndroidSection.NOTICES.name})
            page==AndroidSection.NOTICES -> NoticesScreen(account)
            page==AndroidSection.APPOINTMENTS -> ReceptionAppointmentsScreen(account.profile.channels,"citas.agendar" in account.profile.permissions,userId=account.session.userId,quickAction=inbox.actionFor(AndroidSection.APPOINTMENTS),onQuickActionHandled={inbox.consume(AndroidSection.APPOINTMENTS)},permissions=account.profile.permissions,subject=inbox.subjectFor(AndroidSection.APPOINTMENTS))
            page==AndroidSection.LINKING -> ReceptionLinkingScreen(account.profile.channels,"cuentas.verificar" in account.profile.permissions,{row->
                linkPrefill=listOf(row.declaredDui,row.declaredBirth,row.accountName)
                model.select(null);model.query(row.declaredDui);selectedName=AndroidSection.PATIENTS.name
                if(row.declaredDui.isNotBlank()&&PatientAction.SEARCH in state.actions)model.search()
            })
            page==AndroidSection.BEDS -> BedsScreen(account.profile)
            page==AndroidSection.QUEUE -> QueueScreen(account.profile,userId=account.session.userId,quickAction=inbox.actionFor(page),onQuickActionHandled={inbox.consume(page)},subject=inbox.subjectFor(page))
            page==AndroidSection.HOSPITAL_INFO -> HospitalInfoScreen()
            page==AndroidSection.DISPATCH -> AmbulanceScreen(page,account.profile,account.session.userId,quickAction=inbox.actionFor(page),onQuickActionHandled={inbox.consume(page)})
            page==AndroidSection.LOG -> AmbulanceScreen(page,account.profile,account.session.userId)
            page==AndroidSection.ADMISSION -> HospitalizationScreen(profile=account.profile,quickAction=inbox.actionFor(page),onQuickActionHandled={inbox.consume(page)},subject=inbox.subjectFor(page))
            page==AndroidSection.SHIFTS -> MyShiftsScreen(account,"REC")
            page==AndroidSection.PROFILE -> Profile(state,dark,setDark,account,{if(!signingOut)logout()})
            page!=AndroidSection.PATIENTS -> {
                Column(Modifier.fillMaxSize().padding(20.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) {
                    CompactHeader(page.label)
                    Text(stringResource(R.string.rec_seccion_pendiente,page.screenId))
                }
            }
            state.loading -> LoadingState(Modifier.fillMaxSize().padding(Spacing.page))
            state.fatal -> ErrorState(stringResource(R.string.rec_error_registro),model::reload)
            else -> Patients(state,model)
        }
    } }
    if(discard) AlertDialog(onDismissRequest={discard=false},title={Text(stringResource(R.string.rec_salir_titulo))},text={Text(stringResource(R.string.rec_salir_detalle))},
        confirmButton={TextButton(onClick={discard=false;model.closeForm()}) {Text(stringResource(R.string.rec_salir))}},dismissButton={TextButton(onClick={discard=false}) {Text(stringResource(R.string.rec_seguir_editando))}})
}
@Composable private fun Patients(state:ReceptionState,model:ReceptionViewModel) {
    LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(Spacing.page),verticalArrangement=Arrangement.spacedBy(Spacing.md)) {
        item { OutlinedTextField(value=state.query,onValueChange=model::query,modifier=Modifier.fillMaxWidth(),label={Text(stringResource(R.string.rec_buscar_label))},singleLine=true,leadingIcon={Icon(Icons.Default.Search,null)},trailingIcon={if(state.query.isNotEmpty()) IconButton(onClick={model.query("")}) {Icon(Icons.Default.Close,stringResource(R.string.rec_limpiar_busqueda))}}) }
        item { Column(verticalArrangement=Arrangement.spacedBy(10.dp)) {
            if(PatientAction.SEARCH in state.actions) ClimesaButton(stringResource(if(state.searching) R.string.rec_buscando else R.string.rec_buscar),Icons.Default.Search,model::search,enabled=!state.searching && PatientRules.normalize(state.query).replace(" ","").length>=2)
            // S0 (obs 6/10): registering is the shared create action with a fixed label; only the search button shows that it is searching.
            if(PatientAction.REGISTER in state.actions) CrudButton(CrudKind.Create,stringResource(R.string.rec_form_registrar),model::newPatient,enabled=!state.searching)
            if(PatientAction.REGISTER in state.actions && state.searchedQuery==null && PatientRules.normalize(state.query).replace(" ","").length<2) Text(stringResource(R.string.rec_registrar_sin_busqueda),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
        } }
        item { LazyRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) {items(3) {i->val label=stringResource(listOf(R.string.rec_filtro_activos,R.string.rec_filtro_inactivos,R.string.rec_filtro_todos)[i]);StatusFilterChip(selected=state.filter==i,onClick={model.filter(i)},label=label,tone=FilterTones.patientActivity(i))}} }
        item { Text(stringResource(if(state.searchedQuery==null) R.string.rec_n_pacientes else R.string.rec_n_coincidencias,state.results.size),style=MaterialTheme.typography.labelLarge) }
        if(state.results.isEmpty()) item { EmptyState(stringResource(R.string.rec_sin_coincidencias)) }
        items(state.results,key={it.id}) {p -> PatientRow(p) {model.select(p.id)} }
    }
}
@Composable private fun PatientRow(p:Patient,click:()->Unit) {
    // R3 A-39: "Activo" is the normal case and gets no badge; only an inactive record is marked.
    // Obs 15: age and sex on a second line so two people with the same name can be told apart; never the DUI.
    DataRow(p.fullName,subtitle=sv.edu.catolica.climesa.domain.PatientSummary.line(p),meta=stringResource(R.string.rec_exp_corto,p.record),status=if(p.active) null else ({StatusTag("inactivo")}),onClick=click)
}
/** R7 U1 (G2): the record's shortcuts, the same three as the web `PatientHubActions`, by permission and reachable section. */
internal fun patientHub(permissions:Collection<String>,sections:List<AndroidSection>):List<Pair<AndroidSection,QuickAction>> = listOfNotNull(
    (AndroidSection.QUEUE to QuickAction.ISSUE_NUMBER).takeIf{"fila.emitir" in permissions&&AndroidSection.QUEUE in sections},
    (AndroidSection.APPOINTMENTS to QuickAction.SCHEDULE_APPOINTMENT).takeIf{"citas.agendar" in permissions&&AndroidSection.APPOINTMENTS in sections},
    (AndroidSection.ADMISSION to QuickAction.ADMIT).takeIf{"admision.crear" in permissions&&AndroidSection.ADMISSION in sections},
)
@Composable private fun PatientDetail(p:Patient,state:ReceptionState,model:ReceptionViewModel,hub:List<Pair<AndroidSection,QuickAction>> = emptyList(),onHub:(AndroidSection,QuickAction)->Unit={_,_->}) {
    var dialog by remember(p.id) {mutableStateOf(false)}
    var tab by rememberSaveable(p.id) {mutableStateOf(0)}
    val gaps=sv.edu.catolica.climesa.domain.PatientCompleteness.gaps(p)
    var reason by remember(p.id) {mutableStateOf("")}
    LaunchedEffect(p.version) {dialog=false;reason=""}
    LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        item {SectionCard(p.fullName,eyebrow=stringResource(R.string.rec_expediente_n,p.record),action={StatusTag(if(p.active) "activo" else "inactivo")}) {Text(if(gaps.isEmpty()) stringResource(R.string.pac_ficha_completa) else stringResource(R.string.pac_ficha_faltan,gaps.joinToString(", ")),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)}}
        item {androidx.compose.material3.TabRow(selectedTabIndex=tab) {listOf(R.string.pac_ficha_datos,R.string.pac_ficha_cambios).forEachIndexed {i,id->androidx.compose.material3.Tab(selected=tab==i,onClick={tab=i},text={Text(stringResource(id))})}}}
        if(tab==0) item {ClimesaCard {Column(Modifier.fillMaxWidth().padding(20.dp),verticalArrangement=Arrangement.spacedBy(20.dp)) {
            val none=stringResource(R.string.rec_no_registrado);Value(stringResource(R.string.rec_dui),p.dui ?: stringResource(R.string.rec_sin_documento));Value(stringResource(R.string.rec_nacimiento),p.birth?.let { b -> BirthDates.format(b) + (sv.edu.catolica.climesa.domain.PatientSummary.ageText(b)?.let { " · $it" } ?: "") } ?: none);Value(stringResource(R.string.rec_sexo),p.sex.label);Value(stringResource(R.string.rec_telefono),p.phone.ifBlank {none})
        }}}
        // One primary per screen: with the hub, its first action ("Emitir número o registrar llegada") is the primary one.
        if(tab==0&&p.active&&hub.isNotEmpty()) item {ClimesaActionGroup {hub.forEachIndexed {i,(section,action)->
            val label=stringResource(when(action){QuickAction.ISSUE_NUMBER->R.string.rec_hub_emitir;QuickAction.SCHEDULE_APPOINTMENT->R.string.rec_citas_agendar;else->R.string.ing_ingresar})
            val icon=when(action){QuickAction.ISSUE_NUMBER->Icons.Default.Campaign;QuickAction.SCHEDULE_APPOINTMENT->Icons.Default.CalendarMonth;else->Icons.Default.Bed}
            ClimesaButton(label,icon,{onHub(section,action)},enabled=!state.saving,outlined=i>0)
        }}}
        // S0: edit is the outlined pencil and inactivate the red trash, the same on every screen; reactivating stays a plain outlined action.
        if(tab==0) item {ClimesaActionGroup {if(PatientAction.EDIT in state.actions) CrudButton(CrudKind.Edit,stringResource(R.string.rec_editar_datos),{model.edit(p)})
            if(PatientAction.CHANGE_STATUS in state.actions) {
                if(p.active) CrudButton(CrudKind.Deactivate,stringResource(R.string.rec_inactivar),{dialog=true},enabled=!state.saving)
                else ClimesaButton(stringResource(R.string.rec_reactivar),Icons.Default.ToggleOn,{dialog=true},enabled=!state.saving,outlined=true)
            }}}
        if(tab==1) item {Text(stringResource(R.string.rec_historial),style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.Bold)}
        val events=state.registry.audit.filter {it.record==p.record}.reversed()
        if(tab==1&&events.isEmpty()) item {Text(stringResource(R.string.rec_sin_cambios))}
        if(tab==1) items(events) {AuditRow(it)}
        if(tab==1) item {Text(stringResource(R.string.rec_cambios_conservan),style=MaterialTheme.typography.bodySmall)}
    }
    if(dialog) ConfirmDialog(
        title=stringResource(if(p.active) R.string.rec_inactivar else R.string.rec_reactivar),confirmLabel=stringResource(if(p.active) R.string.rec_inactivar else R.string.rec_reactivar),
        onConfirm={model.changeActive(p,reason)},onDismiss={dialog=false},message=stringResource(R.string.rec_estado_conserva),
        destructive=p.active,busy=state.saving,confirmEnabled=ChangeReason.error(reason)==null,
        body={FormField(stringResource(R.string.rec_motivo),reason,{reason=it.take(500)},hint=stringResource(R.string.ui_minimo_10),singleLine=false)})
}
@Composable private fun Value(label:String,value:String) {Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {Text(label.uppercase(),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant);Text(value,style=MaterialTheme.typography.bodyLarge);HorizontalDivider()}}
@Composable private fun PatientForm(state:ReceptionState,model:ReceptionViewModel) {
    val d=state.draft
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.rec_obligatorios),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
        if(state.editingId==null) Text(stringResource(R.string.rec_registrar_formulario_ayuda),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.primary)
        state.existing?.let { NoticeBanner(NoticeKind.INFO,stringResource(R.string.rec_dui_existente,it)) }
        if(state.similar.isNotEmpty()) ClimesaCard { Column(Modifier.fillMaxWidth().padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.rec_duplicado_titulo),style=MaterialTheme.typography.titleSmall,fontWeight=FontWeight.Bold)
            state.similar.forEach { Text(it,style=MaterialTheme.typography.bodyMedium) }
            ClimesaButton(stringResource(R.string.rec_duplicado_confirmar),Icons.Default.Add,{model.save(true)},enabled=!state.saving,outlined=true)
        } }
        Text(stringResource(R.string.rec_datos_personales),style=MaterialTheme.typography.titleSmall)
        PatientField(stringResource(R.string.rec_campo_nombres),d.givenNames,state.fields["givenNames"],enabled=!state.saving) {model.draft(d.copy(givenNames=it.take(80)))}
        PatientField(stringResource(R.string.rec_campo_apellidos),d.surnames,state.fields["surnames"],enabled=!state.saving) {model.draft(d.copy(surnames=it.take(100)))}
        PatientField(stringResource(R.string.rec_campo_dui),d.dui,state.fields["dui"],"12345678-9",KeyboardType.Phone,!state.saving) {model.draft(d.copy(dui=it.take(10)))}
        PatientField(stringResource(R.string.rec_campo_nacimiento),d.birth,state.fields["birth"],"AAAA-MM-DD",enabled=!state.saving) {model.draft(d.copy(birth=it.take(10)))}
        Text(stringResource(R.string.rec_campo_sexo),style=MaterialTheme.typography.labelLarge)
        Sex.entries.forEach {sex -> Row(verticalAlignment=Alignment.CenterVertically) {RadioButton(selected=d.sex==sex,onClick={model.draft(d.copy(sex=sex))},enabled=!state.saving);TextButton(onClick={model.draft(d.copy(sex=sex))},enabled=!state.saving) {Text(sex.label)}}}
        PatientField(stringResource(R.string.rec_campo_telefono),d.phone,state.fields["phone"],"7000-0000",KeyboardType.Phone,!state.saving) {model.draft(d.copy(phone=it.take(9)))}
        if(state.editingId!=null) OutlinedTextField(state.reason,model::reason,modifier=Modifier.fillMaxWidth(),enabled=!state.saving,label={Text(stringResource(R.string.rec_campo_motivo))},supportingText={Text(stringResource(R.string.rec_campo_motivo_ayuda))})
        PrimaryButton(stringResource(R.string.rec_guardar_paciente),{model.save()},loading=state.saving)
        Spacer(Modifier.height(24.dp))
    }
}
@Composable private fun PatientField(label:String,value:String,error:String?,hint:String="",keyboard:KeyboardType=KeyboardType.Text,enabled:Boolean=true,change:(String)->Unit) {
    FormField(label,value,change,error=error,hint=hint.ifBlank{null},enabled=enabled,keyboardOptions=KeyboardOptions(keyboardType=keyboard))
}
@Composable private fun Profile(state:ReceptionState,dark:Boolean,setDark:(Boolean)->Unit,account:AuthenticatedAccount,onLogout:()->Unit) {
    LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        item {ProfileSummaryCard(account)}
        account.profile.notice?.let {item {NoticeBanner(NoticeKind.WARNING,stringResource(R.string.rec_permisos_pendiente))}}
        item {AppearanceCard(dark,setDark)}
        item {Text(stringResource(R.string.rec_actividad_reciente),style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.Bold)}
        if(state.registry.audit.isEmpty()) item {Text(stringResource(R.string.rec_actividad_vacia))}
        items(state.registry.audit.takeLast(20).reversed()) {AuditRow(it)}
        item {HorizontalDivider();Spacer(Modifier.height(12.dp));SecondaryButton(stringResource(R.string.cerrar_sesion),onLogout,icon=Icons.Default.Logout);Spacer(Modifier.height(8.dp));Text(stringResource(R.string.ui_cerrar_sesion_ayuda),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)}
    }
}
@Composable private fun AuditRow(a:AuditEvent) {ClimesaCard {Column(Modifier.fillMaxWidth().padding(16.dp),verticalArrangement=Arrangement.spacedBy(5.dp)) {
    Text("${a.action} · ${a.record}",fontWeight=FontWeight.SemiBold);Text(a.reason)
    a.changes.forEach { (field,value) -> Text("$field: $value",style=MaterialTheme.typography.bodySmall) }
    // Short date without the year, like the rest of the app ("16 nov, 09:33").
    Text("${DateTimeFormatter.ofPattern("d MMM, HH:mm",java.util.Locale("es","SV")).withZone(ZoneId.of("America/El_Salvador")).format(Instant.parse(a.at))} · v${a.version}",style=MaterialTheme.typography.labelSmall)
}}}
