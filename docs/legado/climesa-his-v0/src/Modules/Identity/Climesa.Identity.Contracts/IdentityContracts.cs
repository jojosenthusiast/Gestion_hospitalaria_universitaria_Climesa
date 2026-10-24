namespace Climesa.Identity.Contracts;

/// <summary>What other modules may know about a person: enough to display and select, no clinical data.</summary>
public sealed record PersonSummary(
    Guid PersonId,
    string DisplayName,
    string Mrn,
    string Status,
    string BirthDisplay,
    string Sex,
    string? ProvisionalAlias);

public sealed record ProvisionalRegistration(string? Description, string? Informant, string? Sex, int? EstimatedAge);

public sealed record MigrationPerson(
    string? GivenNames,
    string? FirstSurname,
    string? SecondSurname,
    string? MarriedSurname,
    DateOnly? BirthDate,
    string BirthPrecision,
    string Sex,
    string? Dui,
    string? Municipality,
    string? AddressText,
    string LegacyPaperNumber,
    string BatchReference);

public sealed record MigrationMatch(Guid PersonId, string Mrn, string Reason, bool ExactIdentifier, bool NamesAgree);

/// <summary>Identity operations other modules may call. All are audited; all take the acting user's context.</summary>
public interface IIdentityModule
{
    Task<PersonSummary?> GetSummary(Guid personId);

    Task<PersonSummary> RegisterProvisional(Climesa.Platform.Security.Actor actor, ProvisionalRegistration request, string? idempotencyKey);

    /// <summary>Exact identifier and demographic candidates for a legacy record, without creating anything.</summary>
    Task<IReadOnlyList<MigrationMatch>> FindMigrationMatches(Climesa.Platform.Security.Actor actor, MigrationPerson person);

    /// <summary>Creates an identity from a migration batch through the same rules as live registration.</summary>
    Task<PersonSummary> RegisterFromMigration(Climesa.Platform.Security.Actor actor, MigrationPerson person, string idempotencyKey);

    Task OpenDuplicateCase(Climesa.Platform.Security.Actor actor, Guid a, Guid b, string reason);
}
