import SwiftUI
import UIKit
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
    var body:some View { HStack(spacing:12) { Text("+").font(.system(size:27,weight:.bold)).frame(width:38,height:38).background(Brand.lime).foregroundStyle(Brand.ink); VStack(alignment:.leading,spacing:2) { Text("climesa").font(Brand.bold(26)); Text("Hospital universitario").font(Brand.body(10)) }; Spacer() }.padding(22).foregroundStyle(.white).background(Brand.ink) }
}
struct PrimaryButton:View {
    let title:String; var busy=false; let action:()->Void
    var body:some View { Button(action:action) { HStack { if busy { ProgressView().tint(.white) }; Text(title).font(Brand.body()).frame(maxWidth:.infinity) }.padding(17).foregroundStyle(.white).background(Brand.blue) }.disabled(busy).opacity(busy ? 0.65:1) }
}
struct Notice:View { let text:String; var failure=false; var body:some View { Text(text).font(Brand.body(14)).frame(maxWidth:.infinity,alignment:.leading).padding(16).background(failure ? Color.red.opacity(0.07):Brand.lime.opacity(0.4)).foregroundStyle(failure ? Color.red:Brand.ink).accessibilityAddTraits(.isStaticText) } }
struct RootView:View {
    @EnvironmentObject private var account:AccountModel
    var body:some View {
        Group {
            if account.loading { VStack(spacing:22) { BrandHeader(); Spacer(); ProgressView("Verificando tu acceso…"); Spacer() }.background(Brand.paper) }
            else if let profile=account.profile { WorkspaceView(profile:profile).id(profile.id) }
            else if account.pending { VStack(alignment:.leading,spacing:24) { BrandHeader(); VStack(alignment:.leading,spacing:24) { Text("Tu acceso.").font(Brand.bold(42)); Notice(text:account.error ?? "No se pudo verificar tu acceso. Vuelve a intentar.",failure:true); PrimaryButton(title:"Volver a intentar",busy:account.loading) { Task { await account.restore() } }; Button("Cerrar sesión") { Task { await account.logout() } } }.padding(24); Spacer() }.background(Brand.paper) }
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
                Text(registering ? "CUENTA DE PACIENTE / 01":"ACCESO PERSONAL / 01").font(Brand.mono()).foregroundStyle(Brand.blue)
                Text(registering ? "Tu salud,\nmás cerca.":"Buen día.\nTu jornada\ncomienza aquí.").font(Brand.bold(43)).fixedSize(horizontal:false,vertical:true)
                Text(registering ? "Crea tu cuenta para acceder a tus servicios.":"Ingresa con tu cuenta del hospital.").font(Brand.body()).foregroundStyle(.secondary)
                if let error=account.error { Notice(text:error,failure:true) }
                if let notice=account.notice { Notice(text:notice) }
                VStack(spacing:20) {
                    if registering { field("Nombre completo",value:$name,type:.name) }
                    VStack(alignment:.leading,spacing:10) { Text("Correo electrónico").font(Brand.body(13)); TextField("tu@correo.com",text:$email).keyboardType(.emailAddress).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled(); Divider() }
                    VStack(alignment:.leading,spacing:10) { Text("Contraseña").font(Brand.body(13)); SecureField("Tu contraseña",text:$password).textContentType(registering ? .newPassword:.password); Divider() }
                    if registering { VStack(alignment:.leading,spacing:10) { Text("Confirmar contraseña").font(Brand.body(13)); SecureField("Repite tu contraseña",text:$confirmation).textContentType(.newPassword); Divider() }; Text("8 caracteres, mayúscula, minúscula, número y símbolo.").font(Brand.body(12)).foregroundStyle(.secondary) }
                }.padding(22).background(.white)
                PrimaryButton(title:registering ? "Crear cuenta":"Ingresar",busy:account.busy) { Task { if registering { await account.register(name:name,email:email,password:password,confirmation:confirmation); if account.notice != nil { password=""; confirmation=""; registering=false } } else { await account.signIn(email:email,password:password) } } }.disabled(email.isEmpty || password.isEmpty || account.auth==nil)
                Button(registering ? "Ya tengo cuenta. Ingresar":"¿Eres paciente? Crear cuenta") { registering.toggle(); account.error=nil; account.notice=nil; password=""; confirmation="" }.font(Brand.body(14))
                Divider(); Text("Tu cuenta es personal. Cierra sesión al terminar.").font(Brand.body(12)).foregroundStyle(.secondary)
            }.padding(24).frame(maxWidth:560,alignment:.leading).frame(maxWidth:.infinity)
        }.background(Brand.paper).scrollDismissesKeyboard(.interactively).disabled(account.busy)
    }
    func field(_ label:String,value:Binding<String>,type:UITextContentType)->some View { VStack(alignment:.leading,spacing:10) { Text(label).font(Brand.body(13)); TextField(label,text:value).textContentType(type); Divider() } }
}
struct WorkspaceView:View {
    let profile:AccessProfile
    @EnvironmentObject private var account:AccountModel
    @State private var page="Inicio"
    @StateObject private var shifts=ShiftModel()
    private var sections:[String] { RolePolicy.sections(account.role) }
    var body:some View {
        TabView(selection:$page) {
            ForEach(sections,id:\.self) { section in
                NavigationStack {
                    ScrollView {
                        VStack(alignment:.leading,spacing:25) {
                            Text("\(RolePolicy.label(account.role).uppercased()) / CLIMESA").font(Brand.mono()).foregroundStyle(Brand.blue)
                            Text(section=="Inicio" ? "Tu jornada.":"\(section).").font(Brand.bold(39)).fixedSize(horizontal:false,vertical:true)
                            if section=="Inicio" {
                                VStack(alignment:.leading,spacing:16) { Text(profile.name.isEmpty ? "Bienvenido":profile.name).font(Brand.bold(27)); Text("\(RolePolicy.label(account.role)) · Cuenta activa").font(Brand.body(14)) }.padding(24).frame(maxWidth:.infinity,alignment:.leading).foregroundStyle(.white).background(Brand.blue)
                                ForEach(sections.filter { $0 != "Inicio" },id:\.self) { item in Button { page=item } label: { HStack { Text(item); Spacer(); Image(systemName:"arrow.right") }.padding(.vertical,15) }; Divider() }
                            } else if section=="Mi cuenta" {
                                VStack(alignment:.leading,spacing:17) { Text(profile.name).font(Brand.bold(25)); Text(profile.email); Divider(); Text("Roles: \(profile.roles.joined(separator:", "))").font(Brand.mono()); Text("Tu cuenta es personal. Cierra sesión al terminar.").font(Brand.body(14)) }.padding(22).background(.white)
                                if profile.allowedIOSRoles.count>1 { Picker("Rol de trabajo",selection:$account.role) { ForEach(profile.allowedIOSRoles,id:\.self) { Text(RolePolicy.label($0)).tag($0) } }.pickerStyle(.segmented).onChange(of:account.role) { _,_ in page="Inicio" } }
                                PrimaryButton(title:"Actualizar acceso") { Task { await account.restore() } }
                                Button("Cerrar sesión",role:.destructive) { Task { await account.logout() } }.frame(maxWidth:.infinity).disabled(account.busy)
                            } else if section=="Mis turnos" {
                                if shifts.loading { ProgressView("Consultando tus turnos…") }
                                else if let error=shifts.error { Notice(text:error,failure:true); Button("Volver a intentar") { Task { await shifts.load(api:account.api) } } }
                                else if shifts.shifts.isEmpty { Text("No tienes turnos publicados.").foregroundStyle(.secondary) }
                                ForEach(shifts.shifts) { shift in VStack(alignment:.leading,spacing:12) { Text(shift.area).font(Brand.bold(22)); Text(Shift.display(shift.start)); Text("Hasta \(Shift.display(shift.end))"); Text("Publicado").font(Brand.mono()).padding(7).background(Brand.lime) }.padding(22).frame(maxWidth:.infinity,alignment:.leading).background(.white) }
                            } else {
                                Divider(); Text("PRÓXIMA ENTREGA").font(Brand.mono()).foregroundStyle(Brand.blue); Text("Este módulo todavía no está habilitado.").font(Brand.bold(25)); Text("Su acceso y navegación están definidos para tu rol. Las operaciones estarán disponibles en la siguiente entrega.").foregroundStyle(.secondary)
                            }
                        }.padding(24).frame(maxWidth:760,alignment:.leading).frame(maxWidth:.infinity)
                    }.background(Brand.paper).navigationTitle("climesa").navigationBarTitleDisplayMode(.inline)
                        .task(id:section=="Mis turnos" ? account.role:"") { if section=="Mis turnos" { await shifts.load(api:account.api) } }
                        .refreshable { if section=="Mis turnos" { await shifts.load(api:account.api) } else { await account.restore() } }
                }.tabItem { Label(section,systemImage:icon(section)) }.tag(section)
            }
        }
    }
    func icon(_ name:String)->String { switch name { case "Inicio":return "house"; case "Mi cuenta":return "person.crop.circle"; case "Mis turnos","Citas":return "calendar"; case "Resultados":return "doc.text"; default:return "list.bullet.clipboard" } }
}
