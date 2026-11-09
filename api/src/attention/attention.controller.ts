import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard, PermissionGuard, RequirePermission } from '../auth';
import { ActorRequest } from '../platform/actor';
import { AppointmentCancelDto, AppointmentCreateDto, AppointmentDecisionDto, PatientAppointmentRequestDto } from './attention.dto';
import { AttentionService } from './attention.service';

@ApiTags('attention') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('citas')
export class AttentionController {
  constructor(private readonly attention: AttentionService) {}

  @Get('catalogos') @RequirePermission('citas.agendar') @ApiOperation({ summary: 'Consultar pacientes y médicos disponibles para agendar' })
  catalogs(@Req() r: ActorRequest) { return this.attention.catalogs(r.actor); }

  @Get('disponibilidad') @RequirePermission('citas.agendar') @ApiOperation({ summary: 'Consultar franjas libres de un médico para una fecha' })
  availability(@Req() r: ActorRequest, @Query('doctorId') doctorId?: string, @Query('date') date?: string) {
    return this.attention.availability(r.actor, doctorId ?? '', date ?? '');
  }

  @Get() @RequirePermission('citas.ver') @ApiOperation({ summary: 'Consultar citas del rango permitido por el rol' })
  list(@Req() r: ActorRequest, @Query('from') from?: string, @Query('to') to?: string, @Query('patientId') patientId?: string, @Query('doctorId') doctorId?: string) {
    return this.attention.list(r.actor, from, to, patientId, doctorId);
  }

  @Post() @RequirePermission('citas.agendar') @ApiOperation({ summary: 'Agendar y confirmar una cita desde recepción' })
  schedule(@Req() r: ActorRequest, @Body() d: AppointmentCreateDto, @Headers('idempotency-key') key?: string) { return this.attention.create(r.actor, d, false, key); }

  @Post('solicitudes') @RequirePermission('citas.solicitar') @ApiOperation({ summary: 'Solicitar una cita como paciente' })
  request(@Req() r: ActorRequest, @Body() d: PatientAppointmentRequestDto, @Headers('idempotency-key') key?: string) { return this.attention.create(r.actor, d, true, key); }

  @Post('solicitudes/:id/confirmar') @RequirePermission('citas.agendar') @ApiOperation({ summary: 'Confirmar una solicitud de cita' })
  confirm(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: AppointmentDecisionDto, @Headers('idempotency-key') key?: string) { return this.attention.changeStatus(r.actor, id, { ...d, status: 'confirmada' }, key); }

  @Post('solicitudes/:id/rechazar') @RequirePermission('citas.agendar') @ApiOperation({ summary: 'Rechazar una solicitud de cita' })
  reject(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: AppointmentDecisionDto, @Headers('idempotency-key') key?: string) { return this.attention.changeStatus(r.actor, id, { ...d, status: 'rechazada' }, key); }

  @Post(':id/cancelar') @RequirePermission('citas.cancelar') @ApiOperation({ summary: 'Cancelar una cita propia o gestionada por recepción' })
  cancel(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: AppointmentCancelDto, @Headers('idempotency-key') key?: string) { return this.attention.cancel(r.actor, id, d, key); }
}
