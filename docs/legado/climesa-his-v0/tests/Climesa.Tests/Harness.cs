using System.Diagnostics;
using System.Reflection;
using Climesa.Care.Application;
using Climesa.Identity.Application;
using Climesa.Migration.Application;
using Climesa.Platform.Audit;
using Climesa.Platform.Data;
using Climesa.Platform.Errors;
using Climesa.Platform.Messaging;
using Climesa.Platform.Policies;
using Climesa.Platform.Security;
using Climesa.Platform.Time;
using Climesa.Web.Infrastructure;
using Npgsql;

namespace Climesa.Tests;

/// <summary>
/// Minimal test runner. xUnit/NUnit could not be restored in the build environment (NuGet unreachable);
/// the harness keeps the same discipline: one method per requirement, clear assertion messages, non-zero exit on failure.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class TestAttribute(string requirement, int order = 0) : Attribute
{
    public string Requirement { get; } = requirement;
    public int Order { get; } = order;
}

public sealed class AssertionFailed(string message) : Exception(message);

public static class Assert
{
    public static void True(bool condition, string message)
    {
        if (!condition)
        {
            throw new AssertionFailed(message);
        }
    }

    public static void Equal<T>(T expected, T actual, string what)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual))
        {
            throw new AssertionFailed($"{what}: esperado <{expected}>, obtenido <{actual}>");
        }
    }

    public static async Task<TEx> Throws<TEx>(Func<Task> action, string what) where TEx : Exception
    {
        try
        {
            await action();
        }
        catch (TEx ex)
        {
            return ex;
        }
        catch (Exception other)
        {
            throw new AssertionFailed($"{what}: se esperaba {typeof(TEx).Name}, se obtuvo {other.GetType().Name}: {other.Message}");
        }
        throw new AssertionFailed($"{what}: se esperaba {typeof(TEx).Name} y no hubo excepción");
    }

    public static async Task<DomainError> Fails(Func<Task> action, string code, string what)
    {
        var ex = await Throws<DomainError>(action, what);
        Equal(code, ex.Code, what + " (código)");
        return ex;
    }
}

/// <summary>Services wired against the test database with a controllable clock.</summary>
public sealed class TestHost
{
    public const string AppCs = "Host=localhost;Database=climesa_test;Username=climesa_app;Password=dev_app;Include Error Detail=true";
    public const string OwnerCs = "Host=localhost;Database=climesa_test;Username=climesa_owner;Password=dev_owner";

    public TestHost()
    {
        Clock = new FakeClock(new DateTimeOffset(2026, 10, 13, 14, 0, 0, TimeSpan.Zero));
        Db = new Db(new DbOptions(Environment.GetEnvironmentVariable("CLIMESA_TEST_APP") ?? AppCs, Environment.GetEnvironmentVariable("CLIMESA_TEST_OWNER") ?? OwnerCs));
        Audit = new AuditWriter(Clock);
        Outbox = new OutboxWriter(Clock);
        Runner = new CommandRunner(Db, Audit, Outbox, Clock);
        Identity = new IdentityService(Runner, Composition.FacilityId);
        Care = new CareService(Runner, Identity);
        Migration = new MigrationService(Runner, Identity);
        Policies = new PolicyRegistry(Db);
        Verifier = new AuditVerifier(Db);
    }

    public FakeClock Clock { get; }
    public Db Db { get; }
    public AuditWriter Audit { get; }
    public OutboxWriter Outbox { get; }
    public CommandRunner Runner { get; }
    public IdentityService Identity { get; }
    public CareService Care { get; }
    public MigrationService Migration { get; }
    public PolicyRegistry Policies { get; }
    public AuditVerifier Verifier { get; }

    public static Actor ActorWith(string username, params string[] permissions) =>
        new(DemoSeeder.DeterministicId("test:" + username), username, username, new HashSet<string>(permissions), "JVPM", "T-" + username, new DateOnly(2027, 12, 31), "test", "127.0.0.1", Guid.NewGuid().ToString("N"));

    public static Actor Everything(string username = "tester") => ActorWith(username, [.. DemoSeeder.Roles.Values.SelectMany(r => r.Permissions).Distinct()]);

    public static async Task ResetDatabase()
    {
        await using var conn = new NpgsqlConnection(Environment.GetEnvironmentVariable("CLIMESA_TEST_OWNER") ?? OwnerCs);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("drop schema if exists migration cascade; drop schema if exists care cascade; drop schema if exists identity cascade; drop schema if exists platform cascade;", conn);
        await cmd.ExecuteNonQueryAsync();
        await Climesa.Platform.Data.Migrator.Apply(Environment.GetEnvironmentVariable("CLIMESA_TEST_OWNER") ?? OwnerCs, Composition.MigrationSources);
        await DemoSeeder.Seed(Environment.GetEnvironmentVariable("CLIMESA_TEST_OWNER") ?? OwnerCs, Composition.FacilityId);
    }

    /// <summary>Runs SQL as the PostgreSQL superuser, the way an insider with server access would.</summary>
    public static void AsSuperuser(string sql)
    {
        var psi = new ProcessStartInfo("su", ["postgres", "-c", $"psql -q -d climesa_test -c \"{sql.Replace("\"", "\\\"")}\""]) { RedirectStandardError = true, RedirectStandardOutput = true };
        using var p = Process.Start(psi)!;
        p.WaitForExit();
        if (p.ExitCode != 0)
        {
            throw new InvalidOperationException(p.StandardError.ReadToEnd());
        }
    }
}

public static class Program
{
    public static async Task<int> Main(string[] args)
    {
        var filter = args.FirstOrDefault();
        var tests = typeof(Program).Assembly.GetTypes()
            .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.Static))
            .Select(m => (Method: m, Attr: m.GetCustomAttribute<TestAttribute>()))
            .Where(x => x.Attr is not null && (filter is null || x.Method.Name.Contains(filter, StringComparison.OrdinalIgnoreCase) || x.Attr.Requirement.Contains(filter, StringComparison.OrdinalIgnoreCase)))
            .OrderBy(x => x.Attr!.Order).ThenBy(x => x.Method.DeclaringType!.Name).ThenBy(x => x.Method.Name)
            .ToList();

        Console.WriteLine($"Reiniciando base de pruebas y aplicando migraciones...");
        await TestHost.ResetDatabase();

        var passed = 0;
        var failed = new List<string>();
        var sw = Stopwatch.StartNew();
        foreach (var (method, attr) in tests)
        {
            var name = $"{method.DeclaringType!.Name}.{method.Name}";
            try
            {
                var result = method.Invoke(null, null);
                if (result is Task task)
                {
                    await task;
                }
                passed++;
                Console.WriteLine($"  PASS  [{attr!.Requirement}] {name}");
            }
            catch (Exception ex)
            {
                var inner = ex is TargetInvocationException tie ? tie.InnerException! : ex;
                failed.Add(name);
                Console.WriteLine($"  FAIL  [{attr!.Requirement}] {name}: {inner.GetType().Name}: {inner.Message}");
            }
        }
        Console.WriteLine($"\n{passed}/{tests.Count} pruebas aprobadas en {sw.Elapsed.TotalSeconds:0.0} s");
        return failed.Count == 0 ? 0 : 1;
    }
}
