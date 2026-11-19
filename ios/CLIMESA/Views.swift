import SwiftUI
import UIKit

/// Textos de la interfaz: viven en Resources/Localizable.xcstrings (español como idioma base).
enum L {
    /// Para claves que se arman en tiempo de ejecución (en las vistas basta con `Text("clave")`).
    static func text(_ key: String) -> String { NSLocalizedString(key, comment: "") }
}

/// Marca de las pantallas de acceso: barra azul marino (`Theme.navy`, oscura en ambos modos) con texto `onPrimary`.
struct BrandHeader:View {
    var body:some View {
        HStack(spacing:Spacing.m) {
            Image(systemName:"plus").font(Typo.subheading).foregroundStyle(Theme.navy)
                .frame(width:32,height:32).background(Theme.accent,in:RoundedRectangle(cornerRadius:Radius.control)).accessibilityHidden(true)
            VStack(alignment:.leading,spacing:2) {
                Text(verbatim:"climesa").font(Typo.heading)
                Text("brand.tagline").font(Typo.caption).opacity(0.8)
            }
            Spacer()
        }
        .foregroundStyle(Theme.onPrimary)
        .padding(.horizontal,Spacing.l).padding(.vertical,Spacing.m)
        .background(Theme.navy)
        .accessibilityElement(children:.combine)
    }
}

/// Aviso con texto ya resuelto (mensajes de error o de estado). Mismo componente que el resto de la app (`PatientNotice`).
struct Notice:View {
    let text:String
    var failure=false
    var body:some View { PatientNotice(text:text,failure:failure) }
}

/// Campo de las pantallas de acceso con el mismo marco que `FormField` y los ajustes de teclado de cada dato.
private struct AuthField:View {
    let label:LocalizedStringKey
    let placeholder:LocalizedStringKey
    @Binding var text:String
    var secure=false
    var content:UITextContentType?
    var keyboard:UIKeyboardType = .default
    private var plain:Bool { secure || keyboard == .emailAddress }
    var body:some View {
        VStack(alignment:.leading,spacing:Spacing.s) {
            Text(label).font(Typo.label).foregroundStyle(Theme.ink)
            Group {
                if secure { SecureField(placeholder,text:$text) }
                else { TextField(placeholder,text:$text).keyboardType(keyboard) }
            }
            .textContentType(content)
            .textInputAutocapitalization(plain ? TextInputAutocapitalization.never : TextInputAutocapitalization.words)
            .autocorrectionDisabled(plain)
            .font(Typo.body).foregroundStyle(Theme.ink)
            .padding(.horizontal,Spacing.m).frame(minHeight:Spacing.control)
            .background(Theme.surface,in:RoundedRectangle(cornerRadius:Radius.control))
            .overlay(RoundedRectangle(cornerRadius:Radius.control).stroke(Theme.controlLine,lineWidth:1))
        }
    }
}

/// Botón de texto de las pantallas de acceso: alto táctil de 44 pt como mínimo (HIG).
private struct TextLinkButton:View {
    let title:LocalizedStringKey
    let action:()->Void
    var body:some View {
        Button(action:action) { Text(title).font(Typo.body).frame(minHeight:44,alignment:.leading).contentShape(Rectangle()) }
            .foregroundStyle(Theme.primaryText)
    }
}

/// Armazón mientras se valida la sesión guardada: misma barra que las pestañas y esqueletos (S3).
/// Owner obs. 1: the static skeletons alone looked frozen, so a moving `ProgressView` says the check is running. The
/// system indicator keeps turning with Reduce Motion on, which is what a waiting person needs to see.
struct LaunchShellView:View {
    var body:some View {
        VStack(spacing:0) {
            Theme.navy.frame(height:44).frame(maxWidth:.infinity).background(Theme.navy.ignoresSafeArea(edges:.top))
            ScrollView {
                VStack(alignment:.leading,spacing:Spacing.space6) {
                    HStack(spacing:Spacing.space3) {
                        ProgressView().tint(Theme.primaryText)
                        Text("root.verifying").font(Typo.small).foregroundStyle(Theme.muted)
                    }
                    .accessibilityElement(children:.combine)
                    Skeleton(rows:2)
                    Skeleton(rows:4)
                }.padding(Spacing.space6).frame(maxWidth:760,alignment:.leading).frame(maxWidth:.infinity)
            }
        }
        .background(Theme.bg)
    }
}

