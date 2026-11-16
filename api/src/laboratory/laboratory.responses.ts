import { BoolProp, ClassArrayProp, ClassProp, DateProp, DateTimeProp, DecimalProp, EnumArrayProp, EnumProp, IntProp, NumProp, StrProp, UuidProp } from '../platform/responses';
import { ESTADO_ORDEN_LABORATORIO, MARCA_RESULTADO, PRIORIDAD_LABORATORIO } from '../platform/states';
import { RANGE_SEXES } from './laboratory.dto';
import { LAB_ORDER_ACTIONS } from './laboratory.rules';

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
  @StrProp({ nullable: true, description: 'Unidad del catálogo' }) unit!: string | null;
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
  @DateTimeProp({ nullable: true, description: 'Última enmienda de un resultado ya completado (vuelve a revisión médica)' }) amendedAt!: string | null;
  @IntProp() version!: number;
  @StrProp({ nullable: true }) patientName!: string | null;
  @StrProp({ nullable: true, description: 'Número de expediente' }) patientRecord!: string | null;
  @StrProp({ nullable: true }) patientSex!: string | null;
  @IntProp({ nullable: true, description: 'Edad exacta; solo con permiso de ver la fecha de nacimiento' }) patientAge!: number | null;
  @StrProp({ nullable: true, description: 'Decenio de edad («30-39») para quien solo ve el rango' }) patientAgeRange!: string | null;
  @StrProp({ nullable: true, description: 'Médico que ordenó los estudios' }) doctorName!: string | null;
  @ClassArrayProp(LabOrderItemResponse) items!: LabOrderItemResponse[];
  @EnumArrayProp(LAB_ORDER_ACTIONS, 'AccionOrdenLaboratorio', { description: 'Acciones que el servidor acepta ahora para quien lee' }) allowedActions!: string[];
}

export class LabResultHistoryResponse {
  @UuidProp() orderItemId!: string;
  @IntProp({ description: 'Versión del resultado que se reemplazó' }) version!: number;
  @NumProp({ nullable: true }) value!: number | null;
  @StrProp({ nullable: true }) text!: string | null;
  @EnumProp(MARCA_RESULTADO, 'MarcaResultado') mark!: string;
  @DateTimeProp() changedAt!: string;
  @StrProp({ nullable: true }) changedByName!: string | null;
  @StrProp() reason!: string;
}

/** GET /laboratorio/ordenes/{id}: the list row plus the cancel reason and, for staff who see values, the correction history. */
export class LabOrderDetailResponse extends LabOrderResponse {
  @StrProp({ nullable: true }) cancellationReason!: string | null;
  @ClassArrayProp(LabResultHistoryResponse, { description: 'Vacío para quien no ve valores' }) history!: LabResultHistoryResponse[];
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

export class LabRangeResponse {
  @UuidProp() id!: string;
  @EnumProp(RANGE_SEXES, 'SexoRangoReferencia') sex!: string;
  @IntProp() ageFrom!: number;
  @IntProp({ nullable: true }) ageTo!: number | null;
  @NumProp({ nullable: true }) min!: number | null;
  @NumProp({ nullable: true }) max!: number | null;
  @NumProp({ nullable: true }) criticalLow!: number | null;
  @NumProp({ nullable: true }) criticalHigh!: number | null;
  @DateProp() validFrom!: string;
  @StrProp() source!: string;
}

export class LabCatalogComponentResponse {
  @UuidProp() id!: string;
  @StrProp() code!: string;
  @StrProp() name!: string;
}

/** W10: one exam of the full catalog (active or not) with its components and the ranges valid today. */
export class LabCatalogExamResponse extends LabExamResponse {
  @BoolProp() active!: boolean;
  @IntProp() version!: number;
  @BoolProp({ description: 'Ya tiene resultados capturados (la unidad no se cambia)' }) hasResults!: boolean;
  @ClassArrayProp(LabCatalogComponentResponse) components!: LabCatalogComponentResponse[];
  @ClassArrayProp(LabRangeResponse) ranges!: LabRangeResponse[];
}
