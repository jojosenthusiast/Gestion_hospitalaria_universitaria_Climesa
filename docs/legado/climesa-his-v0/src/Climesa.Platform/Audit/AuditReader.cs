using Climesa.Platform.Data;
using Climesa.Platform.Errors;
using Climesa.Platform.Security;

namespace Climesa.Platform.Audit;

public sealed record AuditRow(long Seq, DateTimeOffset RecordedAt, string? Username, string Action, string EntityType, string? EntityId, Guid? PatientId,
    string? Permission, string Outcome, string Detail, string HashPrefix);

/// <summary>Read side for auditors. Reading the audit trail is itself audited.</summary>
public sealed class AuditReader(Db db, AuditWriter writer)
{
    public async Task<IReadOnlyList<AuditRow>> Recent(Actor actor, int take = 200, Guid? patientId = null)
    {
        if (!actor.Has("audit.view"))
        {
            await db.InTx(tx => writer.Write(tx, actor, new AuditEntry("access", "audit", Permission: "audit.view", Outcome: "denied")));
            throw new PermissionDenied("audit.view");
        }
        return await db.InTx(async tx =>
        {
            var rows = await tx.Query("""
                select seq, recorded_at, actor_username, action, entity_type, entity_id, patient_id, permission, outcome, detail::text, encode(hash, 'hex')
                from platform.audit_events where (@p::uuid is null or patient_id = @p) order by seq desc limit @n
                """,
                r => new AuditRow(r.GetInt64(0), r.GetFieldValue<DateTimeOffset>(1), r.Str("actor_username"), r.GetString(3), r.GetString(4), r.Str("entity_id"),
                    r.Get<Guid?>("patient_id"), r.Str("permission"), r.GetString(8), r.GetString(9), r.GetString(10)[..12]),
                ("p", patientId), ("n", take));
            await writer.Write(tx, actor, new AuditEntry("read", "audit", Permission: "audit.view", PatientId: patientId, Detail: new { rows = rows.Count }));
            return rows;
        });
    }
}
