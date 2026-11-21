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
    var resetting by rememberSaveable { mutableStateOf(false) }
    // Review of #117: signing out with queued milestones warns that they stay on the phone until the same account returns.
    var confirmingSignOut by rememberSaveable { mutableStateOf(false) }
    val logout={if(authModel.hasPendingWrites())confirmingSignOut=true else authModel.signOut()}
    if(confirmingSignOut&&state.account!=null)ConfirmDialog(title=stringResource(R.string.cerrar_sesion_pendiente_titulo),confirmLabel=stringResource(R.string.cerrar_sesion),onConfirm={confirmingSignOut=false;authModel.signOut()},onDismiss={confirmingSignOut=false},message=stringResource(R.string.cerrar_sesion_pendiente_detalle))
    val sessionStores:SessionStoreHolder=viewModel()
    // Logout or expired session: clear the account's ViewModels (data, coroutines and realtime subscriptions).
    LaunchedEffect(state.account?.session?.userId){if(state.account==null)sessionStores.end()}
    val backToLogin={registering=false;resetting=false;authModel.clearRegistration()}
    when {
        state.checkingSession -> AuthLoadingScreen()
        state.accessPending -> AccessPending(state.error,{authModel.retryAccess()},authModel::signOut)
        state.account==null&&state.confirmationEmail!=null -> CheckEmailScreen(state,state.confirmationEmail!!,authModel::resendConfirmation){registering=false;authModel.confirmedSignIn(state.confirmationEmail!!)}
        state.account==null&&resetting -> PasswordResetScreen(state,authModel.draft.email,authModel::requestPasswordReset,backToLogin)
        state.account==null -> if(registering) RegistrationScreen(state,backToLogin,authModel::register) else LoginScreen(state,authModel.draft,authModel::signIn,authModel::resendConfirmation,{resetting=true;authModel.clearRegistration()}){registering=true;authModel.clearRegistration()}
        else -> SessionViewModelScope(sessionStores,state.account!!.session.userId){AuthorizedWorkspace(state.account!!,dark,setDark,state.signingOut,logout)}
    }
}
@Composable private fun AccessPending(error:String?,retry:()->Unit,logout:()->Unit){
    Surface { Column(Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(24.dp),verticalArrangement=Arrangement.Center,horizontalAlignment=Alignment.CenterHorizontally){CompactHeader(stringResource(R.string.app_acceso_error));Text(error?:stringResource(R.string.app_revisa_conexion),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant);Spacer(Modifier.height(24.dp));ClimesaButton(stringResource(R.string.app_volver_intentar),Icons.Default.Refresh,retry);Spacer(Modifier.height(10.dp));TextButton(onClick=logout){Text(stringResource(R.string.cerrar_sesion))}} }
}
@Composable private fun AuthorizedWorkspace(account:AuthenticatedAccount,dark:Boolean,setDark:(Boolean)->Unit,signingOut:Boolean,logout:()->Unit){
    val destination=account.profile.androidDestination()
    val allowedRoles=RoleAccess.allowed(account.profile,"android")
    val roles=if(destination==AndroidDestination.NOT_AVAILABLE||destination==AndroidDestination.PENDING_VERIFICATION)emptyList() else allowedRoles.filter { AndroidSections.hasAppScreens(it,account.profile.permissions) }
    var selectedRole by rememberSaveable(account.session.userId){mutableStateOf(roles.firstOrNull().orEmpty())}
    val role=selectedRole.takeIf{it in roles}?:roles.firstOrNull().orEmpty()
    if(roles.isEmpty()){Surface{Column(Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp),verticalArrangement=Arrangement.Center){SectionIntro("",stringResource(R.string.app_rol_sin_android));Spacer(Modifier.height(16.dp));Text(PlatformGate.message(account.profile.platforms,"android",BuildConfig.WEB_URL));Spacer(Modifier.height(24.dp));PrimaryButton(stringResource(R.string.cerrar_sesion),logout)}};return}
    // D11: the role bar takes only the top and side insets; the screen below does not pad the status bar again.
    val roleBarInsets=androidx.compose.foundation.layout.WindowInsets.safeDrawing.only(androidx.compose.foundation.layout.WindowInsetsSides.Top+androidx.compose.foundation.layout.WindowInsetsSides.Horizontal)
    Column(Modifier.fillMaxSize()){
        if(roles.size>1){var menu by remember{mutableStateOf(false)};Surface(color=BrandNavy){Box(Modifier.fillMaxWidth().windowInsetsPadding(roleBarInsets).padding(horizontal=20.dp)){TextButton(onClick={menu=true}){Text("${RoleAccess.label(role)}  ▾",color=Color.White)};DropdownMenu(expanded=menu,onDismissRequest={menu=false}){roles.forEach{r->DropdownMenuItem(text={Text(RoleAccess.label(r))},onClick={selectedRole=r;menu=false})}}}}}
        Box(Modifier.weight(1f).then(if(roles.size>1)Modifier.consumeWindowInsets(roleBarInsets) else Modifier)){if(role=="REC"){
            val reception:ReceptionViewModel=viewModel()
            DisposableEffect(account.session.userId){reception.reload();onDispose{reception.clear()}}
            LaunchedEffect(account.session.userId,account.profile.channels){reception.startLive(account.profile.channels)}
            LaunchedEffect(account.profile.permissions){reception.setPermissions(account.profile.permissions)}
            ReceptionApp(reception,dark,setDark,account,signingOut,logout)
        }else RolePortal(account,role,dark,setDark,signingOut,logout)}
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
            Spinner()
            Spacer(Modifier.height(12.dp))
            Text(stringResource(R.string.app_comprobando_sesion))
            Spacer(Modifier.height(8.dp))
            SlowServerHint(active = true, modifier = Modifier.padding(horizontal = 24.dp))
        }
    }
}

