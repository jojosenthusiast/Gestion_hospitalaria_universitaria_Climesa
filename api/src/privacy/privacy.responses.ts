import { BigIntProp, BoolProp, DateTimeProp, EnumProp, IntProp, StrProp, UuidProp } from '../platform/responses';

export const RESULTADO_AUDITORIA = ['exito', 'denegado', 'fallido'] as const;

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
  @StrProp({ description: '"atención"; las filas del módulo retirado de acceso excepcional conservan "acceso excepcional"' }) motivo!: string;
}
