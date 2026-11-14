import SwiftUI

/// Estados del paciente que `StatusCatalog` no cubre: turno en fila, citas, vinculación, ambulancia.
/// Mismos grupos de tono que las clases `.status-*` de web; un código sin entrada usa `StatusCatalog`.
enum PatientStatus {
    private static let tones: [String: StatusTone] = [
        "en_espera": .process, "llamado": .warning, "en_atencion": .process, "atendido": .success, "no_se_presento": .blocked,
        "solicitada": .reserved, "confirmada": .success, "atendida": .success, "rechazada": .danger, "no_asistio": .blocked,
        "aprobada": .success, "aprobado": .success, "negado": .danger,
        "por_confirmar": .warning, "descartada": .blocked,
        "en_proceso": .process, "firmada": .success, "abierta": .process,
        "normal": .success, "alto": .warning, "bajo": .warning, "critico_alto": .danger, "critico_bajo": .danger
    ]

    static func style(for code: String, label: String? = nil) -> StatusStyle {
        let base = StatusCatalog.style(for: code, label: label)
        guard let tone = tones[code] else { return base }
        return StatusStyle(label: base.label, tone: tone)
    }
}

/// Etiqueta de estado con los tonos del paciente. `label` usa el texto en español del contrato.
struct PatientTag: View {
    let code: String
    var label: String?

    init(_ code: String, label: String? = nil) { self.code = code; self.label = label }

    var body: some View {
        let style = PatientStatus.style(for: code, label: label)
        let colors = Theme.colors(for: style.tone)
        HStack(spacing: 7) {
            Circle().fill(colors.foreground).frame(width: 7, height: 7)
            Text(verbatim: style.label).font(Typo.tag).lineLimit(1)
        }
        .foregroundStyle(colors.foreground)
        .padding(.horizontal, 9).padding(.vertical, 5)
        .background(colors.background, in: Capsule())
        .overlay(Capsule().stroke(colors.foreground.opacity(0.24), lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: style.label))
    }
}

/// Aviso de una pantalla: información (azul suave) o problema (rojo suave).
struct PatientNotice: View {
    let text: String
    var failure = false

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.m) {
            Image(systemName: failure ? "exclamationmark.circle.fill" : "info.circle.fill").accessibilityHidden(true)
            Text(verbatim: text).font(Typo.small).fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(failure ? Theme.danger : Theme.primaryText)
        .padding(Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(failure ? Theme.dangerSoft : Theme.soft, in: RoundedRectangle(cornerRadius: Radius.card))
        .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(failure ? Theme.danger : Theme.line, lineWidth: 1))
        .accessibilityAddTraits(.updatesFrequently)
    }
}

/// Campo de varias líneas con rótulo y error, con el mismo marco que `FormField`.
struct PatientTextArea: View {
    let label: String
    @Binding var text: String
    var lines: ClosedRange<Int> = 2...5
    var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            Text(verbatim: label).font(Typo.label).foregroundStyle(Theme.ink)
            TextField("", text: $text, axis: .vertical).lineLimit(lines)
                .font(Typo.body).foregroundStyle(Theme.ink)
                .padding(.horizontal, Spacing.m).padding(.vertical, Spacing.s).frame(minHeight: Spacing.control, alignment: .topLeading)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.control))
                .overlay(RoundedRectangle(cornerRadius: Radius.control).stroke(error == nil ? Theme.controlLine : Theme.danger, lineWidth: error == nil ? 1 : 2))
            if let error { Text(verbatim: error).font(Typo.caption).foregroundStyle(Theme.danger) }
        }
    }
}

/// Mensajes de una escritura con los avisos del paciente.
struct PatientSubmissionNotice: View {
    let submission: Submission
    var body: some View {
        if let error = submission.error { PatientNotice(text: error, failure: true) }
        if let notice = submission.notice { PatientNotice(text: notice) }
    }
}
