using System.Text.Json;
using Climesa.Care.Contracts;
using Climesa.Identity.Contracts;
using Climesa.Platform.Audit;
using Climesa.Platform.Data;
using Climesa.Platform.Errors;
using Climesa.Platform.Messaging;
using Climesa.Platform.Security;
using Climesa.Platform.Time;
using Npgsql;

namespace Climesa.Care.Application;

public sealed record EmergencyArrival(Guid? PersonId, ProvisionalRegistration? Provisional, string ArrivalMode, DateTimeOffset? ArrivedAt);

public sealed record TriageInput(Guid EncounterId, int Level, int? SuggestedLevel, string Discriminator, string? BloodPressure, int? HeartRate, int? RespiratoryRate, decimal? Temperature, int? SpO2, int? Pain);

public sealed record BoardRow(Guid EncounterId, Guid PersonId, string Code, string? Mrn, int? Level, string? LevelName, string? Color, int WaitedMinutes,
    DateTimeOffset ArrivedAt, DateTimeOffset? LastTriageAt, bool ReassessmentOverdue, bool PhysicianTargetExceeded, bool SeenByPhysician, string Status);

public sealed record LocationRow(Guid LocationId, string UnitName, string Code, string Kind, string Status, bool CsspAuthorized, bool Operational,
    Guid? EpisodeId, Guid? PersonId, string? PatientCode, DateTimeOffset? Since);

public sealed record CensusView(IReadOnlyList<LocationRow> Locations, int Authorized, int Operational, int Occupied);

public sealed record PendingItem(string Description, string Owner);

public sealed record DischargeInput(Guid EpisodeId, string Type, DateTimeOffset? At, string? VoluntaryFormReference, string? Witness1, string? Witness2,
    string? RisksExplained, string? DestinationInstitution, string? ReceiverName, string? DeathCertifier, IReadOnlyList<PendingItem> PendingItems);

public sealed record EpisodeEventView(long Id, string Kind, DateTimeOffset ActAt, string Actor, string Payload, long? Cancels, string? Reason);

public sealed record EpisodeView(Guid Id, Guid PersonId, string Service, string Responsible, string Status, DateTimeOffset? AdmittedAt, DateTimeOffset? DischargeAt,
    string? DischargeType, string? DischargeSignedBy, DateTimeOffset? ExitAt, string? CurrentLocation, IReadOnlyList<EpisodeEventView> Events,
    IReadOnlyList<PendingItem> Continuity);

public sealed record CleaningView(Guid Id, Guid LocationId, string LocationCode, string Cleaner, DateTimeOffset StartedAt, DateTimeOffset EndedAt, string Items);

/// <summary>Care module application service (spec 002). Nothing here reads money: no economic rule can block care (FR-002).</summary>
public sealed class CareService(CommandRunner runner, IIdentityModule identity) : ICareQueries
{
    public const string ChecklistVersion = "MINSAL-AE941-v1";

    /// <summary>Terminal cleaning checklist items (Acuerdo 941 V.8; wording to validate with CLIMESA's infection control).</summary>
    public static readonly string[] ChecklistItems =
    [
        "Retiro de ropa de cama y desechos según clasificación",
        "Limpieza y desinfección de colchón y almohada",
        "Limpieza y desinfección de barandas, cabecera y pie de cama",
        "Limpieza y desinfección de mesa, timbre y superficies de alto contacto",
        "Limpieza de piso del área de la cama",
        "Reposición de insumos y tendido de cama limpia",
    ];

    private IClock Clock => runner.Clock;

    // ---------- Emergency (FR-001 to FR-007) ----------

    public async Task<Guid> RegisterEmergencyArrival(Actor actor, EmergencyArrival input, string? idempotencyKey)
    {
        if (!actor.Has("care.emergency.register"))
        {
            await runner.Denied(actor, "care.emergency.register", "encounter");
            throw new PermissionDenied("care.emergency.register");
        }
        var personId = input.PersonId;
        if (personId is null)
        {
            var provisional = input.Provisional ?? new ProvisionalRegistration(null, null, "unknown", null);
            var person = await identity.RegisterProvisional(actor, provisional, idempotencyKey is null ? null : $"{idempotencyKey}:person");
            personId = person.PersonId;
        }
        return await runner.Run(actor, "care.emergency.register", "care.arrival", idempotencyKey, new { personId, input.ArrivalMode, input.ArrivedAt }, async tx =>
        {
            var id = Guid.NewGuid();
            var arrivedAt = input.ArrivedAt ?? Clock.UtcNow;
            await tx.Exec("insert into care.encounters(id, person_id, class, status, arrival_mode, arrived_at) values (@id, @p, 'emergency', 'waiting', @m, @a)",
                ("id", id), ("p", personId), ("m", input.ArrivalMode), ("a", arrivedAt));
            await Clock_(tx, actor, id, "arrival", arrivedAt);
            await runner.Outbox.Enqueue(tx, CareEvents.EncounterCreated, "encounter", id.ToString(), new { encounterId = id, personId, @class = "emergency" }, actor.CorrelationId);
            await runner.Audit.Write(tx, actor, new AuditEntry("create", "encounter", id.ToString(), personId, "care.emergency.register"));
            return id;
        }, "encounter");
    }

