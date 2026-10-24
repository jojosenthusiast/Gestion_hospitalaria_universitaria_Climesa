using Climesa.Platform.Security;
using Npgsql;

namespace Climesa.Web.Infrastructure;

/// <summary>
/// Demo data only: roles, users, units, beds and a placeholder triage protocol. None of it is a CLIMESA fact
/// (beds are PENDING-INS01, triage protocol PENDING-INS04). Runs with the owner role; idempotent.
/// </summary>
public static class DemoSeeder
{
    public const string DemoPassword = "Demo2026!";

    public static readonly Dictionary<string, (string Name, string[] Permissions)> Roles = new()
    {
        ["admision"] = ("Admisión", ["identity.search", "identity.create", "identity.create_provisional", "identity.view", "identity.update",
            "care.emergency.register", "care.view.emergency", "care.view.beds"]),
        ["enfermeria"] = ("Enfermería de emergencia", ["identity.search", "identity.view", "identity.create_provisional", "care.emergency.register",
            "emergency.triage", "care.view.emergency", "care.view.beds", "care.view.episode", "care.exit.record"]),
        ["medico"] = ("Médico", ["identity.search", "identity.view", "care.view.emergency", "care.encounter.physician", "care.admission.accept",
            "care.discharge.sign", "care.view.beds", "care.view.episode"]),
        ["limpieza"] = ("Limpieza", ["care.view.beds", "care.cleaning.register"]),
        ["jefe_area"] = ("Jefatura de área", ["care.view.beds", "care.cleaning.sign", "care.location.admin", "care.view.episode", "care.exit.record"]),
        ["archivo"] = ("Archivo y expediente", ["identity.search", "identity.view", "identity.update", "identity.duplicate.review", "migration.batch.run", "migration.view"]),
        ["auditor"] = ("Auditoría y privacidad", ["audit.view", "audit.verify", "identity.duplicate.review", "migration.view"]),
    };

    private static readonly (string User, string Name, string Role, string? Board, string? Number, DateOnly? Until)[] Users =
    [
        ("admision1", "Karla Rivas (admisión)", "admision", null, null, null),
        ("triage1", "Lic. Sofía Menjívar (enfermería)", "enfermeria", "JVPE", "E-4521", new DateOnly(2027, 12, 31)),
        ("medico1", "Dr. Ernesto Aguilar", "medico", "JVPM", "11873", new DateOnly(2027, 12, 31)),
        ("medico2", "Dra. Ana Portillo (inscripción vencida)", "medico", "JVPM", "9034", new DateOnly(2026, 1, 31)),
        ("limpieza1", "Mario Pineda (limpieza)", "limpieza", null, null, null),
        ("jefe1", "Lic. Rosa Galdámez (jefa de área)", "jefe_area", "JVPE", "E-1180", new DateOnly(2027, 6, 30)),
        ("archivo1", "Carlos Henríquez (archivo)", "archivo", null, null, null),
        ("auditor1", "Lucía Morán (auditoría)", "auditor", null, null, null),
    ];

    public static async Task Seed(string ownerConnectionString, Guid facilityId)
    {
        await using var conn = new NpgsqlConnection(ownerConnectionString);
        await conn.OpenAsync();
        await using var tx = await conn.BeginTransactionAsync();

        async Task Exec(string sql, params (string, object?)[] args)
        {
            await using var cmd = new NpgsqlCommand(sql, conn, tx);
            foreach (var (n, v) in args)
            {
                cmd.Parameters.AddWithValue(n, v ?? DBNull.Value);
            }
            await cmd.ExecuteNonQueryAsync();
        }

        await Exec("insert into platform.facilities(id, code, name) values (@id, 'CLIMESA', 'Hospital CLIMESA (demo)') on conflict do nothing", ("id", facilityId));
        foreach (var (code, (name, perms)) in Roles)
        {
            await Exec("insert into platform.roles(code, name) values (@c, @n) on conflict do nothing", ("c", code), ("n", name));
            foreach (var p in perms)
            {
                await Exec("insert into platform.role_permissions(role_code, permission) values (@c, @p) on conflict do nothing", ("c", code), ("p", p));
            }
        }
        foreach (var u in Users)
        {
            var id = DeterministicId(u.User);
            await Exec("""
                insert into platform.users(id, username, display_name, password_hash, professional_board, professional_number, license_valid_until)
                values (@id, @u, @n, @h, @b, @num, @until) on conflict (username) do nothing
                """, ("id", id), ("u", u.User), ("n", u.Name), ("h", PasswordHasher.Hash(DemoPassword)), ("b", u.Board), ("num", u.Number), ("until", u.Until));
            await Exec("insert into platform.user_roles(user_id, role_code) values (@id, @r) on conflict do nothing", ("id", id), ("r", u.Role));
        }

        var units = new (string Code, string Name, string Kind, string Prefix, int Count, string LocKind)[]
        {
            ("EMG", "Emergencia (observación)", "emergency", "OBS-", 4, "stretcher"),
            ("MED", "Medicina interna", "ward", "MI-2", 8, "bed"),
            ("CIR", "Cirugía", "ward", "CI-3", 6, "bed"),
        };
        foreach (var unit in units)
        {
            var unitId = DeterministicId("unit:" + unit.Code);
            await Exec("insert into care.units(id, code, name, kind) values (@id, @c, @n, @k) on conflict do nothing", ("id", unitId), ("c", unit.Code), ("n", unit.Name), ("k", unit.Kind));
            for (var i = 1; i <= unit.Count; i++)
            {
                var code = $"{unit.Prefix}{i:D2}";
                await Exec("""
                    insert into care.locations(id, unit_id, code, kind, exclusive, cssp_authorized, operational, status)
                    values (@id, @u, @c, @k, true, @auth, true, 'available') on conflict do nothing
                    """, ("id", DeterministicId("loc:" + code)), ("u", unitId), ("c", code), ("k", unit.LocKind), ("auth", unit.LocKind == "bed"));
            }
        }

        await Exec("""
            insert into care.triage_protocols(code, version, name, license_note, clinical_use_approved)
            values ('DEMO-5', '0.1', 'Protocolo de demostración de 5 niveles', 'Marcador de posición sin contenido clínico licenciado; CLIMESA elige su escala (R04).', false)
            on conflict do nothing
            """);
        var levels = new (int Level, string Name, string Color, int Target, int Reassess)[]
        {
            (1, "Inmediato", "#c62828", 0, 5), (2, "Muy urgente", "#ef6c00", 10, 15), (3, "Urgente", "#f9a825", 60, 30),
            (4, "Menos urgente", "#2e7d32", 120, 60), (5, "No urgente", "#1565c0", 240, 120),
        };
        foreach (var l in levels)
        {
            await Exec("""
                insert into care.triage_levels(protocol_code, protocol_version, level, name, color, target_minutes_to_physician, reassessment_minutes)
                values ('DEMO-5', '0.1', @l, @n, @c, @t, @r) on conflict do nothing
                """, ("l", l.Level), ("n", l.Name), ("c", l.Color), ("t", l.Target), ("r", l.Reassess));
        }
        await tx.CommitAsync();
    }

    public static Guid DeterministicId(string name)
    {
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes("climesa-demo:" + name));
        return new Guid(hash.AsSpan(0, 16));
    }
}
