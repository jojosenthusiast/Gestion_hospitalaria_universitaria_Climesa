package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.*
import androidx.lifecycle.viewmodel.compose.viewModel

@Composable
fun ClimesaApp(authModel:AuthViewModel,dark:Boolean,setDark:(Boolean)->Unit){
    val state by authModel.state.collectAsStateWithLifecycle()
    var registering by rememberSaveable { mutableStateOf(false) }
    when {
        state.checkingSession -> AuthLoadingScreen()
        state.accessPending -> AccessPending(state.error,authModel::retryAccess,authModel::signOut)
        state.account==null -> if(registering) RegistrationScreen(state,{registering=false;authModel.clearRegistration()},authModel::register) else LoginScreen(state,authModel::signIn){registering=true;authModel.clearRegistration()}
        else -> AuthorizedWorkspace(state.account!!,dark,setDark,state.signingOut,authModel::signOut,authModel::retryAccess)
    }
}
@Composable private fun AccessPending(error:String?,retry:()->Unit,logout:()->Unit){
    Surface { Column(Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp),verticalArrangement=Arrangement.Center,horizontalAlignment=Alignment.CenterHorizontally){Text("No pudimos verificar tu acceso",style=MaterialTheme.typography.headlineMedium);Spacer(Modifier.height(18.dp));Text(error?:"Revisa tu conexión e intenta de nuevo.");Spacer(Modifier.height(24.dp));Button(onClick=retry){Text("Volver a intentar")};TextButton(onClick=logout){Text("Cerrar sesión")}} }
}
@Composable private fun AuthorizedWorkspace(account:AuthenticatedAccount,dark:Boolean,setDark:(Boolean)->Unit,signingOut:Boolean,logout:()->Unit,refresh:()->Unit){
    val destination=account.profile.androidDestination()
    val roles=if(destination==AndroidDestination.NOT_AVAILABLE||destination==AndroidDestination.PENDING_VERIFICATION||!AndroidSections.hasAppScreens(account.profile.permissions))emptyList() else RoleAccess.allowed(account.profile,"android")
    var selectedRole by rememberSaveable(account.session.userId){mutableStateOf(roles.firstOrNull().orEmpty())}
    val role=selectedRole.takeIf{it in roles}?:roles.firstOrNull().orEmpty()
    if(roles.isEmpty()){Surface{Column(Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp),verticalArrangement=Arrangement.Center){Text("Tu rol no usa esta aplicación",style=MaterialTheme.typography.headlineMedium);Spacer(Modifier.height(16.dp));Text("Ingresa desde la plataforma habilitada para tu cuenta.");Spacer(Modifier.height(24.dp));Button(onClick=logout){Text("Cerrar sesión")}}};return}
    Column(Modifier.fillMaxSize()){
        if(roles.size>1){var menu by remember{mutableStateOf(false)};Surface(color=BrandNavy){Box(Modifier.fillMaxWidth().safeDrawingPadding().padding(horizontal=20.dp)){TextButton(onClick={menu=true}){Text("${RoleAccess.label(role)}  ▾",color=Color.White)};DropdownMenu(expanded=menu,onDismissRequest={menu=false}){roles.forEach{r->DropdownMenuItem(text={Text(RoleAccess.label(r))},onClick={selectedRole=r;menu=false})}}}}}
        Box(Modifier.weight(1f)){if(role=="REC"){
            val reception:ReceptionViewModel=viewModel()
            DisposableEffect(account.session.userId){reception.reload();onDispose{reception.clear()}}
            LaunchedEffect(account.session.userId,account.profile.channels){reception.startLive(account.profile.channels)}
            LaunchedEffect(account.profile.permissions){reception.setPermissions(account.profile.permissions)}
            ReceptionApp(reception,dark,setDark,account,signingOut,logout)
        }else RolePortal(account,role,dark,setDark,signingOut,logout,refresh)}
    }
}

@Composable
private fun AuthLoadingScreen() {
    Surface {
        Column(
            Modifier.fillMaxSize().safeDrawingPadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(painterResource(R.drawable.ic_climesa), null, Modifier.size(72.dp), tint = androidx.compose.ui.graphics.Color.Unspecified)
            Spacer(Modifier.height(24.dp))
            CircularProgressIndicator()
            Spacer(Modifier.height(12.dp))
            Text("Comprobando sesión…")
        }
    }
}

