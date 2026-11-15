import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsEmail, IsIn, IsInt, IsOptional, IsUUID, MaxLength, Min } from 'class-validator';
import { Text } from '../platform/dto';
export const roles=['ADM','JOP','REC','AST','ENF','MED','LAB','PAR','DPD','PAC'];
export class InvitePatientDto {
  @ApiProperty({format:'email'}) @IsEmail() @MaxLength(254) email!:string;
  @Text(2,120) displayName!:string;
  /** MA-CTA-02: an invitation always names staff roles; patients sign up in the mobile apps (`acceso.rol.invitable`). */
  @ApiProperty({enum:roles,isArray:true,description:'Roles de personal; PAC no se invita (rol_no_invitable)'}) @IsArray() @ArrayNotEmpty() @ArrayUnique() @IsIn(roles,{each:true}) roles!:string[];
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
export class InvitationCancelDto {
  @Text(10,500) reason!:string;
}
