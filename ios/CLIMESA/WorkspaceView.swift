import SwiftUI

/// Decide qué ve la persona con el perfil verificado de /auth/me (lógica pura en Core/Access.swift).
struct WorkspaceView:View {
    let profile:AccessProfile
    @EnvironmentObject private var account:AccountModel
    // Explícito: con propiedades privadas el inicializador automático no sería visible desde Views.swift.
    init(profile:AccessProfile) { self.profile=profile }
    var body:some View {
        switch TabPolicy.decide(profile,preferredRole:account.role) {
        case .unsupportedRole:
            UnsupportedRoleView()
        case let .tabs(role,tabs):
            RoleTabsView(profile:profile,role:role,tabs:tabs)
        }
    }
}

/// Rol sin iOS (por ejemplo Recepción): solo puede salir.
struct UnsupportedRoleView:View {
    @EnvironmentObject private var account:AccountModel
    var body:some View {
        VStack(alignment:.leading,spacing:24) {
            BrandHeader()
            VStack(alignment:.leading,spacing:24) {
                Text("unsupported.title").font(Brand.bold(34)).fixedSize(horizontal:false,vertical:true)
                Text("unsupported.body").foregroundStyle(.secondary)
                Button("common.logout",role:.destructive) { Task { await account.logout() } }.disabled(account.busy)
            }.padding(24)
            Spacer()
        }.background(Brand.paper)
    }
}

struct RoleTabsView:View {
    let profile:AccessProfile
    let role:String
    let tabs:[AppTab]
    @EnvironmentObject private var account:AccountModel
    @State private var selection:AppTab
    @State private var live=LiveViewModel()
    @StateObject private var shifts=ShiftModel()

    init(profile:AccessProfile,role:String,tabs:[AppTab]) {
        self.profile=profile; self.role=role; self.tabs=tabs
        _selection=State(initialValue:tabs.first ?? .perfil)
    }

    var body:some View {
        TabView(selection:$selection) {
            ForEach(tabs,id:\.self) { tab in
                NavigationStack {
                    ScrollView {
                        VStack(alignment:.leading,spacing:25) {
                            Text(verbatim:"\(L.text(RolePolicy.labelKey(role)).uppercased()) / CLIMESA").font(Brand.mono()).foregroundStyle(Brand.blue)
                            Text(LocalizedStringKey(tab.titleKey)).font(Brand.bold(39)).fixedSize(horizontal:false,vertical:true)
                            content(for:tab)
                        }.padding(24).frame(maxWidth:760,alignment:.leading).frame(maxWidth:.infinity)
                    }.background(Brand.paper).navigationTitle(Text(verbatim:"climesa")).navigationBarTitleDisplayMode(.inline)
                        .refreshable { await refresh(tab) }
                }.tabItem { Label(LocalizedStringKey(tab.titleKey),systemImage:tab.symbol) }.tag(tab)
            }
        }
        .safeAreaInset(edge:.top,spacing:0) { ConnectionBanner(state:live.snapshot.connection) }
        // Tiempo real: se suscribe al entrar y la conexión se cierra al cancelar la tarea. No hay temporizadores de datos.
        .task(id:profile.channels) {
            let service=await account.makeRealtime()
            await live.run(service:service,channels:profile.channels)
        }
        .onChange(of:live.snapshot.profileVersion) { _,_ in Task { await account.refreshProfile() } }
        .onChange(of:role) { _,_ in selection=tabs.first ?? .perfil }
    }

    @ViewBuilder private func content(for tab:AppTab)->some View {
        switch tab {
        case .turnos:
            ShiftsContent(model:shifts,live:live,role:role)
        case .perfil,.mas:
            ProfileContent(profile:profile)
        default:
            PlaceholderContent()
        }
    }

    private func refresh(_ tab:AppTab) async {
        if tab == .turnos { await shifts.load(api:account.api) } else { await account.refreshProfile() }
    }
}

struct ConnectionBanner:View {
    let state:ConnectionState
    var body:some View {
        if state != .live {
            Text(LocalizedStringKey(state == .offline ? "live.offline":"live.reconnecting"))
                .font(Brand.body(13)).frame(maxWidth:.infinity).padding(8)
                .background(state == .offline ? Color.red.opacity(0.12):Brand.lime).foregroundStyle(Brand.ink)
                .accessibilityAddTraits(.updatesFrequently)
        }
    }
}

/// Pestañas que todavía no tienen datos: un aviso claro en lugar de una pantalla vacía.
struct PlaceholderContent:View {
    var body:some View {
        VStack(alignment:.leading,spacing:25) {
            Divider()
            Text("placeholder.badge").font(Brand.mono()).foregroundStyle(Brand.blue)
            Text("placeholder.title").font(Brand.bold(25))
            Text("placeholder.body").foregroundStyle(.secondary)
        }
    }
}

struct ShiftsContent:View {
    @EnvironmentObject private var account:AccountModel
    @ObservedObject var model:ShiftModel
    let live:LiveViewModel
    let role:String
    var body:some View {
        VStack(alignment:.leading,spacing:25) {
            if model.loading && model.shifts.isEmpty { ProgressView("shifts.loading") }
            else if let error=model.error { Notice(text:error,failure:true); Button("common.retry") { Task { await model.load(api:account.api) } } }
            else if model.shifts.isEmpty { Text("shifts.empty").foregroundStyle(.secondary) }
            ForEach(model.shifts) { shift in
                VStack(alignment:.leading,spacing:12) {
                    Text(verbatim:shift.area).font(Brand.bold(22))
                    Text(verbatim:Shift.display(shift.start))
                    Text(verbatim:String(format:L.text("shifts.until"),Shift.display(shift.end)))
                    Text("shifts.published").font(Brand.mono()).padding(7).background(Brand.lime)
                }.padding(22).frame(maxWidth:.infinity,alignment:.leading).background(.white)
            }
        }
        // Se pide al entrar y de nuevo cada vez que un evento de turnos (o una reconexión) sube el contador.
        .task(id:"\(role)-\(live.snapshot.shiftsVersion)") { await model.load(api:account.api) }
    }
}

struct ProfileContent:View {
    let profile:AccessProfile
    @EnvironmentObject private var account:AccountModel
    var body:some View {
        VStack(alignment:.leading,spacing:25) {
            VStack(alignment:.leading,spacing:17) {
                Text(verbatim:profile.name.isEmpty ? L.text("profile.welcome"):profile.name).font(Brand.bold(25))
                Text(verbatim:profile.email)
                Divider()
                Text(verbatim:String(format:L.text("profile.roles"),profile.roles.joined(separator:", "))).font(Brand.mono())
                Text("auth.footer").font(Brand.body(14))
            }.padding(22).frame(maxWidth:.infinity,alignment:.leading).background(.white)
            if profile.allowedIOSRoles.count>1 {
                Picker("profile.work_role",selection:$account.role) { ForEach(profile.allowedIOSRoles,id:\.self) { Text(LocalizedStringKey(RolePolicy.labelKey($0))).tag($0) } }.pickerStyle(.segmented)
            }
            PrimaryButton(title:"profile.refresh") { Task { await account.refreshProfile() } }
            Button("common.logout",role:.destructive) { Task { await account.logout() } }.frame(maxWidth:.infinity).disabled(account.busy)
        }
    }
}
