import Foundation

/// I05: seguimiento del número propio en la fila.
public enum QueueRules {
    /// Número vigente de la persona (el más reciente que no terminó).
    public static func activeTicket(_ tickets: [QueueTicket]) -> QueueTicket? {
        tickets.filter { $0.state.isActive }.max { $0.issuedAt < $1.issuedAt }
    }

    /// Números por delante del mío según los llamados públicos de hoy. Es aproximado: los números se emiten en orden
    /// por servicio y día, pero alguien puede no presentarse. nil si todavía no se llamó a nadie.
    public static func ahead(of number: Int, called: [PublicQueue.Called]) -> Int? {
        guard let last = called.map(\.number).max() else { return nil }
        return max(0, number - last - 1)
    }

    /// Consultorio asignado cuando ya me llamaron.
    public static func office(for number: Int, called: [PublicQueue.Called]) -> String? {
        called.first { $0.number == number }?.office
    }

    /// I20 "Llamar siguiente": el número en espera más bajo de consulta general.
    public static func nextToCall(_ tickets: [QueueTicket], service: QueueService = .consultaGeneral) -> QueueTicket? {
        tickets.filter { $0.service == service && $0.state == .enEspera }.min { $0.number < $1.number }
    }
}

/// I06: citas del paciente.
public enum AppointmentRules {
    /// Próximas (ascendente) y pasadas (descendente) respecto de `now`.
    public static func split(_ appointments: [Appointment], now: Date) -> (upcoming: [Appointment], past: [Appointment]) {
        let stamp = ClimesaDates.iso(now)
        let upcoming = appointments.filter { isUpcoming($0, nowISO: stamp) }.sorted { $0.start < $1.start }
        let past = appointments.filter { !isUpcoming($0, nowISO: stamp) }.sorted { $0.start > $1.start }
        return (upcoming, past)
    }

    private static func isUpcoming(_ appointment: Appointment, nowISO: String) -> Bool {
        guard let start = ClimesaDates.parse(appointment.start), let now = ClimesaDates.parse(nowISO) else { return false }
        return start > now && (appointment.state == .solicitada || appointment.state == .confirmada)
    }

    /// Solo se cancela una cita futura solicitada o confirmada. El plazo (RN-21) lo decide la API.
    public static func canCancel(_ appointment: Appointment, now: Date) -> Bool {
        guard let start = ClimesaDates.parse(appointment.start) else { return false }
        return start > now && (appointment.state == .solicitada || appointment.state == .confirmada)
    }

    /// RN-21 (política `citas.cancelacion_horas`): el paciente cancela hasta 2 h antes del inicio.
    public static let patientCancelHours = 2

    /// Qué puede hacer el paciente con "Cancelar" según estado y hora (CITA-04): no se ofrece lo que la API rechazaría.
    public enum CancelOption: Equatable, Sendable {
        /// Cita pasada, empezada o ya en un estado final: no se muestra la acción.
        case hidden
        /// Se puede cancelar hasta `deadline`.
        case allowed(deadline: Date)
        /// Faltan menos de `patientCancelHours`: la acción se muestra desactivada con el motivo.
        case tooLate(deadline: Date)
        /// El servidor la bloquea (`blockedActions`) con un motivo propio que se muestra tal cual.
        case blocked(reason: String)

        /// The shared gate (S0): too late and server-blocked both show the reason instead of a silent gap.
        public var gate: ActionGate {
            switch self {
            case .hidden: return .hidden
            case .allowed: return .available
            case .tooLate: return .blocked(reason: AppointmentRules.cancelTooLateText())
            case let .blocked(reason): return .blocked(reason: reason)
            }
        }
    }

    /// Cuando la API manda `allowedActions` (CITA-04), ella decide; el cálculo local queda para respuestas anteriores.
    public static func cancelOption(_ appointment: Appointment, now: Date, hours: Int = AppointmentRules.patientCancelHours) -> CancelOption {
        if let allowed = appointment.allowedActions {
            if allowed.contains(.cancelar) {
                let deadline = appointment.cancelableUntil.flatMap(ClimesaDates.parse) ?? ClimesaDates.parse(appointment.start) ?? now
                return .allowed(deadline: deadline)
            }
            if let reason = blockedReason(appointment, .cancelar) { return .blocked(reason: reason) }
            return .hidden
        }
        guard canCancel(appointment, now: now), let start = ClimesaDates.parse(appointment.start) else { return .hidden }
        let deadline = start.addingTimeInterval(-Double(hours) * 3600)
        return now < deadline ? .allowed(deadline: deadline) : .tooLate(deadline: deadline)
    }

