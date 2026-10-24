namespace Climesa.Care.Contracts;

/// <summary>Milestones other modules consume (spec 002 FR-030). Billing (spec 006) reads these through the outbox.</summary>
public static class CareEvents
{
    public const string EncounterCreated = "EncounterCreated";
    public const string TriageRecorded = "TriageRecorded";
    public const string PatientAdmitted = "PatientAdmitted";
    public const string MedicalDischargeSigned = "MedicalDischargeSigned";
    public const string MedicalDischargeRevoked = "MedicalDischargeRevoked";
    public const string PhysicalExitRecorded = "PhysicalExitRecorded";
    public const string LocationStatusChanged = "LocationStatusChanged";
}

public sealed record ActiveEpisode(Guid EpisodeId, Guid PersonId, string LocationCode, string Status, DateTimeOffset? AdmittedAt);

public interface ICareQueries
{
    Task<ActiveEpisode?> ActiveEpisodeFor(Guid personId);
}
