using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Climesa.Platform.Data;
using Climesa.Platform.Errors;

namespace Climesa.Platform.Messaging;

/// <summary>
/// Idempotency keys (spec 000 FR-011, FR-012). Runs inside the command transaction: the key row and the effect commit together.
/// A concurrent duplicate blocks on the primary key until the first commits, then reads its stored response.
/// </summary>
public static class Idempotency
{
    public static string HashRequest(object request) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(request))));

    public static async Task<T> Run<T>(DbTx tx, string scope, string? key, object request, Func<Task<T>> effect)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return await effect();
        }
        var hash = HashRequest(request);
        var inserted = await tx.Exec(
            "insert into platform.idempotency(scope, key, request_hash, status) values (@s, @k, @h, 'in_progress') on conflict do nothing",
            ("s", scope), ("k", key), ("h", hash));
        if (inserted == 0)
        {
            var existing = await tx.One(
                "select request_hash, status, response::text from platform.idempotency where scope=@s and key=@k",
                r => new { Hash = r.GetString(0), Status = r.GetString(1), Response = r.Str("response") },
                ("s", scope), ("k", key));
            if (existing is null || existing.Hash != hash)
            {
                throw new ConflictError("idempotency_conflict", "La misma clave de idempotencia se usó con un contenido distinto.");
            }
            if (existing.Status != "completed" || existing.Response is null)
            {
                throw new ConflictError("idempotency_in_progress", "La operación original todavía está en curso.");
            }
            return JsonSerializer.Deserialize<T>(existing.Response)!;
        }

        var result = await effect();
        await tx.Exec("update platform.idempotency set status='completed', response=@r::jsonb where scope=@s and key=@k",
            ("r", JsonSerializer.Serialize(result)), ("s", scope), ("k", key));
        return result;
    }
}
