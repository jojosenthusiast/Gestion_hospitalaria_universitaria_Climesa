import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { INDICATORS, MetricsService } from './metrics.service';

@ApiTags('metricas') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('metricas')
export class MetricsController {
  constructor(private readonly service: MetricsService) {}
  @Get('tablero') @RequirePermission('metricas.ver') @ApiOperation({ summary: 'Tablero inicial: agregados sin datos personales' })
  dashboard() { return this.service.dashboard(); }
  @Get(':indicador') @RequirePermission('metricas.ver') @ApiOperation({ summary: `Serie diaria de un indicador (${Object.keys(INDICATORS).join(', ')})` })
  @ApiQuery({ name: 'desde', required: false, description: 'Primer día local, yyyy-MM-dd' }) @ApiQuery({ name: 'hasta', required: false, description: 'Último día local, yyyy-MM-dd' })
  series(@Param('indicador') indicator: string, @Query('desde') from?: string, @Query('hasta') to?: string) { return this.service.series(indicator, from, to); }
}
