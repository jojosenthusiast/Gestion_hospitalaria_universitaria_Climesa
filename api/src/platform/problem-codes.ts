/**
 * CON-02: every stable `codigo` the API can answer in a problem+json body. It is published in the contract as the
 * `CodigoProblema` enum so clients decide by code, never by message. `tests/contrato-api.spec.ts` fails when the code
 * throws a literal code that is missing here.
 */
export const PROBLEM_CODES = [
  // Generic, by HTTP status (errors.filter.ts).
  'validacion', 'no_autenticado', 'sin_permiso', 'no_encontrado', 'conflicto', 'limite_excedido', 'no_disponible', 'error_interno', 'error',
  // Platform.
  'idempotency_key_invalida', 'idempotencia_conflicto', 'version_conflicto', 'politica_no_vigente', 'demasiadas_solicitudes', 'transicion_invalida',
  // Database rules (P0001).
  'ultimo_administrador', 'capacidad_excedida', 'capacidad_menor_que_camas', 'ciclo_en_arbol', 'consulta_firmada',
  // Personnel, spaces and beds.
  'personal_en_descanso', 'personal_jornada_ocupada', 'horas_semanales_excedidas', 'inscripcion_no_vigente', 'capacidad_bajo_ocupacion',
  // Appointments, queue and consultation.
  'franja_desalineada', 'franja_ocupada', 'medico_sin_jornada', 'paciente_con_cita', 'cancelacion_fuera_de_plazo',
  'ticket_activo_existente', 'fila_max_llamados', 'consulta_ya_iniciada',
  // Accounts, privacy and patients.
  'cuenta_no_verificada', 'cuenta_ya_vinculada', 'expediente_ya_vinculado', 'paciente_ya_vinculado', 'sin_vinculacion', 'vinculacion_pendiente', 'vinculacion_resuelta',
  'sin_expediente',
  // Inventory, public information and metrics.
  'existencia_insuficiente', 'aviso_con_datos_personales', 'indicador_desconocido',
  // Ambulance.
  'ambulancia_ya_despachada', 'estado_final_invalido', 'hito_fuera_de_orden', 'servicio_cerrado', 'servicio_finalizado', 'sin_paramedico_de_turno',
  'sin_servicio_activo', 'solicitud_resuelta', 'unidad_en_mantenimiento', 'unidad_en_servicio',
] as const;
export type ProblemCode = typeof PROBLEM_CODES[number];
