import SwiftUI

// Pantallas del hospital: ocupación en detalle, médicos de turno, avisos, ubicación, "Mis datos" y "Mi habitación".
// Las usan el Paciente y el Médico; todo sale de endpoints de contrato/openapi.json.

/// Barra de ocupación con su porcentaje (verde o ámbar según el nivel). I-41: el rojo queda para lo crítico
/// clínico; un hospital casi lleno se ve en ámbar y con su porcentaje.
struct OccupancyBar: View {
    let percent: Int

    var body: some View {
        let tone = OccupancyRules.tone(percent: percent)
        let colors = Theme.colors(for: tone == .danger ? .warning : tone)
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

/// Cada parte se pide por separado; la que falla muestra su error con «Reintentar» (CH-02).
struct HospitalInfo: Sendable {
    var occupancy: Part<PublicOccupancy>
    var doctors: Part<DoctorsOnDuty>
}

/// I10 · Información del hospital: ocupación total y por piso y médicos de turno (datos públicos). Fase 2, S11: los
/// avisos salieron de aquí a su propia área (Avisos, en Más).
struct HospitalInfoView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<HospitalInfo>()

    var body: some View {
        LoadState(loader: loader, retry: load) { info in
            occupancySection(info.occupancy)
            doctorsSection(info.doctors)
        }
        .task(id: live.snapshot.version(.hospitalInfo)) { await load() }
    }

    @ViewBuilder private func occupancySection(_ part: Part<PublicOccupancy>) -> some View {
        SectionTitle("hospital.occupancy")
        if let error = part.error {
            SectionCard { PartError(message: error, retry: load) }
        } else if let occupancy = part.value, !occupancy.rows.isEmpty {
            let totals = OccupancyRules.totals(occupancy.rows)
            SectionCard(eyebrow: L.text("hospital.occupancy.total")) {
                OccupancyBar(percent: OccupancyRules.percent(occupied: totals.occupied, beds: totals.beds))
                HStack(spacing: Spacing.m) {
                    StatTile(value: String(totals.free), label: L.text("hospital.free"), plain: true)
                    StatTile(value: String(totals.occupied), label: L.text("hospital.occupied"), plain: true)
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
            EmptyStateView(title: L.text("hospital.unavailable"))
        }
    }

    @ViewBuilder private func doctorsSection(_ part: Part<DoctorsOnDuty>) -> some View {
        SectionTitle("hospital.doctors")
        if let error = part.error {
            SectionCard { PartError(message: error, retry: load) }
        } else if let list = part.value?.doctors, !list.isEmpty {
            SectionCard {
                ForEach(Array(list.enumerated()), id: \.offset) { index, doctor in
                    if index > 0 { Divider().overlay(Theme.line) }
                    // Every state wears its tag, the positive one too: a doctor here is on shift now.
                    ListRow(title: doctor.name, subtitle: [doctor.specialty, doctor.area].compactMap { $0 }.joined(separator: " · "),
                            meta: doctor.until.map { String(format: L.text("hospital.until"), ClimesaDates.display($0, .time)) }) {
                        StatusBadge("disponible", label: DoctorShiftFilter.conTurno.label)
                    }
                }
            }
        } else {
            EmptyStateView(title: L.text("hospital.doctors.none"))
        }
    }

    private func load() async {
        await loader.load {
            let api = try account.client()
            let occupancy = try await Part<PublicOccupancy>.load { try await api.get("/publico/ocupacion", as: PublicOccupancy.self) }
            let doctors = try await Part<DoctorsOnDuty>.load { try await api.get("/publico/medicos-de-turno", as: DoctorsOnDuty.self) }
            return HospitalInfo(occupancy: occupancy, doctors: doctors)
        }
    }
}

/// Ubicación: nombre, dirección y teléfono (`GET /publico/hospital`), Apple Maps en las coordenadas y guía de pisos.
struct LocationView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(\.openURL) private var openURL
    @State private var loader = Loader<PublicOccupancy>()
    @State private var place = Loader<HospitalLocation>()

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.l) {
            SectionCard(eyebrow: L.text("location.eyebrow")) {
                if let hospital = place.value {
                    Text(verbatim: hospital.name).font(Typo.heading).foregroundStyle(Theme.ink)
                    DataLine(label: L.text("location.address"), value: hospital.address)
                    DataLine(label: L.text("location.town"), value: "\(hospital.municipality), \(hospital.department)")
                    DataLine(label: L.text("location.phone"), value: hospital.phone)
                    if let call = HospitalLocationRules.callURL(hospital) {
                        ClimesaButton(title: L.text("location.call"), kind: .secondary) { openURL(call) }
                    }
                } else {
                    Text("location.name").font(Typo.heading).foregroundStyle(Theme.ink)
                    Text("location.address.note").font(Typo.small).foregroundStyle(Theme.muted)
                }
                ClimesaButton(title: L.text("location.open_maps")) { openMaps() }
            }
            SectionTitle("location.floors")
            LoadState(loader: loader, retry: load) { occupancy in
                if occupancy.rows.isEmpty { EmptyStateView(title: L.text("hospital.unavailable")) }
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
        .task {
            await place.load { try await account.client().get("/publico/hospital", as: HospitalLocation.self) }
            await load()
        }
    }

    private func load() async { await loader.load { try await account.client().get("/publico/ocupacion", as: PublicOccupancy.self) } }

    /// Coordenadas del hospital; si la consulta falló, búsqueda por nombre como antes.
    private func openMaps() {
        if let url = HospitalLocationRules.mapsURL(place.value, fallbackQuery: L.text("location.map_query")) { openURL(url) }
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
            let discharge = DischargeSummaryRules.summary(admissions, patientId: profile.patientId)
            if let room = RoomRules.current(admissions, patientId: profile.patientId) {
                RoomCard(admission: room)
            } else if RoomRules.waiting(admissions, patientId: profile.patientId) != nil {
                PatientNotice(text: L.text("room.waiting"))
            } else if discharge == nil {
                EmptyStateView(title: L.text("room.none"), message: L.text("room.none.body"))
            }
            // D7: resumen del alta firmada (también 30 días después de la salida).
            if let discharge, let summary = discharge.discharge { DischargeSummaryCard(admission: discharge, discharge: summary) }
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
            // Without a bed yet, say so instead of an empty "Cama ".
            Text(verbatim: admission.bed.isEmpty ? L.text("hospitalized.noBed") : String(format: L.text("hospitalized.bed"), admission.bed))
                .font(Typo.heading).foregroundStyle(Theme.ink)
            HStack(spacing: Spacing.s) {
                PatientTag(admission.state.rawValue, label: admission.state.label)
                Text(verbatim: admission.requestedCategory.label + (admission.isolation ? " · " + L.text("hospitalized.isolation") : "")).font(Typo.small).foregroundStyle(Theme.muted)
            }
        }
    }
}

/// D7: resumen del alta para el paciente (tipo, diagnósticos, indicaciones, pendientes con responsable y seguimiento). Sin PDF.
struct DischargeSummaryCard: View {
    let admission: Admission
    let discharge: Admission.Discharge

