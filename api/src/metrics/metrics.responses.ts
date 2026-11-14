import { BoolProp, ClassArrayProp, ClassProp, DateProp, DateTimeProp, EnumProp, IntProp, NumProp, StrProp } from '../platform/responses';
import { ESTADO_AMBULANCIA } from '../platform/states';
import { INDICATORS } from './metrics.service';

const INDICATOR_NAMES = Object.keys(INDICATORS);
const INDICATOR_UNITS = [...new Set(Object.values(INDICATORS))];

export class BedTotalsResponse {
  @IntProp() total!: number;
  @IntProp() libres!: number;
  @IntProp() ocupadas!: number;
  @IntProp() limpieza!: number;
  @IntProp() bloqueadas!: number;
  @IntProp() reservadas!: number;
}

export class FloorOccupancyResponse {
  @IntProp({ nullable: true }) planta!: number | null;
  @IntProp() camas!: number;
  @IntProp() libres!: number;
  @IntProp() ocupadas!: number;
  @IntProp() limpieza!: number;
  @IntProp() bloqueadas!: number;
  @IntProp() reservadas!: number;
}

export class AmbulanceSummaryResponse {
  @EnumProp(ESTADO_AMBULANCIA, 'EstadoAmbulancia') estado!: string;
  @BoolProp() paramedicoDeTurno!: boolean;
}

export class QueueTotalsResponse {
  @IntProp() emitidos!: number;
  @IntProp() enEspera!: number;
  @IntProp() llamados!: number;
  @IntProp() enAtencion!: number;
  @IntProp() atendidos!: number;
  @IntProp() noSePresento!: number;
}

export class LaboratoryTotalsResponse {
  @IntProp() pendiente!: number;
  @IntProp() enProceso!: number;
  @IntProp() completadoHoy!: number;
  @IntProp() canceladoHoy!: number;
}

export class CoverageGapSummaryResponse {
  @StrProp() area!: string;
  @StrProp() rol!: string;
  @DateTimeProp() inicio!: string;
  @DateTimeProp() fin!: string;
  @IntProp() requeridos!: number;
  @IntProp() actuales!: number;
}

export class CoverageSummaryResponse {
  @IntProp() huecos!: number;
  @ClassArrayProp(CoverageGapSummaryResponse, { description: 'Primeros diez huecos' }) detalle!: CoverageGapSummaryResponse[];
}

export class MetricsDashboardResponse {
  @DateTimeProp() actualizadoEn!: string;
  @DateProp() fecha!: string;
  @ClassProp(BedTotalsResponse) camas!: BedTotalsResponse;
  @ClassArrayProp(FloorOccupancyResponse) ocupacionPorPlanta!: FloorOccupancyResponse[];
  @ClassProp(AmbulanceSummaryResponse, { nullable: true }) ambulancia!: AmbulanceSummaryResponse | null;
  @ClassProp(QueueTotalsResponse) fila!: QueueTotalsResponse;
  @ClassProp(LaboratoryTotalsResponse) laboratorio!: LaboratoryTotalsResponse;
  @ClassProp(CoverageSummaryResponse) cobertura!: CoverageSummaryResponse;
  @IntProp() turnosEnCurso!: number;
  @IntProp() pacientesActivos!: number;
}

export class SeriesPointResponse {
  @DateProp() fecha!: string;
  @NumProp({ nullable: true }) valor!: number | null;
  @IntProp() muestras!: number;
}

export class MetricSeriesResponse {
  @EnumProp(INDICATOR_NAMES, 'IndicadorMetrica') indicador!: string;
  @EnumProp(INDICATOR_UNITS, 'UnidadMetrica') unidad!: string;
  @DateProp() desde!: string;
  @DateProp() hasta!: string;
  @DateTimeProp() actualizadoEn!: string;
  @ClassArrayProp(SeriesPointResponse) serie!: SeriesPointResponse[];
}
