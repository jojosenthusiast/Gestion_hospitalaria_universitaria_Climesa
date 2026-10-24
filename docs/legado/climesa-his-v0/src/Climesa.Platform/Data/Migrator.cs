using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using Npgsql;

namespace Climesa.Platform.Data;

/// <summary>An assembly that ships ordered SQL scripts as embedded resources named NNNN_name.sql.</summary>
public sealed record MigrationSource(string Module, Assembly Assembly);

/// <summary>
/// Applies embedded SQL scripts in order using the owner role. Each script runs in its own transaction
/// and is recorded with its hash; a changed script that was already applied is an error, not a silent re-run.
/// Extensions (btree_gist, pg_trgm, pgcrypto) are created beforehand by the DBA script in /ops.
/// </summary>
public static class Migrator
{
    public static async Task Apply(string ownerConnectionString, IEnumerable<MigrationSource> sources)
    {
        await using var conn = new NpgsqlConnection(ownerConnectionString);
        await conn.OpenAsync();
        await using (var init = new NpgsqlCommand(
            "create schema if not exists platform; " +
            "create table if not exists platform.schema_migrations (module text not null, script text not null, sha256 text not null, applied_at timestamptz not null default now(), primary key (module, script));",
            conn))
        {
            await init.ExecuteNonQueryAsync();
        }

        foreach (var source in sources)
        {
            var scripts = source.Assembly.GetManifestResourceNames()
                .Where(n => n.EndsWith(".sql", StringComparison.Ordinal))
                .OrderBy(n => n, StringComparer.Ordinal)
                .ToList();
            foreach (var resource in scripts)
            {
                using var stream = source.Assembly.GetManifestResourceStream(resource)!;
                using var reader = new StreamReader(stream, Encoding.UTF8);
                var sql = await reader.ReadToEndAsync();
                var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(sql)));
                var name = resource[(resource.IndexOf(".Sql.", StringComparison.Ordinal) + 5)..];

                await using var check = new NpgsqlCommand("select sha256 from platform.schema_migrations where module=@m and script=@s", conn);
                check.Parameters.AddWithValue("m", source.Module);
                check.Parameters.AddWithValue("s", name);
                var existing = (string?)await check.ExecuteScalarAsync();
                if (existing is not null)
                {
                    if (existing != hash)
                    {
                        throw new InvalidOperationException($"Applied migration {source.Module}/{name} was modified after being applied.");
                    }
                    continue;
                }

                await using var tx = await conn.BeginTransactionAsync();
                await using (var apply = new NpgsqlCommand(sql, conn, tx))
                {
                    await apply.ExecuteNonQueryAsync();
                }
                await using (var record = new NpgsqlCommand("insert into platform.schema_migrations(module, script, sha256) values (@m,@s,@h)", conn, tx))
                {
                    record.Parameters.AddWithValue("m", source.Module);
                    record.Parameters.AddWithValue("s", name);
                    record.Parameters.AddWithValue("h", hash);
                    await record.ExecuteNonQueryAsync();
                }
                await tx.CommitAsync();
            }
        }
    }

    public static MigrationSource PlatformSource => new("platform", typeof(Migrator).Assembly);
}
