import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiExtension, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { NoticeDto } from './public.dto';
import { PublicRateLimitGuard } from './rate-limit.guard';
import { PublicService } from './public.service';
import { DoctorsOnDutyResponse, MyNoticesResponse, NoticeListItemResponse, NoticePublishedResponse, NoticesResponse, PublicOccupancyResponse, PublicQueueResponse } from './public.responses';

/** Spec 112 sin sesión: sin guardas de identidad, con límite por IP. Solo agregados y campos públicos. */
@ApiTags('publico') @ApiExtension('x-permiso', 'publico') @UseGuards(PublicRateLimitGuard) @Controller('publico')
export class PublicController {
  constructor(private readonly service: PublicService) {}
  @Get('ocupacion') @ApiExtension('x-permiso', 'publico') @ApiOperation({ summary: 'Ocupación por planta y tipo, solo agregados' }) @ApiOkResponse({ type: PublicOccupancyResponse })
  occupancy() { return this.service.occupancy(); }
  @Get('medicos-de-turno') @ApiExtension('x-permiso', 'publico') @ApiOperation({ summary: 'Médicos de turno: nombre, especialidad y área' }) @ApiOkResponse({ type: DoctorsOnDutyResponse })
  doctors() { return this.service.doctorsOnDuty(); }
  @Get('avisos') @ApiExtension('x-permiso', 'publico') @ApiOperation({ summary: 'Avisos vigentes' }) @ApiOkResponse({ type: NoticesResponse })
  notices() { return this.service.notices(); }
  @Get('fila/:servicio') @ApiExtension('x-permiso', 'publico') @ApiOperation({ summary: 'Números llamados hoy con su consultorio, sin nombres' }) @ApiOkResponse({ type: PublicQueueResponse })
  queue(@Param('servicio') service: string) { return this.service.calledNumbers(service); }
}

@ApiTags('publico') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('avisos')
export class NoticesController {
  constructor(private readonly service: PublicService) {}
  @Get() @RequirePermission('avisos.publicar') @ApiOperation({ summary: 'Avisos recientes con su audiencia, prioridad y estado, para quien los redacta' }) @ApiOkResponse({ type: [NoticeListItemResponse] })
  list() { return this.service.listNotices(); }
  @Post() @RequirePermission('avisos.publicar') @ApiOperation({ summary: 'Publicar un aviso general con vigencia; advierte si parece llevar datos personales' }) @ApiCreatedResponse({ type: NoticePublishedResponse })
  publish(@Req() r: ActorRequest, @Body() d: NoticeDto, @Headers('idempotency-key') k?: string) { return this.service.publish(r.actor, d, k); }
}

/** Avisos de mi tablero de inicio: los públicos y los dirigidos a mis roles. Cualquier cuenta con sesión. */
@ApiTags('publico') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('me/avisos')
export class MyNoticesController {
  constructor(private readonly service: PublicService) {}
  @Get() @RequirePermission('sesion.perfil') @ApiOperation({ summary: 'Avisos vigentes para mis roles, incluidos los públicos' }) @ApiOkResponse({ type: MyNoticesResponse })
  mine(@Req() r: ActorRequest) { return this.service.myNotices(r.actor); }
}
