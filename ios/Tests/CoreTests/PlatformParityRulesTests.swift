import XCTest
@testable import ClimesaCore

/// iOS parity with the Android and web improvements: notices timeline and bell, short dates without the year, status
/// filter chips, the two-most-urgent fold, appointment categories and day pickers sent as the intended local day.
final class PlatformParityRulesTests: XCTestCase {
    /// Wednesday 18 Nov 2026, 08:00 in El Salvador.
    private let now = ClimesaDates.parse("2026-11-18T14:00:00Z")!

    private func notice(_ id: String, state: String? = nil, level: String = "informativo", acknowledged: Bool = false, from: String = "2026-11-14T12:00:00.000Z",
                        until: String = "2026-11-20T12:00:00.000Z", highlighted: Bool = false) -> String {
        let estado = state.map { #","estado":"\#($0)""# } ?? ""
        return #"{"id":"\#(id)","titulo":"Aviso \#(id)","cuerpo":"Texto.","desde":"\#(from)","hasta":"\#(until)","prioridad":"atencion","publico":false,"roles":["MED"],"nivel":"\#(level)","areas":[],"publicadoEn":"2026-11-14T12:00:00.000Z","dirigido":true,"enteradoEn":\#(acknowledged ? "\"2026-11-14T13:00:00.000Z\"" : "null"),"recordarEn":null,"destacado":\#(highlighted)\#(estado)}"#
    }

    private func inbox(_ items: [String], unread: Int = 0) throws -> NoticeInbox {
        let json = #"{"actualizadoEn":"2026-11-18T14:00:00.000Z","avisos":[\#(items.joined(separator: ","))],"noLeidos":\#(unread),"criticos":0,"recordatorioHoras":4,"proximoCambio":null}"#
        return try JSONDecoder().decode(NoticeInbox.self, from: Data(json.utf8))
    }

    // MARK: Short dates (R4)

    func testFechasCortasSinAnio() {
        XCTAssertEqual(ClimesaDates.short("2026-11-18T15:00:00Z", now: now), "Hoy 09:00")
        XCTAssertEqual(ClimesaDates.short("2026-11-19T13:00:00Z", now: now), "Mañana 07:00")
        XCTAssertEqual(ClimesaDates.short("2026-11-18T05:22:00Z", now: now), "Ayer 23:22")
        XCTAssertEqual(ClimesaDates.short("2026-11-19T13:00:00Z", now: now), "Mañana 07:00")
        XCTAssertEqual(ClimesaDates.short("2026-11-20T13:00:00Z", now: now), "Viernes 07:00")
        XCTAssertEqual(ClimesaDates.short("2026-11-24T13:00:00Z", now: now), "Martes 07:00")
        XCTAssertEqual(ClimesaDates.short("2026-11-26T13:00:00Z", now: now), "Jue 26 nov, 07:00")
        XCTAssertEqual(ClimesaDates.short("2026-11-10T13:00:00Z", now: now), "Mar 10 nov, 07:00")
        XCTAssertEqual(ClimesaDates.short(nil, now: now), "—")
        XCTAssertFalse(ClimesaDates.short("2027-01-05T13:00:00Z", now: now).contains("2027"))
    }

    func testTituloDeDiaSinAnio() {
        XCTAssertEqual(ClimesaDates.shortDay("2026-11-18", now: now), "Hoy · mié 18 nov")
        XCTAssertEqual(ClimesaDates.shortDay("2026-11-19", now: now), "Mañana · jue 19 nov")
        XCTAssertEqual(ClimesaDates.shortDay("2026-11-17", now: now), "Ayer · mar 17 nov")
        XCTAssertEqual(ClimesaDates.shortDay("2026-11-26", now: now), "Jue 26 nov")
        // An instant just after local midnight belongs to the El Salvador day, not the UTC one.
        XCTAssertEqual(ClimesaDates.shortDay("2026-11-19T05:30:00Z", now: now), "Hoy · mié 18 nov")
    }

    func testElDiaDelSelectorSeEnviaComoElDiaLocal() throws {
        // Android had an off-by-one-day bug turning a UTC-midnight picker value into El Salvador time.
        for day in ["2026-11-18", "2026-01-01", "2026-12-31"] {
            let date = try XCTUnwrap(ClimesaDates.pickerDate(day: day))
            XCTAssertEqual(ClimesaDates.localDay(date), day)
        }
        XCTAssertNil(ClimesaDates.pickerDate(day: nil))
        XCTAssertNil(ClimesaDates.pickerDate(day: "18/11/2026"))
    }

    func testPlazoDeCancelarSinAnio() {
        let text = AppointmentRules.cancelDeadlineText(ClimesaDates.parse("2026-11-22T16:00:00Z")!, now: now)
        XCTAssertEqual(text, "Puedes cancelar hasta las 10:00 del dom 22 nov.")
    }

    // MARK: Notices inbox timeline

    func testEstadoAusenteEsVigenteYSeDecodifica() throws {
        let decoded = try inbox([notice("a"), notice("b", state: "programado"), notice("c", state: "vencido"), notice("d", state: "otro")])
        XCTAssertEqual(decoded.notices.map(\.state), [.vigente, .programado, .vencido, .vigente])
    }

    func testBandejaAgrupadaComoLaAgenda() throws {
        let decoded = try inbox([
            notice("v1"), notice("p2", state: "programado", from: "2026-11-21T13:00:00.000Z"),
            notice("p1", state: "programado", from: "2026-11-19T13:00:00.000Z"), notice("p1b", state: "programado", from: "2026-11-19T20:00:00.000Z"),
            notice("x1", state: "vencido", until: "2026-11-10T13:00:00.000Z"), notice("x2", state: "vencido", until: "2026-11-17T13:00:00.000Z"),
            notice("v2", level: "critico"),
        ])
        let timeline = NoticeRules.timeline(decoded.notices)
        XCTAssertEqual(timeline.current.map(\.id), ["v1", "v2"])
        XCTAssertEqual(timeline.upcoming.map(\.day), ["2026-11-19", "2026-11-21"])
        XCTAssertEqual(timeline.upcoming.first?.notices.map(\.id), ["p1", "p1b"])
        XCTAssertEqual(timeline.past.map(\.day), ["2026-11-17", "2026-11-10"])
        XCTAssertEqual(timeline.pastCount, 2)
        XCTAssertEqual(NoticeRules.pastTitle(2), "Ver avisos vencidos (2)")
    }

    func testEnteradoYSinLeerSoloEnVigentes() throws {
        let decoded = try inbox([notice("v", level: "critico", highlighted: true), notice("p", state: "programado", level: "critico", highlighted: true),
                                 notice("x", state: "vencido", level: "critico", highlighted: true)])
        XCTAssertEqual(decoded.notices.map(NoticeRules.canAcknowledge), [true, false, false])
        XCTAssertEqual(decoded.notices.map(NoticeRules.canSnooze), [true, false, false])
        XCTAssertEqual(NoticeRules.filter(decoded.notices, by: .sinLeer).map(\.id), ["v"])
        XCTAssertEqual(NoticeRules.filter(decoded.notices, by: .criticos).map(\.id), ["v"])
        XCTAssertEqual(NoticeRules.banner(decoded).map(\.id), ["v"])
    }

    func testEtiquetasDeLaFilaConSuFamilia() throws {
        let decoded = try inbox([notice("v"), notice("r", acknowledged: true), notice("p", state: "programado"), notice("x", state: "vencido")])
        let tags = decoded.notices.map(NoticeRules.tag)
        XCTAssertEqual(tags.map(\.label), ["Sin leer", "Enterado", "Programado", "Vencido"])
        XCTAssertEqual(tags.map { StatusFamily.of($0.value) }, [.espera, .listo, .espera, .cerrado])
    }

    func testLineaDeFechasCortas() throws {
        let decoded = try inbox([notice("v", until: "2026-11-19T13:00:00.000Z"), notice("p", state: "programado", from: "2026-11-19T13:00:00.000Z"),
                                 notice("x", state: "vencido", until: "2026-11-18T05:22:00.000Z")])
        XCTAssertEqual(decoded.notices.map { NoticeRules.whenText($0, now: now) },
                       ["Sáb 14 nov, 06:00 · hasta mañana 07:00", "Empieza mañana 07:00", "Venció ayer 23:22"])
    }

    // MARK: Bell

    func testCampanaCuentaVigentesSinLeerConTopeYRojoPorCritico() throws {
        let decoded = try inbox([notice("c", level: "critico"), notice("i")], unread: 2)
        XCTAssertEqual(NoticeRules.badge(decoded), 2)
        XCTAssertEqual(NoticeRules.badge(decoded, hiding: ["c"]), 1)
        XCTAssertNil(NoticeRules.badge(decoded, hiding: ["c", "i"]))
        XCTAssertTrue(NoticeRules.bellIsCritical(decoded))
        XCTAssertFalse(NoticeRules.bellIsCritical(decoded, hiding: ["c"]))
        let scheduled = try inbox([notice("c", state: "programado", level: "critico")])
        XCTAssertFalse(NoticeRules.bellIsCritical(scheduled))
        XCTAssertEqual(NoticeRules.badgeText(4), "4")
        XCTAssertEqual(NoticeRules.badgeText(9), "9")
        XCTAssertEqual(NoticeRules.badgeText(10), "9+")
        XCTAssertNil(NoticeRules.badgeText(0))
        XCTAssertNil(NoticeRules.badgeText(nil))
    }

    // MARK: Status chips

    func testLosFiltrosVistenLaFamiliaQueFiltran() {
        XCTAssertNil(NoticeFilter.todos.statusValue)
        XCTAssertEqual(NoticeFilter.sinLeer.statusValue.flatMap(StatusFamily.of), .espera)
        XCTAssertEqual(NoticeFilter.criticos.statusValue.flatMap(StatusFamily.of), .critico)
        XCTAssertNil(LabFilter.all.statusValue)
        XCTAssertEqual(LabFilter.pendiente.statusValue.flatMap(StatusFamily.of), .espera)
        XCTAssertEqual(LabFilter.enProceso.statusValue.flatMap(StatusFamily.of), .atencion)
        XCTAssertEqual(LabFilter.completado.statusValue.flatMap(StatusFamily.of), .listo)
    }

    // MARK: Two most urgent

    func testSoloLosDosMasUrgentesYElRestoPlegado() {
        let items: [(String, AttentionTone)] = [("a", .warning), ("b", .other), ("c", .danger), ("d", .warning)]
        let ranked = AttentionFold.ranked(items) { $0.1 }.map(\.0)
        XCTAssertEqual(ranked, ["c", "a", "d", "b"])
        XCTAssertEqual(AttentionFold.shown(ranked, expanded: false), ["c", "a"])
        XCTAssertEqual(AttentionFold.shown(ranked, expanded: true), ranked)
        XCTAssertEqual(AttentionFold.hidden(4, expanded: false), 2)
        XCTAssertEqual(AttentionFold.toggleTitle(4, expanded: false), "Ver 2 pendientes más")
        XCTAssertEqual(AttentionFold.toggleTitle(3, expanded: false), "Ver 1 pendiente más")
        XCTAssertEqual(AttentionFold.toggleTitle(4, expanded: true), "Ver menos")
        XCTAssertNil(AttentionFold.toggleTitle(2, expanded: false))
    }

    // MARK: Appointment categories

    func testCitasYAgendaTraenSusCategorias() throws {
        let appointment = try JSONDecoder().decode(Appointment.self, from: Data(#"{"id":"c1","patientId":"p1","patientName":null,"doctorId":"d1","doctorName":"Médico Ficticio","start":"2026-11-21T15:00:00.000Z","end":"2026-11-21T15:20:00.000Z","reason":null,"state":"confirmada","origin":"paciente","rejectionReason":null,"version":1,"categories":[{"code":"CAR","name":"Corazón","icon":"corazon"}]}"#.utf8))
        XCTAssertEqual(appointment.categories?.map(\.icon), ["corazon"])
        XCTAssertEqual(appointment.categories.map { $0.map { CategoryRequestRules.icon($0.icon) } }, [.catCorazon])
        let old = try JSONDecoder().decode(Appointment.self, from: Data(#"{"id":"c1","patientId":"p1","patientName":null,"doctorId":"d1","doctorName":"Médico Ficticio","start":"2026-11-21T15:00:00.000Z","end":"2026-11-21T15:20:00.000Z","reason":null,"state":"confirmada","origin":"paciente","rejectionReason":null,"version":1}"#.utf8))
        XCTAssertNil(old.categories)
        let agenda = try JSONDecoder().decode(AgendaEntry.self, from: Data(#"{"appointmentId":"c1","patientId":"p1","patientName":"Paciente Ficticio","start":"2026-11-20T15:00:00.000Z","end":"2026-11-20T15:20:00.000Z","reason":null,"appointmentState":"confirmada","consultationId":null,"consultationState":null,"version":null,"signedAt":null,"categories":[{"code":"PIE","name":"Piel","icon":"piel"},{"code":"OJO","name":"Ojos","icon":"ojo"}]}"#.utf8))
        XCTAssertEqual(agenda.categories?.map(\.name), ["Piel", "Ojos"])
    }

    // MARK: Doctor picker (R1-R3)

    private func catalog(_ doctors: String) throws -> AppointmentCatalogs {
        try JSONDecoder().decode(AppointmentCatalogs.self, from: Data(#"{"doctors":[\#(doctors)]}"#.utf8))
    }

    private func doctor(_ id: String, _ name: String, shift: String = "null", active: Bool = true) -> String {
        #"{"id":"\#(id)","givenNames":"\#(name)","surnames":"Ficticio","specialty":"Medicina general","area":null,"active":\#(active),"tieneTurno":\#(shift),"motivo":\#(shift == "false" ? "\"Sin turno ese día\"" : "null")}"#
    }

    func testMedicosConTurnoPrimeroConEtiquetaYChips() throws {
        let list = try catalog([doctor("a", "Ana", shift: "false"), doctor("b", "Beto", shift: "true"), doctor("c", "Carla", shift: "false"), doctor("d", "Dina", shift: "true"), doctor("x", "Xavi", shift: "true", active: false)].joined(separator: ",")).doctors
        XCTAssertEqual(list.map(\.hasShift), [false, true, false, true, true])
        XCTAssertEqual(DoctorShiftRules.ordered(list).map(\.id), ["b", "d", "a", "c"])
        XCTAssertEqual(DoctorShiftRules.withShift(list), 2)
        XCTAssertEqual(DoctorShiftRules.visible(list, filter: .conTurno, query: "").map(\.id), ["b", "d"])
        XCTAssertEqual(DoctorShiftRules.visible(list, filter: .todos, query: "").map(\.id), ["b", "d", "a", "c"])
        XCTAssertEqual(DoctorShiftRules.visible(list, filter: .todos, query: "carla").map(\.id), ["c"])
        XCTAssertEqual(DoctorShiftRules.tag(list[1]).label, "Con turno")
        XCTAssertEqual(StatusFamily.of(DoctorShiftRules.tag(list[1]).value), .listo)
        XCTAssertEqual(DoctorShiftRules.tag(list[0]).label, "Sin turno ese día")
        XCTAssertEqual(StatusFamily.of(DoctorShiftRules.tag(list[0]).value), .cerrado)
        XCTAssertEqual(DoctorShiftFilter.conTurno.statusValue.flatMap(StatusFamily.of), .listo)
        XCTAssertNil(DoctorShiftFilter.todos.statusValue)
    }

    func testConTurnoSinNadieDeTurnoPasaATodosYSinFechaCuentaComoConTurno() throws {
        let nobody = try catalog([doctor("a", "Ana", shift: "false"), doctor("b", "Beto", shift: "false")].joined(separator: ",")).doctors
        XCTAssertEqual(DoctorShiftRules.effective(.conTurno, nobody), .todos)
        XCTAssertEqual(DoctorShiftRules.visible(nobody, filter: .conTurno, query: "").map(\.id), ["a", "b"])
        let undated = try catalog(doctor("a", "Ana")).doctors
        XCTAssertNil(undated.first?.hasShift)
        XCTAssertTrue(DoctorShiftRules.onShift(undated[0]))
    }

    // MARK: Day-grouped appointments and tagged ambulance endings

    func testCitasAgrupadasPorDiaLocal() throws {
        let json = ["2026-11-19T13:00:00.000Z", "2026-11-19T22:00:00.000Z", "2026-11-20T05:30:00.000Z", "2026-11-26T13:00:00.000Z"].enumerated().map { index, start in
            #"{"id":"c\#(index)","patientId":"p1","patientName":null,"doctorId":"d1","doctorName":"Médico Ficticio","start":"\#(start)","end":"\#(start)","reason":null,"state":"confirmada","origin":"paciente","rejectionReason":null,"version":1}"#
        }.joined(separator: ",")
        let list = try JSONDecoder().decode([Appointment].self, from: Data("[\(json)]".utf8))
        let days = AppointmentRules.byDay(list)
        // 05:30 UTC on the 20th is still the 19th in El Salvador.
        XCTAssertEqual(days.map(\.day), ["2026-11-19", "2026-11-26"])
        XCTAssertEqual(days.first?.appointments.map(\.id), ["c0", "c1", "c2"])
        XCTAssertEqual(ClimesaDates.shortDay(days[0].day, now: now), "Mañana · jue 19 nov")
    }

    func testFinDeServicioDeAmbulanciaConSuEtiqueta() {
        XCTAssertEqual(StatusFamily.of(AmbulanceFinalState.completado.statusValue), .listo)
        XCTAssertEqual(StatusFamily.of(AmbulanceFinalState.cancelado.statusValue), .cerrado)
        XCTAssertEqual(StatusFamily.of(AmbulanceFinalState.statusValue(nil)), .atencion)
        XCTAssertEqual(StatusFamily.of(AmbulanceFinalState.statusValue("desviado")), .cerrado)
        XCTAssertTrue(AmbulanceFinalState.allCases.allSatisfy { StatusFamily.of($0.statusValue) != nil })
    }
}
