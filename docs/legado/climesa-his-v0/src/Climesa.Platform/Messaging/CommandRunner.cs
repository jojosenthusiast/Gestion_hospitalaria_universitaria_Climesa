using Climesa.Platform.Audit;
using Climesa.Platform.Data;
using Climesa.Platform.Errors;
using Climesa.Platform.Security;
using Climesa.Platform.Time;

namespace Climesa.Platform.Messaging;

/// <summary>
/// The one path every module command takes: permission check, transaction, idempotency, effect, audit, outbox.
/// A denied attempt is audited in its own transaction because the command transaction never starts.
/// </summary>
public sealed class CommandRunner(Db db, AuditWriter audit, OutboxWriter outbox, IClock clock)
{
    public IClock Clock { get; } = clock;
    public AuditWriter Audit { get; } = audit;
    public OutboxWriter Outbox { get; } = outbox;
    public Db Db { get; } = db;

    public async Task<T> Run<T>(Actor actor, string permission, string scope, string? idempotencyKey, object request,
        Func<DbTx, Task<T>> effect, string entityType)
    {
        if (!actor.Has(permission))
        {
            await Denied(actor, permission, entityType);
            throw new PermissionDenied(permission);
        }
        return await Db.InTx(tx => Idempotency.Run(tx, scope, idempotencyKey, request, () => effect(tx)));
    }

    public Task<T> Query<T>(Actor actor, string permission, string entityType, Func<DbTx, Task<T>> read) =>
        Run(actor, permission, "query", null, new { }, read, entityType);

    public Task Denied(Actor actor, string permission, string entityType) =>
        Db.InTx(tx => Audit.Write(tx, actor, new AuditEntry("access", entityType, Permission: permission, Outcome: "denied")));
}
