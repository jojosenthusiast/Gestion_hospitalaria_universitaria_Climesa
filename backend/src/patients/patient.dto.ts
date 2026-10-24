import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PatientSearchQueryDto {
  @ApiPropertyOptional({minLength:2,maxLength:100})
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  query?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @ApiPropertyOptional({minimum:1,maximum:50,default:50})
  limit = 50;
}

export class PatientSearchDto {
  @ApiProperty({minLength:2,maxLength:100})
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  query!: string;
}
