using System.Security.Cryptography;
using Climesa.Platform.Data;
using Climesa.Platform.Errors;

namespace Climesa.Platform.Security;

/// <summary>Who is acting, from where, and with which permissions (spec 000 FR-005 to FR-010).</summary>
public sealed record Actor(
    Guid UserId,
    string Username,
    string DisplayName,
    IReadOnlySet<string> Permissions,
    string? ProfessionalBoard,
    string? ProfessionalNumber,
    DateOnly? LicenseValidUntil,
    string? Workstation,
    string? Ip,
    string CorrelationId)
{
    public bool Has(string permission) => Permissions.Contains(permission);

    public void Require(string permission)
    {
        if (!Has(permission))
        {
            throw new PermissionDenied(permission);
        }
    }

    /// <summary>Privilege checked at the act (R17): permission plus a professional license valid on that date.</summary>
    public void RequireLicensed(string permission, DateOnly onDate)
    {
        Require(permission);
        if (ProfessionalNumber is null || LicenseValidUntil is null || LicenseValidUntil < onDate)
        {
            throw new DomainError("license_invalid", "El acto requiere inscripción profesional vigente en la junta de vigilancia.");
        }
    }

    public static Actor System(string correlationId = "system") =>
        new(Guid.Empty, "system", "Sistema", new HashSet<string>(), null, null, null, "server", null, correlationId);
}

public static class PasswordHasher
{
    private const int Iterations = 210_000;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA512, 32);
        return $"pbkdf2-sha512${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(key)}";
    }

    public static bool Verify(string password, string stored)
    {
        var parts = stored.Split('$');
        if (parts.Length != 4 || parts[0] != "pbkdf2-sha512")
        {
            return false;
        }
        var iterations = int.Parse(parts[1], System.Globalization.CultureInfo.InvariantCulture);
        var salt = Convert.FromBase64String(parts[2]);
        var expected = Convert.FromBase64String(parts[3]);
        var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA512, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
}

public sealed record UserRecord(Guid Id, string Username, string DisplayName, string PasswordHash, string? Board, string? Number, DateOnly? LicenseValidUntil, bool Active);

public sealed class UserStore(Db db)
{
    public Task<UserRecord?> FindByUsername(string username) => db.InTx(tx => tx.One(
        "select id, username, display_name, password_hash, professional_board, professional_number, license_valid_until, active from platform.users where username = @u",
        Map, ("u", username)));

    public Task<UserRecord?> FindById(Guid id) => db.InTx(tx => tx.One(
        "select id, username, display_name, password_hash, professional_board, professional_number, license_valid_until, active from platform.users where id = @id",
        Map, ("id", id)));

    public async Task<HashSet<string>> Permissions(Guid userId)
    {
        var list = await db.InTx(tx => tx.Query(
            "select distinct rp.permission from platform.user_roles ur join platform.role_permissions rp on rp.role_code = ur.role_code where ur.user_id = @id",
            r => r.GetString(0), ("id", userId)));
        return [.. list];
    }

    public async Task<Actor?> BuildActor(Guid userId, string? workstation, string? ip, string correlationId)
    {
        var user = await FindById(userId);
        if (user is null || !user.Active)
        {
            return null;
        }
        var perms = await Permissions(userId);
        return new Actor(user.Id, user.Username, user.DisplayName, perms, user.Board, user.Number, user.LicenseValidUntil, workstation, ip, correlationId);
    }

    private static UserRecord Map(Npgsql.NpgsqlDataReader r) => new(
        r.GetGuid(0), r.GetString(1), r.GetString(2), r.GetString(3), r.Str("professional_board"), r.Str("professional_number"),
        r.Get<DateOnly?>("license_valid_until"), r.GetBoolean(7));
}