    public Task<bool> RecordTriage(Actor actor, TriageInput t) =>
        runner.Run(actor, "emergency.triage", "care.triage", null, new { }, async tx =>
        {
            var enc = await tx.One("select person_id, status from care.encounters where id=@id for update", r => new { P = r.GetGuid(0), S = r.GetString(1) }, ("id", t.EncounterId))
                ?? throw new NotFoundError("atención");
            if (enc.S is "finished" or "cancelled")
            {
                throw new DomainError("encounter_closed", "La atención ya fue cerrada.");
            }
            var protocol = await ActiveProtocol(tx);
            var exists = await tx.Scalar<long>("select count(*) from care.triage_levels where protocol_code=@c and protocol_version=@v and level=@l",
                ("c", protocol.Code), ("v", protocol.Version), ("l", t.Level));
            if (exists == 0)
            {
                throw new DomainError("triage_level_invalid", "Nivel de triaje inexistente en el protocolo vigente.");
            }
            if (string.IsNullOrWhiteSpace(t.Discriminator))
            {
                throw new DomainError("triage_discriminator_required", "Registre el criterio o discriminador que justifica el nivel.");
            }
            var previous = await tx.Scalar<long>("select count(*) from care.triage_assessments where encounter_id=@e", ("e", t.EncounterId));
            var now = Clock.UtcNow;
            var vitals = JsonSerializer.Serialize(new { bp = t.BloodPressure, hr = t.HeartRate, rr = t.RespiratoryRate, temp = t.Temperature, spo2 = t.SpO2, pain = t.Pain });
            await tx.Exec("""
                insert into care.triage_assessments(id, encounter_id, protocol_code, protocol_version, level, suggested_level, discriminator, vitals, actor_username, act_at, captured_at)
                values (@id, @e, @c, @v, @l, @sl, @d, @vit::jsonb, @u, @at, @now)
                """,
                ("id", Guid.NewGuid()), ("e", t.EncounterId), ("c", protocol.Code), ("v", protocol.Version), ("l", t.Level), ("sl", t.SuggestedLevel),
                ("d", t.Discriminator), ("vit", vitals), ("u", actor.Username), ("at", now), ("now", now));
            await Clock_(tx, actor, t.EncounterId, previous == 0 ? "triage" : "reassessment", now);
            await runner.Outbox.Enqueue(tx, CareEvents.TriageRecorded, "encounter", t.EncounterId.ToString(), new { t.EncounterId, t.Level }, actor.CorrelationId);
            await runner.Audit.Write(tx, actor, new AuditEntry("update", "encounter", t.EncounterId.ToString(), enc.P, "emergency.triage", Detail: new { level = t.Level, reassessment = previous > 0 }));
            return true;
        }, "encounter");

    public Task<bool> RecordFirstPhysicianContact(Actor actor, Guid encounterId) =>
        runner.Run(actor, "care.encounter.physician", "care.clock", null, new { }, async tx =>
        {
            var person = await tx.Scalar<Guid>("update care.encounters set status='in_progress' where id=@id and status in ('waiting','arrived') returning person_id", ("id", encounterId));
            if (person == Guid.Empty)
            {
                throw new DomainError("encounter_not_waiting", "La atención no está en espera.");
            }
            await Clock_(tx, actor, encounterId, "first_physician", Clock.UtcNow);
            await runner.Audit.Write(tx, actor, new AuditEntry("update", "encounter", encounterId.ToString(), person, "care.encounter.physician"));
            return true;
        }, "encounter");

