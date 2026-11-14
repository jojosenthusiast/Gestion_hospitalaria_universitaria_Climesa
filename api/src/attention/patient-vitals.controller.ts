import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { PatientVitalsDto, PatientVitalsQueryDto } from './patient-vitals.dto';
import { PatientVitalsService } from './patient-vitals.service';
import { PatientVitalsHistoryResponse, VitalSignsCreatedResponse } from './attention.responses';

@ApiTags('patient-vitals') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('pacientes')
export class PatientVitalsController {
  constructor(private readonly vitals: PatientVitalsService) {}

  @Get(':id/signos') @RequirePermission('signos.registrar') @ApiOperation({ summary: 'Historial de signos vitales del paciente, el más reciente primero' }) @ApiOkResponse({ type: PatientVitalsHistoryResponse })
  history(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Query() q: PatientVitalsQueryDto) { return this.vitals.history(r.actor, id, q.limit); }

  @Post(':id/signos') @RequirePermission('signos.registrar') @ApiOperation({ summary: 'Registrar signos vitales de un paciente fuera de una consulta' }) @ApiCreatedResponse({ type: VitalSignsCreatedResponse })
  register(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PatientVitalsDto, @Headers('idempotency-key') key?: string) { return this.vitals.register(r.actor, id, dto, key); }
}
