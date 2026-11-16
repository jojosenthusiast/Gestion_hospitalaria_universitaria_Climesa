import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { CategoryRequestAssignDto, CategoryRequestCancelDto, CategoryRequestCreateDto, CategoryRequestRejectDto } from './appointment-request.dto';
import { AppointmentCategoryResponse, CategoryRequestCommandResponse, CategoryRequestResponse } from './appointment-request.responses';
import { AppointmentRequestService } from './appointment-request.service';

/** Fase 2, flow A (S8): appointment requests by category, without a doctor; reception assigns doctor and time. */
@ApiTags('attention') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('citas')
export class AppointmentRequestController {
  constructor(private readonly requests: AppointmentRequestService) {}

  @Get('categorias') @RequirePermission('citas.solicitar', 'citas.agendar') @ApiOperation({ summary: 'Catálogo de motivos de cita (categorías con ícono, palabras de búsqueda y especialidades sugeridas)' }) @ApiOkResponse({ type: [AppointmentCategoryResponse] })
  categories() { return this.requests.categories(); }

  @Get('solicitudes-categoria') @RequirePermission('citas.ver') @ApiOperation({ summary: 'Bandeja de solicitudes por categoría: recepción ve las pendientes (más antiguas primero) y las resueltas en 30 días; el paciente solo las suyas' }) @ApiOkResponse({ type: [CategoryRequestResponse] })
  list(@Req() r: ActorRequest) { return this.requests.list(r.actor); }

  @Post('solicitudes-categoria') @RequirePermission('citas.solicitar') @ApiOperation({ summary: 'Pedir una cita por motivo (una a tres categorías), franja preferida y nota, sin elegir médico' }) @ApiCreatedResponse({ type: CategoryRequestCommandResponse })
  create(@Req() r: ActorRequest, @Body() d: CategoryRequestCreateDto, @Headers('idempotency-key') key?: string) { return this.requests.create(r.actor, d, key); }

  @Post('solicitudes-categoria/:id/asignar') @RequirePermission('citas.agendar') @ApiOperation({ summary: 'Asignar médico y franja de 20 minutos: crea una cita confirmada con las reglas de siempre' }) @ApiCreatedResponse({ type: CategoryRequestCommandResponse })
  assign(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: CategoryRequestAssignDto, @Headers('idempotency-key') key?: string) { return this.requests.assign(r.actor, id, d, key); }

  @Post('solicitudes-categoria/:id/rechazar') @RequirePermission('citas.agendar') @ApiOperation({ summary: 'Rechazar una solicitud por categoría con motivo (el paciente lo ve)' }) @ApiCreatedResponse({ type: CategoryRequestCommandResponse })
  reject(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: CategoryRequestRejectDto, @Headers('idempotency-key') key?: string) { return this.requests.reject(r.actor, id, d, key); }

  @Post('solicitudes-categoria/:id/cancelar') @RequirePermission('citas.cancelar') @ApiOperation({ summary: 'Retirar la solicitud propia mientras está pendiente' }) @ApiCreatedResponse({ type: CategoryRequestCommandResponse })
  cancel(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: CategoryRequestCancelDto, @Headers('idempotency-key') key?: string) { return this.requests.cancel(r.actor, id, d, key); }
}
