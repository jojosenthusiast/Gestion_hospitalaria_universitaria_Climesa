import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Actor, contextsOf } from '../platform/actor';
import { channelsFor } from '../platform/channels';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { ageOn, searchShowsBirth } from '../patients/patient.privacy';
import { Clock } from '../platform/clock';
import { PatientVitalsDto } from './patient-vitals.dto';

const MEASURES = ['systolic', 'diastolic', 'heartRate', 'respiratoryRate', 'temperature', 'oxygenSaturation', 'weightKg', 'heightCm', 'pain', 'glucoseMgDl'] as const;

/**
 * Vital signs of a patient outside any consultation (A41 Signos vitales, A51 Paciente hospitalizado). Same permission and
 * context as the consultation endpoint (`signos.registrar` with context `x`, no care relationship needed) and the same
 * table; a row without `consulta_id` is not blocked by the signed-note trigger. Every take is a new row: nothing is edited or deleted.
 */
@Injectable()
export class PatientVitalsService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}

  private requireCare(actor: Actor) {
    if (!actor.staffId || !contextsOf(actor, 'signos.registrar').includes('x')) throw new ForbiddenException('Tu cuenta no puede ver ni registrar signos vitales.');
  }

  private async patient(c: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> }, id: string) {
    const row = (await c.query(`SELECT id,expediente AS record,nacimiento::text AS birth,coalesce(nullif(concat_ws(' ',nombres,primer_apellido,segundo_apellido),''),alias_provisional) AS name FROM pacientes.paciente WHERE id=$1`, [id])).rows[0];
    if (!row) throw new NotFoundException('No se encontró el paciente.');
    return row as { id: string; record: string; birth: string | null; name: string };
  }

  async history(actor: Actor, patientId: string, limit = 30) {
    this.requireCare(actor);
    return this.db.transaction(async c => {
      const patient = await this.patient(c, patientId);
      const stay = (await c.query(`SELECT a.id AS "admissionId",coalesce(o.codigo,'') AS bed FROM hospitalizacion.admision a LEFT JOIN hospitalizacion.ocupacion_cama oc ON oc.admision_id=a.id AND oc.periodo @> $2::timestamptz LEFT JOIN infra.espacio o ON o.id=oc.cama_id WHERE a.paciente_id=$1 AND a.estado IN ('pendiente_cama','hospitalizado') ORDER BY a.id LIMIT 1`, [patientId, this.clock.now()])).rows[0];
      const rows = (await c.query(`SELECT s.id,s.tomado_en AS "takenAt",s.tomado_por AS "takenBy",
        nullif(concat_ws(' ',p.nombres,p.apellidos),'') AS "takenByName",s.consulta_id AS "consultationId",s.admision_id AS "admissionId",
        s.pa_sistolica AS systolic,s.pa_diastolica AS diastolic,s.fc AS "heartRate",s.fr AS "respiratoryRate",s.temperatura AS temperature,
        s.sat_o2 AS "oxygenSaturation",s.peso_kg AS "weightKg",s.talla_cm AS "heightCm",s.dolor AS pain,s.glucemia_mg_dl AS "glucoseMgDl",s.nota AS note
        FROM atencion.signos_vitales s LEFT JOIN personal.persona p ON p.id=s.tomado_por
        WHERE s.paciente_id=$1 ORDER BY s.tomado_en DESC,s.id LIMIT $2`, [patientId, limit])).rows;
      await this.commands.audit(c, actor, { action: 'signos.leer', entity: 'signos_vitales', patientId, permission: 'signos.registrar', detail: { count: rows.length } });
      const today = this.clock.now().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' });
      const age = searchShowsBirth(actor) && patient.birth ? ageOn(patient.birth.slice(0, 10), today) : null;
      return { patientId, patientName: patient.name, record: patient.record, age, admissionId: stay?.admissionId ?? null, bed: stay?.bed || null, items: rows };
    });
  }

  async register(actor: Actor, patientId: string, dto: PatientVitalsDto, key?: string) {
    this.requireCare(actor);
    if (!MEASURES.some(m => dto[m] != null)) throw new BadRequestException('Registra al menos una medida.');
    if ((dto.systolic != null) !== (dto.diastolic != null)) throw new BadRequestException('La presión arterial necesita la sistólica y la diastólica.');
    if (dto.systolic != null && dto.diastolic != null && dto.systolic <= dto.diastolic) throw new BadRequestException('La presión sistólica debe ser mayor que la diastólica.');
    return this.commands.run(actor, `signos.registrar:paciente:${patientId}`, key, dto, async c => {
      await this.patient(c, patientId);
      if (dto.admissionId) {
        const admission = (await c.query('SELECT paciente_id FROM hospitalizacion.admision WHERE id=$1', [dto.admissionId])).rows[0];
        if (!admission || admission.paciente_id !== patientId) throw new BadRequestException('La admisión no pertenece al paciente.');
      }
      const row = (await c.query(`INSERT INTO atencion.signos_vitales(paciente_id,consulta_id,admision_id,tomado_por,pa_sistolica,pa_diastolica,fc,fr,temperatura,sat_o2,peso_kg,talla_cm,dolor,glucemia_mg_dl,nota)
        VALUES($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id,tomado_en AS "takenAt"`,
        [patientId, dto.admissionId ?? null, actor.staffId, dto.systolic ?? null, dto.diastolic ?? null, dto.heartRate ?? null, dto.respiratoryRate ?? null, dto.temperature ?? null,
          dto.oxygenSaturation ?? null, dto.weightKg ?? null, dto.heightCm ?? null, dto.pain ?? null, dto.glucoseMgDl ?? null, dto.note?.trim() || null])).rows[0];
      await this.commands.audit(c, actor, { action: 'signos.registrar', entity: 'signos_vitales', entityId: row.id, patientId, permission: 'signos.registrar', detail: { admissionId: dto.admissionId ?? null } });
      await this.commands.event(c, 'signos.registrados', 'paciente', patientId, 1, await channelsFor(c, ['signos.registrar', 'expediente.ver']));
      return row;
    });
  }
}
