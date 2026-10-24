using System.Data;
using Npgsql;

namespace Climesa.Platform.Data;

public sealed record DbOptions(string AppConnectionString, string OwnerConnectionString);

/// <summary>Thin wrapper around Npgsql. Every command runs in one transaction with its audit and outbox rows.</summary>
public sealed class Db : IAsyncDisposable
{
    private readonly NpgsqlDataSource _source;

    public Db(DbOptions options)
    {
        Options = options;
        _source = NpgsqlDataSource.Create(options.AppConnectionString);
    }

    public DbOptions Options { get; }

    public async Task<T> InTx<T>(Func<DbTx, Task<T>> work, IsolationLevel isolation = IsolationLevel.ReadCommitted, CancellationToken ct = default)
    {
        await using var conn = await _source.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(isolation, ct);
        var result = await work(new DbTx(conn, tx));
        await tx.CommitAsync(ct);
        return result;
    }

    public Task InTx(Func<DbTx, Task> work, CancellationToken ct = default) =>
        InTx<bool>(async t => { await work(t); return true; }, IsolationLevel.ReadCommitted, ct);

    public async Task<NpgsqlConnection> Open(CancellationToken ct = default) => await _source.OpenConnectionAsync(ct);

    public ValueTask DisposeAsync() => _source.DisposeAsync();
}

public sealed class DbTx(NpgsqlConnection connection, NpgsqlTransaction transaction)
{
    public NpgsqlConnection Connection { get; } = connection;
    public NpgsqlTransaction Transaction { get; } = transaction;

    public NpgsqlCommand Cmd(string sql, params (string Name, object? Value)[] args)
    {
        var cmd = new NpgsqlCommand(sql, Connection, Transaction);
        foreach (var (name, value) in args)
        {
            cmd.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }
        return cmd;
    }

    public async Task<int> Exec(string sql, params (string, object?)[] args)
    {
        await using var cmd = Cmd(sql, args);
        return await cmd.ExecuteNonQueryAsync();
    }

    public async Task<T?> Scalar<T>(string sql, params (string, object?)[] args)
    {
        await using var cmd = Cmd(sql, args);
        var value = await cmd.ExecuteScalarAsync();
        return value is null or DBNull ? default : (T)value;
    }

    public async Task<List<T>> Query<T>(string sql, Func<NpgsqlDataReader, T> map, params (string, object?)[] args)
    {
        await using var cmd = Cmd(sql, args);
        await using var reader = await cmd.ExecuteReaderAsync();
        var list = new List<T>();
        while (await reader.ReadAsync())
        {
            list.Add(map(reader));
        }
        return list;
    }

    public async Task<T?> One<T>(string sql, Func<NpgsqlDataReader, T> map, params (string, object?)[] args) where T : class
    {
        var rows = await Query(sql, map, args);
        return rows.Count == 0 ? null : rows[0];
    }
}

public static class ReaderExtensions
{
    public static T? Get<T>(this NpgsqlDataReader r, string column)
    {
        var i = r.GetOrdinal(column);
        return r.IsDBNull(i) ? default : r.GetFieldValue<T>(i);
    }

    public static string? Str(this NpgsqlDataReader r, string column) => r.Get<string>(column);
}

public static class PgErrors
{
    public const string UniqueViolation = "23505";
    public const string ExclusionViolation = "23P01";
    public const string CheckViolation = "23514";
    public const string InsufficientPrivilege = "42501";

    public static bool Is(Exception ex, string sqlState, string? constraint = null) =>
        ex is PostgresException pg && pg.SqlState == sqlState && (constraint is null || pg.ConstraintName == constraint);
}
