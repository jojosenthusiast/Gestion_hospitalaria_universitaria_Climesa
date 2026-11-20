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
    LLAMADO("Llamado", StatusIcon.CAMPAIGN, StatusPattern.DOTTED),
    ATENCION("En atención o en uso", StatusIcon.MONITOR_HEART, StatusPattern.SOLID),
    LISTO("Terminado o disponible", StatusIcon.CHECK, StatusPattern.OUTLINE),
    CERRADO("Cancelado o fuera de servicio", StatusIcon.CLOSE, StatusPattern.DASHED),
    CRITICO("Crítico", StatusIcon.WARNING, StatusPattern.DOUBLE);

    companion object {
        private val byValue: Map<String, StatusFamily> = buildMap {
            // A confirmed or rescheduled appointment waits for its time: it is not "Llamado" (megaphone). Same table as the
            // web `familyOfValue` and iOS `StatusFamily.byValue`.
            listOf(
                "en_espera", "solicitada", "pendiente", "pendiente_cama", "borrador", "publicado", "reservada", "provisional",
                "reprogramada",
            ).forEach { put(it, ESPERA) }
            // D124: a confirmed appointment is settled (check), not pending like a request (striped clock).
            put("confirmada", LISTO)
            // Only a called number uses the megaphone; work in progress (`en_proceso`) is in attention, like the web.
            put("llamado", LLAMADO)
            listOf("en_atencion", "en_proceso", "en_curso", "ocupada", "hospitalizado", "en_servicio", "abierta", "requiere_atencion").forEach { put(it, ATENCION) }
            // D96: a bed being cleaned waits (clock), it is not in use like an occupied one (pulse).
            put("limpieza", ESPERA)
            listOf("atendida", "atendido", "ok", "completado", "firmada", "alta_firmada", "egresado", "libre", "disponible", "activo", "exito", "normal", "aprobada").forEach { put(it, LISTO) }
            listOf(
                "cancelado", "cancelada", "no_asistio", "no_se_presento", "cerrado", "rechazada", "vencida", "bloqueada",
                "inactivo", "desactivado", "denegado", "fallido", "en_mantenimiento",
            ).forEach { put(it, CERRADO) }
            listOf("critico_alto", "critico_bajo").forEach { put(it, CRITICO) }
            // Stock (inventory) and link checks (account linking). Never critical: red stays for clinical values.
            put("bajo_minimo", ESPERA)
            put("por_vencer", ESPERA)
            put("coincide", LISTO)
            put("revisar", ESPERA)
        }

        /**
         * Out of range but not critical (lab `alto`/`bajo`) and stock that cannot be used (`agotado`, lot `vencido`): drawn
         * as the urgent priority (amber, double chevron), never red and never neutral. Same rule as the web.
         */
        private val urgentValues = setOf("alto", "bajo", "agotado", "vencido")

        fun urgent(value: String): Boolean = value in urgentValues

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
        fun resolve(value: String, fallback: StatusTone?): StatusFamily? = if (urgent(value)) null else of(value) ?: fallback?.let(::fromTone)
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

/**
 * Look of a filter chip that filters by a status or a priority: the chip wears the same colour, texture and icon as the
 * badge it filters, so «Sin leer» looks like the waiting badge and «Críticos» like the critical one. «Todos» has none.
 */
internal sealed interface ChipTone {
    val icon: StatusIcon

    /** Texture drawn on the chip; null is a plain soft tint with a border (urgent and routine priority badges). */
    val pattern: StatusPattern?

    data class Family(val family: StatusFamily) : ChipTone {
        override val icon get() = family.icon
        override val pattern get() = family.pattern
    }

    /** Priority look. Emergency is the critical family (red, double border), like the critical notice banner. */
    data class Level(val priority: Priority) : ChipTone {
        override val icon get() = priority.icon
        override val pattern get() = if (priority == Priority.EMERGENCIA) StatusPattern.DOUBLE else null
    }

    companion object {
        /** Tone of an API state value, resolved exactly like [StatusBadge] draws it; null when the badge is neutral. */
        fun of(value: String, fallback: StatusTone? = StatusCatalog.tone(value)): ChipTone? =
            if (StatusFamily.urgent(value)) Level(Priority.URGENTE) else StatusFamily.resolve(value, fallback)?.let(::Family)
    }
}
