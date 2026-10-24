import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, MinLength, IsInt, Min } from 'class-validator';
export const Text = (min=0,max=200,optional=false) => applyDecorators(optional ? ApiPropertyOptional({type:String,minLength:min,maxLength:max}) : ApiProperty({type:String,minLength:min,maxLength:max}), ...(optional?[IsOptional()]:[]), IsString(),MinLength(min),MaxLength(max));
export class VersionDto {
  @ApiProperty({minimum:1}) @IsInt() @Min(1) version!: number;
  @Text(10,500) reason!: string;
}
