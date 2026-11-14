import { BoolProp, DateTimeProp, EnumProp, IntProp, StrProp, UuidProp } from '../platform/responses';
import { CATEGORIA_HABITACION, ESTADO_ADMISION, ESTADO_CAMA, SEXO_PACIENTE } from '../platform/states';

export const ORIGEN_ADMISION = ['consulta', 'emergencia', 'ambulancia', 'programada'] as const;

export class AdmissionResponse {
  @UuidProp() id!: string;
  @UuidProp() patientId!: string;
  @StrProp({ nullable: true }) patientName!: string | null;
  @EnumProp(ORIGEN_ADMISION, 'OrigenAdmision') origin!: string;
  @EnumProp(CATEGORIA_HABITACION, 'CategoriaHabitacion') requestedCategory!: string;
  @EnumProp(ESTADO_ADMISION, 'EstadoAdmision') state!: string;
  @BoolProp() isolation!: boolean;
  @DateTimeProp({ nullable: true }) scheduledAt!: string | null;
  @UuidProp() attendingDoctorId!: string;
  @IntProp() version!: number;
  @StrProp({ description: 'Código de la cama actual; cadena vacía si no tiene' }) bed!: string;
  @UuidProp({ nullable: true }) occupationId!: string | null;
}

export class AdmissionCommandResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_ADMISION, 'EstadoAdmision') state!: string;
  @IntProp() version!: number;
}

export class BedSuggestionResponse {
  @UuidProp() id!: string;
  @IntProp() version!: number;
  @StrProp() code!: string;
  @UuidProp() roomId!: string;
  @StrProp() room!: string;
  @EnumProp(CATEGORIA_HABITACION, 'CategoriaHabitacion') category!: string;
  @IntProp({ nullable: true }) level!: number | null;
  @EnumProp(ESTADO_CAMA, 'EstadoCama') state!: string;
  @EnumProp(SEXO_PACIENTE, 'SexoPaciente', { nullable: true }) roomSex!: string | null;
  @BoolProp() roomIsolation!: boolean;
  @IntProp() occupiedInRoom!: number;
  @StrProp() reason!: string;
}

export class BedAssignmentResponse {
  @UuidProp() id!: string;
  @UuidProp() bedId!: string;
  @EnumProp(ESTADO_ADMISION, 'EstadoAdmision') state!: string;
  @IntProp() version!: number;
}

export class NursingNoteResponse {
  @UuidProp() id!: string;
  @DateTimeProp() createdAt!: string;
}

export class AdmissionExitResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_ADMISION, 'EstadoAdmision') state!: string;
  @UuidProp() bedId!: string;
  @IntProp() version!: number;
}

export class TransferResponse {
  @UuidProp() admissionId!: string;
  @UuidProp() occupationId!: string;
  @UuidProp() fromBedId!: string;
  @UuidProp() toBedId!: string;
  @EnumProp(ESTADO_ADMISION, 'EstadoAdmision') state!: string;
  @IntProp() version!: number;
}
