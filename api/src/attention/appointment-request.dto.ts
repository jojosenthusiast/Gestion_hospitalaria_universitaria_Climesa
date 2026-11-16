import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Min } from 'class-validator';
import { Text } from '../platform/dto';

/** Preferred time of day for a category request (local time): morning 07-12, afternoon 12-17, or any. */
export const FRANJAS_SOLICITUD = ['manana', 'tarde', 'cualquiera'] as const;

/** Fase 2, flow A (S8): the patient asks for an appointment by reason, without choosing a doctor or a slot. */
export class CategoryRequestCreateDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 3, description: 'Códigos de `GET /citas/categorias` (una a tres)' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @ArrayUnique() @IsString({ each: true }) @Matches(/^[a-z][a-z0-9_]*$/, { each: true }) categories!: string[];
  @ApiProperty({ enum: FRANJAS_SOLICITUD, enumName: 'FranjaSolicitudCita' }) @IsIn(FRANJAS_SOLICITUD) franja!: string;
  @Text(0, 280, true) note?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Médico preferido (opcional, para quien ya conoce a su médico)' }) @IsOptional() @IsUUID() preferredDoctorId?: string;
}

/** Reception assigns a doctor and a 20-minute slot; the usual appointment rules apply. */
export class CategoryRequestAssignDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ format: 'uuid' }) @IsUUID() doctorId!: string;
  @ApiProperty({ format: 'date-time' }) @IsISO8601({ strict: true }) start!: string;
  @ApiProperty({ format: 'date-time' }) @IsISO8601({ strict: true }) end!: string;
}

export class CategoryRequestRejectDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @Text(10, 500) rejectionReason!: string;
}

export class CategoryRequestCancelDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
}
