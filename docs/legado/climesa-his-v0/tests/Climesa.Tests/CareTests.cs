using Climesa.Care.Application;
using Climesa.Identity.Contracts;
using Climesa.Platform.Data;
using Climesa.Platform.Errors;
using Climesa.Platform.Security;
using Npgsql;

namespace Climesa.Tests;

public static class CareTests
{
    private static async Task<Guid> Bed(TestHost h, string code) =>
        await h.Db.InTx(tx => tx.Scalar<Guid>("select id from care.locations where code=@c", ("c", code)));

    private static async Task<(Guid Person, Guid Encounter)> Arrival(TestHost h)
    {
        var enc = await h.Care.RegisterEmergencyArrival(TestHost.Everything("enfermeria-test"), new EmergencyArrival(null, new ProvisionalRegistration("adulto", null, "male", 40), "Ambulancia", null), null);
        var person = await h.Db.InTx(tx => tx.Scalar<Guid>("select person_id from care.encounters where id=@id", ("id", enc)));
        return (person, enc);
    }

    private static DischargeInput Medical(Guid episode) => new(episode, "medical", null, null, null, null, null, null, null, null, []);

    [Test("002 FR-001, FR-002")]
    public static async Task EmergencyArrivalNeedsNothingEconomic()
    {
        var h = new TestHost();
        var (person, enc) = await Arrival(h);
        var summary = await h.Identity.GetSummary(person);
        Assert.Equal("provisional", summary!.Status, "identidad provisional creada");
        var status = await h.Db.InTx(tx => tx.Scalar<string>("select status from care.encounters where id=@id", ("id", enc)));
        Assert.Equal("waiting", status, "en espera");
        var clocks = await h.Db.InTx(tx => tx.Scalar<long>("select count(*) from care.encounter_clocks where encounter_id=@id and kind='arrival'", ("id", enc)));
        Assert.Equal(1L, clocks, "reloj de llegada");
    }

    [Test("002 FR-006")]
    public static async Task RetriedArrivalReturnsSameEncounter()
    {
        var h = new TestHost();
        var actor = TestHost.Everything("reintento");
        var input = new EmergencyArrival(null, new ProvisionalRegistration("x", null, null, null), "Ambulancia", h.Clock.UtcNow);
        var a = await h.Care.RegisterEmergencyArrival(actor, input, "arrival-key-1");
        var b = await h.Care.RegisterEmergencyArrival(actor, input, "arrival-key-1");
        Assert.Equal(a, b, "misma atención");
    }

    [Test("002 FR-004")]
    public static async Task ReceptionCannotTriage()
    {
        var h = new TestHost();
        var (_, enc) = await Arrival(h);
        var reception = TestHost.ActorWith("recepcion", "care.emergency.register", "care.view.emergency");
        await Assert.Throws<PermissionDenied>(() => h.Care.RecordTriage(reception, new TriageInput(enc, 5, null, "quiere irse rápido", null, null, null, null, null, null)), "recepción");
        await h.Care.RecordTriage(TestHost.Everything(), new TriageInput(enc, 2, null, "dolor torácico", "150/90", 110, 22, 37m, 93, 8));
        await h.Care.RecordTriage(TestHost.Everything(), new TriageInput(enc, 3, null, "mejora tras analgesia", null, 92, 18, null, 97, 3));
        var kinds = await h.Db.InTx(tx => tx.Query("select kind from care.encounter_clocks where encounter_id=@e order by id", r => r.GetString(0), ("e", enc)));
        Assert.True(kinds.Contains("triage") && kinds.Contains("reassessment"), "triaje y reevaluación como registros separados");
    }

    [Test("002 FR-005")]
    public static async Task BoardFlagsOverdueReassessment()
    {
        var h = new TestHost();
        var (_, enc) = await Arrival(h);
        await h.Care.RecordTriage(TestHost.Everything(), new TriageInput(enc, 3, null, "fiebre", null, null, null, 39.2m, 96, 4));
        h.Clock.Advance(TimeSpan.FromMinutes(31));
        var row = (await h.Care.EmergencyBoard(TestHost.Everything())).Single(r => r.EncounterId == enc);
        Assert.True(row.ReassessmentOverdue, "reevaluación vencida a los 31 minutos para nivel 3 (30 min en el protocolo de demostración)");
        Assert.True(row.Code.StartsWith("E-", StringComparison.Ordinal), "código en lugar de nombre");
    }

