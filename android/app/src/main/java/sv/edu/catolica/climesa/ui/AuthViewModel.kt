package sv.edu.catolica.climesa.ui
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import sv.edu.catolica.climesa.data.*
import sv.edu.catolica.climesa.data.realtime.ProfileLiveRefresh
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.*
/** What the user has typed in the login form. Kept in memory only (never on disk) so leaving the app or rotating does not lose it. */
class LoginDraft(var email:String="",var password:String="")
data class AuthUiState(val checkingSession:Boolean=true,val signingIn:Boolean=false,val signingOut:Boolean=false,val account:AuthenticatedAccount?=null,val fieldErrors:Map<String,String> = emptyMap(),val error:String?=null,val accessPending:Boolean=false,
    /** Address that just signed up and still has to open the confirmation link ("Revisa tu correo"). */
    val confirmationEmail:String?=null,
    /** Address whose sign-in was rejected with `email_not_confirmed`: the login offers to resend the email. */
    val unconfirmedEmail:String?=null,
    val sendingEmail:Boolean=false,
    /** Epoch millis when another confirmation email may be requested (Supabase allows one per minute). */
    val resendAvailableAt:Long=0,
    val emailNotice:String?=null)
@HiltViewModel
class AuthViewModel @Inject constructor(private val auth:SupabaseAuthRepository,private val backend:BackendAccessRepository,realtime:RealtimeRepository,private val expiry:SessionExpiry):ViewModel() {
    private val mutableState=MutableStateFlow(AuthUiState());val state=mutableState.asStateFlow()
    private var pending:AuthSession?=null
    val draft=LoginDraft()
    private var accessJob:Job?=null
    /** Un evento `usuario` vuelve a leer `/auth/me` y, si cambian los canales, se vuelve a unir con la lista nueva. */
    private val liveProfile=ProfileLiveRefresh<AuthenticatedAccount>(realtime,
        load={auth.restoreSession()?.let{AuthenticatedAccount(it,backend.profile(it))}},
        channelsOf={it.profile.channels},
        apply={account->pending=account.session;mutableState.update{it.copy(account=account)}},
        onLost={retryAccess(silent=true)})
    private var expiryWatch:Job?=null
    private fun track(account:AuthenticatedAccount?){if(account==null)liveProfile.stop() else {liveProfile.start(viewModelScope,account.profile.channels);watchExpiry()}}
    /** A 401 that survived one renewal (see `authorizedCall`) ends the session and shows the login with the reason. */
    private fun watchExpiry(){if(expiryWatch?.isActive==true)return;expiryWatch=viewModelScope.launch{expiry.expired.collect{message->if(mutableState.value.account!=null&&!mutableState.value.signingOut)expireSession(message)}}}
    private fun expireSession(message:String){
        liveProfile.stop()
        auth.clearLocalSession();pending=null;draft.password=""
        mutableState.value=AuthUiState(checkingSession=false,error=message)
    }
    init { retryAccess() }
    /**
     * Verifies the session against `/auth/me`. `silent` is for returning from the background or a lost live channel: it never swaps the
     * screen for the loading one, ignores a call while another is in flight, and keeps the current account when the answer is only a
     * transient failure, so no "No pudimos verificar tu acceso" flashes while the user is signing in or working.
     */
    fun retryAccess(silent:Boolean=false){
        val now=mutableState.value
        if(accessJob?.isActive==true||now.signingIn||now.signingOut)return
        if(silent&&now.account==null)return
        accessJob=viewModelScope.launch {
        if(!silent)mutableState.update{it.copy(checkingSession=true,error=null)}
        try {val session=auth.restoreSession();pending=session;val account=session?.let{AuthenticatedAccount(it,backend.profile(it))};mutableState.update{it.copy(checkingSession=false,account=account,accessPending=false)};track(account)}
        catch(e:Exception){if(e is CancellationException)throw e;if(e is AuthRequestException&&(e.statusCode==400||e.statusCode==401)){expireSession(SessionExpiry.MESSAGE);return@launch};if(silent&&mutableState.value.account!=null)return@launch;mutableState.update{it.copy(checkingSession=false,account=null,accessPending=pending!=null,error=e.message?:"No se pudo verificar la sesión.")}}
    }}
    fun signIn(email:String,password:String){val errors=AuthRules.validate(email,password);if(errors.isNotEmpty()){mutableState.update{it.copy(fieldErrors=errors,error=null)};return}
        viewModelScope.launch{mutableState.update{it.copy(signingIn=true,error=null,fieldErrors=emptyMap(),unconfirmedEmail=null,emailNotice=null)};try {val session=auth.signIn(email,password);pending=session;val account=AuthenticatedAccount(session,backend.profile(session));draft.password="";mutableState.update{it.copy(signingIn=false,account=account,accessPending=false)};track(account)}catch(e:Exception){if(e is CancellationException)throw e
            val unconfirmed=(e as? AuthRequestException)?.code==AuthErrors.EMAIL_NOT_CONFIRMED
            mutableState.update{it.copy(signingIn=false,error=e.message?:"No se pudo iniciar sesión.",accessPending=pending!=null,unconfirmedEmail=if(unconfirmed)email.trim() else null)}}}
    }
    fun register(name:String,email:String,password:String,confirmation:String){val errors=RegistrationRules.validate(name,email,password,confirmation);if(errors.isNotEmpty()){mutableState.update{it.copy(fieldErrors=errors,error=null)};return}
        viewModelScope.launch{mutableState.update{it.copy(signingIn=true,error=null,fieldErrors=emptyMap(),emailNotice=null)};try{val session=auth.signUp(name,email,password);pending=session;if(session!=null){val profile=backend.profile(session);val account=AuthenticatedAccount(session,profile);mutableState.update{it.copy(signingIn=false,account=account)};track(account)}else mutableState.update{it.copy(signingIn=false,confirmationEmail=email.trim(),resendAvailableAt=ResendCooldown.availableAt(System.currentTimeMillis()))}}catch(e:Exception){if(e is CancellationException)throw e
            val message=if(e is AuthRequestException&&e.code!=null)e.message else "No se pudo crear la cuenta. Revisa los datos o intenta iniciar sesión."
            mutableState.update{it.copy(signingIn=false,error=message,accessPending=pending!=null)}}}
    }
    /** Resends the sign-up confirmation email to [email], at most once per [ResendCooldown.SECONDS]. */
    fun resendConfirmation(email:String){
        val now=mutableState.value
        if(now.sendingEmail||ResendCooldown.remainingSeconds(now.resendAvailableAt,System.currentTimeMillis())>0||email.isBlank())return
        viewModelScope.launch{mutableState.update{it.copy(sendingEmail=true,error=null,emailNotice=null)}
            try{auth.resendSignupConfirmation(email);mutableState.update{it.copy(sendingEmail=false,resendAvailableAt=ResendCooldown.availableAt(System.currentTimeMillis()),emailNotice="Te enviamos un nuevo correo de confirmación a ${email.trim()}.")}}
            catch(e:Exception){if(e is CancellationException)throw e
                val limited=(e as? AuthRequestException)?.code=="over_email_send_rate_limit"
                mutableState.update{it.copy(sendingEmail=false,error=e.message?:"No se pudo reenviar el correo.",resendAvailableAt=if(limited)ResendCooldown.availableAt(System.currentTimeMillis()) else it.resendAvailableAt)}}}
    }
    /** "¿Olvidaste tu contraseña?": Supabase emails a link to the web page `/restablecer`. Same answer whether the account exists or not. */
    fun requestPasswordReset(email:String){
        val error=AuthRules.validate(email,"12345678")["email"]
        if(error!=null){mutableState.update{it.copy(fieldErrors=mapOf("email" to error),error=null,emailNotice=null)};return}
        if(mutableState.value.sendingEmail)return
        viewModelScope.launch{mutableState.update{it.copy(sendingEmail=true,error=null,fieldErrors=emptyMap(),emailNotice=null)}
            try{auth.requestPasswordReset(email);mutableState.update{it.copy(sendingEmail=false,emailNotice="Si hay una cuenta con ${email.trim()}, te enviamos un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.")}}
            catch(e:Exception){if(e is CancellationException)throw e;mutableState.update{it.copy(sendingEmail=false,error=e.message?:"No se pudo enviar el correo.")}}}
    }
    /** "Ya confirmé, iniciar sesión": back to the login with the address already typed. */
    fun confirmedSignIn(email:String){draft.email=email.trim();draft.password="";clearRegistration()}
    fun clearRegistration(){mutableState.update{it.copy(confirmationEmail=null,unconfirmedEmail=null,emailNotice=null,fieldErrors=emptyMap(),error=null)}}
    fun signOut(){
        val session=mutableState.value.account?.session?:pending
        liveProfile.stop()
        viewModelScope.coroutineContext.cancelChildren()
        mutableState.value=AuthUiState(checkingSession=true,signingOut=true)
        auth.clearLocalSession()
        viewModelScope.launch { try { session?.let{auth.signOut(it)} } finally { auth.clearLocalSession();pending=null;draft.password="";mutableState.value=AuthUiState(checkingSession=false) } }
    }
}
