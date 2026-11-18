import XCTest
@testable import ClimesaCore

/// D4 (external result without an order) and D5 (the doctor records vital signs): rules shared with Android and the API.
final class DoctorRecordActionsTests: XCTestCase {
    private let hb = LabExam(id: "e1", code: "HB", name: "Hemoglobina", isPanel: false, unit: "g/dL", resultType: "numerico")
    private let hiv = LabExam(id: "e2", code: "VIH", name: "Prueba de VIH", isPanel: false, unit: nil, resultType: "texto")
    private let panel = LabExam(id: "p1", code: "BH", name: "Biometría", isPanel: true, unit: nil, resultType: "numerico")
    private let pdf = LabExternalFile(fileName: "informe.pdf", mimeType: "application/pdf", sizeBytes: 2048, sha256: String(repeating: "a", count: 64), data: Data([0x25]))

    private func profile(_ codes: [String]) -> AccessProfile {
        AccessProfile(id: "u1", email: "ejemplo@example.test", name: "Cuenta ficticia", roles: ["MED"], platforms: ["ios"],
                      permissions: codes.map { Permission(code: $0, context: "relacion") })
    }

    private func error(place: String = "Laboratorio Ejemplo", exams: [LabExam]? = nil, values: [String: String] = ["e1": "12,5"], file: LabExternalFile?? = nil, note: String = "") -> String? {
        ExternalRecordRules.error(place: place, exams: exams ?? [hb], values: values, file: file ?? pdf, note: note)
    }

    // MARK: D4

    func testRecordingAnExternalResultNeedsLaboratorioOrdenar() {
        XCTAssertTrue(ExternalRecordRules.canRecord(profile(["expediente.ver", "laboratorio.ordenar"])))
        XCTAssertFalse(ExternalRecordRules.canRecord(profile(["expediente.ver", "laboratorio.revisar"])))
        XCTAssertFalse(ExternalRecordRules.canRecord(nil))
    }

    // Final QA: without a care relationship the history is a 403; the action is not offered before the history is read.
    func testTheExternalResultIsOfferedOnlyOnceTheHistoryWasRead() {
        let doctor = profile(["expediente.ver", "laboratorio.ordenar"])
        XCTAssertTrue(ExternalRecordRules.canOffer(doctor, historyReadable: true))
        XCTAssertFalse(ExternalRecordRules.canOffer(doctor, historyReadable: false))
        XCTAssertFalse(ExternalRecordRules.canOffer(profile(["expediente.ver"]), historyReadable: true))
    }

    func testACompleteFormHasNoError() { XCTAssertNil(error()) }

    func testPlaceNeedsThreeToTwoHundredCharactersAfterTrimming() {
        XCTAssertEqual(error(place: "  ab  "), "Indica dónde se hizo el examen (al menos 3 caracteres).")
        XCTAssertEqual(error(place: String(repeating: "x", count: 201)), "El lugar no puede pasar de 200 caracteres.")
        XCTAssertNil(error(place: String(repeating: "x", count: 200)))
    }

    func testExamsGoOneByOneBetweenOneAndFifty() {
        XCTAssertEqual(error(exams: [], values: [:]), "Agrega al menos un examen.")
        XCTAssertEqual(error(exams: [hb, hb]), "Cada examen va una sola vez.")
        let many = (1...51).map { LabExam(id: "x\($0)", code: "C\($0)", name: "Examen \($0)", isPanel: false, unit: nil, resultType: "texto") }
        XCTAssertEqual(error(exams: many, values: Dictionary(uniqueKeysWithValues: many.map { ($0.id, "ok") })), "Registra como máximo 50 exámenes.")
    }

    func testEveryExamNeedsItsValueANumberWhenNumeric() {
        XCTAssertEqual(error(exams: [hb, hiv]), "Falta el valor de 1 examen(es).")
        XCTAssertEqual(error(values: ["e1": "alto"]), "El valor de Hemoglobina debe ser un número.")
        XCTAssertEqual(error(values: ["e1": "nan"]), "El valor de Hemoglobina debe ser un número.")
        XCTAssertEqual(error(exams: [hiv], values: ["e2": String(repeating: "x", count: 5001)]), "El valor de Prueba de VIH no puede pasar de 5000 caracteres.")
    }

    func testNoteAndFileFollowTheApiBounds() {
        XCTAssertEqual(error(note: String(repeating: "x", count: 1001)), "La nota no puede pasar de 1000 caracteres.")
        XCTAssertEqual(error(file: .some(nil)), "Adjunta la foto o el PDF del informe externo.")
        let text = LabExternalFile(fileName: "a.txt", mimeType: "text/plain", sizeBytes: 10, sha256: nil, data: Data())
        XCTAssertEqual(error(file: text), "El informe debe ser PDF o una foto (JPG, PNG, HEIC o WEBP).")
    }