    /// <summary>Board ordered by level then wait; public projection uses a code, not names (FR-005, FR-007).</summary>
    public Task<IReadOnlyList<BoardRow>> EmergencyBoard(Actor actor) =>
        runner.Query<IReadOnlyList<BoardRow>>(actor, "care.view.emergency", "emergency_board", async tx =>
        {
            var now = Clock.UtcNow;
            var rows = await tx.Query("""
                select e.id, e.person_id, e.arrived_at, e.status,
                       t.level, l.name, l.color, l.target_minutes_to_physician, l.reassessment_minutes, t.act_at as triage_at,
                       exists(select 1 from care.encounter_clocks c where c.encounter_id = e.id and c.kind = 'first_physician') as seen
                from care.encounters e
                left join lateral (select * from care.triage_assessments x where x.encounter_id = e.id order by x.act_at desc limit 1) t on true
                left join care.triage_levels l on l.protocol_code = t.protocol_code and l.protocol_version = t.protocol_version and l.level = t.level
                where e.class = 'emergency' and e.status in ('arrived','waiting','in_progress')
                """,
                r => new
                {
                    Id = r.GetGuid(0), Person = r.GetGuid(1), Arrived = r.GetFieldValue<DateTimeOffset>(2), Status = r.GetString(3), Level = r.Get<int?>("level"),
                    Name = r.Str("name"), Color = r.Str("color"), Target = r.Get<int?>("target_minutes_to_physician"), Reassess = r.Get<int?>("reassessment_minutes"),
                    TriageAt = r.Get<DateTimeOffset?>("triage_at"), Seen = r.GetBoolean(10),
                });
            var mrns = await MrnLookup(rows.Select(r => r.Person));
            var list = rows.Select(r =>
            {
                var waited = (int)(now - r.Arrived).TotalMinutes;
                var overdue = r.TriageAt is null ? waited > 10 : r.Reassess is not null && !r.Seen && (now - r.TriageAt.Value).TotalMinutes > r.Reassess;
                var targetExceeded = r.Target is not null && !r.Seen && waited > r.Target;
                var code = $"E-{r.Id.ToString("N")[..4].ToUpperInvariant()}";
                return new BoardRow(r.Id, r.Person, code, mrns.GetValueOrDefault(r.Person), r.Level, r.Name, r.Color, waited, r.Arrived, r.TriageAt, overdue, targetExceeded, r.Seen, r.Status);
            })
            .OrderBy(r => r.Level ?? 0)
            .ThenByDescending(r => r.WaitedMinutes)
            .ToList();
            await runner.Audit.Write(tx, actor, new AuditEntry("read", "emergency_board", Permission: "care.view.emergency", Detail: new { rows = list.Count }));
            return list;
        });

    // ---------- Admission and beds (FR-008, FR-016 to FR-019) ----------

    public Task<Guid> Admit(Actor actor, Guid personId, Guid? fromEncounterId, Guid locationId, string service, string responsibleClinician, string? idempotencyKey) =>
        runner.Run(actor, "care.admission.accept", "care.admit", idempotencyKey, new { personId, fromEncounterId, locationId, service }, async tx =>
        {
            var active = await tx.Scalar<long>("select count(*) from care.episodes where person_id=@p and status in ('active','medical_discharge_signed')", ("p", personId));
            if (active > 0)
            {
                throw new DomainError("episode_already_active", "El paciente ya tiene un episodio hospitalario activo.");
            }
            var loc = await tx.One("select status, exclusive, cssp_authorized, operational, code from care.locations where id=@id for update",
                r => new { Status = r.GetString(0), Exclusive = r.GetBoolean(1), Cssp = r.GetBoolean(2), Op = r.GetBoolean(3), Code = r.GetString(4) }, ("id", locationId))
                ?? throw new NotFoundError("cama");
            if (loc.Status != "available" || !loc.Op)
            {
                throw new ConflictError("location_unavailable", $"La cama {loc.Code} no está disponible (estado: {StatusEs(loc.Status)}).");
            }
            var id = Guid.NewGuid();
            var now = Clock.UtcNow;
            await tx.Exec("""
                insert into care.episodes(id, person_id, origin, service, responsible_clinician, status, admitted_at)
                values (@id, @p, @o, @s, @r, 'active', @now)
                """, ("id", id), ("p", personId), ("o", fromEncounterId is null ? "direct" : "emergency"), ("s", service), ("r", responsibleClinician), ("now", now));
            try
            {
                await tx.Exec("insert into care.location_segments(id, episode_id, location_id, kind, period, exclusive) values (@id, @e, @l, 'occupancy', tstzrange(@from, null), @x)",
                    ("id", Guid.NewGuid()), ("e", id), ("l", locationId), ("from", now), ("x", loc.Exclusive));
            }
            catch (PostgresException ex) when (ex.SqlState == PgErrors.ExclusionViolation)
            {
                throw new ConflictError("location_conflict", $"La cama {loc.Code} acaba de ser asignada a otro paciente.");
            }
            await SetLocationStatus(tx, actor, locationId, loc.Status, "occupied", "ingreso");
            await Event(tx, actor, id, "admitted", now, new { locationId, location = loc.Code, service, responsibleClinician, fromEncounterId });
            if (fromEncounterId is not null)
            {
                await tx.Exec("update care.encounters set status='finished', ended_at=@t, disposition='admitted', episode_id=@e where id=@id", ("t", now), ("e", id), ("id", fromEncounterId));
                await Clock_(tx, actor, fromEncounterId.Value, "disposition", now);
            }
            await runner.Outbox.Enqueue(tx, CareEvents.PatientAdmitted, "episode", id.ToString(), new { episodeId = id, personId, locationId, at = now }, actor.CorrelationId);
            await runner.Audit.Write(tx, actor, new AuditEntry("create", "episode", id.ToString(), personId, "care.admission.accept", Detail: new { location = loc.Code }));
            return id;
        }, "episode");

