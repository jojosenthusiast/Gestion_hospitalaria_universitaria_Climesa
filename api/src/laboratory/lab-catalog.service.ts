import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor } from '../platform/actor';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { LabExamUpdateDto, LabRangeDto } from './laboratory.dto';
import { rangeProblem } from './laboratory.rules';

const EXAMS_SQL = `SELECT e.id,e.codigo AS code,e.nombre AS name,e.es_panel AS "isPanel",e.unidad AS unit,e.tipo_resultado AS "resultType",e.activo AS active,e.version,
  EXISTS(SELECT 1 FROM laboratorio.orden_item oi JOIN laboratorio.resultado r ON r.orden_item_id=oi.id WHERE oi.examen_id=e.id) AS "hasResults",
  coalesce((SELECT json_agg(json_build_object('id',x.id,'code',x.codigo,'name',x.nombre) ORDER BY ec.orden,x.nombre)
    FROM laboratorio.examen_componente ec JOIN laboratorio.examen x ON x.id=ec.componente_id WHERE ec.panel_id=e.id),'[]'::json) AS components,
  coalesce((SELECT json_agg(json_build_object('id',r.id,'sex',r.sexo,'ageFrom',coalesce(lower(r.edad_anios),0),'ageTo',upper(r.edad_anios),
      'min',r.minimo,'max',r.maximo,'criticalLow',r.critico_bajo,'criticalHigh',r.critico_alto,'validFrom',lower(r.vigencia),'source',r.fuente)
      ORDER BY r.sexo,lower(r.edad_anios))
    FROM laboratorio.rango_referencia r WHERE r.examen_id=e.id AND r.vigencia @> $1::date),'[]'::json) AS ranges
  FROM laboratorio.examen e`;

/**
 * W10, MA-LAB-06: the administrator reads the whole exam catalog and edits an exam. Reference ranges are versioned by
 * validity: editing them closes the ranges valid today and opens the new ones from today, so every past result keeps
 * the range its mark was computed with (RN-24).
 */
@Injectable()
export class LabCatalogService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}

  async exams() {
    return this.db.query(`${EXAMS_SQL} ORDER BY e.es_panel DESC,e.nombre,e.codigo`, [this.clock.today()]);
  }

  private async exam(c: PoolClient, id: string) {
    return (await c.query(`${EXAMS_SQL} WHERE e.id=$2`, [this.clock.today(), id])).rows[0];
  }

  async update(actor: Actor, id: string, dto: LabExamUpdateDto, key?: string) {
    return this.commands.run(actor, `catalogo.configurar:examen:${id}`, key, dto, async c => {
      const old = (await c.query('SELECT id,nombre,unidad,activo,es_panel AS "isPanel",tipo_resultado AS "resultType",version FROM laboratorio.examen WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!old) throw new NotFoundException('No se encontró el examen.');
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'El examen cambió; vuelve a cargar el catálogo.');
      const numeric = !old.isPanel && old.resultType === 'numerico';
      if (dto.unit !== undefined && !numeric) throw new BadRequestException('Solo los exámenes numéricos tienen unidad.');
      if (dto.ranges !== undefined && !numeric) throw new BadRequestException('Solo los exámenes numéricos tienen rangos de referencia.');
      const unit = dto.unit?.trim();
      if (unit !== undefined && unit !== old.unidad) {
        const used = (await c.query('SELECT 1 FROM laboratorio.orden_item oi JOIN laboratorio.resultado r ON r.orden_item_id=oi.id WHERE oi.examen_id=$1 LIMIT 1', [id])).rowCount;
        if (used) throw new ProblemException('examen_con_resultados', 409, 'El examen ya tiene resultados con esta unidad; crea un examen nuevo en lugar de cambiarla.', 'unit');
      }
      if (dto.ranges) {
        const problem = rangeProblem(dto.ranges);
        if (problem) throw new BadRequestException(problem);
      }
      await c.query(`UPDATE laboratorio.examen SET nombre=coalesce($2,nombre),unidad=coalesce($3,unidad),activo=coalesce($4,activo),version=version+1 WHERE id=$1`,
        [id, dto.name?.trim() ?? null, unit ?? null, dto.active ?? null]);
      if (dto.ranges) await this.replaceRanges(c, id, dto.ranges);
      await this.commands.audit(c, actor, { action: 'catalogo.examen_editado', entity: 'examen_laboratorio', entityId: id, permission: 'catalogo.configurar',
        detail: { name: dto.name !== undefined, unit: unit !== undefined && unit !== old.unidad, active: dto.active ?? null, ranges: dto.ranges?.length ?? null } });
      return this.exam(c, id);
    });
  }

  private async replaceRanges(c: PoolClient, id: string, ranges: LabRangeDto[]) {
    const today = this.clock.today();
    // Ranges valid today (or starting later) stop today; a range that would start and end today becomes empty.
    await c.query(`UPDATE laboratorio.rango_referencia SET vigencia=CASE WHEN lower_inf(vigencia) OR lower(vigencia)<$2::date THEN daterange(lower(vigencia),$2::date,'[)') ELSE 'empty'::daterange END
      WHERE examen_id=$1 AND NOT isempty(vigencia) AND (vigencia @> $2::date OR lower(vigencia)>$2::date)`, [id, today]);
    for (const r of ranges) {
      await c.query(`INSERT INTO laboratorio.rango_referencia(examen_id,sexo,edad_anios,minimo,maximo,critico_bajo,critico_alto,vigencia,fuente)
        VALUES($1,$2,int4range($3,$4,'[)'),$5,$6,$7,$8,daterange($9::date,NULL,'[)'),$10)`,
        [id, r.sex, r.ageFrom, r.ageTo ?? null, r.min ?? null, r.max ?? null, r.criticalLow ?? null, r.criticalHigh ?? null, today, r.source.trim()]);
    }
  }
}
