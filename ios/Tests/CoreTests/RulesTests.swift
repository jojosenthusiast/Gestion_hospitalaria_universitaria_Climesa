import XCTest
@testable import ClimesaCore

final class PatientRulesTests: XCTestCase {
    private let today = ClimesaDates.parse("2026-11-20T15:00:00Z")!

    func testDuiConVerificador() {
        // 0123456 7: suma 0*9+1*8+2*7+3*6+4*5+5*4+6*3+7*2 = 112 -> verificador (10 - 2) % 10 = 8
        XCTAssertTrue(LinkRules.validDui("01234567-8"))
        XCTAssertFalse(LinkRules.validDui("01234567-9"))
        XCTAssertFalse(LinkRules.validDui("00000000-0"))
        XCTAssertEqual(LinkRules.formatDui("012345678"), "01234567-8")
    }

    func testFormularioDeVinculacion() {
        XCTAssertTrue(LinkRules.errors(dui: "01234567-8", birth: "1990-05-01", today: today).isEmpty)
        let errors = LinkRules.errors(dui: "123", birth: "2030-01-01", today: today)
        XCTAssertNotNil(errors["dui"])
        XCTAssertEqual(errors["birth"], "La fecha de nacimiento no puede ser futura.")
        XCTAssertEqual(LinkRules.errors(dui: "01234567-8", birth: "01/05/1990", today: today)["birth"], "Escribe la fecha como aaaa-mm-dd.")
        XCTAssertEqual(LinkRules.body(dui: "012345678", birth: " 1990-05-01 "), LinkRequestBody(dui: "01234567-8", birth: "1990-05-01"))
    }

    private func ticket(_ id: String, _ number: Int, _ state: QueueState, issued: String = "2026-11-20T14:00:00Z") -> QueueTicket {
        let json = #"{"id":"\#(id)","service":"consulta_general","fecha":"2026-11-20","numero":\#(number),"patientId":null,"patientName":null,"state":"\#(state.rawValue)","officeId":null,"llamados":0,"version":1,"issuedAt":"\#(issued)"}"#
        return try! JSONDecoder().decode(QueueTicket.self, from: Data(json.utf8))
    }

    func testFilaDelPaciente() {
        let tickets = [ticket("a", 3, .atendido, issued: "2026-11-20T13:00:00Z"), ticket("b", 15, .enEspera)]
        XCTAssertEqual(QueueRules.activeTicket(tickets)?.id, "b")
        let called = [PublicQueue.Called(number: 10, office: "Consultorio 2", calls: 1), PublicQueue.Called(number: 11, office: nil, calls: 1)]
        XCTAssertEqual(QueueRules.ahead(of: 15, called: called), 3)
        XCTAssertEqual(QueueRules.ahead(of: 9, called: called), 0)
        XCTAssertNil(QueueRules.ahead(of: 15, called: []))
        XCTAssertEqual(QueueRules.office(for: 10, called: called), "Consultorio 2")
    }

    func testSiguienteNumeroParaElMedico() {
        let tickets = [ticket("a", 7, .enEspera), ticket("b", 5, .enEspera), ticket("c", 2, .llamado)]
        XCTAssertEqual(QueueRules.nextToCall(tickets)?.id, "b")
        XCTAssertNil(QueueRules.nextToCall([ticket("c", 2, .llamado)]))
    }

    private func appointment(_ start: String, _ state: AppointmentState) -> Appointment {
        let json = #"{"id":"\#(start)","patientId":"p1","patientName":null,"doctorId":"d1","doctorName":"Médico Ficticio","start":"\#(start)","end":"\#(start)","reason":null,"state":"\#(state.rawValue)","origin":"paciente","rejectionReason":null,"version":1}"#
        return try! JSONDecoder().decode(Appointment.self, from: Data(json.utf8))
    }

    func testCitasProximasPasadasYCancelacion() {
        let future = appointment("2026-11-25T15:00:00.000Z", .confirmada)
        let past = appointment("2026-11-01T15:00:00.000Z", .atendida)
        let cancelled = appointment("2026-11-26T15:00:00.000Z", .cancelada)
        let split = AppointmentRules.split([past, cancelled, future], now: today)
        XCTAssertEqual(split.upcoming.map(\.id), [future.id])
        XCTAssertEqual(split.past.map(\.id), [cancelled.id, past.id])
        XCTAssertTrue(AppointmentRules.canCancel(future, now: today))
        XCTAssertFalse(AppointmentRules.canCancel(past, now: today))
        XCTAssertNotNil(AppointmentRules.cancelReasonError("corto"))
        XCTAssertNil(AppointmentRules.cancelReasonError("No puedo asistir ese día"))
    }

    func testSolicitudDeAmbulancia() {
        XCTAssertTrue(AmbulanceRules.errors(address: "Colonia Ficticia, casa 1", reason: "Dolor fuerte", phone: "7000-0000").isEmpty)
        let errors = AmbulanceRules.errors(address: "x", reason: "", phone: "12")
        XCTAssertEqual(Set(errors.keys), ["address", "reason", "contactPhone"])
        XCTAssertNil(AmbulanceRules.body(address: " Calle 1 ", municipality: " ", reason: "Caída", phone: "7000-0000").municipality)
    }