    /// <summary>FR-009 to FR-011, FR-027: medical discharge is its own milestone with type-specific requirements.</summary>
    public Task<bool> SignMedicalDischarge(Actor actor, DischargeInput d) =>
        runner.Run(actor, "care.discharge.sign", "care.discharge", null, new { }, async tx =>
        {
            var at = d.At ?? Clock.UtcNow;
            actor.RequireLicensed("care.discharge.sign", LocalTime.LocalDate(at));
            var ep = await tx.One("select person_id, status from care.episodes where id=@id for update", r => new { P = r.GetGuid(0), S = r.GetString(1) }, ("id", d.EpisodeId))
                ?? throw new NotFoundError("episodio");
            if (ep.S != "active")
            {
                throw new DomainError("episode_not_active", "Solo un episodio activo puede recibir alta médica.");
            }
            switch (d.Type)
            {
                case "medical":
                    break;
                case "voluntary":
                    var hasForm = !string.IsNullOrWhiteSpace(d.VoluntaryFormReference);
                    var hasWitnesses = !string.IsNullOrWhiteSpace(d.Witness1) && !string.IsNullOrWhiteSpace(d.Witness2);
                    if (string.IsNullOrWhiteSpace(d.RisksExplained) || (!hasForm && !hasWitnesses))
                    {
                        throw new DomainError("voluntary_requirements", "Alta voluntaria: registre los riesgos explicados y el formulario firmado o, si el paciente se niega a firmar, dos testigos (LDDPPSS Art. 9 k, 27 e).");
                    }
                    break;
                case "referred":
                    if (string.IsNullOrWhiteSpace(d.DestinationInstitution) || string.IsNullOrWhiteSpace(d.ReceiverName))
                    {
                        throw new DomainError("referral_requirements", "Alta por referencia: registre institución de destino y nombre de quien acepta.");
                    }
                    break;
                case "death":
                    if (string.IsNullOrWhiteSpace(d.DeathCertifier))
                    {
                        throw new DomainError("death_requirements", "Fallecimiento: registre el médico que certifica.");
                    }
                    break;
                case "abandonment":
                    break;
                default:
                    throw new DomainError("discharge_type_invalid", "Tipo de egreso inválido.");
            }
            if (d.PendingItems.Any(p => string.IsNullOrWhiteSpace(p.Owner)))
            {
                throw new DomainError("continuity_owner_required", "Cada pendiente (resultados, citas, tareas) necesita un responsable antes del alta.");
            }
            foreach (var p in d.PendingItems.Where(p => !string.IsNullOrWhiteSpace(p.Description)))
            {
                await tx.Exec("insert into care.continuity_items(id, episode_id, description, owner, created_at) values (@id,@e,@d,@o,@t)",
                    ("id", Guid.NewGuid()), ("e", d.EpisodeId), ("d", p.Description), ("o", p.Owner), ("t", Clock.UtcNow));
            }
            await tx.Exec("update care.episodes set status='medical_discharge_signed', medical_discharge_at=@t, discharge_type=@type, discharge_signed_by=@u, version=version+1 where id=@id",
                ("t", at), ("type", d.Type), ("u", $"{actor.DisplayName} ({actor.ProfessionalBoard} {actor.ProfessionalNumber})"), ("id", d.EpisodeId));
            await Event(tx, actor, d.EpisodeId, "medical_discharge_signed", at, new
            {
                type = d.Type, d.VoluntaryFormReference, d.Witness1, d.Witness2, d.RisksExplained, d.DestinationInstitution, d.ReceiverName, d.DeathCertifier,
                license = $"{actor.ProfessionalBoard} {actor.ProfessionalNumber}",
            });
            await runner.Outbox.Enqueue(tx, CareEvents.MedicalDischargeSigned, "episode", d.EpisodeId.ToString(), new { episodeId = d.EpisodeId, at, type = d.Type }, actor.CorrelationId);
            await runner.Audit.Write(tx, actor, new AuditEntry("update", "episode", d.EpisodeId.ToString(), ep.P, "care.discharge.sign", Detail: new { type = d.Type }));
            return true;
        }, "episode");

