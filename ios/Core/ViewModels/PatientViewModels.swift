import Foundation
import Observation

/// I07 · Mis exámenes (S13): reads `GET /me/laboratorio`; once the results are on screen they count as seen, so
/// «Resultados nuevos» on Inicio goes back to 0 (G6, stored on the device, G-7).
@MainActor @Observable
public final class PatientExamsViewModel {
    public let loader = Loader<[LabOrder]>()
    /// Set by the view to the session's client; until then every call fails with `APIFailure.transport`.
    @ObservationIgnored public var client: ClinicalAPIProvider = { throw APIFailure.transport }
    /// Where «seen» is written; tests replace it.
    @ObservationIgnored public var markSeen: @MainActor (_ user: String, _ at: Date) -> Void = { user, at in
        _ = DraftStore.shared.save(PatientResultsRules.Seen(at: at), user: user, key: PatientResultsRules.seenKey)
    }

    nonisolated public init() {}

    public func load(user: String, now: Date = Date()) async {
        await loader.load { try await client().get("/me/laboratorio", as: [LabOrder].self) }
        if loader.value != nil { markSeen(user, now) }
    }
}

/// I09 · Pedir ambulancia (S13): the request form, the own requests (`GET /ambulancia/solicitudes/mias`), the prefill
/// from «Mis datos» and the cancel. The view only draws this state and calls these methods.
@MainActor @Observable
public final class AmbulanceRequestViewModel {
    public let loader = Loader<[OwnAmbulanceRequest]>()
    public let submission = Submission()
    public var cancelling: OwnAmbulanceRequest? = nil
    public var cancelReason = ""
    public var address = ""
    public var municipality = ""
    public var reason = ""
    public var phone = ""
    public private(set) var errors: [String: String] = [:]
    /// S13: the notice naming what the contact on file filled (address, phone or both), to say where it came from.
    public private(set) var prefillNotice: String? = nil
    /// The prefill runs once per screen, so a field the patient cleared is not filled again when the view reappears.
    @ObservationIgnored private var didPrefill = false
    /// Set by the view to the session's client; until then every call fails with `APIFailure.transport`.
    @ObservationIgnored public var client: ClinicalAPIProvider = { throw APIFailure.transport }

    nonisolated public init() {}

    public func load() async {
        await loader.load { try await client().get("/ambulancia/solicitudes/mias", as: [OwnAmbulanceRequest].self) }
    }

    /// Fills address and phone from "Mis datos" (`GET /me/paciente`) without overwriting what was typed. Best effort:
    /// if the read fails, the form stays empty and works as before. `allowed`: a linked patient who may read «Mis datos».
    public func prefill(allowed: Bool) async {
        guard !didPrefill else { return }
        didPrefill = true
        guard allowed else { return }
        guard let patient = try? await client().get("/me/paciente", as: PatientProfile.self) else { return }
        // Recompute against the fields as they are now: the patient may have typed while the read was in flight.
        let filled = AmbulancePrefillRules.prefill(address: address, phone: phone, from: patient)
        address = filled.address
        phone = filled.phone
        prefillNotice = filled.noticeKey
    }

    /// «Cancelar solicitud» opens the sheet with an empty reason.
    public func askCancel(_ request: OwnAmbulanceRequest) {
        cancelReason = ""
        cancelling = request
    }

    public func cancel(_ request: OwnAmbulanceRequest, success: String?) async {
        let body = AmbulanceCancelBody(version: request.version, reason: cancelReason)
        let ok = await submission.run(request.id, body: body, success: success) { key in
            _ = try await client().send("POST", "/ambulancia/solicitudes/\(request.id)/cancelar", body: body, key: key, as: AmbulanceRequestStateResult.self)
        }
        if ok { cancelling = nil }
        await load()
    }

    public func send() async {
        errors = AmbulanceRules.errors(address: address, reason: reason, phone: phone)
        guard errors.isEmpty else { return }
        let body = AmbulanceRules.body(address: address, municipality: municipality, reason: reason, phone: phone)
        let ok = await submission.run(body: body) { key in
            _ = try await client().send("POST", "/ambulancia/solicitudes", body: body, key: key, as: AmbulanceRequestCreated.self)
        }
        if ok { await load() }
    }
}
