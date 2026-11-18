import { BoolProp, ClassArrayProp, ClassProp, DateProp, DateTimeProp, DecimalProp, EnumArrayProp, EnumProp, IntProp, NumProp, StrProp, UuidProp } from '../platform/responses';
import { ESTADO_ORDEN_LABORATORIO, MARCA_RESULTADO, PRIORIDAD_LABORATORIO } from '../platform/states';
import { ATTACHMENT_TYPES, RANGE_SEXES } from './laboratory.dto';
import { LAB_EXTERNAL_ACTIONS, LAB_ORDER_ACTIONS } from './laboratory.rules';

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
  @StrProp({ nullable: true, optional: true, description: 'S10: observación del laboratorio; solo para el personal, nunca en lecturas del paciente' }) observation?: string | null;
  @BoolProp({ optional: true, description: 'S10: la observación es relevante (abrió un pendiente para el médico); solo para el personal' }) relevant?: boolean;
}

/** C-3: reference range valid for this patient (sex, age at the sample or today); null without a range or without values. */
export class LabItemRangeResponse {
  @NumProp({ nullable: true }) min!: number | null;
  @NumProp({ nullable: true }) max!: number | null;
  @NumProp({ nullable: true }) criticalLow!: number | null;
  @NumProp({ nullable: true }) criticalHigh!: number | null;
}

export class LabOrderItemResponse {
  @UuidProp() id!: string;
  @UuidProp() examId!: string;
  @StrProp() code!: string;
  @StrProp() name!: string;
  @StrProp({ nullable: true, description: 'Unidad del catálogo' }) unit!: string | null;
  @EnumProp(TIPO_RESULTADO, 'TipoResultadoLaboratorio', { description: 'S10: numérico (valor) o texto' }) resultType!: string;
  @ClassProp(LabItemResultResponse, { nullable: true, description: 'null sin resultado o si el actor aún no puede ver valores' }) result!: LabItemResultResponse | null;
  @ClassProp(LabItemRangeResponse, { nullable: true, optional: true, description: 'C-3: rango de referencia y críticos vigentes para este paciente; solo para quien ve valores' }) referenceRange?: LabItemRangeResponse | null;
}

export class LabOrderResponse {
  @UuidProp() id!: string;
  @UuidProp({ nullable: true, description: 'Consulta de la que cuelga la orden; null en órdenes de una admisión' }) consultationId!: string | null;
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
  @BoolProp({ description: 'S10: el examen se realiza en otro sitio' }) external!: boolean;
  @StrProp({ nullable: true, description: 'S10: dónde se realiza la orden externa' }) externalPlace!: string | null;
  @StrProp({ nullable: true, description: 'S10: instrucciones para el paciente de la orden externa' }) externalInstructions!: string | null;
  @StrProp({ optional: true, nullable: true, description: 'R7 C1: nota del médico para el paciente; solo después de liberar los resultados' }) patientNote?: string | null;
  @EnumArrayProp(LAB_EXTERNAL_ACTIONS, 'AccionExternaLaboratorio', { description: 'S10: acciones del camino externo que el servidor acepta ahora para quien lee' }) externalActions!: string[];
}

