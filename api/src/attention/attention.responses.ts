import { BoolProp, ClassArrayProp, ClassProp, DateProp, DateTimeProp, DecimalProp, EnumProp, IntProp, NumProp, PeriodResponse, StrProp, UuidProp } from '../platform/responses';
import { ESTADO_ADMISION, ESTADO_CITA, ESTADO_CONSULTA, ESTADO_FILA, ESTADO_ORDEN_LABORATORIO, MARCA_RESULTADO, PRIORIDAD_LABORATORIO } from '../platform/states';
import { QUEUE_SERVICES } from './queue.dto';

export const ORIGEN_CITA = ['recepcion', 'paciente'] as const;
export const ACCESO_HISTORIAL = ['propio', 'relacion'] as const;

// ---- Citas (attention.controller.ts) ----

export class CatalogPatientResponse {
  @UuidProp() id!: string;
  @StrProp({ description: 'Número de expediente' }) record!: string;
  @StrProp({ nullable: true }) fullName!: string | null;
  @BoolProp() active!: boolean;
}

export class CatalogDoctorResponse {
  @UuidProp() id!: string;
  @StrProp() givenNames!: string;
  @StrProp() surnames!: string;
  @StrProp() type!: string;
  @StrProp({ nullable: true }) specialty!: string | null;
  @UuidProp({ nullable: true }) areaId!: string | null;
  @StrProp({ nullable: true }) area!: string | null;
  @BoolProp() active!: boolean;
  @BoolProp({ optional: true, nullable: true, description: 'Tiene turno publicado el día consultado; solo si se envía date' }) tieneTurno?: boolean | null;
  @StrProp({ optional: true, nullable: true, description: 'Motivo corto cuando no tiene turno' }) motivo?: string | null;
}

export class AppointmentCatalogsResponse {
  @ClassArrayProp(CatalogPatientResponse) patients!: CatalogPatientResponse[];
  @ClassArrayProp(CatalogDoctorResponse) doctors!: CatalogDoctorResponse[];
}

export const ESTADO_FRANJA = ['libre', 'ocupado', 'sin_turno', 'pasado'] as const;

export class SlotStateResponse {
  @DateTimeProp() start!: string;
  @DateTimeProp() end!: string;
  @EnumProp(ESTADO_FRANJA, 'EstadoFranja') estado!: string;
  @StrProp({ nullable: true, description: 'Motivo corto en español cuando no está libre' }) motivo!: string | null;
}

export class AvailabilityResponse {
  @UuidProp() doctorId!: string;
  @DateProp() date!: string;
  @IntProp() durationMinutes!: number;
  @ClassArrayProp(PeriodResponse) workPeriods!: PeriodResponse[];
  @ClassArrayProp(PeriodResponse) slots!: PeriodResponse[];
  @ClassArrayProp(SlotStateResponse, { description: 'Todas las franjas del día con su estado' }) franjas!: SlotStateResponse[];
}

export class AppointmentResponse {
  @UuidProp() id!: string;
  @UuidProp() patientId!: string;
  @StrProp({ nullable: true }) patientName!: string | null;
  @UuidProp() doctorId!: string;
  @StrProp() doctorName!: string;
  @DateTimeProp() start!: string;
  @DateTimeProp() end!: string;
  @StrProp({ nullable: true }) reason!: string | null;
  @EnumProp(ESTADO_CITA, 'EstadoCita') state!: string;
  @EnumProp(ORIGEN_CITA, 'OrigenCita') origin!: string;
  @StrProp({ nullable: true }) rejectionReason!: string | null;
  @IntProp() version!: number;
}

export class AppointmentCommandResponse {
  @UuidProp() id!: string;
  @IntProp() version!: number;
  @EnumProp(ESTADO_CITA, 'EstadoCita') state!: string;
}

// ---- Consultas (consultation.controller.ts) ----

export class AgendaEntryResponse {
  @UuidProp() appointmentId!: string;
  @UuidProp() patientId!: string;
  @StrProp({ nullable: true }) patientName!: string | null;
  @DateTimeProp() start!: string;
  @DateTimeProp() end!: string;
  @StrProp({ nullable: true }) reason!: string | null;
  @EnumProp(ESTADO_CITA, 'EstadoCita') appointmentState!: string;
  @UuidProp({ nullable: true }) consultationId!: string | null;
  @EnumProp(ESTADO_CONSULTA, 'EstadoConsulta', { nullable: true }) consultationState!: string | null;
  @StrProp({ nullable: true }) consultationReason!: string | null;
  @StrProp({ nullable: true }) physicalExam!: string | null;
  @StrProp({ nullable: true }) plan!: string | null;
  @IntProp({ nullable: true, description: 'Versión de la consulta; null si no se ha iniciado' }) version!: number | null;
  @DateTimeProp({ nullable: true }) startedAt!: string | null;
  @DateTimeProp({ nullable: true }) signedAt!: string | null;
}

export class ConsultationStartResponse {
  @UuidProp() id!: string;
  @UuidProp({ nullable: true }) appointmentId!: string | null;
  @UuidProp({ nullable: true }) ticketId!: string | null;
  @IntProp() version!: number;
  @EnumProp(ESTADO_CONSULTA, 'EstadoConsulta') state!: string;
}