    [Test("002 FR-017")]
    public static async Task DatabaseRejectsOverlappingOccupancy()
    {
        var h = new TestHost();
        var bed = await Bed(h, "CI-301");
        var (p1, _) = await Arrival(h);
        var (p2, _) = await Arrival(h);
        var results = await Task.WhenAll(
            Capture(() => h.Care.Admit(TestHost.Everything("medico-a"), p1, null, bed, "Cirugía", "Dr. A", null)),
            Capture(() => h.Care.Admit(TestHost.Everything("medico-b"), p2, null, bed, "Cirugía", "Dr. B", null)));
        Assert.Equal(1, results.Count(r => r is null), "un ingreso exitoso");
        var code = results.Single(r => r is not null)!.Code;
        Assert.True(code is "location_unavailable" or "location_conflict", "el otro recibe conflicto de cama: " + code);

        // Even bypassing the application, the exclusion constraint stops a second overlapping segment.
        var episode = await h.Db.InTx(tx => tx.Scalar<Guid>("select episode_id from care.location_segments where location_id=@l limit 1", ("l", bed)));
        var ex = await Assert.Throws<PostgresException>(() => h.Db.InTx(tx => tx.Exec(
            "insert into care.location_segments(id, episode_id, location_id, kind, period, exclusive) values (gen_random_uuid(), @e, @l, 'occupancy', tstzrange(now(), null), true)",
            ("e", episode), ("l", bed))), "inserción directa superpuesta");
        Assert.Equal(PgErrors.ExclusionViolation, ex.SqlState, "restricción de exclusión");
    }

    private static async Task<DomainError?> Capture(Func<Task> action)
    {
        try
        {
            await action();
            return null;
        }
        catch (DomainError e)
        {
            return e;
        }
    }

    [Test("002 FR-009, FR-010, FR-018, FR-019")]
    public static async Task DischargeExitAndCleaningLifecycle()
    {
        var h = new TestHost();
        var bed = await Bed(h, "MI-202");
        var (person, enc) = await Arrival(h);
        var episode = await h.Care.Admit(TestHost.Everything(), person, enc, bed, "Medicina interna", "Dr. Test", null);
        h.Clock.Advance(TimeSpan.FromHours(30));
        await h.Care.SignMedicalDischarge(TestHost.Everything("medico-alta"), Medical(episode));
        var dischargeAt = h.Clock.UtcNow;
        h.Clock.Advance(TimeSpan.FromHours(7));
        await h.Care.RecordPhysicalExit(TestHost.Everything(), episode);
        var times = await h.Db.InTx(tx => tx.One("select medical_discharge_at, physical_exit_at from care.episodes where id=@id",
            r => new { D = r.GetFieldValue<DateTimeOffset>(0), X = r.GetFieldValue<DateTimeOffset>(1) }, ("id", episode)));
        Assert.Equal(dischargeAt, times!.D, "instante del alta firmada");
        Assert.True(times.X - times.D == TimeSpan.FromHours(7), "salida física registrada aparte");
        var evt = await h.Db.InTx(tx => tx.Scalar<string>("select payload::text from platform.outbox where event_type='MedicalDischargeSigned' and aggregate_id=@a", ("a", episode.ToString())));
        Assert.True(evt is not null, "evento de alta publicado para facturación");

        Assert.Equal("pending_cleaning", await Status(h, bed), "la cama va a limpieza, no a disponible");
        var cleaner = TestHost.ActorWith("limpieza-test", "care.cleaning.register", "care.cleaning.sign");
        await Assert.Fails(() => h.Care.RegisterCleaning(cleaner, bed, [true, true], h.Clock.UtcNow.AddMinutes(-30), h.Clock.UtcNow), "checklist_incomplete", "lista incompleta");
        var allDone = Enumerable.Repeat(true, CareService.ChecklistItems.Length).ToList();
        await Assert.Fails(() => h.Care.RegisterCleaning(cleaner, bed, allDone, h.Clock.UtcNow, h.Clock.UtcNow.AddHours(1)), "cleaning_in_future", "hora de fin futura");
        var cleaning = await h.Care.RegisterCleaning(cleaner, bed, allDone, h.Clock.UtcNow.AddMinutes(-30), h.Clock.UtcNow);
        Assert.Equal("cleaning", await Status(h, bed), "limpieza por firmar");
        await Assert.Fails(() => h.Care.SignCleaning(cleaner, cleaning), "signer_must_differ", "quien limpió no libera");
        await h.Care.SignCleaning(TestHost.Everything("jefa-test"), cleaning);
        Assert.Equal("available", await Status(h, bed), "disponible tras firma");
    }

