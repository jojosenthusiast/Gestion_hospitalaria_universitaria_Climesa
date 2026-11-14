import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { LaboratoryService } from './laboratory.service';

@ApiTags('laboratory') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('me')
export class MeLaboratoryController {
  constructor(private readonly laboratory: LaboratoryService) {}
  @Get('laboratorio') @RequirePermission('resultados.ver') @ApiOperation({ summary: 'Mis exámenes: estado siempre; valores solo revisados' })
  mine(@Req() r: ActorRequest) { return this.laboratory.mine(r.actor); }
}
