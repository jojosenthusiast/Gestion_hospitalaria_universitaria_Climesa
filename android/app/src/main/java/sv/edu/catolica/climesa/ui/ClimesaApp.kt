package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import sv.edu.catolica.climesa.BuildConfig
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.*
import androidx.lifecycle.viewmodel.compose.viewModel

@Composable
fun ClimesaApp(authModel:AuthViewModel,dark:Boolean,setDark:(Boolean)->Unit){
    val state by authModel.state.collectAsStateWithLifecycle()
    var registering by rememberSaveable { mutableStateOf(false) }
    val sessionStores:SessionStoreHolder=viewModel()
    // Logout or expired session: clear the account's ViewModels (data, coroutines and realtime subscriptions).
    LaunchedEffect(state.account?.session?.userId){if(state.account==null)sessionStores.end()}
    when {
        state.checkingSession -> AuthLoadingScreen()
        state.accessPending -> AccessPending(state.error,authModel::retryAccess,authModel::signOut)
        state.account==null -> if(registering) RegistrationScreen(state,{registering=false;authModel.clearRegistration()},authModel::register) else LoginScreen(state,authModel::signIn){registering=true;authModel.clearRegistration()}
        else -> SessionViewModelScope(sessionStores,state.account!!.session.userId){AuthorizedWorkspace(state.account!!,dark,setDark,state.signingOut,authModel::signOut,authModel::retryAccess)}
    }
}
@Composable private fun AccessPending(error:String?,retry:()->Unit,logout:()->Unit){
    Surface { Column(Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(24.dp),verticalArrangement=Arrangement.Center,horizontalAlignment=Alignment.CenterHorizontally){SectionIntro("Acceso / CLIMESA","No pudimos verificar tu acceso",error?:"Revisa tu conexión e intenta de nuevo.");Spacer(Modifier.height(24.dp));ClimesaButton("Volver a intentar",Icons.Default.Refresh,retry);Spacer(Modifier.height(10.dp));TextButton(onClick=logout){Text("Cerrar sesión")}} }
}
@Composable private fun AuthorizedWorkspace(account:AuthenticatedAccount,dark:Boolean,setDark:(Boolean)->Unit,signingOut:Boolean,logout:()->Unit,refresh:()->Unit){
    val destination=account.profile.androidDestination()
    val allowedRoles=RoleAccess.allowed(account.profile,"android")
    val roles=if(destination==AndroidDestination.NOT_AVAILABLE||destination==AndroidDestination.PENDING_VERIFICATION)emptyList() else allowedRoles.filter { AndroidSections.hasAppScreens(it,account.profile.permissions) }
    var selectedRole by rememberSaveable(account.session.userId){mutableStateOf(roles.firstOrNull().orEmpty())}
    val role=selectedRole.takeIf{it in roles}?:roles.firstOrNull().orEmpty()
    if(roles.isEmpty()){Surface{Column(Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp),verticalArrangement=Arrangement.Center){SectionIntro("Acceso / CLIMESA","Tu rol no usa esta aplicación");Spacer(Modifier.height(16.dp));Text("Ingresa desde la plataforma habilitada para tu cuenta.");Spacer(Modifier.height(24.dp));PrimaryButton(stringResource(R.string.cerrar_sesion),logout)}};return}
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
private fun LoginScreen(state: AuthUiState, signIn: (String, String) -> Unit, onRegister: () -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by rememberSaveable { mutableStateOf(false) }
    val passwordFocus = remember { FocusRequester() }
    val demoAccounts = remember { DemoLogin.accounts(BuildConfig.DEMO_LOGIN, BuildConfig.DEMO_CREDENTIALS) }
    val focusManager = LocalFocusManager.current
    val passwordAction = stringResource(if (showPassword) R.string.login_hide_password else R.string.login_show_password)
    val submit = {
        if (!state.signingIn) {
            focusManager.clearFocus()
            signIn(email, password)
        }
    }

    Surface(color = BrandBlue) {
        Column(
            Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                Modifier.widthIn(max = 560.dp).fillMaxWidth().padding(vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Surface(color = BrandAccent, shape = MaterialTheme.shapes.small) {
                    Text("+", Modifier.padding(horizontal = 8.dp, vertical = 2.dp), color = BrandNavy, style = MaterialTheme.typography.headlineMedium)
                }
                Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text(stringResource(R.string.login_brand), style = MaterialTheme.typography.titleLarge, color = Color.White, fontWeight = FontWeight.Bold)
                    Text(stringResource(R.string.login_brand_subtitle), style = MaterialTheme.typography.labelSmall, color = Color(0xFFD4D9FF))
                }
            }
            Surface(
                modifier = Modifier.widthIn(max = 560.dp).fillMaxWidth(),
                color = MaterialTheme.colorScheme.background,
                shape = MaterialTheme.shapes.extraLarge,
                tonalElevation = 6.dp,
            ) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Text(stringResource(R.string.login_welcome), style = MaterialTheme.typography.headlineMedium)
                        Text(stringResource(R.string.login_prompt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    state.error?.let {
                        Surface(
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                            color = MaterialTheme.colorScheme.errorContainer,
                            shape = MaterialTheme.shapes.small,
                        ) {
                            Text(it, Modifier.fillMaxWidth().padding(14.dp), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    if (demoAccounts.isNotEmpty()) DemoAccountPicker(demoAccounts, enabled = !state.signingIn) { account -> email = account.email; password = account.password }
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it.trimStart().take(254) },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !state.signingIn,
                        singleLine = true,
                        label = { Text(stringResource(R.string.login_email)) },
                        leadingIcon = { Icon(Icons.Default.Email, contentDescription = null) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                        keyboardActions = KeyboardActions(onNext = { passwordFocus.requestFocus() }),
                        isError = state.fieldErrors["email"] != null,
                        supportingText = state.fieldErrors["email"]?.let { error -> { Text(error) } },
                    )
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        modifier = Modifier.fillMaxWidth().focusRequester(passwordFocus),
                        enabled = !state.signingIn,
                        singleLine = true,
                        label = { Text(stringResource(R.string.login_password)) },
                        leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                        trailingIcon = {
                            IconButton(onClick = { showPassword = !showPassword }) {
                                Icon(if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility, passwordAction)
                            }
                        },
                        visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { submit() }),
                        isError = state.fieldErrors["password"] != null,
                        supportingText = state.fieldErrors["password"]?.let { error -> { Text(error) } },
                    )
                    Button(onClick = submit, enabled = !state.signingIn, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
                        if (state.signingIn) {
                            CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                            Spacer(Modifier.width(10.dp))
                            Text(stringResource(R.string.login_checking))
                        } else {
                            Text(stringResource(R.string.login_submit), Modifier.weight(1f))
                            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null)
                        }
                    }
                    HorizontalDivider()
                    TextButton(onClick = onRegister, enabled = !state.signingIn, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Default.PersonAdd, contentDescription = null)
                        Spacer(Modifier.width(10.dp))
                        Text(stringResource(R.string.login_register_patient), Modifier.weight(1f))
                        Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null)
                    }
                }
            }
        }
    }
}