    /// "Puedes cancelar hasta las 08:00" (el mismo día) o "... hasta las 08:00 del vie 20 nov", sin año, en hora de El Salvador.
    public static func cancelDeadlineText(_ deadline: Date, now: Date) -> String {
        let time = ClimesaDates.clock(deadline)
        if ClimesaDates.localDay(deadline) == ClimesaDates.localDay(now) { return "Puedes cancelar hasta las \(time)." }
        return "Puedes cancelar hasta las \(time) del \(ClimesaDates.dayMonth(deadline))."
    }

    public static func cancelTooLateText(hours: Int = AppointmentRules.patientCancelHours) -> String {
        "Ya no puedes cancelar desde la aplicación: faltan menos de \(hours) h para la cita. Comunícate con Recepción."
    }

    /// Motivo del servidor para una acción bloqueada, si la hay.
    public static func blockedReason(_ appointment: Appointment, _ action: AppointmentAction) -> String? {
        appointment.blockedActions?.first { $0.action == action }?.reason
    }

    /// CITA-02: el paciente puede pedir otra franja solo si el servidor lo permite ahora.
    public static func canReschedule(_ appointment: Appointment) -> Bool {
        appointment.allowedActions?.contains(.reprogramar) ?? false
    }

    /// Texto de la última solicitud de reprogramación, para el paciente.
    public static func rescheduleText(_ appointment: Appointment, now: Date = Date()) -> String? {
        guard let request = appointment.reschedule else { return nil }
        let short = ClimesaDates.short(request.start, now: now)
        let when = short.prefix(1).lowercased() + short.dropFirst()
        switch request.state {
        case .pendiente: return "Pediste cambiar a \(when). Tu cita actual sigue vigente hasta que Recepción o tu médico respondan."
        case .rechazada: return "No se aceptó el cambio a \(when)\(request.rejectionReason.map { ": \($0)" } ?? ".")"
        case .vencida: return "Tu solicitud de cambio a \(when) venció sin respuesta."
        case .aceptada, .desconocido: return nil
        }
    }

    /// `AppointmentCancelDto.reason`: de 10 a 500 caracteres.
    public static func cancelReasonError(_ reason: String) -> String? {
        let size = reason.trimmingCharacters(in: .whitespacesAndNewlines).count
        return (10...500).contains(size) ? nil : "Escribe un motivo de 10 a 500 caracteres."
    }

    /// `PatientAppointmentRequestDto.reason`: hasta 500 caracteres.
    public static func requestReasonError(_ reason: String) -> String? {
        reason.trimmingCharacters(in: .whitespacesAndNewlines).count <= 500 ? nil : "El motivo admite hasta 500 caracteres."
    }
}

/// I09: solicitud de ambulancia (`AmbulanceRequestDto`).
public enum AmbulanceRules {
    /// S6: the API takes a request only from an account with a linked record, so an unlinked patient sees why and
    /// what to do instead of a form that would be refused. Without the permission the action does not exist.
    public static let unlinkedReason = "Vincula tu expediente para pedir una ambulancia. En una emergencia llama al 911."

    public static func requestGate(_ profile: AccessProfile?) -> ActionGate {
        guard let profile, profile.hasPermission(AppSection.ambulancia.requiredPermission ?? "") else { return .hidden }
        return profile.patientId == nil ? .blocked(reason: unlinkedReason) : .available
    }

    public static func errors(address: String, reason: String, phone: String) -> [String: String] {
        var errors: [String: String] = [:]
        let place = address.trimmingCharacters(in: .whitespacesAndNewlines).count
        if !(5...300).contains(place) { errors["address"] = "Escribe la dirección (5 a 300 caracteres)." }
        let motive = reason.trimmingCharacters(in: .whitespacesAndNewlines).count
        if !(5...500).contains(motive) { errors["reason"] = "Describe el motivo (5 a 500 caracteres)." }
        if phone.trimmingCharacters(in: .whitespaces).range(of: #"^[0-9+ -]{8,20}$"#, options: .regularExpression) == nil {
            errors["contactPhone"] = "Escribe un teléfono de 8 a 20 dígitos."
        }
        return errors
    }

    /// Nombre del hito para el paciente.
    public static func milestoneLabel(_ type: String) -> String {
        ["salida": "Salida", "en_escena": "En el lugar", "trasladando": "Hacia el hospital", "en_hospital": "En el hospital", "finalizado": "Finalizado"][type] ?? "Avance"
    }

    /// MA-AMB-05: la solicitud que sigue la pantalla: la activa más reciente (por confirmar o en camino).
    public static func active(_ requests: [OwnAmbulanceRequest]) -> OwnAmbulanceRequest? { requests.first { $0.isActive } }

