import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { INDICATORS, LAB_TURNAROUND_DAYS, MetricsService } from './metrics.service';
import { MetricSeriesResponse, MetricsDashboardResponse } from './metrics.responses';

@ApiTags('metricas') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('metricas')
export class MetricsController {
  constructor(private readonly service: MetricsService) {}
  @Get('tablero') @RequirePermission('metricas.ver') @ApiOperation({ summary: 'Tablero inicial: agregados sin datos personales' }) @ApiOkResponse({ type: MetricsDashboardResponse })
  dashboard() { return this.service.dashboard(); }
  @Get(':indicador') @RequirePermission('metricas.ver') @ApiOperation({ summary: `Serie diaria de un indicador (${Object.keys(INDICATORS).join(', ')})` })
  @ApiQuery({ name: 'desde', required: false, description: 'Primer día local, yyyy-MM-dd' }) @ApiQuery({ name: 'hasta', required: false, description: 'Último día local, yyyy-MM-dd' }) @ApiOkResponse({ type: MetricSeriesResponse })
  series(@Param('indicador') indicator: string, @Query('desde') from?: string, @Query('hasta') to?: string) { return this.service.series(indicator, from, to); }
}

/**
 * D3 (owner decision 2026-11-18): the lab reads its own turnaround without `metricas.ver`. Same aggregate as
 * `/metricas/tiempo_laboratorio` (average and median, external orders excluded), never names or ids.
 */
@ApiTags('laboratory') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('laboratorio')
export class LabTurnaroundController {
  constructor(private readonly service: MetricsService) {}
  @Get('tiempo-entrega') @RequirePermission('laboratorio.ver_cola')
  @ApiOperation({ summary: `Tiempo de entrega del laboratorio de los últimos ${LAB_TURNAROUND_DAYS} días: promedio y mediana por día y del rango, sin órdenes externas` }) @ApiOkResponse({ type: MetricSeriesResponse })
  turnaround() { return this.service.labTurnaround(); }
}
