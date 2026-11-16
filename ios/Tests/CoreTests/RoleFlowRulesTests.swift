import XCTest
@testable import ClimesaCore

/// Fase 2, S13 (iOS): one primary action per screen, prefilled forms and filters that apply on change.
final class RoleFlowRulesTests: XCTestCase {
    private func ticket(_ id: String, state: String, number: Int, service: String = "consulta_general") -> QueueTicket {
        let json = #"{"id":"\#(id)","service":"\#(service)","fecha":"2026-11-20","numero":\#(number),"patientId":null,"patientName":"Paciente Ficticio","state":"\#(state)","officeId":null,"llamados":1,"version":3,"issuedAt":"2026-11-20T14:00:00Z"}"#
        return try! JSONDecoder().decode(QueueTicket.self, from: Data(json.utf8))
    }

    private func patient(phone: String?, address: String?) -> PatientProfile {
        let phoneJSON = phone.map { "\"\($0)\"" } ?? "null"
        let addressJSON = address.map { "\"\($0)\"" } ?? "null"
        let json = #"{"id":"p1","record":"EXP-1","fullName":"Paciente Ficticio","givenNames":"Paciente","surnames":"Ficticio","sex":"F","version":2,"birth":null,"dui":null,"phone":\#(phoneJSON),"email":null,"address":\#(addressJSON)}"#
        return try! JSONDecoder().decode(PatientProfile.self, from: Data(json.utf8))
    }

    // MARK: - I21 consultation

    func testConsultaAbiertaFirmarEsLaUnicaAccionPrincipal() {
        XCTAssertEqual(ConsultationActionRules.primary(editable: true, canCallProposed: false), .sign)
        for action in [ConsultationAction.save, .addDiagnosis, .issuePrescription, .orderLab] {
            XCTAssertEqual(ConsultationActionRules.emphasis(action, editable: true, canCallProposed: false), .secondary, "\(action) competes with «Firmar»")
        }
        XCTAssertEqual(ConsultationActionRules.emphasis(.sign, editable: true, canCallProposed: false), .primary)
    }

    func testConsultaFirmadaLlamarAlSiguienteEsLaPrincipal() {
        XCTAssertEqual(ConsultationActionRules.primary(editable: false, canCallProposed: true), .callNext)
        XCTAssertEqual(ConsultationActionRules.emphasis(.callNext, editable: false, canCallProposed: true), .primary)
        XCTAssertNil(ConsultationActionRules.primary(editable: false, canCallProposed: false))
    }

    func testLaConfirmacionDeFirmarResumeLoQueVaAPasar() {
        XCTAssertEqual(ConsultationActionRules.signSummary(notesPending: false, unsentWork: false), "La consulta queda cerrada y ya no se puede editar.")
        let both = ConsultationActionRules.signSummary(notesPending: true, unsentWork: true)
        XCTAssertTrue(both.contains("Las notas sin guardar se guardan antes de firmar."))
        XCTAssertTrue(both.contains("no se incluyen"))
    }

    // MARK: - I20 doctor's day

    func testMiDiaAtenderAlLlamadoGanaALlamarSiguiente() {
        let tickets = [ticket("a", state: "en_espera", number: 3), ticket("b", state: "llamado", number: 5), ticket("c", state: "llamado", number: 4)]
        XCTAssertEqual(DoctorDayActionRules.primary(tickets: tickets, canAttend: true, canCallNext: true), .attend("c"))
    }

    func testMiDiaEnAtencionVaAntesQueUnLlamado() {
        let tickets = [ticket("b", state: "llamado", number: 2), ticket("d", state: "en_atencion", number: 9)]
        XCTAssertEqual(DoctorDayActionRules.primary(tickets: tickets, canAttend: true, canCallNext: true), .attend("d"))
    }

    func testMiDiaSinLlamadosLlamarSiguienteEsLaPrincipal() {
        let tickets = [ticket("a", state: "en_espera", number: 3)]
        XCTAssertEqual(DoctorDayActionRules.primary(tickets: tickets, canAttend: true, canCallNext: true), .callNext)
        XCTAssertNil(DoctorDayActionRules.primary(tickets: [], canAttend: true, canCallNext: true), "nobody waiting: no primary")
        XCTAssertNil(DoctorDayActionRules.primary(tickets: tickets, canAttend: true, canCallNext: false))
        XCTAssertEqual(DoctorDayActionRules.primary(tickets: [ticket("b", state: "llamado", number: 2)] + tickets, canAttend: false, canCallNext: true), .callNext,
                       "without consulta.iniciar the call is still the next step")
    }

    // MARK: - I24 discharge confirmation

    func testLaConfirmacionDelAltaDiceTipoYPendientes() {
        XCTAssertEqual(DischargeConfirmRules.signSummary(type: .medica, pendingCount: 0),
                       "Se firma un alta de tipo «Médica» sin pendientes. Se puede revocar mientras el paciente no haya salido.")
        XCTAssertTrue(DischargeConfirmRules.signSummary(type: .voluntaria, pendingCount: 1).contains("con 1 pendiente."))
        XCTAssertTrue(DischargeConfirmRules.signSummary(type: .traslado, pendingCount: 3).contains("con 3 pendientes."))
    }

    // MARK: - I09 ambulance request prefill

    func testSolicitudDeAmbulanciaSePrellenaConLosDatosDelPaciente() {
        let filled = AmbulancePrefillRules.prefill(address: "", phone: "", from: patient(phone: " 7000-0000 ", address: "Col. Ficticia, casa 1"))
        XCTAssertEqual(filled.address, "Col. Ficticia, casa 1")
        XCTAssertEqual(filled.phone, "7000-0000")
    }

    func testElPrellenadoNuncaPisaLoQueYaEscribio() {
        let kept = AmbulancePrefillRules.prefill(address: "Otra dirección", phone: "2222-2222", from: patient(phone: "7000-0000", address: "Col. Ficticia"))
        XCTAssertEqual(kept.address, "Otra dirección")
        XCTAssertEqual(kept.phone, "2222-2222")
        let none = AmbulancePrefillRules.prefill(address: "", phone: "", from: patient(phone: nil, address: "  "))
        XCTAssertEqual(none.address, "")
        XCTAssertEqual(none.phone, "")
        let noProfile = AmbulancePrefillRules.prefill(address: "", phone: "", from: nil)
        XCTAssertEqual(noProfile.phone, "")
    }

    // MARK: - Ambulance log filters

    func testLosFiltrosDeLaBitacoraSeAplicanAlCambiar() {
        var query = AmbulanceLogQuery()
        let initial = query.autoApplyKey
        query.priority = .roja
        XCTAssertNotEqual(query.autoApplyKey, initial, "a priority change applies without «Aplicar»")
        let withPriority = query.autoApplyKey
        query.finalState = AmbulanceFinalState.allCases.first
        XCTAssertNotEqual(query.autoApplyKey, withPriority)
        let withState = query.autoApplyKey
        query.from = "2026-11-01"
        XCTAssertNotEqual(query.autoApplyKey, withState)
    }

    func testElTextoLibreSeAplicaAlBuscarNoEnCadaTecla() {
        var query = AmbulanceLogQuery()
        let initial = query.autoApplyKey
        query.text = "San Salvador"
        XCTAssertEqual(query.autoApplyKey, initial)
        XCTAssertTrue(query.path.contains("q=San"), "the typed text still travels with the next request")
    }
}
