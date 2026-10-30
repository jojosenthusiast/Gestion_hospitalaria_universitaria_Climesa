import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsUUID, Matches, Min } from 'class-validator';
import { Text } from '../platform/dto';
export const staffTypes=['medico','enfermero','asistente','recepcionista','laboratorista','paramedico','motorista','limpieza','administrativo','otro'];
export class StaffDto {
  @Text(2,80) givenNames!:string;
  @Text(2,100) surnames!:string;
  @ApiProperty({enum:staffTypes}) @IsIn(staffTypes) type!:string;
  @Text(0,120,true) specialty?:string;
  @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() areaId?:string;
  @Text(0,9,true) phone?:string;
  @Text(0,10,true) dui?:string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?:boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) version?:number;
  @Text(10,500,true) reason?:string;
}
export const boards=['JVPM','JVPE','JVPL','JVPO','otra'];
export class RegistrationDto {
  @ApiProperty({enum:boards}) @IsIn(boards) board!:string;
  @Text(2,40) number!:string;
  @ApiProperty({format:'date',example:'2026-01-01'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) validFrom!:string;
  @ApiProperty({format:'date',example:'2026-12-31'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) validTo!:string;
  @ApiProperty({minimum:1}) @IsInt() @Min(1) version!:number;
  @Text(10,500) reason!:string;
}
export class ShiftDto {
  @ApiProperty({format:'uuid'}) @IsUUID() staffId!:string;
  @ApiProperty({format:'uuid'}) @IsUUID() areaId!:string;
  @ApiProperty({format:'date-time'}) @IsISO8601({strict:true}) start!:string;
  @ApiProperty({format:'date-time'}) @IsISO8601({strict:true}) end!:string;
  @ApiProperty({enum:['diurno','nocturno','guardia']}) @IsIn(['diurno','nocturno','guardia']) type!:string;
  @Text(0,500,true) justification?:string;
  @ApiPropertyOptional({enum:['borrador','cancelado']}) @IsOptional() @IsIn(['borrador','cancelado']) state?:string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) version?:number;
  @Text(10,500,true) reason?:string;
}
export const spaceTypes=['hospital','planta','area','habitacion','cama','consultorio','cubiculo','bodega','bahia'];
export class SpaceDto {
  @Text(2,40) code!:string;
  @Text(2,120) name!:string;
  @ApiProperty({enum:spaceTypes}) @IsIn(spaceTypes) type!:string;
  @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() parentId?:string;
  @ApiPropertyOptional({enum:['vip','semiprivada']}) @IsOptional() @IsIn(['vip','semiprivada']) category?:string;
  @ApiPropertyOptional({minimum:1}) @IsOptional() @IsInt() @Min(1) capacity?:number;
  @ApiPropertyOptional() @IsOptional() @IsInt() level?:number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?:boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) version?:number;
  @Text(10,500,true) reason?:string;
}
export class BedBlockDto {
  @ApiProperty({minimum:1}) @IsInt() @Min(1) version!:number;
  @Text(5,500) motivo!:string;
}
export class BedTransitionDto {
  @ApiProperty({minimum:1}) @IsInt() @Min(1) version!:number;
  @Text(10,500) reason!:string;
}
