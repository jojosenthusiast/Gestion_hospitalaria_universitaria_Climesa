import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtension, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { NoticeDto } from './public.dto';
import { PublicRateLimitGuard } from './rate-limit.guard';
import { PublicService } from './public.service';

/** Spec 112 sin sesión: sin guardas de identidad, con límite por IP. Solo agregados y campos públicos. */
@ApiTags('publico') @ApiExtension('x-permiso', 'publico') @UseGuards(PublicRateLimitGuard) @Controller('publico')
export class PublicController {
  constructor(private readonly service: PublicService) {}
  @Get('ocupacion') @ApiExtension('x-permiso', 'publico') @ApiOperation({ summary: 'Ocupación por planta y tipo, solo agregados' })
  occupancy() { return this.service.occupancy(); }
  @Get('medicos-de-turno') @ApiExtension('x-permiso', 'publico') @ApiOperation({ summary: 'Médicos de turno: nombre, especialidad y área' })
  doctors() { return this.service.doctorsOnDuty(); }
  @Get('avisos') @ApiExtension('x-permiso', 'publico') @ApiOperation({ summary: 'Avisos vigentes' })
  notices() { return this.service.notices(); }
  @Get('fila/:servicio') @ApiExtension('x-permiso', 'publico') @ApiOperation({ summary: 'Números llamados hoy con su consultorio, sin nombres' })
  queue(@Param('servicio') service: string) { return this.service.calledNumbers(service); }
}

@ApiTags('publico') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('avisos')
export class NoticesController {
  constructor(private readonly service: PublicService) {}
  @Post() @RequirePermission('avisos.publicar') @ApiOperation({ summary: 'Publicar un aviso general con vigencia; advierte si parece llevar datos personales' })
  publish(@Req() r: ActorRequest, @Body() d: NoticeDto, @Headers('idempotency-key') k?: string) { return this.service.publish(r.actor, d, k); }
}