    public Task<bool> RevokeMedicalDischarge(Actor actor, Guid episodeId, string reason) =>
        runner.Run(actor, "care.discharge.sign", "care.discharge.revoke", null, new { }, async tx =>
        {
            if (string.IsNullOrWhiteSpace(reason))
            {
                throw new DomainError("reason_required", "La revocación requiere motivo.");
            }
            var person = await tx.Scalar<Guid>("update care.episodes set status='active', medical_discharge_at=null, discharge_type=null, discharge_signed_by=null, version=version+1 where id=@id and status='medical_discharge_signed' returning person_id", ("id", episodeId));
            if (person == Guid.Empty)
            {
                throw new DomainError("not_discharged", "Solo se revoca un alta firmada antes de la salida física.");
            }
            var original = await tx.Scalar<long>("select id from care.episode_events where episode_id=@e and kind='medical_discharge_signed' order by id desc limit 1", ("e", episodeId));
            var now = Clock.UtcNow;
            await tx.Exec("insert into care.episode_events(episode_id, kind, act_at, captured_at, actor_username, cancels_event_id, reason) values (@e,'medical_discharge_revoked',@t,@t,@u,@c,@r)",
                ("e", episodeId), ("t", now), ("u", actor.Username), ("c", original), ("r", reason));
            await runner.Outbox.Enqueue(tx, CareEvents.MedicalDischargeRevoked, "episode", episodeId.ToString(), new { episodeId, at = now }, actor.CorrelationId);
            await runner.Audit.Write(tx, actor, new AuditEntry("update", "episode", episodeId.ToString(), person, "care.discharge.sign", Detail: new { revoked = true }));
            return true;
        }, "episode");

    /// <summary>Physical exit closes the segment and sends the bed to cleaning, never straight to available (FR-018).</summary>
    public Task<bool> RecordPhysicalExit(Actor actor, Guid episodeId) =>
        runner.Run(actor, "care.exit.record", "care.exit", null, new { }, async tx =>
        {
            var ep = await tx.One("select person_id, status from care.episodes where id=@id for update", r => new { P = r.GetGuid(0), S = r.GetString(1) }, ("id", episodeId))
                ?? throw new NotFoundError("episodio");
            if (ep.S != "medical_discharge_signed")
            {
                throw new DomainError("discharge_required", "Registre primero el alta firmada por el médico.");
            }
            var now = Clock.UtcNow;
            var seg = await tx.One("select id, location_id from care.location_segments where episode_id=@e and kind='occupancy' and not cancelled and upper_inf(period) for update",
                r => new { Id = r.GetGuid(0), Loc = r.GetGuid(1) }, ("e", episodeId));
            if (seg is not null)
            {
                await tx.Exec("update care.location_segments set period = tstzrange(lower(period), @t) where id=@id", ("t", now), ("id", seg.Id));
                await SetLocationStatus(tx, actor, seg.Loc, "occupied", "pending_cleaning", "salida del paciente");
            }
            await tx.Exec("update care.episodes set status='physically_exited', physical_exit_at=@t, version=version+1 where id=@id", ("t", now), ("id", episodeId));
            await Event(tx, actor, episodeId, "physical_exit", now, new { });
            await runner.Outbox.Enqueue(tx, CareEvents.PhysicalExitRecorded, "episode", episodeId.ToString(), new { episodeId, at = now }, actor.CorrelationId);
            await runner.Audit.Write(tx, actor, new AuditEntry("update", "episode", episodeId.ToString(), ep.P, "care.exit.record"));
            return true;
        }, "episode");

    // ---------- Cleaning (FR-019) ----------

