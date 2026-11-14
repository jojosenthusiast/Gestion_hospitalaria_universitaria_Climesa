import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

/** FR-110-07: filters by person, patient, action and date. */
export class AuditQueryDto {
  @ApiPropertyOptional({ description: 'Id de la cuenta, o parte de su nombre o correo' }) @IsOptional() @IsString() @MinLength(2) @MaxLength(120) persona?: string;
  @ApiPropertyOptional({ description: 'Id del paciente o número de expediente' }) @IsOptional() @IsString() @MinLength(2) @MaxLength(60) paciente?: string;
  @ApiPropertyOptional({ description: 'Acción exacta o prefijo (por ejemplo consulta.)' }) @IsOptional() @IsString() @MinLength(2) @MaxLength(80) accion?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601() desde?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601() hasta?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limite?: number;
}
