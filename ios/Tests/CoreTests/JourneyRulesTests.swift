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
        XCTAssertEqual(PatientCancelReasons.code(chip: "Ya no lo necesito"), "ya_no_lo_necesito")
        XCTAssertEqual(PatientCancelReasons.code(chip: "No puedo a esa hora"), "no_puedo_a_esa_hora")
        XCTAssertEqual(PatientCancelReasons.code(chip: "Otro"), "otro")
        XCTAssertNil(PatientCancelReasons.code(chip: nil))
        // The released body keeps the 10-character rule: every quick reason already has 10 characters.
        for chip in PatientCancelReasons.quick { XCTAssertNil(PatientCancelReasons.legacyReasonError(chip), chip) }
        XCTAssertNil(PatientCancelReasons.reason(chip: nil, otherText: "algo"))
    }

    func testOtroPideTresCaracteresYVaTalCualConSuCodigo() {
        XCTAssertNil(PatientCancelReasons.reason(chip: "Otro", otherText: "ab"))
        XCTAssertEqual(PatientCancelReasons.otherError("ab"), "Escribe al menos 3 caracteres.")
        XCTAssertNil(PatientCancelReasons.otherError(""))
        XCTAssertEqual(PatientCancelReasons.reason(chip: "Otro", otherText: " viaje "), "viaje")
        XCTAssertEqual(PatientCancelReasons.reason(chip: "Otro", otherText: String(repeating: "x", count: 600))?.count, 500)
        // Only the released body (an API before D-8) asks «Otro» for 10 characters.
        XCTAssertEqual(PatientCancelReasons.legacyReasonError("viaje"), "Escribe un motivo de al menos 10 caracteres.")
        XCTAssertNil(PatientCancelReasons.legacyReasonError("viaje largo"))
    }

    func testCuerpoConCodigoYCuerpoPublicado() {
        let coded = AppointmentCancelBody(version: 2, reason: "No puedo a esa hora", reasonCode: "no_puedo_a_esa_hora")
        XCTAssertEqual(JSONBody.fingerprint(coded), #"{"reason":"No puedo a esa hora","reasonCode":"no_puedo_a_esa_hora","version":2}"#)
        // Without a code it is byte for byte the released body.
        XCTAssertEqual(JSONBody.fingerprint(AppointmentCancelBody(version: 2, reason: "No puedo a esa hora")), #"{"reason":"No puedo a esa hora","version":2}"#)
    }

    func testSoloElCampoNoAdmitidoReasonCodeActivaElCuerpoPublicado() {
        func failure(_ status: Int, _ field: String, _ message: String) -> APIFailure {
            .http(status: status, problem: Problem(status: status, code: "validacion", detail: "Revisa el campo \(field).", field: field, errors: [.init(field: field, message: message)]))
        }
        XCTAssertTrue(PatientCancelReasons.refusesReasonCode(failure(400, "reasonCode", "Este campo no se admite en la solicitud.")))
        XCTAssertFalse(PatientCancelReasons.refusesReasonCode(failure(400, "reasonCode", "Recepción escribe el motivo de la cancelación.")))
        XCTAssertFalse(PatientCancelReasons.refusesReasonCode(failure(400, "reason", "Este campo no se admite en la solicitud.")))
        XCTAssertFalse(PatientCancelReasons.refusesReasonCode(.transport))
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

    func testPersonasAntesDeTiUsaAheadDelServidorYSinoElTablero() throws {
        let called = try JSONDecoder().decode([PublicQueue.Called].self, from: Data(#"[{"numero":9,"consultorio":"2","llamados":1}]"#.utf8))
        let fromServer = try JSONDecoder().decode(QueueTicket.self, from: Data(#"{"id":"t","service":"consulta_general","fecha":"2026-11-20","numero":12,"patientId":null,"patientName":null,"state":"en_espera","officeId":null,"llamados":0,"version":1,"issuedAt":"2026-11-20T14:00:00Z","ahead":4}"#.utf8))
        XCTAssertEqual(fromServer.ahead, 4)
        XCTAssertEqual(PatientTurnRules.ahead(fromServer, called: called), 4)
        // Without `ahead` (the patient's GET /fila today) the public board gives the estimate, as in U4.
        let plain = ticket("t", number: 12, state: "en_espera")
        XCTAssertNil(plain.ahead)
        XCTAssertEqual(PatientTurnRules.ahead(plain, called: called), 2)
        XCTAssertNil(PatientTurnRules.ahead(plain, called: nil))
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

    func testResumenConCriticosPrimeroYOrdenEstableDentroDeCadaGrupo() {
        let mixed = order("o1", items: [("e1", "GLU", "Glucosa", 90, "normal", "mg/dL"), ("e2", "SOD", "Sodio", 150, "alto", "mmol/L"),
                                         ("e3", "HB", "Hemoglobina", 7.1, "critico_bajo", "g/dL"), ("e4", "TXT", "Cultivo", nil, nil, nil),
                                         ("e5", "POT", "Potasio", 3.0, "bajo", "mmol/L"), ("e6", "K2", "Plaquetas", 900, "critico_alto", "x10³/µL"),
                                         ("e7", "UR", "Urea", 20, "normal", "mg/dL")])
        XCTAssertEqual(ReleaseRules.orderedItems(mixed).map(\.name), ["Hemoglobina", "Plaquetas", "Sodio", "Potasio", "Glucosa", "Urea", "Cultivo"])
        XCTAssertTrue(ReleaseRules.summary(mixed).hasPrefix("Ana Pérez verá: Hemoglobina 7.1 g/dL (crítico bajo), Plaquetas 900 x10³/µL (crítico alto), Sodio"), ReleaseRules.summary(mixed))
    }

    func testLiberarSinCambiosEnviaSoloLaVersion() {
        // Follow-up on (the default) and no note: the released body {version}.
        XCTAssertEqual(JSONBody.fingerprint(ReleaseRules.body(version: 3, followUp: true, note: "  ")), #"{"version":3}"#)
        XCTAssertEqual(JSONBody.fingerprint(ReleaseRules.body(version: 3, followUp: false, note: " Repetir en ayunas. ")), #"{"followUp":false,"patientNote":"Repetir en ayunas.","version":3}"#)
        XCTAssertEqual(ReleaseRules.body(version: 3, followUp: true, note: String(repeating: "x", count: 600)).patientNote?.count, 500)
    }

    func testLiberarDiceQuePasoConElSeguimiento() throws {
        let released = order("o1", items: [])
        let proposed = try JSONDecoder().decode(LabReviewResult.self, from: Data(#"{"id":"o1","version":3,"reviewedAt":"2026-11-20T15:00:00Z","followUpsClosed":1,"followUpProposalId":"p1"}"#.utf8))
        XCTAssertEqual(ReleaseRules.done(released, result: proposed), "Resultados revisados y liberados. Ana Pérez ya puede verlos. Se propuso a Recepción una cita de seguimiento.")
        let hospitalized = try JSONDecoder().decode(LabReviewResult.self, from: Data(#"{"id":"o1","version":3,"reviewedAt":"2026-11-20T15:00:00Z","followUpProposalId":null,"followUpSkipped":"hospitalizado"}"#.utf8))
        XCTAssertEqual(ReleaseRules.done(released, result: hospitalized), "Resultados revisados y liberados. Ana Pérez ya puede verlos. Sin cita de seguimiento: el paciente está hospitalizado.")
        // An older API answers only {id, version, reviewedAt}; the doctor turning it off ("no_pedida") adds nothing.
        let old = try JSONDecoder().decode(LabReviewResult.self, from: Data(#"{"id":"o1","version":3,"reviewedAt":"2026-11-20T15:00:00Z"}"#.utf8))
        XCTAssertEqual(ReleaseRules.done(released, result: old), ReleaseRules.done(released))
        XCTAssertNil(ReleaseRules.followUpOutcome(proposalId: nil, skipped: "no_pedida"))
    }

    // MARK: - G2 Vincular expediente

    private func link(_ json: String) throws -> MyLink { try JSONDecoder().decode(MyLink.self, from: Data(json.utf8)) }

    func testVinculacionAbreEnElEstadoRealDeLaSolicitud() throws {
        let none = try link(#"{"linked":false,"request":null}"#)
        XCTAssertEqual(LinkStatusRules.screen(none, profileLinked: false), .form(prefill: nil))

        let pending = try link(#"{"linked":false,"request":{"id":"v1","state":"pendiente","createdAt":"2026-11-16T15:00:00.000Z","resolvedAt":null,"rejectionReason":null,"version":1},"declared":{"dui":"00000000-0","birth":"1990-01-31"}}"#)
        XCTAssertEqual(LinkStatusRules.screen(pending, profileLinked: false), .pending(since: "2026-11-16T15:00:00.000Z"))
        XCTAssertEqual(LinkStatusRules.pendingText("2026-11-16T15:00:00.000Z"), "En revisión desde 16/11")

        let approved = try link(#"{"linked":true,"request":{"id":"v1","state":"aprobada","createdAt":"2026-11-16T15:00:00.000Z","resolvedAt":"2026-11-16T16:00:00.000Z","rejectionReason":null,"version":2}}"#)
        XCTAssertEqual(LinkStatusRules.screen(approved, profileLinked: false), .approved)
        // The profile already has the record: approved whatever the request says.
        XCTAssertEqual(LinkStatusRules.screen(none, profileLinked: true), .approved)

        let rejected = try link(#"{"linked":false,"request":{"id":"v1","state":"rechazada","createdAt":"2026-11-16T15:00:00.000Z","resolvedAt":"2026-11-16T16:00:00.000Z","rejectionReason":"El DUI no coincide con el expediente.","version":2},"declared":{"dui":"00000000-0","birth":"1990-01-31"}}"#)
        let declared = MyLink.Declared(dui: "00000000-0", birth: "1990-01-31")
        XCTAssertEqual(LinkStatusRules.screen(rejected, profileLinked: false), .rejected(reason: "El DUI no coincide con el expediente.", prefill: declared))
        XCTAssertEqual(LinkStatusRules.rejectedText("El DUI no coincide con el expediente."), "Tu solicitud fue rechazada. Motivo: El DUI no coincide con el expediente.")
        XCTAssertEqual(LinkStatusRules.rejectedText(" "), "Tu solicitud fue rechazada. Revisa tus datos o acude a recepción.")

        // Just sent: an older read (no request, or the rejected one) never brings the form back.
        let sent = try JSONDecoder().decode(LinkRequestResult.self, from: Data(#"{"id":"v2","state":"pendiente","createdAt":"2026-11-17T15:00:00.000Z","resolvedAt":null,"rejectionReason":null,"version":1}"#.utf8))
        XCTAssertEqual(LinkStatusRules.screen(none, profileLinked: false, sent: sent), .pending(since: "2026-11-17T15:00:00.000Z"))
        XCTAssertEqual(LinkStatusRules.screen(rejected, profileLinked: false, sent: sent), .pending(since: "2026-11-17T15:00:00.000Z"))
        XCTAssertEqual(LinkStatusRules.screen(approved, profileLinked: false, sent: sent), .approved)
    }

    func testVolverAPedirPrellenaLaFechaDeclarada() throws {
        let zone = TimeZone(identifier: "America/El_Salvador")!
        let date = try XCTUnwrap(LinkStatusRules.birthDate("1990-01-31", zone: zone))
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        XCTAssertEqual([parts.year, parts.month, parts.day], [1990, 1, 31])
        XCTAssertNil(LinkStatusRules.birthDate(nil, zone: zone))
        XCTAssertNil(LinkStatusRules.birthDate("31/01/1990", zone: zone))
        // A server without `declared` decodes too (no prefill).
        XCTAssertNil(try link(#"{"linked":false,"request":null}"#).declared)
    }

    // MARK: - D1 Avisos

    func testInsigniaDeAvisosSaleDeNoLeidos() throws {
        let inbox = try JSONDecoder().decode(NoticeInbox.self, from: Data(#"{"actualizadoEn":"2026-11-14T12:00:00.000Z","avisos":[],"noLeidos":3,"criticos":1,"recordatorioHoras":4,"proximoCambio":null}"#.utf8))
        XCTAssertEqual(NoticeRules.badge(inbox), 3)
        XCTAssertEqual(NoticeRules.badgeLabel(3), "3 avisos sin leer")
        XCTAssertEqual(NoticeRules.badgeLabel(1), "1 aviso sin leer")
        let read = try JSONDecoder().decode(NoticeInbox.self, from: Data(#"{"actualizadoEn":"2026-11-14T12:00:00.000Z","avisos":[],"noLeidos":0,"criticos":0,"recordatorioHoras":4,"proximoCambio":null}"#.utf8))
        XCTAssertNil(NoticeRules.badge(read))
        XCTAssertNil(NoticeRules.badge(nil))
    }

    // MARK: - G3 Alta

    func testAltaConfirmaConResumen() {
        let recap = DischargeConfirmRules.signRecap(patient: "Ana Pérez", type: .medica, pendingCount: 1, summary: "Evolución favorable.")
        XCTAssertTrue(recap.hasPrefix("Alta de Ana Pérez · \(DischargeType.medica.label), con 1 pendiente. Resumen: Evolución favorable."), recap)
        XCTAssertEqual(DischargeConfirmRules.signedNotice, "Alta firmada. Recepción registrará la salida.")
    }
}

/// A4 / D-8 on iOS: the patient's cancel sends `reasonCode`; an API before D-8 gets the released body under its own key.
@MainActor
final class PatientCancelFlowTests: XCTestCase {
    private var sent: [(key: String, body: String)] = []
    private var answers: [APIFailure?] = []
    private var keys = 0

    private func makeFlow() -> PatientCancelFlow {
        PatientCancelFlow(makeKey: { [unowned self] in self.keys += 1; return "k\(self.keys)" })
    }

    private func post(_ body: AppointmentCancelBody, _ key: String) async throws {
        sent.append((key, JSONBody.fingerprint(body)))
        if !answers.isEmpty, let failure = answers.removeFirst() { throw failure }
    }

    private func cancel(_ flow: PatientCancelFlow, _ id: String = "a1", version: Int = 2, chip: String?, other: String = "") async -> Error? {
        do { try await flow.cancel(id, version: version, chip: chip, otherText: other, post: post); return nil } catch { return error }
    }

    private let unsupported = APIFailure.http(status: 400, problem: Problem(status: 400, code: "validacion", detail: "Revisa el campo reasonCode: este campo no se admite en la solicitud.", field: "reasonCode",
                                                                           errors: [.init(field: "reasonCode", message: "Este campo no se admite en la solicitud.")]))

    func testChipRapidoEnviaReasonCodeConUnToque() async {
        let error = await cancel(makeFlow(), chip: "No puedo a esa hora")
        XCTAssertNil(error)
        XCTAssertEqual(sent.map(\.key), ["k1"])
        XCTAssertEqual(sent.first?.body, #"{"reason":"No puedo a esa hora","reasonCode":"no_puedo_a_esa_hora","version":2}"#)
    }

    func testAPIAnteriorRecibeElCuerpoPublicadoConClaveNueva() async {
        answers = [unsupported, nil]
        let flow = makeFlow()
        let error = await cancel(flow, chip: "Ya no lo necesito")
        XCTAssertNil(error)
        XCTAssertEqual(sent.map(\.key), ["k1", "k2"], "the released body never reuses the coded body's key")
        XCTAssertEqual(sent.last?.body, #"{"reason":"Ya no lo necesito","version":2}"#)
        XCTAssertTrue(flow.legacyServer)
        // Later cancels on this server go straight to the released body.
        sent = []
        _ = await cancel(flow, "a2", chip: "No puedo a esa hora")
        XCTAssertEqual(sent.map(\.body), [#"{"reason":"No puedo a esa hora","version":2}"#])
    }

    func testReintentoDelCuerpoPublicadoRepiteClaveYCuerpo() async {
        answers = [unsupported, .transport, nil]
        let flow = makeFlow()
        let first = await cancel(flow, chip: "Ya no lo necesito")
        XCTAssertEqual(first as? APIFailure, .transport)
        XCTAssertEqual(flow.pendingKey("a1", legacy: true), "k2")
        let retry = await cancel(flow, chip: "Ya no lo necesito")
        XCTAssertNil(retry)
        XCTAssertEqual(sent.map(\.key), ["k1", "k2", "k2"])
        XCTAssertEqual(sent[1].body, sent[2].body)
    }

    func testReintentoTras5xxRepiteClaveYCuerpoConCodigo() async {
        answers = [.http(status: 503, problem: nil), nil]
        let flow = makeFlow()
        _ = await cancel(flow, chip: "Ya no lo necesito")
        _ = await cancel(flow, chip: "Ya no lo necesito")
        XCTAssertEqual(sent.map(\.key), ["k1", "k1"])
        XCTAssertEqual(sent[0].body, sent[1].body)
    }

    func testOtroCuerpoNuncaVaConUnaClavePendiente() async {
        answers = [.transport, nil]
        let flow = makeFlow()
        _ = await cancel(flow, chip: "Ya no lo necesito")
        // The person picks another reason after the network error: another body, so another key.
        _ = await cancel(flow, chip: "No puedo a esa hora")
        XCTAssertEqual(sent.map(\.key), ["k1", "k2"])
    }

    func testOtroCortoEnUnaAPIAnteriorPideDiezCaracteresSinEnviar() async {
        answers = [unsupported]
        let flow = makeFlow()
        let error = await cancel(flow, chip: "Otro", other: "viaje")
        XCTAssertEqual((error as? CancelRefusal)?.message, "Escribe un motivo de al menos 10 caracteres.")
        XCTAssertEqual(sent.count, 1, "only the coded attempt reached the server")
        // With 10 characters the released body goes under its own key.
        let ok = await cancel(flow, chip: "Otro", other: "viaje de trabajo")
        XCTAssertNil(ok)
        XCTAssertEqual(sent.map(\.key), ["k1", "k2"])
        XCTAssertEqual(sent.last?.body, #"{"reason":"viaje de trabajo","version":2}"#)
    }

    func testOtroError400NoCambiaAlCuerpoPublicado() async {
        let refused = APIFailure.http(status: 400, problem: Problem(status: 400, code: "validacion", detail: "Escribe brevemente el motivo.", field: "reason", errors: [.init(field: "reason", message: "Escribe brevemente el motivo.")]))
        answers = [refused]
        let flow = makeFlow()
        let error = await cancel(flow, chip: "Otro", other: "abc")
        XCTAssertEqual(error as? APIFailure, refused)
        XCTAssertFalse(flow.legacyServer)
        XCTAssertEqual(sent.count, 1)
    }

    func testSinMotivoNoSeEnviaNada() async {
        let flow = makeFlow()
        let none = await cancel(flow, chip: nil)
        XCTAssertEqual((none as? CancelRefusal)?.message, "Elige un motivo.")
        let short = await cancel(flow, chip: "Otro", other: "ab")
        XCTAssertEqual((short as? CancelRefusal)?.message, "Escribe al menos 3 caracteres.")
        XCTAssertTrue(sent.isEmpty)
    }
}
