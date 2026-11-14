import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { ClinicalHistoryService } from './clinical-history.service';
import { ClinicalHistoryResponse } from './attention.responses';

@ApiTags('clinical-record') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('pacientes')
export class ClinicalHistoryController {
  constructor(private readonly history: ClinicalHistoryService) {}
  @Get(':id/historial') @RequirePermission('expediente.ver') @ApiOperation({ summary: 'Historial clínico: relación, acceso excepcional o propio revisado' }) @ApiOkResponse({ type: ClinicalHistoryResponse })
  get(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string) { return this.history.history(r.actor, id); }
}
