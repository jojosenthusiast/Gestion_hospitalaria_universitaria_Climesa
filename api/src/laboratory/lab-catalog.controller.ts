import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { LabCatalogService } from './lab-catalog.service';
import { LabExamUpdateDto } from './laboratory.dto';
import { LabCatalogExamResponse } from './laboratory.responses';

/** W10 (MA-LAB-06): exam catalog for the administrator. */
@ApiTags('laboratory') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('catalogo')
export class LabCatalogController {
  constructor(private readonly catalog: LabCatalogService) {}

  @Get('examenes') @RequirePermission('catalogo.configurar') @ApiOperation({ summary: 'Catálogo completo de exámenes con componentes y rangos vigentes' }) @ApiOkResponse({ type: [LabCatalogExamResponse] })
  exams() { return this.catalog.exams(); }

  @Put('examenes/:id') @RequirePermission('catalogo.configurar') @ApiOperation({ summary: 'Editar nombre, unidad, estado y rangos de un examen (los rangos se versionan por vigencia)' }) @ApiOkResponse({ type: LabCatalogExamResponse })
  update(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LabExamUpdateDto, @Headers('idempotency-key') key?: string) { return this.catalog.update(r.actor, id, dto, key); }
}
