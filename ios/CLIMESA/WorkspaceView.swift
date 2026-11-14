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
                            Text(LocalizedStringKey(tab.titleKey)).font(Typo.display).foregroundStyle(Theme.ink).fixedSize(horizontal:false,vertical:true).accessibilityAddTraits(.isHeader)
                            content(for:tab)
                        }.padding(24).frame(maxWidth:760,alignment:.leading).frame(maxWidth:.infinity)
                    }.safeAreaInset(edge:.top,spacing:0) { ConnectionBanner(state:live.snapshot.connection) }.background(Theme.bg).navigationTitle(Text(LocalizedStringKey(tab.titleKey))).navigationBarTitleDisplayMode(.inline)
                        .toolbarBackground(Theme.navy,for:.navigationBar).toolbarBackground(.visible,for:.navigationBar).toolbarColorScheme(.dark,for:.navigationBar)
                        .toolbarBackground(Theme.surface,for:.tabBar).toolbarBackground(.visible,for:.tabBar)
                        .refreshable { await refresh(tab) }
                }.tabItem { Label(LocalizedStringKey(tab.titleKey),systemImage:tab.symbol) }.tag(tab)
            }
        }
        .environment(live)
        // Tiempo real: se suscribe al entrar y la conexión se cierra al cancelar la tarea. No hay temporizadores de datos.
        .task(id:profile.channels) {
            let service=await account.makeRealtime()
            await live.run(service:service,channels:profile.channels)
        }
        .onChange(of:live.snapshot.profileVersion) { _,_ in Task { await account.refreshProfile() } }
        .onChange(of:role) { _,_ in selection=tabs.first ?? .perfil }
    }

    @ViewBuilder private func content(for tab:AppTab)->some View {
        // Cada pestaña muestra su pantalla del catálogo (pantallas.csv); las secciones extra salen de AppSection.
        let go: (AppTab) -> Void = { target in if tabs.contains(target) { selection=target } }
        switch tab {
        case .miDia: DoctorDayView(profile:profile,go:go)
        case .pacientes: DoctorPatientsView()
        case .resultados: ResultsReviewView()
        case .turnos: ShiftsContent(model:shifts,live:live,role:role)
        case .perfil: ProfileContent(profile:profile)
        case .inicio: PatientHomeView(profile:profile,go:go)
        case .fila: PatientQueueView()
        case .citas: PatientAppointmentsView()
        case .examenes: PatientExamsView(profile:profile)
        case .mas: MoreView(profile:profile,role:role)
        }
    }

    private func refresh(_ tab:AppTab) async {
        if tab == .turnos { await shifts.load(api:account.api) } else { live.refreshAll(); await account.refreshProfile() }
    }
}

struct ConnectionBanner:View {
    let state:ConnectionState
    var body:some View {
        if state != .live {
            Text(LocalizedStringKey(state == .offline ? "live.offline":"live.reconnecting"))
                .font(Typo.tag).frame(maxWidth:.infinity).padding(8)
                .background(state == .offline ? Theme.dangerSoft:Theme.warningSoft).foregroundStyle(state == .offline ? Theme.danger:Theme.warning)
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
            if model.loading && model.shifts.isEmpty { LoadingStateView(message:L.text("shifts.loading")) }
            else if let error=model.error { ErrorStateView(message:error) { Task { await model.load(api:account.api) } } }
            else if model.shifts.isEmpty { EmptyStateView(title:L.text("shifts.empty"),symbol:"calendar") }
            ForEach(model.shifts) { shift in
                SectionCard(title:shift.area) {
                    Text(verbatim:Shift.display(shift.start)).font(Typo.body).foregroundStyle(Theme.ink)
                    Text(verbatim:String(format:L.text("shifts.until"),Shift.display(shift.end))).font(Typo.small).foregroundStyle(Theme.muted)
                    StatusTag("publicado",label:L.text("shifts.published"))
                }
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
            SectionCard {
                HStack(spacing:Spacing.m) {
                    Text(verbatim:String((profile.name.isEmpty ? profile.email:profile.name).prefix(1)).uppercased()).font(Typo.heading)
                        .foregroundStyle(Theme.primaryText).frame(width:48,height:48).background(Theme.soft,in:Circle()).accessibilityHidden(true)
                    VStack(alignment:.leading,spacing:2) {
                        Text(verbatim:profile.name.isEmpty ? L.text("profile.welcome"):profile.name).font(Typo.heading).foregroundStyle(Theme.ink)
                        Text(verbatim:profile.email).font(Typo.small).foregroundStyle(Theme.muted)
                    }
                }
                Divider().overlay(Theme.line)
                Text(verbatim:String(format:L.text("profile.roles"),profile.roles.joined(separator:", "))).font(Typo.mono).foregroundStyle(Theme.ink)
                Text("auth.footer").font(Typo.small).foregroundStyle(Theme.muted)
            }
            if profile.allowedIOSRoles.count>1 {
                Picker("profile.work_role",selection:$account.role) { ForEach(profile.allowedIOSRoles,id:\.self) { Text(LocalizedStringKey(RolePolicy.labelKey($0))).tag($0) } }.pickerStyle(.segmented)
            }
            ClimesaButton(title:L.text("profile.refresh")) { Task { await account.refreshProfile() } }
            ClimesaButton(title:L.text("common.logout"),kind:.destructive,loading:account.busy) { Task { await account.logout() } }
        }
    }
}
