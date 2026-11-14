import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Min, NotEquals } from 'class-validator';
import { Text } from '../platform/dto';
import { MOVEMENT_TYPES } from './inventory.rules';
export const inventoryTypes = ['insumo', 'reactivo', 'equipo_menor'] as const;
export class ArticleDto {
  @Text(2, 40) code!: string; @Text(2, 160) name!: string; @ApiProperty({ enum: inventoryTypes }) @IsIn(inventoryTypes) type!: string; @Text(1, 30) unit!: string; @ApiProperty({ minimum: 0 }) @IsNumber() @Min(0) minimum!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean; @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) version?: number; @Text(10, 500, true) reason?: string;
}
export class LotDto {
  @Text(1, 40) number!: string;
  @ApiPropertyOptional({ format: 'date', description: 'Vencimiento yyyy-MM-dd; sin fecha para lotes que no vencen' }) @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) expiresAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean; @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) version?: number; @Text(10, 500, true) reason?: string;
}
export class MovementDto {
  @ApiProperty({ enum: MOVEMENT_TYPES }) @IsIn(MOVEMENT_TYPES as unknown as string[]) type!: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Lote existente; una entrada puede traer en su lugar articleId + lotNumber para registrar el lote nuevo' }) @IsOptional() @IsUUID() lotId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() articleId?: string;
  @Text(1, 40, true) lotNumber?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) expiresAt?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() originWarehouseId?: string; @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() destinationWarehouseId?: string;
  @ApiProperty({ description: 'Mayor que cero; solo el ajuste admite negativos para restar (API-15)' }) @IsNumber() @NotEquals(0) quantity!: number; @Text(5, 500) reason!: string; @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() patientId?: string;
}
