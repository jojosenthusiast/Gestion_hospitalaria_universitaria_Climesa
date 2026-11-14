import { BadRequestException, Injectable } from '@nestjs/common';
import { PersonnelService } from '../operations';
import { BUSINESS_ZONE, Clock, businessDate, businessDayRange } from '../platform/clock';
import { DatabaseService } from '../platform/database.service';
import { HeadCache } from '../platform/head-cache';
import { ProblemException } from '../platform/problem';

/** Plan 113: caché de 10 s invalidada por cualquier evento confirmado. */
export const METRICS_CACHE_MS = 10_000;
const HOUR = 3600_000, DAY = 86400_000, MAX_DAYS = 31;

/** FR-113-05: indicadores por rango de fechas y su unidad. */
export const INDICATORS = {
  ocupacion_diaria: 'porcentaje',
  estancia_promedio: 'dias',
  tiempo_laboratorio: 'minutos',
  tiempo_ambulancia: 'minutos',
  cobertura_turnos: 'horas_con_hueco',
} as const;
export type Indicator = keyof typeof INDICATORS;
type Point = { fecha: string; valor: number | null; muestras: number };

const num = (v: unknown) => v == null ? null : Number(v);
const zone = `'${BUSINESS_ZONE}'`;
/** Días locales del rango como intervalos `[inicio, fin)` recortados al instante actual ($3). */
const DAYS = `WITH d AS (SELECT g::date AS fecha,
    tstzrange(g::date::timestamp AT TIME ZONE ${zone}, least((g::date+1)::timestamp AT TIME ZONE ${zone}, $3::timestamptz)) AS r
  FROM generate_series($1::date,$2::date,interval '1 day') g)`;

/**
 * Métricas y tablero (spec 113): solo agregados, nunca nombres, DUI, expediente ni ids de personas
 * (FR-113-03). Los turnos de cobertura vienen de la superficie pública de operaciones.
 */
@Injectable()
export class MetricsService {
  private readonly cache: HeadCache;
  constructor(private readonly db: DatabaseService, private readonly clock: Clock, private readonly people: PersonnelService) {
    this.cache = new HeadCache(db, clock, METRICS_CACHE_MS);
  }

