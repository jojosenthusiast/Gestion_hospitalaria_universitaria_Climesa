import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export const AUDIT_SORTS = ['fecha', 'persona', 'rol', 'accion', 'entidad', 'paciente', 'resultado'] as const;

/** FR-110-07: filters by person, patient, action and date. */
export class AuditQueryDto {
  @ApiPropertyOptional({ description: 'Id de la cuenta, o parte de su nombre o correo' }) @IsOptional() @IsString() @MinLength(2) @MaxLength(120) persona?: string;
  @ApiPropertyOptional({ description: 'Id del paciente o número de expediente' }) @IsOptional() @IsString() @MinLength(2) @MaxLength(60) paciente?: string;
  @ApiPropertyOptional({ description: 'Acción exacta o prefijo (por ejemplo consulta.); varias separadas por coma' }) @IsOptional() @IsString() @MinLength(2) @MaxLength(300) accion?: string;
  @ApiPropertyOptional({ description: 'Código de rol que actuó (por ejemplo MED)' }) @IsOptional() @IsString() @Matches(/^[A-Z]{2,4}$/) rol?: string;
  @ApiPropertyOptional({ description: 'Entidad auditada (por ejemplo consulta)' }) @IsOptional() @IsString() @MinLength(2) @MaxLength(60) entidad?: string;
  @ApiPropertyOptional({ description: 'Resultado: exito, denegado o fallido; varios separados por coma' }) @IsOptional() @IsString() @Matches(/^(exito|denegado|fallido)(,(exito|denegado|fallido))*$/) resultado?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601() desde?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601() hasta?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limite?: number;
  @ApiPropertyOptional({ minimum: 1, default: 1, description: 'Página (solo en /auditoria/registros)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) pagina?: number;
  @ApiPropertyOptional({ enum: AUDIT_SORTS, default: 'fecha' }) @IsOptional() @IsIn(AUDIT_SORTS) orden?: (typeof AUDIT_SORTS)[number];
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' }) @IsOptional() @IsIn(['asc', 'desc']) sentido?: 'asc' | 'desc';
  @ApiPropertyOptional({ description: 'true cuando la consulta alimenta una exportación: queda auditada como auditoria.exportar' }) @IsOptional() @IsBooleanString() exportar?: string;
}
