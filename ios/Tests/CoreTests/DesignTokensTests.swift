import XCTest
@testable import ClimesaCore

/// Fase 2 (docs/diseno/fase2/02-sistema.md): mapeos de estado, área y prioridad, y valores de la tabla de la sección 7.
final class DesignTokensTests: XCTestCase {
    // MARK: Estados

    func testEachFamilyHasItsOwnIconPatternAndLabel() {
        let expected: [StatusFamily: (ClimesaIconName, StatusPattern, String)] = [
            .espera: (.clock, .rayado, "En espera"),
            .llamado: (.megaphone, .punteado, "Llamado"),
            .atencion: (.pulse, .solido, "En atención o en uso"),
            .listo: (.check, .contorno, "Terminado o disponible"),
            .cerrado: (.close, .discontinuo, "Cancelado o fuera de servicio"),
            .critico: (.alert, .doble, "Crítico")
        ]
        for family in StatusFamily.allCases {
            let (icon, pattern, label) = expected[family]!
            XCTAssertEqual(family.icon, icon, "\(family)")
            XCTAssertEqual(family.pattern, pattern, "\(family)")
            XCTAssertEqual(family.label, label, "\(family)")
        }
        // Distinguibles en escala de grises: ni el ícono ni el patrón se repiten.
        XCTAssertEqual(Set(StatusFamily.allCases.map(\.icon)).count, StatusFamily.allCases.count)
        XCTAssertEqual(Set(StatusFamily.allCases.map(\.pattern)).count, StatusFamily.allCases.count)
    }

    func testApiValuesMapToTheirFamily() {
        let cases: [String: StatusFamily] = [
            "en_espera": .espera, "solicitada": .espera, "pendiente_cama": .espera, "provisional": .espera,
            "confirmada": .espera, "reprogramada": .espera, "bajo_minimo": .espera,
            "llamado": .llamado, "en_proceso": .atencion,
            "limpieza": .atencion, "en_atencion": .atencion, "ocupada": .atencion, "hospitalizado": .atencion, "abierta": .atencion,
            "atendida": .listo, "atendido": .listo, "alta_firmada": .listo, "libre": .listo, "normal": .listo, "aprobada": .listo,
            "cancelado": .cerrado, "cancelada": .cerrado, "no_se_presento": .cerrado, "en_mantenimiento": .cerrado,
            "critico_alto": .critico, "critico_bajo": .critico
        ]
        for (value, family) in cases { XCTAssertEqual(StatusFamily.of(value), family, value) }
    }

    /// R2 (I-4): an appointment that is confirmed or rescheduled is waiting for its time, never "Llamado" (megaphone).
    func testScheduledAppointmentStatesAreWaitingNotCalled() {
        for value in ["confirmada", "reprogramada", "solicitada"] {
            XCTAssertEqual(StatusFamily.of(value), .espera, value)
            XCTAssertNotEqual(StatusFamily.of(value), .llamado, value)
        }
        XCTAssertEqual(StatusBadgeStyle.of("confirmada"), StatusBadgeStyle(label: "Confirmada", family: .espera))
        XCTAssertEqual(StatusBadgeStyle.of("limpieza"), StatusBadgeStyle(label: "En limpieza", family: .atencion))
        XCTAssertEqual(StatusBadgeStyle.of("bajo_minimo"), StatusBadgeStyle(label: "Bajo mínimo", family: .espera))
    }

    func testBadgeStyleUsesCatalogLabelAndFamily() {
        XCTAssertEqual(StatusBadgeStyle.of("en_atencion"), StatusBadgeStyle(label: "En atención", family: .atencion))
        XCTAssertEqual(StatusBadgeStyle.of("cerrado"), StatusBadgeStyle(label: "Cerrado sin atender", family: .cerrado))
        XCTAssertEqual(StatusBadgeStyle.of("pendiente", label: "Por tomar muestra"), StatusBadgeStyle(label: "Por tomar muestra", family: .espera))
    }

    func testUnknownOrFamilylessValueFallsBackToNeutral() {
        let unknown = StatusBadgeStyle.of("en_revision")
        XCTAssertEqual(unknown, StatusBadgeStyle(label: "en revision", family: nil))
        XCTAssertTrue(unknown.isNeutral)
        for value in ["sin_rango", ""] {
            XCTAssertNil(StatusFamily.of(value), value)
            XCTAssertTrue(StatusBadgeStyle.of(value).isNeutral, value)
        }
        XCTAssertEqual(StatusBadgeStyle.of("alto").label, "Alto")
    }

    func testStatusFamilyColorsMatchTokenTable() {
        XCTAssertEqual(StatusFamily.espera.strong, ColorPair(light: 0x6A45A6, dark: 0xBCA3EE))
        XCTAssertEqual(StatusFamily.espera.soft, ColorPair(light: 0xF1EBFA, dark: 0x2B2140))
        XCTAssertEqual(StatusFamily.llamado.strong, ColorPair(light: 0x8A5300, dark: 0xE8B25E))
        XCTAssertEqual(StatusFamily.atencion.strong, ColorPair(light: 0x1F55A3, dark: 0x8CB2F0))
        XCTAssertEqual(StatusFamily.listo.strong, ColorPair(light: 0x1D7444, dark: 0x6CCB92))
        XCTAssertEqual(StatusFamily.cerrado.strong, ColorPair(light: 0x4A5865, dark: 0xAAB7C1))
        XCTAssertEqual(StatusFamily.critico.strong, ColorPair(light: 0xB71C1C, dark: 0xF2918A))
        XCTAssertEqual(StatusFamily.critico.soft, ColorPair(light: 0xFCEAEA, dark: 0x3A1A17))
        XCTAssertEqual(Palette.onStatus, ColorPair(light: 0xFFFFFF, dark: 0x0C1220))
    }

