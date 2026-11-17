import { BoolProp, ClassArrayProp, ClassProp, DateProp, DateTimeProp, EnumProp, IntProp, JsonProp, StrProp, UuidProp } from '../platform/responses';
import { ESTADO_CASO_DUPLICADO, ESTADO_PACIENTE, SEXO_PACIENTE } from '../platform/states';

export const PRECISION_NACIMIENTO = ['exacta', 'anio_mes', 'anio', 'estimada', 'desconocida'] as const;

export class PatientCandidateResponse {
  @UuidProp() id!: string;
  @StrProp({ description: 'Número de expediente' }) record!: string;
  @StrProp() fullName!: string;
  @StrProp() givenNames!: string;
  @StrProp() surnames!: string;
  @EnumProp(ESTADO_PACIENTE, 'EstadoPaciente') state!: string;
  @BoolProp() active!: boolean;
  @EnumProp(SEXO_PACIENTE, 'SexoPaciente') sex!: string;
  @DateProp({ optional: true, nullable: true, description: 'Solo para roles que ven la fecha de nacimiento exacta (contexto x)' }) birth?: string | null;
  @StrProp({ optional: true, nullable: true, description: 'Rango de edad en lugar de la fecha (contexto rango, por ejemplo Laboratorio): 30-39 o 90+' }) ageRange?: string | null;
  @IntProp() version!: number;
  @StrProp() matchReason!: string;
}

export class PatientSearchRecordResponse {
  @UuidProp({ description: 'Constancia de búsqueda para registrar (10 minutos)' }) token!: string;
  @DateTimeProp() expiresAt!: string;
  @ClassArrayProp(PatientCandidateResponse) candidates!: PatientCandidateResponse[];
}

export class DuplicatePatientResponse {
  @UuidProp() id!: string;
  @StrProp() record!: string;
  @StrProp({ nullable: true }) fullName!: string | null;
}

export class DuplicateCaseResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_CASO_DUPLICADO, 'EstadoCasoDuplicado') state!: string;
  @StrProp() reason!: string;
  @DateTimeProp() openedAt!: string;
  @ClassArrayProp(DuplicatePatientResponse) patients!: DuplicatePatientResponse[];
}

export class PatientHistoryEntryResponse {
  @IntProp() version!: number;
  @DateTimeProp() at!: string;
  @StrProp() reason!: string;
  @JsonProp({ description: 'Campos cambiados con su valor anterior y nuevo' }) changes!: Record<string, unknown>;
}

/** Ficha filtrada por `docs/arquitectura/privacidad.md`: los campos opcionales solo aparecen si el rol los ve. */
export class PatientDetailResponse {
  @UuidProp() id!: string;
  @StrProp({ description: 'Número de expediente' }) record!: string;
  @StrProp() fullName!: string;
  @StrProp() givenNames!: string;
  @StrProp() surnames!: string;
  @EnumProp(ESTADO_PACIENTE, 'EstadoPaciente') state!: string;
  @BoolProp() active!: boolean;
  @EnumProp(SEXO_PACIENTE, 'SexoPaciente') sex!: string;
  @IntProp() version!: number;
  @BoolProp() provisional!: boolean;
  @DateProp({ optional: true, nullable: true }) birth?: string | null;
  @EnumProp(PRECISION_NACIMIENTO, 'PrecisionNacimiento', { optional: true }) birthPrecision?: string;
  @StrProp({ optional: true, nullable: true, description: 'Rango de edad, por ejemplo 30-39 o 90+' }) ageRange?: string | null;
  @StrProp({ optional: true, nullable: true }) dui?: string | null;
  @StrProp({ optional: true, nullable: true }) phone?: string | null;
  @StrProp({ optional: true, nullable: true }) email?: string | null;
  @StrProp({ optional: true, nullable: true }) address?: string | null;
  @ClassArrayProp(PatientHistoryEntryResponse, { optional: true, description: 'Solo con pacientes.editar_demograficos' }) history?: PatientHistoryEntryResponse[];
}

/** B-2: the patient's next confirmed appointment of today. */
export class PatientAppointmentTodayResponse {
  @UuidProp() id!: string;
  @DateTimeProp() start!: string;
  @UuidProp() doctorId!: string;
  @StrProp() doctorName!: string;
}

/** B-2: the patient's live queue number of today. */
export class PatientTicketTodayResponse {
  @UuidProp() id!: string;
  @StrProp({ description: 'Servicio de la fila (consulta_general, emergencia, laboratorio, admisiones)' }) service!: string;
  @IntProp() numero!: number;
  @StrProp({ description: 'en_espera, llamado o en_atencion' }) state!: string;
  @UuidProp({ nullable: true, description: 'Cita ligada al registrar la llegada' }) appointmentId!: string | null;
}

export class PatientPickerItemResponse {
  @UuidProp() id!: string;
  @StrProp({ description: 'Número de expediente' }) record!: string;
  @StrProp() fullName!: string;
  @IntProp({ optional: true, description: 'Edad en años; solo si el rol puede ver la fecha de nacimiento' }) age?: number | null;
  @ClassProp(PatientAppointmentTodayResponse, { optional: true, nullable: true, description: 'Cita confirmada de hoy (B-2); solo con citas.ver global' }) appointmentToday?: PatientAppointmentTodayResponse | null;
  @ClassProp(PatientTicketTodayResponse, { optional: true, nullable: true, description: 'Número de fila vigente de hoy; solo con fila.ver global' }) ticketToday?: PatientTicketTodayResponse | null;
}

export class PatientPickerResponse {
  @ClassArrayProp(PatientPickerItemResponse) items!: PatientPickerItemResponse[];
  @IntProp() offset!: number;
  @IntProp() limit!: number;
  @BoolProp({ description: 'Hay más resultados después de esta página' }) hasMore!: boolean;
}

export class PatientCreatedResponse {
  @UuidProp() id!: string;
  @StrProp({ description: 'Número de expediente' }) record!: string;
  @IntProp() version!: number;
}

export class PatientStateResponse {
  @UuidProp() id!: string;
  @IntProp() version!: number;
  @EnumProp(ESTADO_PACIENTE, 'EstadoPaciente') state!: string;
}