    private static Task<string?> Status(TestHost h, Guid bed) => h.Db.InTx(tx => tx.Scalar<string>("select status from care.locations where id=@id", ("id", bed)));

    [Test("002 FR-011")]
    public static async Task DischargeTypesRequireTheirEvidence()
    {
        var h = new TestHost();
        var (person, enc) = await Arrival(h);
        var episode = await h.Care.Admit(TestHost.Everything(), person, enc, await Bed(h, "MI-203"), "Medicina interna", "Dr. Test", null);
        var doc = TestHost.Everything("medico-tipos");
        await Assert.Fails(() => h.Care.SignMedicalDischarge(doc, Medical(episode) with { Type = "voluntary" }), "voluntary_requirements", "voluntaria sin evidencia");
        await Assert.Fails(() => h.Care.SignMedicalDischarge(doc, Medical(episode) with { Type = "voluntary", RisksExplained = "riesgo de sepsis", Witness1 = "A" }), "voluntary_requirements", "un solo testigo");
        await Assert.Fails(() => h.Care.SignMedicalDischarge(doc, Medical(episode) with { Type = "referred", DestinationInstitution = "Hospital San Juan de Dios" }), "referral_requirements", "referencia sin receptor");
        await Assert.Fails(() => h.Care.SignMedicalDischarge(doc, Medical(episode) with { Type = "death" }), "death_requirements", "fallecimiento sin certificante");
        await h.Care.SignMedicalDischarge(doc, Medical(episode) with { Type = "voluntary", RisksExplained = "riesgo de sepsis", Witness1 = "A", Witness2 = "B" });
    }

    [Test("002 FR-012, FR-013")]
    public static async Task RevocationKeepsOriginalDischargeInHistory()
    {
        var h = new TestHost();
        var (person, enc) = await Arrival(h);
        var episode = await h.Care.Admit(TestHost.Everything(), person, enc, await Bed(h, "MI-204"), "Medicina interna", "Dr. Test", null);
        await h.Care.SignMedicalDischarge(TestHost.Everything(), Medical(episode));
        await Assert.Fails(() => h.Care.RevokeMedicalDischarge(TestHost.Everything(), episode, ""), "reason_required", "revocar sin motivo");
        await h.Care.RevokeMedicalDischarge(TestHost.Everything(), episode, "fiebre antes de salir");
        var view = await h.Care.Episode(TestHost.Everything(), episode);
        Assert.Equal("active", view.Status, "episodio activo de nuevo");
        Assert.True(view.Events.Any(e => e.Kind == "medical_discharge_signed") && view.Events.Any(e => e.Kind == "medical_discharge_revoked" && e.Cancels is not null), "ambos eventos conservados");
    }

    [Test("002 FR-027")]
    public static async Task PendingItemsNeedOwnerBeforeDischarge()
    {
        var h = new TestHost();
        var (person, enc) = await Arrival(h);
        var episode = await h.Care.Admit(TestHost.Everything(), person, enc, await Bed(h, "MI-205"), "Medicina interna", "Dr. Test", null);
        await Assert.Fails(() => h.Care.SignMedicalDischarge(TestHost.Everything(), Medical(episode) with { PendingItems = [new PendingItem("hemocultivo", "")] }),
            "continuity_owner_required", "pendiente sin responsable");
        await h.Care.SignMedicalDischarge(TestHost.Everything(), Medical(episode) with { PendingItems = [new PendingItem("hemocultivo", "Dr. Test, consulta externa")] });
    }

    [Test("R17 / 002 FR-009")]
    public static async Task ExpiredLicenseCannotSignDischarge()
    {
        var h = new TestHost();
        var (person, enc) = await Arrival(h);
        var episode = await h.Care.Admit(TestHost.Everything(), person, enc, await Bed(h, "MI-206"), "Medicina interna", "Dr. Test", null);
        var expired = TestHost.Everything("medico-vencido") with { LicenseValidUntil = new DateOnly(2026, 1, 31) };
        await Assert.Fails(() => h.Care.SignMedicalDischarge(expired, Medical(episode)), "license_invalid", "inscripción vencida");
        var noLicense = TestHost.Everything("sin-inscripcion") with { ProfessionalNumber = null };
        await Assert.Fails(() => h.Care.SignMedicalDischarge(noLicense, Medical(episode)), "license_invalid", "sin inscripción");
    }
}
