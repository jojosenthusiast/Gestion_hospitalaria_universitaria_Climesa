using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Climesa.Identity.Contracts;
using Climesa.Identity.Domain;
using Climesa.Platform.Audit;
using Climesa.Platform.Data;
using Climesa.Platform.Errors;
using Climesa.Platform.Messaging;
using Climesa.Platform.Security;
using Climesa.Platform.Time;
using Npgsql;

namespace Climesa.Identity.Application;

public sealed record SearchCriteria(string? Text, string? Dui, string? Mrn, int? BirthYear);

public sealed record Candidate(Guid PersonId, string DisplayName, string Mrn, string BirthDisplay, string? MaskedDui, string? Municipality, string Status, IReadOnlyList<string> Reasons);

public sealed record SearchResult(Guid Token, IReadOnlyList<Candidate> Candidates);

public sealed record NewPerson(
    string GivenNames,
    string FirstSurname,
    string? SecondSurname,
    string? MarriedSurname,
    DateOnly? BirthDate,
    string BirthPrecision,
    int? EstimatedAge,
    string Sex,
    string? Dui,
    string? OtherIdentifierType,
    string? OtherIdentifierValue,
    string? OtherIdentifierIssuer,
    string? Municipality,
    string? AddressText,
    string? Phone,
    string? Informant);

public sealed record NameView(string Type, string Display, string Source, DateTimeOffset ValidFrom);
public sealed record IdentifierView(string TypeCode, string TypeName, string Issuer, string Value, string Status, string Source);
public sealed record VersionView(int Version, DateTimeOffset ChangedAt, string Actor, string Reason, string Diff);
public sealed record RelationshipView(string Type, string? RelatedName, Guid? RelatedPersonId, int? BirthOrder);
public sealed record CaseView(Guid Id, string Type, string Status, IReadOnlyList<Guid> PersonIds, string Reason, DateTimeOffset OpenedAt);

public sealed record PersonDetail(
    PersonSummary Summary,
    string? Municipality,
    string? AddressText,
    string? Phone,
    string? Informant,
    int Version,
    IReadOnlyList<NameView> Names,
    IReadOnlyList<IdentifierView> Identifiers,
    IReadOnlyList<VersionView> History,
    IReadOnlyList<RelationshipView> Relationships,
    IReadOnlyList<CaseView> Cases);

/// <summary>Identity module application service (spec 001).</summary>
public sealed class IdentityService(CommandRunner runner, Guid facilityId) : IIdentityModule
{
    private IClock Clock => runner.Clock;

    // ---------- Search before create (FR-001 to FR-004) ----------

