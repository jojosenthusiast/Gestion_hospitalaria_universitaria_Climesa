import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsUUID, Min, NotEquals } from 'class-validator';
import { Text } from '../platform/dto';
export const inventoryTypes = ['insumo', 'reactivo', 'equipo_menor'] as const;
export class ArticleDto {
  @Text(2, 40) code!: string; @Text(2, 160) name!: string; @ApiProperty({ enum: inventoryTypes }) @IsIn(inventoryTypes) type!: string; @Text(1, 30) unit!: string; @ApiProperty({ minimum: 0 }) @IsNumber() @Min(0) minimum!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean; @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) version?: number; @Text(10, 500, true) reason?: string;
}
export class MovementDto {
  @ApiProperty({ enum: ['entrada', 'salida', 'ajuste', 'traslado', 'consumo'] }) @IsIn(['entrada', 'salida', 'ajuste', 'traslado', 'consumo']) type!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() lotId!: string; @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() originWarehouseId?: string; @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() destinationWarehouseId?: string;
  @ApiProperty({ description: 'Mayor que cero; solo el ajuste admite negativos para restar (API-15)' }) @IsNumber() @NotEquals(0) quantity!: number; @Text(5, 500) reason!: string; @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() patientId?: string;
}
