import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor, contextsOf } from '../platform/actor';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';

type Row = Record<string, any>;
export type HistoryAccess = 'propio' | 'relacion';

/**
 * GET /pacientes/{id}/historial (FR-106-09, FR-106-10, FR-106-12; privacidad.md §2).
 * - The patient (context `propio_revisado`) sees only signed consultations and the values of reviewed orders (D-040).
 * - A clinician with a care relationship sees the
 *   consultations of every doctor, results and admissions. Drafts are visible only to the doctor who writes them.
 * Every read, granted or denied, is audited.
 */
@Injectable()
export class ClinicalHistoryService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}

  private async access(c: PoolClient, actor: Actor, patientId: string): Promise<HistoryAccess | null> {
    const contexts = contextsOf(actor, 'expediente.ver');
    const now = this.clock.now();
    if (actor.staffId && contexts.includes('relacion')) {
      const related = (await c.query(`SELECT 1 FROM atencion.relacion_atencion WHERE paciente_id=$1 AND profesional_id=$2 AND vigencia @> $3::timestamptz
        UNION ALL SELECT 1 FROM atencion.consulta WHERE paciente_id=$1 AND medico_id=$2 AND estado='abierta'
        UNION ALL SELECT 1 FROM hospitalizacion.admision WHERE paciente_id=$1 AND medico_tratante_id=$2 AND estado IN ('pendiente_cama','hospitalizado','alta_firmada') LIMIT 1`, [patientId, actor.staffId, now])).rowCount;
      if (related) return 'relacion';
    }
    if (actor.patientId === patientId && contexts.includes('propio_revisado')) return 'propio';
    return null;
  }

  async history(actor: Actor, patientId: string) {
    return this.db.transaction(async c => {
      const patient = (await c.query(`SELECT id,expediente,coalesce(nullif(concat_ws(' ',nombres,primer_apellido,segundo_apellido),''),alias_provisional) AS nombre FROM pacientes.paciente WHERE id=$1`, [patientId])).rows[0] as Row | undefined;
      const access = await this.access(c, actor, patientId);
      // The 403 is audited as a denial by the error filter; a missing record is not revealed to someone without access.
      if (!access) throw new ForbiddenException('El historial requiere una relación de atención o ser su titular.');
      if (!patient) throw new NotFoundException('No se encontró el paciente.');
      const own = access === 'propio';
      const consultations = (await c.query(`SELECT k.id,k.estado AS state,k.iniciada_en AS "startedAt",k.firmada_en AS "signedAt",k.motivo AS reason,k.examen_fisico AS "physicalExam",k.plan,
          json_build_object('id',m.id,'name',concat_ws(' ',m.nombres,m.apellidos),'specialty',m.especialidad) AS doctor,
          coalesce((SELECT json_agg(json_build_object('code',d.cie10,'description',x.descripcion,'principal',d.principal,'note',d.nota) ORDER BY d.principal DESC,d.cie10)
            FROM atencion.diagnostico d JOIN atencion.cie10 x ON x.codigo=d.cie10 WHERE d.consulta_id=k.id),'[]'::json) AS diagnoses,
          coalesce((SELECT json_agg(json_build_object('id',r.id,'issuedAt',r.emitida_en,'items',(SELECT coalesce(json_agg(json_build_object('medication',i.medicamento,'dose',i.dosis,'route',i.via,'frequency',i.frecuencia,'duration',i.duracion,'instructions',i.indicaciones) ORDER BY i.id),'[]'::json) FROM atencion.receta_item i WHERE i.receta_id=r.id)) ORDER BY r.emitida_en)
            FROM atencion.receta r WHERE r.consulta_id=k.id),'[]'::json) AS prescriptions
        FROM atencion.consulta k LEFT JOIN personal.persona m ON m.id=k.medico_id
        WHERE k.paciente_id=$1 AND (k.estado='firmada' OR (NOT $2::boolean AND (k.estado='ingresada_por_error' OR (k.estado='abierta' AND k.medico_id=$3::uuid))))
        ORDER BY coalesce(k.firmada_en,k.iniciada_en) DESC,k.id LIMIT 200`, [patientId, own, actor.staffId])).rows;
      // Values: the patient only after review (D-040); staff only with `resultados.ver` beyond the own context.
      const values = !own && contextsOf(actor, 'resultados.ver').some(context => context !== 'propio_revisado');
      const laboratory = (await c.query(`SELECT o.id,o.consulta_id AS "consultationId",o.estado AS state,o.prioridad AS priority,o.creada_en AS "createdAt",o.completada_en AS "completedAt",o.revisada_en AS "reviewedAt",
          coalesce(json_agg(json_build_object('id',oi.id,'code',e.codigo,'name',e.nombre,'unit',e.unidad,
            'result',CASE WHEN r.orden_item_id IS NOT NULL AND ($2::boolean OR o.revisada_en IS NOT NULL) THEN json_build_object('value',r.valor,'text',r.texto,'mark',r.marca) END) ORDER BY e.nombre) FILTER (WHERE oi.id IS NOT NULL),'[]'::json) AS items
        FROM laboratorio.orden o LEFT JOIN laboratorio.orden_item oi ON oi.orden_id=o.id LEFT JOIN laboratorio.examen e ON e.id=oi.examen_id LEFT JOIN laboratorio.resultado r ON r.orden_item_id=oi.id
        WHERE o.paciente_id=$1 GROUP BY o.id ORDER BY o.creada_en DESC LIMIT 200`, [patientId, values])).rows;
      const admissions = own ? [] : (await c.query(`SELECT a.id,a.estado AS state,a.origen AS origin,a.creado_en AS "createdAt",
          json_build_object('id',m.id,'name',concat_ws(' ',m.nombres,m.apellidos)) AS doctor
        FROM hospitalizacion.admision a LEFT JOIN personal.persona m ON m.id=a.medico_tratante_id WHERE a.paciente_id=$1 ORDER BY a.creado_en DESC LIMIT 100`, [patientId])).rows;
      await this.commands.audit(c, actor, { action: 'expediente.leer', entity: 'paciente', entityId: patientId, patientId, permission: 'expediente.ver',
        detail: { access, consultations: consultations.length, orders: laboratory.length } });
      return { patient: { id: patient.id, record: patient.expediente, fullName: patient.nombre }, access, consultations, laboratory, admissions };
    });
  }
}
