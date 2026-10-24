using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Climesa.Identity.Contracts;
using Climesa.Platform.Audit;
using Climesa.Platform.Data;
using Climesa.Platform.Errors;
using Climesa.Platform.Messaging;
using Climesa.Platform.Security;

namespace Climesa.Migration.Application;

public sealed record BatchSummary(Guid Id, string SourceName, string Fingerprint, string TransformVersion, string Operator, DateTimeOffset StartedAt, DateTimeOffset? CompletedAt,
    string Status, int Read, int Created, int Matched, int Rejected, int Pending, string? CharacterSample, bool AlreadyApplied);

public sealed record BatchItemView(int LineNo, string? LegacyNumber, string Outcome, string? Rule, string? Detail, Guid? PersonId, string ResolutionStatus);

/// <summary>
/// Archive index load (spec 004 FR-003 to FR-011). Every source line ends as created, matched, rejected or pending review;
/// identities are created only through the Identity module contract, so migrated records obey live registration rules.
/// </summary>
public sealed class MigrationService(CommandRunner runner, IIdentityModule identity)
{
    public const string TransformVersion = "archive-index-csv/1.0";
    public const string SourceSystem = "archivo-papel-climesa";

    /// <summary>Readable JSON for the character sample: keep ñ and accents literal instead of \u escapes.</summary>
    private static readonly JsonSerializerOptions SampleJson = new() { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.Create(System.Text.Unicode.UnicodeRanges.All) };

    private static readonly string[] Header =
        ["numero_expediente", "nombres", "primer_apellido", "segundo_apellido", "apellido_casada", "nombre_completo", "fecha_nacimiento", "precision", "sexo", "dui", "municipio", "direccion"];

    public async Task<BatchSummary> LoadArchiveIndex(Actor actor, string sourceName, byte[] content)
    {
        if (!actor.Has("migration.batch.run"))
        {
            await runner.Denied(actor, "migration.batch.run", "migration_batch");
            throw new PermissionDenied("migration.batch.run");
        }
        var fingerprint = Convert.ToHexString(SHA256.HashData(content));

        // FR-006: same source and transformation version = no new effects.
        var existing = await runner.Db.InTx(tx => tx.Scalar<Guid>("select id from migration.batches where fingerprint=@f and transform_version=@v", ("f", fingerprint), ("v", TransformVersion)));
        if (existing != Guid.Empty)
        {
            var summary = await Get(actor, existing);
            return summary with { AlreadyApplied = true };
        }

        var text = DecodeUtf8(content);
        var rows = Csv.Parse(text);
        if (rows.Count == 0 || !rows[0].Select(h => h.Trim().ToLowerInvariant()).SequenceEqual(Header))
        {
            throw new DomainError("csv_header", $"Encabezado esperado: {string.Join(',', Header)}");
        }

        var batchId = Guid.NewGuid();
        await runner.Db.InTx(async tx =>
        {
            await tx.Exec("insert into migration.batches(id, source_name, fingerprint, transform_version, operator_username, started_at, status) values (@id,@s,@f,@v,@u,@t,'running')",
                ("id", batchId), ("s", sourceName), ("f", fingerprint), ("v", TransformVersion), ("u", actor.Username), ("t", runner.Clock.UtcNow));
            await runner.Audit.Write(tx, actor, new AuditEntry("create", "migration_batch", batchId.ToString(), Permission: "migration.batch.run", Detail: new { sourceName, fingerprint, transform = TransformVersion }));
        });

        var sample = new List<object>();
        for (var i = 1; i < rows.Count; i++)
        {
            var line = i + 1;
            var cells = rows[i];
            if (cells.All(string.IsNullOrWhiteSpace))
            {
                continue;
            }
            var (outcome, rule, detail, personId, legacy) = await ProcessRow(actor, batchId, fingerprint, cells);
            await runner.Db.InTx(tx => tx.Exec("""
                insert into migration.batch_items(batch_id, line_no, legacy_number, outcome, rule, detail, person_id, resolution_status)
                values (@b, @l, @n, @o, @r, @d, @p, @rs)
                """, ("b", batchId), ("l", line), ("n", legacy), ("o", outcome), ("r", rule), ("d", detail), ("p", personId),
                ("rs", outcome is "rejected" or "pending_review" ? "open" : "not_applicable")));

            // FR-007: compare source characters with what Identity stores, for the first created rows.
            if (outcome == "created" && personId is not null && sample.Count < 5)
            {
                var stored = await identity.GetSummary(personId.Value);
                var source = $"{Cell(cells, 2)} {Cell(cells, 3)}, {Cell(cells, 1)}".Trim();
                sample.Add(new { line, source, stored = stored?.DisplayName, identical = stored is not null && stored.DisplayName.StartsWith($"{Cell(cells, 2)} {Cell(cells, 3)}".Trim(), StringComparison.Ordinal) });
            }
        }

        return await runner.Db.InTx(async tx =>
        {
            var counts = await tx.One("""
                select count(*) as read_count,
                       count(*) filter (where outcome='created') as created,
                       count(*) filter (where outcome='matched') as matched,
                       count(*) filter (where outcome='rejected') as rejected,
                       count(*) filter (where outcome='pending_review') as pending
                from migration.batch_items where batch_id=@b
                """, r => new { Read = (int)r.GetInt64(0), C = (int)r.GetInt64(1), M = (int)r.GetInt64(2), R = (int)r.GetInt64(3), P = (int)r.GetInt64(4) }, ("b", batchId))!;
            var sourceRows = rows.Skip(1).Count(r => !r.All(string.IsNullOrWhiteSpace));
            // FR-004: read = created + matched + rejected + pending, and every source row has an item.
            var balanced = counts!.Read == sourceRows && counts.Read == counts.C + counts.M + counts.R + counts.P;
            await tx.Exec("""
                update migration.batches set read_count=@rd, created_count=@c, matched_count=@m, rejected_count=@r, pending_count=@p,
                    character_sample=@s::jsonb, status=@st, completed_at=@t where id=@id
                """, ("rd", sourceRows), ("c", counts.C), ("m", counts.M), ("r", counts.R), ("p", counts.P), ("s", JsonSerializer.Serialize(sample, SampleJson)),
                ("st", balanced ? "completed" : "failed_reconciliation"), ("t", runner.Clock.UtcNow), ("id", batchId));
            await runner.Audit.Write(tx, actor, new AuditEntry("update", "migration_batch", batchId.ToString(), Permission: "migration.batch.run",
                Detail: new { read = sourceRows, created = counts.C, matched = counts.M, rejected = counts.R, pending = counts.P, balanced }));
            return new BatchSummary(batchId, sourceName, fingerprint, TransformVersion, actor.Username, runner.Clock.UtcNow, runner.Clock.UtcNow,
                balanced ? "completed" : "failed_reconciliation", sourceRows, counts.C, counts.M, counts.R, counts.P, JsonSerializer.Serialize(sample, SampleJson), false);
        });
    }

