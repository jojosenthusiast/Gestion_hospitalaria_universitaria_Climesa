namespace Climesa.Platform.Errors;

/// <summary>Business rule violation with a stable code the UI and tests can rely on.</summary>
public class DomainError(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

public sealed class PermissionDenied(string permission)
    : DomainError("permission_denied", $"No tiene el permiso requerido: {permission}")
{
    public string Permission { get; } = permission;
}

public sealed class ConflictError(string code, string message) : DomainError(code, message);

public sealed class NotFoundError(string what) : DomainError("not_found", $"No encontrado: {what}");
