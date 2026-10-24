using System.Text.Json;
using Climesa.Platform.Data;
using Climesa.Platform.Errors;

namespace Climesa.Platform.Policies;

/// <summary>Versioned configuration with legal source and approver (spec 000 FR-022, FR-023). No hard-coded fallbacks.</summary>
public sealed class PolicyRegistry(Db db)
{
    public async Task<T> Get<T>(string key, DateTimeOffset at)
    {
        var json = await db.InTx(tx => tx.Scalar<string>(
            "select value::text from platform.policies where key=@k and effective @> @at", ("k", key), ("at", at)));
        if (json is null)
        {
            throw new DomainError("policy_missing", $"No hay valor de política vigente para '{key}'.");
        }
        return JsonSerializer.Deserialize<T>(json)!;
    }
}
