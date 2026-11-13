import { Body, Controller, Headers, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { TransferDto } from './hospitalization.dto';
import { HospitalizationService } from './hospitalization.service';
@ApiTags('hospitalization') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('ocupaciones')
export class TransferController {
  constructor(private readonly service: HospitalizationService) {}
  @Post(':id/traslado') @RequirePermission('camas.trasladar') @ApiOperation({ summary: 'Trasladar una ocupación a otra cama' }) transfer(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: TransferDto, @Headers('idempotency-key') k?: string) { return this.service.transfer(r.actor, id, d, k); }
}