struct RootView:View {
    @EnvironmentObject private var account:AccountModel
    var body:some View {
        Group {
            // La ruta la decide SessionRouter (Core, probada): el ingreso no cambia de pantalla hasta tener el perfil de /auth/me.
            switch SessionRouter.route(loading:account.loading,hasProfile:account.profile != nil,needsRetry:account.pending) {
            case .verifying:
                // Al cerrar sesión (busy) no se dibuja el armazón de trabajo; al abrir con sesión guardada sí (S3).
                if account.busy { Theme.bg.ignoresSafeArea() } else { LaunchShellView() }
            case .workspace: if let profile=account.profile { WorkspaceView(profile:profile).id(profile.id) }
            case .retry:
                VStack(alignment:.leading,spacing:0) {
                    BrandHeader()
                    VStack(alignment:.leading,spacing:Spacing.space4) {
                        Text("root.title").font(Typo.heading).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader)
                        Notice(text:account.error ?? L.text("root.fallback_error"),failure:true)
                        ClimesaButton(title:L.text("common.retry"),loading:account.loading) { Task { await account.restore() } }
                        ClimesaButton(title:L.text("common.logout"),kind:.secondary) { Task { await account.logout() } }
                    }.padding(Spacing.space6).frame(maxWidth:560,alignment:.leading).frame(maxWidth:.infinity)
                    Spacer()
                }.background(Theme.bg)
            case .login: AuthView()
            }
        }.font(Typo.body).foregroundStyle(Theme.ink)
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
            VStack(alignment:.leading,spacing:Spacing.space5) {
                // S1: título de 20 pt, sin antetítulo numerado ni subtítulo.
                Text(LocalizedStringKey(registering ? "auth.headline.register":"auth.headline.login")).font(Typo.heading).foregroundStyle(Theme.ink)
                    .fixedSize(horizontal:false,vertical:true).accessibilityAddTraits(.isHeader)
                if let error=account.error { Notice(text:error,failure:true) }
                if let notice=account.notice { Notice(text:notice) }
                if !registering, let unconfirmed=account.unconfirmedEmail { ResendConfirmationButton(email:unconfirmed) }
                if !registering && !demoAccounts.isEmpty {
                    Notice(text:L.text("auth.demo.banner"))
                    Menu {
                        ForEach(demoAccounts,id:\.role) { demo in Button(demo.role) { demoRole=demo.role; email=demo.email; password=demo.password } }
                    } label: {
                        HStack {
                            Text("auth.demo.selector").font(Typo.label).foregroundStyle(Theme.ink)
                            Spacer()
                            Text(verbatim:demoRole ?? L.text("auth.demo.choose")).font(Typo.body).foregroundStyle(Theme.ink)
                            Image(systemName:"chevron.down").foregroundStyle(Theme.muted).accessibilityHidden(true)
                        }
                        .padding(.horizontal,Spacing.m).frame(minHeight:Spacing.control)
                        .background(Theme.surface,in:RoundedRectangle(cornerRadius:Radius.control))
                        .overlay(RoundedRectangle(cornerRadius:Radius.control).stroke(Theme.controlLine,lineWidth:1))
                    }.accessibilityLabel(Text("auth.demo.selector"))
                }
                VStack(alignment:.leading,spacing:Spacing.space4) {
                    if registering { AuthField(label:"auth.name",placeholder:"auth.name",text:$name,content:.name) }
                    AuthField(label:"auth.email",placeholder:"auth.email.placeholder",text:$email,content:.username,keyboard:.emailAddress)
                    AuthField(label:"auth.password",placeholder:"auth.password.placeholder",text:$password,secure:true,content:registering ? .newPassword:.password)
                    if registering {
                        AuthField(label:"auth.confirm",placeholder:"auth.confirm.placeholder",text:$confirmation,secure:true,content:.newPassword)
                        Text("auth.password.hint").font(Typo.small).foregroundStyle(Theme.muted)
                    }
                }
                ClimesaButton(title:L.text(registering ? "auth.submit.register":"auth.submit.login"),loading:account.busy) {
                    Task {
                        if registering {
                            await account.register(name:name,email:email,password:password,confirmation:confirmation)
                            if account.confirmationEmail != nil { password=""; confirmation=""; registering=false }
                        } else { await account.signIn(email:email,password:password) }
                    }
                }.disabled(email.isEmpty || password.isEmpty || account.auth==nil)
                VStack(alignment:.leading,spacing:0) {
                    if !registering { TextLinkButton(title:"auth.forgot") { account.clearEmailFlow(); resetting=true } }
                    TextLinkButton(title:LocalizedStringKey(registering ? "auth.switch.register":"auth.switch.login")) { registering.toggle(); account.error=nil; account.notice=nil; password=""; confirmation="" }
                }
                Text("auth.footer").font(Typo.small).foregroundStyle(Theme.muted)
            }.padding(Spacing.space6).frame(maxWidth:560,alignment:.leading).frame(maxWidth:.infinity)
        }.background(Theme.bg).scrollDismissesKeyboard(.interactively).disabled(account.busy)
            .onAppear { name=account.draft.name; password=account.draft.password; confirmation=account.draft.confirmation }
            .onChange(of:name) { _,value in account.draft.name=value }
            .onChange(of:password) { _,value in account.draft.password=value }
            .onChange(of:confirmation) { _,value in account.draft.confirmation=value }
    }
}
/// Reenvía el correo de confirmación con cuenta regresiva (reloj solo de interfaz, no refresca datos).
struct ResendConfirmationButton:View {
    @EnvironmentObject private var account:AccountModel
    let email:String
    var body:some View {
        TimelineView(.periodic(from:.now,by:1)) { context in
            let seconds=ResendCooldown.remainingSeconds(until:account.resendAvailableAt,now:context.date)
            Button { Task { await account.resendConfirmation(email:email) } } label: {
                HStack(spacing:Spacing.s) {
                    if !account.sendingEmail { Image(systemName:"envelope").accessibilityHidden(true) }
                    if account.sendingEmail { Text("auth.resend.sending") }
                    else if seconds>0 { Text(verbatim:String(format:L.text("auth.resend.wait"),seconds)) }
                    else { Text("auth.resend") }
                }
            }
            .buttonStyle(ClimesaButtonStyle(kind:.secondary,loading:account.sendingEmail))
            .disabled(account.sendingEmail || seconds>0)
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
            VStack(alignment:.leading,spacing:Spacing.space4) {
                Label { Text("auth.check.headline").font(Typo.heading).foregroundStyle(Theme.ink) } icon: { Image(systemName:"envelope.badge").foregroundStyle(Theme.primaryText) }
                    .accessibilityAddTraits(.isHeader)
                Text("auth.check.sent").font(Typo.body).foregroundStyle(Theme.ink)
                Text(verbatim:email).font(Typo.subheading).foregroundStyle(Theme.ink).textSelection(.enabled)
                Text("auth.check.body").font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal:false,vertical:true)
                if let error=account.error { Notice(text:error,failure:true) }
                if let notice=account.notice { Notice(text:notice) }
                ResendConfirmationButton(email:email)
                ClimesaButton(title:L.text("auth.check.done")) { account.finishConfirmation() }
            }.padding(Spacing.space6).frame(maxWidth:560,alignment:.leading).frame(maxWidth:.infinity)
        }.background(Theme.bg)
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
            VStack(alignment:.leading,spacing:Spacing.space4) {
                Text("auth.reset.headline").font(Typo.heading).foregroundStyle(Theme.ink).fixedSize(horizontal:false,vertical:true).accessibilityAddTraits(.isHeader)
                // Instrucción necesaria: el enlace llega por correo.
                Text("auth.reset.sub").font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal:false,vertical:true)
                if let error=account.error { Notice(text:error,failure:true) }
                if let notice=account.notice { Notice(text:notice) }
                AuthField(label:"auth.email",placeholder:"auth.email.placeholder",text:$email,content:.username,keyboard:.emailAddress)
                ClimesaButton(title:L.text("auth.reset.submit"),loading:account.sendingEmail) { Task { await account.requestPasswordReset(email:email) } }.disabled(email.isEmpty)
                TextLinkButton(title:"auth.reset.back",action:back)
            }.padding(Spacing.space6).frame(maxWidth:560,alignment:.leading).frame(maxWidth:.infinity)
        }.background(Theme.bg).scrollDismissesKeyboard(.interactively)
    }
}
