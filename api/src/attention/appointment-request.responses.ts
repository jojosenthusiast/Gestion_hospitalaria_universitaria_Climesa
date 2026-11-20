import { BoolProp, ClassArrayProp, ClassProp, DateProp, DateTimeProp, EnumArrayProp, EnumProp, IntProp, StrArrayProp, StrProp, UuidProp } from '../platform/responses';
import { ESTADO_SOLICITUD_CITA } from '../platform/states';
import { FRANJAS_SOLICITUD } from './appointment-request.dto';
import { CATEGORY_REQUEST_ACTIONS } from './appointment-request.rules';

// ---- Solicitudes de cita por categoría (appointment-request.controller.ts, Fase 2 flujo A) ----

/** Audit D128: the pending-request limit, read before the patient fills the form. */
export class RequestLimitResponse {
  @IntProp({ description: 'Solicitudes pendientes que cuentan para el límite' }) pending!: number;
  @IntProp({ description: 'Máximo de la política citas.solicitudes_pendientes_max' }) max!: number;
  @BoolProp({ description: 'false: el cliente deshabilita "Pedir una cita" y muestra reason' }) canRequest!: boolean;
  @EnumProp(['solicitudes_pendientes_max'] as const, 'MotivoLimiteSolicitud', { nullable: true }) code!: string | null;
  @StrProp({ nullable: true }) reason!: string | null;
}

export class AppointmentCategoryResponse {
  @StrProp() code!: string;
  @StrProp() name!: string;
  @StrProp() description!: string;
  @StrProp({ description: 'Clave estable del ícono; cada cliente la traduce a su juego de íconos' }) icon!: string;
  @StrArrayProp({ description: 'Especialidades que recepción ve sugeridas al asignar' }) specialties!: string[];
  @StrProp({ description: 'Palabras sin tildes para la búsqueda por texto' }) keywords!: string;
}

export class CategoryRefResponse {
  @StrProp() code!: string;
  @StrProp() name!: string;
  @StrProp() icon!: string;
}

export class AssignedAppointmentResponse {
  @UuidProp() id!: string;
  @UuidProp() doctorId!: string;
  @StrProp() doctorName!: string;
  @DateTimeProp() start!: string;
  @DateTimeProp() end!: string;
}

export class BlockedCategoryRequestActionResponse {
  @EnumProp(CATEGORY_REQUEST_ACTIONS, 'AccionSolicitudCita') action!: string;
  @StrProp() reason!: string;
}

export class CategoryRequestResponse {
  @UuidProp() id!: string;
  @UuidProp() patientId!: string;
  @StrProp({ nullable: true }) patientName!: string | null;
  @StrProp({ nullable: true }) record!: string | null;
  @IntProp({ optional: true, nullable: true, description: 'Lote 5: edad en años hoy; solo con pacientes.ver_nacimiento' }) patientAge?: number | null;
  @StrProp({ optional: true, nullable: true, description: 'Lote 5: sexo del paciente; solo con pacientes.ver_ficha' }) patientSex?: string | null;
  @ClassArrayProp(CategoryRefResponse) categories!: CategoryRefResponse[];
  @StrArrayProp({ description: 'Especialidades sugeridas por las categorías, sin repetir' }) specialties!: string[];
  @BoolProp({ description: 'Lote 5 S6: algún médico de esas especialidades (o cualquiera, si ninguno las tiene) tiene turno publicado en los próximos 14 días; si es false, asignar responde sin_personal_disponible' }) staffAvailable!: boolean;
  @EnumProp(FRANJAS_SOLICITUD, 'FranjaSolicitudCita') franja!: string;
  @StrProp({ nullable: true }) note!: string | null;
  @UuidProp({ nullable: true }) preferredDoctorId!: string | null;
  @StrProp({ nullable: true }) preferredDoctorName!: string | null;
  @EnumProp(ESTADO_SOLICITUD_CITA, 'EstadoSolicitudCita') state!: string;
  @StrProp({ nullable: true }) rejectionReason!: string | null;
  @ClassProp(AssignedAppointmentResponse, { nullable: true, description: 'Cita creada al asignar' }) appointment!: AssignedAppointmentResponse | null;
  @DateTimeProp() createdAt!: string;
  @IntProp() version!: number;
  @EnumArrayProp(CATEGORY_REQUEST_ACTIONS, 'AccionSolicitudCita', { description: 'Acciones que el servidor acepta ahora para quien lee' }) allowedActions!: string[];
  @ClassArrayProp(BlockedCategoryRequestActionResponse) blockedActions!: BlockedCategoryRequestActionResponse[];
}

export class CategoryRequestCommandResponse {
  @UuidProp() id!: string;
  @IntProp() version!: number;
  @EnumProp(ESTADO_SOLICITUD_CITA, 'EstadoSolicitudCita') state!: string;
  @UuidProp({ optional: true, description: 'Cita confirmada creada al asignar' }) appointmentId?: string;
}

/** A-1: the slot the assign panel opens with. */
export class CategoryRequestSuggestionResponse {
  @BoolProp({ description: 'false si ningún médico candidato tiene hueco en la franja en 14 días' }) found!: boolean;
  @UuidProp({ nullable: true }) doctorId!: string | null;
  @StrProp({ nullable: true }) doctorName!: string | null;
  @StrProp({ nullable: true }) specialty!: string | null;
  @DateProp({ nullable: true }) date!: string | null;
  @DateTimeProp({ nullable: true }) start!: string | null;
  @DateTimeProp({ nullable: true }) end!: string | null;
}