@Composable
private fun LoginScreen(state: AuthUiState, draft: LoginDraft, signIn: (String, String) -> Unit, resend: (String) -> Unit, onForgot: () -> Unit, onRegister: () -> Unit) {
    // The draft lives in the ViewModel (memory only): going to the background, rotating or a brief loading screen keeps what was typed.
    var email by rememberSaveable { mutableStateOf(draft.email) }
    var password by remember { mutableStateOf(draft.password) }
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
                    Text(stringResource(R.string.login_brand_subtitle), style = MaterialTheme.typography.labelSmall, color = BrandAccent)
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
                    state.unconfirmedEmail?.let { ResendConfirmationButton(state, it, resend) }
                    state.emailNotice?.let { AuthInfoNotice(it) }
                    if (demoAccounts.isNotEmpty()) DemoAccountPicker(demoAccounts, enabled = !state.signingIn) { account -> email = account.email; password = account.password; draft.email = email; draft.password = password }
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it.trimStart().take(254); draft.email = email },
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
                        onValueChange = { password = it; draft.password = password },
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
                            Spinner(size = 20.dp, strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                            Spacer(Modifier.width(10.dp))
                            Text(stringResource(R.string.login_checking))
                        } else {
                            Text(stringResource(R.string.login_submit), Modifier.weight(1f))
                            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null)
                        }
                    }
                    SlowServerHint(state.signingIn, Modifier.fillMaxWidth())
                    TextButton(onClick = { draft.email = email; onForgot() }, enabled = !state.signingIn, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.app_olvidaste))
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
        TextButton(onClick=back,enabled=!state.signingIn){Text(stringResource(R.string.app_volver_ingreso),color=Color.White)}
        Surface(color=MaterialTheme.colorScheme.background,shape=MaterialTheme.shapes.extraLarge,tonalElevation=6.dp){Column(Modifier.padding(20.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
            Text(stringResource(R.string.app_cuenta_paciente),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.primary)
            Text(stringResource(R.string.app_crea_cuenta),style=MaterialTheme.typography.headlineMedium)
            run{
                state.error?.let{Text(it,color=MaterialTheme.colorScheme.error)}
                OutlinedTextField(name,{name=it.take(120)},label={Text(stringResource(R.string.app_nombre_completo))},modifier=Modifier.fillMaxWidth(),singleLine=true,isError=state.fieldErrors.containsKey("name"),supportingText={state.fieldErrors["name"]?.let{Text(it)}},enabled=!state.signingIn)
                OutlinedTextField(email,{email=it.take(254)},label={Text(stringResource(R.string.app_correo))},modifier=Modifier.fillMaxWidth(),singleLine=true,keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Email),isError=state.fieldErrors.containsKey("email"),supportingText={state.fieldErrors["email"]?.let{Text(it)}},enabled=!state.signingIn)
                OutlinedTextField(password,{password=it},label={Text(stringResource(R.string.app_contrasena_8))},modifier=Modifier.fillMaxWidth(),singleLine=true,visualTransformation=PasswordVisualTransformation(),keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Password),isError=state.fieldErrors.containsKey("password"),supportingText=state.fieldErrors["password"]?.let{error->{Text(error)}},enabled=!state.signingIn)
                OutlinedTextField(confirmation,{confirmation=it},label={Text(stringResource(R.string.app_confirmar_contrasena))},modifier=Modifier.fillMaxWidth(),singleLine=true,visualTransformation=PasswordVisualTransformation(),keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Password),isError=state.fieldErrors.containsKey("confirmation"),supportingText={state.fieldErrors["confirmation"]?.let{Text(it)}},enabled=!state.signingIn)
                ClimesaButton(stringResource(if(state.signingIn)R.string.app_creando_cuenta else R.string.app_crear_cuenta),Icons.Default.PersonAdd,{register(name,email,password,confirmation)},enabled=!state.signingIn)
            }
        }}
    }}
}