/** S10: reference of the photo or PDF of an external result. `stored` says whether the file is in the private bucket (T07b). */
export class LabAttachmentResponse {
  @UuidProp() id!: string;
  @StrProp() fileName!: string;
  @EnumProp(ATTACHMENT_TYPES, 'TipoAdjuntoLaboratorio') mimeType!: string;
  @IntProp() sizeBytes!: number;
  @StrProp({ nullable: true }) sha256!: string | null;
  @BoolProp({ description: 'El archivo está guardado en el almacenamiento clínico privado; false si solo existe la referencia' }) stored!: boolean;
  @StrProp({ nullable: true }) note!: string | null;
  @DateTimeProp() uploadedAt!: string;
  @StrProp({ nullable: true }) uploadedByName!: string | null;
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

/** POST /laboratorio/adjuntos/{id}/archivo (T07b): what the server stored; never the bucket path. */
export class LabAttachmentStoredResponse {
  @UuidProp() id!: string;
  @BoolProp() stored!: boolean;
  @EnumProp(ATTACHMENT_TYPES, 'TipoAdjuntoLaboratorio', { description: 'Tipo leído del contenido del archivo (bytes iniciales), no del nombre' }) mimeType!: string;
  @IntProp() sizeBytes!: number;
  @StrProp({ description: 'Huella SHA-256 calculada en el servidor' }) sha256!: string;
}

/** GET /laboratorio/adjuntos/{id}/enlace (T07b): short-lived signed download link, for staff who see the order's values. */
export class LabAttachmentLinkResponse {
  @StrProp({ description: 'Enlace firmado de descarga; deja de funcionar en `expiresAt`. No se guarda ni se comparte.' }) url!: string;
  @DateTimeProp() expiresAt!: string;
  @IntProp() expiresInSeconds!: number;
  @StrProp() fileName!: string;
  @EnumProp(ATTACHMENT_TYPES, 'TipoAdjuntoLaboratorio') mimeType!: string;
  @IntProp() sizeBytes!: number;
}

/** GET /laboratorio/ordenes/{id}: the list row plus the cancel reason and, for staff who see values, the correction history. */
export class LabOrderDetailResponse extends LabOrderResponse {
  @StrProp({ nullable: true }) cancellationReason!: string | null;
  @ClassArrayProp(LabResultHistoryResponse, { description: 'Vacío para quien no ve valores' }) history!: LabResultHistoryResponse[];
  @ClassArrayProp(LabAttachmentResponse, { description: 'S10: adjuntos del resultado externo; vacío para quien no ve valores' }) attachments!: LabAttachmentResponse[];
}

export const MOTIVO_PENDIENTE_LABORATORIO = ['critico', 'observacion'] as const;
export const ESTADO_PENDIENTE_LABORATORIO = ['pendiente', 'revisado'] as const;
export const ESTADO_PROPUESTA_CITA = ['propuesta', 'confirmada', 'descartada'] as const;

/** C-4: one captured value shown inline in the doctor's tray. */
export class LabFollowUpValueResponse {
  @StrProp() code!: string;
  @StrProp() name!: string;
  @StrProp({ nullable: true }) unit!: string | null;
  @NumProp({ nullable: true }) value!: number | null;
  @StrProp({ nullable: true }) text!: string | null;
  @EnumProp(MARCA_RESULTADO, 'MarcaResultado') mark!: string;
}

/** S10: one item of the doctor's "Resultados por revisar". */
export class LabFollowUpResponse {
  @UuidProp() id!: string;
  @UuidProp() orderId!: string;
  @UuidProp() patientId!: string;
  @StrProp({ nullable: true }) patientName!: string | null;
  @StrProp({ nullable: true }) patientRecord!: string | null;
  @EnumProp(MOTIVO_PENDIENTE_LABORATORIO, 'MotivoPendienteLaboratorio') reason!: string;
  @StrProp({ description: 'Exámenes y hallazgo en palabras («Hemoglobina: Crítico bajo»)' }) detail!: string;
  @EnumProp(ESTADO_PENDIENTE_LABORATORIO, 'EstadoPendienteLaboratorio') state!: string;
  @EnumProp(ESTADO_ORDEN_LABORATORIO, 'EstadoOrdenLaboratorio') orderState!: string;
  @EnumProp(PRIORIDAD_LABORATORIO, 'PrioridadLaboratorio') priority!: string;
  @BoolProp() external!: boolean;
  @DateTimeProp() createdAt!: string;
  @DateTimeProp() updatedAt!: string;
  @IntProp() version!: number;
  @IntProp({ optional: true, description: 'C-4: versión vigente de la orden, para revisarla desde la bandeja' }) orderVersion?: number;
  @EnumArrayProp(LAB_ORDER_ACTIONS, 'AccionOrdenLaboratorio', { optional: true, description: 'C-4: acciones sobre la orden que el servidor acepta ahora para quien lee' }) orderActions?: string[];
  @ClassArrayProp(LabFollowUpValueResponse, { optional: true, description: 'C-4: valores capturados de la orden, críticos primero' }) values?: LabFollowUpValueResponse[];
}

export class LabFollowUpStateResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_PENDIENTE_LABORATORIO, 'EstadoPendienteLaboratorio') state!: string;
  @IntProp() version!: number;
  @DateTimeProp() reviewedAt!: string;
}

