import XCTest
@testable import ClimesaCore

/// Decodifica respuestas con la forma de `contrato/openapi.json` (datos ficticios).
final class ContractDecodingTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    func testNumeroDeFila() throws {
        let tickets = try decode([QueueTicket].self, #"[{"id":"t1","service":"consulta_general","fecha":"2026-11-20T00:00:00.000Z","numero":12,"patientId":"p1","patientName":null,"state":"llamado","officeId":null,"llamados":1,"version":3,"issuedAt":"2026-11-20T14:00:00.000Z"}]"#)
        XCTAssertEqual(tickets.first?.number, 12)
        XCTAssertEqual(tickets.first?.state, .llamado)
        XCTAssertEqual(tickets.first?.service, .consultaGeneral)
        XCTAssertEqual(tickets.first?.calls, 1)
    }

    func testUnEstadoNuevoNoRompeLaLectura() throws {
        let tickets = try decode([QueueTicket].self, #"[{"id":"t1","service":"otro_servicio","fecha":"2026-11-20","numero":1,"patientId":null,"patientName":null,"state":"estado_futuro","officeId":null,"llamados":0,"version":1,"issuedAt":"2026-11-20T14:00:00Z"}]"#)
        XCTAssertEqual(tickets.first?.state, .desconocido)
        XCTAssertEqual(tickets.first?.service, .desconocido)
    }

    func testCitasYDisponibilidad() throws {
        let citas = try decode([Appointment].self, #"[{"id":"c1","patientId":"p1","patientName":null,"doctorId":"d1","doctorName":"Médico Ficticio","start":"2026-11-21T15:00:00.000Z","end":"2026-11-21T15:20:00.000Z","reason":null,"state":"solicitada","origin":"paciente","rejectionReason":null,"version":1}]"#)
        XCTAssertEqual(citas.first?.state, .solicitada)
        let slots = try decode(Availability.self, #"{"doctorId":"d1","date":"2026-11-21","durationMinutes":20,"workPeriods":[{"start":"2026-11-21T14:00:00.000Z","end":"2026-11-21T22:00:00.000Z"}],"slots":[{"start":"2026-11-21T14:00:00.000Z","end":"2026-11-21T14:20:00.000Z"}]}"#)
        XCTAssertEqual(slots.slots.count, 1)
        let catalogs = try decode(AppointmentCatalogs.self, #"{"patients":[],"doctors":[{"id":"d1","givenNames":"Ana","surnames":"Ficticia","type":"medico","specialty":null,"areaId":null,"area":"Consulta externa","active":true}]}"#)
        XCTAssertEqual(catalogs.doctors.first?.fullName, "Ana Ficticia")
    }

    func testOrdenDeLaboratorioSinValorAntesDeLaRevision() throws {
        let orders = try decode([LabOrder].self, #"[{"id":"o1","consultationId":"k1","patientId":"p1","doctorId":"d1","priority":"urgente","state":"completado","createdAt":"2026-11-20T14:00:00.000Z","sampleTakenAt":null,"completedAt":"2026-11-20T16:00:00.000Z","reviewedAt":null,"version":4,"patientName":null,"items":[{"id":"i1","examId":"e1","code":"HB","name":"Hemoglobina","result":null}]}]"#)
        XCTAssertEqual(orders.first?.priority, .urgente)
        XCTAssertNil(orders.first?.items.first?.result)
        XCTAssertFalse(PatientLabRules.showsValues(orders[0]))
        XCTAssertEqual(PatientLabRules.statusText(orders[0]), "En revisión médica")
    }

    func testHistorialClinico() throws {
        let history = try decode(ClinicalHistory.self, #"""
        {"patient":{"id":"p1","record":"EXP-0000001","fullName":"Paciente Ficticio"},"access":"propio",
         "consultations":[{"id":"k1","state":"firmada","startedAt":"2026-11-10T15:00:00.000Z","signedAt":"2026-11-10T15:30:00.000Z","reason":"Control","physicalExam":null,"plan":null,
           "doctor":{"id":"d1","name":"Médico Ficticio","specialty":null},
           "diagnoses":[{"code":"J06.9","description":"Infección aguda de las vías respiratorias superiores","principal":true,"note":null}],
           "prescriptions":[{"id":"r1","issuedAt":"2026-11-10T15:30:00.000Z","items":[{"medication":"Acetaminofén","dose":"500 mg","route":"oral","frequency":"cada 8 horas","duration":"3 días","instructions":null}]}]}],
         "laboratory":[{"id":"o1","consultationId":"k1","state":"completado","priority":"rutina","createdAt":"2026-11-10T15:10:00.000Z","completedAt":null,"reviewedAt":"2026-11-11T10:00:00.000Z","items":[{"id":"i1","code":"HB","name":"Hemoglobina","unit":"g/dL","result":{"value":13.5,"text":null,"mark":"normal"}}]}],
         "admissions":[{"id":"a1","state":"egresado","origin":"consulta","createdAt":"2026-10-01T10:00:00.000Z","doctor":{"id":null,"name":null}}]}
        """#)
        XCTAssertEqual(history.access, .propio)
        XCTAssertEqual(history.consultations.first?.diagnoses.first?.code, "J06.9")
        XCTAssertEqual(history.laboratory.first?.items.first?.result?.mark, .normal)
        XCTAssertEqual(history.admissions.first?.state, .egresado)
    }

    func testAgendaDelMedicoYDetalleDeConsulta() throws {
        let agenda = try decode([AgendaEntry].self, #"[{"appointmentId":"c1","patientId":"p1","patientName":"Paciente Ficticio","start":"2026-11-20T15:00:00.000Z","end":"2026-11-20T15:20:00.000Z","reason":null,"appointmentState":"confirmada","consultationId":null,"consultationState":null,"consultationReason":null,"physicalExam":null,"plan":null,"version":null,"startedAt":null,"signedAt":null}]"#)
        XCTAssertEqual(agenda.first?.id, "c1")
        XCTAssertNil(agenda.first?.consultationState)
        let detail = try decode(ConsultationDetail.self, #"{"consultation":{"id":"k1","patientId":"p1","doctorId":"d1","appointmentId":"c1","reason":"Tos","physicalExam":null,"plan":null,"state":"abierta","version":2,"patientName":"Paciente Ficticio"},"vitalSigns":[{"id":"v1","takenAt":"2026-11-20T15:01:00.000Z","takenBy":"s1","systolic":120,"diastolic":80,"heartRate":72,"respiratoryRate":null,"temperature":"36.8","oxygenSaturation":98,"weightKg":null,"heightCm":null}],"diagnoses":[],"prescriptions":[]}"#)
        XCTAssertEqual(detail.consultation.state, .abierta)
        XCTAssertEqual(detail.vitalSigns.first?.temperature, "36.8")
    }

    func testAdmisionesPrehospitalYAccesos() throws {
        let admissions = try decode([Admission].self, #"[{"id":"a1","patientId":"p1","patientName":"Paciente Ficticio","origin":"consulta","requestedCategory":"semiprivada","state":"hospitalizado","isolation":false,"scheduledAt":null,"attendingDoctorId":"s1","version":3,"bed":"201-A","occupationId":"o1"}]"#)
        XCTAssertEqual(admissions.first?.requestedCategory, .semiprivada)
        let view = try decode(PrehospitalView.self, #"{"serviceId":"s1","active":true,"priority":"roja","patientLinked":false,"clinical":true,"reports":[{"id":"r1","priority":"roja","estimatedArrival":"2026-11-20T15:10:00.000Z","capturedAt":"2026-11-20T15:00:00.000Z","receivedAt":"2026-11-20T15:00:01.000Z","reason":"Dolor torácico","vitalSigns":{"heartRate":110,"systolic":"90","alerta":true}}]}"#)
        XCTAssertEqual(view.reports.first?.vitalSigns?["heartRate"]?.text, "110")
        XCTAssertEqual(view.reports.first?.vitalSigns?["alerta"]?.text, "Sí")
        let accesses = try decode([MyAccess].self, #"[{"fecha":"2026-11-20T15:00:00.000Z","rol":"MED","tipoDato":"expediente","motivo":"Atención"}]"#)
        XCTAssertEqual(accesses.first?.role, "MED")
    }

    func testInformacionPublicaYVinculacion() throws {
        let occupancy = try decode(PublicOccupancy.self, #"{"actualizadoEn":"2026-11-20T15:00:00.000Z","ocupacion":[{"planta":2,"categoria":"vip","camas":12,"libres":9,"ocupadas":3}]}"#)
        XCTAssertEqual(occupancy.rows.first?.free, 9)
        let doctors = try decode(DoctorsOnDuty.self, #"{"actualizadoEn":"2026-11-20T15:00:00.000Z","medicos":[{"nombre":"Médico Ficticio","especialidad":"Medicina general","area":null,"hasta":null}],"proximoCambio":null}"#)
        XCTAssertEqual(doctors.doctors.count, 1)
        let link = try decode(LinkRequestResult.self, #"{"id":"v1","state":"pendiente","createdAt":"2026-11-20T15:00:00.000Z","resolvedAt":null,"rejectionReason":null,"version":1}"#)
        XCTAssertEqual(link.state.label, "En verificación")
    }

    func testLosCuerposSeCodificanConLosNombresDelContrato() throws {
        let start = String(decoding: try JSONBody.encode(ConsultationStartBody(appointmentId: "c1")), as: UTF8.self)
        XCTAssertEqual(start, #"{"appointmentId":"c1"}"#)
        let order = String(decoding: try JSONBody.encode(LabOrderBody(consultationId: "k1", exams: ["e1"], priority: .urgente)), as: UTF8.self)
        XCTAssertEqual(order, #"{"consultationId":"k1","exams":["e1"],"priority":"urgente"}"#)
    }
}
