import Foundation
import Observation

/// Desde dónde se abre la consulta: una cita de la agenda o un número llamado de la fila.
public enum ConsultationOrigin: Sendable {
    case appointment(AgendaEntry)
    case ticket(QueueTicket)
    /// m-22: una consulta propia abierta de cualquier día (`GET /consultas/sin-firmar`).
    case resume(UnsignedConsultation)
}

/// I21 · Consulta (S13): the screen's reads and writes. It builds every method, path and body, and keeps the loaders
/// and the submissions (one `Idempotency-Key` per intent); `ConsultationView` keeps only what is typed and what it shows.
@MainActor @Observable
public final class ConsultationViewModel {
    public let detail = Loader<ConsultationDetail>()
    public let catalog = Loader<[LabExam]>()
    public let cieResults = Loader<[Cie10Entry]>()
    public let starting = Submission()
    public let saving = Submission()
    public let autosaving = Submission()
    public let diagnosing = Submission()
    public let prescribing = Submission()
    public let ordering = Submission()
    public let signing = Submission()
    public let handoffCall = Submission()
    public let undoing = Submission()
    /// B-6: this consultation's lab orders, read from the doctor's order list (the detail does not carry them). A failed
    /// read is never "no orders": ordering waits until the list is known, so an exam is not ordered twice.
    public private(set) var labOrders: Part<[LabOrder]>? = nil
    /// Set by the view to the session's client; until then every call fails with `APIFailure.transport`.
    @ObservationIgnored public var client: ClinicalAPIProvider = { throw APIFailure.transport }

    nonisolated public init() {}

    // MARK: - Lecturas

    /// This doctor's open consultations (asked before a new start); a failed read counts as none.
    public func unsignedConsultations() async -> [UnsignedConsultation] {
        (try? await client().get("/consultas/sin-firmar", as: [UnsignedConsultation].self)) ?? []
    }

    /// A resumed consultation finds its appointment in the agenda or its number in today's queue; best effort.
    public func resumedContext(appointmentId: String?, ticketId: String?, canReadAgenda: Bool, canReadQueue: Bool) async -> VisitContext? {
        guard let api = try? client() else { return nil }
        if let appointmentId, canReadAgenda,
           let agenda = try? await api.get("/consultas/agenda", as: [AgendaEntry].self),
           let entry = agenda.first(where: { $0.appointmentId == appointmentId }) {
            return ConsultationContextRules.of(appointment: entry, ticket: nil)
        }
        if let ticketId, canReadQueue,
           let tickets = try? await api.get("/fila", as: [QueueTicket].self),
           let ticket = tickets.first(where: { $0.id == ticketId }) {
            return ConsultationContextRules.of(appointment: nil, ticket: ticket)
        }
        return nil
    }

    public func loadDetail(consultationId id: String) async {
        await detail.load { try await client().get("/consultas/\(id)/detalle", as: ConsultationDetail.self) }
    }

    public func loadLabOrders(consultationId id: String) async {
        do {
            let orders = try await client().get("/laboratorio/ordenes", as: [LabOrder].self)
            labOrders = .loaded(ConsultationRecordRules.labOrders(orders, consultationId: id))
        } catch is CancellationError {
        } catch {
            labOrders = .failed(error.userMessage)
        }
    }

    public func loadCatalog() async {
        await catalog.load { try await client().get("/laboratorio/catalogo", as: [LabExam].self) }
    }

    /// Fase 2R: the CIE-10 search (`GET /consultas/cie10`); a query too short clears the results.
    public func searchCie(_ text: String) async {
        guard let query = Cie10SearchRules.query(text) else { cieResults.clear(); return }
        await cieResults.load { try await client().get(Cie10SearchRules.path(query), as: [Cie10Entry].self) }
    }

    // MARK: - Escrituras

    /// I-18: starts the consultation of the appointment or the ticket. Returns the consultation to open: the new one, the
    /// one being resumed, or the one this doctor already started (`consulta_ya_iniciada`); nil when the start failed.
    public func start(_ origin: ConsultationOrigin) async -> String? {
        let body: ConsultationStartBody
        switch origin {
        case let .appointment(entry): body = ConsultationStartBody(appointmentId: entry.appointmentId)
        case let .ticket(ticket): body = ConsultationStartBody(ticketId: ticket.id)
        // Ya existe: no se vuelve a iniciar.
        case let .resume(open): return open.id
        }
        var started: ConsultationStartResult?
        let ok = await starting.run(body: body) { key in
            started = try await client().send("POST", "/consultas", body: body, key: key, as: ConsultationStartResult.self)
        }
        if ok, let started { return started.id }
        // Ya estaba iniciada por este médico (otro toque, la web o una visita anterior a este número): se retoma.
        if let existing = starting.lastFailure?.resumableConsultationId {
            starting.error = nil
            return existing
        }
        return nil
    }

