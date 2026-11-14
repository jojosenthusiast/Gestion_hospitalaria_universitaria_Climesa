package sv.edu.catolica.climesa.data
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.json.JSONTokener
import java.net.HttpURLConnection
import java.net.URL
import kotlin.coroutines.coroutineContext
/** Mensaje de error del API: `detail` de application/problem+json, con respaldo al formato anterior `error.message`. */
internal fun apiErrorMessage(body:String):String?=runCatching {
    val json=JSONObject(body)
    json.optString("detail").takeIf{it.isNotBlank()}?:json.optJSONObject("error")?.optString("message")?.takeIf{it.isNotBlank()}
}.getOrNull()
/** Código estable (`codigo`) del problem+json, por ejemplo `version_conflicto`. */
internal fun apiErrorCode(body:String):String?=runCatching{JSONObject(body).optString("codigo").takeIf{it.isNotBlank()}}.getOrNull()
/** Port to the REST API, so ViewModels can be tested on the JVM with a fake. [ApiClient] is the real adapter. */
interface ApiGateway {
    suspend fun request(path:String,method:String="GET",body:JSONObject?=null):Any
}
/**
 * REST adapter. A 401 renews the session once and repeats the call ([authorizedCall]); if it fails again the session
 * is closed through [SessionExpiry]. Writes carry the key of the user intent ([RequestIntent], set by
 * [SubmissionIntent]) or, without one, the bounded per-request fallback of [IdempotencyKeys].
 */
class ApiClient(
    private val baseUrl:String,
    private val tokens:SessionTokens,
    private val expiry:SessionExpiry,
    private val keys:IdempotencyKeys=IdempotencyKeys(),
):ApiGateway {
    override suspend fun request(path:String,method:String,body:JSONObject?):Any=withContext(Dispatchers.IO) {
        if(baseUrl.isBlank())throw AuthRequestException("Configura la dirección de la API de CLIMESA.")
        val signature=method+path+(body?.toString()?:"")
        val intent=coroutineContext[RequestIntent]?.idempotencyKey
        val key=if(method!="GET")intent?:keys.keyFor(signature) else null
        var status:Int?=null
        try {
            authorizedCall(tokens,expiry){token->send(path,method,body,token,key).also{status=200}}
        } catch(e:AuthRequestException){status=e.statusCode;throw e} finally {
            if(key!=null&&intent==null)keys.settle(signature,status)
        }
    }
    private fun send(path:String,method:String,body:JSONObject?,token:String,key:String?):Any {
        val c=(URL(baseUrl.trimEnd('/')+path).openConnection() as HttpURLConnection).apply {
            useCaches=false;requestMethod=method;connectTimeout=15000;readTimeout=20000
            setRequestProperty("Accept","application/json");setRequestProperty("Authorization","Bearer $token")
            key?.let{setRequestProperty("Idempotency-Key",it)}
            if(body!=null){doOutput=true;setRequestProperty("Content-Type","application/json; charset=utf-8")}
        }
        try {
            body?.let { payload -> c.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) } }
            val status=c.responseCode
            val text=(if(status in 200..299)c.inputStream else c.errorStream)?.bufferedReader()?.use{it.readText()}.orEmpty()
            if(status !in 200..299){val message=apiErrorMessage(text);throw AuthRequestException(message?.takeIf{it.isNotBlank()}?:"No se pudo completar la operación (HTTP $status).",status,apiErrorCode(text))}
            return if(text.isBlank())JSONObject()else JSONTokener(text).nextValue()
        } catch(e:AuthRequestException){throw e} catch(_:java.io.IOException){throw AuthRequestException("Sin conexión. Conservamos el formulario; vuelve a intentar.")} finally {c.disconnect()}
    }
}
