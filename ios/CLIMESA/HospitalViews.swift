import SwiftUI

// Pantallas del hospital: ocupación en detalle, médicos de turno, avisos, ubicación, "Mis datos" y "Mi habitación".
// Las usan el Paciente y el Médico; todo sale de endpoints de contrato/openapi.json.

/// Barra de ocupación con su porcentaje (verde, ámbar o rojo según el nivel).
struct OccupancyBar: View {
    let percent: Int

    var body: some View {
        let colors = Theme.colors(for: OccupancyRules.tone(percent: percent))
        VStack(alignment: .leading, spacing: Spacing.xs) {
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.line)
                    Capsule().fill(colors.foreground).frame(width: proxy.size.width * CGFloat(min(max(percent, 0), 100)) / 100)
                }
            }
            .frame(height: 8)
            Text(verbatim: String(format: L.text("hospital.percent"), percent)).font(Typo.caption).foregroundStyle(Theme.muted)
        }
        .accessibilityElement(children: .combine)
    }
}

struct HospitalInfo: Sendable {
    var occupancy: PublicOccupancy?
    var doctors: DoctorsOnDuty?
    var notices: PublicNotices?
}

/// I10 · Información del hospital: ocupación total y por piso, médicos de turno y avisos (datos públicos).
struct HospitalInfoView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<HospitalInfo>()

    var body: some View {
        LoadState(loader: loader, retry: load) { info in
            occupancySection(info.occupancy)
            doctorsSection(info.doctors)
            noticesSection(info.notices)
        }
        .task(id: live.snapshot.version(.hospitalInfo)) { await load() }
    }

    @ViewBuilder private func occupancySection(_ occupancy: PublicOccupancy?) -> some View {
        SectionTitle("hospital.occupancy")
        if let occupancy, !occupancy.rows.isEmpty {
            let totals = OccupancyRules.totals(occupancy.rows)
            SectionCard(eyebrow: L.text("hospital.occupancy.total")) {
                OccupancyBar(percent: OccupancyRules.percent(occupied: totals.occupied, beds: totals.beds))
                HStack(spacing: Spacing.m) {
                    StatTile(value: String(totals.free), label: L.text("hospital.free"))
                    StatTile(value: String(totals.occupied), label: L.text("hospital.occupied"))
                }
                Text(verbatim: String(format: L.text("hospital.updated"), ClimesaDates.display(occupancy.updatedAt, .time))).font(Typo.caption).foregroundStyle(Theme.muted)
            }
            ForEach(OccupancyRules.floors(occupancy.rows)) { floor in
                SectionCard(title: floor.floor.map { String(format: L.text("hospital.floor"), $0) } ?? L.text("hospital.floor.none")) {
                    OccupancyBar(percent: floor.percent)
                    ForEach(Array(floor.rows.enumerated()), id: \.offset) { index, row in
                        if index > 0 { Divider().overlay(Theme.line) }
                        ListRow(title: row.category.label, subtitle: String(format: L.text("hospital.beds"), row.free, row.beds),
                                meta: String(format: L.text("hospital.occupied.count"), row.occupied))
                    }
                }
            }
        } else {
            EmptyStateView(title: L.text("hospital.unavailable"), symbol: "building.2")
        }
    }

    @ViewBuilder private func doctorsSection(_ doctors: DoctorsOnDuty?) -> some View {
        SectionTitle("hospital.doctors")
        if let list = doctors?.doctors, !list.isEmpty {
            SectionCard {
                ForEach(Array(list.enumerated()), id: \.offset) { index, doctor in
                    if index > 0 { Divider().overlay(Theme.line) }
                    ListRow(title: doctor.name, subtitle: [doctor.specialty, doctor.area].compactMap { $0 }.joined(separator: " · "),
                            meta: doctor.until.map { String(format: L.text("hospital.until"), ClimesaDates.display($0, .time)) })
                }
            }
        } else {
            EmptyStateView(title: L.text("hospital.doctors.none"), symbol: "stethoscope")
        }
    }

    @ViewBuilder private func noticesSection(_ notices: PublicNotices?) -> some View {
        SectionTitle("home.notices")
        if let list = notices?.notices, !list.isEmpty {
            ForEach(list) { notice in
                SectionCard(title: notice.title) { Text(verbatim: notice.body).font(Typo.body).foregroundStyle(Theme.ink) }
            }
        } else {
            EmptyStateView(title: L.text("hospital.notices.none"), symbol: "bell")
        }
    }

    private func load() async {
        await loader.load {
            let api = try account.client()
            var info = HospitalInfo()
            info.occupancy = try? await api.get("/publico/ocupacion", as: PublicOccupancy.self)
            info.doctors = try? await api.get("/publico/medicos-de-turno", as: DoctorsOnDuty.self)
            info.notices = try? await api.get("/publico/avisos", as: PublicNotices.self)
            if info.occupancy == nil && info.doctors == nil && info.notices == nil { throw APIFailure.transport }
            return info
        }
    }
}