    // MARK: Áreas

    func testAreaCodeAndSpaceCodesMapToArea() {
        XCTAssertEqual(AreaCode.of("EMG"), .emg)
        XCTAssertEqual(AreaCode.of("P1-EMG"), .emg)
        XCTAssertEqual(AreaCode.of("p1-lab"), .lab)
        XCTAssertEqual(AreaCode.of("BOD-LAB"), .lab)
        XCTAssertEqual(AreaCode.of("C-101"), .con)
        XCTAssertEqual(AreaCode.of("E-01"), .emg)
        XCTAssertEqual(AreaCode.of("HAB-201-A"), .hos)
        XCTAssertEqual(AreaCode.of("C-ABC"), .gen)
        XCTAssertEqual(AreaCode.of("E-X"), .gen)
        XCTAssertEqual(AreaCode.of("P1-CON"), .con)
        XCTAssertEqual(AreaCode.of("P2-HOS"), .hos)
        XCTAssertEqual(AreaCode.of("P3-VIP"), .hos)
        XCTAssertEqual(AreaCode.of("P1-ESP"), .rec)
        XCTAssertEqual(AreaCode.of("P1-AMB"), .amb)
        XCTAssertEqual(AreaCode.of("BOD-CEN"), .gen)
    }

    func testUnknownAreaFallsBackToNeutral() {
        XCTAssertEqual(AreaCode.of(nil), .gen)
        XCTAssertEqual(AreaCode.of(""), .gen)
        XCTAssertEqual(AreaCode.of("C"), .gen)
        XCTAssertEqual(AreaCode.of("C-XYZ"), .gen)
        XCTAssertEqual(AreaCode.of("XYZ"), .gen)
    }

    func testAreaTokensMatchTokenTable() {
        let expected: [AreaCode: (ColorPair, ColorPair)] = [
            .emg: (ColorPair(light: 0x9B2C6F, dark: 0xF09AC9), ColorPair(light: 0xFAEAF3, dark: 0x3A1A2D)),
            .con: (ColorPair(light: 0x0B6B63, dark: 0x6FD1C3), ColorPair(light: 0xE0F2EF, dark: 0x10302C)),
            .lab: (ColorPair(light: 0x5A3EA6, dark: 0xBBA8F2), ColorPair(light: 0xEEEAFA, dark: 0x2A2142)),
            .hos: (ColorPair(light: 0x1D5C9A, dark: 0x8DB9EC), ColorPair(light: 0xE4EEF8, dark: 0x16273D)),
            .rec: (ColorPair(light: 0x2D6B33, dark: 0x8CCF93), ColorPair(light: 0xE4F1E5, dark: 0x172F1A)),
            .amb: (ColorPair(light: 0x5C6213, dark: 0xCCD27A), ColorPair(light: 0xF0F2DA, dark: 0x2C2E12)),
            .gen: (ColorPair(light: 0x4A5865, dark: 0xAAB7C1), ColorPair(light: 0xEDF0F2, dark: 0x222B36))
        ]
        for area in AreaCode.allCases {
            XCTAssertEqual(area.strong, expected[area]!.0, area.rawValue)
            XCTAssertEqual(area.soft, expected[area]!.1, area.rawValue)
        }
        XCTAssertEqual(Palette.onArea, ColorPair(light: 0xFFFFFF, dark: 0x0C1220))
    }

    func testRedIsNeverAnAreaColor() {
        for area in AreaCode.allCases { XCTAssertNotEqual(area.strong, Palette.critical, area.rawValue) }
    }

    // MARK: Prioridad

    func testPriorityStylesAndFallback() {
        XCTAssertEqual(Priority.emergencia.strong, Palette.critical)
        XCTAssertEqual(Priority.emergencia.icon, .alert)
        XCTAssertEqual(Priority.urgente.icon, .chevronsUp)
        XCTAssertEqual(Priority.rutina.icon, .minus)
        XCTAssertEqual(Priority.urgente.strong, ColorPair(light: 0xA3480A, dark: 0xF0A36B))
        XCTAssertEqual(Priority.urgente.soft, ColorPair(light: 0xFDEBDD, dark: 0x3A2314))
        XCTAssertEqual(Priority.rutina.strong, ColorPair(light: 0x55617A, dark: 0x9AA6BA))
        XCTAssertEqual(Priority.rutina.soft, ColorPair(light: 0xEEF1F5, dark: 0x1B2538))
        XCTAssertEqual(Priority.of("urgente"), .urgente)
        XCTAssertEqual(Priority.of("desconocida"), .rutina)
        XCTAssertEqual(Priority.of(nil), .rutina)
    }

    // MARK: Espaciado, radios y movimiento

    func testSpacingRadiusAndMotionTokens() {
        XCTAssertEqual([SpaceToken.space1, SpaceToken.space2, SpaceToken.space3, SpaceToken.space4, SpaceToken.space5,
                        SpaceToken.space6, SpaceToken.space8, SpaceToken.space10, SpaceToken.space12], [4, 8, 12, 16, 20, 24, 32, 40, 48])
        XCTAssertEqual([RadiusToken.chip, RadiusToken.control, RadiusToken.card, RadiusToken.panel], [4, 6, 10, 16])
        XCTAssertEqual(RadiusToken.inner(outer: 10, padding: 4), 6)
        XCTAssertEqual(RadiusToken.inner(outer: 4, padding: 8), 0)
        XCTAssertEqual(MotionToken.duration(MotionToken.fast, reduceMotion: false), 0.16)
        XCTAssertNil(MotionToken.duration(MotionToken.fast, reduceMotion: true))
        XCTAssertEqual([MotionToken.instant, MotionToken.fast, MotionToken.standard], [0.10, 0.16, 0.20])
    }
}