    public Task<Guid> RegisterCleaning(Actor actor, Guid locationId, IReadOnlyList<bool> items, DateTimeOffset startedAt, DateTimeOffset endedAt) =>
        runner.Run(actor, "care.cleaning.register", "care.cleaning", null, new { }, async tx =>
        {
            if (items.Count != ChecklistItems.Length)
            {
                throw new DomainError("checklist_incomplete", "Responda todos los puntos de la lista de verificación.");
            }
            if (endedAt <= startedAt)
            {
                throw new DomainError("cleaning_times", "La hora de fin debe ser posterior a la de inicio.");
            }
            if (endedAt > Clock.UtcNow.AddMinutes(5))
            {
                throw new DomainError("cleaning_in_future", "La limpieza no puede registrarse con una hora de fin futura.");
            }
            var status = await tx.Scalar<string>("select status from care.locations where id=@id for update", ("id", locationId)) ?? throw new NotFoundError("cama");
            if (status != "pending_cleaning")
            {
                throw new DomainError("location_not_pending_cleaning", "La cama no está pendiente de limpieza.");
            }
            var id = Guid.NewGuid();
            var payload = JsonSerializer.Serialize(ChecklistItems.Select((text, i) => new { item = text, done = items[i] }));
            await tx.Exec("""
                insert into care.cleaning_records(id, location_id, checklist_version, items, cleaner_username, started_at, ended_at)
                values (@id, @l, @v, @i::jsonb, @u, @s, @e)
                """, ("id", id), ("l", locationId), ("v", ChecklistVersion), ("i", payload), ("u", actor.Username), ("s", startedAt), ("e", endedAt));
            await SetLocationStatus(tx, actor, locationId, "pending_cleaning", "cleaning", "limpieza terminal registrada");
            await runner.Audit.Write(tx, actor, new AuditEntry("create", "cleaning_record", id.ToString(), Permission: "care.cleaning.register"));
            return id;
        }, "cleaning_record");

    public Task<bool> SignCleaning(Actor actor, Guid cleaningId) =>
        runner.Run(actor, "care.cleaning.sign", "care.cleaning.sign", null, new { }, async tx =>
        {
            var rec = await tx.One("select location_id, cleaner_username, items::text, signed_at from care.cleaning_records where id=@id for update",
                r => new { Loc = r.GetGuid(0), Cleaner = r.GetString(1), Items = r.GetString(2), Signed = r.Get<DateTimeOffset?>("signed_at") }, ("id", cleaningId))
                ?? throw new NotFoundError("registro de limpieza");
            if (rec.Signed is not null)
            {
                throw new DomainError("already_signed", "La limpieza ya fue firmada.");
            }
            if (rec.Cleaner == actor.Username)
            {
                throw new DomainError("signer_must_differ", "Quien firma la liberación debe ser distinto de quien limpió (jefe de área, Acuerdo 941 V.8.2).");
            }
            using var doc = JsonDocument.Parse(rec.Items);
            var missing = doc.RootElement.EnumerateArray().Where(e => !e.GetProperty("done").GetBoolean()).Select(e => e.GetProperty("item").GetString()).ToList();
            if (missing.Count > 0)
            {
                throw new DomainError("checklist_not_complete", $"No se puede liberar la cama; faltan: {string.Join("; ", missing)}.");
            }
            await tx.Exec("update care.cleaning_records set signer_username=@u, signed_at=@t where id=@id", ("u", actor.Username), ("t", Clock.UtcNow), ("id", cleaningId));
            await SetLocationStatus(tx, actor, rec.Loc, "cleaning", "available", "limpieza firmada");
            await runner.Audit.Write(tx, actor, new AuditEntry("update", "cleaning_record", cleaningId.ToString(), Permission: "care.cleaning.sign"));
            return true;
        }, "cleaning_record");

    public Task<IReadOnlyList<CleaningView>> PendingCleaningSignatures(Actor actor) =>
        runner.Query<IReadOnlyList<CleaningView>>(actor, "care.view.beds", "cleaning_record", async tx =>
            await tx.Query("""
                select c.id, c.location_id, l.code, c.cleaner_username, c.started_at, c.ended_at, c.items::text
                from care.cleaning_records c join care.locations l on l.id = c.location_id where c.signed_at is null order by c.ended_at
                """, r => new CleaningView(r.GetGuid(0), r.GetGuid(1), r.GetString(2), r.GetString(3), r.GetFieldValue<DateTimeOffset>(4), r.GetFieldValue<DateTimeOffset>(5), r.GetString(6))));

    public Task<bool> SetBlocked(Actor actor, Guid locationId, bool blocked, string reason) =>
        runner.Run(actor, "care.location.admin", "care.block", null, new { }, async tx =>
        {
            var status = await tx.Scalar<string>("select status from care.locations where id=@id for update", ("id", locationId)) ?? throw new NotFoundError("cama");
            if (blocked && status != "available")
            {
                throw new DomainError("cannot_block", "Solo se bloquea una cama disponible.");
            }
            if (!blocked && status != "blocked")
            {
                throw new DomainError("not_blocked", "La cama no está bloqueada.");
            }
            await SetLocationStatus(tx, actor, locationId, status, blocked ? "blocked" : "available", reason);
            return true;
        }, "location");

