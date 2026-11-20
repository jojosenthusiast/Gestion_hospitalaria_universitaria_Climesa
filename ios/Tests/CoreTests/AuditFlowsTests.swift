import XCTest
@testable import ClimesaCore

/// Flow audit 2026-11-20 on iOS (MED and PAC): the same rules Android uses (`Audit*RulesTest`, `AuditContractFieldsTest`).
final class AuditFlowsTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    // MARK: D35 / S5 · signature counts

    func testZeroCountsAreFlaggedButNeverBlock() {
        let counts = ConsultationRecordRules.signCounts(diagnoses: 0, medications: 1, exams: 0)
        XCTAssertEqual(counts.map(\.text), ["0 diagnósticos", "1 medicamento", "0 exámenes"])
        XCTAssertEqual(counts.map(\.empty), [true, false, true])
        // Unknown exams are left out, never shown as a false zero.
        XCTAssertEqual(ConsultationRecordRules.signCounts(diagnoses: 2, medications: 0, exams: nil).map(\.text), ["2 diagnósticos", "0 medicamentos"])
    }

    // MARK: D71 · critical release

    private func order(mark: String, value: Double) throws -> LabOrder {
        try decode(LabOrder.self, #"{"id":"o1","consultationId":"k1","patientId":"p1","doctorId":"d1","priority":"rutina","state":"completado","createdAt":"2026-11-20T14:00:00.000Z","sampleTakenAt":null,"completedAt":"2026-11-20T16:00:00.000Z","reviewedAt":null,"version":5,"patientName":"Paciente Ficticio","items":[{"id":"i1","examId":"e1","code":"GLU","name":"Glucosa","unit":"mg/dL","result":{"value":90,"text":null,"mark":"normal"}},{"id":"i2","examId":"e2","code":"HB","name":"Hemoglobina","unit":"g/dL","result":{"value":\#(value),"text":null,"mark":"\#(mark)"}}],"allowedActions":["revisar"]}"#)
    }

    func testCriticalReleaseWaitsForTheTickAndPaintsOnlyCriticalValues() throws {
        let critical = try order(mark: "critico_bajo", value: 6.1)
        XCTAssertEqual(ReleaseRules.criticalLines(critical).count, 1)
        XCTAssertTrue(ReleaseRules.criticalLines(critical)[0].hasPrefix("Hemoglobina"))
        XCTAssertFalse(ReleaseRules.canRelease(critical, acknowledged: false))
        XCTAssertTrue(ReleaseRules.canRelease(critical, acknowledged: true))
        let normal = try order(mark: "normal", value: 13.5)
        XCTAssertTrue(ReleaseRules.criticalLines(normal).isEmpty)
        XCTAssertTrue(ReleaseRules.canRelease(normal, acknowledged: false))
    }

    // MARK: D74 · who goes next

    func testNoProposalSaysWhyWhenPeopleWaitForAnotherDoctor() throws {
        let other = try decode(QueueNextProposal.self, #"{"service":"consulta_general","area":"CON","rule":"r","proposal":null,"waiting":2,"noProposalReason":"citas_de_otro_medico"}"#)
        XCTAssertEqual(other.waitingForOtherDoctor, 2)
        XCTAssertEqual(other.noProposalText, "2 personas esperan, pero tienen cita con otro médico dentro de su horario. Por ahora nadie pasa contigo.")
        let nobody = try decode(QueueNextProposal.self, #"{"service":"consulta_general","area":"CON","rule":"r","proposal":null,"waiting":0,"noProposalReason":"sin_espera"}"#)
        XCTAssertNil(nobody.noProposalText)
        // An older API without the fields still reads.
        let old = try decode(QueueNextProposal.self, #"{"service":"consulta_general","area":"CON","rule":"r","proposal":null}"#)
        XCTAssertNil(old.waiting)
        XCTAssertNil(old.noProposalText)
    }

    // MARK: D76 · the called patient shows once

    private func agenda(_ id: String, patient: String, name: String) throws -> AgendaEntry {
        try decode(AgendaEntry.self, #"{"appointmentId":"\#(id)","patientId":"\#(patient)","patientName":"\#(name)","start":"2026-11-20T16:00:00.000Z","end":"2026-11-20T16:20:00.000Z","reason":null,"appointmentState":"confirmada","consultationId":null,"consultationState":null,"version":1,"signedAt":null}"#)
    }

    private func ticket(patient: String, state: String, byMe: Bool) throws -> QueueTicket {
        try decode(QueueTicket.self, #"{"id":"t1","service":"consulta_general","fecha":"2026-11-20","numero":3,"patientId":"\#(patient)","patientName":"Paciente Ficticio","state":"\#(state)","officeId":null,"llamados":1,"version":2,"issuedAt":"2026-11-20T15:00:00.000Z","consultationId":null,"consultationState":null,"calledByMe":\#(byMe)}"#)
    }

    func testCalledPatientLeavesTheAgenda() throws {
        let rows = [try agenda("a1", patient: "p1", name: "Paciente Ficticio"), try agenda("a2", patient: "p2", name: "Otra Persona")]
        XCTAssertEqual(DoctorDaySections.withoutCalled(rows, tickets: [try ticket(patient: "p1", state: "llamado", byMe: true)]).map(\.appointmentId), ["a2"])
        // Waiting, or called by someone else, keeps the appointment in the agenda.
        XCTAssertEqual(DoctorDaySections.withoutCalled(rows, tickets: [try ticket(patient: "p1", state: "en_espera", byMe: true)]).count, 2)
        XCTAssertEqual(DoctorDaySections.withoutCalled(rows, tickets: [try ticket(patient: "p1", state: "llamado", byMe: false)]).count, 2)
    }

    // MARK: D78 · vital signs, digits only

    func testVitalFieldsKeepDigitsOnly() {
        XCTAssertEqual(VitalsEntryRules.sanitize(.heartRate, "13[DEMO]"), "13")
        XCTAssertEqual(VitalsEntryRules.sanitize(.heartRate, "72.5"), "725")
        XCTAssertEqual(VitalsEntryRules.sanitize(.temperature, "36,8,2"), "36,82")
        XCTAssertEqual(VitalsEntryRules.sanitize(.systolic, "30080312"), "300803")
        XCTAssertEqual(VitalsEntryRules.fieldError(.systolic, "300803"), "Fuera de rango: 40 a 300 mmHg.")
    }

    // MARK: D84 / D88 / D89 · ward and discharge

    func testDischargeSummaryAndPendingSayWhatIsMissingWhileTyping() {
        XCTAssertNil(DischargeRules.summaryError(""))
        XCTAssertEqual(DischargeRules.summaryError("Bien."), "Faltan 5 caracteres (mínimo 10), o déjalo vacío.")
        XCTAssertNil(DischargeRules.summaryError("Evolución favorable."))
        XCTAssertNil(DischargeRules.pendingLineError(description: "", responsible: ""))
        XCTAssertNil(DischargeRules.pendingLineError(description: "Control en 7 días", responsible: "Consulta general"))
        XCTAssertEqual(DischargeRules.pendingLineError(description: "Control en 7 días", responsible: " "), "Completa la descripción y quién responde, o quita el pendiente.")
        XCTAssertEqual(DischargeRules.pendingResponsibles.first, "Consulta general")
    }

    // MARK: D96 / D124 · status families

    func testConfirmedIsSettledAndCleaningWaits() {
        XCTAssertEqual(StatusFamily.of("confirmada"), .listo)
        XCTAssertEqual(StatusFamily.of("limpieza"), .espera)
        XCTAssertEqual(StatusFamily.of("solicitada"), .espera)
        XCTAssertEqual(StatusFamily.of("ocupada"), .atencion)
    }

    // MARK: D128 · request limit

    func testRequestLimitBlocksBeforeFillingWithTheServerReason() throws {
        let full = try decode(CategoryRequestLimit.self, #"{"pending":3,"max":3,"canRequest":false,"code":"limite_solicitudes","reason":"Ya tienes el máximo de solicitudes pendientes. Espera a que Recepción las atienda."}"#)
        XCTAssertTrue(CategoryRequestRules.blocked(full))
        XCTAssertEqual(CategoryRequestRules.limitText(full), "Ya tienes el máximo de solicitudes pendientes. Espera a que Recepción las atienda.")
        let silent = try decode(CategoryRequestLimit.self, #"{"pending":3,"max":3,"canRequest":false,"code":null,"reason":null}"#)
        XCTAssertEqual(CategoryRequestRules.limitText(silent), "Ya tienes 3 de 3 solicitudes pendientes. Espera a que Recepción las atienda antes de pedir otra.")
        let open = try decode(CategoryRequestLimit.self, #"{"pending":1,"max":3,"canRequest":true}"#)
        XCTAssertFalse(CategoryRequestRules.blocked(open))
        XCTAssertFalse(CategoryRequestRules.blocked(nil))
        XCTAssertEqual(CategoryRequestRules.limitPath, "/citas/solicitudes-categoria/limite")
    }

    // MARK: D129 · linked patient name

    func testPatientAccountGreetsWithTheLinkedRecordName() throws {
        let json = #"{"id":"u1","email":"ejemplo@example.test","name":"Cuenta Ficticia","roles":["PAC"],"platforms":["ios"],"permissions":[],"patientId":"p1","staffId":null,"patientName":"Paciente Vinculado","patientRecord":"9900004-3"}"#
        let patient = try decode(AccessProfile.self, json)
        XCTAssertEqual(patient.displayName, "Paciente Vinculado")
        XCTAssertEqual(patient.patientRecord, "9900004-3")
        let staff = AccessProfile(id: "u2", email: "m@example.test", name: "Médico Ficticio", roles: ["MED"], platforms: ["ios"], permissions: [], staffId: "s1", patientName: "Otro")
        XCTAssertEqual(staff.displayName, "Médico Ficticio")
        let old = try decode(AccessProfile.self, #"{"id":"u1","email":"ejemplo@example.test","name":"Cuenta Ficticia","roles":["PAC"],"platforms":["ios"],"permissions":[]}"#)
        XCTAssertEqual(old.displayName, "Cuenta Ficticia")
    }

    // MARK: D130 / D120 · access log

    private func access(_ at: String, role: String = "MED", kind: String = "fila", reason: String = "atencion", extra: String = "") throws -> MyAccess {
        try decode(MyAccess.self, #"{"fecha":"\#(at)","rol":"\#(role)","tipoDato":"\#(kind)","motivo":"\#(reason)"\#(extra)}"#)
    }

    func testRepeatedAccessesCollapseAndReadInPlainWords() throws {
        let rows = [
            try access("2026-11-20T01:04:00Z"), try access("2026-11-20T01:06:00Z"), try access("2026-11-20T01:08:00Z"),
            try access("2026-11-20T01:30:00Z"), try access("2026-11-20T01:31:00Z", kind: "consulta")
        ]
        let groups = AccessLogRules.collapse(rows)
        XCTAssertEqual(groups.map(\.count), [1, 1, 3])
        XCTAssertEqual(groups[2].earliest, "2026-11-20T01:04:00Z")
        XCTAssertEqual(groups[2].latest, "2026-11-20T01:08:00Z")
        XCTAssertEqual(AccessLogRules.burstText(3), "3 accesos seguidos")
        XCTAssertNil(AccessLogRules.burstText(1))
        XCTAssertEqual(AccessLogRules.detail(rows[0]), "Tu número en la fila para atenderte")
        XCTAssertEqual(AccessLogRules.who(rows[0], roleLabel: "Médico"), "Médico")
        let named = try access("2026-11-20T01:04:00Z", extra: #","nombre":"Persona Ficticia","urgente":false"#)
        XCTAssertEqual(AccessLogRules.who(named, roleLabel: "Médico"), "Persona Ficticia · Médico")
    }

    func testUrgentAmbulanceReadIsFlagged() throws {
        XCTAssertTrue(try access("2026-11-20T01:04:00Z", extra: #","urgente":true"#).isUrgent)
        XCTAssertTrue(try access("2026-11-20T01:04:00Z", reason: "Recepción de ambulancia (urgente)").isUrgent)
        XCTAssertFalse(try access("2026-11-20T01:04:00Z").isUrgent)
        XCTAssertEqual(AccessLogRules.reasonText("Recepción de ambulancia (urgente)"), "al recibirte de una ambulancia (acceso urgente)")
    }
}
