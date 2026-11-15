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
            val body=(if(status in 200..299)c.inputStream else c.errorStream)?.bufferedReader()?.use{it.readText()}.orEmpty()
            if(status !in 200..299)throw AuthRequestException(apiErrorMessage(body,status),status)
            val json=JSONObject(body)
            fun strings(key:String)=json.optJSONArray(key)?.let{a->(0 until a.length()).map(a::getString)}?:emptyList()
            val permissions=json.optJSONArray("permissions")?.let{a->(0 until a.length()).map{a.getJSONObject(it).getString("code")}}?:emptyList()
            if(strings("roles").isEmpty()||"sesion.perfil" !in permissions)throw AuthRequestException("La cuenta no tiene permisos vigentes.",403)
            AccessProfile(roles=strings("roles"),permissions=permissions,verifiedByBackend=true,platforms=strings("platforms"),channels=strings("channels"),name=json.optString("name"),patientId=json.optString("patientId").takeIf{!json.isNull("patientId")&&it.isNotBlank()},staffId=json.optString("staffId").takeIf{!json.isNull("staffId")&&it.isNotBlank()})
        } catch(e:AuthRequestException){throw e} catch(_:java.io.IOException){throw AuthRequestException("No se pudo verificar el acceso. Revisa la conexión e intenta de nuevo.")} finally {c.disconnect()}
    }
}