    // ---------- Census and episode views (FR-029) ----------

    public Task<CensusView> Census(Actor actor) =>
        runner.Query(actor, "care.view.beds", "census", async tx =>
        {
            var rows = await tx.Query("""
                select l.id, u.name, l.code, l.kind, l.status, l.cssp_authorized, l.operational, s.episode_id, e.person_id, lower(s.period) as since
                from care.locations l join care.units u on u.id = l.unit_id
                left join care.location_segments s on s.location_id = l.id and s.kind = 'occupancy' and not s.cancelled and upper_inf(s.period)
                left join care.episodes e on e.id = s.episode_id
                order by u.name, l.code
                """,
                r => new LocationRow(r.GetGuid(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4), r.GetBoolean(5), r.GetBoolean(6),
                    r.Get<Guid?>("episode_id"), r.Get<Guid?>("person_id"), null, r.Get<DateTimeOffset?>("since")));
            var codes = await MrnLookup(rows.Where(x => x.PersonId is not null).Select(x => x.PersonId!.Value));
            rows = [.. rows.Select(x => x.PersonId is null ? x : x with { PatientCode = codes.GetValueOrDefault(x.PersonId.Value) })];
            await runner.Audit.Write(tx, actor, new AuditEntry("read", "census", Permission: "care.view.beds",
                Detail: new { patients = rows.Where(x => x.PersonId is not null).Select(x => x.PersonId).ToArray() }));
            var beds = rows.Where(r => r.Kind == "bed").ToList();
            return new CensusView(rows, beds.Count(r => r.CsspAuthorized), beds.Count(r => r.Operational && r.Status != "blocked"), beds.Count(r => r.Status == "occupied"));
        });

    public Task<EpisodeView> Episode(Actor actor, Guid episodeId) =>
        runner.Query(actor, "care.view.episode", "episode", async tx =>
        {
            var ep = await tx.One("""
                select id, person_id, service, responsible_clinician, status, admitted_at, medical_discharge_at, discharge_type, discharge_signed_by, physical_exit_at,
                  (select l.code from care.location_segments s join care.locations l on l.id = s.location_id where s.episode_id = e.id and s.kind='occupancy' and not s.cancelled order by lower(s.period) desc limit 1) as loc
                from care.episodes e where id=@id
                """,
                r => new
                {
                    Id = r.GetGuid(0), P = r.GetGuid(1), S = r.GetString(2), R = r.GetString(3), St = r.GetString(4), A = r.Get<DateTimeOffset?>("admitted_at"),
                    D = r.Get<DateTimeOffset?>("medical_discharge_at"), T = r.Str("discharge_type"), By = r.Str("discharge_signed_by"), X = r.Get<DateTimeOffset?>("physical_exit_at"), L = r.Str("loc"),
                }, ("id", episodeId)) ?? throw new NotFoundError("episodio");
            var events = await tx.Query("select id, kind, act_at, actor_username, payload::text, cancels_event_id, reason from care.episode_events where episode_id=@e order by id",
                r => new EpisodeEventView(r.GetInt64(0), r.GetString(1), r.GetFieldValue<DateTimeOffset>(2), r.GetString(3), r.GetString(4), r.Get<long?>("cancels_event_id"), r.Str("reason")),
                ("e", episodeId));
            var items = await tx.Query("select description, owner from care.continuity_items where episode_id=@e", r => new PendingItem(r.GetString(0), r.GetString(1)), ("e", episodeId));
            await runner.Audit.Write(tx, actor, new AuditEntry("read", "episode", episodeId.ToString(), ep.P, "care.view.episode"));
            return new EpisodeView(ep.Id, ep.P, ep.S, ep.R, ep.St, ep.A, ep.D, ep.T, ep.By, ep.X, ep.L, events, items);
        });

    public Task<IReadOnlyList<(Guid EpisodeId, Guid PersonId, string Status, string? Location, DateTimeOffset? AdmittedAt)>> ActiveEpisodes(Actor actor) =>
        runner.Query<IReadOnlyList<(Guid, Guid, string, string?, DateTimeOffset?)>>(actor, "care.view.episode", "episode", async tx =>
            await tx.Query("""
                select e.id, e.person_id, e.status,
                  (select l.code from care.location_segments s join care.locations l on l.id = s.location_id where s.episode_id = e.id and s.kind='occupancy' and not s.cancelled order by lower(s.period) desc limit 1),
                  e.admitted_at
                from care.episodes e where e.status in ('active','medical_discharge_signed') order by e.admitted_at
                """, r => (r.GetGuid(0), r.GetGuid(1), r.GetString(2), r.IsDBNull(3) ? null : r.GetString(3), r.Get<DateTimeOffset?>("admitted_at"))));

