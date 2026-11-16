package sv.edu.catolica.climesa.ui

/**
 * Fase 2 status model (02-sistema.md, sections 1-3), the same tables as `web/src/components/system.tsx`.
 * Pure Kotlin so the rules are tested on the JVM; [StatusBadge], [AreaTag] and [PriorityBadge] draw them.
 */

/** Six area tones plus a neutral. Red is never an area colour. */
internal enum class Area(val code: String, val label: String) {
    EMG("EMG", "Emergencia"),
    CON("CON", "Consulta general"),
    LAB("LAB", "Laboratorio"),
    HOS("HOS", "Hospitalización"),
    REC("REC", "Recepción y admisión"),
    AMB("AMB", "Ambulancia"),
    GEN("GEN", "General");

    companion object {
        /** Building spaces that share another area's tone. */
        private val aliases = mapOf("ESP" to REC, "VIP" to HOS, "BOD" to GEN)
        private val numberedPrefixes = mapOf("C" to CON, "E" to EMG, "HAB" to HOS)

        /**
         * Area of a space or area code (`P1-EMG` → [EMG], `P3-VIP` → [HOS]); anything unknown is [GEN]. A real area code
         * wins over an alias, so `BOD-LAB` is [LAB] as 02-sistema.md section 1 lists it, and `BOD-CEN` is [GEN].
         */
        fun of(code: String?): Area {
            val parts = (code ?: "").uppercase().split('-').map { it.trim() }
            parts.firstNotNullOfOrNull { part -> entries.firstOrNull { it.code == part } }?.let { return it }
            // Numbered building codes take the area of their prefix: consulting rooms `C-101` (CON), emergency cubicles
            // `E-01` (EMG) and rooms and beds `HAB-201`, `HAB-201-A` (HOS). Only a number after the prefix counts.
            val numbered = numberedPrefixes[parts.firstOrNull()]
            if (numbered != null && parts.getOrNull(1)?.let { it.isNotEmpty() && it.all(Char::isDigit) } == true) return numbered
            return parts.firstNotNullOfOrNull { aliases[it] } ?: GEN
        }
    }
}

/** Status icons (Material Symbols `schedule`, `campaign`, `monitor_heart`, `check`, `close`, `warning`) and priority icons. */
internal enum class StatusIcon { SCHEDULE, CAMPAIGN, MONITOR_HEART, CHECK, CLOSE, WARNING, DOUBLE_ARROW_UP, DASH }

/** Each family has its own pattern so it reads in grayscale: stripes, dots, solid, outline, dashed, double border. */
internal enum class StatusPattern { STRIPED, DOTTED, SOLID, OUTLINE, DASHED, DOUBLE }

internal enum class StatusFamily(val label: String, val icon: StatusIcon, val pattern: StatusPattern) {
    ESPERA("En espera", StatusIcon.SCHEDULE, StatusPattern.STRIPED),
    LLAMADO("Llamado o en proceso", StatusIcon.CAMPAIGN, StatusPattern.DOTTED),
    ATENCION("En atención o en uso", StatusIcon.MONITOR_HEART, StatusPattern.SOLID),
    LISTO("Terminado o disponible", StatusIcon.CHECK, StatusPattern.OUTLINE),
    CERRADO("Cancelado o fuera de servicio", StatusIcon.CLOSE, StatusPattern.DASHED),
    CRITICO("Crítico", StatusIcon.WARNING, StatusPattern.DOUBLE);

    companion object {
        private val byValue: Map<String, StatusFamily> = buildMap {
            listOf("en_espera", "solicitada", "pendiente", "pendiente_cama", "borrador", "publicado", "reservada", "provisional").forEach { put(it, ESPERA) }
            listOf("llamado", "confirmada", "en_proceso", "limpieza", "reprogramada").forEach { put(it, LLAMADO) }
            listOf("en_atencion", "en_curso", "ocupada", "hospitalizado", "en_servicio", "abierta").forEach { put(it, ATENCION) }
            listOf("atendida", "completado", "firmada", "alta_firmada", "egresado", "libre", "disponible", "activo", "exito", "normal", "aprobada").forEach { put(it, LISTO) }
            listOf(
                "cancelado", "cancelada", "no_asistio", "no_se_presento", "cerrado", "rechazada", "vencida", "vencido", "bloqueada",
                "inactivo", "desactivado", "denegado", "fallido", "en_mantenimiento",
            ).forEach { put(it, CERRADO) }
            listOf("critico_alto", "critico_bajo").forEach { put(it, CRITICO) }
            // Stock (inventory) and link checks (account linking). Never critical: red stays for clinical values.
            put("agotado", CERRADO)
            put("bajo_minimo", LLAMADO)
            put("por_vencer", ESPERA)
            put("coincide", LISTO)
            put("revisar", ESPERA)
        }

        /** Family of an API state value, or null when the value has none (`alto`, `bajo`, `sin_rango`). */
        fun of(value: String): StatusFamily? = byValue[value]

        /**
         * Family a legacy [StatusTone] stands for. [StatusTone.WARNING] and [StatusTone.DANGER] have none: a free-text
         * warning (stock below minimum, isolation, abnormal vitals) is neither a called queue number nor a critical value.
         * Critical values use [StatusFamily.CRITICO] explicitly (`critico_alto`, `CriticalPill`).
         */
        fun fromTone(tone: StatusTone): StatusFamily? = when (tone) {
            StatusTone.SUCCESS -> LISTO
            StatusTone.PROCESS -> ATENCION
            StatusTone.RESERVED -> ESPERA
            StatusTone.BLOCKED -> CERRADO
            StatusTone.WARNING, StatusTone.DANGER, StatusTone.NEUTRAL -> null
        }

        /**
         * The API value decides first, so every platform shows the same family. A value the shared table does not know
         * (`atendido`, `sin_traslado`) keeps the family of its catalog tone; with no tone it is neutral.
         */
        fun resolve(value: String, fallback: StatusTone?): StatusFamily? = of(value) ?: fallback?.let(::fromTone)
    }
}

/** Red (critical) is only for emergencies and critical lab values. */
internal enum class Priority(val code: String, val label: String, val icon: StatusIcon) {
    EMERGENCIA("emergencia", "Emergencia", StatusIcon.WARNING),
    URGENTE("urgente", "Urgente", StatusIcon.DOUBLE_ARROW_UP),
    RUTINA("rutina", "Rutina", StatusIcon.DASH);

    companion object {
        /** Unknown priorities show as routine, like the web `PriorityBadge`. */
        fun of(code: String?): Priority = entries.firstOrNull { it.code == code } ?: RUTINA
    }
}
