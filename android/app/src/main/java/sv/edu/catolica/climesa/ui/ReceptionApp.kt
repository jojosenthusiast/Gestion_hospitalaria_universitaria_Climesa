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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ExitToApp
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
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable fun ReceptionApp(model:ReceptionViewModel,dark:Boolean,setDark:(Boolean)->Unit,account:AuthenticatedAccount,signingOut:Boolean,logout:()->Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var discard by remember { mutableStateOf(false) }
    val snack=remember { SnackbarHostState() }
    LaunchedEffect(state.message) { state.message?.let { snack.showSnackbar(it);model.clearMessage() } }
    fun back() { if(state.saving)return;if(state.formOpen) discard=true else model.select(null) }
    BackHandler(state.formOpen || state.selected!=null) { back() }
    Scaffold(containerColor=MaterialTheme.colorScheme.background,snackbarHost={ SnackbarHost(snack) },topBar={ TopAppBar(
        colors=TopAppBarDefaults.topAppBarColors(containerColor=BrandNavy,titleContentColor=Color.White,navigationIconContentColor=Color.White,actionIconContentColor=Color.White),title={ Column { Text(if(state.formOpen) { if(state.editingId==null) "Registrar paciente" else "Editar ficha" } else if(state.selected!=null) "Ficha del paciente" else "climesa",style=MaterialTheme.typography.titleMedium)
            if(!state.formOpen && state.selected==null) Text(listOf("Recepción","Pacientes","Mi espacio")[tab],style=MaterialTheme.typography.labelSmall,color=Color(0xFFB0B4C9)) } },
        navigationIcon={ if(state.formOpen || state.selected!=null) IconButton(onClick={back()},enabled=!state.saving) { Icon(Icons.AutoMirrored.Filled.ArrowBack,"Volver") } },
        actions={ IconButton(onClick={setDark(!dark)}) { Icon(Icons.Default.Settings,"Cambiar entre tema claro y oscuro") } }) },
        bottomBar={ if(!state.formOpen && state.selected==null) NavigationBar(containerColor=BrandNavy,tonalElevation=0.dp) {
            listOf("Inicio" to Icons.Default.Home,"Pacientes" to Icons.Default.Person,"Mi espacio" to Icons.Default.AccountCircle).forEachIndexed { i,pair ->
                NavigationBarItem(colors=NavigationBarItemDefaults.colors(selectedIconColor=Color.White,selectedTextColor=Color.White,indicatorColor=BrandBlue,unselectedIconColor=Color(0xFFA5A9BD),unselectedTextColor=Color(0xFFA5A9BD)),selected=tab==i,onClick={tab=i},icon={Icon(pair.second,null)},label={Text(pair.first)})
            }
        } }
    ) { padding -> Column(Modifier.fillMaxSize().padding(padding)) {
        Surface(color=MaterialTheme.colorScheme.surfaceVariant) { Row(Modifier.fillMaxWidth().padding(horizontal=20.dp,vertical=10.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) { Icon(Icons.Default.Info,null,Modifier.size(14.dp),tint=MaterialTheme.colorScheme.onSurfaceVariant);Text("Registro compartido · CLIMESA",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant) } }
        state.error?.let { error -> Surface(color=MaterialTheme.colorScheme.errorContainer) {
            Row(Modifier.padding(horizontal=12.dp),verticalAlignment=Alignment.CenterVertically) {
                Text(error,Modifier.weight(1f).padding(vertical=10.dp),style=MaterialTheme.typography.bodyMedium)
                if(!state.fatal) IconButton(onClick=model::clearError) { Icon(Icons.Default.Close,"Cerrar aviso") }
            }
        } }
        when {
            state.loading -> Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center) { CircularProgressIndicator() }
            state.fatal -> Column(Modifier.padding(24.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) { Text("No pudimos abrir el registro. Tus datos no se han sobrescrito.");Button(onClick=model::reload) {Text("Reintentar")} }
            state.formOpen -> PatientForm(state,model)
            state.selected!=null -> PatientDetail(state.selected!!,state,model)
            tab==0 -> Home(state,{tab=1},model::select)
            tab==1 -> Patients(state,model)
            else -> Profile(state,dark,setDark,account,signingOut,logout)
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
    LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
        item { Text("Pacientes.",style=MaterialTheme.typography.displaySmall);Spacer(Modifier.height(8.dp));Text("Busca antes de abrir un expediente.",style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant) }
        item { OutlinedTextField(value=state.query,onValueChange=model::query,modifier=Modifier.fillMaxWidth(),label={Text("Nombre, DUI o expediente")},singleLine=true,leadingIcon={Icon(Icons.Default.Search,null)},trailingIcon={if(state.query.isNotEmpty()) IconButton(onClick={model.query("")}) {Icon(Icons.Default.Close,"Limpiar búsqueda")}}) }
        item { Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            Button(onClick=model::search,enabled=!state.searching && PatientRules.normalize(state.query).replace(" ","").length>=2,modifier=Modifier.weight(1f)) {Text(if(state.searching) "Buscando…" else "Buscar")}
            OutlinedButton(onClick=model::newPatient,enabled=state.searchedQuery!=null) {Icon(Icons.Default.Add,null);Text("Registrar")}
        } }
        item { Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {listOf("Activos","Inactivos","Todos").forEachIndexed {i,label -> FilterChip(selected=state.filter==i,onClick={model.filter(i)},label={Text(label)})}} }
        item { Text(if(state.searchedQuery==null) "Registro compartido · ${state.results.size} resultados" else "${state.results.size} coincidencias · ${state.searchedQuery}",style=MaterialTheme.typography.labelLarge)
            if(state.searchedQuery!=null) Text("Revisa también los inactivos antes de registrar. El DUI no puede repetirse.",style=MaterialTheme.typography.bodySmall) }
        if(state.results.isEmpty()) item { Text("Sin coincidencias. Revisa la búsqueda y el filtro; si el paciente no existe, puedes registrarlo después de buscar.",Modifier.padding(16.dp)) }
        items(state.results,key={it.id}) {p -> PatientRow(p) {model.select(p.id)} }
    }
}
@Composable private fun PatientRow(p:Patient,click:()->Unit) {
    Surface(onClick=click,modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(0.dp),color=MaterialTheme.colorScheme.surface) {
        Column {
            Row(Modifier.padding(vertical=19.dp,horizontal=12.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(13.dp)) {
                Box(Modifier.size(36.dp).background(MaterialTheme.colorScheme.primaryContainer),contentAlignment=Alignment.Center) {
                    Text(p.givenNames.take(1)+p.surnames.take(1),style=MaterialTheme.typography.labelMedium,color=MaterialTheme.colorScheme.primary)
                }
                Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(5.dp)) {
                    Text(p.fullName,style=MaterialTheme.typography.titleMedium)
                    Text("EXP. ${p.record}",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(if(p.active) "Activo" else "Inactivo",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.primary)
                }
                Text("↗",style=MaterialTheme.typography.titleLarge,color=MaterialTheme.colorScheme.primary)
            }
            HorizontalDivider()
        }
    }
}
@Composable private fun PatientDetail(p:Patient,state:ReceptionState,model:ReceptionViewModel) {
    var dialog by remember(p.id) {mutableStateOf(false)}
    var reason by remember(p.id) {mutableStateOf("")}
    LaunchedEffect(p.version) {dialog=false;reason=""}
    LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        item {Surface(color=BrandBlue,shape=RoundedCornerShape(0.dp)) {Column(Modifier.fillMaxWidth().padding(24.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {Text("EXPEDIENTE ${p.record}",style=MaterialTheme.typography.labelSmall,color=Color(0xFFD4D9FF));Text(p.fullName,style=MaterialTheme.typography.headlineMedium,color=Color.White);Text(if(p.active) "Activo" else "Inactivo",style=MaterialTheme.typography.bodySmall,color=BrandLime)}}}
        item {Surface(color=MaterialTheme.colorScheme.surface,shape=RoundedCornerShape(0.dp)) {Column(Modifier.fillMaxWidth().padding(20.dp),verticalArrangement=Arrangement.spacedBy(20.dp)) {
            Value("DUI",p.dui ?: "Sin documento registrado");Value("Nacimiento",p.birth?.toString() ?: "No registrado");Value("Sexo",p.sex.label);Value("Teléfono",p.phone.ifBlank {"No registrado"})
        }}}
        item {Button(onClick={model.edit(p)},modifier=Modifier.fillMaxWidth()) {Icon(Icons.Default.Edit,null);Spacer(Modifier.width(8.dp));Text("Editar datos")}
            OutlinedButton(onClick={dialog=true},enabled=!state.saving,modifier=Modifier.fillMaxWidth()) {Text(if(p.active) "Inactivar paciente" else "Reactivar paciente")}}
        item {Text("Historial de actividad",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.Bold)}
        val events=state.registry.audit.filter {it.record==p.record}.reversed()
        if(events.isEmpty()) item {Text("Ficha de ejemplo. Todavía no tiene cambios.")}
        items(events) {AuditRow(it)}
        item {Text("Los cambios de esta ficha se conservan en el historial.",style=MaterialTheme.typography.bodySmall)}
    }
    if(dialog) AlertDialog(onDismissRequest={if(!state.saving)dialog=false},title={Text(if(p.active) "Inactivar paciente" else "Reactivar paciente")},
        text={Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {Text("La ficha y su historial se conservan.");OutlinedTextField(reason,{reason=it.take(500)},label={Text("Motivo")},supportingText={Text("Mínimo 10 caracteres")})}},
        confirmButton={TextButton(enabled=reason.trim().length>=10 && !state.saving,onClick={model.changeActive(p,reason)}) {Text(if(state.saving) "Guardando…" else "Confirmar")}},
        dismissButton={TextButton(enabled=!state.saving,onClick={dialog=false}) {Text("Cancelar")}})
}
@Composable private fun Value(label:String,value:String) {Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {Text(label.uppercase(),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant);Text(value,style=MaterialTheme.typography.bodyLarge);HorizontalDivider()}}
@Composable private fun PatientForm(state:ReceptionState,model:ReceptionViewModel) {
    val d=state.draft
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
        Text(if(state.editingId==null) "Nuevo paciente" else "Actualizar información",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)
        Text("Los campos con * son obligatorios. Deja vacíos el documento y el nacimiento si los desconoces.",style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
        Text("01 / DATOS PERSONALES",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.primary)
        FormField("Nombres *",d.givenNames,state.fields["givenNames"],enabled=!state.saving) {model.draft(d.copy(givenNames=it.take(80)))}
        FormField("Apellidos *",d.surnames,state.fields["surnames"],enabled=!state.saving) {model.draft(d.copy(surnames=it.take(100)))}
        FormField("DUI · opcional",d.dui,state.fields["dui"],"12345678-9",KeyboardType.Phone,!state.saving) {model.draft(d.copy(dui=it.take(10)))}
        FormField("Nacimiento · opcional",d.birth,state.fields["birth"],"AAAA-MM-DD",enabled=!state.saving) {model.draft(d.copy(birth=it.take(10)))}
        Text("Sexo registrado",style=MaterialTheme.typography.labelLarge)
        Sex.entries.forEach {sex -> Row(verticalAlignment=Alignment.CenterVertically) {RadioButton(selected=d.sex==sex,onClick={model.draft(d.copy(sex=sex))},enabled=!state.saving);TextButton(onClick={model.draft(d.copy(sex=sex))},enabled=!state.saving) {Text(sex.label)}}}
        FormField("Teléfono · opcional",d.phone,state.fields["phone"],"7000-0000",KeyboardType.Phone,!state.saving) {model.draft(d.copy(phone=it.take(9)))}
        if(state.editingId!=null) OutlinedTextField(state.reason,model::reason,modifier=Modifier.fillMaxWidth(),enabled=!state.saving,label={Text("Motivo de modificación *")},supportingText={Text("Mínimo 10 caracteres. Quedará en el historial.")})
        Button(onClick=model::save,enabled=!state.saving,modifier=Modifier.fillMaxWidth().heightIn(min=52.dp)) {Text(if(state.saving) "Guardando…" else "Guardar paciente")}
        Text("El expediente se genera automáticamente. Revisa posibles duplicados; la app no fusiona pacientes.",style=MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(24.dp))
    }
}
@Composable private fun FormField(label:String,value:String,error:String?,hint:String="",keyboard:KeyboardType=KeyboardType.Text,enabled:Boolean=true,change:(String)->Unit) {
    OutlinedTextField(value,change,modifier=Modifier.fillMaxWidth(),label={Text(label)},placeholder={Text(hint)},isError=error!=null,enabled=enabled,singleLine=true,keyboardOptions=KeyboardOptions(keyboardType=keyboard),supportingText={if(error!=null)Text(error)})
}
@Composable private fun Profile(state:ReceptionState,dark:Boolean,setDark:(Boolean)->Unit,account:AuthenticatedAccount,signingOut:Boolean,logout:()->Unit) {
    LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        item {Text("MI ESPACIO / CLIMESA",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.primary);Spacer(Modifier.height(12.dp));Text("Tu cuenta.",style=MaterialTheme.typography.displaySmall);Spacer(Modifier.height(14.dp));Text(account.session.email,style=MaterialTheme.typography.bodyLarge)}
        item {Surface(color=MaterialTheme.colorScheme.surface,shape=RoundedCornerShape(0.dp)) {Column(Modifier.fillMaxWidth().padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
            Text(if(account.profile.verifiedByBackend) "Permisos verificados" else "Cuenta autenticada",fontWeight=FontWeight.Bold)
            if(account.profile.roles.isNotEmpty()) Text("Roles: ${account.profile.roles.joinToString()}")
            account.profile.notice?.let {Text("La validación de permisos todavía no está disponible.",style=MaterialTheme.typography.bodySmall)}
        }}}
        item {Surface(color=MaterialTheme.colorScheme.surface,shape=RoundedCornerShape(0.dp)) {Row(Modifier.fillMaxWidth().padding(20.dp),verticalAlignment=Alignment.CenterVertically) {Column(Modifier.weight(1f)) {Text("Modo oscuro",fontWeight=FontWeight.Bold);Text("Se conserva en este dispositivo",style=MaterialTheme.typography.bodySmall)};Switch(dark,setDark)}}}
        item {Text("Actividad reciente",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.Bold)}
        if(state.registry.audit.isEmpty()) item {Text("Aquí aparecerán los registros y cambios.")}
        items(state.registry.audit.takeLast(20).reversed()) {AuditRow(it)}
        item {HorizontalDivider();Spacer(Modifier.height(12.dp));Text("Hospital universitario CLIMESA");Text("Tu cuenta es personal. Cierra sesión al terminar tu jornada.",style=MaterialTheme.typography.bodySmall)}
        item {OutlinedButton(onClick=logout,enabled=!signingOut,modifier=Modifier.fillMaxWidth()) {Icon(Icons.AutoMirrored.Filled.ExitToApp,null);Spacer(Modifier.width(8.dp));Text(if(signingOut) "Cerrando sesión…" else "Cerrar sesión")}}
    }
}
@Composable private fun AuditRow(a:AuditEvent) {Surface(color=MaterialTheme.colorScheme.surface,shape=RoundedCornerShape(0.dp)) {Column(Modifier.fillMaxWidth().padding(14.dp),verticalArrangement=Arrangement.spacedBy(4.dp)) {
    Text("${a.action} · ${a.record}",fontWeight=FontWeight.SemiBold);Text(a.reason)
    a.changes.forEach { (field,value) -> Text("$field: $value",style=MaterialTheme.typography.bodySmall) }
    Text("${DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(ZoneId.of("America/El_Salvador")).format(Instant.parse(a.at))} · v${a.version}",style=MaterialTheme.typography.labelSmall)
}}}
