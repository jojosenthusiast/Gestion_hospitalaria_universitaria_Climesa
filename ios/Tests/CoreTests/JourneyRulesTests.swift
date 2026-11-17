import XCTest
@testable import ClimesaCore

/// R7 U4: the "Comprobaciones" of odd/tasks/fase2-recorridos-auditoria.md for the iOS journeys, at rule level.
final class JourneyRulesTests: XCTestCase {
    private let now = ClimesaDates.parse("2026-11-20T15:00:00Z")! // 09:00 in El Salvador

    private func appointment(_ id: String, _ start: String, _ state: AppointmentState = .confirmada) -> Appointment {
        let json = #"{"id":"\#(id)","patientId":"p1","patientName":null,"doctorId":"d1","doctorName":"Médico Ficticio","start":"\#(start)","end":"\#(start)","reason":null,"state":"\#(state.rawValue)","origin":"paciente","rejectionReason":null,"version":1}"#
        return try! JSONDecoder().decode(Appointment.self, from: Data(json.utf8))
    }

    private func order(_ id: String, consultation: String = "k1", state: String = "completado", reviewedAt: String? = nil,
                       items: [(exam: String, code: String, name: String, value: Double?, mark: String?, unit: String?)]) -> LabOrder {
        let rows = items.enumerated().map { index, item -> String in
            let result = item.value.map { #"{"value":\#($0),"text":null,"mark":\#(item.mark.map { "\"\($0)\"" } ?? "null")}"# } ?? "null"
            let unit = item.unit.map { #","unit":"\#($0)""# } ?? ""
            return #"{"id":"\#(id)-\#(index)","examId":"\#(item.exam)","code":"\#(item.code)","name":"\#(item.name)","result":\#(result)\#(unit)}"#
        }.joined(separator: ",")
        let reviewed = reviewedAt.map { "\"\($0)\"" } ?? "null"
        let json = #"{"id":"\#(id)","consultationId":"\#(consultation)","patientId":"p1","doctorId":"d1","priority":"rutina","state":"\#(state)","createdAt":"2026-11-20T10:00:00Z","sampleTakenAt":null,"completedAt":null,"reviewedAt":\#(reviewed),"version":2,"patientName":"Ana Pérez","items":[\#(rows)]}"#
        return try! JSONDecoder().decode(LabOrder.self, from: Data(json.utf8))
    }

    private func exam(_ id: String, _ code: String, _ name: String) -> LabExam {
        try! JSONDecoder().decode(LabExam.self, from: Data(#"{"id":"\#(id)","code":"\#(code)","name":"\#(name)","isPanel":false,"unit":null}"#.utf8))
    }

    private func ticket(_ id: String, number: Int, state: String = "llamado", calls: Int = 1, byMe: Bool? = nil, undo: Bool = true, allowed: [String] = []) -> QueueTicket {
        let me = byMe.map { #","calledByMe":\#($0)"# } ?? ""
        let undoable = undo ? #","undoActions":["deshacer_llamado"]"# : ""
        let actions = #","allowedActions":[\#(allowed.map { "\"\($0)\"" }.joined(separator: ","))]"#
        let json = #"{"id":"\#(id)","service":"consulta_general","fecha":"2026-11-20","numero":\#(number),"patientId":null,"patientName":"Paciente Ficticio","state":"\#(state)","officeId":null,"llamados":\#(calls),"version":3,"issuedAt":"2026-11-20T14:00:00Z","area":"CON"\#(me)\#(undoable)\#(actions)}"#
        return try! JSONDecoder().decode(QueueTicket.self, from: Data(json.utf8))
    }

    // MARK: - G6 Inicio del paciente

    func testCuentaSinVincularMuestraVincularPrimero() {
        XCTAssertEqual(PatientHomeRules.blocks(linked: false, hasTicket: false, appointmentToday: false).first, .link)
        XCTAssertEqual(PatientHomeRules.blocks(linked: true, hasTicket: true, appointmentToday: true), [.ticket, .today, .next, .results, .shortcuts])
    }

    func testHoyTienesCitaYLaSiguienteEsOtra() {
        let today = appointment("a", "2026-11-20T20:00:00Z") // 14:00 local, today
        let later = appointment("b", "2026-11-22T15:00:00Z")
        XCTAssertEqual(PatientHomeRules.appointmentToday([today, later], now: now)?.id, "a")
        XCTAssertEqual(PatientHomeRules.nextAppointment([today, later], now: now)?.id, "b")
        XCTAssertNil(PatientHomeRules.appointmentToday([later], now: now))
    }

    func testAccesosSegunPermisos() {
        let all = PatientHomeRules.shortcuts(linked: true) { _ in true }
        XCTAssertEqual(all, [.requestAppointment, .ambulance, .exams, .hospital])
        XCTAssertEqual(all.map(\.title), ["Pedir cita", "Pedir ambulancia", "Mis exámenes", "Hospital"])
        XCTAssertEqual(PatientHomeRules.shortcuts(linked: false) { _ in true }, [.requestAppointment, .ambulance, .hospital])
    }

    func testResultadoLiberadoHoyEsNuevoYBajaACeroAlVerlo() {
        let released = order("o1", reviewedAt: "2026-11-20T14:00:00Z", items: [])
        let old = order("o2", reviewedAt: "2026-11-01T14:00:00Z", items: [])
        let pending = order("o3", items: [])
        XCTAssertEqual(PatientResultsRules.newCount([released, old, pending], seenAt: nil, now: now), 1)
        XCTAssertEqual(PatientResultsRules.title(1), "Resultados nuevos (1)")
        XCTAssertEqual(PatientResultsRules.newCount([released, old, pending], seenAt: now, now: now), 0)
        let seen = PatientResultsRules.Seen(at: now)
        XCTAssertEqual(seen.date, now)
    }

    // MARK: - A4 / A5 Citas del paciente

    func testCancelarConChipSinTeclado() {
        XCTAssertEqual(PatientCancelReasons.chips, ["Ya no lo necesito", "No puedo a esa hora", "Otro"])
        let reason = PatientCancelReasons.reason(chip: "No puedo a esa hora", otherText: "")
        XCTAssertEqual(reason, "No puedo a esa hora")
        // The API still asks for 10 characters: every quick reason already has them.
        for chip in PatientCancelReasons.quick { XCTAssertNil(AppointmentRules.cancelReasonError(chip), chip) }
        XCTAssertNil(PatientCancelReasons.reason(chip: nil, otherText: "algo"))
    }

    func testOtroPideTresCaracteresYCumpleElMinimoDeLaAPI() {
        XCTAssertNil(PatientCancelReasons.reason(chip: "Otro", otherText: "ab"))
        XCTAssertEqual(PatientCancelReasons.otherError("ab"), "Escribe al menos 3 caracteres.")
        XCTAssertNil(PatientCancelReasons.otherError(""))
        let reason = PatientCancelReasons.reason(chip: "Otro", otherText: " viaje ")
        XCTAssertEqual(reason, "Otro motivo: viaje")
        XCTAssertNil(AppointmentRules.cancelReasonError(reason ?? ""))
        XCTAssertEqual(PatientCancelReasons.reason(chip: "Otro", otherText: String(repeating: "x", count: 600))?.count, 500)
    }

    func testAnterioresPlegadasConSuConteo() {
        let list = [appointment("f", "2026-11-25T15:00:00Z"), appointment("p1", "2026-11-01T15:00:00Z", .atendida),
                    appointment("p2", "2026-11-02T15:00:00Z", .atendida), appointment("p3", "2026-11-03T15:00:00Z", .cancelada)]
        let split = AppointmentRules.split(list, now: now)
        XCTAssertEqual(split.upcoming.map(\.id), ["f"])
        XCTAssertEqual(AppointmentRules.pastTitle(split.past.count), "Anteriores (3)")
    }

    func testReprogramarConChipsDeDias() {
        let days = DayChipRules.days(from: now, count: 7)
        XCTAssertEqual(days.first, "2026-11-20")
        XCTAssertEqual(days.count, 7)
        XCTAssertEqual(days.last, "2026-11-26")
        XCTAssertEqual(DayChipRules.label("2026-11-20", today: now), "Hoy")
        XCTAssertEqual(DayChipRules.label("2026-11-21", today: now), "Mañana")
        XCTAssertTrue(DayChipRules.label("2026-11-23", today: now).hasSuffix("23"))
        // Late at night in El Salvador is still the same local day (UTC is already tomorrow).
        XCTAssertEqual(DayChipRules.days(from: ClimesaDates.parse("2026-11-21T05:30:00Z")!, count: 1), ["2026-11-20"])
    }

    // MARK: - B5 Mi turno

    func testPersonasAntesDeTi() {
        XCTAssertEqual(PatientTurnRules.aheadText(3), "3 personas antes de ti")
        XCTAssertEqual(PatientTurnRules.aheadText(1), "1 persona antes de ti")
        XCTAssertEqual(PatientTurnRules.aheadText(0), "Eres el siguiente")
    }

    func testAlSerLlamadoPantallaCompletaUnaVezPorLlamado() {
        XCTAssertEqual(PatientTurnRules.calledTitle(office: "Consultorio 2"), "Pasa al Consultorio 2")
        XCTAssertEqual(PatientTurnRules.calledTitle(office: "2"), "Pasa al consultorio 2")
        XCTAssertEqual(PatientTurnRules.calledTitle(office: nil), "Es tu turno")
        let called = ticket("t", number: 12)
        XCTAssertTrue(PatientTurnRules.shouldPresent(called, dismissed: nil))
        XCTAssertFalse(PatientTurnRules.shouldPresent(called, dismissed: PatientTurnRules.callKey(called)))
        // Called again: one more call shows it again.
        XCTAssertTrue(PatientTurnRules.shouldPresent(ticket("t", number: 12, calls: 2), dismissed: PatientTurnRules.callKey(called)))
        XCTAssertFalse(PatientTurnRules.shouldPresent(ticket("t", number: 12, state: "en_espera"), dismissed: nil))
    }

    // MARK: - B3 Fila del médico

    func testLaReglaSeExplicaSinElTextoDelServidor() {
        XCTAssertEqual(NextRuleText.lines.first, "1. Emergencias")
        XCTAssertEqual(NextRuleText.lines.count, 4)
    }

    func testLlamarDosYDeshacerElPrimeroDejaElSegundoLlamado() {
        let first = ticket("a", number: 7), second = ticket("b", number: 8)
        XCTAssertTrue(DoctorDayActionRules.canUndo(first, calledHere: ["a", "b"]))
        XCTAssertTrue(DoctorDayActionRules.canUndo(second, calledHere: ["a", "b"]))
        // After undoing the first, the server returns it to waiting; the second keeps its own undo.
        let back = ticket("a", number: 7, state: "en_espera", undo: false)
        XCTAssertFalse(DoctorDayActionRules.canUndo(back, calledHere: ["a", "b"]))
        XCTAssertTrue(DoctorDayActionRules.canUndo(second, calledHere: ["b"]))
        // A number another person called has no undo here; calledByMe from the server counts too.
        XCTAssertFalse(DoctorDayActionRules.canUndo(ticket("c", number: 9), calledHere: []))
        XCTAssertTrue(DoctorDayActionRules.canUndo(ticket("c", number: 9, byMe: true), calledHere: []))
        XCTAssertEqual(DoctorDayActionRules.undoDone(first), "CON 7 devuelto a espera")
        XCTAssertEqual(DoctorDayActionRules.undoDone(ticket("a", number: 7, calls: 2)), "CON 7 con un llamado menos")
    }

    func testNoSePresentoDiferidoSoloSiSigueAplicando() {
        XCTAssertEqual(DoctorDayActionRules.absencePending(ticket("a", number: 7)), "CON 7 se marcará como no se presentó")
        XCTAssertTrue(DoctorDayActionRules.absenceStillApplies(ticket("a", number: 7, allowed: ["no_se_presento"])))
        XCTAssertFalse(DoctorDayActionRules.absenceStillApplies(ticket("a", number: 7, state: "en_atencion", allowed: ["no_se_presento"])))
        XCTAssertFalse(DoctorDayActionRules.absenceStillApplies(nil))
    }

    // MARK: - B4 Consulta

    func testOrdenarHemogramaYVolverNoPermiteRepetirlo() {
        let hemo = exam("e1", "HEM", "Hemograma"), glucose = exam("e2", "GLU", "Glucosa")
        let orders = ConsultationRecordRules.labOrders([order("o1", state: "pendiente", items: [("e1", "HEM", "Hemograma", nil, nil, nil)]),
                                                        order("o2", consultation: "otra", state: "pendiente", items: [("e2", "GLU", "Glucosa", nil, nil, nil)]),
                                                        order("o3", state: "cancelado", items: [("e2", "GLU", "Glucosa", nil, nil, nil)])], consultationId: "k1")
        XCTAssertEqual(orders.map(\.id), ["o1"])
        let repeated = ConsultationRecordRules.repeated(selected: ["e1", "e2"], catalog: [hemo, glucose], orders: orders, orderedHere: [])
        XCTAssertEqual(repeated.map(\.id), ["e1"])
        XCTAssertEqual(ConsultationRecordRules.repeatError(repeated), "Ya ordenaste Hemograma en esta consulta.")
        // Ordered from this device and not yet in the list: still blocked.
        XCTAssertTrue(ConsultationRecordRules.alreadyOrdered(glucose, orders: [], orderedHere: ["e2"]))
        XCTAssertEqual(ConsultationRecordRules.stepCount(.recetaExamenes, diagnoses: 0, prescriptions: 0, labOrders: orders.count), 1)
    }

    func testListaDeOrdenesIlegibleBloqueaOrdenarConElMotivo() {
        XCTAssertEqual(ConsultationRecordRules.orderBlocker(canReadOrders: true, ordersKnown: false), ConsultationRecordRules.ordersUnknown)
        XCTAssertNil(ConsultationRecordRules.orderBlocker(canReadOrders: true, ordersKnown: true))
        XCTAssertNil(ConsultationRecordRules.orderBlocker(canReadOrders: false, ordersKnown: false))
    }

    func testFirmarDiceLoQueFaltaYResume() {
        XCTAssertEqual(ConsultationRecordRules.signBlocker(reason: "", plan: ""), "Para firmar falta el motivo de consulta y el plan.")
        XCTAssertEqual(ConsultationRecordRules.signBlocker(reason: "Tos", plan: " "), "Para firmar falta el plan.")
        XCTAssertEqual(ConsultationRecordRules.stepFor(reason: "Tos", plan: ""), .procedimientos)
        XCTAssertNil(ConsultationRecordRules.signBlocker(reason: "Tos", plan: "Reposo"))
        let recap = ConsultationRecordRules.signRecap(diagnoses: 2, prescriptions: 1, labOrders: 1, notesPending: false, unsentWork: false)
        XCTAssertEqual(recap, "Se firma con 2 diagnósticos, 1 receta y 1 orden de laboratorio. La consulta queda cerrada y ya no se puede editar.")
        XCTAssertEqual(ConsultationRecordRules.stepCount(.consulta, diagnoses: 2, prescriptions: 1, labOrders: 1), 2)
        XCTAssertNil(ConsultationRecordRules.stepCount(.cierre, diagnoses: 2, prescriptions: 1, labOrders: 1))
    }

    // MARK: - C1 Revisar y liberar

    func testLiberarConfirmaConResumenDeLoQueVeraElPaciente() {
        let released = order("o1", items: [("e1", "HB", "Hemoglobina", 7.1, "critico_bajo", "g/dL"), ("e2", "GLU", "Glucosa", 90, "normal", "mg/dL")])
        let summary = ReleaseRules.summary(released)
        XCTAssertTrue(summary.hasPrefix("Ana Pérez verá: Hemoglobina 7.1 g/dL (crítico bajo), Glucosa 90 mg/dL."), summary)
        XCTAssertEqual(ReleaseRules.done(released), "Resultados revisados y liberados. Ana Pérez ya puede verlos.")
    }

    // MARK: - G3 Alta

    func testAltaConfirmaConResumen() {
        let recap = DischargeConfirmRules.signRecap(patient: "Ana Pérez", type: .medica, pendingCount: 1, summary: "Evolución favorable.")
        XCTAssertTrue(recap.hasPrefix("Alta de Ana Pérez · \(DischargeType.medica.label), con 1 pendiente. Resumen: Evolución favorable."), recap)
        XCTAssertEqual(DischargeConfirmRules.signedNotice, "Alta firmada. Recepción registrará la salida.")
    }
}
