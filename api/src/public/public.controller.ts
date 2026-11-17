import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiExtension, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { NoticeDto, NoticeEditDto, NoticeWithdrawDto } from './public.dto';
import { PublicRateLimitGuard } from './rate-limit.guard';
import { PublicService } from './public.service';
import { NoticeReachResponse } from './public.responses';
import { DoctorsOnDutyResponse, HospitalLocationResponse, MyInboxResponse, MyNoticesResponse, NoticeAckResponse, NoticeStatsResponse, NoticeListItemResponse, NoticePublishedResponse, NoticesResponse, PublicOccupancyResponse, PublicQueueResponse } from './public.responses';

/** Spec 112 sin sesión: sin guardas de identidad, con límite por IP. Solo agregados y campos públicos. */
@ApiTags('publico') @ApiExtension('x-permiso', 'publico') @UseGuards(PublicRateLimitGuard) @Controller('publico')
export class PublicController {
  constructor(private readonly service: PublicService) {}
  @Get('ocupacion') @ApiExtension('x-permiso', 'publico') @ApiOperation({ summary: 'Ocupación por planta y tipo, solo agregados' }) @ApiOkResponse({ type: PublicOccupancyResponse })
  occupancy() { return this.service.occupancy(); }
  @Get('hospital') @ApiExtension('x-permiso', 'publico') @ApiOperation({ summary: 'Dirección, teléfono y coordenadas del hospital' }) @ApiOkResponse({ type: HospitalLocationResponse })
  hospital() { return this.service.hospital(); }
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
  @Get('estadisticas') @RequirePermission('avisos.publicar') @ApiOperation({ summary: 'Por aviso: cuántas cuentas dieron "Enterado" y a cuántas va dirigido (solo conteos, sin nombres)' }) @ApiOkResponse({ type: [NoticeStatsResponse] })
  stats() { return this.service.noticeStats(); }
  @Get('alcance') @RequirePermission('avisos.publicar') @ApiOperation({ summary: 'Al redactar: a cuántas cuentas del personal llegaría el aviso por roles y áreas (solo el conteo)' })
  @ApiQuery({ name: 'roles', required: false, description: 'Códigos de rol separados por coma, por ejemplo ENF,MED' }) @ApiQuery({ name: 'areas', required: false, description: 'Códigos de espacio separados por coma, por ejemplo P1-HOS' })
  @ApiOkResponse({ type: NoticeReachResponse })
  reach(@Query('roles') roles?: string, @Query('areas') areas?: string) { return this.service.noticeReach(roles, areas); }
  @Post() @RequirePermission('avisos.publicar') @ApiOperation({ summary: 'Publicar un aviso general con vigencia; advierte si parece llevar datos personales' }) @ApiCreatedResponse({ type: NoticePublishedResponse })
  publish(@Req() r: ActorRequest, @Body() d: NoticeDto, @Headers('idempotency-key') k?: string) { return this.service.publish(r.actor, d, k); }
  @Put(':id') @RequirePermission('avisos.publicar') @ApiOperation({ summary: 'Editar un aviso vigente o programado: texto, prioridad, audiencia y vigencia (adelantar el fin lo vence antes); auditado' }) @ApiOkResponse({ type: NoticeListItemResponse })
  edit(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: NoticeEditDto, @Headers('idempotency-key') k?: string) { return this.service.edit(r.actor, id, d, k); }
  @Post(':id/retirar') @RequirePermission('avisos.publicar') @ApiOperation({ summary: 'Retirar un aviso antes de tiempo con motivo (D-13); deja de verse en todas partes' }) @ApiCreatedResponse({ type: NoticeListItemResponse })
  withdraw(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: NoticeWithdrawDto, @Headers('idempotency-key') k?: string) { return this.service.withdraw(r.actor, id, d, k); }
}

/** Avisos de mi tablero de inicio: los públicos y los dirigidos a mis roles. Cualquier cuenta con sesión. */
@ApiTags('publico') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('me/avisos')
export class MyNoticesController {
  constructor(private readonly service: PublicService) {}
  @Get() @RequirePermission('sesion.perfil') @ApiOperation({ summary: 'Avisos vigentes para mis roles, incluidos los públicos' }) @ApiOkResponse({ type: MyNoticesResponse })
  mine(@Req() r: ActorRequest) { return this.service.myNotices(r.actor); }
  @Get('bandeja') @RequirePermission('sesion.perfil') @ApiOperation({ summary: 'Bandeja de avisos: nivel, "Enterado", recordatorio, cuáles se destacan en el inicio y conteos de sin leer y críticos' }) @ApiOkResponse({ type: MyInboxResponse })
  inbox(@Req() r: ActorRequest) { return this.service.myInbox(r.actor); }
  @Post(':id/enterado') @RequirePermission('sesion.perfil') @ApiOperation({ summary: 'Dar "Enterado" a un aviso dirigido a mi cuenta; idempotente y auditado' }) @ApiCreatedResponse({ type: NoticeAckResponse })
  acknowledge(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Headers('idempotency-key') k?: string) { return this.service.acknowledge(r.actor, id, k); }
  @Post(':id/posponer') @RequirePermission('sesion.perfil') @ApiOperation({ summary: 'Recordarme después: el aviso crítico deja de destacarse por avisos.recordatorio_horas (4 h) y luego vuelve' }) @ApiCreatedResponse({ type: NoticeAckResponse })
  snooze(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Headers('idempotency-key') k?: string) { return this.service.snooze(r.actor, id, k); }
}
