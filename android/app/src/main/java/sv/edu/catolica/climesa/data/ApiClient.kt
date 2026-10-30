package sv.edu.catolica.climesa.data
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.json.JSONTokener
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
/** Mensaje de error del API: `detail` de application/problem+json, con respaldo al formato anterior `error.message`. */
internal fun apiErrorMessage(body:String):String?=runCatching {
    val json=JSONObject(body)
    json.optString("detail").takeIf{it.isNotBlank()}?:json.optJSONObject("error")?.optString("message")?.takeIf{it.isNotBlank()}
}.getOrNull()
/** Código estable (`codigo`) del problem+json, por ejemplo `version_conflicto`. */
internal fun apiErrorCode(body:String):String?=runCatching{JSONObject(body).optString("codigo").takeIf{it.isNotBlank()}}.getOrNull()
class ApiClient(private val baseUrl:String,private val auth:SupabaseAuthRepository) {
    private val attempts=ConcurrentHashMap<String,String>()
    suspend fun request(path:String,method:String="GET",body:JSONObject?=null):Any=withContext(Dispatchers.IO) {
        if(baseUrl.isBlank())throw AuthRequestException("Configura la dirección de la API de CLIMESA.")
        val session=auth.restoreSession()?:throw AuthRequestException("Ingresa nuevamente para continuar.",401)
        val signature=method+path+(body?.toString()?:"")
        val key=if(method!="GET")attempts.getOrPut(signature){UUID.randomUUID().toString()}else null
        val c=(URL(baseUrl.trimEnd('/')+path).openConnection() as HttpURLConnection).apply {
            useCaches=false;requestMethod=method;connectTimeout=15000;readTimeout=20000
            setRequestProperty("Accept","application/json");setRequestProperty("Authorization","Bearer ${session.accessToken}")
            key?.let{setRequestProperty("Idempotency-Key",it)}
            if(body!=null){doOutput=true;setRequestProperty("Content-Type","application/json; charset=utf-8")}
        }
        try {
            body?.let { payload -> c.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) } }
            val status=c.responseCode
            val text=(if(status in 200..299)c.inputStream else c.errorStream)?.bufferedReader()?.use{it.readText()}.orEmpty()
            if(status !in 200..299){val message=apiErrorMessage(text);throw AuthRequestException(message?.takeIf{it.isNotBlank()}?:"No se pudo completar la operación (HTTP $status).",status,apiErrorCode(text))}
            attempts.remove(signature)
            if(text.isBlank())JSONObject()else JSONTokener(text).nextValue()
        } catch(e:AuthRequestException){throw e} catch(_:java.io.IOException){throw AuthRequestException("Sin conexión. Conservamos el formulario; vuelve a intentar.")} finally {c.disconnect()}
    }
}