    public Task<SearchResult> Search(Actor actor, SearchCriteria criteria) =>
        runner.Run(actor, "identity.search", "identity.search", null, new { }, async tx =>
        {
            var candidates = await FindCandidates(tx, criteria);
            var token = Guid.NewGuid();
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(criteria))));
            await tx.Exec("insert into identity.registration_searches(token, user_id, criteria_hash, result_count, created_at, expires_at) values (@t,@u,@h,@n,@c,@e)",
                ("t", token), ("u", actor.UserId), ("h", hash), ("n", candidates.Count), ("c", Clock.UtcNow), ("e", Clock.UtcNow.AddMinutes(30)));
            // FR-038: audit stores a hash of the criteria, not the typed names or numbers.
            await runner.Audit.Write(tx, actor, new AuditEntry("search", "person", Permission: "identity.search",
                Detail: new { criteriaHash = hash, returned = candidates.Select(c => c.PersonId).ToArray() }));
            return new SearchResult(token, candidates);
        }, "person");

    private async Task<List<Candidate>> FindCandidates(DbTx tx, SearchCriteria c)
    {
        var found = new Dictionary<Guid, List<string>>();
        void Add(Guid id, string reason)
        {
            if (!found.TryGetValue(id, out var list))
            {
                found[id] = list = [];
            }
            if (!list.Contains(reason))
            {
                list.Add(reason);
            }
        }

        if (!string.IsNullOrWhiteSpace(c.Dui) && Dui.IsValid(c.Dui))
        {
            var norm = Dui.Normalize(c.Dui);
            foreach (var id in await tx.Query("select person_id from identity.identifiers where type_code='dui' and value_normalized=@v and status in ('unverified','verified')", r => r.GetGuid(0), ("v", norm)))
            {
                Add(id, "mismo DUI");
            }
        }
        if (!string.IsNullOrWhiteSpace(c.Mrn))
        {
            if (!Mrn.IsValid(c.Mrn))
            {
                throw new DomainError("mrn_check_digit", "El número de expediente no es válido (dígito verificador).");
            }
            foreach (var id in await tx.Query("select person_id from identity.medical_record_numbers where mrn=@m", r => r.GetGuid(0), ("m", c.Mrn.Trim().ToUpperInvariant())))
            {
                Add(id, "mismo número de expediente");
            }
        }
        if (!string.IsNullOrWhiteSpace(c.Text))
        {
            var norm = NameKeys.Normalize(c.Text);
            var tokens = NameKeys.Phonetic(c.Text).Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var rows = await tx.Query("""
                select n.person_id, n.phon_first_surname, n.phon_given, similarity(n.search_normalized, @q) as sim
                from identity.person_names n
                where n.valid_to is null and (n.search_normalized % @q or n.phon_first_surname = any(@toks) or n.search_normalized ilike '%' || @q || '%')
                order by sim desc limit 50
                """,
                r => new { Id = r.GetGuid(0), PhonSurname = r.GetString(1), PhonGiven = r.GetString(2), Sim = r.GetFloat(3) },
                ("q", norm), ("toks", tokens));
            foreach (var row in rows)
            {
                var surnameHit = tokens.Contains(row.PhonSurname);
                var givenHit = row.PhonGiven.Length > 0 && tokens.Contains(row.PhonGiven);
                if (surnameHit && givenHit)
                {
                    Add(row.Id, "nombres fonéticamente similares");
                }
                else if (row.Sim >= 0.45f)
                {
                    Add(row.Id, "nombre parecido");
                }
                else if (surnameHit && tokens.Length == 1)
                {
                    Add(row.Id, "mismo apellido");
                }
            }
        }
        if (found.Count == 0)
        {
            return [];
        }

        var summaries = await LoadSummaries(tx, [.. found.Keys]);
        var result = new List<Candidate>();
        foreach (var s in summaries)
        {
            var reasons = found[s.Summary.PersonId];
            if (c.BirthYear is not null && s.BirthYear == c.BirthYear)
            {
                reasons.Add("mismo año de nacimiento");
            }
            result.Add(new Candidate(s.Summary.PersonId, s.Summary.DisplayName, s.Summary.Mrn, s.Summary.BirthDisplay,
                s.Dui is null ? null : Dui.Mask(s.Dui), s.Municipality, s.Summary.Status, reasons));
        }
        return [.. result
            .OrderByDescending(r => r.Reasons.Any(x => x.StartsWith("mismo DUI", StringComparison.Ordinal) || x.StartsWith("mismo número", StringComparison.Ordinal)))
            .ThenByDescending(r => r.Reasons.Count)
            .Take(20)];
    }

    // ---------- Registration (FR-005 to FR-016, FR-039) ----------

    public Task<PersonSummary> Register(Actor actor, Guid searchToken, NewPerson p, string? idempotencyKey) =>
        runner.Run(actor, "identity.create", "identity.register", idempotencyKey, new { searchToken, p }, async tx =>
        {
            var valid = await tx.Scalar<long>("select count(*) from identity.registration_searches where token=@t and user_id=@u and expires_at > @now",
                ("t", searchToken), ("u", actor.UserId), ("now", Clock.UtcNow));
            if (valid == 0)
            {
                throw new DomainError("search_required", "Debe buscar al paciente antes de registrarlo (la búsqueda vence a los 30 minutos).");
            }
            if (string.IsNullOrWhiteSpace(p.GivenNames) || string.IsNullOrWhiteSpace(p.FirstSurname))
            {
                throw new DomainError("names_required", "Nombre y primer apellido son obligatorios para una identidad no provisional; use registro provisional si se desconocen.");
            }
            var birth = BuildBirth(p.BirthDate, p.BirthPrecision, p.EstimatedAge);
            var id = await InsertPerson(tx, actor, "active", birth, p.Sex, p.Municipality, p.AddressText, p.Phone, p.Informant,
                ("official", p.GivenNames, p.FirstSurname, p.SecondSurname, p.MarriedSurname), "registro en admisión", "identity.create");
            if (!string.IsNullOrWhiteSpace(p.Dui))
            {
                await InsertIdentifier(tx, id, "dui", Dui.Normalize(p.Dui), p.Dui, null, "admisión");
            }
            if (!string.IsNullOrWhiteSpace(p.OtherIdentifierType) && !string.IsNullOrWhiteSpace(p.OtherIdentifierValue))
            {
                await InsertIdentifier(tx, id, p.OtherIdentifierType, p.OtherIdentifierValue.Trim().ToUpperInvariant(), p.OtherIdentifierValue, p.OtherIdentifierIssuer, "admisión");
            }
            await SuspectDuplicates(tx, actor, id, p.FirstSurname, p.GivenNames, birth.Year);
            var summary = (await LoadSummaries(tx, [id]))[0].Summary;
            await runner.Outbox.Enqueue(tx, "PersonRegistered", "person", id.ToString(), new { personId = id, summary.Mrn }, actor.CorrelationId);
            await runner.Audit.Write(tx, actor, new AuditEntry("create", "person", id.ToString(), id, "identity.create"));
            return summary;
        }, "person");

    public Task<PersonSummary> RegisterProvisional(Actor actor, ProvisionalRegistration request, string? idempotencyKey) =>
        runner.Run(actor, "identity.create_provisional", "identity.provisional", idempotencyKey, request, tx => InsertProvisional(tx, actor, request), "person");

    /// <summary>Used inside another module's transaction-less flow; still a separate audited command.</summary>
    private async Task<PersonSummary> InsertProvisional(DbTx tx, Actor actor, ProvisionalRegistration request)
    {
        var seq = await tx.Scalar<long>("select nextval('identity.provisional_seq')");
        var alias = $"NN-{LocalTime.LocalDate(Clock.UtcNow).Year}-{seq:D6}";
        var birth = request.EstimatedAge is int age ? PartialBirth.FromEstimatedAge(age, LocalTime.LocalDate(Clock.UtcNow)) : PartialBirth.Unknown;
        var id = await InsertPerson(tx, actor, "provisional", birth, request.Sex ?? "unknown", null, request.Description, null, request.Informant,
            ("temporary", alias, "", null, null), "identidad provisional", "identity.create_provisional");
        await InsertIdentifier(tx, id, "temporary_alias", alias, alias, null, "generado");
        var summary = (await LoadSummaries(tx, [id]))[0].Summary;
        await runner.Outbox.Enqueue(tx, "PersonRegistered", "person", id.ToString(), new { personId = id, summary.Mrn, provisional = true }, actor.CorrelationId);
        await runner.Audit.Write(tx, actor, new AuditEntry("create", "person", id.ToString(), id, "identity.create_provisional", Detail: new { provisional = true }));
        return summary;
    }

    /// <summary>One identity per newborn linked to the mother, temporary name per FR-040.</summary>
    public Task<IReadOnlyList<PersonSummary>> RegisterNewborns(Actor actor, Guid motherId, IReadOnlyList<string> sexes, string? idempotencyKey) =>
        runner.Run<IReadOnlyList<PersonSummary>>(actor, "identity.create", "identity.newborns", idempotencyKey, new { motherId, sexes }, async tx =>
        {
            var mother = await tx.One("""
                select given_names, first_surname, coalesce(second_surname,'') from identity.person_names
                where person_id=@m and valid_to is null order by case type when 'official' then 0 else 1 end limit 1
                """, r => new { Given = r.Str("given_names") ?? "", First = r.Str("first_surname") ?? "", Second = r.GetString(2) }, ("m", motherId))
                ?? throw new NotFoundError("madre");
            var result = new List<PersonSummary>();
            var today = LocalTime.LocalDate(Clock.UtcNow);
            for (var i = 0; i < sexes.Count; i++)
            {
                var label = sexes[i] == "female" ? "niña" : sexes[i] == "male" ? "niño" : "RN";
                var suffix = sexes.Count > 1 ? $" {(char)('A' + i)}" : "";
                var id = await InsertPerson(tx, actor, "active", new PartialBirth(today, BirthPrecision.Exact, null, null), sexes[i], null, null, null, "registro de nacimiento",
                    ("temporary", $"{mother.Given} {label}{suffix}", mother.First, mother.Second, null), "nacimiento hospitalario", "identity.create");
                await tx.Exec("insert into identity.relationships(id, person_id, related_person_id, type, birth_order, may_consent, may_receive_info, may_request_copies, created_at) values (@id,@p,@m,'mother',@o,false,false,false,@c)",
                    ("id", Guid.NewGuid()), ("p", id), ("m", motherId), ("o", i + 1), ("c", Clock.UtcNow));
                var s = (await LoadSummaries(tx, [id]))[0].Summary;
                result.Add(s);
                await runner.Audit.Write(tx, actor, new AuditEntry("create", "person", id.ToString(), id, "identity.create", Detail: new { newborn = true, birthOrder = i + 1 }));
            }
            return result;
        }, "person");

    // ---------- Changes with history (FR-012, FR-023, FR-025) ----------

    public Task<int> UpdateContact(Actor actor, Guid personId, int expectedVersion, string? municipality, string? address, string? phone, string reason) =>
        runner.Run(actor, "identity.update", "identity.update", null, new { }, async tx =>
        {
            if (string.IsNullOrWhiteSpace(reason))
            {
                throw new DomainError("reason_required", "Todo cambio requiere motivo.");
            }
            var current = await tx.One("select municipality, address_text, phone, version from identity.persons where id=@id for update",
                r => new { M = r.Str("municipality"), A = r.Str("address_text"), P = r.Str("phone"), V = r.GetInt32(3) }, ("id", personId))
                ?? throw new NotFoundError("paciente");
            if (current.V != expectedVersion)
            {
                throw new ConflictError("version_conflict", $"Otro usuario modificó este registro (versión actual {current.V}). Recargue y vuelva a intentar.");
            }
            var diff = new Dictionary<string, object?>();
            if (current.M != municipality) { diff["municipality"] = new { before = current.M, after = municipality }; }
            if (current.A != address) { diff["address_text"] = new { before = current.A, after = address }; }
            if (current.P != phone) { diff["phone"] = new { before = current.P, after = phone }; }
            if (diff.Count == 0)
            {
                return current.V;
            }
            var next = current.V + 1;
            await tx.Exec("update identity.persons set municipality=@m, address_text=@a, phone=@p, version=@v where id=@id",
                ("m", municipality), ("a", address), ("p", phone), ("v", next), ("id", personId));
            await AppendVersion(tx, actor, personId, next, "identity.update", reason, diff);
            await runner.Outbox.Enqueue(tx, "PersonDemographicsChanged", "person", personId.ToString(), new { personId, version = next }, actor.CorrelationId);
            await runner.Audit.Write(tx, actor, new AuditEntry("update", "person", personId.ToString(), personId, "identity.update", Detail: new { fields = diff.Keys.ToArray() }));
            return next;
        }, "person");

    public Task<bool> AddIdentifier(Actor actor, Guid personId, string type, string value, string? issuer, string reason) =>
        runner.Run(actor, "identity.update", "identity.add_identifier", null, new { }, async tx =>
        {
            var version = await tx.Scalar<int>("select version from identity.persons where id=@id for update", ("id", personId));
            var normalized = type == "dui" ? Dui.Normalize(value) : value.Trim().ToUpperInvariant();
            await InsertIdentifier(tx, personId, type, normalized, value, issuer, "corrección en admisión");
            await tx.Exec("update identity.persons set version=@v where id=@id", ("v", version + 1), ("id", personId));
            await AppendVersion(tx, actor, personId, version + 1, "identity.update", reason, new Dictionary<string, object?> { ["identifier_added"] = new { type, value = normalized } });
            await runner.Audit.Write(tx, actor, new AuditEntry("update", "person", personId.ToString(), personId, "identity.update", Detail: new { identifierType = type }));
            return true;
        }, "person");

    // ---------- Reads ----------

    public Task<PersonDetail> GetDetail(Actor actor, Guid personId) =>
        runner.Query(actor, "identity.view", "person", async tx =>
        {
            var summaries = await LoadSummaries(tx, [personId]);
            if (summaries.Count == 0)
            {
                throw new NotFoundError("paciente");
            }
            var s = summaries[0];
            var person = await tx.One("select municipality, address_text, phone, informant, version from identity.persons where id=@id",
                r => new { M = r.Str("municipality"), A = r.Str("address_text"), P = r.Str("phone"), I = r.Str("informant"), V = r.GetInt32(4) }, ("id", personId))!;
            var names = await tx.Query("select type, given_names, first_surname, second_surname, married_surname, source, valid_from from identity.person_names where person_id=@id order by valid_from",
                r => new NameView(r.GetString(0), DisplayName(r.Str("given_names"), r.Str("first_surname"), r.Str("second_surname"), r.Str("married_surname")), r.GetString(5), r.GetFieldValue<DateTimeOffset>(6)), ("id", personId));
            var ids = await tx.Query("""
                select i.type_code, t.name, i.issuer, i.value_normalized, i.status, i.source from identity.identifiers i
                join identity.identifier_types t on t.code = i.type_code where i.person_id=@id order by i.created_at
                """, r => new IdentifierView(r.GetString(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4), r.GetString(5)), ("id", personId));
            var history = await tx.Query("select version, changed_at, actor_username, reason, diff::text from identity.person_versions where person_id=@id order by version desc",
                r => new VersionView(r.GetInt32(0), r.GetFieldValue<DateTimeOffset>(1), r.GetString(2), r.GetString(3), r.GetString(4)), ("id", personId));
            var rels = await tx.Query("""
                select r.type, coalesce(r.related_name, (select given_names || ' ' || first_surname from identity.person_names n where n.person_id = r.related_person_id and n.valid_to is null limit 1)), r.related_person_id, r.birth_order
                from identity.relationships r where r.person_id=@id
                """, r => new RelationshipView(r.GetString(0), r.Str("coalesce"), r.Get<Guid?>("related_person_id"), r.Get<int?>("birth_order")), ("id", personId));
            var cases = await tx.Query("select id, type, status, person_ids, reason, opened_at from identity.duplicate_cases where @id = any(person_ids) order by opened_at desc",
                r => new CaseView(r.GetGuid(0), r.GetString(1), r.GetString(2), r.GetFieldValue<Guid[]>(3), r.GetString(4), r.GetFieldValue<DateTimeOffset>(5)), ("id", personId));
            await runner.Audit.Write(tx, actor, new AuditEntry("read", "person", personId.ToString(), personId, "identity.view"));
            return new PersonDetail(s.Summary, person!.M, person.A, person.P, person.I, person.V, names, ids, history, rels, cases);
        });

    public Task<IReadOnlyList<CaseView>> OpenCases(Actor actor) =>
        runner.Query<IReadOnlyList<CaseView>>(actor, "identity.duplicate.review", "duplicate_case", async tx =>
            await tx.Query("select id, type, status, person_ids, reason, opened_at from identity.duplicate_cases where status in ('suspected','under_investigation') order by opened_at",
                r => new CaseView(r.GetGuid(0), r.GetString(1), r.GetString(2), r.GetFieldValue<Guid[]>(3), r.GetString(4), r.GetFieldValue<DateTimeOffset>(5))));

    public async Task<PersonSummary?> GetSummary(Guid personId)
    {
        var rows = await runner.Db.InTx(tx => LoadSummaries(tx, [personId]));
        return rows.Count == 0 ? null : rows[0].Summary;
    }

    // ---------- Migration contract (spec 004 uses the same rules) ----------

    public Task<IReadOnlyList<MigrationMatch>> FindMigrationMatches(Actor actor, MigrationPerson person) =>
        runner.Query<IReadOnlyList<MigrationMatch>>(actor, "migration.batch.run", "person", async tx =>
        {
            var list = new List<MigrationMatch>();
            if (!string.IsNullOrWhiteSpace(person.Dui) && Dui.IsValid(person.Dui))
            {
                list.AddRange(await tx.Query("""
                    select i.person_id, m.mrn from identity.identifiers i join identity.medical_record_numbers m on m.person_id = i.person_id
                    where i.type_code='dui' and i.value_normalized=@v and i.status in ('unverified','verified')
                    """, r => new MigrationMatch(r.GetGuid(0), r.GetString(1), "mismo DUI", true, true), ("v", Dui.Normalize(person.Dui))));
            }
            var ps0 = NameKeys.FirstToken(person.FirstSurname);
            var pg0 = NameKeys.FirstToken(person.GivenNames);
            list.AddRange(await tx.Query("""
                select i.person_id, m.mrn,
                       exists(select 1 from identity.person_names n where n.person_id = i.person_id and n.phon_first_surname=@s and n.phon_given=@g) as agree
                from identity.identifiers i join identity.medical_record_numbers m on m.person_id = i.person_id
                where i.type_code='legacy_paper_mrn' and i.value_normalized=@v and i.status in ('unverified','verified')
                """, r => new MigrationMatch(r.GetGuid(0), r.GetString(1), "mismo número de expediente en papel", true, r.GetBoolean(2)),
                ("v", person.LegacyPaperNumber.Trim().ToUpperInvariant()), ("s", ps0), ("g", pg0)));
            if (list.Count == 0 && !string.IsNullOrWhiteSpace(person.FirstSurname) && !string.IsNullOrWhiteSpace(person.GivenNames))
            {
                var ps = NameKeys.FirstToken(person.FirstSurname);
                var pg = NameKeys.FirstToken(person.GivenNames);
                var near = await tx.Query("""
                    select distinct n.person_id, m.mrn, p.birth_date from identity.person_names n
                    join identity.persons p on p.id = n.person_id join identity.medical_record_numbers m on m.person_id = n.person_id
                    where n.valid_to is null and n.phon_first_surname=@s and n.phon_given=@g
                    """, r => new { Id = r.GetGuid(0), Mrn = r.GetString(1), Birth = r.Get<DateOnly?>("birth_date") }, ("s", ps), ("g", pg));
                list.AddRange(near
                    .Where(x => person.BirthDate is null || x.Birth is null || x.Birth.Value.Year == person.BirthDate.Value.Year)
                    .Select(x => new MigrationMatch(x.Id, x.Mrn, "nombres fonéticamente similares y año compatible", false, true)));
            }
            return list;
        });

    public Task<PersonSummary> RegisterFromMigration(Actor actor, MigrationPerson p, string idempotencyKey) =>
        runner.Run(actor, "migration.batch.run", "identity.migration", idempotencyKey, p, async tx =>
        {
            var birth = p.BirthDate is null ? PartialBirth.Unknown : BuildBirth(p.BirthDate, p.BirthPrecision, null);
            var id = await InsertPerson(tx, actor, "active", birth, p.Sex, p.Municipality, p.AddressText, null, $"migración {p.BatchReference}",
                ("official", p.GivenNames, p.FirstSurname, p.SecondSurname, p.MarriedSurname), $"carga desde índice de archivo, lote {p.BatchReference}", "migration.batch.run");
            await InsertIdentifier(tx, id, "legacy_paper_mrn", p.LegacyPaperNumber.Trim().ToUpperInvariant(), p.LegacyPaperNumber, null, $"lote {p.BatchReference}");
            if (!string.IsNullOrWhiteSpace(p.Dui))
            {
                await InsertIdentifier(tx, id, "dui", Dui.Normalize(p.Dui), p.Dui, null, $"lote {p.BatchReference}");
            }
            var summary = (await LoadSummaries(tx, [id]))[0].Summary;
            await runner.Outbox.Enqueue(tx, "PersonRegistered", "person", id.ToString(), new { personId = id, summary.Mrn, migrated = true }, actor.CorrelationId);
            await runner.Audit.Write(tx, actor, new AuditEntry("create", "person", id.ToString(), id, "migration.batch.run", Detail: new { batch = p.BatchReference }));
            return summary;
        }, "person");

    public Task OpenDuplicateCase(Actor actor, Guid a, Guid b, string reason) =>
        runner.Run(actor, "migration.batch.run", "identity.case", null, new { }, async tx =>
        {
            await InsertCase(tx, actor, a, b, reason);
            return true;
        }, "duplicate_case");

    // ---------- Internals ----------

    private PartialBirth BuildBirth(DateOnly? date, string precision, int? estimatedAge) => precision switch
    {
        "exact" when date is not null => new PartialBirth(date, BirthPrecision.Exact, null, null),
        "year_month" when date is not null => new PartialBirth(new DateOnly(date.Value.Year, date.Value.Month, 1), BirthPrecision.YearMonth, null, null),
        "year" when date is not null => new PartialBirth(new DateOnly(date.Value.Year, 1, 1), BirthPrecision.Year, null, null),
        "estimated" when estimatedAge is not null => PartialBirth.FromEstimatedAge(estimatedAge.Value, LocalTime.LocalDate(Clock.UtcNow)),
        "unknown" => PartialBirth.Unknown,
        _ => throw new DomainError("birth_invalid", "La fecha de nacimiento no coincide con la precisión indicada."),
    };

    private async Task<Guid> InsertPerson(DbTx tx, Actor actor, string status, PartialBirth birth, string sex, string? municipality, string? address, string? phone, string? informant,
        (string Type, string? Given, string? First, string? Second, string? Married) name, string reason, string permission)
    {
        if (sex is not ("female" or "male" or "unknown" or "not_recorded"))
        {
            throw new DomainError("sex_invalid", "Sexo administrativo inválido.");
        }
        var id = Guid.NewGuid();
        var now = Clock.UtcNow;
        await tx.Exec("""
            insert into identity.persons(id, facility_id, status, birth_date, birth_precision, birth_estimated_age, birth_estimated_at, admin_sex,
                municipality, address_text, phone, informant, captured_by, created_at, version)
            values (@id, @f, @s, @bd, @bp, @ba, @bat, @sex, @mun, @addr, @ph, @inf, @cap, @now, 1)
            """,
            ("id", id), ("f", facilityId), ("s", status), ("bd", birth.Precision is BirthPrecision.Estimated or BirthPrecision.Unknown ? null : birth.Date),
            ("bp", birth.Code), ("ba", birth.EstimatedAge), ("bat", birth.EstimatedAt), ("sex", sex), ("mun", municipality), ("addr", address), ("ph", phone),
            ("inf", informant), ("cap", actor.UserId == Guid.Empty ? null : actor.UserId), ("now", now));
        var fullForSearch = $"{name.Given} {name.First} {name.Second} {name.Married}";
        await tx.Exec("""
            insert into identity.person_names(id, person_id, type, given_names, first_surname, second_surname, married_surname, search_normalized, phon_first_surname, phon_given, valid_from, source)
            values (@id, @p, @t, @g, @f1, @f2, @m, @sn, @ps, @pg, @now, @src)
            """,
            ("id", Guid.NewGuid()), ("p", id), ("t", name.Type), ("g", name.Given), ("f1", name.First), ("f2", name.Second), ("m", name.Married),
            ("sn", NameKeys.Normalize(fullForSearch)), ("ps", NameKeys.FirstToken(name.First)), ("pg", NameKeys.FirstToken(name.Given)), ("now", now), ("src", reason));
        var seq = await tx.Scalar<long>("select nextval('identity.mrn_seq')");
        await tx.Exec("insert into identity.medical_record_numbers(facility_id, mrn, person_id, created_at) values (@f, @m, @p, @now)",
            ("f", facilityId), ("m", Mrn.Format(seq)), ("p", id), ("now", now));
        await AppendVersion(tx, actor, id, 1, permission, reason, new Dictionary<string, object?>
        {
            ["created"] = new { status, birth = birth.Display, sex, name = DisplayName(name.Given, name.First, name.Second, name.Married), informant },
        });
        return id;
    }

    private async Task InsertIdentifier(DbTx tx, Guid personId, string type, string normalized, string original, string? issuer, string source)
    {
        var typeRow = await tx.One("select default_issuer, exclusive from identity.identifier_types where code=@c", r => new { Issuer = r.GetString(0), Exclusive = r.GetBoolean(1) }, ("c", type))
            ?? throw new DomainError("identifier_type_unknown", $"Tipo de identificador desconocido: {type}");
        var iss = string.IsNullOrWhiteSpace(issuer) ? typeRow.Issuer : issuer.Trim().ToUpperInvariant();
        if (typeRow.Exclusive)
        {
            var holder = await tx.Scalar<string>("""
                select m.mrn from identity.identifiers i join identity.medical_record_numbers m on m.person_id = i.person_id
                where i.type_code=@t and i.issuer=@iss and i.value_normalized=@v and i.status in ('unverified','verified') and i.person_id <> @p limit 1
                """, ("t", type), ("iss", iss), ("v", normalized), ("p", personId));
            if (holder is not null)
            {
                throw new ConflictError("identifier_conflict", $"Ese identificador ya pertenece al expediente {holder}. Abra ese expediente o reporte un posible duplicado.");
            }
        }
        try
        {
            await tx.Exec("""
                insert into identity.identifiers(id, person_id, type_code, issuer, value_original, value_normalized, status, is_exclusive, source, created_at)
                values (@id, @p, @t, @iss, @o, @v, 'unverified', @x, @src, @now)
                """,
                ("id", Guid.NewGuid()), ("p", personId), ("t", type), ("iss", iss), ("o", original), ("v", normalized), ("x", typeRow.Exclusive), ("src", source), ("now", Clock.UtcNow));
        }
        catch (PostgresException ex) when (ex.SqlState == PgErrors.UniqueViolation)
        {
            // Concurrent registration of the same exclusive identifier (FR-010): the database decides.
            throw new ConflictError("identifier_conflict", "Otro usuario registró ese identificador al mismo tiempo. Busque de nuevo.");
        }
    }

    private Task AppendVersion(DbTx tx, Actor actor, Guid personId, int version, string permission, string reason, Dictionary<string, object?> diff) =>
        tx.Exec("insert into identity.person_versions(person_id, version, changed_at, actor_user_id, actor_username, permission, reason, diff) values (@p,@v,@t,@u,@un,@perm,@r,@d::jsonb)",
            ("p", personId), ("v", version), ("t", Clock.UtcNow), ("u", actor.UserId == Guid.Empty ? null : actor.UserId), ("un", actor.Username),
            ("perm", permission), ("r", reason), ("d", JsonSerializer.Serialize(diff)));

    /// <summary>FR-027: matching only opens suspected cases, never merges.</summary>
    private async Task SuspectDuplicates(DbTx tx, Actor actor, Guid newId, string firstSurname, string given, int? birthYear)
    {
        var others = await tx.Query("""
            select distinct n.person_id, p.birth_date, p.birth_precision, p.birth_estimated_age, p.birth_estimated_at
            from identity.person_names n join identity.persons p on p.id = n.person_id
            where n.valid_to is null and n.person_id <> @id and n.phon_first_surname=@s and n.phon_given=@g and p.status not in ('retired_merged','entered_in_error')
            """,
            r => new { Id = r.GetGuid(0), Birth = PartialBirth.FromDb(r.Get<DateOnly?>("birth_date"), r.GetString(2), r.Get<int?>("birth_estimated_age"), r.Get<DateOnly?>("birth_estimated_at")) },
            ("id", newId), ("s", NameKeys.FirstToken(firstSurname)), ("g", NameKeys.FirstToken(given)));
        foreach (var o in others.Where(o => birthYear is null || o.Birth.Year is null || Math.Abs(o.Birth.Year.Value - birthYear.Value) <= 1))
        {
            await InsertCase(tx, actor, newId, o.Id, "nombres fonéticamente iguales y año de nacimiento compatible");
        }
    }

    private async Task InsertCase(DbTx tx, Actor actor, Guid a, Guid b, string reason)
    {
        Guid[] pair = string.CompareOrdinal(a.ToString(), b.ToString()) < 0 ? [a, b] : [b, a];
        var inserted = await tx.Exec("""
            insert into identity.duplicate_cases(id, type, status, person_ids, reason, opened_by, opened_at)
            values (@id, 'duplicate', 'suspected', @p, @r, @u, @t) on conflict do nothing
            """, ("id", Guid.NewGuid()), ("p", pair), ("r", reason), ("u", actor.Username), ("t", Clock.UtcNow));
        if (inserted == 1)
        {
            await runner.Audit.Write(tx, actor, new AuditEntry("create", "duplicate_case", string.Join(',', pair), Detail: new { reason }));
        }
    }

    private sealed record SummaryRow(PersonSummary Summary, int? BirthYear, string? Dui, string? Municipality);

    private static async Task<List<SummaryRow>> LoadSummaries(DbTx tx, Guid[] ids) =>
        await tx.Query("""
            select p.id, p.status, p.birth_date, p.birth_precision, p.birth_estimated_age, p.birth_estimated_at, p.admin_sex, p.municipality,
                   n.given_names, n.first_surname, n.second_surname, n.married_surname,
                   (select mrn from identity.medical_record_numbers m where m.person_id = p.id order by created_at limit 1) as mrn,
                   (select value_normalized from identity.identifiers i where i.person_id = p.id and i.type_code='dui' and i.status in ('unverified','verified') limit 1) as dui,
                   (select value_normalized from identity.identifiers i where i.person_id = p.id and i.type_code='temporary_alias' limit 1) as alias
            from identity.persons p
            left join lateral (select * from identity.person_names x where x.person_id = p.id and x.valid_to is null
                               order by case x.type when 'official' then 0 when 'temporary' then 1 else 2 end limit 1) n on true
            where p.id = any(@ids)
            """,
            r =>
            {
                var birth = PartialBirth.FromDb(r.Get<DateOnly?>("birth_date"), r.GetString(3), r.Get<int?>("birth_estimated_age"), r.Get<DateOnly?>("birth_estimated_at"));
                var name = DisplayName(r.Str("given_names"), r.Str("first_surname"), r.Str("second_surname"), r.Str("married_surname"));
                var sex = r.GetString(6) switch { "female" => "F", "male" => "M", "unknown" => "Desconocido", _ => "No registrado" };
                return new SummaryRow(new PersonSummary(r.GetGuid(0), name, r.Str("mrn") ?? "", r.GetString(1), birth.Display, sex, r.Str("alias")),
                    birth.Year, r.Str("dui"), r.Str("municipality"));
            }, ("ids", ids));

    public static string DisplayName(string? given, string? first, string? second, string? married)
    {
        var surnames = string.Join(' ', new[] { first, second, string.IsNullOrWhiteSpace(married) ? null : $"de {married}" }.Where(x => !string.IsNullOrWhiteSpace(x)));
        if (string.IsNullOrWhiteSpace(surnames))
        {
            return given ?? "(sin nombre)";
        }
        return string.IsNullOrWhiteSpace(given) ? surnames : $"{surnames}, {given}";
    }
}