@Composable private fun RegistrationScreen(state:AuthUiState,back:()->Unit,register:(String,String,String,String)->Unit){
    var name by rememberSaveable{mutableStateOf("")};var email by rememberSaveable{mutableStateOf("")};var password by remember{mutableStateOf("")};var confirmation by remember{mutableStateOf("")}
    Surface(color=BrandBlue){Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
        TextButton(onClick=back,enabled=!state.signingIn){Text("← Volver al ingreso",color=Color.White)}
        Surface(color=MaterialTheme.colorScheme.background,shape=MaterialTheme.shapes.extraLarge,tonalElevation=6.dp){Column(Modifier.padding(20.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
            Text("CUENTA DE PACIENTE",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.primary)
            Text("Creá tu cuenta.",style=MaterialTheme.typography.headlineMedium)
            if(state.registrationMessage!=null){Text(state.registrationMessage);Button(onClick=back,modifier=Modifier.fillMaxWidth()){Text("Volver al ingreso")}}
            else{
                state.error?.let{Text(it,color=MaterialTheme.colorScheme.error)}
                OutlinedTextField(name,{name=it.take(120)},label={Text("Nombre completo")},modifier=Modifier.fillMaxWidth(),singleLine=true,isError=state.fieldErrors.containsKey("name"),supportingText={state.fieldErrors["name"]?.let{Text(it)}},enabled=!state.signingIn)
                OutlinedTextField(email,{email=it.take(254)},label={Text("Correo electrónico")},modifier=Modifier.fillMaxWidth(),singleLine=true,keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Email),isError=state.fieldErrors.containsKey("email"),supportingText={state.fieldErrors["email"]?.let{Text(it)}},enabled=!state.signingIn)
                OutlinedTextField(password,{password=it},label={Text("Contraseña · 8+ caracteres")},modifier=Modifier.fillMaxWidth(),singleLine=true,visualTransformation=PasswordVisualTransformation(),keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Password),isError=state.fieldErrors.containsKey("password"),supportingText=state.fieldErrors["password"]?.let{error->{Text(error)}},enabled=!state.signingIn)
                OutlinedTextField(confirmation,{confirmation=it},label={Text("Confirmar contraseña")},modifier=Modifier.fillMaxWidth(),singleLine=true,visualTransformation=PasswordVisualTransformation(),keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Password),isError=state.fieldErrors.containsKey("confirmation"),supportingText={state.fieldErrors["confirmation"]?.let{Text(it)}},enabled=!state.signingIn)
                ClimesaButton(if(state.signingIn)"Creando cuenta…"else"Crear cuenta de paciente",Icons.Default.PersonAdd,{register(name,email,password,confirmation)},enabled=!state.signingIn)
            }
        }}
    }}
}
