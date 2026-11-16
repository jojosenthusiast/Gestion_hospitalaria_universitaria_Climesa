import { ClassArrayProp, ClassProp, DateTimeProp, EnumArrayProp, EnumProp, IntProp, StrArrayProp, StrProp, UuidProp } from '../platform/responses';
import { ESTADO_SOLICITUD_CITA } from '../platform/states';
import { FRANJAS_SOLICITUD } from './appointment-request.dto';
import { CATEGORY_REQUEST_ACTIONS } from './appointment-request.rules';

// ---- Solicitudes de cita por categoría (appointment-request.controller.ts, Fase 2 flujo A) ----

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
  @ClassArrayProp(CategoryRefResponse) categories!: CategoryRefResponse[];
  @StrArrayProp({ description: 'Especialidades sugeridas por las categorías, sin repetir' }) specialties!: string[];
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
