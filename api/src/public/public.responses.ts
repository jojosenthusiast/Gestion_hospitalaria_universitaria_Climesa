import { BoolProp, ClassArrayProp, DateProp, DateTimeProp, EnumProp, IntProp, StrArrayProp, StrProp, UuidProp } from '../platform/responses';
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

export class NoticeAudienceResponse extends NoticeResponse {
  @BoolProp() publico!: boolean;
  @StrArrayProp() roles!: string[];
}

export class NoticeListItemResponse extends NoticeAudienceResponse {
  @StrProp({ description: 'vigente, programado o vencido' }) estado!: string;
  @DateTimeProp({ nullable: true }) publicadoEn!: string | null;
}

export class MyNoticesResponse {
  @DateTimeProp() actualizadoEn!: string;
  @ClassArrayProp(NoticeAudienceResponse) avisos!: NoticeAudienceResponse[];
  @DateTimeProp({ nullable: true }) proximoCambio!: string | null;
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