    private async Task<(string Outcome, string? Rule, string? Detail, Guid? PersonId, string? Legacy)> ProcessRow(Actor actor, Guid batchId, string fingerprint, IReadOnlyList<string> c)
    {
        var legacy = Cell(c, 0);
        if (string.IsNullOrWhiteSpace(legacy))
        {
            return ("rejected", "legacy_number_missing", "Fila sin número de expediente en papel.", null, null);
        }
        var given = Cell(c, 1);
        var first = Cell(c, 2);
        var second = Cell(c, 3);
        var married = Cell(c, 4);
        var full = Cell(c, 5);

        // FR-011: a single name string must be separated by a person before load.
        if (string.IsNullOrWhiteSpace(given) && string.IsNullOrWhiteSpace(first))
        {
            if (string.IsNullOrWhiteSpace(full))
            {
                return ("rejected", "name_missing", "Fila sin nombre.", null, legacy);
            }
            return ("pending_review", "name_split_required", $"Separar nombres y apellidos antes de cargar. Sugerencia: {SuggestSplit(full)}", null, legacy);
        }
        if (string.IsNullOrWhiteSpace(given) || string.IsNullOrWhiteSpace(first))
        {
            return ("rejected", "name_incomplete", "Faltan nombres o primer apellido.", null, legacy);
        }

        DateOnly? birth = null;
        var precision = string.IsNullOrWhiteSpace(Cell(c, 7)) ? "exact" : Cell(c, 7).Trim().ToLowerInvariant();
        var rawBirth = Cell(c, 6);
        if (string.IsNullOrWhiteSpace(rawBirth))
        {
            precision = "unknown";
        }
        else if (!TryParseBirth(rawBirth, precision, out birth))
        {
            return ("rejected", "birth_invalid", $"Fecha '{rawBirth}' no corresponde a la precisión '{precision}'.", null, legacy);
        }
        var sex = Cell(c, 8).Trim().ToUpperInvariant() switch { "F" => "female", "M" => "male", "" => "not_recorded", _ => "invalid" };
        if (sex == "invalid")
        {
            return ("rejected", "sex_invalid", "Sexo debe ser F, M o vacío.", null, legacy);
        }
        var dui = Cell(c, 9);
        if (!string.IsNullOrWhiteSpace(dui) && !IsDuiValid(dui))
        {
            return ("rejected", "dui_invalid", "DUI con dígito verificador inválido; se conserva la fila para corrección.", null, legacy);
        }

        var person = new MigrationPerson(given.Trim(), first.Trim(), NullIfEmpty(second), NullIfEmpty(married), birth, precision, sex, NullIfEmpty(dui),
            NullIfEmpty(Cell(c, 10)), NullIfEmpty(Cell(c, 11)), legacy.Trim(), batchId.ToString("N")[..8]);

        var matches = await identity.FindMigrationMatches(actor, person);
        var exact = matches.Where(m => m.ExactIdentifier).ToList();
        if (exact.Count > 0)
        {
            var agreeing = exact.Where(m => m.NamesAgree).ToList();
            if (exact.Select(m => m.PersonId).Distinct().Count() > 1 || agreeing.Count == 0)
            {
                // FR-009: ambiguous legacy identifier goes to the conflict queue; nothing is merged or invented.
                return ("pending_review", "legacy_identifier_conflict",
                    $"El identificador ya existe en {string.Join(", ", exact.Select(m => $"{m.Mrn} ({m.Reason})"))} con nombres distintos.", null, legacy);
            }
            await Map(actor, batchId, legacy, agreeing[0].PersonId, "exact");
            return ("matched", null, $"Ya existe: {agreeing[0].Mrn} ({agreeing[0].Reason}).", agreeing[0].PersonId, legacy);
        }

        var created = await identity.RegisterFromMigration(actor, person, $"{fingerprint}:{legacy}");
        var certainty = "exact";
        string? detail = $"Creado {created.Mrn}.";
        foreach (var candidate in matches.Where(m => !m.ExactIdentifier && m.PersonId != created.PersonId))
        {
            // FR-008: probable duplicate opens a supervised case, never a merge.
            await identity.OpenDuplicateCase(actor, created.PersonId, candidate.PersonId, $"carga de archivo: {candidate.Reason}");
            certainty = "provisional";
            detail += $" Posible duplicado de {candidate.Mrn}: caso abierto.";
        }
        await Map(actor, batchId, legacy, created.PersonId, certainty);
        return ("created", certainty == "provisional" ? "possible_duplicate" : null, detail, created.PersonId, legacy);
    }

