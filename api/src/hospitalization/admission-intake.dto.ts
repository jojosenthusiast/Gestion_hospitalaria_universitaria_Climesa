import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsUUID, Max, Min } from 'class-validator';

const bool = ({ value }: { value: unknown }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value);
const int = ({ value }: { value: unknown }) => (value === undefined || value === '' ? undefined : Number(value));
const origins = ['cita', 'consulta', 'emergencia', 'ambulancia'] as const;
const categories = ['vip', 'semiprivada'] as const;

export class OriginsQuery {
  @ApiProperty({ format: 'uuid' }) @IsUUID() patientId!: string;
  @ApiPropertyOptional({ enum: origins }) @IsOptional() @IsIn(origins) origin?: string;
}
export class ShiftQuery { @ApiPropertyOptional({ format: 'date-time', description: 'Instante de ingreso; por omisión, ahora.' }) @IsOptional() @IsISO8601({ strict: true }) at?: string; }
export class MapQuery {
  @ApiProperty({ format: 'uuid' }) @IsUUID() patientId!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(bool) @IsBoolean() isolation?: boolean;
  @ApiPropertyOptional({ enum: categories }) @IsOptional() @IsIn(categories) category?: string;
}
export class FeasibilityQuery {
  @ApiProperty({ format: 'uuid' }) @IsUUID() patientId!: string;
  @ApiProperty({ enum: origins }) @IsIn(origins) origin!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() originId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() doctorId!: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601({ strict: true }) at?: string;
  @ApiProperty({ enum: categories }) @IsIn(categories) category!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(bool) @IsBoolean() isolation?: boolean;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() bedId?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(bool) @IsBoolean() visitorsAllowed?: boolean;
  @ApiPropertyOptional({ minimum: 0, maximum: 4 }) @IsOptional() @Transform(int) @IsInt() @Min(0) @Max(4) visitorsMax?: number;
}