export class ConsultationCommandResponse {
  @UuidProp() id!: string;
  @IntProp() version!: number;
  @EnumProp(ESTADO_CONSULTA, 'EstadoConsulta') state!: string;
}

export class ConsultationSignResponse extends ConsultationCommandResponse {
  @DateTimeProp() signedAt!: string;
}

// ---- Detalle clínico (clinical-record.controller.ts) ----

export class ConsultationSummaryResponse {
  @UuidProp() id!: string;
  @UuidProp() patientId!: string;
  @UuidProp() doctorId!: string;
  @UuidProp({ nullable: true }) appointmentId!: string | null;
  @StrProp({ nullable: true }) reason!: string | null;
  @StrProp({ nullable: true }) physicalExam!: string | null;
  @StrProp({ nullable: true }) plan!: string | null;
  @EnumProp(ESTADO_CONSULTA, 'EstadoConsulta') state!: string;
  @IntProp() version!: number;
  @StrProp({ nullable: true }) patientName!: string | null;
}

export class VitalSignsResponse {
  @UuidProp() id!: string;
  @DateTimeProp() takenAt!: string;
  @UuidProp() takenBy!: string;
  @IntProp({ nullable: true }) systolic!: number | null;
  @IntProp({ nullable: true }) diastolic!: number | null;
  @IntProp({ nullable: true }) heartRate!: number | null;
  @IntProp({ nullable: true }) respiratoryRate!: number | null;
  @DecimalProp({ nullable: true }) temperature!: string | null;
  @IntProp({ nullable: true }) oxygenSaturation!: number | null;
  @DecimalProp({ nullable: true }) weightKg!: string | null;
  @DecimalProp({ nullable: true }) heightCm!: string | null;
}

export class PatientVitalsItemResponse extends VitalSignsResponse {
  @UuidProp({ nullable: true }) consultationId!: string | null;
  @UuidProp({ nullable: true }) admissionId!: string | null;
  @StrProp({ nullable: true }) takenByName!: string | null;
  @IntProp({ nullable: true }) pain!: number | null;
  @IntProp({ nullable: true }) glucoseMgDl!: number | null;
  @StrProp({ nullable: true }) note!: string | null;
}

export class PatientVitalsHistoryResponse {
  @UuidProp() patientId!: string;
  @StrProp() patientName!: string;
  @StrProp({ description: 'Número de expediente' }) record!: string;
  @IntProp({ nullable: true, description: 'Edad en años; nula si el rol no puede ver la fecha de nacimiento' }) age!: number | null;
  @UuidProp({ nullable: true, description: 'Admisión activa del paciente' }) admissionId!: string | null;
  @StrProp({ nullable: true, description: 'Cama actual; nulo si no está hospitalizado o aún sin cama' }) bed!: string | null;
  @ClassArrayProp(PatientVitalsItemResponse) items!: PatientVitalsItemResponse[];
}

export class VitalSignsCreatedResponse {
  @UuidProp() id!: string;
  @DateTimeProp() takenAt!: string;
}

export class DiagnosisResponse {
  @UuidProp() id!: string;
  @StrProp({ description: 'Código CIE-10' }) code!: string;
  @BoolProp() principal!: boolean;
  @StrProp({ nullable: true }) note!: string | null;
}

export class DiagnosisCreatedResponse extends DiagnosisResponse {
  @StrProp() description!: string;
}

export class PrescriptionItemContentResponse {
  @StrProp() medication!: string;
  @StrProp() dose!: string;
  @StrProp() route!: string;
  @StrProp() frequency!: string;
  @StrProp() duration!: string;
  @StrProp({ nullable: true }) instructions!: string | null;
}

export class PrescriptionItemResponse extends PrescriptionItemContentResponse {
  @UuidProp() id!: string;
}

export class PrescriptionResponse {
  @UuidProp() id!: string;
  @DateTimeProp() issuedAt!: string;
  @ClassArrayProp(PrescriptionItemResponse) items!: PrescriptionItemResponse[];
}

export class ConsultationDetailResponse {
  @ClassProp(ConsultationSummaryResponse) consultation!: ConsultationSummaryResponse;
  @ClassArrayProp(VitalSignsResponse) vitalSigns!: VitalSignsResponse[];
  @ClassArrayProp(DiagnosisResponse) diagnoses!: DiagnosisResponse[];
  @ClassArrayProp(PrescriptionResponse) prescriptions!: PrescriptionResponse[];
}

// ---- Historial clínico (clinical-history.controller.ts) ----

export class HistoryPatientResponse {
  @UuidProp() id!: string;
  @StrProp({ description: 'Número de expediente' }) record!: string;
  @StrProp({ nullable: true }) fullName!: string | null;
}

export class HistoryDoctorResponse {
  @UuidProp({ nullable: true }) id!: string | null;
  @StrProp({ nullable: true }) name!: string | null;
}

export class HistoryConsultationDoctorResponse extends HistoryDoctorResponse {
  @StrProp({ nullable: true }) specialty!: string | null;
}

