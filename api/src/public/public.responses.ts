import { BoolProp, ClassArrayProp, DateProp, DateTimeProp, EnumArrayProp, EnumProp, IntProp, NumProp, StrArrayProp, StrProp, UuidProp } from '../platform/responses';
import { CATEGORIA_HABITACION } from '../platform/states';

export class PublicOccupancyRowResponse {
  @IntProp({ nullable: true }) planta!: number | null;
  @EnumProp(CATEGORIA_HABITACION, 'CategoriaHabitacion') categoria!: string;
  @IntProp() camas!: number;
  @IntProp() libres!: number;
  @IntProp() ocupadas!: number;
}

export class PublicOccupancyResponse {
  @DateTimeProp() actualizadoEn!: string;
  @ClassArrayProp(PublicOccupancyRowResponse) ocupacion!: PublicOccupancyRowResponse[];
}

/** Ubicación pública del hospital (política `hospital.ubicacion`). */
export class HospitalLocationResponse {
  @StrProp() nombre!: string;
  @StrProp() direccion!: string;
  @StrProp() municipio!: string;
  @StrProp() departamento!: string;
  @StrProp() telefono!: string;
  @NumProp() latitud!: number;
  @NumProp() longitud!: number;
}

export class DoctorOnDutyResponse {
  @StrProp() nombre!: string;
  @StrProp() especialidad!: string;
  @StrProp({ nullable: true }) area!: string | null;
  @DateTimeProp({ nullable: true }) hasta!: string | null;
}

export class DoctorsOnDutyResponse {
  @DateTimeProp() actualizadoEn!: string;
  @ClassArrayProp(DoctorOnDutyResponse) medicos!: DoctorOnDutyResponse[];
  @DateTimeProp({ nullable: true }) proximoCambio!: string | null;
}

export class NoticeResponse {
  @UuidProp() id!: string;
  @StrProp() titulo!: string;
  @StrProp() cuerpo!: string;
  @DateTimeProp({ nullable: true }) desde!: string | null;
  @DateTimeProp({ nullable: true }) hasta!: string | null;
  @StrProp({ description: 'atencion, urgente o critico (D-071)' }) prioridad!: string;
}

export const NOTICE_LEVELS_RESPONSE = ['informativo', 'importante', 'critico'] as const;

export class NoticeAudienceResponse extends NoticeResponse {
  @BoolProp() publico!: boolean;
  @StrArrayProp() roles!: string[];
  @EnumProp(NOTICE_LEVELS_RESPONSE, 'NivelAviso', { description: 'Criticidad para el personal (Fase 2): solo critico se destaca en el inicio' }) nivel!: string;
  @StrArrayProp({ description: 'Códigos de espacio (área o bahía) a cuyo personal va dirigido' }) areas!: string[];
}

export const NOTICE_ACTIONS = ['editar', 'retirar'] as const;

export class NoticeListItemResponse extends NoticeAudienceResponse {
  @StrProp({ description: 'vigente, programado, vencido o retirado' }) estado!: string;
  @DateTimeProp({ nullable: true }) publicadoEn!: string | null;
  @IntProp({ description: 'Versión vigente; se envía al editar o retirar' }) version!: number;
  @EnumArrayProp(NOTICE_ACTIONS, 'AccionAviso', { description: 'Acciones que el servidor acepta ahora: ninguna si el aviso venció o fue retirado' }) allowedActions!: string[];
  @DateTimeProp({ nullable: true }) retiradoEn!: string | null;
  @StrProp({ nullable: true, description: 'Motivo del retiro (D-13)' }) motivoRetiro!: string | null;
}

export class MyNoticesResponse {
  @DateTimeProp() actualizadoEn!: string;
  @ClassArrayProp(NoticeAudienceResponse) avisos!: NoticeAudienceResponse[];
  @DateTimeProp({ nullable: true }) proximoCambio!: string | null;
}

/** S11 · Un aviso en la bandeja de la cuenta, con su acuse y si se destaca en el inicio. */
export class MyInboxNoticeResponse extends NoticeAudienceResponse {
  @DateTimeProp({ nullable: true }) publicadoEn!: string | null;
  @BoolProp({ description: 'Dirigido al rol o al área de la cuenta (no solo público)' }) dirigido!: boolean;
  @DateTimeProp({ nullable: true, description: 'Cuándo la cuenta dio "Enterado"; null si no lo ha hecho' }) enteradoEn!: string | null;
  @DateTimeProp({ nullable: true, description: 'Hasta cuándo pospuso el recordatorio' }) recordarEn!: string | null;
  @BoolProp({ description: 'Se destaca en el inicio: crítico, dirigido, sin "Enterado" y sin posponer' }) destacado!: boolean;
}

export class MyInboxResponse {
  @DateTimeProp() actualizadoEn!: string;
  @ClassArrayProp(MyInboxNoticeResponse) avisos!: MyInboxNoticeResponse[];
  @IntProp({ description: 'Avisos sin "Enterado"' }) noLeidos!: number;
  @IntProp({ description: 'Avisos críticos dirigidos a la cuenta sin "Enterado"' }) criticos!: number;
  @NumProp({ description: 'Horas que tarda en volver un crítico pospuesto (política avisos.recordatorio_horas)' }) recordatorioHoras!: number;
  @DateTimeProp({ nullable: true, description: 'Siguiente instante en que la bandeja cambia sola: vence o empieza un aviso, o vuelve un recordatorio' }) proximoCambio!: string | null;
}

export class NoticeAckResponse {
  @UuidProp() avisoId!: string;
  @DateTimeProp({ nullable: true }) enteradoEn!: string | null;
  @DateTimeProp({ nullable: true }) recordarEn!: string | null;
}

export class NoticeStatsResponse {
  @UuidProp() avisoId!: string;
  @IntProp({ description: 'Cuentas que dieron "Enterado"' }) enterados!: number;
  @IntProp({ description: 'Cuentas activas del personal a las que va dirigido por rol o por el área de su ficha; 0 si solo es público' }) destinatarios!: number;
}

export class NoticesResponse {
  @DateTimeProp() actualizadoEn!: string;
  @ClassArrayProp(NoticeResponse) avisos!: NoticeResponse[];
  @DateTimeProp({ nullable: true }) proximoCambio!: string | null;
}

export class NoticePublishedResponse extends NoticeAudienceResponse {
  @DateTimeProp({ nullable: true }) publicadoEn!: string | null;
}

export class CalledNumberResponse {
  @IntProp() numero!: number;
  @StrProp({ nullable: true }) consultorio!: string | null;
  @IntProp() llamados!: number;
}

export class PublicQueueResponse {
  @DateTimeProp() actualizadoEn!: string;
  @StrProp() servicio!: string;
  @DateProp() fecha!: string;
  @ClassArrayProp(CalledNumberResponse) llamados!: CalledNumberResponse[];
}
