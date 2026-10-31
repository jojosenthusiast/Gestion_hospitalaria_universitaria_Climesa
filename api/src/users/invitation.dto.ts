import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsEmail, IsIn, IsInt, IsOptional, IsUUID, MaxLength, Min } from 'class-validator';
import { Text } from '../platform/dto';
/** Rol de la cuenta cuando la invitación no trae roles: la invitación de paciente (código del catálogo roles.csv, no una decisión de autorización). */
export const DEFAULT_INVITED_ROLE='PAC';
export const roles=['ADM','JOP','REC','AST','ENF','MED','LAB','PAR','DPD','PAC'];
export class InvitePatientDto {
  @ApiProperty({format:'email'}) @IsEmail() @MaxLength(254) email!:string;
  @Text(2,120) displayName!:string;
  @ApiPropertyOptional({enum:roles,isArray:true}) @IsOptional() @IsArray() @ArrayNotEmpty() @ArrayUnique() @IsIn(roles,{each:true}) roles?:string[];
  @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() staffId?:string;
}
export class UserRolesDto {
  @ApiProperty({enum:roles,isArray:true}) @IsArray() @ArrayNotEmpty() @ArrayUnique() @IsIn(roles,{each:true}) roles!:string[];
  @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() staffId?:string;
  @ApiProperty({minimum:1}) @IsInt() @Min(1) version!:number;
  @Text(10,500) reason!:string;
}
export class UserStateDto {
  @ApiProperty({enum:['activo','desactivado']}) @IsIn(['activo','desactivado']) state!:string;
  @ApiProperty({minimum:1}) @IsInt() @Min(1) version!:number;
  @Text(10,500) reason!:string;
}
