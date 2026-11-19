/**
 * CON-02: every stable `codigo` the API can answer in a problem+json body. It is published in the contract as the
 * `CodigoProblema` enum so clients decide by code, never by message. `tests/contrato-api.spec.ts` fails when the code
 * throws a literal code that is missing here.
 */
export const PROBLEM_CODES = [
  // Generic, by HTTP status (errors.filter.ts).
  'validacion', 'no_autenticado', 'sin_permiso', 'no_encontrado', 'conflicto', 'limite_excedido', 'no_disponible', 'error_interno', 'error',
  // Platform.
  'idempotency_key_invalida', 'idempotencia_conflicto', 'version_conflicto', 'dui_duplicado', 'posible_duplicado', 'politica_no_vigente', 'demasiadas_solicitudes', 'transicion_invalida',
  // Database rules (P0001).
  'ultimo_administrador', 'capacidad_excedida', 'capacidad_menor_que_camas', 'ciclo_en_arbol', 'consulta_firmada',
  // Personnel, spaces and beds.
  'personal_en_descanso', 'personal_jornada_ocupada', 'horas_semanales_excedidas', 'inscripcion_no_vigente', 'capacidad_bajo_ocupacion',
  // Shifts: attendance, load and states (20261120003000; ASIS-01, CARGA-01, MA-TUR-01..05).
  'turno_iniciado', 'turno_con_citas', 'descanso_insuficiente', 'carga_semanal_excedida', 'dias_seguidos_excedidos', 'tripulante_en_servicio',
  'sin_asistencia_marcada', 'entrada_automatica', 'medico_ausente', 'tripulante_ausente',
  // Shift planning batches and week templates (Fase 2, flow F).
  'lote_con_conflictos', 'plantilla_duplicada',
  // Appointments, queue and consultation.
  'franja_desalineada', 'franja_ocupada', 'medico_sin_jornada', 'paciente_con_cita', 'cancelacion_fuera_de_plazo',
  'ticket_activo_existente', 'fila_max_llamados', 'consulta_ya_iniciada',
  'cita_con_consulta', 'cita_fuera_de_dia', 'fila_llamados_insuficientes', 'fila_sin_espera', 'solicitudes_pendientes_max',
  // Category appointment requests (Fase 2 flow A, 20261125002000).
  'solicitud_cita_resuelta',
  // Accounts, privacy and patients.
  'cuenta_no_verificada', 'cuenta_ya_vinculada', 'expediente_ya_vinculado', 'paciente_ya_vinculado', 'sin_vinculacion', 'vinculacion_pendiente', 'vinculacion_resuelta',
  'sin_expediente', 'vinculacion_automatica', 'correo_en_uso', 'correo_de_otra_cuenta', 'rol_no_invitable', 'invitacion_no_pendiente', 'jerarquia_administrador', 'trabajo_abierto',
  // Inventory, public information and metrics.
  'existencia_insuficiente', 'aviso_con_datos_personales', 'aviso_retirado', 'aviso_vencido', 'indicador_desconocido',
  // Laboratory catalog (MA-LAB-06).
  'examen_con_resultados',
  // Laboratory follow-up, external orders and proposed appointments (Fase 2, S10).
  'orden_no_externa', 'cita_no_coincide', 'propuesta_resuelta',
  // Private storage of lab attachments (T07b): file type by content, size, reference-only, already stored and a file
  // whose bytes differ from the declared fingerprint.
  'adjunto_tipo_invalido', 'adjunto_muy_grande', 'adjunto_sin_archivo', 'adjunto_ya_almacenado', 'adjunto_no_coincide',
  // Ambulance.
  'ambulancia_ya_despachada', 'estado_final_invalido', 'hito_fuera_de_orden', 'servicio_cerrado', 'servicio_finalizado', 'sin_paramedico_de_turno',
  'sin_motorista_de_turno', 'sin_tripulacion_de_turno', 'tripulante_sin_turno', 'hito_hora_invalida', 'hito_no_deshacible', 'sin_consulta', 'sin_servicio_activo', 'solicitud_resuelta', 'unidad_en_mantenimiento', 'unidad_en_servicio',
  // Ambulance phase 1 (20261121002000): hospital handover (MA-AMB-04).
  'sin_llegada_hospital', 'entrega_registrada',
] as const;
export type ProblemCode = typeof PROBLEM_CODES[number];