    private Task Map(Actor actor, Guid batchId, string legacy, Guid personId, string certainty) =>
        runner.Db.InTx(tx => tx.Exec("""
            insert into migration.legacy_mappings(id, source_system, legacy_value, person_id, certainty, decided_by, batch_id, created_at)
            values (@id, @s, @v, @p, @c, @u, @b, @t) on conflict do nothing
            """, ("id", Guid.NewGuid()), ("s", SourceSystem), ("v", legacy.Trim().ToUpperInvariant()), ("p", personId), ("c", certainty), ("u", actor.Username), ("b", batchId), ("t", runner.Clock.UtcNow)));

    public Task<BatchSummary> Get(Actor actor, Guid batchId) =>
        runner.Query(actor, "migration.view", "migration_batch", async tx =>
            await tx.One("""
                select id, source_name, fingerprint, transform_version, operator_username, started_at, completed_at, status,
                       read_count, created_count, matched_count, rejected_count, pending_count, character_sample::text
                from migration.batches where id=@id
                """, Map, ("id", batchId)) ?? throw new NotFoundError("lote"));

    public Task<IReadOnlyList<BatchSummary>> List(Actor actor) =>
        runner.Query<IReadOnlyList<BatchSummary>>(actor, "migration.view", "migration_batch", async tx =>
            await tx.Query("""
                select id, source_name, fingerprint, transform_version, operator_username, started_at, completed_at, status,
                       read_count, created_count, matched_count, rejected_count, pending_count, character_sample::text
                from migration.batches order by started_at desc
                """, Map));

    public Task<IReadOnlyList<BatchItemView>> Items(Actor actor, Guid batchId) =>
        runner.Query<IReadOnlyList<BatchItemView>>(actor, "migration.view", "migration_batch", async tx =>
            await tx.Query("select line_no, legacy_number, outcome, rule, detail, person_id, resolution_status from migration.batch_items where batch_id=@b order by line_no",
                r => new BatchItemView(r.GetInt32(0), r.Str("legacy_number"), r.GetString(2), r.Str("rule"), r.Str("detail"), r.Get<Guid?>("person_id"), r.GetString(6)), ("b", batchId)));

    private static BatchSummary Map(Npgsql.NpgsqlDataReader r) => new(
        r.GetGuid(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4), r.GetFieldValue<DateTimeOffset>(5), r.Get<DateTimeOffset?>("completed_at"), r.GetString(7),
        r.GetInt32(8), r.GetInt32(9), r.GetInt32(10), r.GetInt32(11), r.GetInt32(12), r.Str("character_sample"), false);