    /// Lote 5 S12: the autosave PATCH (its own intent, "autosave"); nil when it did not go through.
    public func autosave(consultationId id: String, version: Int, reason: String, exam: String, plan: String) async -> ConsultationCommandResult? {
        await update(autosaving, intent: "autosave", consultationId: id, version: version, reason: reason, exam: exam, plan: plan)
    }

    /// «Guardar borrador» and the save before signing (one intent per consultation); nil when it did not go through.
    public func save(consultationId id: String, version: Int, reason: String, exam: String, plan: String) async -> ConsultationCommandResult? {
        await update(saving, intent: id, consultationId: id, version: version, reason: reason, exam: exam, plan: plan)
    }

    private func update(_ submission: Submission, intent: String, consultationId id: String, version: Int,
                        reason: String, exam: String, plan: String) async -> ConsultationCommandResult? {
        let body = ConsultationUpdateBody(version: version, reason: reason, physicalExam: exam, plan: plan)
        var saved: ConsultationCommandResult?
        let ok = await submission.run(intent, body: body) { key in
            saved = try await client().send("PATCH", "/consultas/\(id)", body: body, key: key, as: ConsultationCommandResult.self)
        }
        return ok ? saved : nil
    }

    /// Adds a CIE-10 diagnosis; returns what the API created, nil when it did not go through.
    public func addDiagnosis(consultationId id: String, code: String, principal: Bool, note: String?) async -> DiagnosisCreated? {
        let body = DiagnosisBody(code: code, principal: principal, note: note)
        var created: DiagnosisCreated?
        let ok = await diagnosing.run(body: body) { key in
            created = try await client().send("POST", "/consultas/\(id)/diagnosticos", body: body, key: key, as: DiagnosisCreated.self)
        }
        return ok ? created : nil
    }

    @discardableResult
    public func prescribe(consultationId id: String, items: [PrescriptionItemBody], success: String?) async -> Bool {
        let body = PrescriptionBody(items: items)
        return await prescribing.run(body: body, success: success) { key in
            _ = try await client().send("POST", "/consultas/\(id)/receta", body: body, key: key, as: Prescription.self)
        }
    }

    @discardableResult
    public func orderLab(consultationId id: String, exams: [String], priority: LabPriority, success: String?) async -> Bool {
        let body = LabOrderBody(consultationId: id, exams: exams, priority: priority)
        return await ordering.run(body: body, success: success) { key in
            _ = try await client().send("POST", "/laboratorio/ordenes", body: body, key: key, as: LabOrderCreated.self)
        }
    }

    /// Signs at `version`; returns the API's answer (with `nextProposal`), nil when it did not go through.
    public func sign(consultationId id: String, version: Int, success: String?) async -> ConsultationCommandResult? {
        let body = VersionBody(version: version)
        var signed: ConsultationCommandResult?
        let ok = await signing.run(id, body: body, success: success) { key in
            signed = try await client().send("POST", "/consultas/\(id)/firmar", body: body, key: key, as: ConsultationCommandResult.self)
        }
        return ok ? signed : nil
    }

    /// S9: calls the number proposed after signing; nil when the call did not go through.
    public func call(_ proposal: QueueProposedTicket) async -> QueueCallResult? {
        let body = VersionBody(version: proposal.version)
        var result: QueueCallResult?
        let ok = await handoffCall.run(proposal.id, body: body) { key in
            result = try await client().send("POST", "/fila/\(proposal.id)/llamar", body: body, key: key, as: QueueCallResult.self)
        }
        if ok { undoing.clearFailure() }
        return ok ? result : nil
    }

    @discardableResult
    public func undoCall(ticketId id: String, version: Int, success: String?) async -> Bool {
        let body = VersionBody(version: version)
        return await undoing.run(id, body: body, success: success) { key in
            _ = try await client().send("POST", "/fila/\(id)/deshacer-llamado", body: body, key: key, as: QueueTransitionResult.self)
        }
    }
}
