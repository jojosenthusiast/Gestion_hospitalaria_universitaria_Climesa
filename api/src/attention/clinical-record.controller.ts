import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { VitalSignsDto } from './clinical-record.dto';
import { ClinicalRecordService } from './clinical-record.service';

@ApiTags('clinical-record') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('consultas')
export class ClinicalRecordController {
  constructor(private readonly clinical: ClinicalRecordService) {}

  @Get(':id/detalle') @RequirePermission('expediente.ver', 'consulta.iniciar') @ApiOperation({ summary: 'Consultar el detalle clínico permitido' })
  detail(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string) { return this.clinical.detail(r.actor, id); }

  @Post(':id/signos') @RequirePermission('signos.registrar') @ApiOperation({ summary: 'Registrar signos vitales de una consulta' })
  signs(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VitalSignsDto, @Headers('idempotency-key') key?: string) { return this.clinical.addVitalSigns(r.actor, id, dto, key); }
}