    public Task<IReadOnlyList<(Guid Id, string Code, string Unit)>> AvailableBeds(Actor actor) =>
        runner.Query<IReadOnlyList<(Guid, string, string)>>(actor, "care.view.beds", "location", async tx =>
            await tx.Query("select l.id, l.code, u.name from care.locations l join care.units u on u.id = l.unit_id where l.status='available' and l.operational and l.kind='bed' order by l.code",
                r => (r.GetGuid(0), r.GetString(1), r.GetString(2))));

    public async Task<ActiveEpisode?> ActiveEpisodeFor(Guid personId) =>
        await runner.Db.InTx(tx => tx.One("""
            select e.id, e.person_id, coalesce((select l.code from care.location_segments s join care.locations l on l.id = s.location_id where s.episode_id = e.id and upper_inf(s.period) limit 1), ''), e.status, e.admitted_at
            from care.episodes e where e.person_id=@p and e.status in ('active','medical_discharge_signed') limit 1
            """, r => new ActiveEpisode(r.GetGuid(0), r.GetGuid(1), r.GetString(2), r.GetString(3), r.Get<DateTimeOffset?>("admitted_at")), ("p", personId)));

    // ---------- Internals ----------

    /// <summary>Display codes come from the Identity module contract, never from its tables (module boundary).</summary>
    private async Task<Dictionary<Guid, string>> MrnLookup(IEnumerable<Guid> personIds)
    {
        var map = new Dictionary<Guid, string>();
        foreach (var id in personIds.Distinct())
        {
            var s = await identity.GetSummary(id);
            if (s is not null)
            {
                map[id] = s.Mrn;
            }
        }
        return map;
    }

    private static async Task<(string Code, string Version)> ActiveProtocol(DbTx tx)
    {
        var row = await tx.One("select code, version from care.triage_protocols order by clinical_use_approved desc, version desc limit 1", r => new { C = r.GetString(0), V = r.GetString(1) })
            ?? throw new DomainError("triage_protocol_missing", "No hay protocolo de triaje configurado.");
        return (row.C, row.V);
    }

    private Task Clock_(DbTx tx, Actor actor, Guid encounterId, string kind, DateTimeOffset at) =>
        tx.Exec("insert into care.encounter_clocks(encounter_id, kind, act_at, captured_at, actor_username) values (@e,@k,@a,@c,@u)",
            ("e", encounterId), ("k", kind), ("a", at), ("c", Clock.UtcNow), ("u", actor.Username));

    private Task Event(DbTx tx, Actor actor, Guid episodeId, string kind, DateTimeOffset at, object payload) =>
        tx.Exec("insert into care.episode_events(episode_id, kind, act_at, captured_at, actor_username, payload) values (@e,@k,@a,@c,@u,@p::jsonb)",
            ("e", episodeId), ("k", kind), ("a", at), ("c", Clock.UtcNow), ("u", actor.Username), ("p", JsonSerializer.Serialize(payload)));

    private async Task SetLocationStatus(DbTx tx, Actor actor, Guid locationId, string from, string to, string reason)
    {
        var changed = await tx.Exec("update care.locations set status=@to, version=version+1 where id=@id and status=@from", ("to", to), ("id", locationId), ("from", from));
        if (changed != 1)
        {
            throw new ConflictError("location_state_changed", "El estado de la cama cambió mientras se procesaba. Recargue.");
        }
        await tx.Exec("insert into care.location_status_events(location_id, from_status, to_status, at, actor_username, reason) values (@l,@f,@t,@a,@u,@r)",
            ("l", locationId), ("f", from), ("t", to), ("a", Clock.UtcNow), ("u", actor.Username), ("r", reason));
        await runner.Outbox.Enqueue(tx, CareEvents.LocationStatusChanged, "location", locationId.ToString(), new { locationId, from, to }, actor.CorrelationId);
    }

    public static string StatusEs(string status) => status switch
    {
        "available" => "disponible",
        "reserved" => "reservada",
        "occupied" => "ocupada",
        "pending_cleaning" => "pendiente de limpieza",
        "cleaning" => "limpieza por firmar",
        "blocked" => "bloqueada",
        _ => status,
    };
}
