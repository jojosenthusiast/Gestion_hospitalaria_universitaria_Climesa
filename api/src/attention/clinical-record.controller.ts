import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { DiagnosisDto, PrescriptionDto, VitalSignsDto } from './clinical-record.dto';
import { ClinicalRecordService } from './clinical-record.service';
import { ConsultationDetailResponse, DiagnosisCreatedResponse, PrescriptionResponse, VitalSignsCreatedResponse } from './attention.responses';

@ApiTags('clinical-record') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('consultas')
export class ClinicalRecordController {
  constructor(private readonly clinical: ClinicalRecordService) {}

  @Get(':id/detalle') @RequirePermission('expediente.ver', 'consulta.iniciar') @ApiOperation({ summary: 'Consultar el detalle clínico permitido' }) @ApiOkResponse({ type: ConsultationDetailResponse })
  detail(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string) { return this.clinical.detail(r.actor, id); }

  @Post(':id/signos') @RequirePermission('signos.registrar') @ApiOperation({ summary: 'Registrar signos vitales de una consulta' }) @ApiCreatedResponse({ type: VitalSignsCreatedResponse })
  signs(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VitalSignsDto, @Headers('idempotency-key') key?: string) { return this.clinical.addVitalSigns(r.actor, id, dto, key); }

  @Post(':id/diagnosticos') @RequirePermission('consulta.registrar') @ApiOperation({ summary: 'Registrar un diagnóstico CIE-10' }) @ApiCreatedResponse({ type: DiagnosisCreatedResponse })
  diagnosis(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DiagnosisDto, @Headers('idempotency-key') key?: string) { return this.clinical.addDiagnosis(r.actor, id, dto, key); }

  @Post(':id/receta') @RequirePermission('recetas.emitir') @ApiOperation({ summary: 'Emitir una receta con sus indicaciones' }) @ApiCreatedResponse({ type: PrescriptionResponse })
  prescription(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PrescriptionDto, @Headers('idempotency-key') key?: string) { return this.clinical.addPrescription(r.actor, id, dto, key); }
}
