import SwiftUI
import UIKit

/// Textos de la interfaz: viven en Resources/Localizable.xcstrings (español como idioma base).
enum L {
    /// Para claves que se arman en tiempo de ejecución (en las vistas basta con `Text("clave")`).
    static func text(_ key: String) -> String { NSLocalizedString(key, comment: "") }
}
enum Brand {
    // Alias de los tokens de DesignSystem/Theme.swift (paleta de web): las pantallas sin migrar heredan la paleta.
    static let blue=Theme.primary
    static let ink=Theme.ink
    static let paper=Theme.bg
    static let lime=Theme.accent
    static func body(_ size:CGFloat=16)->Font { .custom("DMSans-Regular",size:size,relativeTo:.body) }
    static func bold(_ size:CGFloat)->Font { .custom("DMSans-Bold",size:size,relativeTo:.title) }
    static func mono(_ size:CGFloat=11)->Font { .custom("IBMPlexMono-Regular",size:size,relativeTo:.caption) }
}
struct BrandHeader:View {
    var body:some View { HStack(spacing:12) { Text(verbatim:"+").font(.system(size:27,weight:.bold)).frame(width:38,height:38).background(Brand.lime).foregroundStyle(Brand.ink); VStack(alignment:.leading,spacing:2) { Text(verbatim:"climesa").font(Brand.bold(26)); Text("brand.tagline").font(Brand.body(10)) }; Spacer() }.padding(22).foregroundStyle(.white).background(Brand.ink) }
}
struct PrimaryButton:View {
    let title:LocalizedStringKey; var busy=false; let action:()->Void
    var body:some View { Button(action:action) { HStack { if busy { ProgressView().tint(.white) }; Text(title).font(Brand.body()).frame(maxWidth:.infinity) }.padding(17).foregroundStyle(.white).background(Brand.blue) }.disabled(busy).opacity(busy ? 0.65:1) }
}
/// Aviso con texto ya resuelto (mensajes de error o de estado). Para textos fijos usa `L.text("clave")`.
struct Notice:View { let text:String; var failure=false; var body:some View { Text(verbatim:text).font(Brand.body(14)).frame(maxWidth:.infinity,alignment:.leading).padding(16).background(failure ? Color.red.opacity(0.07):Brand.lime.opacity(0.4)).foregroundStyle(failure ? Color.red:Brand.ink).accessibilityAddTraits(.isStaticText) } }
struct RootView:View {
    @EnvironmentObject private var account:AccountModel
    var body:some View {
        Group {
            // La ruta la decide SessionRouter (Core, probada): el ingreso no cambia de pantalla hasta tener el perfil de /auth/me.
            switch SessionRouter.route(loading:account.loading,hasProfile:account.profile != nil,needsRetry:account.pending) {
            case .verifying: VStack(spacing:22) { BrandHeader(); Spacer(); ProgressView("root.verifying"); Spacer() }.background(Brand.paper)
            case .workspace: if let profile=account.profile { WorkspaceView(profile:profile).id(profile.id) }
            case .retry: VStack(alignment:.leading,spacing:24) { BrandHeader(); VStack(alignment:.leading,spacing:24) { Text("root.title").font(Brand.bold(42)); Notice(text:account.error ?? L.text("root.fallback_error"),failure:true); PrimaryButton(title:"common.retry",busy:account.loading) { Task { await account.restore() } }; Button("common.logout") { Task { await account.logout() } } }.padding(24); Spacer() }.background(Brand.paper)
            case .login: AuthView()
            }
        }.font(Brand.body()).foregroundStyle(Brand.ink)
    }
}
struct AuthView:View {
    @EnvironmentObject private var account:AccountModel
    @State private var registering=false
    // El correo sobrevive a segundo plano con SceneStorage; la contraseña solo en memoria (account.draft), nunca en disco.
    @SceneStorage("auth.email") private var email=""
    @State private var name=""; @State private var password=""; @State private var confirmation=""
    // TEMPORARY testing aid (docs/operacion/login-de-prueba.md): empty unless the build was made with CLIMESA_DEMO_LOGIN = YES.
    private let demoAccounts = DemoLogin.accounts(info: Bundle.main.infoDictionary)
    @State private var demoRole:String?
    @State private var resetting=false
    var body:some View {
        if let confirmation=account.confirmationEmail { CheckEmailView(email:confirmation) }
        else if resetting { PasswordResetView(email:$email) { resetting=false; account.clearEmailFlow() } }
        else { form }
    }
    private var form:some View {
        ScrollView {
            BrandHeader()
            VStack(alignment:.leading,spacing:24) {
                Text(LocalizedStringKey(registering ? "auth.eyebrow.register":"auth.eyebrow.login")).font(Brand.mono()).foregroundStyle(Brand.blue)
                Text(LocalizedStringKey(registering ? "auth.headline.register":"auth.headline.login")).font(Brand.bold(43)).fixedSize(horizontal:false,vertical:true)
                Text(LocalizedStringKey(registering ? "auth.sub.register":"auth.sub.login")).font(Brand.body()).foregroundStyle(.secondary)
                if let error=account.error { Notice(text:error,failure:true) }
                if let notice=account.notice { Notice(text:notice) }
                if !registering, let unconfirmed=account.unconfirmedEmail { ResendConfirmationButton(email:unconfirmed) }
                if !registering && !demoAccounts.isEmpty {
                    Notice(text:L.text("auth.demo.banner"))
                    Menu {
                        ForEach(demoAccounts,id:\.role) { demo in Button(demo.role) { demoRole=demo.role; email=demo.email; password=demo.password } }
                    } label: {
                        HStack { Text("auth.demo.selector").font(Brand.body(13)); Spacer(); Text(verbatim:demoRole ?? L.text("auth.demo.choose")).font(Brand.body(14)); Image(systemName:"chevron.down") }.padding(16).background(.white)
                    }.accessibilityLabel(Text("auth.demo.selector"))
                }
                VStack(spacing:20) {
                    if registering { field("auth.name",value:$name,type:.name) }
                    VStack(alignment:.leading,spacing:10) { Text("auth.email").font(Brand.body(13)); TextField("auth.email.placeholder",text:$email).keyboardType(.emailAddress).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled(); Divider() }
                    VStack(alignment:.leading,spacing:10) { Text("auth.password").font(Brand.body(13)); SecureField("auth.password.placeholder",text:$password).textContentType(registering ? .newPassword:.password); Divider() }
                    if registering { VStack(alignment:.leading,spacing:10) { Text("auth.confirm").font(Brand.body(13)); SecureField("auth.confirm.placeholder",text:$confirmation).textContentType(.newPassword); Divider() }; Text("auth.password.hint").font(Brand.body(12)).foregroundStyle(.secondary) }
                }.padding(22).background(.white)
                PrimaryButton(title:LocalizedStringKey(registering ? "auth.submit.register":"auth.submit.login"),busy:account.busy) { Task { if registering { await account.register(name:name,email:email,password:password,confirmation:confirmation); if account.confirmationEmail != nil { password=""; confirmation=""; registering=false } } else { await account.signIn(email:email,password:password) } } }.disabled(email.isEmpty || password.isEmpty || account.auth==nil)
                if !registering { Button("auth.forgot") { account.clearEmailFlow(); resetting=true }.font(Brand.body(14)) }
                Button(LocalizedStringKey(registering ? "auth.switch.register":"auth.switch.login")) { registering.toggle(); account.error=nil; account.notice=nil; password=""; confirmation="" }.font(Brand.body(14))
                Divider(); Text("auth.footer").font(Brand.body(12)).foregroundStyle(.secondary)
            }.padding(24).frame(maxWidth:560,alignment:.leading).frame(maxWidth:.infinity)
        }.background(Brand.paper).scrollDismissesKeyboard(.interactively).disabled(account.busy)
            .onAppear { name=account.draft.name; password=account.draft.password; confirmation=account.draft.confirmation }
            .onChange(of:name) { _,value in account.draft.name=value }
            .onChange(of:password) { _,value in account.draft.password=value }
            .onChange(of:confirmation) { _,value in account.draft.confirmation=value }
    }
    func field(_ label:LocalizedStringKey,value:Binding<String>,type:UITextContentType)->some View { VStack(alignment:.leading,spacing:10) { Text(label).font(Brand.body(13)); TextField(label,text:value).textContentType(type); Divider() } }
}
/// Reenvía el correo de confirmación con cuenta regresiva (reloj solo de interfaz, no refresca datos).
struct ResendConfirmationButton:View {
    @EnvironmentObject private var account:AccountModel
    let email:String
    var body:some View {
        TimelineView(.periodic(from:.now,by:1)) { context in
            let seconds=ResendCooldown.remainingSeconds(until:account.resendAvailableAt,now:context.date)
            Button { Task { await account.resendConfirmation(email:email) } } label: {
                HStack(spacing:10) {
                    if account.sendingEmail { ProgressView() } else { Image(systemName:"envelope") }
                    if account.sendingEmail { Text("auth.resend.sending") } else if seconds>0 { Text(verbatim:"Reenviar correo en \(seconds) s") } else { Text("auth.resend") }
                }.font(Brand.body(15)).frame(maxWidth:.infinity).padding(15).foregroundStyle(Brand.blue).overlay(Rectangle().stroke(Brand.blue,lineWidth:1))
            }.disabled(account.sendingEmail || seconds>0).opacity(account.sendingEmail || seconds>0 ? 0.6:1)
        }
    }
}
/// Tras registrarse: la cuenta existe, pero Supabase espera el enlace del correo antes de permitir el ingreso.
struct CheckEmailView:View {
    @EnvironmentObject private var account:AccountModel
    let email:String
    var body:some View {
        ScrollView {
            BrandHeader()
            VStack(alignment:.leading,spacing:20) {
                Image(systemName:"envelope.badge").font(.system(size:40)).foregroundStyle(Brand.blue).accessibilityHidden(true)
                Text("auth.check.headline").font(Brand.bold(38)).fixedSize(horizontal:false,vertical:true)
                Text("auth.check.sent").font(Brand.body())
                Text(verbatim:email).font(Brand.bold(18)).textSelection(.enabled)
                Text("auth.check.body").font(Brand.body(15)).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true)
                if let error=account.error { Notice(text:error,failure:true) }
                if let notice=account.notice { Notice(text:notice) }
                ResendConfirmationButton(email:email)
                PrimaryButton(title:"auth.check.done") { account.finishConfirmation() }
            }.padding(24).frame(maxWidth:560,alignment:.leading).frame(maxWidth:.infinity)
        }.background(Brand.paper)
    }
}
/// "¿Olvidaste tu contraseña?": pide el correo; el enlace abre la página de la web que crea la contraseña nueva.
struct PasswordResetView:View {
    @EnvironmentObject private var account:AccountModel
    @Binding var email:String
    let back:()->Void
    var body:some View {
        ScrollView {
            BrandHeader()
            VStack(alignment:.leading,spacing:22) {
                Text("auth.reset.headline").font(Brand.bold(38)).fixedSize(horizontal:false,vertical:true)
                Text("auth.reset.sub").font(Brand.body()).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true)
                if let error=account.error { Notice(text:error,failure:true) }
                if let notice=account.notice { Notice(text:notice) }
                VStack(alignment:.leading,spacing:10) { Text("auth.email").font(Brand.body(13)); TextField("auth.email.placeholder",text:$email).keyboardType(.emailAddress).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled(); Divider() }.padding(22).background(.white)
                PrimaryButton(title:"auth.reset.submit",busy:account.sendingEmail) { Task { await account.requestPasswordReset(email:email) } }.disabled(email.isEmpty)
                Button("auth.reset.back",action:back).font(Brand.body(14))
            }.padding(24).frame(maxWidth:560,alignment:.leading).frame(maxWidth:.infinity)
        }.background(Brand.paper).scrollDismissesKeyboard(.interactively)
    }
}
