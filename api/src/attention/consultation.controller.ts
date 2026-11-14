import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { ConsultationSignDto, ConsultationStartDto, ConsultationUpdateDto } from './consultation.dto';
import { ConsultationService } from './consultation.service';
import { AgendaEntryResponse, ConsultationCommandResponse, ConsultationSignResponse, ConsultationStartResponse } from './attention.responses';

@ApiTags('consultations') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('consultas')
export class ConsultationController {
  constructor(private readonly consultations: ConsultationService) {}

  @Get('agenda') @RequirePermission('consulta.iniciar') @ApiOperation({ summary: 'Agenda propia del médico con estado de consulta' }) @ApiOkResponse({ type: [AgendaEntryResponse] })
  agenda(@Req() r: ActorRequest) { return this.consultations.agenda(r.actor); }

  @Post() @RequirePermission('consulta.iniciar') @ApiOperation({ summary: 'Iniciar una consulta desde una cita confirmada' }) @ApiCreatedResponse({ type: ConsultationStartResponse })
  start(@Req() r: ActorRequest, @Body() dto: ConsultationStartDto, @Headers('idempotency-key') key?: string) { return this.consultations.start(r.actor, dto, key); }

  @Patch(':id') @RequirePermission('consulta.registrar') @ApiOperation({ summary: 'Guardar el borrador clínico de una consulta' }) @ApiOkResponse({ type: ConsultationCommandResponse })
  update(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConsultationUpdateDto, @Headers('idempotency-key') key?: string) { return this.consultations.update(r.actor, id, dto, key); }

  @Post(':id/firmar') @RequirePermission('consulta.registrar') @ApiOperation({ summary: 'Firmar la consulta y marcar la cita como atendida' }) @ApiCreatedResponse({ type: ConsultationSignResponse })
  sign(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConsultationSignDto, @Headers('idempotency-key') key?: string) { return this.consultations.sign(r.actor, id, dto, key); }
}
