using Climesa.Platform.Audit;
using Climesa.Platform.Data;
using Climesa.Platform.Errors;
using Climesa.Platform.Messaging;
using Npgsql;

namespace Climesa.Tests;

public static class PlatformTests
{
    [Test("000 FR-011")]
    public static async Task IdempotencySameKeySameResult()
    {
        var h = new TestHost();
        var calls = 0;
        async Task<Guid> Run() => await h.Runner.Run(TestHost.Everything(), "identity.search", "test.idem", "key-same", new { a = 1 }, async tx =>
        {
            calls++;
            await Task.CompletedTask;
            return Guid.NewGuid();
        }, "test");
        var first = await Run();
        var second = await Run();
        Assert.Equal(first, second, "misma respuesta");
        Assert.Equal(1, calls, "un solo efecto");
    }

    [Test("000 FR-012")]
    public static async Task IdempotencyKeyReuseWithDifferentContentFails()
    {
        var h = new TestHost();
        await h.Runner.Run(TestHost.Everything(), "identity.search", "test.idem", "key-conflict", new { amount = 50 }, _ => Task.FromResult(1), "test");
        await Assert.Fails(() => h.Runner.Run(TestHost.Everything(), "identity.search", "test.idem", "key-conflict", new { amount = 60 }, _ => Task.FromResult(2), "test"),
            "idempotency_conflict", "misma clave, otro contenido");
    }

    [Test("000 FR-018")]
    public static async Task DeniedAttemptIsAudited()
    {
        var h = new TestHost();
        var actor = TestHost.ActorWith("sin-permisos");
        await Assert.Throws<PermissionDenied>(() => h.Identity.Search(actor, new("Ana", null, null, null)), "búsqueda sin permiso");
        var denied = await h.Db.InTx(tx => tx.Scalar<long>("select count(*) from platform.audit_events where actor_username='sin-permisos' and outcome='denied' and permission='identity.search'"));
        Assert.Equal(1L, denied, "intento denegado registrado");
    }

    [Test("000 FR-019")]
    public static async Task ApplicationRoleCannotRewriteAudit()
    {
        var h = new TestHost();
        await h.Db.InTx(tx => h.Audit.Write(tx, TestHost.Everything(), new AuditEntry("test", "test")));
        var ex = await Assert.Throws<PostgresException>(() => h.Db.InTx(tx => tx.Exec("update platform.audit_events set action='edited'")), "UPDATE con rol de aplicación");
        Assert.Equal(PgErrors.InsufficientPrivilege, ex.SqlState, "permiso denegado por la base de datos");
        await Assert.Throws<PostgresException>(() => h.Db.InTx(tx => tx.Exec("delete from platform.audit_events")), "DELETE con rol de aplicación");
    }

    [Test("000 FR-023")]
    public static async Task PolicyByDateAndMissing()
    {
        var h = new TestHost();
        await using (var conn = new NpgsqlConnection(TestHost.OwnerCs))
        {
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand("""
                insert into platform.policies(key, value, effective, source_reference, approved_by) values
                ('iva.rate', '0.13', tstzrange('2020-01-01', null), 'Ley IVA Art. 54', 'contador')
                """, conn);
            await cmd.ExecuteNonQueryAsync();
        }
        Assert.Equal(0.13m, await h.Policies.Get<decimal>("iva.rate", h.Clock.UtcNow), "valor vigente");
        await Assert.Fails(() => h.Policies.Get<decimal>("iva.rate", new DateTimeOffset(2019, 1, 1, 0, 0, 0, TimeSpan.Zero)), "policy_missing", "sin valor vigente en esa fecha");
        await Assert.Fails(() => h.Policies.Get<int>("no.existe", h.Clock.UtcNow), "policy_missing", "clave inexistente");
    }

    [Test("000 FR-014")]
    public static async Task OutboxDeliversExactlyOncePerConsumer()
    {
        var h = new TestHost();
        var handler = new CountingHandler();
        var dispatcher = new OutboxDispatcher(h.Db, [handler], h.Clock);
        await dispatcher.DispatchPending(10_000);
        var before = handler.Count;
        await h.Db.InTx(tx => h.Outbox.Enqueue(tx, "TestEvent", "test", "1", new { x = 1 }, null));
        await dispatcher.DispatchPending();
        await dispatcher.DispatchPending();
        Assert.Equal(before + 1, handler.Count, "entregado una vez");
        // Simulate a crash after handling but before marking published: the inbox prevents a second effect.
        await using (var conn = new NpgsqlConnection(TestHost.OwnerCs))
        {
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand("update platform.outbox set published_at = null where event_type='TestEvent'", conn);
            await cmd.ExecuteNonQueryAsync();
        }
        await dispatcher.DispatchPending();
        Assert.Equal(before + 1, handler.Count, "reentrega sin segundo efecto");
    }

    private sealed class CountingHandler : IEventHandler
    {
        public int Count { get; private set; }
        public string Consumer => "test-consumer";
        public bool Handles(string eventType) => eventType == "TestEvent";
        public Task Handle(DbTx tx, IntegrationEvent evt)
        {
            Count++;
            return Task.CompletedTask;
        }
    }

    [Test("000 FR-020", order: 100)]
    public static async Task AuditChainDetectsTampering()
    {
        var h = new TestHost();
        var ok = await h.Verifier.Verify();
        Assert.True(ok.Ok, "la cadena debe estar íntegra antes de alterarla: " + ok.Message);
        var target = await h.Db.InTx(tx => tx.Scalar<long>("select seq from platform.audit_events order by seq limit 1 offset 3"));
        TestHost.AsSuperuser($"update platform.audit_events set actor_username = 'alguien-mas' where seq = {target}");
        var broken = await h.Verifier.Verify();
        Assert.True(!broken.Ok, "la verificación debe fallar");
        Assert.Equal(target, broken.BrokenAtSeq, "señala el registro alterado");
    }
}