    func testBodySendsValueForNumbersTextOtherwiseAndLeavesAnEmptyNoteOut() throws {
        let body = ExternalRecordRules.body(place: "  Lab Ejemplo ", file: pdf, exams: [hb, hiv], values: ["e1": "12,5", "e2": " Negativo "], note: "  ")
        XCTAssertEqual(body.place, "Lab Ejemplo")
        XCTAssertNil(body.note)
        XCTAssertEqual(body.results, [LabExternalRecordValueBody(examId: "e1", value: 12.5, text: nil), LabExternalRecordValueBody(examId: "e2", value: nil, text: "Negativo")])
        let json = try JSONSerialization.jsonObject(with: JSONBody.encode(body)) as? [String: Any]
        XCTAssertEqual(Set((json ?? [:]).keys), ["place", "attachment", "results"])
    }

    func testOptionsLeavePanelsAndPickedExamsOutSortedByName() {
        XCTAssertEqual(ExternalRecordRules.options([hiv, panel, hb], picked: []), [hb, hiv])
        XCTAssertEqual(ExternalRecordRules.options([hiv, panel, hb], picked: [hb]), [hiv])
        XCTAssertEqual(ExternalRecordRules.options([hiv, panel, hb], picked: [], query: "vih"), [hiv])
    }

    func testCatalogDecodesTheResultTypeAndAnOlderAnswerStaysNumeric() throws {
        let rows = try JSONDecoder().decode([LabExam].self, from: Data(#"[{"id":"e2","code":"VIH","name":"Prueba de VIH","isPanel":false,"unit":null,"resultType":"texto"},{"id":"e1","code":"HB","name":"Hemoglobina","isPanel":false,"unit":"g/dL"}]"#.utf8))
        XCTAssertFalse(rows[0].numeric)
        XCTAssertTrue(rows[1].numeric)
    }

    // MARK: D5

    func testRecordingVitalsNeedsSignosRegistrar() {
        XCTAssertTrue(VitalsEntryRules.canRecord(profile(["signos.registrar"])))
        XCTAssertFalse(VitalsEntryRules.canRecord(profile(["expediente.ver"])))
    }

    func testVitalsFieldsUseTheApiLimits() {
        XCTAssertNil(VitalsEntryRules.fieldError(.temperature, "37,5"))
        XCTAssertEqual(VitalsEntryRules.fieldError(.temperature, "46"), "Fuera de rango: 30 a 45 °C.")
        XCTAssertEqual(VitalsEntryRules.fieldError(.heartRate, "72.5"), "Solo números enteros.")
        XCTAssertEqual(VitalsEntryRules.fieldError(.oxygenSaturation, "x"), "Escribe un número.")
        XCTAssertEqual(VitalsEntryRules.fieldError(.weightKg, "0.2"), "Fuera de rango: 0.3 a 400 kg.")
        XCTAssertNil(VitalsEntryRules.fieldError(.pain, ""))
    }

    func testVitalsFormNeedsOneMeasureAndBothPressures() {
        XCTAssertEqual(VitalsEntryRules.formError([:], note: ""), "Registra al menos una medida.")
        XCTAssertEqual(VitalsEntryRules.formError([.systolic: "120"], note: ""), "La presión necesita la sistólica y la diastólica.")
        XCTAssertEqual(VitalsEntryRules.formError([.systolic: "80", .diastolic: "90"], note: ""), "La sistólica debe ser mayor que la diastólica.")
        XCTAssertEqual(VitalsEntryRules.formError([.heartRate: "300"], note: ""), "Frecuencia cardiaca: Fuera de rango: 20 a 250 lpm.")
        XCTAssertEqual(VitalsEntryRules.formError([.heartRate: "80"], note: String(repeating: "x", count: 501)), "La nota no puede pasar de 500 caracteres.")
        XCTAssertNil(VitalsEntryRules.formError([.heartRate: "80"], note: ""))
    }

    func testVitalsBodySendsOnlyFilledMeasures() throws {
        let body = VitalsEntryRules.body([.heartRate: "80", .weightKg: "70,5", .pain: " "], note: "  ", admissionId: nil)
        let json = try JSONSerialization.jsonObject(with: JSONBody.encode(body)) as? [String: Any]
        XCTAssertEqual(Set((json ?? [:]).keys), ["heartRate", "weightKg"])
        XCTAssertEqual(body.heartRate, 80)
        XCTAssertEqual(body.weightKg, 70.5)
    }
}