    /// With nothing active, the most recent request of the last 7 days (the API's window) that already has an outcome
    /// (discarded, cancelled or with its service finished); the screen shows how it ended above the new-request form.
    public static func latestResolved(_ requests: [OwnAmbulanceRequest]) -> OwnAmbulanceRequest? {
        requests.contains { $0.isActive } ? nil : requests.first
    }

    /// Status value of the request's tag: its final state once the service ended, otherwise the request state.
    public static func tagValue(_ request: OwnAmbulanceRequest) -> (value: String, label: String) {
        if let final = request.service?.finalState, let state = AmbulanceFinalState(rawValue: final) { return (state.statusValue, state.label) }
        return (request.state.rawValue, request.state.label)
    }

    /// Qué pasa con la solicitud, en una frase para el paciente; sale del estado del servidor, no de los eventos.
    public static func progress(_ request: OwnAmbulanceRequest) -> String {
        let done = Set(request.service?.milestones.map(\.type) ?? [])
        switch request.state {
        case .porConfirmar: return "Despacho te llamará para confirmar antes de mover la ambulancia."
        case .cancelada: return "Cancelaste esta solicitud."
        case .descartada:
            let why = request.discardReason?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return "Despacho no pudo atender esta solicitud\(why.isEmpty ? "" : ": \(why)"). Si hay riesgo de vida, llama al 911."
        default: break
        }
        guard let service = request.service else { return "Despacho confirmó tu solicitud." }
        if let final = service.finalState { return "El servicio terminó: \((AmbulanceFinalState(rawValue: final)?.label ?? "finalizado").lowercased())." }
        if done.contains("en_hospital") { return "La ambulancia llegó al hospital." }
        if done.contains("trasladando") { return "La ambulancia va hacia el hospital." }
        if done.contains("en_escena") { return "La ambulancia llegó al lugar." }
        if done.contains("salida") { return "La ambulancia va en camino." }
        return "Despacho confirmó tu solicitud: la ambulancia saldrá en breve."
    }

    public static func body(address: String, municipality: String, reason: String, phone: String) -> AmbulanceRequestBody {
        let place = municipality.trimmingCharacters(in: .whitespacesAndNewlines)
        return AmbulanceRequestBody(
            address: address.trimmingCharacters(in: .whitespacesAndNewlines),
            municipality: place.isEmpty ? nil : place,
            reason: reason.trimmingCharacters(in: .whitespacesAndNewlines),
            contactPhone: phone.trimmingCharacters(in: .whitespaces)
        )
    }
}

/// I07: el paciente ve los valores solo cuando el médico revisó la orden (D-040).
public enum PatientLabRules {
    public static func showsValues(_ order: LabOrder) -> Bool { order.reviewedAt != nil }

    /// Texto del estado para el paciente: un completado sin revisar sigue "En revisión médica".
    public static func statusText(_ order: LabOrder) -> String {
        if order.state == .completado && order.reviewedAt == nil { return "En revisión médica" }
        if order.state == .completado { return "Resultados disponibles" }
        return order.state.label
    }

    /// Status family value of an order's badge (web `laboratory.tsx` STAGE_STATUS): a completed order still waiting
    /// for the doctor's review is "en espera", never a "done" check; a reviewed one is done.
    public static func badgeValue(_ order: LabOrder) -> String {
        if order.reviewedAt != nil { return "firmada" }
        if order.state == .completado { return "en_espera" }
        return order.state.rawValue
    }

    /// The patient's "Exámenes pendientes": orders still at the laboratory (pending or in process).
    public static func pendingCount(_ orders: [LabOrder]) -> Int {
        orders.filter { $0.state == .pendiente || $0.state == .enProceso }.count
    }

    /// "Waiting for the doctor's review" only applies to a completed order without its review; a cancelled or
    /// pending order never says so.
    public static func awaitsReview(_ order: LabOrder) -> Bool { order.state == .completado && order.reviewedAt == nil }

    /// Closed results (released or cancelled) beyond the newest `keep` fold under «Ver N más»; open orders always show.
    public static func fold(_ orders: [LabOrder], keep: Int = 3) -> (shown: [LabOrder], folded: [LabOrder]) {
        let closed: (LabOrder) -> Bool = { $0.state == .cancelado || ($0.state == .completado && $0.reviewedAt != nil) }
        let kept = Set(orders.filter(closed).prefix(keep).map(\.id))
        return (orders.filter { !closed($0) || kept.contains($0.id) }, orders.filter { closed($0) && !kept.contains($0.id) })
    }