/// Ubicación: nombre del hospital, botón para abrir Apple Maps y guía de pisos con datos públicos.
struct LocationView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(\.openURL) private var openURL
    @State private var loader = Loader<PublicOccupancy>()

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.l) {
            SectionCard(eyebrow: L.text("location.eyebrow")) {
                Text("location.name").font(Typo.heading).foregroundStyle(Theme.ink)
                Text("location.address.note").font(Typo.small).foregroundStyle(Theme.muted)
                ClimesaButton(title: L.text("location.open_maps")) { openMaps() }
            }
            SectionTitle("location.floors")
            LoadState(loader: loader, retry: load) { occupancy in
                if occupancy.rows.isEmpty { EmptyStateView(title: L.text("hospital.unavailable"), symbol: "building.2") }
                ForEach(OccupancyRules.floors(occupancy.rows)) { floor in
                    SectionCard(title: floor.floor.map { String(format: L.text("hospital.floor"), $0) } ?? L.text("hospital.floor.none")) {
                        ForEach(Array(floor.rows.enumerated()), id: \.offset) { index, row in
                            if index > 0 { Divider().overlay(Theme.line) }
                            ListRow(title: row.category.label, subtitle: String(format: L.text("location.beds"), row.beds))
                        }
                    }
                }
            }
        }
        .task { await load() }
    }

    private func load() async { await loader.load { try await account.client().get("/publico/ocupacion", as: PublicOccupancy.self) } }

    private func openMaps() {
        guard var components = URLComponents(string: "https://maps.apple.com/") else { return }
        components.queryItems = [URLQueryItem(name: "q", value: L.text("location.map_query"))]
        if let url = components.url { openURL(url) }
    }
}

/// Mi habitación (paciente): la cama asignada mientras esté hospitalizado. La API solo entrega las admisiones propias.
struct MyRoomView: View {
    let profile: AccessProfile
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<[Admission]>()

    var body: some View {
        LoadState(loader: loader, retry: load) { admissions in
            if let room = RoomRules.current(admissions, patientId: profile.patientId) {
                RoomCard(admission: room)
            } else if RoomRules.waiting(admissions, patientId: profile.patientId) != nil {
                PatientNotice(text: L.text("room.waiting"))
            } else {
                EmptyStateView(title: L.text("room.none"), message: L.text("room.none.body"), symbol: "bed.double")
            }
        }
        .task(id: live.snapshot.version(.admissions)) { await load() }
    }

    private func load() async { await loader.load { try await account.client().get("/admisiones", as: [Admission].self) } }
}

/// Tarjeta con la cama asignada (la usan "Mi habitación", Inicio y el expediente que ve el médico tratante).
struct RoomCard: View {
    let admission: Admission
    var body: some View {
        SectionCard(eyebrow: L.text("room.eyebrow")) {
            Text(verbatim: String(format: L.text("hospitalized.bed"), admission.bed)).font(Typo.heading).foregroundStyle(Theme.ink)
            HStack(spacing: Spacing.s) {
                PatientTag(admission.state.rawValue, label: admission.state.label)
                Text(verbatim: admission.requestedCategory.label + (admission.isolation ? " · " + L.text("hospitalized.isolation") : "")).font(Typo.small).foregroundStyle(Theme.muted)
            }
        }
    }
}

