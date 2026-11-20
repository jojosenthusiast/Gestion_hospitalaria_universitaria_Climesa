import XCTest
@testable import ClimesaCore

/// Lote 5 on iOS (S1-S3, S9, S11-S13, S15, S16): the same rules Android uses, for Médico and Paciente.
final class Lote5MedicoPacienteTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    // MARK: S1 · bell badge

    func testBellBadgeCapsAtNinetyNine() {
        XCTAssertNil(NoticeRules.badgeText(0))
        XCTAssertEqual(NoticeRules.badgeText(12), "12")
        XCTAssertEqual(NoticeRules.badgeText(99), "99")
        XCTAssertEqual(NoticeRules.badgeText(100), "99+")
        XCTAssertEqual(NoticeRules.badgeText(1500), "99+")
    }

    // MARK: S2 · card actions

    func testCardActionRolesBorrowTheCrudLook() {
        XCTAssertEqual(CardActionRole.primary.crud, .create)
        XCTAssertEqual(CardActionRole.edit.crud, .edit)
        XCTAssertEqual(CardActionRole.danger.crud, .deactivate)
        XCTAssertEqual(CardActionRole.neutral.crud, .view)
        XCTAssertEqual(CardActionRole.allCases.filter(\.filled), [.primary])
    }

    // MARK: S3 / S12 · consultation form

    func testMissingRequiredSummary() {
        XCTAssertEqual(ConsultationForm.missing(reason: " ", plan: ""), ["reason", "plan"])
        XCTAssertEqual(FormCopy.missingSummary(ConsultationForm.missingNames(reason: "", plan: "")), "Falta: motivo de consulta y plan")
        XCTAssertEqual(FormCopy.missingSummary(ConsultationForm.missingNames(reason: "Tos", plan: " ")), "Falta: plan")
        XCTAssertNil(FormCopy.missingSummary(ConsultationForm.missingNames(reason: "Tos", plan: "Reposo")))
        XCTAssertEqual(FormCopy.missingSummary(["a", "b", "c", "d", "e"]), "Falta: a, b, c y 2 más")
        XCTAssertEqual(FormCopy.missingSummary(["a", " ", "a"]), "Falta: a")
        XCTAssertEqual(Set(ConsultationForm.errors(reason: "", plan: "Reposo").keys), ["reason"])
        XCTAssertTrue(ConsultationForm.errors(reason: "Tos", plan: "Reposo").isEmpty)
        XCTAssertEqual(FormCopy.legend, "Los campos con * son obligatorios.")
    }

    func testAutosaveSendsOnlyChangesAndSaysWhen() {
        XCTAssertFalse(ConsultationAutosave.changed(savedReason: "Cefalea", savedExam: nil, savedPlan: nil, reason: "Cefalea ", exam: "", plan: ""))
        XCTAssertTrue(ConsultationAutosave.changed(savedReason: "Cefalea", savedExam: nil, savedPlan: nil, reason: "Cefalea", exam: "", plan: "Reposo"))
        // 15:00 UTC is 09:00 in El Salvador.
        let at = ClimesaDates.parse("2026-11-18T15:00:00Z")!
        XCTAssertEqual(ConsultationAutosave.savedText(at), "Borrador guardado automáticamente a las 09:00")
        XCTAssertEqual(ConsultationAutosave.debounceNanoseconds, 2_500_000_000)
    }

    func testVitalSignsUseFullNames() throws {
        let sign = try decode(ConsultationDetail.VitalSigns.self, #"{"id":"v","takenAt":"2026-11-18T15:00:00Z","systolic":120,"diastolic":80,"heartRate":72,"respiratoryRate":16,"temperature":"36.8","oxygenSaturation":98,"weightKg":null,"heightCm":null}"#)
        let parts = ConsultationVitalsText.parts(sign)
        XCTAssertEqual(parts.map(\.name), ["Presión arterial", "Frecuencia cardiaca", "Frecuencia respiratoria", "Temperatura", "Saturación de oxígeno"])
        XCTAssertEqual(parts[1].value, "72 latidos por minuto")
        let banned = try NSRegularExpression(pattern: #"\b(FC|FR|PA|Temp|Sat|SpO2|SpO₂|T)\b"#)
        for part in parts {
            let text = "\(part.name) \(part.value)"
            XCTAssertEqual(banned.numberOfMatches(in: text, range: NSRange(text.startIndex..., in: text)), 0, text)
        }
    }

    func testAnotherUnsignedConsultationIsFlagged() throws {
        let open = try decode(UnsignedConsultation.self, #"{"id":"k1","patientId":"p1","patientName":"Ana","appointmentId":null,"ticketId":null,"reason":null,"startedAt":"2026-11-18T14:00:00Z","version":1}"#)
        XCTAssertEqual(ConsultationGuard.unsignedOther([open], current: nil)?.id, "k1")
        XCTAssertNil(ConsultationGuard.unsignedOther([open], current: "k1"))
        XCTAssertNil(ConsultationGuard.unsignedOther([], current: nil))
        XCTAssertEqual(ConsultationGuard.title(open), "Tienes una consulta sin firmar de Ana")
    }

    private func agenda(_ id: String, start: String, end: String, consultation: String? = nil, state: String? = nil, reason: String? = nil) throws -> AgendaEntry {
        let c = consultation.map { "\"\($0)\"" } ?? "null"
        let s = state.map { "\"\($0)\"" } ?? "null"
        let r = reason.map { "\"\($0)\"" } ?? "null"
        return try decode(AgendaEntry.self, #"{"appointmentId":"\#(id)","patientId":"p-\#(id)","patientName":"Paciente \#(id)","start":"\#(start)","end":"\#(end)","reason":\#(r),"appointmentState":"confirmada","consultationId":\#(c),"consultationState":\#(s),"version":1,"signedAt":null}"#)
    }

    private func ticket(_ extra: String = "", state: String = "en_espera", service: String = "consulta_general") throws -> QueueTicket {
        try decode(QueueTicket.self, #"{"id":"t","service":"\#(service)","fecha":"2026-11-18","numero":7,"patientId":"p1","patientName":"Ana","state":"\#(state)","officeId":null,"llamados":0,"version":1,"issuedAt":"2026-11-18T15:48:00Z","consultationId":null,"consultationState":null\#(extra)}"#)
    }

    func testContextShowsWhatThePatientAskedFor() throws {
        let appointment = try agenda("a1", start: "2026-11-18T15:00:00Z", end: "2026-11-18T15:20:00Z", reason: "Dolor de cabeza")
        let context = try XCTUnwrap(ConsultationContextRules.of(appointment: appointment, ticket: nil))
        XCTAssertEqual(context.origin, "Cita de las 09:00")
        XCTAssertEqual(context.reason, "Dolor de cabeza")
        let walkIn = try XCTUnwrap(ConsultationContextRules.of(appointment: nil, ticket: try ticket(#","area":"EMG","priority":"urgente""#, service: "emergencia")))
        XCTAssertEqual(walkIn.origin, "Número EMG 7 · Emergencia · Llegó sin cita")
        XCTAssertEqual(walkIn.priority, "urgente")
        XCTAssertNil(ConsultationContextRules.of(appointment: nil, ticket: nil))
    }

    // MARK: S11 · Mi día

    func testDaySectionsSplitNowUpcomingAndDone() throws {
        // 10:00 in El Salvador.
        let now = ClimesaDates.parse("2026-11-18T16:00:00Z")!
        let rows = [
            try agenda("later", start: "2026-11-18T20:00:00Z", end: "2026-11-18T20:20:00Z"),
            try agenda("running", start: "2026-11-18T15:50:00Z", end: "2026-11-18T16:10:00Z"),
            try agenda("open", start: "2026-11-18T14:00:00Z", end: "2026-11-18T14:20:00Z", consultation: "k1", state: "abierta"),
            try agenda("signed", start: "2026-11-18T15:00:00Z", end: "2026-11-18T15:20:00Z", consultation: "k2", state: "firmada"),
            try agenda("missed", start: "2026-11-18T13:00:00Z", end: "2026-11-18T13:20:00Z"),
            try agenda("next", start: "2026-11-18T17:00:00Z", end: "2026-11-18T17:20:00Z")
        ]
        let today = DoctorDaySections.split(rows, now: now)
        XCTAssertEqual(today.now.map(\.appointmentId), ["open", "running"])
        XCTAssertEqual(today.upcoming.map(\.appointmentId), ["next", "later"])
        XCTAssertEqual(today.done.map(\.appointmentId), ["missed", "signed"])
    }

    func testDayExpanderAndHistoryEntry() throws {
        XCTAssertNil(DoctorDaySections.moreTodayLabel(3, expanded: false))
        XCTAssertEqual(DoctorDaySections.moreTodayLabel(6, expanded: false), "Mostrar 3 más de hoy")
        XCTAssertEqual(DoctorDaySections.moreTodayLabel(6, expanded: true), "Mostrar menos")
        let a = try agenda("a", start: "2026-11-16T15:00:00Z", end: "2026-11-16T15:20:00Z")
        let past = [AgendaDay(day: "2026-11-17", entries: [a, a]), AgendaDay(day: "2026-11-16", entries: [a])]
        XCTAssertEqual(DoctorDaySections.historyDetail(past), "2 días · 3 citas · lun 16 nov a mar 17 nov")
        XCTAssertEqual(DoctorDaySections.historyDetail(Array(past.dropFirst())), "1 día · 1 cita · lun 16 nov")
        XCTAssertNil(DoctorDaySections.historyDetail([]))
    }

    func testQueueRowsShowThePatientData() throws {
        let walkIn = try ticket(#","patientAge":34,"patientSex":"femenino""#)
        XCTAssertEqual(QueueRowContext.line(walkIn), "Consulta general · Llegó sin cita")
        XCTAssertEqual(QueueRowContext.demographics(age: walkIn.patientAge, sex: walkIn.patientSex), "34 años · Femenino")
        XCTAssertNil(QueueRowContext.demographics(age: nil, sex: "no_registrado"))
        XCTAssertEqual(QueueRowContext.wait(walkIn, now: ClimesaDates.parse("2026-11-18T16:00:00Z")!), "Espera 12 min")
        XCTAssertEqual(QueueRowContext.wait(walkIn, now: ClimesaDates.parse("2026-11-18T17:00:00Z")!), "Espera 1 h 12 min")
        XCTAssertNil(QueueRowContext.wait(try ticket(state: "atendido"), now: Date()))
        let cited = try ticket(#","appointmentAt":"2026-11-18T15:00:00Z""#)
        XCTAssertEqual(QueueRowContext.line(cited), "Consulta general · Viene de su cita de las 09:00")
        // An older API without the fields still decodes.
        XCTAssertNil(try ticket().patientAge)
    }

    // MARK: S13 · lab flags

    private func item(_ value: Double?, mark: String? = nil, text: String? = nil, range: Bool = true) throws -> LabOrderItem {
        let result = (value == nil && text == nil) ? "null" : #"{"value":\#(value.map { "\($0)" } ?? "null"),"text":\#(text.map { "\"\($0)\"" } ?? "null"),"mark":\#(mark.map { "\"\($0)\"" } ?? "null")}"#
        let r = range ? #","referenceRange":{"min":12,"max":15.5,"criticalLow":7,"criticalHigh":20}"# : ""
        return try decode(LabOrderItem.self, #"{"id":"i","examId":"e","code":"HB","name":"Hemoglobina","unit":"g/dL","resultType":"numerico","result":\#(result)\#(r)}"#)
    }

    func testResultFlags() throws {
        XCTAssertEqual(LabResultView.flag(try item(13, mark: "critico_bajo")), .criticalLow)
        XCTAssertEqual(LabResultView.flag(try item(30, mark: "normal")), .normal)
        XCTAssertEqual(LabResultView.flag(try item(21)), .criticalHigh)
        XCTAssertEqual(LabResultView.flag(try item(6)), .criticalLow)
        XCTAssertEqual(LabResultView.flag(try item(16)), .high)
        XCTAssertEqual(LabResultView.flag(try item(11)), .low)
        XCTAssertEqual(LabResultView.flag(try item(13.5)), .normal)
        XCTAssertEqual(LabResultView.flag(try item(13.5, range: false)), .noRange)
        XCTAssertEqual(LabResultView.flag(try item(nil)), .pending)
        XCTAssertEqual(LabResultView.flag(try item(nil, mark: "sin_rango", text: "Negativo")), .text)
        XCTAssertEqual(LabFlag.normal.label, "En rango")
        XCTAssertEqual(LabResultView.summary([try item(16), try item(6), try item(13)]), "2 fuera de rango · 1 crítico")
        XCTAssertNil(LabResultView.summary([try item(13), try item(nil)]))
        XCTAssertEqual(LabResultView.attachmentAction(mime: "image/jpeg"), "Ver imagen")
        XCTAssertEqual(LabResultView.attachmentAction(mime: "application/pdf"), "Ver informe PDF")
    }

    // MARK: S15 · record exams

    func testRecordExamsAreMasterDetailWithTheirOrigin() throws {
        let history = try decode(ClinicalHistory.self, #"""
        {"patient":{"id":"p","record":"E-1","fullName":"Ana López"},"access":"relacion",
         "consultations":[{"id":"k1","state":"firmada","startedAt":"2026-11-10T15:00:00Z","signedAt":"2026-11-10T15:30:00Z","reason":"Fiebre","physicalExam":null,"plan":"Reposo",
           "doctor":{"id":"d","name":"Dra. Ruiz","specialty":null},"diagnoses":[{"code":"A09","description":"Diarrea","principal":true,"note":null}],"prescriptions":[]}],
         "laboratory":[
           {"id":"o1","consultationId":"k1","state":"completado","priority":"rutina","createdAt":"2026-11-10T15:20:00Z","completedAt":"2026-11-11T16:00:00Z","reviewedAt":"2026-11-11T18:00:00Z",
            "items":[{"id":"i1","code":"HB","name":"Hemoglobina","unit":"g/dL","result":{"value":6.1,"text":null,"mark":"critico_bajo"}},{"id":"i2","code":"GL","name":"Glucosa","unit":"mg/dL","result":{"value":150,"text":null,"mark":"alto"}}]},
           {"id":"o2","consultationId":null,"state":"pendiente","priority":"urgente","createdAt":"2026-11-15T15:00:00Z","completedAt":null,"reviewedAt":null,
            "items":[{"id":"i3","code":"PCR","name":"Proteína C reactiva","unit":null,"result":null}]}],
         "admissions":[]}
        """#)
        let rows = ClinicalRecordLab.rows(history)
        XCTAssertEqual(rows.map(\.orderId), ["o2", "o1"])
        XCTAssertEqual(rows[1].exams, "Hemoglobina, Glucosa")
        XCTAssertEqual(ClinicalRecordLab.summary(rows[1]), "2 fuera de rango · 1 crítico")
        XCTAssertEqual(ClinicalRecordLab.summary(rows[0]), "1 resultado pendiente")
        let origin = try XCTUnwrap(LabOriginRules.of(history, consultationId: "k1"))
        XCTAssertEqual(origin.reason, "Fiebre")
        XCTAssertEqual(origin.doctor, "Dra. Ruiz")
        XCTAssertEqual(origin.diagnoses, ["A09 · Diarrea"])
        XCTAssertNil(LabOriginRules.of(history, consultationId: nil))
    }

    // MARK: S9 · shift state

    func testShiftBannerOnlyWithoutAnActiveShift() throws {
        let off = try decode(ActiveShiftStatus.self, #"{"required":true,"active":false,"graceMinutes":30,"shift":null,"next":{"id":"s","start":"2026-11-19T13:00:00Z","end":"2026-11-19T21:00:00Z","area":"Consulta externa","state":"publicado"},"message":"Sin turno"}"#)
        XCTAssertTrue(ShiftGate.showsBanner(off))
        XCTAssertFalse(ShiftGate.showsBanner(ActiveShiftStatus(required: true, active: true)))
        XCTAssertFalse(ShiftGate.showsBanner(ActiveShiftStatus(required: false, active: true)))
        XCTAssertFalse(ShiftGate.showsBanner(nil))
        XCTAssertEqual(ShiftGate.nextText(off.next, now: ClimesaDates.parse("2026-11-18T16:00:00Z")!), "Próximo turno: Mañana 07:00 a 15:00 · Consulta externa")
        XCTAssertNil(ShiftGate.nextText(nil, now: Date()))
        XCTAssertEqual(ShiftGate.bannerTitle, "Sin turno activo: puedes consultar pero no registrar.")
        XCTAssertEqual(ProblemText.codeMessage("sin_turno_activo", field: nil), "No tienes un turno activo. Pide a Jefatura que publique tu turno.")
    }

    // MARK: S16 · «Pedir cita» groups

    func testCategoryGroupsUseTheFourteenCodes() {
        let codes = ["cabeza_nervios", "corazon", "huesos", "piel", "digestivo", "rinon_urinario", "alergias", "salud_mental",
                     "ojos", "oido_garganta", "consulta_general", "ninos", "mujer_embarazo", "cirugia", "nuevo_codigo"]
        let catalog = codes.map { AppointmentCategory(code: $0, name: $0, description: "", icon: $0, specialties: [], keywords: "") }
        let sections = CategoryGroups.sections(catalog)
        XCTAssertEqual(sections.map(\.group), [.cuerpo, .interno, .mente, .sentidos, .general])
        XCTAssertEqual(sections[0].categories.map(\.code), ["cabeza_nervios", "corazon", "huesos", "piel"])
        XCTAssertEqual(sections[1].categories.map(\.code), ["digestivo", "rinon_urinario", "alergias"])
        XCTAssertEqual(sections[2].categories.map(\.code), ["salud_mental"])
        XCTAssertEqual(sections[3].categories.map(\.code), ["ojos", "oido_garganta"])
        XCTAssertEqual(sections[4].categories.map(\.code), ["consulta_general", "ninos", "mujer_embarazo", "cirugia", "nuevo_codigo"])
        XCTAssertEqual(CategoryGroups.groupOf("desconocido"), .general)
        XCTAssertTrue(CategoryGroups.sections([]).isEmpty)
    }
}
