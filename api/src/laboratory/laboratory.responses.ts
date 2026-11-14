import { BoolProp, ClassArrayProp, ClassProp, DateTimeProp, DecimalProp, EnumProp, IntProp, NumProp, StrProp, UuidProp } from '../platform/responses';
import { ESTADO_ORDEN_LABORATORIO, MARCA_RESULTADO, PRIORIDAD_LABORATORIO } from '../platform/states';

export const TIPO_RESULTADO = ['numerico', 'texto'] as const;

export class LabExamResponse {
  @UuidProp() id!: string;
  @StrProp() code!: string;
  @StrProp() name!: string;
  @BoolProp() isPanel!: boolean;
  @StrProp({ nullable: true }) unit!: string | null;
  @EnumProp(TIPO_RESULTADO, 'TipoResultadoLaboratorio') resultType!: string;
}

export class LabItemResultResponse {
  @NumProp({ nullable: true }) value!: number | null;
  @StrProp({ nullable: true }) text!: string | null;
  @EnumProp(MARCA_RESULTADO, 'MarcaResultado') mark!: string;
  @IntProp() version!: number;
}

export class LabOrderItemResponse {
  @UuidProp() id!: string;
  @UuidProp() examId!: string;
  @StrProp() code!: string;
  @StrProp() name!: string;
  @ClassProp(LabItemResultResponse, { nullable: true, description: 'null sin resultado o si el actor aún no puede ver valores' }) result!: LabItemResultResponse | null;
}

export class LabOrderResponse {
  @UuidProp() id!: string;
  @UuidProp() consultationId!: string;
  @UuidProp() patientId!: string;
  @UuidProp() doctorId!: string;
  @EnumProp(PRIORIDAD_LABORATORIO, 'PrioridadLaboratorio') priority!: string;
  @EnumProp(ESTADO_ORDEN_LABORATORIO, 'EstadoOrdenLaboratorio') state!: string;
  @DateTimeProp() createdAt!: string;
  @DateTimeProp({ nullable: true }) sampleTakenAt!: string | null;
  @DateTimeProp({ nullable: true }) completedAt!: string | null;
  @DateTimeProp({ nullable: true }) reviewedAt!: string | null;
  @IntProp() version!: number;
  @StrProp({ nullable: true }) patientName!: string | null;
  @StrProp({ nullable: true, description: 'Número de expediente' }) patientRecord!: string | null;
  @StrProp({ nullable: true }) patientSex!: string | null;
  @IntProp({ nullable: true, description: 'Edad exacta; solo con permiso de ver la fecha de nacimiento' }) patientAge!: number | null;
  @StrProp({ nullable: true, description: 'Decenio de edad («30-39») para quien solo ve el rango' }) patientAgeRange!: string | null;
  @StrProp({ nullable: true, description: 'Médico que ordenó los estudios' }) doctorName!: string | null;
  @ClassArrayProp(LabOrderItemResponse) items!: LabOrderItemResponse[];
}

export class LabOrderCreatedResponse {
  @UuidProp() id!: string;
  @IntProp() version!: number;
  @EnumProp(ESTADO_ORDEN_LABORATORIO, 'EstadoOrdenLaboratorio') state!: string;
  @UuidProp() consultationId!: string;
  @UuidProp() patientId!: string;
  @IntProp() itemCount!: number;
}

export class LabOrderStateResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_ORDEN_LABORATORIO, 'EstadoOrdenLaboratorio') state!: string;
  @IntProp() version!: number;
}

export class LabSampleResponse extends LabOrderStateResponse {
  @DateTimeProp() sampleTakenAt!: string;
}

export class LabCompleteResponse extends LabOrderStateResponse {
  @DateTimeProp() completedAt!: string;
}

export class LabReviewResponse {
  @UuidProp() id!: string;
  @IntProp() version!: number;
  @DateTimeProp() reviewedAt!: string;
}

export class LabResultResponse {
  @UuidProp() orderItemId!: string;
  @DecimalProp({ nullable: true }) valor!: string | null;
  @StrProp({ nullable: true }) texto!: string | null;
  @EnumProp(MARCA_RESULTADO, 'MarcaResultado') marca!: string;
  @IntProp({ description: 'Versión del resultado' }) version!: number;
  @IntProp({ description: 'Versión de la orden después de la captura' }) orderVersion!: number;
}