/// Mis datos (paciente): ficha propia. Editar el contacto exige `pacientes.editar_demograficos`, que la API da a Recepción.
struct MyDataView: View {
    let profile: AccessProfile
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<PatientProfile>()
    @State private var editing = false

    var body: some View {
        LoadState(loader: loader, retry: load) { patient in
            SectionCard(eyebrow: patient.record) {
                Text(verbatim: patient.fullName).font(Typo.heading).foregroundStyle(Theme.ink)
                DataLine(label: L.text("mydata.birth"), value: patient.birth.map { ClimesaDates.display($0, .date) })
                DataLine(label: L.text("mydata.dui"), value: patient.dui)
                DataLine(label: L.text("mydata.phone"), value: patient.phone)
                DataLine(label: L.text("mydata.email"), value: patient.email)
                DataLine(label: L.text("mydata.address"), value: patient.address)
            }
            if account.can("pacientes.editar_demograficos") {
                ClimesaButton(title: L.text("mydata.edit"), kind: .secondary) { editing = true }
            } else {
                PatientNotice(text: L.text("mydata.readonly"))
            }
        }
        .task(id: live.snapshot.version(.patient)) { await load() }
        .sheet(isPresented: $editing) {
            if let patient = loader.value { EditMyDataSheet(patient: patient, reload: load) }
        }
    }

    private func load() async { await loader.load { try await account.client().get("/me/paciente", as: PatientProfile.self) } }
}

private struct DataLine: View {
    let label: String
    let value: String?
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(verbatim: label).font(Typo.small).foregroundStyle(Theme.muted)
            Spacer(minLength: Spacing.m)
            Text(verbatim: (value?.isEmpty == false ? value : nil) ?? "—").font(Typo.body).foregroundStyle(Theme.ink).multilineTextAlignment(.trailing)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct EditMyDataSheet: View {
    let patient: PatientProfile
    let reload: () async -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var submission = Submission()
    @State private var phone: String
    @State private var email: String
    @State private var address: String
    @State private var reason = ""
    @State private var errors: [String: String] = [:]

    init(patient: PatientProfile, reload: @escaping () async -> Void) {
        self.patient = patient
        self.reload = reload
        _phone = State(initialValue: patient.phone ?? "")
        _email = State(initialValue: patient.email ?? "")
        _address = State(initialValue: patient.address ?? "")
    }

    var body: some View {
        NavigationStack {
            ScreenFrame(title: "mydata.edit") {
                SectionCard {
                    FormField(label: L.text("mydata.phone"), text: $phone, error: errors["phone"]).keyboardType(.phonePad)
                    FormField(label: L.text("mydata.email"), text: $email, error: errors["email"])
                        .keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                    PatientTextArea(label: L.text("mydata.address"), text: $address, lines: 1...4, error: errors["address"])
                    PatientTextArea(label: L.text("mydata.reason"), text: $reason, lines: 2...4, error: errors["reason"])
                }
                WriteNotice(submission: submission, reload: reload)
                ClimesaButton(title: L.text("mydata.save"), loading: submission.busy) { Task { await save() } }
                ClimesaButton(title: L.text("common.close"), kind: .secondary) { dismiss() }
            }
        }
    }

    private func save() async {
        errors = PatientProfileRules.errors(phone: phone, email: email, address: address, reason: reason)
        guard errors.isEmpty else { return }
        let body = PatientProfileRules.body(profile: patient, phone: phone, email: email, address: address, reason: reason)
        let ok = await submission.run(patient.id, body: body, success: L.text("mydata.saved")) { key in
            _ = try await account.client().send("PATCH", "/pacientes/\(patient.id)", body: body, key: key, as: PatientUpdateResult.self)
        }
        await reload()
        if ok { dismiss() }
    }
}
