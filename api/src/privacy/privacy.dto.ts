import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { Text } from '../platform/dto';

/** FR-110-04 / FR-110-09: request with reason and duration; `urgencia` opens immediate access pending review. */
export class ExceptionalAccessRequestDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() pacienteId!: string;
  @Text(10, 500) motivo!: string;
  @ApiProperty({ minimum: 1, maximum: 24 }) @IsInt() @Min(1) @Max(24) horas!: number;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() urgencia?: boolean;
}

/** The delegate may approve for fewer hours than requested (scenario 2: "aprueba por 2 h"). */
export class ExceptionalAccessApproveDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 24 }) @IsOptional() @IsInt() @Min(1) @Max(24) horas?: number;
}

/** W30 "Negar con motivo": the reason is kept in the audit trail. */
export class ExceptionalAccessDenyDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @Text(10, 500) motivo!: string;
}

export const exceptionalAccessStates = ['pendiente', 'aprobado', 'negado'] as const;
export class ExceptionalAccessQueryDto {
  @ApiPropertyOptional({ enum: exceptionalAccessStates }) @IsOptional() @IsIn(exceptionalAccessStates) estado?: string;
}

/** FR-110-07: filters by person, patient, action and date. */
export class AuditQueryDto {
  @ApiPropertyOptional({ description: 'Id de la cuenta, o parte de su nombre o correo' }) @IsOptional() @IsString() @MinLength(2) @MaxLength(120) persona?: string;
  @ApiPropertyOptional({ description: 'Id del paciente o número de expediente' }) @IsOptional() @IsString() @MinLength(2) @MaxLength(60) paciente?: string;
  @ApiPropertyOptional({ description: 'Acción exacta o prefijo (por ejemplo consulta.)' }) @IsOptional() @IsString() @MinLength(2) @MaxLength(80) accion?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601() desde?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601() hasta?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limite?: number;
}