    var body: some View {
        SectionCard(title: L.text("discharge.patient.title"), eyebrow: DischargeSummaryRules.typeLabel(discharge)) {
            HStack(spacing: Spacing.s) {
                PatientTag(admission.state.rawValue, label: admission.state.label)
                Text(verbatim: DischargeSummaryRules.signedLine(discharge)).font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
            }
            if admission.state == .egresado { PatientNotice(text: L.text("discharge.patient.closed")) }
            block(L.text("discharge.patient.diagnoses"), lines: DischargeSummaryRules.diagnoses(discharge).map(DischargeSummaryRules.diagnosisLine), empty: L.text("discharge.patient.diagnoses.none"))
            block(L.text("discharge.patient.indications"), lines: [discharge.summary].compactMap { $0?.isEmpty == false ? $0 : nil }, empty: L.text("discharge.patient.indications.none"))
            block(L.text("discharge.patient.pending"), lines: (discharge.pending ?? []).map(DischargeSummaryRules.pendingLine), empty: L.text("discharge.patient.pending.none"))
            block(L.text("discharge.patient.followup"), lines: [discharge.followUp].compactMap { $0 }.map(DischargeSummaryRules.followUpLine), empty: L.text("discharge.patient.followup.none"))
        }
    }

    private func block(_ title: String, lines: [String], empty: String) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Divider()
            Text(verbatim: title).font(Typo.label).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader)
            if lines.isEmpty {
                Text(verbatim: empty).font(Typo.body).foregroundStyle(Theme.muted)
            } else {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    Text(verbatim: line).font(Typo.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

/// Mis datos (paciente): ficha propia. Editar el contacto exige `pacientes.editar_propios`.
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
            if account.can("pacientes.editar_propios") {
                CrudButton(kind: .edit, label: L.text("mydata.edit")) { editing = true }
            } else {
                // S0: the data is read-only for this account; the lock pill says whom to ask.
                ReadOnlyBadge(who: "Recepción", what: "tus datos")
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
            ScreenFrame(title: "mydata.edit", onClose: { dismiss() }) {
                SectionCard {
                    FormField(label: L.text("mydata.phone"), text: $phone, error: error("phone")).keyboardType(.phonePad).textContentType(.telephoneNumber)
                    FormField(label: L.text("mydata.email"), text: $email, error: error("email")).textContentType(.emailAddress)
                        .keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                    PatientTextArea(label: L.text("mydata.address"), text: $address, lines: 1...4, error: error("address"))
                }
                if submission.lastFailure?.isVersionConflict == true {
                    ConflictBanner(message: L.text("mydata.conflict")) { Task { await reload(); dismiss() } }
                } else if submission.lastFailure?.code == "sin_vinculacion" {
                    PatientNotice(text: L.text("mydata.unlinked"), failure: true)
                } else if submission.fieldErrors.isEmpty {
                    SubmissionNotice(submission: submission)
                }
                ClimesaButton(title: L.text("mydata.save"), loading: submission.busy) { Task { await save() } }
            }
        }
    }

    /// Error del campo: primero la revisión local; si la API rechazó el campo, su mensaje en español (MOV-03).
    private func error(_ field: String) -> String? { errors[field] ?? submission.fieldErrors[field] }

    private func save() async {
        errors = PatientProfileRules.errors(phone: phone, email: email, address: address)
        guard errors.isEmpty else { return }
        let body = PatientProfileRules.body(version: patient.version, phone: phone, email: email, address: address)
        let ok = await submission.run(patient.id, body: body, success: L.text("mydata.saved")) { key in
            _ = try await account.client().send("PATCH", "/me/paciente", body: body, key: key, as: PatientUpdateResult.self)
        }
        await reload()
        if ok { dismiss() }
    }
}