@Composable
private fun LoginScreen(state: AuthUiState, signIn: (String, String) -> Unit, onRegister:()->Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by rememberSaveable { mutableStateOf(false) }
    Surface(color = BrandBlue) {
        Column(
            Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(26.dp),
        ) {
            Row(Modifier.padding(top = 6.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                Surface(color = BrandLime, shape = RoundedCornerShape(0.dp)) {
                    Text("+", Modifier.padding(horizontal = 8.dp), color = BrandNavy, style = MaterialTheme.typography.headlineLarge)
                }
                Column {
                    Text("climesa", style = MaterialTheme.typography.headlineSmall, color = Color.White, fontWeight = FontWeight.Bold)
                    Text("Hospital universitario", style = MaterialTheme.typography.labelSmall, color = Color(0xFFD4D9FF))
                }
            }
            Surface(color = MaterialTheme.colorScheme.background, shape = RoundedCornerShape(0.dp)) {
                Column(Modifier.padding(26.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("ACCESO A CLIMESA", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                        Text("Hola de nuevo.", style = MaterialTheme.typography.headlineLarge)
                        Text("Ingresa con tu cuenta institucional.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    state.error?.let {
                        Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(0.dp)) {
                            Text(it, Modifier.fillMaxWidth().padding(14.dp), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    TextField(
                        value = email,
                        onValueChange = { email = it.trimStart().take(254) },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !state.signingIn,
                        singleLine = true,
                        label = { Text("Correo electrónico") },
                        colors = TextFieldDefaults.colors(focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent, disabledContainerColor = Color.Transparent),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        isError = state.fieldErrors["email"] != null,
                        supportingText = { state.fieldErrors["email"]?.let { Text(it) } },
                    )
                    TextField(
                        value = password,
                        onValueChange = { password = it },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !state.signingIn,
                        singleLine = true,
                        label = { Text("Contraseña") },
                        colors = TextFieldDefaults.colors(focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent, disabledContainerColor = Color.Transparent),
                        trailingIcon = {
                            IconButton(onClick = { showPassword = !showPassword }) {
                                Icon(if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility, if (showPassword) "Ocultar contraseña" else "Mostrar contraseña")
                            }
                        },
                        visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        isError = state.fieldErrors["password"] != null,
                        supportingText = { state.fieldErrors["password"]?.let { Text(it) } },
                    )
                    Button(onClick = { signIn(email, password) }, enabled = !state.signingIn, modifier = Modifier.fillMaxWidth().heightIn(min = 54.dp)) {
                        if (state.signingIn) {
                            CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                            Spacer(Modifier.width(10.dp)); Text("Verificando…")
                        } else {
                            Text("Iniciar sesión", Modifier.weight(1f)); Text("→")
                        }
                    }
                    HorizontalDivider()
                    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                        Text("¿Primera vez aquí?", style = MaterialTheme.typography.labelLarge)
                        Text("El personal ingresa con una invitación del hospital.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        TextButton(onClick=onRegister,enabled=!state.signingIn){Text("Crear cuenta de paciente")}
                    }
                }
            }
            Text("Tu espacio de trabajo.", style = MaterialTheme.typography.bodySmall, color = Color(0xFFD4D9FF))
            Spacer(Modifier.height(12.dp))
        }
    }
}

@Composable private fun RegistrationScreen(state:AuthUiState,back:()->Unit,register:(String,String,String,String)->Unit){
    var name by rememberSaveable{mutableStateOf("")};var email by rememberSaveable{mutableStateOf("")};var password by remember{mutableStateOf("")};var confirmation by remember{mutableStateOf("")}
    Surface(color=BrandBlue){Column(Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(24.dp)){
        TextButton(onClick=back,enabled=!state.signingIn){Text("← Volver al ingreso",color=Color.White)}
        Surface(color=MaterialTheme.colorScheme.background,shape=RoundedCornerShape(0.dp)){Column(Modifier.padding(24.dp),verticalArrangement=Arrangement.spacedBy(18.dp)){
            Text("CUENTA DE PACIENTE",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.primary)
            Text("Tu acceso personal.",style=MaterialTheme.typography.headlineLarge)
            if(state.registrationMessage!=null){Text(state.registrationMessage);Button(onClick=back,modifier=Modifier.fillMaxWidth()){Text("Volver al ingreso")}}
            else{
                Text("Crea tu cuenta para utilizar CLIMESA.",style=MaterialTheme.typography.bodyMedium)
                state.error?.let{Text(it,color=MaterialTheme.colorScheme.error)}
                OutlinedTextField(name,{name=it.take(120)},label={Text("Nombre completo")},modifier=Modifier.fillMaxWidth(),singleLine=true,isError=state.fieldErrors.containsKey("name"),supportingText={state.fieldErrors["name"]?.let{Text(it)}},enabled=!state.signingIn)
                OutlinedTextField(email,{email=it.take(254)},label={Text("Correo electrónico")},modifier=Modifier.fillMaxWidth(),singleLine=true,keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Email),isError=state.fieldErrors.containsKey("email"),supportingText={state.fieldErrors["email"]?.let{Text(it)}},enabled=!state.signingIn)
                OutlinedTextField(password,{password=it},label={Text("Contraseña")},modifier=Modifier.fillMaxWidth(),singleLine=true,visualTransformation=PasswordVisualTransformation(),keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Password),isError=state.fieldErrors.containsKey("password"),supportingText={Text(state.fieldErrors["password"]?:"8 caracteres, mayúscula, minúscula, número y símbolo.")},enabled=!state.signingIn)
                OutlinedTextField(confirmation,{confirmation=it},label={Text("Confirmar contraseña")},modifier=Modifier.fillMaxWidth(),singleLine=true,visualTransformation=PasswordVisualTransformation(),keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Password),isError=state.fieldErrors.containsKey("confirmation"),supportingText={state.fieldErrors["confirmation"]?.let{Text(it)}},enabled=!state.signingIn)
                Button(onClick={register(name,email,password,confirmation)},enabled=!state.signingIn,modifier=Modifier.fillMaxWidth().heightIn(min=52.dp)){Text(if(state.signingIn)"Creando cuenta…"else"Crear cuenta de paciente")}
            }
        }}
    }}
}