  /** FR-113-01: tablero inicial. */
  dashboard() {
    return this.cache.get('tablero', async () => {
      const now = this.clock.now(), today = this.clock.today();
      const floors = await this.db.query<Record<string, number>>('SELECT planta,camas,libres,ocupadas,limpieza,bloqueadas,reservadas FROM metricas.v_ocupacion_por_planta ORDER BY planta NULLS LAST');
      const beds = { total: 0, libres: 0, ocupadas: 0, limpieza: 0, bloqueadas: 0, reservadas: 0 };
      for (const f of floors) { beds.total += f.camas; beds.libres += f.libres; beds.ocupadas += f.ocupadas; beds.limpieza += f.limpieza; beds.bloqueadas += f.bloqueadas; beds.reservadas += f.reservadas; }
      const unit = (await this.db.query<{ estado: string }>('SELECT estado FROM ambulancia.unidad ORDER BY placa LIMIT 1'))[0];
      const paramedic = (await this.db.query("SELECT 1 FROM personal.turno t JOIN personal.persona p ON p.id=t.persona_id WHERE p.tipo='paramedico' AND p.activo AND t.estado IN ('publicado','en_curso') AND t.periodo @> $1::timestamptz LIMIT 1", [now])).length > 0;
      const queue = (await this.db.query<Record<string, number>>(`SELECT count(*)::int AS emitidos,count(*) FILTER(WHERE estado='en_espera')::int AS "enEspera",count(*) FILTER(WHERE estado='llamado')::int AS llamados,
        count(*) FILTER(WHERE estado='en_atencion')::int AS "enAtencion",count(*) FILTER(WHERE estado='atendido')::int AS atendidos,count(*) FILTER(WHERE estado='no_se_presento')::int AS "noSePresento"
        FROM atencion.ticket_fila WHERE fecha=$1::date`, [today]))[0];
      const lab = (await this.db.query<Record<string, number>>(`SELECT coalesce(sum(ordenes) FILTER(WHERE estado='pendiente'),0)::int AS pendiente,coalesce(sum(ordenes) FILTER(WHERE estado='en_proceso'),0)::int AS "enProceso",
        coalesce(sum(ordenes) FILTER(WHERE estado='completado' AND fecha_completada=$1::date),0)::int AS "completadoHoy",coalesce(sum(ordenes) FILTER(WHERE estado='cancelado' AND fecha_creacion=$1::date),0)::int AS "canceladoHoy"
        FROM metricas.v_laboratorio_por_estado`, [today]))[0];
      const coverage = await this.people.coverage(today, today);
      const shifts = (await this.db.query<{ n: number }>("SELECT count(*)::int AS n FROM personal.turno WHERE estado IN ('publicado','en_curso') AND periodo @> $1::timestamptz", [now]))[0].n;
      const patients = (await this.db.query<{ n: number }>("SELECT count(*)::int AS n FROM pacientes.paciente WHERE estado='activo'"))[0].n;
      return {
        actualizadoEn: now.toISOString(), fecha: today,
        camas: beds,
        ocupacionPorPlanta: floors.map(f => ({ planta: f.planta, camas: f.camas, libres: f.libres, ocupadas: f.ocupadas, limpieza: f.limpieza, bloqueadas: f.bloqueadas, reservadas: f.reservadas })),
        ambulancia: unit ? { estado: unit.estado, paramedicoDeTurno: paramedic } : null,
        fila: queue,
        laboratorio: lab,
        cobertura: { huecos: coverage.gaps.length, detalle: coverage.gaps.slice(0, 10).map(g => ({ area: g.area, rol: g.role, inicio: g.start, fin: g.end, requeridos: g.required, actuales: g.actual })) },
        turnosEnCurso: shifts,
        pacientesActivos: patients,
      };
    });
  }

  /** FR-113-05: serie diaria de un indicador entre `desde` y `hasta` (máximo 31 días). */
  async series(indicator: string, from?: string, to?: string) {
    if (!(indicator in INDICATORS)) throw new ProblemException('indicador_desconocido', 404, `El indicador no existe. Usa uno de: ${Object.keys(INDICATORS).join(', ')}.`, 'indicador');
    const today = this.clock.today();
    const desde = from || today, hasta = to || today;
    try {
      const start = businessDayRange(desde).start, end = businessDayRange(hasta).end;
      if (end <= start || (end.valueOf() - start.valueOf()) / DAY > MAX_DAYS) throw new RangeError();
    } catch { throw new BadRequestException('Indica un rango de fechas válido (AAAA-MM-DD), con el fin igual o posterior al inicio y de máximo 31 días.'); }
    const key = indicator as Indicator;
    return this.cache.get(`serie:${key}:${desde}:${hasta}`, async () => {
      const serie = key === 'cobertura_turnos' ? await this.coverageSeries(desde, hasta) : await this.sqlSeries(key, desde, hasta);
      return { indicador: key, unidad: INDICATORS[key], desde, hasta, actualizadoEn: this.clock.now().toISOString(), serie };
    });
  }

