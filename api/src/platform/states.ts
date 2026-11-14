/**
 * CON-09: domain states published as named, reusable enums in contrato/openapi.json.
 * Each list is the final CHECK constraint (or view CASE) in supabase/migrations/*.sql; keep them in sync with the database.
 */

/** atencion.cita.estado (20261017000600_atencion.sql). */
export const ESTADO_CITA = ['solicitada', 'confirmada', 'atendida', 'cancelada', 'rechazada', 'no_asistio'] as const;
/** atencion.ticket_fila.estado (20261017000600_atencion.sql). */
export const ESTADO_FILA = ['en_espera', 'llamado', 'en_atencion', 'atendido', 'no_se_presento'] as const;
/** atencion.consulta.estado (20261017000600_atencion.sql). */
export const ESTADO_CONSULTA = ['abierta', 'firmada', 'ingresada_por_error'] as const;
/** laboratorio.orden.estado (20261017000700_laboratorio.sql). */
export const ESTADO_ORDEN_LABORATORIO = ['pendiente', 'en_proceso', 'completado', 'cancelado'] as const;
/** laboratorio.resultado.marca (20261017000700_laboratorio.sql). */
export const MARCA_RESULTADO = ['normal', 'alto', 'bajo', 'critico_alto', 'critico_bajo', 'sin_rango'] as const;
/** laboratorio.orden.prioridad (20261017000700_laboratorio.sql). */
export const PRIORIDAD_LABORATORIO = ['rutina', 'urgente'] as const;
/** hospitalizacion.admision.estado (20261017000800_hospitalizacion.sql). */
export const ESTADO_ADMISION = ['pendiente_cama', 'hospitalizado', 'alta_firmada', 'egresado', 'cancelada'] as const;
/** infra.v_estado_cama.estado (20261017000800_hospitalizacion.sql). */
export const ESTADO_CAMA = ['ocupada', 'limpieza', 'bloqueada', 'reservada', 'libre'] as const;
/** personal.turno.estado (20261017000500_personal.sql). */
export const ESTADO_TURNO = ['borrador', 'publicado', 'en_curso', 'completado', 'cancelado'] as const;
/** acceso.usuario.estado (20261017000200_acceso.sql). */
export const ESTADO_USUARIO = ['activo', 'desactivado'] as const;
/** acceso.vinculacion_paciente.estado (20261017000200_acceso.sql). */
export const ESTADO_VINCULACION = ['pendiente', 'aprobada', 'rechazada'] as const;
/** acceso.acceso_excepcional.estado (20261017000200_acceso.sql). */
export const ESTADO_ACCESO_EXCEPCIONAL = ['pendiente', 'aprobado', 'negado'] as const;
/** pacientes.paciente.estado (20261017000300_pacientes.sql). */
export const ESTADO_PACIENTE = ['provisional', 'activo', 'inactivo', 'ingresado_por_error'] as const;
/** pacientes.caso_duplicado.estado (20261017000300_pacientes.sql). */
export const ESTADO_CASO_DUPLICADO = ['sospechado', 'en_revision', 'descartado', 'confirmado'] as const;
/** ambulancia.unidad.estado (20261017000900_ambulancia.sql). */
export const ESTADO_AMBULANCIA = ['disponible', 'en_servicio', 'en_mantenimiento'] as const;
/** ambulancia.solicitud.estado (20261017000900_ambulancia.sql). */
export const ESTADO_SOLICITUD_AMBULANCIA = ['por_confirmar', 'confirmada', 'descartada', 'cancelada'] as const;
/** ambulancia.servicio.estado_final (20261017000900_ambulancia.sql). */
export const ESTADO_FINAL_SERVICIO = ['completado', 'cancelado', 'sin_traslado', 'rechaza_traslado'] as const;
/** ambulancia.hito.tipo (20261017000900_ambulancia.sql). */
export const HITO_SERVICIO = ['salida', 'en_escena', 'trasladando', 'en_hospital', 'finalizado'] as const;
/** ambulancia prioridad de triaje (20261017000900_ambulancia.sql). */
export const PRIORIDAD_AMBULANCIA = ['roja', 'naranja', 'amarilla', 'verde'] as const;
/** infra.espacio.categoria and hospitalizacion categories (20261017000400_infra.sql). */
export const CATEGORIA_HABITACION = ['vip', 'semiprivada'] as const;
/** pacientes.paciente.sexo and hospitalizacion.admision.sexo_paciente (20261017000300_pacientes.sql). */
export const SEXO_PACIENTE = ['femenino', 'masculino', 'indeterminado', 'no_registrado'] as const;
