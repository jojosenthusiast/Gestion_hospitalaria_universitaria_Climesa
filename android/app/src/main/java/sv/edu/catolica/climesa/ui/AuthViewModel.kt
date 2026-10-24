package sv.edu.catolica.climesa.ui
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import sv.edu.catolica.climesa.data.*
import sv.edu.catolica.climesa.domain.*
data class AuthUiState(val checkingSession:Boolean=true,val signingIn:Boolean=false,val signingOut:Boolean=false,val account:AuthenticatedAccount?=null,val fieldErrors:Map<String,String> = emptyMap(),val error:String?=null,val accessPending:Boolean=false,val registrationMessage:String?=null)
@HiltViewModel
class AuthViewModel @Inject constructor(private val auth:SupabaseAuthRepository,private val backend:BackendAccessRepository):ViewModel() {
    private val mutableState=MutableStateFlow(AuthUiState());val state=mutableState.asStateFlow()
    private var pending:AuthSession?=null
    init { retryAccess() }
    fun retryAccess(){viewModelScope.launch {
        mutableState.update{it.copy(checkingSession=true,error=null)}
        try {val session=auth.restoreSession();pending=session;val account=session?.let{AuthenticatedAccount(it,backend.profile(it))};mutableState.update{it.copy(checkingSession=false,account=account,accessPending=false)}}
        catch(e:Exception){if(e is CancellationException)throw e;mutableState.update{it.copy(checkingSession=false,account=null,accessPending=pending!=null,error=e.message?:"No se pudo verificar la sesión.")}}
    }}
    fun signIn(email:String,password:String){val errors=AuthRules.validate(email,password);if(errors.isNotEmpty()){mutableState.update{it.copy(fieldErrors=errors,error=null)};return}
        viewModelScope.launch{mutableState.update{it.copy(signingIn=true,error=null,fieldErrors=emptyMap())};try {val session=auth.signIn(email,password);pending=session;val account=AuthenticatedAccount(session,backend.profile(session));mutableState.update{it.copy(signingIn=false,account=account,accessPending=false)}}catch(e:Exception){if(e is CancellationException)throw e;mutableState.update{it.copy(signingIn=false,error=e.message?:"No se pudo iniciar sesión.",accessPending=pending!=null)}}}
    }
    fun register(name:String,email:String,password:String,confirmation:String){val errors=RegistrationRules.validate(name,email,password,confirmation);if(errors.isNotEmpty()){mutableState.update{it.copy(fieldErrors=errors,error=null)};return}
        viewModelScope.launch{mutableState.update{it.copy(signingIn=true,error=null,fieldErrors=emptyMap())};try{val session=auth.signUp(name,email,password);pending=session;if(session!=null){val profile=backend.profile(session);mutableState.update{it.copy(signingIn=false,account=AuthenticatedAccount(session,profile))}}else mutableState.update{it.copy(signingIn=false,registrationMessage="Revisa tu correo para confirmar la cuenta. Después podrás ingresar.")}}catch(e:Exception){if(e is CancellationException)throw e;mutableState.update{it.copy(signingIn=false,error="No se pudo crear la cuenta. Revisa los datos o intenta iniciar sesión.",accessPending=pending!=null)}}}
    }
    fun clearRegistration(){mutableState.update{it.copy(registrationMessage=null,fieldErrors=emptyMap(),error=null)}}
    fun signOut(){
        val session=mutableState.value.account?.session?:pending
        viewModelScope.coroutineContext.cancelChildren()
        mutableState.value=AuthUiState(checkingSession=true,signingOut=true)
        auth.clearLocalSession()
        viewModelScope.launch { try { session?.let{auth.signOut(it)} } finally { auth.clearLocalSession();pending=null;mutableState.value=AuthUiState(checkingSession=false) } }
    }
}