    // ---------- Parsing helpers ----------

    private static string Cell(IReadOnlyList<string> cells, int i) => i < cells.Count ? cells[i] : "";

    private static string? NullIfEmpty(string s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    /// <summary>Strict UTF-8 so mis-encoded files fail loudly instead of corrupting ñ and accents (FR-007).</summary>
    private static string DecodeUtf8(byte[] content)
    {
        try
        {
            var text = new UTF8Encoding(false, true).GetString(content);
            return text.TrimStart('﻿');
        }
        catch (DecoderFallbackException)
        {
            throw new DomainError("encoding", "El archivo no está en UTF-8. Exporte el índice como CSV UTF-8 para conservar ñ y tildes.");
        }
    }

    private static bool TryParseBirth(string raw, string precision, out DateOnly? date)
    {
        date = null;
        var ci = CultureInfo.InvariantCulture;
        switch (precision)
        {
            case "exact" when DateOnly.TryParseExact(raw.Trim(), ["yyyy-MM-dd", "dd/MM/yyyy"], ci, DateTimeStyles.None, out var d):
                date = d;
                return true;
            case "year_month" when DateOnly.TryParseExact(raw.Trim(), ["yyyy-MM", "MM/yyyy"], ci, DateTimeStyles.None, out var ym):
                date = ym;
                return true;
            case "year" when int.TryParse(raw.Trim(), NumberStyles.None, ci, out var y) && y is > 1880 and < 2100:
                date = new DateOnly(y, 1, 1);
                return true;
            default:
                return false;
        }
    }

    private static bool IsDuiValid(string raw)
    {
        var digits = new string([.. raw.Where(char.IsDigit)]);
        if (digits.Length != 9)
        {
            return false;
        }
        var sum = 0;
        for (var i = 0; i < 8; i++)
        {
            sum += (digits[i] - '0') * (9 - i);
        }
        return (10 - (sum % 10)) % 10 == digits[8] - '0';
    }

    /// <summary>Suggestion only; a person confirms (Fraser 2018: concatenated Hispanic surnames break linkage).</summary>
    public static string SuggestSplit(string full)
    {
        var tokens = full.Split(' ', StringSplitOptions.RemoveEmptyEntries).ToList();
        string? married = null;
        var deIndex = tokens.FindLastIndex(t => t.Equals("de", StringComparison.OrdinalIgnoreCase));
        if (deIndex > 0 && deIndex == tokens.Count - 2)
        {
            married = tokens[^1];
            tokens = tokens[..deIndex];
        }
        if (tokens.Count < 3)
        {
            return $"nombres='{tokens.FirstOrDefault()}', primer_apellido='{tokens.ElementAtOrDefault(1)}'";
        }
        if (married is not null && tokens.Count == 3)
        {
            // "ROSA AMINTA GUEVARA DE MOLINA": with a married surname, three tokens are more often two names and one surname.
            return $"nombres='{tokens[0]} {tokens[1]}', primer_apellido='{tokens[2]}', apellido_casada='{married}'";
        }
        var surnames = tokens[^2..];
        var given = string.Join(' ', tokens[..^2]);
        return $"nombres='{given}', primer_apellido='{surnames[0]}', segundo_apellido='{surnames[1]}'" + (married is null ? "" : $", apellido_casada='{married}'");
    }
}

/// <summary>Minimal RFC 4180 CSV reader (quoted fields, escaped quotes, CRLF).</summary>
public static class Csv
{
    public static List<List<string>> Parse(string text)
    {
        var rows = new List<List<string>>();
        var row = new List<string>();
        var field = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < text.Length; i++)
        {
            var ch = text[i];
            if (quoted)
            {
                if (ch == '"' && i + 1 < text.Length && text[i + 1] == '"')
                {
                    field.Append('"');
                    i++;
                }
                else if (ch == '"')
                {
                    quoted = false;
                }
                else
                {
                    field.Append(ch);
                }
                continue;
            }
            switch (ch)
            {
                case '"':
                    quoted = true;
                    break;
                case ',':
                    row.Add(field.ToString());
                    field.Clear();
                    break;
                case '\r':
                    break;
                case '\n':
                    row.Add(field.ToString());
                    field.Clear();
                    rows.Add(row);
                    row = [];
                    break;
                default:
                    field.Append(ch);
                    break;
            }
        }
        if (field.Length > 0 || row.Count > 0)
        {
            row.Add(field.ToString());
            rows.Add(row);
        }
        return rows;
    }
}