/** Seconds left of [availableAt]; ticks once per second only while the wait lasts (a UI countdown, not a data refresh). */
@Composable private fun rememberSecondsLeft(availableAt:Long):Long{
    var now by remember{mutableLongStateOf(System.currentTimeMillis())}
    LaunchedEffect(availableAt){now=System.currentTimeMillis();while(ResendCooldown.remainingSeconds(availableAt,now)>0){kotlinx.coroutines.delay(1000);now=System.currentTimeMillis()}}
    return ResendCooldown.remainingSeconds(availableAt,now)
}
@Composable private fun AuthInfoNotice(text:String){
    Surface(Modifier.fillMaxWidth().semantics{liveRegion=LiveRegionMode.Polite},color=MaterialTheme.colorScheme.secondaryContainer,shape=MaterialTheme.shapes.small){
        Text(text,Modifier.padding(14.dp),color=MaterialTheme.colorScheme.onSecondaryContainer,style=MaterialTheme.typography.bodyMedium)
    }
}
@Composable private fun ResendConfirmationButton(state:AuthUiState,email:String,resend:(String)->Unit){
    val seconds=rememberSecondsLeft(state.resendAvailableAt)
    OutlinedButton(onClick={resend(email)},enabled=!state.sendingEmail&&seconds==0L,modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)){
        Icon(Icons.Default.Email,contentDescription=null);Spacer(Modifier.width(10.dp))
        Text(when{state.sendingEmail->stringResource(R.string.app_enviando_correo);seconds>0->stringResource(R.string.app_reenviar_en,seconds);else->stringResource(R.string.app_reenviar)})
    }
}
/** After a patient signs up: the account exists but Supabase waits for the link in the email before allowing sign-in. */
@Composable private fun CheckEmailScreen(state:AuthUiState,email:String,resend:(String)->Unit,signIn:()->Unit){
    Surface(color=BrandBlue){Column(Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(16.dp),verticalArrangement=Arrangement.Center,horizontalAlignment=Alignment.CenterHorizontally){
        Surface(Modifier.widthIn(max=560.dp).fillMaxWidth(),color=MaterialTheme.colorScheme.background,shape=MaterialTheme.shapes.extraLarge,tonalElevation=6.dp){Column(Modifier.padding(20.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
            Icon(Icons.Default.Email,contentDescription=null,Modifier.size(40.dp),tint=MaterialTheme.colorScheme.primary)
            Text(stringResource(R.string.app_revisa_correo),style=MaterialTheme.typography.headlineMedium)
            Text(stringResource(R.string.app_enlace_enviado),style=MaterialTheme.typography.bodyMedium)
            Text(email,style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.Bold)
            Text(stringResource(R.string.app_abre_correo),style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
            state.error?.let{Text(it,color=MaterialTheme.colorScheme.error)}
            state.emailNotice?.let{AuthInfoNotice(it)}
            ResendConfirmationButton(state,email,resend)
            ClimesaButton(stringResource(R.string.app_ya_confirme),Icons.AutoMirrored.Filled.ArrowForward,signIn)
        }}
    }}
}
/** "¿Olvidaste tu contraseña?": asks for the address; the email link opens the web page that sets the new password. */
@Composable private fun PasswordResetScreen(state:AuthUiState,initialEmail:String,send:(String)->Unit,back:()->Unit){
    var email by rememberSaveable{mutableStateOf(initialEmail)}
    Surface(color=BrandBlue){Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
        TextButton(onClick=back,enabled=!state.sendingEmail){Text(stringResource(R.string.app_volver_ingreso),color=Color.White)}
        Surface(color=MaterialTheme.colorScheme.background,shape=MaterialTheme.shapes.extraLarge,tonalElevation=6.dp){Column(Modifier.padding(20.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
            Text(stringResource(R.string.app_recuperar),style=MaterialTheme.typography.headlineMedium)
            Text(stringResource(R.string.app_recuperar_detalle),style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
            state.error?.let{Text(it,color=MaterialTheme.colorScheme.error)}
            state.emailNotice?.let{AuthInfoNotice(it)}
            OutlinedTextField(email,{email=it.trimStart().take(254)},label={Text(stringResource(R.string.app_correo))},modifier=Modifier.fillMaxWidth(),singleLine=true,leadingIcon={Icon(Icons.Default.Email,contentDescription=null)},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Email,imeAction=ImeAction.Send),keyboardActions=KeyboardActions(onSend={send(email)}),isError=state.fieldErrors.containsKey("email"),supportingText=state.fieldErrors["email"]?.let{error->{Text(error)}},enabled=!state.sendingEmail)
            ClimesaButton(stringResource(if(state.sendingEmail)R.string.app_enviando else R.string.app_enviar_enlace),Icons.Default.Email,{send(email)},enabled=!state.sendingEmail)
        }}
    }}
}