import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor, contextsOf } from '../platform/actor';
import { channelsFor } from '../platform/channels';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { ProblemException } from '../platform/problem';
import { requireCurrentEnrollment } from '../platform/enrollment';
import { activeExceptionalAccess, EXCEPTIONAL_REASON } from '../privacy';
import { DiagnosisDto, PrescriptionDto, VitalSignsDto } from './clinical-record.dto';

type Row = Record<string, any>;

@Injectable()
export class ClinicalRecordService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}

  /**
   * `lock` serializes clinical writes with the signature (DAT-04): both take the consultation row FOR UPDATE.
   * `vitals`: `signos.registrar` with context `x` (AST, ENF, MED, PAR in permisos.csv) needs no care
   * relationship, so the nurse or assistant can take vital signs in the open consultation (F-02, API-06).
   */
  private async consultation(c: PoolClient, actor: Actor, id: string, lock = false, vitals = false, read = false) {
    const row = (await c.query(`SELECT k.id,k.paciente_id AS "patientId",k.medico_id AS "doctorId",k.cita_id AS "appointmentId",
      k.motivo AS reason,k.examen_fisico AS "physicalExam",k.plan,k.estado AS state,k.version,
      coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional) AS "patientName"
      FROM atencion.consulta k JOIN pacientes.paciente p ON p.id=k.paciente_id WHERE k.id=$1 ${lock ? 'FOR UPDATE OF k' : ''}`, [id])).rows[0] as Row | undefined;
    if (!row) throw new NotFoundException('No se encontró la consulta.');
    // SEG-07: the patient sees only a signed note (privacidad.md §2); a draft does not exist for them.
    const ownPatient = actor.patientId && actor.patientId === row.patientId && contextsOf(actor, 'expediente.ver').includes('propio_revisado');
    const ownDoctor = actor.staffId && actor.staffId === row.doctorId;
    if (vitals && actor.staffId && contextsOf(actor, 'signos.registrar').includes('x')) return row;
    const relation = actor.staffId ? (await c.query(`SELECT 1 FROM atencion.relacion_atencion WHERE paciente_id=$1 AND profesional_id=$2 AND vigencia @> $3::timestamptz LIMIT 1`, [row.patientId, actor.staffId, this.clock.now()])).rowCount : 0;
    const canRelation = contextsOf(actor, 'expediente.ver').includes('relacion') || contextsOf(actor, 'consulta.registrar').includes('relacion') || contextsOf(actor, 'recetas.emitir').includes('relacion');
    if (ownPatient && !ownDoctor && !(canRelation && relation) && row.state !== 'firmada') throw new NotFoundException('No se encontró la consulta.');
    if (!ownPatient && !ownDoctor && !(canRelation && relation)) {
      // FR-110-01: a read (never a write) is also allowed by an approved exceptional access in force (spec 110, RN-40).
      const exceptional = read && !ownPatient ? await activeExceptionalAccess(c, actor.id, row.patientId, this.clock.now()) : null;
      if (!exceptional) throw new ForbiddenException('No tienes relación de atención con este paciente.');
      return { ...row, exceptionalAccessId: exceptional };
    }
    return row;
  }

  async detail(actor: Actor, id: string) {
    return this.db.transaction(async c => {
      const { exceptionalAccessId, ...consultation } = await this.consultation(c, actor, id, false, false, true) as Row;
      await this.commands.audit(c, actor, { action: 'consulta.leer', entity: 'consulta', entityId: id, patientId: consultation.patientId, permission: 'expediente.ver', ...(exceptionalAccessId ? { reason: EXCEPTIONAL_REASON, detail: { exceptionalAccessId } } : {}) });
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
    return this.commands.run(actor, `signos.registrar:${id}`, key, dto, async c => {
      const consultation = await this.consultation(c, actor, id, true, true);
      // F-04: vital signs belong to the note; once signed they are rejected like any other change.
      if (consultation.state !== 'abierta') throw new ProblemException('consulta_firmada', 409, 'La consulta ya está firmada y no admite signos nuevos.');
      if (dto.admissionId) {
        const admission = (await c.query('SELECT paciente_id FROM hospitalizacion.admision WHERE id=$1', [dto.admissionId])).rows[0];
        if (!admission || admission.paciente_id !== consultation.patientId) throw new BadRequestException('La admisión no pertenece al paciente de la consulta.');
      }
      const row = (await c.query(`INSERT INTO atencion.signos_vitales(paciente_id,consulta_id,admision_id,tomado_por,pa_sistolica,pa_diastolica,fc,fr,temperatura,sat_o2,peso_kg,talla_cm)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,tomado_en AS "takenAt"`, [consultation.patientId,id,dto.admissionId ?? null,actor.staffId,dto.systolic ?? null,dto.diastolic ?? null,dto.heartRate ?? null,dto.respiratoryRate ?? null,dto.temperature ?? null,dto.oxygenSaturation ?? null,dto.weightKg ?? null,dto.heightCm ?? null])).rows[0];
      await this.commands.audit(c, actor, { action: 'signos.registrar', entity: 'signos_vitales', entityId: row.id, patientId: consultation.patientId, permission: 'signos.registrar', detail: { consultationId: id } });
      await this.commands.event(c, 'consulta.actualizada', 'consulta', id, consultation.version, await channelsFor(c, ['expediente.ver', 'signos.registrar']));
      return row;
    });
  }

  async addDiagnosis(actor: Actor, id: string, dto: DiagnosisDto, key?: string) {
    if (!actor.staffId) throw new ForbiddenException('La cuenta no está vinculada a personal clínico.');
    return this.commands.run(actor, `consulta.registrar:${id}:diagnostico`, key, dto, async c => {
      const consultation = await this.consultation(c, actor, id, true);
      if (consultation.state !== 'abierta') throw new ProblemException('consulta_firmada', 409, 'La consulta ya está firmada y no admite diagnósticos nuevos.');
      const code = dto.code.trim().toUpperCase();
      const cie10 = (await c.query('SELECT codigo,descripcion FROM atencion.cie10 WHERE codigo=$1', [code])).rows[0] as Row | undefined;
      if (!cie10) throw new NotFoundException('El código CIE-10 no existe en el catálogo.');
      if (dto.principal) await c.query('UPDATE atencion.diagnostico SET principal=false WHERE consulta_id=$1', [id]);
      const row = (await c.query(`INSERT INTO atencion.diagnostico(consulta_id,cie10,principal,nota) VALUES($1,$2,$3,$4)
        RETURNING id,cie10 AS code,principal,nota AS note`, [id, code, dto.principal ?? false, dto.note?.trim() || null])).rows[0];
      await this.commands.audit(c, actor, { action: 'diagnostico.registrar', entity: 'diagnostico', entityId: row.id, patientId: consultation.patientId, permission: 'consulta.registrar', detail: { consultationId: id, code } });
      await this.commands.event(c, 'consulta.actualizada', 'consulta', id, consultation.version, await channelsFor(c, ['expediente.ver', 'consulta.iniciar']));
      return { ...row, description: cie10.descripcion };
    });
  }

  async addPrescription(actor: Actor, id: string, dto: PrescriptionDto, key?: string) {
    if (!actor.staffId) throw new ForbiddenException('La cuenta no está vinculada a personal clínico.');
    return this.commands.run(actor, `recetas.emitir:${id}`, key, dto, async c => {
      const consultation = await this.consultation(c, actor, id, true);
      if (consultation.state !== 'abierta') throw new ProblemException('consulta_firmada', 409, 'La consulta ya está firmada y no admite recetas nuevas.');
      await requireCurrentEnrollment(c, actor.staffId, this.clock.today());
      const prescription = (await c.query(`INSERT INTO atencion.receta(consulta_id) VALUES($1) RETURNING id,emitida_en AS "issuedAt"`, [id])).rows[0];
      const items: Row[] = [];
      for (const item of dto.items) {
        const row = (await c.query(`INSERT INTO atencion.receta_item(receta_id,medicamento,dosis,via,frecuencia,duracion,indicaciones)
          VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,medicamento AS medication,dosis AS dose,via AS route,frecuencia AS frequency,duracion AS duration,indicaciones AS instructions`,
          [prescription.id, item.medication.trim(), item.dose.trim(), item.route.trim(), item.frequency.trim(), item.duration.trim(), item.instructions?.trim() || null])).rows[0];
        items.push(row);
      }
      await this.commands.audit(c, actor, { action: 'receta.emitir', entity: 'receta', entityId: prescription.id, patientId: consultation.patientId, permission: 'recetas.emitir', detail: { consultationId: id, itemCount: items.length } });
      await this.commands.event(c, 'consulta.actualizada', 'consulta', id, consultation.version, await channelsFor(c, ['expediente.ver', 'recetas.emitir']));
      return { ...prescription, items };
    });
  }
}
