import SwiftUI
import UIKit

/// Textos de la interfaz: viven en Resources/Localizable.xcstrings (español como idioma base).
enum L {
    /// Para claves que se arman en tiempo de ejecución (en las vistas basta con `Text("clave")`).
    static func text(_ key: String) -> String { NSLocalizedString(key, comment: "") }
}
enum Brand {
    static let blue=Color(red:46/255,green:73/255,blue:230/255)
    static let ink=Color(red:23/255,green:27/255,blue:45/255)
    static let paper=Color(red:246/255,green:245/255,blue:241/255)
    static let lime=Color(red:220/255,green:237/255,blue:131/255)
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
            if account.loading { VStack(spacing:22) { BrandHeader(); Spacer(); ProgressView("root.verifying"); Spacer() }.background(Brand.paper) }
            else if let profile=account.profile { WorkspaceView(profile:profile).id(profile.id) }
            else if account.pending { VStack(alignment:.leading,spacing:24) { BrandHeader(); VStack(alignment:.leading,spacing:24) { Text("root.title").font(Brand.bold(42)); Notice(text:account.error ?? L.text("root.fallback_error"),failure:true); PrimaryButton(title:"common.retry",busy:account.loading) { Task { await account.restore() } }; Button("common.logout") { Task { await account.logout() } } }.padding(24); Spacer() }.background(Brand.paper) }
            else { AuthView() }
        }.font(Brand.body()).foregroundStyle(Brand.ink)
    }
}
struct AuthView:View {
    @EnvironmentObject private var account:AccountModel
    @State private var registering=false
    @State private var name=""; @State private var email=""; @State private var password=""; @State private var confirmation=""
    var body:some View {
        ScrollView {
            BrandHeader()
            VStack(alignment:.leading,spacing:24) {
                Text(LocalizedStringKey(registering ? "auth.eyebrow.register":"auth.eyebrow.login")).font(Brand.mono()).foregroundStyle(Brand.blue)
                Text(LocalizedStringKey(registering ? "auth.headline.register":"auth.headline.login")).font(Brand.bold(43)).fixedSize(horizontal:false,vertical:true)
                Text(LocalizedStringKey(registering ? "auth.sub.register":"auth.sub.login")).font(Brand.body()).foregroundStyle(.secondary)
                if let error=account.error { Notice(text:error,failure:true) }
                if let notice=account.notice { Notice(text:notice) }
                VStack(spacing:20) {
                    if registering { field("auth.name",value:$name,type:.name) }
                    VStack(alignment:.leading,spacing:10) { Text("auth.email").font(Brand.body(13)); TextField("auth.email.placeholder",text:$email).keyboardType(.emailAddress).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled(); Divider() }
                    VStack(alignment:.leading,spacing:10) { Text("auth.password").font(Brand.body(13)); SecureField("auth.password.placeholder",text:$password).textContentType(registering ? .newPassword:.password); Divider() }
                    if registering { VStack(alignment:.leading,spacing:10) { Text("auth.confirm").font(Brand.body(13)); SecureField("auth.confirm.placeholder",text:$confirmation).textContentType(.newPassword); Divider() }; Text("auth.password.hint").font(Brand.body(12)).foregroundStyle(.secondary) }
                }.padding(22).background(.white)
                PrimaryButton(title:LocalizedStringKey(registering ? "auth.submit.register":"auth.submit.login"),busy:account.busy) { Task { if registering { await account.register(name:name,email:email,password:password,confirmation:confirmation); if account.notice != nil { password=""; confirmation=""; registering=false } } else { await account.signIn(email:email,password:password) } } }.disabled(email.isEmpty || password.isEmpty || account.auth==nil)
                Button(LocalizedStringKey(registering ? "auth.switch.register":"auth.switch.login")) { registering.toggle(); account.error=nil; account.notice=nil; password=""; confirmation="" }.font(Brand.body(14))
                Divider(); Text("auth.footer").font(Brand.body(12)).foregroundStyle(.secondary)
            }.padding(24).frame(maxWidth:560,alignment:.leading).frame(maxWidth:.infinity)
        }.background(Brand.paper).scrollDismissesKeyboard(.interactively).disabled(account.busy)
    }
    func field(_ label:LocalizedStringKey,value:Binding<String>,type:UITextContentType)->some View { VStack(alignment:.leading,spacing:10) { Text(label).font(Brand.body(13)); TextField(label,text:value).textContentType(type); Divider() } }
}
