import Foundation
import Observation
// El target Xcode compila Core/Access.swift directamente. El paquete Swift separa sus pruebas sin dependencias de UI.
enum ClientError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(text)=self { return text }; return nil }
}
struct AppConfiguration {
    let supabase: URL
    let publicKey: String
    let api: URL
    /// Web que abre los enlaces de los correos de Supabase (/confirmar-correo, /restablecer); `ClimesaWebURL` de Info.plist.
    var web: String = AuthRedirects.defaultWebURL
    static func load() throws -> AppConfiguration {
        guard let url=Bundle.main.url(forResource:"Configuration",withExtension:"plist"), let bytes=try? Data(contentsOf:url), let values=try? PropertyListSerialization.propertyList(from:bytes,format:nil) as? [String:String],
              let auth=values["SupabaseURL"].flatMap({ URL(string:$0) }), let key=values["SupabasePublishableKey"], !key.isEmpty,
              let apiValue=Bundle.main.object(forInfoDictionaryKey:"ClimesaAPIBaseURL") as? String, let api=URL(string:apiValue), api.host != nil else { throw ClientError.message("Falta configurar el servidor de CLIMESA.") }
        #if DEBUG
        guard api.scheme=="https" || (["localhost","127.0.0.1"].contains(api.host ?? "") && api.scheme=="http") else { throw ClientError.message("Utiliza HTTPS o el servidor local de desarrollo.") }
        #else
        guard api.scheme=="https" else { throw ClientError.message("La versión de entrega requiere un servidor HTTPS.") }
        #endif
        var config=AppConfiguration(supabase:auth,publicKey:key,api:api)
        if let web=Bundle.main.object(forInfoDictionaryKey:"ClimesaWebURL") as? String, let url=URL(string:web), url.scheme=="https", url.host != nil { config.web=web }
        return config
    }
}
actor AuthService {
    private let transport=URLSession(configuration:.ephemeral)
    private let config: AppConfiguration
    private var revision=0
    private var refreshTask: Task<AuthSession, Error>?
    init(config: AppConfiguration) { self.config=config }
    private func send(_ path: String, _ body: [String:Any], token: String?=nil) async throws -> Data {
        guard let url=URL(string:config.supabase.absoluteString+path) else { throw ClientError.message("Configuración de acceso inválida.") }
        var request=URLRequest(url:url,timeoutInterval:20); request.httpMethod="POST"
        request.setValue(config.publicKey,forHTTPHeaderField:"apikey"); request.setValue("application/json",forHTTPHeaderField:"Content-Type")
        if let token { request.setValue("Bearer \(token)",forHTTPHeaderField:"Authorization") }
        request.httpBody=try JSONSerialization.data(withJSONObject:body)
        let (data,response)=try await transport.data(for:request)
        guard let http=response as? HTTPURLResponse else { throw ClientError.message("No se pudo autenticar. Inténtalo más tarde.") }
        // error_code de Supabase (por ejemplo email_not_confirmed) en español, para que la vista ofrezca reenviar el correo.
        guard (200..<300).contains(http.statusCode) else { throw AuthErrors.failure(status:http.statusCode,data:data) }
        return data
    }
    private func parse(_ data: Data) throws -> AuthSession {
        // expires_at se calcula cuando la respuesta del proveedor incluye solo expires_in.
        var json=(try JSONSerialization.jsonObject(with:data) as? [String:Any]) ?? [:]
        if json["expires_at"]==nil { json["expires_at"]=Date().timeIntervalSince1970+(json["expires_in"] as? Double ?? 3600) }
        return try JSONDecoder().decode(AuthSession.self,from:JSONSerialization.data(withJSONObject:json))
    }
    func signIn(email: String,password: String) async throws {
        let stamp=revision
        let session=try parse(await send("/auth/v1/token?grant_type=password",["email":email.trimmingCharacters(in:.whitespacesAndNewlines),"password":password])); guard stamp==revision else { throw CancellationError() }; try KeychainStore.save(session)
    }
    func signUp(name: String,email: String,password: String) async throws -> Bool {
        let stamp=revision
        // Sin redirect_to Supabase usaría su Site URL y el enlace "Confirmar tu correo" no abriría nada.
        let data=try await send(AuthRedirects.withRedirect("/auth/v1/signup",to:AuthRedirects.confirmEmail(webURL:config.web)),["email":email.trimmingCharacters(in:.whitespacesAndNewlines),"password":password,"data":["nombre":name.trimmingCharacters(in:.whitespacesAndNewlines)]])
        guard stamp==revision else { throw CancellationError() }
        if let session=try? parse(data) { try KeychainStore.save(session); return true }; return false
    }
    /// Reenvía el correo de confirmación del registro (Supabase /auth/v1/resend, tipo signup).
    func resendSignupConfirmation(email: String) async throws {
        _ = try await send(AuthRedirects.withRedirect("/auth/v1/resend",to:AuthRedirects.confirmEmail(webURL:config.web)),["type":"signup","email":email.trimmingCharacters(in:.whitespacesAndNewlines)])
    }
    /// Correo para restablecer la contraseña; su enlace abre la página /restablecer de la web.
    func requestPasswordReset(email: String) async throws {
        _ = try await send(AuthRedirects.withRedirect("/auth/v1/recover",to:AuthRedirects.resetPassword(webURL:config.web)),["email":email.trimmingCharacters(in:.whitespacesAndNewlines)])
    }
    func session() async throws -> AuthSession? {
        if let task=refreshTask { return try await task.value }
        guard let saved=try KeychainStore.load() else { return nil }
        if saved.expires_at > Date().timeIntervalSince1970+60 { return saved }
        return try await refresh(saved)
    }
    /// Renews the session after the API rejected `rejected` with 401. If another call already renewed it, returns that
    /// newer session. Nil without a saved session; throws `AuthFailure` (400/401: the refresh token is no longer valid).
    func renewAfterRejection(_ rejected: String) async throws -> AuthSession? {
        if let task=refreshTask { return try await task.value }
        guard let saved=try KeychainStore.load() else { return nil }
        if saved.access_token != rejected { return saved }
        return try await refresh(saved)
    }
    private func refresh(_ saved: AuthSession) async throws -> AuthSession {
        let stamp=revision
        let task=Task<AuthSession,Error> { let next=try self.parse(await self.send("/auth/v1/token?grant_type=refresh_token",["refresh_token":saved.refresh_token])); guard stamp==self.revision else { throw CancellationError() }; try KeychainStore.save(next); return next }
        refreshTask=task; defer { refreshTask=nil }; return try await task.value
    }
    func signOut() async { revision+=1; refreshTask?.cancel(); refreshTask=nil; let saved=try? KeychainStore.load(); KeychainStore.clear(); if let saved { _ = try? await send("/auth/v1/logout?scope=local",[:],token:saved.access_token) } }
}
/// Cliente de la API con Bearer. Los errores son `APIFailure` (problem+json en español, Core/Contract/Problem.swift).
/// Un 401 renueva la sesión una vez; si sigue, cierra la sesión y avisa a `AccountModel` con el motivo (`SessionEnd`):
/// "Tu sesión expiró" o "Tu acceso fue retirado".
actor APIClient {
    private let transport=URLSession(configuration:.ephemeral)
    private let config: AppConfiguration; private let auth: AuthService
    private var onUnauthorized: (@Sendable (SessionEnd) async -> Void)?
    /// Última respuesta del servidor: sin respuestas recientes se asume dormido (ColdStartPolicy, MA-OPS-01).
    private var lastSuccess: Date?
    /// A call failed without an answer (network or 502-504) after the last answer: the server may be asleep.
    private var failedSinceSuccess=false
    /// Calls that waited `slowNoticeAfter` while the server seemed asleep; the notice shows while any is pending.
    private var slowCalls=Set<UUID>()
    private var pendingCalls=Set<UUID>()
    init(config: AppConfiguration,auth: AuthService) { self.config=config; self.auth=auth }
    func setUnauthorizedHandler(_ handler: @escaping @Sendable (SessionEnd) async -> Void) { onUnauthorized=handler }
    func get<T:Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        try decode(await getData(path))
    }
    /// Respuesta cruda de un GET autenticado; la usa la recuperación de eventos de tiempo real.
    /// Una lectura que falla por red o 502-504 (servidor despertando) se reintenta con espera creciente.
    func getData(_ path: String) async throws -> Data {
        var attempt=0
        while true {
            do { return try await perform(method:"GET",path:path,body:nil,idempotencyKey:nil) }
            catch let failure as APIFailure where ColdStartPolicy.shouldRetry(method:"GET",failure:failure,attempt:attempt) {
                try await Task.sleep(for:.seconds(ColdStartPolicy.delay(beforeRetry:attempt)))
                attempt+=1
            }
        }
    }
    /// Escritura con `Idempotency-Key` de la intención del usuario (`SubmissionIntent`); nunca se calcula aquí.
    func send<Body:Encodable,T:Decodable>(_ method: String, _ path: String, body: Body, key: String, as type: T.Type = T.self) async throws -> T {
        try decode(await perform(method:method,path:path,body:try JSONBody.encode(body),idempotencyKey:key))
    }
    /// D-3 deferred write: the JSON frozen at the tap goes byte for byte with the key stored with it (an exact replay).
    func sendRaw(_ method: String, _ path: String, body: Data, key: String) async throws {
        _ = try await perform(method:method,path:path,body:body,idempotencyKey:key)
    }
    /// C2: one file as multipart/form-data in `archivo` with the intent's `Idempotency-Key`. The boundary comes from the
    /// key, so a retry of the same intent sends the same bytes. `progress` receives 0...1 while the body goes out.
    func upload<T:Decodable>(_ path: String, fileName: String, mimeType: String, data: Data, key: String, as type: T.Type = T.self, progress: (@Sendable (Double) -> Void)? = nil) async throws -> T {
        let boundary="climesa-"+key.replacingOccurrences(of:"-",with:"")
        let body=LabAttachmentRules.multipartBody(boundary:boundary,fileName:fileName,mimeType:mimeType,data:data)
        return try decode(await perform(method:"POST",path:path,body:body,idempotencyKey:key,contentType:LabAttachmentRules.multipartContentType(boundary:boundary),progress:progress ?? { _ in }))
    }
    private func decode<T:Decodable>(_ data: Data) throws -> T {
        do { return try JSONDecoder().decode(T.self,from:data) } catch { throw APIFailure.invalidResponse }
    }
    /// `progress` set means an upload: the body goes through `URLSession.upload` so its bytes can be reported.
    /// A 401 renews the session once and repeats the call with the new token (same `Idempotency-Key`, same intent). A
    /// rejected refresh token ends the session as expired; a second 401 with the fresh token means the API no longer
    /// accepts the account, so it ends as revoked (`SessionEndRules`). Network errors and 403 never end the session.
    private func perform(method: String, path: String, body: Data?, idempotencyKey: String?, contentType: String="application/json", progress: (@Sendable (Double) -> Void)?=nil) async throws -> Data {
        let first=try await currentSession()
        do { return try await attempt(method:method,path:path,body:body,idempotencyKey:idempotencyKey,contentType:contentType,progress:progress,token:first.access_token) }
        catch APIFailure.sessionExpired {}
        let renewed=try await currentSession(replacing:first.access_token)
        do { return try await attempt(method:method,path:path,body:body,idempotencyKey:idempotencyKey,contentType:contentType,progress:progress,token:renewed.access_token) }
        catch APIFailure.sessionExpired {
            await expire(SessionEndRules.afterRenewedCall(status:401) ?? .expired)
            throw APIFailure.sessionExpired
        }
    }
    /// The saved session (renewed by clock), or the one renewed after the API rejected `rejected`.
    private func currentSession(replacing rejected: String?=nil) async throws -> AuthSession {
        do {
            let loaded: AuthSession?
            if let rejected { loaded=try await auth.renewAfterRejection(rejected) } else { loaded=try await auth.session() }
            guard let loaded else { await expire(.expired); throw APIFailure.sessionExpired }
            return loaded
        } catch let failure as APIFailure { throw failure }
        catch is CancellationError { throw CancellationError() }
        catch is URLError { throw APIFailure.transport }
        catch let failure as AuthFailure where SessionEndRules.afterRefreshFailure(status:failure.status) == nil {
            // Auth unavailable (5xx, 429): the refresh token may still be valid, so the session stays.
            throw APIFailure.http(status:failure.status,problem:nil)
        }
        catch { await expire(.expired); throw APIFailure.sessionExpired }
    }
    private func attempt(method: String, path: String, body: Data?, idempotencyKey: String?, contentType: String, progress: (@Sendable (Double) -> Void)?, token: String) async throws -> Data {
        guard let url=URL(string:config.api.absoluteString.trimmingCharacters(in:CharacterSet(charactersIn:"/"))+path) else { throw APIFailure.invalidResponse }
        let timeout=progress==nil ? ColdStartPolicy.timeout(path:path,lastSuccess:lastSuccess,now:Date()) : ColdStartPolicy.uploadTimeout
        var request=URLRequest(url:url,cachePolicy:.reloadIgnoringLocalCacheData,timeoutInterval:timeout)
        request.httpMethod=method
        request.setValue("Bearer \(token)",forHTTPHeaderField:"Authorization")
        request.setValue("application/json",forHTTPHeaderField:"Accept")
        if let body {
            if progress==nil { request.httpBody=body }
            request.setValue(contentType,forHTTPHeaderField:"Content-Type")
        }
        if let idempotencyKey { request.setValue(idempotencyKey,forHTTPHeaderField:"Idempotency-Key") }
        let data: Data; let response: URLResponse
        let call=UUID()
        pendingCalls.insert(call)
        let watcher=watchSlow(call,isUpload:progress != nil)
        defer { watcher.cancel(); ended(call) }
        do {
            if let body, let progress { (data,response)=try await transport.upload(for:request,from:body,delegate:UploadProgressDelegate(progress)) }
            else { (data,response)=try await transport.data(for:request) }
        }
        catch let error as URLError where error.code == .cancelled { throw CancellationError() }
        catch is CancellationError { throw CancellationError() }
        catch { failedSinceSuccess=true; throw APIFailure.transport }
        guard let http=response as? HTTPURLResponse else { throw APIFailure.transport }
        if http.statusCode < 502 || http.statusCode > 504 { lastSuccess=Date(); failedSinceSuccess=false } else { failedSinceSuccess=true }
        guard (200..<300).contains(http.statusCode) else { throw APIFailure.from(status:http.statusCode,body:data) }
        return data
    }
    /// "El servidor se está activando" (ServerWake) shows only when this one call has waited 5 s and the server seems
    /// asleep (`ColdStartPolicy.showsWakingNotice`); a warm server that is merely slow, or an upload, never shows it.
    private func watchSlow(_ call: UUID, isUpload: Bool) -> Task<Void, Never> {
        Task { [weak self] in
            try? await Task.sleep(for:.seconds(ColdStartPolicy.slowNoticeAfter))
            guard !Task.isCancelled, let self else { return }
            await self.markSlow(call,isUpload:isUpload)
        }
    }
    private func markSlow(_ call: UUID, isUpload: Bool) {
        guard pendingCalls.contains(call), ColdStartPolicy.showsWakingNotice(lastSuccess:lastSuccess,failedSinceSuccess:failedSinceSuccess,waited:ColdStartPolicy.slowNoticeAfter,isUpload:isUpload,now:Date()) else { return }
        slowCalls.insert(call)
        Task { @MainActor in ServerWake.shared.waking=true }
    }
    private func ended(_ call: UUID) {
        pendingCalls.remove(call)
        guard slowCalls.remove(call) != nil, slowCalls.isEmpty else { return }
        Task { @MainActor in ServerWake.shared.waking=false }
    }
    private func expire(_ reason: SessionEnd) async {
        await auth.signOut()
        if let onUnauthorized { await onUnauthorized(reason) }
    }
    /// Ends the session outside a call (a refused own profile, `SessionEndRules.afterProfile`) through the same path as a 401.
    func endSession(_ reason: SessionEnd) async { await expire(reason) }
}

/// Reports how much of an upload body has gone out (0...1). It holds only an immutable closure, so it is Sendable.
private final class UploadProgressDelegate: NSObject, URLSessionTaskDelegate, Sendable {
    private let report: @Sendable (Double) -> Void
    init(_ report: @escaping @Sendable (Double) -> Void) { self.report=report }
    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard totalBytesExpectedToSend>0 else { return }
        report(min(1,Double(totalBytesSent)/Double(totalBytesExpectedToSend)))
    }
}

/// Aviso global "El servidor se está activando" mientras una llamada tarda más de 5 s con el servidor dormido (MA-OPS-01).
@MainActor @Observable final class ServerWake {
    static let shared=ServerWake()
    var waking=false
}

/// Valor seguro para la parte de consulta de una URL.
enum Query {
    static func encode(_ value: String) -> String {
        var allowed=CharacterSet.urlQueryAllowed; allowed.remove(charactersIn:"&=+?#")
        return value.addingPercentEncoding(withAllowedCharacters:allowed) ?? ""
    }
}
