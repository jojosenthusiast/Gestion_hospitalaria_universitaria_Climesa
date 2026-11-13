import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor, contextsOf } from '../platform/actor';
import { channelsFor, patientAccount } from '../platform/channels';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { VitalSignsDto } from './clinical-record.dto';

type Row = Record<string, any>;

@Injectable()
export class ClinicalRecordService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}

  private async consultation(c: PoolClient, actor: Actor, id: string) {
    const row = (await c.query(`SELECT k.id,k.paciente_id AS "patientId",k.medico_id AS "doctorId",k.cita_id AS "appointmentId",
      k.motivo AS reason,k.examen_fisico AS "physicalExam",k.plan,k.estado AS state,k.version,
      coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional) AS "patientName"
      FROM atencion.consulta k JOIN pacientes.paciente p ON p.id=k.paciente_id WHERE k.id=$1`, [id])).rows[0] as Row | undefined;
    if (!row) throw new NotFoundException('No se encontró la consulta.');
    const ownPatient = actor.patientId && actor.patientId === row.patientId;
    const ownDoctor = actor.staffId && actor.staffId === row.doctorId;
    const relation = actor.staffId ? (await c.query(`SELECT 1 FROM atencion.relacion_atencion WHERE paciente_id=$1 AND profesional_id=$2 AND vigencia @> $3::timestamptz LIMIT 1`, [row.patientId, actor.staffId, this.clock.now()])).rowCount : 0;
    const canRelation = contextsOf(actor, 'expediente.ver').includes('relacion') || contextsOf(actor, 'signos.registrar').includes('x');
    if (!ownPatient && !ownDoctor && !(canRelation && relation)) throw new ForbiddenException('No tienes relación de atención con este paciente.');
    return row;
  }

  async detail(actor: Actor, id: string) {
    return this.db.transaction(async c => {
      const consultation = await this.consultation(c, actor, id);
      const [vitals, diagnoses, prescriptions] = await Promise.all([
        c.query(`SELECT id,tomado_en AS "takenAt",tomado_por AS "takenBy",pa_sistolica AS systolic,pa_diastolica AS diastolic,fc AS "heartRate",fr AS "respiratoryRate",temperatura AS temperature,sat_o2 AS "oxygenSaturation",peso_kg AS "weightKg",talla_cm AS "heightCm" FROM atencion.signos_vitales WHERE consulta_id=$1 ORDER BY tomado_en DESC`, [id]),
        c.query(`SELECT id,cie10 AS code,principal,nota AS note FROM atencion.diagnostico WHERE consulta_id=$1 ORDER BY principal DESC,id`, [id]),
        c.query(`SELECT r.id,r.emitida_en AS "issuedAt",coalesce(json_agg(json_build_object('id',i.id,'medication',i.medicamento,'dose',i.dosis,'route',i.via,'frequency',i.frecuencia,'duration',i.duracion,'instructions',i.indicaciones) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL),'[]'::json) AS items FROM atencion.receta r LEFT JOIN atencion.receta_item i ON i.receta_id=r.id WHERE r.consulta_id=$1 GROUP BY r.id ORDER BY r.emitida_en DESC`, [id]),
      ]);
      return { consultation, vitalSigns: vitals.rows, diagnoses: diagnoses.rows, prescriptions: prescriptions.rows };
    });
  }

  async addVitalSigns(actor: Actor, id: string, dto: VitalSignsDto, key?: string) {
    if (!actor.staffId) throw new ForbiddenException('La cuenta no está vinculada a personal clínico.');
    return this.commands.run(actor, 'signos.registrar', key, dto, async c => {
      const consultation = await this.consultation(c, actor, id);
      const row = (await c.query(`INSERT INTO atencion.signos_vitales(paciente_id,consulta_id,admision_id,tomado_por,pa_sistolica,pa_diastolica,fc,fr,temperatura,sat_o2,peso_kg,talla_cm)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,tomado_en AS "takenAt"`, [consultation.patientId,id,dto.admissionId ?? null,actor.staffId,dto.systolic ?? null,dto.diastolic ?? null,dto.heartRate ?? null,dto.respiratoryRate ?? null,dto.temperature ?? null,dto.oxygenSaturation ?? null,dto.weightKg ?? null,dto.heightCm ?? null])).rows[0];
      await this.commands.audit(c, actor, { action: 'signos.registrar', entity: 'signos_vitales', entityId: row.id, patientId: consultation.patientId, permission: 'signos.registrar', detail: { consultationId: id } });
      await this.commands.event(c, 'consulta.actualizada', 'consulta', id, consultation.version, await channelsFor(c, ['expediente.ver', 'signos.registrar'], { users: [await patientAccount(c, consultation.patientId)] }));
      return row;
    });
  }
}

