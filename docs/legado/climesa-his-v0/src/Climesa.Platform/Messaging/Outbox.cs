using System.Text.Json;
using Climesa.Platform.Data;
using Climesa.Platform.Time;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Climesa.Platform.Messaging;

public sealed record IntegrationEvent(Guid EventId, string EventType, string AggregateType, string AggregateId, JsonElement Payload, DateTimeOffset OccurredAt);

/// <summary>Writes events in the same transaction as the state change (spec 000 FR-013).</summary>
public sealed class OutboxWriter(IClock clock)
{
    public Task Enqueue(DbTx tx, string eventType, string aggregateType, string aggregateId, object payload, string? correlationId) =>
        tx.Exec("""
            insert into platform.outbox(event_id, event_type, aggregate_type, aggregate_id, payload, occurred_at, correlation_id)
            values (@id, @t, @at, @aid, @p::jsonb, @o, @c)
            """,
            ("id", Guid.NewGuid()), ("t", eventType), ("at", aggregateType), ("aid", aggregateId),
            ("p", JsonSerializer.Serialize(payload)), ("o", clock.UtcNow), ("c", correlationId));
}

/// <summary>A consumer module handles events idempotently; the inbox row commits with its effect (FR-015).</summary>
public interface IEventHandler
{
    string Consumer { get; }
    bool Handles(string eventType);
    Task Handle(DbTx tx, IntegrationEvent evt);
}

/// <summary>At-least-once delivery in sequence order; inbox makes processing exactly-once per consumer (FR-014, FR-016).</summary>
public sealed class OutboxDispatcher(Db db, IEnumerable<IEventHandler> handlers, IClock clock)
{
    public async Task<int> DispatchPending(int batchSize = 100)
    {
        var pending = await db.InTx(tx => tx.Query(
            "select event_id, event_type, aggregate_type, aggregate_id, payload::text, occurred_at from platform.outbox where published_at is null order by seq limit @n",
            r => new IntegrationEvent(r.GetGuid(0), r.GetString(1), r.GetString(2), r.GetString(3), JsonDocument.Parse(r.GetString(4)).RootElement.Clone(), r.GetFieldValue<DateTimeOffset>(5)),
            ("n", batchSize)));

        var delivered = 0;
        foreach (var evt in pending)
        {
            try
            {
                foreach (var handler in handlers.Where(h => h.Handles(evt.EventType)))
                {
                    await db.InTx(async tx =>
                    {
                        var fresh = await tx.Exec("insert into platform.inbox(consumer, event_id) values (@c, @e) on conflict do nothing",
                            ("c", handler.Consumer), ("e", evt.EventId));
                        if (fresh == 1)
                        {
                            await handler.Handle(tx, evt);
                        }
                    });
                }
                await db.InTx(tx => tx.Exec("update platform.outbox set published_at=@t where event_id=@e", ("t", clock.UtcNow), ("e", evt.EventId)));
                delivered++;
            }
            catch (Exception ex)
            {
                await db.InTx(tx => tx.Exec("update platform.outbox set attempts = attempts + 1, last_error=@m where event_id=@e",
                    ("m", ex.Message.Length > 500 ? ex.Message[..500] : ex.Message), ("e", evt.EventId)));
            }
        }
        return delivered;
    }
}

public sealed class OutboxBackgroundService(OutboxDispatcher dispatcher, ILogger<OutboxBackgroundService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await dispatcher.DispatchPending();
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogError(ex, "Outbox dispatch failed");
            }
            await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }
    }
}
