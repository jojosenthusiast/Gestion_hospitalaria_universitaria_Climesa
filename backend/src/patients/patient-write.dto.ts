import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Text } from '../platform/dto';
export class PatientWriteDto {
  @Text(0,80) givenNames!: string;
  @Text(0,100) surnames!: string;
  @Text(0,10,true) dui?: string;
  @Text(0,10,true) birth?: string;
  @ApiProperty({enum:['femenino','masculino','indeterminado','no_registrado']}) @IsIn(['femenino','masculino','indeterminado','no_registrado']) sex!: string;
  @Text(0,9,true) phone?: string;
  @Text(0,254,true) email?: string;
  @Text(0,500,true) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() provisional?: boolean;
  @ApiPropertyOptional({minimum:0,maximum:120}) @IsOptional() @IsInt() @Min(0) @Max(120) estimatedAge?: number;
  @Text(0,500,true) description?: string;
}
export class PatientCreateDto extends PatientWriteDto {
  @ApiProperty({format:'uuid'}) @IsUUID() searchToken!: string;
  @Text(2,100) searchQuery!: string;
}
export class PatientUpdateDto extends PatientWriteDto {
  @ApiProperty({minimum:1}) @IsInt() @Min(1) version!: number;
  @Text(10,500) reason!: string;
}
export class PatientStateDto {
  @ApiProperty() @IsBoolean() active!: boolean;
  @ApiProperty({minimum:1}) @IsInt() @Min(1) version!: number;
  @Text(10,500) reason!: string;
}
