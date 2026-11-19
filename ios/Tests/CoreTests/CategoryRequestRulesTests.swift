import XCTest
@testable import ClimesaCore

/// Fase 2, flujo A (S8) en iOS: el paciente pide cita por motivo, sin elegir médico; recepción asigna médico y hora.
final class CategoryRequestRulesTests: XCTestCase {
    private let categories = [
        AppointmentCategory(code: "consulta_general", name: "Consulta general", description: "Malestar o control", icon: "general", specialties: ["Medicina general"], keywords: "fiebre gripe"),
        AppointmentCategory(code: "piel", name: "Piel", description: "Manchas o granos", icon: "piel", specialties: ["Dermatología"], keywords: "dermatologo acne"),
        AppointmentCategory(code: "salud_mental", name: "Salud mental", description: "Ansiedad o estrés", icon: "mente", specialties: ["Psiquiatría"], keywords: "ansiedad"),
    ]

    func testLaBusquedaIgnoraTildesYUsaPalabrasClaveYEspecialidades() {
        XCTAssertEqual(CategoryRequestRules.filter(categories, query: "ACNÉ").map(\.code), ["piel"])
        XCTAssertEqual(CategoryRequestRules.filter(categories, query: "psiquiatria").map(\.code), ["salud_mental"])
        XCTAssertEqual(CategoryRequestRules.filter(categories, query: "ansiedad", picked: ["piel"]).map(\.code), ["piel", "salud_mental"])
        XCTAssertEqual(CategoryRequestRules.filter(categories, query: " ").count, 3)
    }

    func testDeUnaATresCategorias() {
        var picked: [String] = []
        for code in ["a", "b", "c", "d"] { picked = CategoryRequestRules.toggle(picked, code) }
        XCTAssertEqual(picked, ["a", "b", "c"])
        XCTAssertEqual(CategoryRequestRules.toggle(picked, "b"), ["a", "c"])
        XCTAssertFalse(CategoryRequestRules.canSend(picked: [], note: ""))
        XCTAssertFalse(CategoryRequestRules.canSend(picked: ["a"], note: String(repeating: "x", count: 281)))
        XCTAssertTrue(CategoryRequestRules.canSend(picked: ["a"], note: String(repeating: "x", count: 280)))
    }

    func testElCuerpoNoLlevaMedicoNiNotaVacios() throws {
        let body = CategoryRequestRules.body(picked: ["piel"], franja: .cualquiera, note: "  ", preferredDoctorId: "")
        XCTAssertEqual(String(decoding: try JSONBody.encode(body), as: UTF8.self), #"{"categories":["piel"],"franja":"cualquiera"}"#)
    }

    func testElMedicoEsOpcionSecundariaYSeBuscaPorNombreOEspecialidad() throws {
        let json = #"{"doctors":[{"id":"d1","givenNames":"Médica","surnames":"General","specialty":"Medicina general","area":null,"active":true},{"id":"d3","givenNames":"Doctora","surnames":"Dermis","specialty":"Dermatología","area":null,"active":true},{"id":"d9","givenNames":"Inactivo","surnames":"Dermis","specialty":"Dermatología","area":null,"active":false}]}"#
        let doctors = try JSONDecoder().decode(AppointmentCatalogs.self, from: Data(json.utf8)).doctors
        XCTAssertEqual(CategoryRequestRules.doctors(doctors, query: "dermatologia").map(\.id), ["d3"])
        XCTAssertTrue(CategoryRequestRules.doctors(doctors, query: "").isEmpty)
    }

    func testLaSolicitudSeLeeConSusAccionesDelServidor() throws {
        let json = #"[{"id":"s1","patientId":"p1","patientName":"Paciente","record":"EXP-1","categories":[{"code":"piel","name":"Piel","icon":"piel"}],"specialties":["Dermatología"],"franja":"tarde","note":"Mancha","preferredDoctorId":null,"preferredDoctorName":null,"state":"pendiente","rejectionReason":null,"appointment":null,"createdAt":"2026-11-16T14:00:00.000Z","version":1,"allowedActions":["cancelar"],"blockedActions":[]},{"id":"s2","categories":[],"franja":"manana","state":"asignada","appointment":{"id":"c1","doctorId":"d3","doctorName":"Doctora Dermis","start":"2026-11-20T15:00:00.000Z","end":"2026-11-20T15:20:00.000Z"},"createdAt":"2026-11-15T14:00:00.000Z","version":2,"allowedActions":[]}]"#
        let rows = try JSONDecoder().decode([CategoryRequest].self, from: Data(json.utf8))
        XCTAssertEqual(rows[0].franja, .tarde)
        XCTAssertTrue(rows[0].isPending && rows[0].canWithdraw)
        XCTAssertEqual(rows[0].categoryNames, "Piel")
        XCTAssertFalse(rows[1].canWithdraw)
        XCTAssertEqual(rows[1].appointment?.doctorName, "Doctora Dermis")
        XCTAssertEqual(CategoryRequestRules.cancelPath("s1"), "/citas/solicitudes-categoria/s1/cancelar")
    }

    func testCadaIconoTieneSuGlifoWebYUnoDesconocidoUsaElEstetoscopio() {
        let keys = ["nino", "mujer", "corazon", "hueso", "piel", "ojo", "oido", "mente", "neuro", "digestivo", "rinon", "alergia", "cirugia"]
        for key in keys { XCTAssertNotEqual(CategoryRequestRules.icon(key), .steth, key) }
        XCTAssertEqual(Set(keys.map(CategoryRequestRules.icon)).count, keys.count)
        XCTAssertEqual(CategoryRequestRules.icon("general"), .steth)
        XCTAssertEqual(CategoryRequestRules.icon("nuevo"), .steth)
        XCTAssertEqual(CategoryRequestRules.tone("ojo"), .blue)
        XCTAssertEqual(CategoryRequestRules.tone("nuevo"), .slate)
    }
}
