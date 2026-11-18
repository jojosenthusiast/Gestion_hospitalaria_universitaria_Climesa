package sv.edu.catolica.climesa.data
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.json.JSONTokener
import java.net.HttpURLConnection
import java.net.URL
import kotlin.coroutines.coroutineContext
/** Mensaje de error del API en español para la persona (MOV-03, [ApiProblems]): nunca texto crudo en inglés. */
internal fun apiErrorMessage(body:String,status:Int?=null):String=ApiProblems.parse(body,status).message
/** Código estable (`codigo`) del problem+json, por ejemplo `version_conflicto`. */
internal fun apiErrorCode(body:String):String?=runCatching{JSONObject(body).optString("codigo").takeIf{it.isNotBlank()}}.getOrNull()
/**
 * What the person reads when the network fails (R3 A-21). A read has no form to keep, so it only says the list did not load;
 * a write keeps the typed form and says so. A missing API address is a build problem, never shown as such (A-22).
 */
internal object NetworkMessages {
    const val READ = "No se pudo cargar. Revisa tu conexión."
    const val WRITE = "Sin conexión. Conservamos el formulario; vuelve a intentar."
    const val UNAVAILABLE = "CLIMESA no está disponible en este momento. Intenta más tarde."
    fun forMethod(method: String) = if (method.equals("GET", ignoreCase = true)) READ else WRITE
}
/** Port to the REST API, so ViewModels can be tested on the JVM with a fake. [ApiClient] is the real adapter. */
interface ApiGateway {
    suspend fun request(path:String,method:String="GET",body:JSONObject?=null):Any
    /** POST of one file as multipart/form-data in [field] (lab attachments, T07c). Read-only fakes do not upload. */
    suspend fun upload(path:String,field:String,fileName:String,mimeType:String,bytes:ByteArray):Any=throw UnsupportedOperationException("Este origen de datos no sube archivos.")
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
        if(baseUrl.isBlank())throw AuthRequestException(NetworkMessages.UNAVAILABLE)
        val signature=method+path+(body?.toString()?:"")
        val intent=coroutineContext[RequestIntent]?.idempotencyKey
        val key=if(method!="GET")intent?:keys.keyFor(signature) else null
        var status:Int?=null
        try {
            // Reads survive the API cold start (MA-OPS-01); writes rely on the person retrying with the same key.
            val call=suspend{authorizedCall(tokens,expiry){token->send(path,method,body,token,key).also{status=200}}}
            if(method=="GET")ColdStart.retrying{call()} else call()
        } catch(e:AuthRequestException){status=e.statusCode;throw e} finally {
            if(key!=null&&intent==null)keys.settle(signature,status)
        }
    }
    /** Same session renewal and idempotency as [request]; a write is never repeated on its own (the person retries). */
    override suspend fun upload(path:String,field:String,fileName:String,mimeType:String,bytes:ByteArray):Any=withContext(Dispatchers.IO) {
        if(baseUrl.isBlank())throw AuthRequestException(NetworkMessages.UNAVAILABLE)
        val signature="POST"+path+fileName+bytes.size
        val intent=coroutineContext[RequestIntent]?.idempotencyKey
        val key=intent?:keys.keyFor(signature)
        var status:Int?=null
        try {
            val boundary=Multipart.boundary()
            val payload=Multipart.body(boundary,field,fileName,mimeType,bytes)
            authorizedCall(tokens,expiry){token->send(path,"POST",null,token,key,payload to Multipart.contentType(boundary)).also{status=200}}
        } catch(e:AuthRequestException){status=e.statusCode;throw e} finally {
            if(intent==null)keys.settle(signature,status)
        }
    }
    private fun send(path:String,method:String,body:JSONObject?,token:String,key:String?,raw:Pair<ByteArray,String>?=null):Any {
        val c=(URL(baseUrl.trimEnd('/')+path).openConnection() as HttpURLConnection).apply {
            useCaches=false;requestMethod=method;connectTimeout=ColdStart.CONNECT_TIMEOUT_MS;readTimeout=ColdStart.READ_TIMEOUT_MS
            setRequestProperty("Accept","application/json");setRequestProperty("Authorization","Bearer $token")
            key?.let{setRequestProperty("Idempotency-Key",it)}
            if(body!=null){doOutput=true;setRequestProperty("Content-Type","application/json; charset=utf-8")}
            raw?.let{(bytes,type)->doOutput=true;setRequestProperty("Content-Type",type);setFixedLengthStreamingMode(bytes.size)}
        }
        try {
            body?.let { payload -> c.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) } }
            raw?.let { (bytes,_) -> c.outputStream.use { it.write(bytes) } }
            val status=c.responseCode
            ColdStart.warmth.record(status)
            val text=(if(status in 200..299)c.inputStream else c.errorStream)?.bufferedReader()?.use{it.readText()}.orEmpty()
            if(status !in 200..299)throw AuthRequestException(apiErrorMessage(text,status),status,apiErrorCode(text),text)
            return if(text.isBlank())JSONObject()else JSONTokener(text).nextValue()
        } catch(e:AuthRequestException){throw e} catch(_:java.io.IOException){ColdStart.warmth.failed();throw AuthRequestException(NetworkMessages.forMethod(method))} finally {c.disconnect()}
    }
}