    /// One es-SV number format for lab values on every screen («13.5», «452», at most three decimals, no grouping).
    public static func number(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "es_SV")
        formatter.numberStyle = .decimal
        formatter.usesGroupingSeparator = false
        formatter.maximumFractionDigits = 3
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    /// The value (or text) of a result; a number carries its unit when the exam has one («5.1 g/dL»).
    public static func valueText(_ result: LabItemResult?, unit: String? = nil) -> String {
        guard let result else { return "—" }
        if let value = result.value {
            let shown = number(value)
            guard let unit, !unit.isEmpty else { return shown }
            return "\(shown) \(unit)"
        }
        return result.text ?? "—"
    }

    /// D1: the range a patient sees next to a released result, never the critical limits (the API does not send them
    /// to the patient either). «12–15.5»; nil without limits.
    public static func patientRangeText(_ range: LabItemRange?) -> String? {
        guard let range else { return nil }
        return rangeText(LabItemRange(min: range.min, max: range.max, criticalLow: nil, criticalHigh: nil))
    }

    /// D1: the result fell outside its reference range (high, low or critical); `sin_rango` and `normal` are not.
    public static func outOfRange(_ mark: ResultMark?) -> Bool {
        guard let mark else { return false }
        return [.alto, .bajo, .criticoAlto, .criticoBajo].contains(mark)
    }

