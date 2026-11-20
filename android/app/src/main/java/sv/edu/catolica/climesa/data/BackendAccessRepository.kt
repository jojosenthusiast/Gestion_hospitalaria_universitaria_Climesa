package sv.edu.catolica.climesa.data
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.AuthSession
import java.net.HttpURLConnection
import java.net.URL
class BackendAccessRepository(private val apiBaseUrl:String) {
    /** `/auth/me` is usually the call that wakes the API (MA-OPS-01): long read timeout and retries with backoff. */
    suspend fun profile(session:AuthSession):AccessProfile {
        if(apiBaseUrl.isBlank())throw AuthRequestException("Configura la API de CLIMESA para verificar los permisos.")
        return ColdStart.retrying{fetch(session)}
    }
    private suspend fun fetch(session:AuthSession):AccessProfile=withContext(Dispatchers.IO) {
        val c=(URL(apiBaseUrl.trimEnd('/')+"/auth/me").openConnection() as HttpURLConnection).apply {
            useCaches=false;requestMethod="GET";connectTimeout=ColdStart.CONNECT_TIMEOUT_MS;readTimeout=ColdStart.PROFILE_READ_TIMEOUT_MS;setRequestProperty("Accept","application/json");setRequestProperty("Authorization","Bearer ${session.accessToken}")
        }
        try {
            val status=c.responseCode
            ColdStart.warmth.record(status)
            val body=(if(status in 200..299)c.inputStream else c.errorStream)?.bufferedReader()?.use{it.readText()}.orEmpty()
            if(status !in 200..299)throw AuthRequestException(apiErrorMessage(body,status),status)
            profileFromJson(JSONObject(body))

        } catch(e:AuthRequestException){throw e} catch(_:java.io.IOException){ColdStart.warmth.failed();throw AuthRequestException("No se pudo verificar el acceso. Revisa la conexión e intenta de nuevo.")} finally {c.disconnect()}
    }
}

/**
 * Reads `/auth/me`. D129: `name` is the linked patient's name for a patient account; `patientName` and `patientRecord`
 * are optional (older API). A null text never becomes the word "null".
 */
internal fun profileFromJson(json:JSONObject):AccessProfile {
    fun strings(key:String)=json.optJSONArray(key)?.let{a->(0 until a.length()).map(a::getString)}?:emptyList()
    fun text(key:String)=json.optString(key).takeIf{!json.isNull(key)&&it.isNotBlank()}
    val grants=json.optJSONArray("permissions")?.let{a->(0 until a.length()).map{a.getJSONObject(it)}}?:emptyList()
    val permissions=grants.map{it.getString("code")}
    val contexts=grants.groupBy({it.getString("code")},{it.optString("context")})
    if(strings("roles").isEmpty()||"sesion.perfil" !in permissions)throw AuthRequestException("La cuenta no tiene permisos vigentes.",403)
    return AccessProfile(roles=strings("roles"),permissions=permissions,verifiedByBackend=true,platforms=strings("platforms"),channels=strings("channels"),name=text("name").orEmpty(),patientId=text("patientId"),staffId=text("staffId"),permissionContexts=contexts,patientName=text("patientName"),patientRecord=text("patientRecord"))
}