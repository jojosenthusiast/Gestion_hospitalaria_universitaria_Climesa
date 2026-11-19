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
            UnsupportedRoleView(profile:profile)
        case let .tabs(role,tabs):
            RoleTabsView(profile:profile,role:role,tabs:tabs)
        }
    }
}

/// Rol sin iOS (por ejemplo Recepción): solo puede salir.
struct UnsupportedRoleView:View {
    let profile:AccessProfile
    @EnvironmentObject private var account:AccountModel
    var body:some View {
        VStack(alignment:.leading,spacing:0) {
            BrandHeader()
            VStack(alignment:.leading,spacing:Spacing.space4) {
                Text("unsupported.title").font(Typo.heading).foregroundStyle(Theme.ink).fixedSize(horizontal:false,vertical:true).accessibilityAddTraits(.isHeader)
                // Dónde sí puede ingresar, según las plataformas de sus roles en /auth/me (no una tabla fija en la app).
                Text(verbatim:PlatformGate.message(platforms:profile.platforms,current:"ios",webURL:account.webURL)).font(Typo.body).foregroundStyle(Theme.muted).fixedSize(horizontal:false,vertical:true)
                // Rojo solo para lo crítico: salir no lo es.
                ClimesaButton(title:L.text("common.logout"),kind:.secondary,loading:account.busy) { Task { await account.logout() } }
            }.padding(Spacing.space6).frame(maxWidth:560,alignment:.leading).frame(maxWidth:.infinity)
            Spacer()
        }.background(Theme.bg)
    }
}

struct RoleTabsView:View {
    let profile:AccessProfile
    let role:String
    let tabs:[AppTab]
    @EnvironmentObject private var account:AccountModel
    @State private var selection:AppTab
    /// Pestaña elegida, guardada por escena: al volver tras cerrarse la app por el sistema se abre la misma.
    @SceneStorage("workspace.tab") private var storedTab:String=""
    @State private var live=LiveViewModel()
    /// D1: one notices inbox per session, so Inicio, Avisos and the badge always agree.
    @State private var notices=NoticeInboxModel()
    @Environment(\.scenePhase) private var scenePhase
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
                        // S1: sin título gigante; el título de la pestaña va en línea en la barra de navegación (HIG).
                        VStack(alignment:.leading,spacing:Spacing.gap) {
                            content(for:tab)
                        }.padding(Spacing.gutter).frame(maxWidth:760,alignment:.leading).frame(maxWidth:.infinity)
                    }.dismissibleKeyboard().safeAreaInset(edge:.top,spacing:0) { ConnectionBanner(state:live.snapshot.connection) }.background(Theme.bg).navigationTitle(Text(LocalizedStringKey(tab.titleKey))).navigationBarTitleDisplayMode(.inline)
                        .climesaNavBar()
                        .toolbarBackground(Theme.surface,for:.tabBar).toolbarBackground(.visible,for:.tabBar)
                        // Avisos one tap away on every tab (Android/web bell); the count no longer sits on Más.
                        .toolbar { ToolbarItem(placement:.topBarTrailing) { HStack(spacing:Spacing.space2) { LiveClock(); NoticesBell(model:notices) } } }
                        .refreshable { await refresh(tab) }
                }.tabItem { Label { Text(LocalizedStringKey(tab.titleKey)) } icon: { Image(uiImage:tab.icon.templateImage()) } }.tag(tab)
            }
        }
        .environment(live)
        .environment(notices)
        .loadsNoticeInbox(notices,account:account,live:live)
        // Tiempo real: se suscribe al entrar y la conexión se cierra al cancelar la tarea. No hay temporizadores de datos.
        // `connectionGeneration` sube al volver a primer plano o al recuperar la red para reconectar de inmediato.
        .task(id:"\(profile.channels.joined(separator:"|"))#\(live.connectionGeneration)") {
            let service=await account.makeRealtime()
            await live.run(service:service,channels:profile.channels)
        }
        .onChange(of:live.snapshot.profileVersion) { _,_ in Task { await account.refreshProfile() } }
        .onChange(of:scenePhase) { _,value in
            if value == .background { live.sceneEnteredBackground() } else if value == .active { live.sceneBecameActive() }
        }
        .onChange(of:role) { _,_ in selection=tabs.first ?? .perfil }
        .onAppear { if let saved=AppTab(rawValue:storedTab),tabs.contains(saved) { selection=saved } }
        .onChange(of:selection) { _,tab in storedTab=tab.rawValue }
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

/// Bell in the top bar of every tab: opens Avisos and shows the in-force unread count ("99+" over ninety-nine). Web
/// `.notices-bell-count`: a white pill with primary text, red only while an in-force critical notice is unread.
struct NoticesBell:View {
    let model:NoticeInboxModel

    var body:some View {
        let count=NoticeRules.badge(model.inbox,hiding:model.hidden)
        let critical=NoticeRules.bellIsCritical(model.inbox,hiding:model.hidden)
        let tone=NoticeRules.bellBadgeTone(model.inbox,hiding:model.hidden)
        NavigationLink {
            ScreenFrame(title:"section.avisos") { NoticesView() }
        } label: {
            ClimesaIcon(.bell,size:22)
                .foregroundStyle(Color.white)
                .frame(width:44,height:44)
                .overlay(alignment:.topTrailing) {
                    if let text=NoticeRules.badgeText(count), let tone {
                        Text(verbatim:text).font(Atkinson.text(11,.bold,relativeTo:.caption2).monospacedDigit())
                            .foregroundStyle(tone == .critical ? Color.white:Theme.primaryText)
                            .padding(.horizontal,5).frame(minWidth:18,minHeight:18)
                            .background(tone == .critical ? Theme.critical:Theme.surface,in:Capsule())
                            .offset(x:-2,y:4)
                    }
                }
                .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(verbatim:accessibilityText(count:count,critical:critical)))
    }