    /// «12–15.5 · crítico < 7 o > 20» for doctors; nil without limits.
    public static func rangeText(_ range: LabItemRange?) -> String? {
        guard let range else { return nil }
        var normal: String?
        if let min = range.min, let max = range.max { normal = "\(number(min))–\(number(max))" }
        else if let max = range.max { normal = "≤ \(number(max))" }
        else if let min = range.min { normal = "≥ \(number(min))" }
        let limits = [range.criticalLow.map { "< \(number($0))" }, range.criticalHigh.map { "> \(number($0))" }].compactMap { $0 }
        let parts = [normal, limits.isEmpty ? nil : "crítico " + limits.joined(separator: " o ")].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// Fase 2, flujo A (S8): el paciente pide cita por motivo (una a tres categorías), franja preferida y nota; el médico es
/// opcional y recepción asigna médico y hora. iOS no tiene rol de recepción: solo cubre el lado del paciente.
public enum CategoryRequestRules {
    public static let path = "/citas/solicitudes-categoria"
    public static let categoriesPath = "/citas/categorias"
    public static let maxCategories = 3
    public static let noteMax = 280

    public static func cancelPath(_ id: String) -> String { "\(path)/\(id)/cancelar" }

    private static func fold(_ text: String) -> String {
        text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es")).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Búsqueda sin tildes en nombre, descripción, palabras clave y especialidades; las elegidas siempre quedan a la vista.
    public static func filter(_ categories: [AppointmentCategory], query: String, picked: [String] = []) -> [AppointmentCategory] {
        let needle = fold(query)
        guard !needle.isEmpty else { return categories }
        return categories.filter { c in
            picked.contains(c.code) || fold([c.name, c.description, c.keywords, c.specialties.joined(separator: " ")].joined(separator: " ")).contains(needle)
        }
    }

    /// De una a tres: una cuarta se ignora y tocar una elegida la quita.
    public static func toggle(_ picked: [String], _ code: String) -> [String] {
        if picked.contains(code) { return picked.filter { $0 != code } }
        return picked.count >= maxCategories ? picked : picked + [code]
    }

    public static func canSend(picked: [String], note: String) -> Bool { !picked.isEmpty && note.count <= noteMax }

    public static func body(picked: [String], franja: RequestFranja, note: String, preferredDoctorId: String?) -> CategoryRequestBody {
        let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let doctor = preferredDoctorId?.trimmingCharacters(in: .whitespacesAndNewlines)
        return CategoryRequestBody(categories: picked, franja: franja, note: text.isEmpty ? nil : text, preferredDoctorId: (doctor?.isEmpty ?? true) ? nil : doctor)
    }

    /// Médicos que coinciden con lo escrito (nombre o especialidad), para la opción secundaria "Ya tengo médico".
    public static func doctors(_ doctors: [AppointmentCatalogs.Doctor], query: String, limit: Int = 6) -> [AppointmentCatalogs.Doctor] {
        let needle = fold(query)
        guard !needle.isEmpty else { return [] }
        return Array(doctors.filter { $0.active && fold("\($0.fullName) \($0.specialty ?? "")").contains(needle) }.prefix(limit))
    }

    /// Stable category key to its web glyph (`CategoryGlyph` in category.tsx); `general` and unknown keys use the
    /// stethoscope, like the web.
    public static func icon(_ icon: String) -> ClimesaIconName {
        switch icon {
        case "nino": return .catNino
        case "mujer": return .catMujer
        case "corazon": return .catCorazon
        case "hueso": return .catHueso
        case "piel": return .catPiel
        case "ojo": return .catOjo
        case "oido": return .catOido
        case "mente": return .catMente
        case "neuro": return .catNeuro
        case "digestivo": return .catDigestivo
        case "rinon": return .catRinon
        case "alergia": return .catAlergia
        case "cirugia": return .catCirugia
        default: return .steth
        }
    }

    /// Identity tone of a category (web `categoryTone`); unknown keys are slate.
    public static func tone(_ icon: String) -> IdentityTone {
        switch icon {
        case "nino", "piel": return .amber
        case "mujer": return .magenta
        case "corazon": return .red
        case "hueso", "alergia": return .orange
        case "ojo": return .blue
        case "oido": return .teal
        case "mente": return .purple
        case "neuro": return .indigo
        case "digestivo": return .green
        case "rinon": return .cyan
        default: return .slate
        }
    }

    /// Clave de Localizable.xcstrings con el estado de la solicitud.
    public static func stateKey(_ state: String) -> String { "appointments.category.state.\(state)" }

    /// Status family value of the request's badge, as the web `REQUEST_STATE`: pending waits, an assigned request
    /// reads as a confirmed appointment, rejected and withdrawn are closed.
    public static func badgeValue(_ state: String) -> String {
        switch state {
        case "pendiente": return "en_espera"
        case "asignada": return "confirmada"
        case "rechazada": return "rechazada"
        case "cancelada": return "cancelada"
        default: return state
        }
    }
}

/// Appointments of one El Salvador day, for lists grouped like the agenda.
public struct AppointmentDay: Equatable, Sendable, Identifiable {
    /// `yyyy-MM-dd` in El Salvador.
    public let day: String
    public let appointments: [Appointment]
    public var id: String { day }
}

public extension AppointmentRules {
    /// Consecutive appointments grouped by their local day, keeping the given order (upcoming soonest first, past latest
    /// first). An unreadable start keeps its own group under its raw text.
    static func byDay(_ appointments: [Appointment]) -> [AppointmentDay] {
        var days: [AppointmentDay] = []
        for item in appointments {
            let day = ClimesaDates.parse(item.start).map(ClimesaDates.localDay) ?? item.start
            if let last = days.last, last.day == day {
                days[days.count - 1] = AppointmentDay(day: day, appointments: last.appointments + [item])
            } else {
                days.append(AppointmentDay(day: day, appointments: [item]))
            }
        }
        return days
    }
}

// MARK: - Lote 5 S16: «Pedir cita» grouped by body area (Android `CategoryGroups`)

/// Sections of «Pedir cita», in display order. They only group the catalog of `GET /citas/categorias`; no code is invented.
public enum CategoryGroup: String, CaseIterable, Sendable {
    case cuerpo, interno, mente, sentidos, general

    public var title: String {
        switch self {
        case .cuerpo: return "Cuerpo: cabeza, torso y extremidades"
        case .interno: return "Interno y digestivo"
        case .mente: return "Mente y emociones"
        case .sentidos: return "Sentidos: vista, oído, nariz y garganta"
        case .general: return "General"
        }
    }
}

public struct CategorySection: Equatable, Sendable, Identifiable {
    public let group: CategoryGroup
    public let categories: [AppointmentCategory]
    public var id: String { group.rawValue }
}

public enum CategoryGroups {
    /// Real codes of `citas.categoria_motivo`; a code the server adds later falls in General.
    private static let byCode: [String: CategoryGroup] = [
        "cabeza_nervios": .cuerpo, "corazon": .cuerpo, "huesos": .cuerpo, "piel": .cuerpo,
        "digestivo": .interno, "rinon_urinario": .interno, "alergias": .interno,
        "salud_mental": .mente,
        "ojos": .sentidos, "oido_garganta": .sentidos,
        "consulta_general": .general, "ninos": .general, "mujer_embarazo": .general, "cirugia": .general
    ]

    public static func groupOf(_ code: String) -> CategoryGroup { byCode[code] ?? .general }

    /// Non-empty sections in `CategoryGroup` order; inside each, the server's order.
    public static func sections(_ categories: [AppointmentCategory]) -> [CategorySection] {
        CategoryGroup.allCases.compactMap { group in
            let rows = categories.filter { groupOf($0.code) == group }
            return rows.isEmpty ? nil : CategorySection(group: group, categories: rows)
        }
    }
}
