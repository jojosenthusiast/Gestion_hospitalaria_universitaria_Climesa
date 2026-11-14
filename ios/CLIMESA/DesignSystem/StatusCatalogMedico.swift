import SwiftUI

/// Códigos de estado de las pantallas del Médico que `StatusCatalog` no trae (fila, consulta, ingreso, prioridad de ambulancia).
/// Los tonos siguen los mismos grupos `.status-*` de web/src/modules.css.
enum StatusCatalogMedico {
    static let tones: [String: StatusTone] = [
        "en_espera": .reserved, "llamado": .warning, "en_atencion": .process, "atendido": .success, "atendida": .success,
        "confirmada": .process, "solicitada": .reserved, "abierta": .process, "firmada": .success,
        "pendiente_cama": .warning, "hospitalizado": .success, "alta_firmada": .process, "egresado": .blocked,
        "roja": .danger, "naranja": .warning, "amarilla": .warning, "verde": .success
    ]

    static func tone(for code: String) -> StatusTone {
        tones[code] ?? StatusCatalog.style(for: code).tone
    }
}

/// Etiqueta de estado con los tonos extra del Médico; `label` trae la etiqueta en español del contrato.
struct MedicoTag: View {
    let code: String
    var label: String?

    init(_ code: String, label: String? = nil) { self.code = code; self.label = label }

    var body: some View {
        let text = StatusCatalog.style(for: code, label: label).label
        let colors = Theme.colors(for: StatusCatalogMedico.tone(for: code))
        HStack(spacing: 7) {
            Circle().fill(colors.foreground).frame(width: 7, height: 7)
            Text(verbatim: text).font(Typo.tag).lineLimit(1)
        }
        .foregroundStyle(colors.foreground)
        .padding(.horizontal, 9).padding(.vertical, 5)
        .background(colors.background, in: Capsule())
        .overlay(Capsule().stroke(colors.foreground.opacity(0.24), lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: text))
    }
}

/// Campo de texto de varias líneas con rótulo y error (el `FormField` del sistema es de una línea).
struct MedicoTextArea: View {
    let label: String
    @Binding var text: String
    var error: String?
    var lines: ClosedRange<Int> = 3...8

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            Text(verbatim: label).font(Typo.label).foregroundStyle(Theme.ink)
            TextField("", text: $text, axis: .vertical)
                .lineLimit(lines)
                .font(Typo.body).foregroundStyle(Theme.ink)
                .padding(Spacing.m).frame(minHeight: Spacing.control, alignment: .topLeading)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.control))
                .overlay(RoundedRectangle(cornerRadius: Radius.control).stroke(error == nil ? Theme.controlLine : Theme.danger, lineWidth: error == nil ? 1 : 2))
            if let error { Text(verbatim: error).font(Typo.caption).foregroundStyle(Theme.danger) }
        }
    }
}

/// Resultado de una escritura: un conflicto de versión (409) muestra «Cerrar y recargar»; lo demás, el aviso de siempre.
struct WriteNotice: View {
    let submission: Submission
    let reload: () async -> Void

    var body: some View {
        if submission.lastFailure?.isVersionConflict == true {
            ConflictBanner { Task { await reload() } }
        } else {
            SubmissionNotice(submission: submission)
        }
    }
}

/// Aviso de valor crítico o de riesgo (fondo y texto de peligro).
struct MedicoAlert: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.m) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.danger).accessibilityHidden(true)
            Text(verbatim: text).font(Typo.small).foregroundStyle(Theme.danger)
        }
        .padding(Spacing.l).frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.dangerSoft, in: RoundedRectangle(cornerRadius: Radius.card))
        .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(Theme.danger, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}
