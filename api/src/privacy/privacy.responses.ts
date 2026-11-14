import { BigIntProp, BoolProp, ClassArrayProp, DateTimeProp, EnumProp, IntProp, JsonProp, StrArrayProp, StrProp, UuidProp } from '../platform/responses';

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

export class AuditPageResponse {
  @ClassArrayProp(AuditEntryResponse) filas!: AuditEntryResponse[];
  @IntProp({ description: 'Filas que cumplen el filtro, sin paginar' }) total!: number;
  @IntProp() pagina!: number;
  @IntProp() limite!: number;
}

export class AuditDetailResponse extends AuditEntryResponse {
  @StrProp({ nullable: true, description: 'Identificador de correlación de la petición' }) correlation!: string | null;
  @JsonProp({ description: 'Metadatos del evento (sin el evento canónico firmado); nunca valores clínicos' }) detail!: Record<string, unknown>;
  @StrProp({ description: 'Hash SHA-256 de esta fila, en hexadecimal' }) hash!: string;
  @StrProp({ description: 'Hash de la fila anterior, en hexadecimal' }) previousHash!: string;
  @BigIntProp({ nullable: true }) previousSeq!: string | null;
  @BigIntProp({ nullable: true }) nextSeq!: string | null;
}

export class AuditOptionsResponse {
  @StrArrayProp() acciones!: string[];
  @StrArrayProp() entidades!: string[];
  @StrArrayProp({ description: 'Códigos de rol que aparecen en la auditoría' }) roles!: string[];
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