  private async sqlSeries(key: Exclude<Indicator, 'cobertura_turnos'>, from: string, to: string): Promise<Point[]> {
    const now = this.clock.now();
    const sql: Record<typeof key, string> = {
      ocupacion_diaria: `${DAYS}, b AS (SELECT count(*)::numeric AS n FROM infra.v_estado_cama)
        SELECT d.fecha::text AS fecha,count(o.id)::int AS muestras,
          CASE WHEN b.n=0 OR isempty(d.r) THEN NULL ELSE round(100*coalesce(sum(extract(epoch FROM upper(o.periodo*d.r)-lower(o.periodo*d.r))),0)/(b.n*extract(epoch FROM upper(d.r)-lower(d.r))),1) END AS valor
        FROM d CROSS JOIN b LEFT JOIN hospitalizacion.ocupacion_cama o ON NOT isempty(d.r) AND o.periodo && d.r GROUP BY d.fecha,d.r,b.n ORDER BY d.fecha`,
      estancia_promedio: `${DAYS}, s AS (SELECT o.admision_id,min(lower(o.periodo)) AS ini,max(upper(o.periodo)) AS fin FROM hospitalizacion.ocupacion_cama o
          JOIN hospitalizacion.admision a ON a.id=o.admision_id AND a.estado='egresado' GROUP BY o.admision_id HAVING bool_and(NOT upper_inf(o.periodo)))
        SELECT d.fecha::text AS fecha,count(s.admision_id)::int AS muestras,round(avg(extract(epoch FROM s.fin-s.ini))/86400,2) AS valor
        FROM d LEFT JOIN s ON (s.fin AT TIME ZONE ${zone})::date=d.fecha AND s.fin<=$3::timestamptz GROUP BY d.fecha ORDER BY d.fecha`,
      tiempo_laboratorio: `${DAYS}
        SELECT d.fecha::text AS fecha,count(o.id)::int AS muestras,round(avg(extract(epoch FROM o.completada_en-o.creada_en))/60,1) AS valor
        FROM d LEFT JOIN laboratorio.orden o ON o.estado='completado' AND o.completada_en IS NOT NULL AND (o.completada_en AT TIME ZONE ${zone})::date=d.fecha AND o.completada_en<=$3::timestamptz
        GROUP BY d.fecha ORDER BY d.fecha`,
      tiempo_ambulancia: `${DAYS}, t AS (SELECT coalesce(sol.creada_en,s.despachado_en) AS inicio,
          (SELECT min(h.ocurrido_en) FROM ambulancia.hito h WHERE h.servicio_id=s.id AND h.tipo='en_escena') AS escena
          FROM ambulancia.servicio s LEFT JOIN ambulancia.solicitud sol ON sol.id=s.solicitud_id)
        SELECT d.fecha::text AS fecha,count(t.escena)::int AS muestras,round(avg(extract(epoch FROM t.escena-t.inicio))/60,1) AS valor
        FROM d LEFT JOIN t ON t.escena IS NOT NULL AND (t.inicio AT TIME ZONE ${zone})::date=d.fecha AND t.escena<=$3::timestamptz GROUP BY d.fecha ORDER BY d.fecha`,
    };
    const rows = await this.db.query<{ fecha: string; valor: unknown; muestras: number }>(sql[key], [from, to, now]);
    return rows.map(r => ({ fecha: r.fecha, valor: r.muestras > 0 || key === 'ocupacion_diaria' ? num(r.valor) : null, muestras: r.muestras }));
  }

  /** Horas con algún hueco de cobertura por día local (FR-103-08 aplicado al rango). */
  private async coverageSeries(from: string, to: string): Promise<Point[]> {
    const { gaps } = await this.people.coverage(from, to);
    const hours = new Map<string, Set<number>>();
    for (const gap of gaps) for (let h = new Date(gap.start).valueOf(); h < new Date(gap.end).valueOf(); h += HOUR) {
      const day = businessDate(new Date(h));
      if (!hours.has(day)) hours.set(day, new Set());
      hours.get(day)!.add(h);
    }
    const points: Point[] = [];
    for (let day = businessDayRange(from).start.valueOf(); day < businessDayRange(to).end.valueOf(); day += DAY) {
      const fecha = businessDate(new Date(day));
      const n = hours.get(fecha)?.size ?? 0;
      points.push({ fecha, valor: n, muestras: gaps.filter(g => businessDate(new Date(g.start)) === fecha).length });
    }
    return points;
  }
}