    func testValorDeLaboratorio() {
        XCTAssertEqual(PatientLabRules.valueText(LabItemResult(value: 13.5, text: nil, mark: .normal)), "13.5")
        XCTAssertEqual(PatientLabRules.valueText(LabItemResult(value: 7, text: nil, mark: nil)), "7")
        XCTAssertEqual(PatientLabRules.valueText(LabItemResult(value: nil, text: "Negativo", mark: nil)), "Negativo")
        XCTAssertEqual(PatientLabRules.valueText(nil), "—")
    }
}

final class DoctorRulesTests: XCTestCase {
    private func order(_ id: String, mark: String?, reviewed: Bool, completedAt: String) -> LabOrder {
        let result = mark.map { #"{"value":1,"text":null,"mark":"\#($0)","version":1}"# } ?? "null"
        let json = #"{"id":"\#(id)","consultationId":"k1","patientId":"p1","doctorId":"d1","priority":"rutina","state":"completado","createdAt":"2026-11-20T10:00:00Z","sampleTakenAt":null,"completedAt":"\#(completedAt)","reviewedAt":\#(reviewed ? "\"2026-11-20T18:00:00Z\"" : "null"),"version":1,"patientName":null,"items":[{"id":"i\#(id)","examId":"e1","code":"K","name":"Potasio","result":\#(result)}]}"#
        return try! JSONDecoder().decode(LabOrder.self, from: Data(json.utf8))
    }

    func testLosCriticosVanPrimeroYLosRevisadosNoAparecen() {
        let normal = order("1", mark: "normal", reviewed: false, completedAt: "2026-11-20T11:00:00Z")
        let critical = order("2", mark: "critico_alto", reviewed: false, completedAt: "2026-11-20T12:00:00Z")
        let reviewed = order("3", mark: "critico_bajo", reviewed: true, completedAt: "2026-11-20T09:00:00Z")
        XCTAssertEqual(ReviewRules.pending([normal, reviewed, critical]).map(\.id), ["2", "1"])
        XCTAssertTrue(ReviewRules.isCritical(critical))
        XCTAssertFalse(ReviewRules.isCritical(normal))
    }

    func testValidacionesDeConsultaYAlta() {
        XCTAssertNil(ConsultationRules.diagnosisCodeError("J06.9"))
        XCTAssertNotNil(ConsultationRules.diagnosisCodeError(" "))
        XCTAssertNotNil(ConsultationRules.prescriptionError(PrescriptionItemBody(medication: "Acetaminofén", dose: "", route: "oral", frequency: "c/8h", duration: "3 días", instructions: nil)))
        XCTAssertTrue(ConsultationRules.isEditable(.abierta))
        XCTAssertFalse(ConsultationRules.isEditable(.firmada))
        XCTAssertNotNil(DischargeRules.errors(type: .voluntaria, summary: "", voluntaryConsent: false, pending: [])["voluntaryConsent"])
        XCTAssertNotNil(DischargeRules.errors(type: .medica, summary: "", voluntaryConsent: false, pending: [DischargePendingBody(description: "Control", responsible: "")])["pending"])
        XCTAssertTrue(DischargeRules.errors(type: .medica, summary: "Evolución favorable, control en una semana.", voluntaryConsent: false, pending: []).isEmpty)
    }
}

final class DatesAndLiveTopicTests: XCTestCase {
    func testDiaLocalDeElSalvador() {
        // 2026-11-21T03:00Z es todavía el 20 en El Salvador (UTC-6).
        XCTAssertEqual(ClimesaDates.localDay(ClimesaDates.parse("2026-11-21T03:00:00.000Z")!), "2026-11-20")
        let range = ClimesaDates.dayRange(ClimesaDates.parse("2026-11-20T15:00:00Z")!)
        XCTAssertEqual(range.from, "2026-11-20T06:00:00.000Z")
        XCTAssertEqual(range.to, "2026-11-21T06:00:00.000Z")
        XCTAssertEqual(ClimesaDates.display(nil), "—")
    }

    func testCadaEventoInvalidaSuGrupo() {
        let fila = DomainEvent(type: "fila.actualizada", entity: "ticket_fila", id: "t1", version: 2)
        let next = LiveReducer.apply(.event(fila), to: LiveSnapshot())
        XCTAssertEqual(next.version(.queue), 1)
        XCTAssertEqual(next.version(.appointments), 0)
        XCTAssertEqual(next.lastEvent, fila)
        let link = DomainEvent(type: "vinculacion.resuelta", entity: "vinculacion_paciente", id: "v1", version: 2)
        let linked = LiveReducer.apply(.event(link), to: next)
        XCTAssertEqual(linked.profileVersion, 1)
        XCTAssertEqual(linked.version(.link), 1)
        XCTAssertEqual(InvalidationRule.topics(for: DomainEvent(type: "laboratorio.critico", entity: "orden_laboratorio", id: "o1", version: 1)), [.laboratory])
    }

    func testReconectarInvalidaTodo() {
        let next = LiveReducer.apply(.resync, to: LiveSnapshot())
        XCTAssertTrue(LiveTopic.allCases.allSatisfy { next.version($0) == 1 })
        XCTAssertEqual(next.version([.queue, .appointments]), 2)
    }
}
