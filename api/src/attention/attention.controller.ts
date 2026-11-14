import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard, PermissionGuard, RequirePermission } from '../auth';
import { ActorRequest } from '../platform/actor';
import { AppointmentCancelDto, AppointmentCreateDto, AppointmentDecisionDto, PatientAppointmentRequestDto } from './attention.dto';
import { AttentionService } from './attention.service';
import { AppointmentCatalogsResponse, AppointmentCommandResponse, AppointmentResponse, AvailabilityResponse } from './attention.responses';

@ApiTags('attention') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('citas')
export class AttentionController {
  constructor(private readonly attention: AttentionService) {}

  @Get('catalogos') @RequirePermission('citas.agendar', 'citas.solicitar') @ApiOperation({ summary: 'Médicos activos (con date indica quién tiene turno ese día); a recepción ya no devuelve pacientes: se buscan con /pacientes/selector' }) @ApiQuery({ name: 'date', type: String, required: false, description: 'Día local, yyyy-MM-dd' }) @ApiOkResponse({ type: AppointmentCatalogsResponse })
  catalogs(@Req() r: ActorRequest, @Query('date') date?: string) { return this.attention.catalogs(r.actor, date); }

  @Get('disponibilidad') @RequirePermission('citas.agendar', 'citas.solicitar') @ApiOperation({ summary: 'Consultar las franjas del día de un médico con su estado (libre, ocupado, sin_turno, pasado)' })
  @ApiQuery({ name: 'doctorId', type: String, format: 'uuid', required: true }) @ApiQuery({ name: 'date', type: String, required: true, description: 'Día local, yyyy-MM-dd' }) @ApiOkResponse({ type: AvailabilityResponse })
  availability(@Req() r: ActorRequest, @Query('doctorId') doctorId?: string, @Query('date') date?: string) {
    return this.attention.availability(r.actor, doctorId ?? '', date ?? '');
  }

  @Get() @RequirePermission('citas.ver') @ApiOperation({ summary: 'Consultar citas del rango permitido por el rol' })
  @ApiQuery({ name: 'from', type: String, format: 'date-time', required: false }) @ApiQuery({ name: 'to', type: String, format: 'date-time', required: false }) @ApiQuery({ name: 'patientId', type: String, format: 'uuid', required: false }) @ApiQuery({ name: 'doctorId', type: String, format: 'uuid', required: false }) @ApiOkResponse({ type: [AppointmentResponse] })
  list(@Req() r: ActorRequest, @Query('from') from?: string, @Query('to') to?: string, @Query('patientId') patientId?: string, @Query('doctorId') doctorId?: string) {
    return this.attention.list(r.actor, from, to, patientId, doctorId);
  }

  @Post() @RequirePermission('citas.agendar') @ApiOperation({ summary: 'Agendar y confirmar una cita desde recepción' }) @ApiCreatedResponse({ type: AppointmentCommandResponse })
  schedule(@Req() r: ActorRequest, @Body() d: AppointmentCreateDto, @Headers('idempotency-key') key?: string) { return this.attention.create(r.actor, d, false, key); }

  @Post('solicitudes') @RequirePermission('citas.solicitar') @ApiOperation({ summary: 'Solicitar una cita como paciente' }) @ApiCreatedResponse({ type: AppointmentCommandResponse })
  request(@Req() r: ActorRequest, @Body() d: PatientAppointmentRequestDto, @Headers('idempotency-key') key?: string) { return this.attention.create(r.actor, d, true, key); }

  @Post('solicitudes/:id/confirmar') @RequirePermission('citas.agendar') @ApiOperation({ summary: 'Confirmar una solicitud de cita' }) @ApiCreatedResponse({ type: AppointmentCommandResponse })
  confirm(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: AppointmentDecisionDto, @Headers('idempotency-key') key?: string) { return this.attention.changeStatus(r.actor, id, { ...d, status: 'confirmada' }, key); }

  @Post('solicitudes/:id/rechazar') @RequirePermission('citas.agendar') @ApiOperation({ summary: 'Rechazar una solicitud de cita' }) @ApiCreatedResponse({ type: AppointmentCommandResponse })
  reject(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: AppointmentDecisionDto, @Headers('idempotency-key') key?: string) { return this.attention.changeStatus(r.actor, id, { ...d, status: 'rechazada' }, key); }

  @Post(':id/cancelar') @RequirePermission('citas.cancelar') @ApiOperation({ summary: 'Cancelar una cita propia o gestionada por recepción' }) @ApiCreatedResponse({ type: AppointmentCommandResponse })
  cancel(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: AppointmentCancelDto, @Headers('idempotency-key') key?: string) { return this.attention.cancel(r.actor, id, d, key); }
}
