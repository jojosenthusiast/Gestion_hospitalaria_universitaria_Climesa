using System.Security.Claims;
using Climesa.Care.Application;
using Climesa.Identity.Application;
using Climesa.Identity.Contracts;
using Climesa.Migration.Application;
using Climesa.Platform.Audit;
using Climesa.Platform.Data;
using Climesa.Platform.Messaging;
using Climesa.Platform.Policies;
using Climesa.Platform.Security;
using Climesa.Platform.Time;

namespace Climesa.Web.Infrastructure;

public static class Composition
{
    /// <summary>The facility id is fixed per installation (spec 000 FR-024). One facility today.</summary>
    public static readonly Guid FacilityId = Guid.Parse("6c1a3e2b-0000-4000-8000-000000000001");

    public static IServiceCollection AddClimesa(this IServiceCollection services, DbOptions options, IClock clock)
    {
        services.AddSingleton(options);
        services.AddSingleton(clock);
        services.AddSingleton<Db>();
        services.AddSingleton<AuditWriter>();
        services.AddSingleton<AuditVerifier>();
        services.AddSingleton<AuditReader>();
        services.AddSingleton<OutboxWriter>();
        services.AddSingleton<CommandRunner>();
        services.AddSingleton<PolicyRegistry>();
        services.AddSingleton<UserStore>();
        services.AddSingleton(sp => new IdentityService(sp.GetRequiredService<CommandRunner>(), FacilityId));
        services.AddSingleton<IIdentityModule>(sp => sp.GetRequiredService<IdentityService>());
        services.AddSingleton<CareService>();
        services.AddSingleton<MigrationService>();
        services.AddSingleton<OutboxDispatcher>();
        services.AddScoped<ActorAccessor>();
        return services;
    }

    public static IEnumerable<MigrationSource> MigrationSources =>
    [
        Migrator.PlatformSource,
        new MigrationSource("identity", typeof(IdentityService).Assembly),
        new MigrationSource("care", typeof(CareService).Assembly),
        new MigrationSource("migration", typeof(MigrationService).Assembly),
    ];
}

/// <summary>Builds the acting user's context once per request from the cookie identity.</summary>
public sealed class ActorAccessor(IHttpContextAccessor http, UserStore users)
{
    private Actor? _actor;

    public async Task<Actor?> Current()
    {
        if (_actor is not null)
        {
            return _actor;
        }
        var ctx = http.HttpContext;
        var id = ctx?.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (ctx is null || id is null || !Guid.TryParse(id, out var userId))
        {
            return null;
        }
        _actor = await users.BuildActor(userId, ctx.Request.Headers["X-Workstation"].FirstOrDefault() ?? "web",
            ctx.Connection.RemoteIpAddress?.ToString(), ctx.TraceIdentifier);
        return _actor;
    }
}
