import Foundation
import SwiftUI
@MainActor final class AccountModel: ObservableObject {
    @Published var loading=true
    @Published var busy=false
    @Published var profile:AccessProfile?
    @Published var error:String?
    @Published var notice:String?
    @Published var pending=false
    @Published var role="MED"
    private var revision=0
    let auth:AuthService?
    let api:APIClient?
    private let config:AppConfiguration?
    init() {
        do { let config=try AppConfiguration.load(); let auth=AuthService(config:config); self.config=config; self.auth=auth; self.api=APIClient(config:config,auth:auth) }
        catch { config=nil; auth=nil; api=nil; self.error=error.localizedDescription; loading=false }
    }
    /// Servicio de tiempo real con el token vigente de la sesión y la recuperación por /eventos tras una caída.
    func makeRealtime() -> (any RealtimeService)? {
        guard let config, let auth, let api else { return nil }
        let url=RealtimeProtocol.websocketURL(supabaseURL:config.supabase.absoluteString,publishableKey:config.publicKey)
        return SupabaseRealtimeService(
            websocketURL:url,
            accessToken:{ (try? await auth.session())?.access_token },
            catchUp:{ cursor in
                let data=try await api.getData(RealtimeProtocol.catchUpPath(after:cursor))
                guard let recovered=RealtimeProtocol.parseCatchUp(data:data) else { throw ClientError.message("No se pudo recuperar lo ocurrido sin conexión.") }
                return recovered
            },
            sockets:URLSessionRealtimeSocketFactory()
        )
    }
    /// Vuelve a verificar roles y permisos sin pasar por la pantalla de carga (la usa el tiempo real).
    func refreshProfile() async {
        guard profile != nil, !busy else { return }
        try? await verify()
    }
    func restore() async {
        guard !busy, let auth else { return }; let stamp=revision; loading=true
        do {
            guard try await auth.session() != nil else { profile=nil; pending=false; loading=false; return }
            try await verify()
        } catch { guard stamp==revision else { return }; self.error=error.localizedDescription; pending=true; profile=nil }
        if stamp==revision { loading=false }
    }
    private func verify() async throws {
        guard let api else { throw ClientError.message("Falta configurar el servidor.") }
        let stamp=revision
        let verified=try await api.get("/auth/me",as:AccessProfile.self)
        guard stamp==revision else { throw CancellationError() }
        // Un rol sin iOS (por ejemplo Recepción) no es un error: la pantalla muestra "Tu rol no usa esta aplicación".
        profile=verified; if let first=verified.allowedIOSRoles.first { role=verified.allowedIOSRoles.contains(role) ? role : first }; pending=false; error=nil; notice=nil
    }
    func signIn(email:String,password:String) async {
        guard !busy, let auth else { return }; let stamp=revision; busy=true; error=nil
        do { try await auth.signIn(email:email,password:password); guard stamp==revision else { return }; pending=true; try await verify() }
        catch { guard stamp==revision else { return }; self.error=error.localizedDescription }
        if stamp==revision { busy=false }
    }
    func register(name:String,email:String,password:String,confirmation:String) async {
        let errors=RegistrationRules.errors(name:name,email:email,password:password,confirmation:confirmation)
        guard errors.isEmpty else { error=errors.joined(separator:" "); return }
        guard !busy, let auth else { return }; let stamp=revision; busy=true; error=nil
        do {
            let signedIn=try await auth.signUp(name:name,email:email,password:password)
            guard stamp==revision else { return }
            if signedIn { pending=true; try await verify() }
            else { notice="Revisa tu correo para confirmar tu cuenta. Después podrás ingresar." }
        } catch { guard stamp==revision else { return }; self.error=error.localizedDescription }
        if stamp==revision { busy=false }
    }
    func logout() async { revision+=1; busy=true; loading=true; profile=nil; pending=false; notice=nil; error=nil; await auth?.signOut(); busy=false; loading=false }
}
struct Shift:Decodable,Identifiable {
    let id:String; let area:String; let start:String; let end:String; let state:String
    static func display(_ value:String)->String {
        let iso=ISO8601DateFormatter(); iso.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
        let date=iso.date(from:value) ?? ISO8601DateFormatter().date(from:value)
        guard let date else { return L.text("shift.unavailable") }; let formatter=DateFormatter(); formatter.locale=Locale(identifier:"es_SV"); formatter.timeZone=TimeZone(identifier:"America/El_Salvador"); formatter.dateStyle = .medium; formatter.timeStyle = .short; return formatter.string(from:date)
    }
}
@MainActor final class ShiftModel:ObservableObject {
    @Published var shifts:[Shift]=[]; @Published var loading=false; @Published var error:String?
    func load(api:APIClient?) async { guard let api else { return }; loading=true; error=nil; do { shifts=try await api.get("/turnos/mios",as:[Shift].self) } catch { self.error=error.localizedDescription }; loading=false }
}