    private func accessibilityText(count:Int?,critical:Bool)->String {
        if critical { return L.text("notices.bell.critical") }
        if let count { return String(format:L.text("notices.bell.unread"),String(count)) }
        return L.text("notices.bell")
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

struct ShiftsContent:View {
    @EnvironmentObject private var account:AccountModel
    @ObservedObject var model:ShiftModel
    let live:LiveViewModel
    let role:String
    @State private var showPast=false
    var body:some View {
        VStack(alignment:.leading,spacing:Spacing.space6) {
            if model.loading && model.shifts.isEmpty { Skeleton(label:L.text("shifts.loading")) }
            else if let error=model.error { ErrorStateView(message:error) { Task { await model.load(api:account.api) } } }
            else if model.shifts.isEmpty { EmptyStateView(title:L.text("shifts.empty")) }
            // Por día asignado (Hoy, Mañana, día y fecha) y por hora de inicio; la entrada se confirma sola (ASIS-01).
            // Abre en hoy: lo de hoy en adelante primero; los días anteriores quedan plegados abajo (S12, últimos 7 días).
            let days=ShiftAttendanceRules.byDay(model.shifts,start:{ ShiftAttendanceRules.date($0.start) },end:{ ShiftAttendanceRules.date($0.end) },today:Date())
            let upcoming=days.filter { !$0.past }
            let past=Array(days.filter { $0.past }.prefix(7))
            ForEach(Array(upcoming.enumerated()),id:\.offset) { _, day in dayGroup(title:day.title,items:day.items) }
            if !past.isEmpty {
                DisclosureGroup(isExpanded:$showPast) {
                    VStack(alignment:.leading,spacing:Spacing.space6) {
                        ForEach(Array(past.enumerated()),id:\.offset) { _, day in dayGroup(title:day.title,items:day.items) }
                    }.padding(.top,Spacing.space3)
                } label: {
                    Text(L.text("shifts.past")).font(Typo.label).foregroundStyle(Theme.ink).frame(minHeight:44)
                }.tint(Theme.primaryText)
            }
        }
        // Se pide al entrar y de nuevo cada vez que un evento de turnos (o una reconexión) sube el contador.
        .task(id:"\(role)-\(live.snapshot.shiftsVersion)") { await model.load(api:account.api) }
    }

    /// Un día: título y sus turnos como filas separadas por una línea de 1 pt (sin una tarjeta por turno).
    @ViewBuilder private func dayGroup(title:String,items:[Shift])->some View {
        SectionCard(title:title) {
            ForEach(Array(items.enumerated()),id:\.element.id) { index, shift in
                if index>0 { Divider().overlay(Theme.line) }
                shiftRow(shift)
            }
        }
    }

    @ViewBuilder private func shiftRow(_ shift:Shift)->some View {
        // Web `displayState`: a published shift whose hours started or ended reads as in progress or done.
        let shown=ShiftAttendanceRules.displayState(shift.state,start:ShiftAttendanceRules.date(shift.start),end:ShiftAttendanceRules.date(shift.end),now:Date())
        HStack(alignment:.center,spacing:Spacing.m) {
            AreaTag(AreaCode.of(name: shift.area).rawValue)
            VStack(alignment:.leading,spacing:2) {
                Text(verbatim:shift.area).font(Typo.subheading).foregroundStyle(Theme.ink)
                Text(verbatim:ShiftAttendanceRules.hours(start:ShiftAttendanceRules.date(shift.start),end:ShiftAttendanceRules.date(shift.end),type:shift.type)).font(Typo.small).foregroundStyle(Theme.muted)
                if let attendance=ShiftAttendanceRules.attendanceLabel(shift.attendance,late:shift.late ?? false) { Text(verbatim:attendance).font(Typo.caption).foregroundStyle(Theme.muted) }
            }
            Spacer(minLength:Spacing.s)
            StatusTag(shown,label:ShiftAttendanceRules.stateLabel(shown))
        }
        .padding(.vertical,Spacing.s).frame(minHeight:Spacing.control)
        .accessibilityElement(children:.combine)
    }
}

struct ProfileContent:View {
    let profile:AccessProfile
    @EnvironmentObject private var account:AccountModel
    var body:some View {
        VStack(alignment:.leading,spacing:Spacing.space6) {
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
                // Web `RoleChip`: each role with its identity glyph and tone.
                FlowLayout(spacing:Spacing.space2) { ForEach(profile.roles,id:\.self) { code in RoleChip(code:code,label:RoleNames.label(code)) } }
                    .accessibilityElement(children:.ignore)
                    .accessibilityLabel(Text(verbatim:String(format:L.text("profile.roles"),RoleNames.list(profile.roles))))
                Text("auth.footer").font(Typo.small).foregroundStyle(Theme.muted)
            }
            if profile.allowedIOSRoles.count>1 {
                ClimesaSegmented(title:L.text("profile.work_role"),options:profile.allowedIOSRoles.map { ClimesaSegmented<String>.Option($0,L.text(RolePolicy.labelKey($0))) },selection:$account.role)
            }
            ClimesaButton(title:L.text("profile.refresh"),kind:.secondary) { Task { await account.refreshProfile() } }
            // Rojo solo para lo crítico: cerrar sesión es una acción secundaria.
            ClimesaButton(title:L.text("common.logout"),kind:.secondary,loading:account.busy) { Task { await account.logout() } }
        }
    }
}