/** S10: follow-up appointment the system proposes when an order's results arrive; reception confirms it. No values. */
export class LabProposalResponse {
  @UuidProp() id!: string;
  @UuidProp() orderId!: string;
  @UuidProp() patientId!: string;
  @StrProp({ nullable: true }) patientName!: string | null;
  @StrProp({ nullable: true }) patientRecord!: string | null;
  @UuidProp() doctorId!: string;
  @StrProp({ nullable: true }) doctorName!: string | null;
  @EnumProp(ESTADO_PROPUESTA_CITA, 'EstadoPropuestaCita') state!: string;
  @EnumProp(PRIORIDAD_LABORATORIO, 'PrioridadLaboratorio') priority!: string;
  @DateTimeProp() resultsAt!: string;
  @DateTimeProp() createdAt!: string;
  @IntProp() version!: number;
}

export class LabProposalStateResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_PROPUESTA_CITA, 'EstadoPropuestaCita') state!: string;
  @IntProp() version!: number;
  @UuidProp({ nullable: true }) appointmentId!: string | null;
}

export class LabExternalSentResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_ORDEN_LABORATORIO, 'EstadoOrdenLaboratorio') state!: string;
  @IntProp() version!: number;
  @BoolProp() external!: boolean;
  @BoolProp({ optional: true, description: 'R7 C-6: el paciente tiene cuenta y ve «Examen en otro sitio» con las instrucciones en su app; si es false, entrégaselas impresas' }) patientNotified?: boolean;
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

/** POST /laboratorio/ordenes/{id}/resultado-externo: the completed order and the attachment that receives its file next. */
export class LabExternalResultResponse extends LabCompleteResponse {
  @UuidProp({ nullable: true, description: 'Adjunto creado con la referencia; su archivo se sube con POST /laboratorio/adjuntos/{id}/archivo' }) attachmentId!: string | null;
}

/** POST /laboratorio/pacientes/{id}/resultado-externo (R7 C-5): the order created and completed, and the consultation it hangs from. */
export class LabExternalRecordResponse extends LabExternalResultResponse {
  @UuidProp() consultationId!: string;
}

export class LabReviewResponse {
  @UuidProp() id!: string;
  @IntProp() version!: number;
  @DateTimeProp() reviewedAt!: string;
  @IntProp({ optional: true, description: 'C-2: pendientes de «Resultados por revisar» que se cerraron con la revisión' }) followUpsClosed?: number;
  @UuidProp({ nullable: true, optional: true, description: 'D-4: propuesta de cita de seguimiento creada para recepción, o null' }) followUpProposalId?: string | null;
  @StrProp({ optional: true, description: 'A5: por qué no se propuso cita: no_pedida, hospitalizado, ya_propuesta o sin_consulta' }) followUpSkipped?: string;
}

export class LabBatchResultItemResponse {
  @UuidProp() orderItemId!: string;
  @EnumProp(MARCA_RESULTADO, 'MarcaResultado') mark!: string;
  @IntProp({ description: 'Versión del resultado' }) version!: number;
}

/** C-1: outcome of a batch capture. */
export class LabResultBatchResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_ORDEN_LABORATORIO, 'EstadoOrdenLaboratorio') state!: string;
  @IntProp({ description: 'Versión de la orden después del lote' }) orderVersion!: number;
  @ClassArrayProp(LabBatchResultItemResponse) results!: LabBatchResultItemResponse[];
  @IntProp({ description: 'Valores críticos del lote (avisan al médico que pidió la orden)' }) criticalCount!: number;
  @DateTimeProp({ nullable: true }) completedAt!: string | null;
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
