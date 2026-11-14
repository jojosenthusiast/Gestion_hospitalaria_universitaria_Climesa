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
    static func load() throws -> AppConfiguration {
        guard let url=Bundle.main.url(forResource:"Configuration",withExtension:"plist"), let bytes=try? Data(contentsOf:url), let values=try? PropertyListSerialization.propertyList(from:bytes,format:nil) as? [String:String],
              let auth=values["SupabaseURL"].flatMap({ URL(string:$0) }), let key=values["SupabasePublishableKey"], !key.isEmpty,
              let apiValue=Bundle.main.object(forInfoDictionaryKey:"ClimesaAPIBaseURL") as? String, let api=URL(string:apiValue), api.host != nil else { throw ClientError.message("Falta configurar el servidor de CLIMESA.") }
        #if DEBUG
        guard api.scheme=="https" || (["localhost","127.0.0.1"].contains(api.host ?? "") && api.scheme=="http") else { throw ClientError.message("Utiliza HTTPS o el servidor local de desarrollo.") }
        #else
        guard api.scheme=="https" else { throw ClientError.message("La versión de entrega requiere un servidor HTTPS.") }
        #endif
        return AppConfiguration(supabase:auth,publicKey:key,api:api)
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
        guard let http=response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw ClientError.message("No se pudo autenticar. Revisa los datos y la activación de tu cuenta, o inténtalo más tarde.") }
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
        let data=try await send("/auth/v1/signup",["email":email.trimmingCharacters(in:.whitespacesAndNewlines),"password":password,"data":["nombre":name.trimmingCharacters(in:.whitespacesAndNewlines)]])
        guard stamp==revision else { throw CancellationError() }
        if let session=try? parse(data) { try KeychainStore.save(session); return true }; return false
    }
    func session() async throws -> AuthSession? {
        if let task=refreshTask { return try await task.value }
        guard let saved=try KeychainStore.load() else { return nil }
        if saved.expires_at > Date().timeIntervalSince1970+60 { return saved }
        let stamp=revision
        let task=Task<AuthSession,Error> { let next=try self.parse(await self.send("/auth/v1/token?grant_type=refresh_token",["refresh_token":saved.refresh_token])); guard stamp==self.revision else { throw CancellationError() }; try KeychainStore.save(next); return next }
        refreshTask=task; defer { refreshTask=nil }; return try await task.value
    }
    func signOut() async { revision+=1; refreshTask?.cancel(); refreshTask=nil; let saved=try? KeychainStore.load(); KeychainStore.clear(); if let saved { _ = try? await send("/auth/v1/logout?scope=local",[:],token:saved.access_token) } }
}
/// Cliente de la API con Bearer. Los errores son `APIFailure` (problem+json en español, Core/Contract/Problem.swift).
/// Un 401 cierra la sesión y avisa a `AccountModel`, que vuelve al ingreso con "Tu sesión expiró".
actor APIClient {
    private let transport=URLSession(configuration:.ephemeral)
    private let config: AppConfiguration; private let auth: AuthService
    private var onUnauthorized: (@Sendable () async -> Void)?
    /// Última respuesta del servidor: sin respuestas recientes se asume dormido (ColdStartPolicy, MA-OPS-01).
    private var lastSuccess: Date?
    private var inFlight=0
    private var slowTimer: Task<Void, Never>?
    init(config: AppConfiguration,auth: AuthService) { self.config=config; self.auth=auth }
    func setUnauthorizedHandler(_ handler: @escaping @Sendable () async -> Void) { onUnauthorized=handler }
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
    private func decode<T:Decodable>(_ data: Data) throws -> T {
        do { return try JSONDecoder().decode(T.self,from:data) } catch { throw APIFailure.invalidResponse }
    }
    private func perform(method: String, path: String, body: Data?, idempotencyKey: String?) async throws -> Data {
        let session: AuthSession
        do {
            guard let current=try await auth.session() else { await expire(); throw APIFailure.sessionExpired }
            session=current
        } catch let failure as APIFailure { throw failure }
        catch is CancellationError { throw CancellationError() }
        catch is URLError { throw APIFailure.transport }
        catch { await expire(); throw APIFailure.sessionExpired }
        guard let url=URL(string:config.api.absoluteString.trimmingCharacters(in:CharacterSet(charactersIn:"/"))+path) else { throw APIFailure.invalidResponse }
        var request=URLRequest(url:url,cachePolicy:.reloadIgnoringLocalCacheData,timeoutInterval:ColdStartPolicy.timeout(path:path,lastSuccess:lastSuccess,now:Date()))
        request.httpMethod=method
        request.setValue("Bearer \(session.access_token)",forHTTPHeaderField:"Authorization")
        request.setValue("application/json",forHTTPHeaderField:"Accept")
        if let body { request.httpBody=body; request.setValue("application/json",forHTTPHeaderField:"Content-Type") }
        if let idempotencyKey { request.setValue(idempotencyKey,forHTTPHeaderField:"Idempotency-Key") }
        let data: Data; let response: URLResponse
        began(); defer { ended() }
        do { (data,response)=try await transport.data(for:request) }
        catch let error as URLError where error.code == .cancelled { throw CancellationError() }
        catch is CancellationError { throw CancellationError() }
        catch { throw APIFailure.transport }
        guard let http=response as? HTTPURLResponse else { throw APIFailure.transport }
        if http.statusCode < 502 || http.statusCode > 504 { lastSuccess=Date() }
        guard (200..<300).contains(http.statusCode) else {
            let failure=APIFailure.from(status:http.statusCode,body:data)
            if failure == .sessionExpired { await expire() }
            throw failure
        }
        return data
    }
    /// A los 5 s sin respuesta la app muestra "El servidor se está activando" (ServerWake); se quita al responder.
    private func began() {
        inFlight+=1
        guard slowTimer == nil else { return }
        slowTimer=Task {
            try? await Task.sleep(for:.seconds(ColdStartPolicy.slowNoticeAfter))
            guard !Task.isCancelled else { return }
            await MainActor.run { ServerWake.shared.waking=true }
        }
    }
    private func ended() {
        inFlight=max(0,inFlight-1)
        guard inFlight==0 else { return }
        slowTimer?.cancel(); slowTimer=nil
        Task { @MainActor in ServerWake.shared.waking=false }
    }
    private func expire() async {
        await auth.signOut()
        if let onUnauthorized { await onUnauthorized() }
    }
}

/// Aviso global "El servidor se está activando" mientras una llamada tarda más de 5 s (MA-OPS-01).
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
