import XCTest
@testable import ClimesaCore

/// Fase 2, R2: pure rules behind the iOS redesign (steps, catalog search, vital sign and role names).
final class UIRedesignRulesTests: XCTestCase {
    // MARK: - Consultation steps (web consultations.tsx STEPS)

    func testConsultationStepsFollowTheWebOrder() {
        XCTAssertEqual(ConsultationStep.allCases, [.consulta, .procedimientos, .recetaExamenes, .cierre])
        XCTAssertEqual(ConsultationStep.allCases.map(\.titleKey),
                       ["consultation.step.1", "consultation.step.2", "consultation.step.3", "consultation.step.4"])
        XCTAssertEqual(ConsultationStep.consulta.next, .procedimientos)
        XCTAssertEqual(ConsultationStep.recetaExamenes.next, .cierre)
        XCTAssertNil(ConsultationStep.cierre.next)
    }

    func testStepStateIsDoneBeforeCurrentAndPendingAfter() {
        let current = ConsultationStep.recetaExamenes
        XCTAssertEqual(ConsultationStep.consulta.state(current: current), .hecho)
        XCTAssertEqual(ConsultationStep.procedimientos.state(current: current), .hecho)
        XCTAssertEqual(ConsultationStep.recetaExamenes.state(current: current), .actual)
        XCTAssertEqual(ConsultationStep.cierre.state(current: current), .pendiente)
    }

    // MARK: - Lab catalog search

    private func exams() throws -> [LabExam] {
        let json = #"[{"id":"e1","code":"HEM-01","name":"Hemograma completo","isPanel":true,"unit":null},{"id":"e2","code":"GLU","name":"Glucosa en ayunas","isPanel":false,"unit":"mg/dL"},{"id":"e3","code":"CRE","name":"Creatinina sérica","isPanel":false,"unit":"mg/dL"}]"#
        return try JSONDecoder().decode([LabExam].self, from: Data(json.utf8))
    }

    func testLabSearchMatchesNameOrCodeWithoutAccents() throws {
        let list = try exams()
        XCTAssertEqual(LabCatalogFilter.filter(list, query: "", selected: []).map(\.id), ["e1", "e2", "e3"])
        XCTAssertEqual(LabCatalogFilter.filter(list, query: "  ", selected: []).map(\.id), ["e1", "e2", "e3"])
        XCTAssertEqual(LabCatalogFilter.filter(list, query: "serica", selected: []).map(\.id), ["e3"])
        XCTAssertEqual(LabCatalogFilter.filter(list, query: "glu", selected: []).map(\.id), ["e2"])
        XCTAssertEqual(LabCatalogFilter.filter(list, query: "hem-01", selected: []).map(\.id), ["e1"])
        XCTAssertEqual(LabCatalogFilter.filter(list, query: "zzz", selected: []).map(\.id), [])
    }

    func testLabSearchKeepsSelectedExamsVisible() throws {
        XCTAssertEqual(LabCatalogFilter.filter(try exams(), query: "glu", selected: ["e1"]).map(\.id), ["e1", "e2"])
    }

    // MARK: - Prehospital vital signs (API VitalSignsDto keys)

    func testVitalSignKeysShowSpanishNamesAndUnits() {
        XCTAssertEqual(VitalSignLabels.label("heartRate"), "Frecuencia cardiaca")
        XCTAssertEqual(VitalSignLabels.label("oxygenSaturation"), "Saturación de oxígeno")
        XCTAssertEqual(VitalSignLabels.label("glasgow"), "Escala de Glasgow")
        XCTAssertEqual(VitalSignLabels.value("oxygenSaturation", "98"), "98 %")
        XCTAssertEqual(VitalSignLabels.value("systolic", "120"), "120 mmHg")
        XCTAssertEqual(VitalSignLabels.value("glasgow", "15"), "15")
        XCTAssertEqual(VitalSignLabels.value("heartRate", ""), "")
    }

    func testUnknownVitalSignKeyIsReadableAndGoesLast() {
        XCTAssertEqual(VitalSignLabels.label("dolor_escala"), "dolor escala")
        XCTAssertEqual(VitalSignLabels.ordered(["temperature", "dolor_escala", "heartRate", "systolic"]),
                       ["systolic", "heartRate", "temperature", "dolor_escala"])
    }

    // MARK: - Role names (roles.csv)

    func testRoleCodesShowTheirNames() {
        XCTAssertEqual(RoleNames.label("MED"), "Médico")
        XCTAssertEqual(RoleNames.label("pac"), "Paciente")
        XCTAssertEqual(RoleNames.label("DPD"), "Delegado de protección de datos")
        XCTAssertEqual(RoleNames.list(["MED", "PAC"]), "Médico, Paciente")
        XCTAssertEqual(RoleNames.label("Personal del hospital"), "Personal del hospital")
    }

    // MARK: - Neutral badges

    func testPrincipalDiagnosisBadgeHasNoStatusFamily() {
        XCTAssertNil(StatusFamily.of("principal"))
        XCTAssertTrue(StatusBadgeStyle.of("principal", label: "Principal").isNeutral)
        XCTAssertEqual(StatusBadgeStyle.of("principal", label: "Principal").label, "Principal")
    }
}
