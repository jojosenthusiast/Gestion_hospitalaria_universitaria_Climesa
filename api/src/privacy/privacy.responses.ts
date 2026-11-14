import { BigIntProp, BoolProp, DateTimeProp, EnumProp, IntProp, StrProp, UuidProp } from '../platform/responses';
import { ESTADO_ACCESO_EXCEPCIONAL } from '../platform/states';

/** Estado mostrado a las personas (privacy.rules.ts `accessView`). */
export const VISTA_ACCESO_EXCEPCIONAL = ['pendiente', 'por_revisar', 'vigente', 'vencido', 'negado'] as const;
export const RESULTADO_AUDITORIA = ['exito', 'denegado', 'fallido'] as const;

export class ExceptionalAccessResponse {
  @UuidProp() id!: string;
  @UuidProp() solicitanteId!: string;
  @StrProp() solicitante!: string;
  @StrProp({ nullable: true, description: 'Códigos de rol separados por coma' }) solicitanteRoles!: string | null;
  @UuidProp() pacienteId!: string;
  @StrProp() expediente!: string;
  @StrProp() motivo!: string;
  @IntProp() horas!: number;
  @BoolProp() urgencia!: boolean;
  @EnumProp(ESTADO_ACCESO_EXCEPCIONAL, 'EstadoAccesoExcepcional') estado!: string;
  @UuidProp({ nullable: true }) resueltoPor!: string | null;
  @DateTimeProp({ nullable: true }) resueltoEn!: string | null;
  @DateTimeProp({ nullable: true }) desde!: string | null;
  @DateTimeProp({ nullable: true }) hasta!: string | null;
  @DateTimeProp() creadoEn!: string;
  @IntProp() version!: number;
  @EnumProp(VISTA_ACCESO_EXCEPCIONAL, 'VistaAccesoExcepcional') vista!: string;
}

export class AuditEntryResponse {
  @BigIntProp() seq!: string;
  @DateTimeProp() at!: string;
  @StrProp({ nullable: true }) role!: string | null;
  @StrProp({ nullable: true }) actor!: string | null;
  @UuidProp({ nullable: true }) actorId!: string | null;
  @StrProp({ nullable: true }) permission!: string | null;
  @StrProp() action!: string;
  @StrProp() entity!: string;
  @StrProp({ nullable: true }) entityId!: string | null;
  @UuidProp({ nullable: true }) patientId!: string | null;
  @StrProp({ nullable: true }) patientRecord!: string | null;
  @EnumProp(RESULTADO_AUDITORIA, 'ResultadoAuditoria') result!: string;
  @StrProp({ nullable: true }) reason!: string | null;
}

export class AuditVerificationResponse {
  @BoolProp() integra!: boolean;
  @IntProp() revisados!: number;
  @IntProp({ optional: true, description: 'Solo si la cadena no es íntegra: seq de la primera fila que no coincide' }) primeraFallida?: number;
  @StrProp({ optional: true, description: 'Solo si la cadena no es íntegra' }) motivo?: string;
  @DateTimeProp() verificadoEn!: string;
}

export class MyAccessResponse {
  @DateTimeProp() fecha!: string;
  @StrProp() rol!: string;
  @StrProp() tipoDato!: string;
  @StrProp({ description: '"acceso excepcional" o "atención"' }) motivo!: string;
  @BoolProp() accesoExcepcional!: boolean;
}