export class HistoryDiagnosisResponse {
  @StrProp({ description: 'Código CIE-10' }) code!: string;
  @StrProp() description!: string;
  @BoolProp() principal!: boolean;
  @StrProp({ nullable: true }) note!: string | null;
}

export class HistoryPrescriptionResponse {
  @UuidProp() id!: string;
  @DateTimeProp() issuedAt!: string;
  @ClassArrayProp(PrescriptionItemContentResponse) items!: PrescriptionItemContentResponse[];
}

export class HistoryConsultationResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_CONSULTA, 'EstadoConsulta') state!: string;
  @DateTimeProp() startedAt!: string;
  @DateTimeProp({ nullable: true }) signedAt!: string | null;
  @StrProp({ nullable: true }) reason!: string | null;
  @StrProp({ nullable: true }) physicalExam!: string | null;
  @StrProp({ nullable: true }) plan!: string | null;
  @ClassProp(HistoryConsultationDoctorResponse) doctor!: HistoryConsultationDoctorResponse;
  @ClassArrayProp(HistoryDiagnosisResponse) diagnoses!: HistoryDiagnosisResponse[];
  @ClassArrayProp(HistoryPrescriptionResponse) prescriptions!: HistoryPrescriptionResponse[];
}

export class HistoryLabResultResponse {
  @NumProp({ nullable: true }) value!: number | null;
  @StrProp({ nullable: true }) text!: string | null;
  @EnumProp(MARCA_RESULTADO, 'MarcaResultado') mark!: string;
}

export class HistoryLabItemResponse {
  @UuidProp() id!: string;
  @StrProp() code!: string;
  @StrProp() name!: string;
  @StrProp({ nullable: true }) unit!: string | null;
  @ClassProp(HistoryLabResultResponse, { nullable: true, description: 'null sin resultado o si el actor aún no puede ver valores' }) result!: HistoryLabResultResponse | null;
}

export class HistoryLabOrderResponse {
  @UuidProp() id!: string;
  @UuidProp({ nullable: true }) consultationId!: string | null;
  @EnumProp(ESTADO_ORDEN_LABORATORIO, 'EstadoOrdenLaboratorio') state!: string;
  @EnumProp(PRIORIDAD_LABORATORIO, 'PrioridadLaboratorio') priority!: string;
  @DateTimeProp() createdAt!: string;
  @DateTimeProp({ nullable: true }) completedAt!: string | null;
  @DateTimeProp({ nullable: true }) reviewedAt!: string | null;
  @ClassArrayProp(HistoryLabItemResponse) items!: HistoryLabItemResponse[];
}

export class HistoryAdmissionResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_ADMISION, 'EstadoAdmision') state!: string;
  @StrProp() origin!: string;
  @DateTimeProp() createdAt!: string;
  @ClassProp(HistoryDoctorResponse) doctor!: HistoryDoctorResponse;
}

export class ClinicalHistoryResponse {
  @ClassProp(HistoryPatientResponse) patient!: HistoryPatientResponse;
  @EnumProp(ACCESO_HISTORIAL, 'AccesoHistorial') access!: string;
  @ClassArrayProp(HistoryConsultationResponse) consultations!: HistoryConsultationResponse[];
  @ClassArrayProp(HistoryLabOrderResponse) laboratory!: HistoryLabOrderResponse[];
  @ClassArrayProp(HistoryAdmissionResponse, { description: 'Vacío para el propio paciente' }) admissions!: HistoryAdmissionResponse[];
}

// ---- Fila (queue.controller.ts) ----

export class QueueTicketResponse {
  @UuidProp() id!: string;
  @EnumProp(QUEUE_SERVICES, 'ServicioFila') service!: string;
  @DateTimeProp({ description: 'Columna date de PostgreSQL serializada como instante (medianoche del servidor)' }) fecha!: string;
  @IntProp() numero!: number;
  @UuidProp({ nullable: true }) patientId!: string | null;
  @StrProp({ nullable: true }) patientName!: string | null;
  @EnumProp(ESTADO_FILA, 'EstadoFila') state!: string;
  @UuidProp({ nullable: true }) officeId!: string | null;
  @IntProp() llamados!: number;
  @IntProp() version!: number;
  @DateTimeProp() issuedAt!: string;
}

export class QueueIssuedResponse {
  @UuidProp() id!: string;
  @EnumProp(QUEUE_SERVICES, 'ServicioFila') service!: string;
  @DateTimeProp({ description: 'Columna date de PostgreSQL serializada como instante (medianoche del servidor)' }) fecha!: string;
  @IntProp() numero!: number;
  @EnumProp(ESTADO_FILA, 'EstadoFila') state!: string;
  @IntProp() version!: number;
  @StrProp() serviceName!: string;
  @UuidProp() patientId!: string;
}

export class QueueTransitionResponse {
  @UuidProp() id!: string;
  @IntProp() version!: number;
  @EnumProp(ESTADO_FILA, 'EstadoFila') state!: string;
}

export class QueueCallResponse extends QueueTransitionResponse {
  @IntProp() llamados!: number;
}
