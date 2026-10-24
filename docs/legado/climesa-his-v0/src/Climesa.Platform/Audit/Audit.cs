using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Climesa.Platform.Data;
using Climesa.Platform.Security;
using Climesa.Platform.Time;

namespace Climesa.Platform.Audit;

public sealed record AuditEntry(
    string Action,
    string EntityType,
    string? EntityId = null,
    Guid? PatientId = null,
    string? Permission = null,
    string Outcome = "success",
    string? Purpose = null,
    object? Detail = null);

/// <summary>
/// Writes audit events in the caller's transaction (fail closed, FR-018) and chains them by SHA-256 (FR-020).
/// A transaction-scoped advisory lock serializes the chain head; spec 000 plan records this as a known bottleneck to measure.
/// </summary>
public sealed class AuditWriter(IClock clock)
{
    private const long ChainLock = 7_300_001;

    public async Task Write(DbTx tx, Actor actor, AuditEntry entry)
    {
        await tx.Exec("select pg_advisory_xact_lock(@k)", ("k", ChainLock));
        var prev = await tx.Scalar<byte[]>("select hash from platform.audit_events order by seq desc limit 1") ?? new byte[32];
        var eventId = Guid.NewGuid();
        var at = Microseconds(clock.UtcNow);
        var detail = entry.Detail is null ? "{}" : JsonSerializer.Serialize(entry.Detail);
        var canonical = Canonical(eventId, at, actor, entry, detail);
        var hash = SHA256.HashData([.. prev, .. Encoding.UTF8.GetBytes(canonical)]);

        await tx.Exec("""
            insert into platform.audit_events(event_id, recorded_at, actor_user_id, actor_username, workstation, ip, permission, action,
                entity_type, entity_id, patient_id, purpose, outcome, correlation_id, detail, prev_hash, hash)
            values (@id, @at, @uid, @un, @ws, @ip, @perm, @action, @etype, @eid, @pid, @purpose, @outcome, @corr, @detail::jsonb, @prev, @hash)
            """,
            ("id", eventId), ("at", at), ("uid", actor.UserId == Guid.Empty ? null : actor.UserId), ("un", actor.Username),
            ("ws", actor.Workstation), ("ip", actor.Ip), ("perm", entry.Permission), ("action", entry.Action),
            ("etype", entry.EntityType), ("eid", entry.EntityId), ("pid", entry.PatientId), ("purpose", entry.Purpose),
            ("outcome", entry.Outcome), ("corr", actor.CorrelationId), ("detail", detail), ("prev", prev), ("hash", hash));
    }

    /// <summary>PostgreSQL stores microseconds; hash what will be read back.</summary>
    public static DateTimeOffset Microseconds(DateTimeOffset t) => new(t.UtcTicks - (t.UtcTicks % 10), TimeSpan.Zero);

    /// <summary>Canonical text hashed for each record. Must stay byte-identical to what the verifier rebuilds.</summary>
    internal static string Canonical(Guid eventId, DateTimeOffset at, Actor actor, AuditEntry e, string detailJson) =>
        Canonical(eventId, at, actor.UserId == Guid.Empty ? null : actor.UserId, actor.Username, e.Permission, e.Action, e.EntityType, e.EntityId, e.PatientId, e.Outcome, actor.CorrelationId, detailJson);

    internal static string Canonical(Guid eventId, DateTimeOffset at, Guid? userId, string? username, string? permission, string action,
        string entityType, string? entityId, Guid? patientId, string outcome, string? correlation, string detailJson)
    {
        var normalizedDetail = CanonicalJson.Normalize(detailJson);
        return string.Join('|',
            eventId.ToString("N"),
            at.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.ffffffZ", System.Globalization.CultureInfo.InvariantCulture),
            userId?.ToString("N") ?? "", username ?? "", permission ?? "", action, entityType, entityId ?? "",
            patientId?.ToString("N") ?? "", outcome, correlation ?? "", normalizedDetail);
    }
}

public sealed record ChainCheckResult(bool Ok, long Checked, long? BrokenAtSeq, string Message);

/// <summary>Recomputes the hash chain (spec 000 FR-020, spec 005 FR-005).</summary>
public sealed class AuditVerifier(Db db)
{
    public Task<ChainCheckResult> Verify() => db.InTx(async tx =>
    {
        var rows = await tx.Query("""
            select seq, event_id, recorded_at, actor_user_id, actor_username, permission, action, entity_type, entity_id, patient_id,
                   outcome, correlation_id, detail::text, prev_hash, hash
            from platform.audit_events order by seq
            """,
            r => new
            {
                Seq = r.GetInt64(0), Id = r.GetGuid(1), At = r.GetFieldValue<DateTimeOffset>(2), Uid = r.Get<Guid?>("actor_user_id"),
                Un = r.Str("actor_username"), Perm = r.Str("permission"), Action = r.GetString(6), EType = r.GetString(7),
                EId = r.Str("entity_id"), Pid = r.Get<Guid?>("patient_id"), Outcome = r.GetString(10), Corr = r.Str("correlation_id"),
                Detail = r.GetString(12), Prev = r.GetFieldValue<byte[]>(13), Hash = r.GetFieldValue<byte[]>(14),
            });
        var expectedPrev = new byte[32];
        long count = 0;
        foreach (var row in rows)
        {
            count++;
            if (!row.Prev.AsSpan().SequenceEqual(expectedPrev))
            {
                return new ChainCheckResult(false, count, row.Seq, $"Enlace roto: prev_hash no coincide en el registro {row.Seq}.");
            }
            var canonical = AuditWriter.Canonical(row.Id, row.At, row.Uid, row.Un, row.Perm, row.Action, row.EType, row.EId, row.Pid, row.Outcome, row.Corr, row.Detail);
            var hash = SHA256.HashData([.. row.Prev, .. Encoding.UTF8.GetBytes(canonical)]);
            if (!hash.AsSpan().SequenceEqual(row.Hash))
            {
                return new ChainCheckResult(false, count, row.Seq, $"Contenido alterado en el registro {row.Seq}.");
            }
            expectedPrev = row.Hash;
        }
        return new ChainCheckResult(true, count, null, $"Cadena íntegra: {count} registros verificados.");
    });
}

/// <summary>JSON with object keys sorted recursively and no insignificant whitespace, so jsonb round-trips hash the same.</summary>
public static class CanonicalJson
{
    public static string Normalize(string json)
    {
        var node = JsonNode.Parse(json);
        return node is null ? "null" : Sort(node)?.ToJsonString() ?? "null";
    }

    private static JsonNode? Sort(JsonNode? node) => node switch
    {
        JsonObject obj => new JsonObject(obj.OrderBy(p => p.Key, StringComparer.Ordinal).Select(p => KeyValuePair.Create(p.Key, Sort(p.Value?.DeepClone())))),
        JsonArray arr => new JsonArray([.. arr.Select(n => Sort(n?.DeepClone()))]),
        _ => node?.DeepClone(),
    };
}
