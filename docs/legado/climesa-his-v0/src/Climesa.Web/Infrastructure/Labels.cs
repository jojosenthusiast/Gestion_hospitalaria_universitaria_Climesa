namespace Climesa.Web.Infrastructure;

/// <summary>Spanish labels for stored codes. Codes stay in English in the database and APIs; people read Spanish.</summary>
public static class Labels
{
    private static readonly Dictionary<string, string> Map = new()
    {
        ["active"] = "activo",
        ["requested"] = "solicitado",
        ["accepted"] = "aceptado",
        ["medical_discharge_signed"] = "alta médica firmada",
        ["physically_exited"] = "salió del hospital",
        ["closed"] = "cerrado",
        ["provisional"] = "provisional",
        ["verified"] = "verificado",
        ["unverified"] = "sin verificar",
        ["medical"] = "alta médica",
        ["voluntary"] = "alta voluntaria",
        ["referred"] = "referido",
        ["death"] = "fallecimiento",
        ["abandonment"] = "abandono",
        ["admitted"] = "ingreso",
        ["physical_exit"] = "salida física",
        ["medical_discharge_revoked"] = "alta revocada",
        ["completed"] = "conciliado",
        ["failed_reconciliation"] = "no cuadra",
        ["running"] = "en proceso",
        ["created"] = "creado",
        ["matched"] = "ya existía",
        ["rejected"] = "rechazado",
        ["pending_review"] = "pendiente de revisión",
        ["suspected"] = "sospecha",
        ["under_investigation"] = "en investigación",
        ["duplicate"] = "posible duplicado",
        ["official"] = "oficial",
        ["temporary"] = "temporal",
        ["mother"] = "madre",
        ["success"] = "permitido",
        ["denied"] = "denegado",
        ["failed"] = "falló",
    };

    public static string Es(string? code) => code is null ? "" : Map.GetValueOrDefault(code, code);
}
